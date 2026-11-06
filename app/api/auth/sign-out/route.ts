import { NextRequest, NextResponse } from "next/server";
import { RT, forget, gid } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Sign out of LandCheck (the Geohub sign-in itself stays). */
export async function POST(req: NextRequest) {
  const rt = req.cookies.get(RT)?.value;
  if (rt) await gid().signOut(rt).catch(() => undefined);
  const res = NextResponse.json({ signed_out: true });
  forget(res);
  return res;
}
