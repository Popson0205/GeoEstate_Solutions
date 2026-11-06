/**
 * Who is signed in to LandCheck. LandCheck has no accounts of its own: people sign in with Geohub (GeoEstate ID), and
 * the access token (15 minutes) and refresh token (30 days) sit in http-only cookies. When the access token runs out,
 * the next request refreshes both, which also checks with Geohub that the organization still has LandCheck.
 */
import { NextResponse, type NextRequest } from "next/server";
import { config } from "./config";
import { GeoEstateID, GeoEstateIDError, type Claims, type Tokens } from "./geoestate-id";

export const AT = "check_at", RT = "check_rt", PKCE = "check_pkce", STATE = "check_state", NEXT = "check_next";

let client: GeoEstateID | null = null;
export function gid(): GeoEstateID {
  if (!client) client = new GeoEstateID({ geohub: config.geohubUrl(), api: config.geohubApi(), clientId: config.idClient(), clientSecret: config.idSecret() });
  return client;
}
/** Tests swap in a client that talks to a stand-in Geohub. */
export function setGid(c: GeoEstateID | null) { client = c; }

export interface Me {
  id: string; name: string; email: string; org_id: string | null; org_name: string | null; org_role: string | null; staff_role: string | null;
  product: Claims["product"]; features: string[]; limits: Record<string, number | null>; can_write: boolean; can_buy: boolean;
}

export function person(c: Claims): Me {
  const p = c.product;
  const can_write = GeoEstateID.canWrite(c);
  return {
    id: c.sub, name: c.name, email: c.email, org_id: c.org?.id ?? null, org_name: c.org?.name ?? null, org_role: c.org?.role ?? null,
    staff_role: c.staff_role ?? null, product: p, features: p?.features ?? [], limits: p?.limits ?? {}, can_write,
    // reports cost the organization: viewers and collectors read them, the rest buy them
    can_buy: can_write && !!c.org && ["owner", "admin", "member"].includes(c.org.role),
  };
}

export const has = (me: Me, feature: string) => !me.features.length || me.features.includes(feature);

export type Session = { me: Me | null; set?: Tokens; clear?: boolean; error?: GeoEstateIDError };

/** The person behind the request's cookies (refreshing the sign-in when it has run out), or null. */
export async function session(req: NextRequest): Promise<Session> {
  const at = req.cookies.get(AT)?.value, rt = req.cookies.get(RT)?.value;
  if (at) {
    try { return { me: person(await gid().verify(at)) }; } catch (e) { if (!(e instanceof GeoEstateIDError) || e.status >= 500) throw e; }
  }
  if (!rt) return { me: null };
  try {
    const tokens = await gid().refresh(rt);
    return { me: person(await gid().verify(tokens.access_token)), set: tokens };
  } catch (e) {
    if (e instanceof GeoEstateIDError && e.status < 500) return { me: null, clear: true, error: e };
    throw e;
  }
}

const opts = () => ({ httpOnly: true, secure: config.cookieSecure(), sameSite: "lax" as const, path: "/" });
export function keep(res: NextResponse, t: Tokens) {
  res.cookies.set(AT, t.access_token, { ...opts(), maxAge: t.expires_in });
  res.cookies.set(RT, t.refresh_token, { ...opts(), maxAge: 30 * 86400 });
}
export function forget(res: NextResponse) { for (const k of [AT, RT]) res.cookies.set(k, "", { ...opts(), maxAge: 0 }); }

export function problem(status: number, error: string, code: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, code, ...extra }, { status });
}

/** Run a handler with the session, carrying any refreshed (or ended) sign-in back on the response. */
export async function withSession(req: NextRequest, f: (me: Me | null, s: Session) => Promise<NextResponse>): Promise<NextResponse> {
  let s: Session;
  try { s = await session(req); } catch (e) {
    console.error("LandCheck: Geohub unreachable", e);
    return problem(503, "Sign-in is unavailable for a moment (Geohub cannot be reached). Try again shortly.", "geohub_unavailable");
  }
  const res = await f(s.me, s);
  if (s.set) keep(res, s.set);
  if (s.clear) forget(res);
  return res;
}

/** A signed-in person of an organization with LandCheck, or the response explaining why not. */
export function need(me: Me | null, s: Session, opts: { buy?: boolean; feature?: string } = {}): NextResponse | null {
  if (!me) return problem(401, s.error?.code === "no_product" ? s.error.message : "Sign in with your Geohub account to continue.", s.error?.code === "no_product" ? "no_product" : "unauthenticated");
  if (!me.org_id) return problem(403, "LandCheck reports are bought by an organization: open LandCheck from your organization's Geohub account.", "no_org");
  if (me.product?.status === "suspended") return problem(403, `${me.org_name}'s LandCheck access is suspended. Contact GeoEstate NIG Limited to restore it.`, "licence_suspended");
  if (opts.feature && !has(me, opts.feature)) {
    const name: Record<string, string> = { batch: "batch checks", ai_briefing: "AI briefings", title_status: "title status", reports: "reports" };
    return problem(403, `Your organization's LandCheck plan does not include ${name[opts.feature] ?? opts.feature} (LandCheck Advanced).`, "no_feature");
  }
  if (opts.buy) {
    if (!me.can_write) return problem(403, `${me.org_name}'s LandCheck subscription has ended, so it is read-only: you can open past reports but not buy new ones. Renew with GeoEstate NIG Limited.`, "licence_expired");
    if (!me.can_buy) return problem(403, "Viewers and collectors can read the organization's reports; ask an admin or member to buy one.", "forbidden");
  }
  return null;
}
