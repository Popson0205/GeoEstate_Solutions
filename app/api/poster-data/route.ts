import { NextRequest, NextResponse } from "next/server";
import { analyse, posterMap, rankLgas, findLga, lgaNames } from "@/lib/geoai";
import { need, withSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

// GET /api/poster-data?lga=Osogbo  ->  everything the GeoAI poster needs for one LGA:
// the analysis figures, the full 30-LGA ranking and the map data (class raster, outline, roads, facilities).
export function GET(request: NextRequest) {
  return withSession(request, async (me, s) => need(me, s) ?? run(request));
}

async function run(request: NextRequest) {
  const q = new URL(request.url).searchParams.get("lga") || "";
  const name = findLga(q);
  if (!name) return NextResponse.json({ error: `Unknown LGA "${q}".`, lgas: lgaNames() }, { status: 404 });
  const analysis = analyse({ lga: name });
  if (analysis.error) return NextResponse.json({ error: analysis.error }, { status: analysis.status });
  const map = posterMap(name);
  if (map.error) return NextResponse.json({ error: map.error }, { status: map.status });
  const { exposedAssets, ...stats } = analysis;
  return NextResponse.json({ analysis: { ...stats, exposedAssets: { highCount: exposedAssets.highCount, moderateCount: exposedAssets.moderateCount } }, ranking: rankLgas(), map });
}
