import { NextRequest, NextResponse } from "next/server";
import { get } from "@/lib/server/reports";
import { need, problem, withSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** One of the organization's reports, as issued. */
export function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withSession(req, async (me, s) => {
    const stop = need(me, s); if (stop) return stop;
    const r = await get(me!, (await ctx.params).id);
    return r ? NextResponse.json(r) : problem(404, "Report not found.", "not_found");
  });
}
