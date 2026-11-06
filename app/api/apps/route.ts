import { NextRequest, NextResponse } from "next/server";
import { AT, gid, withSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** The GeoEstate apps the organization has, for the app switcher. */
export function GET(req: NextRequest) {
  return withSession(req, async (me, s) => {
    const at = s.set?.access_token ?? req.cookies.get(AT)?.value;
    if (!me || !at) return NextResponse.json([]);
    return NextResponse.json(await gid().apps(at).catch(() => []));
  });
}
