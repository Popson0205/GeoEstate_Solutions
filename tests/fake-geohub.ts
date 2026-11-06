import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { GeoEstateID } from "@/lib/server/geoestate-id";

export const HUB = "http://geohub.test", API = "http://geohub.test/api";
type Who = { sub?: string; name?: string; org?: string; orgName?: string; role?: string; status?: string; features?: string[]; limits?: Record<string, number | null>; staff?: string; noOrg?: boolean; noProduct?: boolean };

/** A stand-in Geohub: signs real Ed25519 GeoEstate ID tokens and answers the endpoints LandCheck calls. */
export async function fakeGeohub() {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "EdDSA", use: "sig" };
  const refresh = new Map<string, Who>();
  const calls: string[] = [];

  async function token(w: Who = {}, opts: { exp?: number; aud?: string } = {}) {
    const claims: Record<string, unknown> = {
      email: `${w.name ?? "ade"}@example.com`, name: w.name ?? "Ade Bello", mfa: false, typ: "geoestate-id", staff_role: w.staff ?? null,
      org: w.noOrg ? null : { id: w.org ?? "11111111-1111-4111-8111-111111111111", name: w.orgName ?? "Lagos Homes Ltd", slug: "lagos-homes", role: w.role ?? "owner" },
      product: w.noProduct ? null : { id: "check", plan: "standard", plan_name: "LandCheck Standard", licence_kind: "paid", status: w.status ?? "active",
        status_name: w.status ?? "Active", subscription_ends: "2027-01-31", grace_ends: "2027-03-01", features: w.features ?? ["reports"],
        limits: w.limits ?? { reports_per_month: 3 } },
    };
    return new SignJWT(claims).setProtectedHeader({ alg: "EdDSA", kid: "k1" }).setSubject(w.sub ?? "u-1").setIssuer(HUB)
      .setAudience(opts.aud ?? "check").setIssuedAt().setExpirationTime(opts.exp ?? Math.floor(Date.now() / 1000) + 900).sign(privateKey);
  }
  async function tokens(w: Who = {}) {
    const rt = `rt-${Math.random().toString(36).slice(2)}`;
    refresh.set(rt, w);
    return { access_token: await token(w), refresh_token: rt, expires_in: 900, token_type: "Bearer" };
  }

  const fetchFn: typeof fetch = async (input, init) => {
    const url = new URL(String(input)), path = url.pathname.replace(/^\/api/, "");
    calls.push(`${init?.method ?? "GET"} ${path}`);
    const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
    if (path === "/id/jwks") return json({ keys: [jwk] });
    if (path === "/id/apps") return json([{ product: "check", name: "LandCheck", status: "active", status_name: "Active", url: "http://check.test", current: true },
      { product: "hub", name: "Geohub", status: "active", status_name: "Active", url: HUB, current: false }]);
    if (path === "/id/token") {
      const body = new URLSearchParams(String(init?.body));
      if (body.get("grant_type") === "authorization_code") {
        if (body.get("code") !== "good-code") return json({ detail: "That sign-in link has expired.", code: "invalid_grant" }, 400);
        return json(await tokens({}));
      }
      const w = refresh.get(body.get("refresh_token") ?? "");
      if (!w) return json({ detail: "Sign in again.", code: "invalid_grant" }, 400);
      if (w.noProduct) return json({ detail: "Lagos Homes Ltd does not have LandCheck.", code: "no_product" }, 403);
      refresh.delete(body.get("refresh_token")!);
      return json(await tokens(w));
    }
    if (path === "/id/revoke") return json({ revoked: true });
    return json({ detail: "not here" }, 404);
  };
  const client = new GeoEstateID({ geohub: HUB, api: API, clientId: "check", fetch: fetchFn });
  return { client, token, tokens, refresh, calls, fetch: fetchFn };
}
