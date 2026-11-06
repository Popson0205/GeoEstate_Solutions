import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/server/config";
import { GeoEstateID } from "@/lib/server/geoestate-id";
import { NEXT, PKCE, STATE, gid } from "@/lib/server/session";

export const dynamic = "force-dynamic";
const safe = (p: string | null) => (p && p.startsWith("/") && !p.startsWith("//") ? p : "/");

/** "Sign in": off to Geohub, and back to /api/auth/callback. Someone already signed in to Geohub comes straight back. */
export async function GET(req: NextRequest) {
  const verifier = GeoEstateID.newVerifier(), state = GeoEstateID.newState();
  const res = NextResponse.redirect(gid().authorizeUrl(`${config.appUrl()}/api/auth/callback`, state, verifier));
  const o = { httpOnly: true, secure: config.cookieSecure(), sameSite: "lax" as const, path: "/", maxAge: 600 };
  res.cookies.set(PKCE, verifier, o); res.cookies.set(STATE, state, o);
  res.cookies.set(NEXT, safe(new URL(req.url).searchParams.get("next")), o);
  return res;
}
