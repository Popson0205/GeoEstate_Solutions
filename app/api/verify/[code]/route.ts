import { NextRequest, NextResponse } from "next/server";
import { verify } from "@/lib/server/reports";

export const dynamic = "force-dynamic";

/** Anyone holding a report can check it is genuine: its number, place, date and who bought it. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const r = await verify((await ctx.params).code.toUpperCase());
  return r ? NextResponse.json({ genuine: true, ...r }) : NextResponse.json({ genuine: false, error: "No LandCheck report has this code." }, { status: 404 });
}
