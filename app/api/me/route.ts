import { NextRequest, NextResponse } from "next/server";
import { usage } from "@/lib/server/reports";
import { withSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Who is signed in (or {me: null}), their organization's LandCheck licence, and this month's reports. */
export function GET(req: NextRequest) {
  return withSession(req, async (me, s) => {
    if (!me) return NextResponse.json({ me: null, reason: s.error?.code === "no_product" ? s.error.message : null, geohub: process.env.GEOHUB_URL ?? null });
    const u = me.org_id && me.product ? await usage(me).catch(() => null) : null;
    return NextResponse.json({ me, usage: u });
  });
}
