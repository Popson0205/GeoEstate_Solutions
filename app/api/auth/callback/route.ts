import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/server/config";
import { GeoEstateIDError } from "@/lib/server/geoestate-id";
import { NEXT, PKCE, STATE, gid, keep } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Back from Geohub: check the state, swap the code for tokens, keep them in cookies. */
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const back = (why: string) => NextResponse.redirect(`${config.appUrl()}/signed-out?reason=${encodeURIComponent(why)}`);
  if (sp.get("error")) return back(sp.get("error_description") || "Sign-in was not completed.");
  const code = sp.get("code"), state = sp.get("state");
  if (!code || !state || state !== req.cookies.get(STATE)?.value) return back("This sign-in did not start here. Sign in again.");
  let res: NextResponse;
  try {
    const tokens = await gid().exchange(code, `${config.appUrl()}/api/auth/callback`, req.cookies.get(PKCE)?.value ?? "");
    const next = req.cookies.get(NEXT)?.value || "/";
    res = NextResponse.redirect(`${config.appUrl()}${next.startsWith("/") && !next.startsWith("//") ? next : "/"}`);
    keep(res, tokens);
  } catch (e) {
    if (e instanceof GeoEstateIDError) return back(e.message);
    throw e;
  }
  for (const k of [PKCE, STATE, NEXT]) res.cookies.set(k, "", { path: "/", maxAge: 0 });
  return res;
}
