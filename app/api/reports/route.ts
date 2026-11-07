import { NextRequest, NextResponse } from "next/server";
import { analyseLocation } from "@/lib/analysis";
import { ReportError, buy, list } from "@/lib/server/reports";
import { has, need, problem, withSession } from "@/lib/server/session";
import { titleConfigured, titleStatus } from "@/lib/server/title";
import { COVERED_STATES, coverageAt } from "@/lib/server/coverage";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** The organization's reports, newest first (?q= searches number, place and reference). */
export function GET(req: NextRequest) {
  return withSession(req, async (me, s) => {
    const stop = need(me, s); if (stop) return stop;
    const sp = new URL(req.url).searchParams;
    return NextResponse.json(await list(me!, sp.get("q") ?? "", sp.get("before") ?? undefined));
  });
}

/** Buy a report on a location: {lat, lng, title?}. Counted against this month's allowance. */
export function POST(req: NextRequest) {
  return withSession(req, async (me, s) => {
    const stop = need(me, s, { buy: true }); if (stop) return stop;
    const b = await req.json().catch(() => ({}));
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
      return problem(422, "Give the location as lat and lng.", "validation");
    if (!coverageAt(lat, lng).covered)                                   // nothing is counted
      return problem(422, `LandCheck has no data here yet: it covers ${COVERED_STATES.join(", ")} State. Ask GeoEstate to bring LandCheck to your state.`, "outside_coverage");
    const withTitle = has(me!, "title_status") && titleConfigured();      // LandCheck Advanced, when Land Registry is connected
    const [a, title] = await Promise.all([analyseLocation(lat, lng), withTitle ? titleStatus(lat, lng) : Promise.resolve(undefined)]);
    if (!a.ok) return problem(a.status, String(a.body.error), "provider_unavailable");        // nothing is counted
    try {
      const r = await buy(me!, lat, lng, String(b.title ?? ""), title ? { ...a.result, titleStatus: title } : a.result);
      return NextResponse.json(r, { status: 201 });
    } catch (e) {
      if (e instanceof ReportError) return problem(e.status, e.message, e.code, e.extra);
      throw e;
    }
  });
}
