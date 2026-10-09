import { NextRequest, NextResponse } from "next/server";
import { analyse, posterExtras, rankLgas, findLga, lgaNames } from "@/lib/geoai";

export const dynamic = "force-dynamic";

// GET /api/poster-data?lga=Osogbo   everything the poster builder needs for one LGA (figures, map raster, geometry, 30-LGA ranking).
// The poster text is written from these computed figures only; no AI call is involved.
export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams.get("lga");
  if (!q) return NextResponse.json({ error: "Provide lga=", lgas: lgaNames() }, { status: 400 });
  const name = findLga(q);
  if (!name) return NextResponse.json({ error: `Unknown LGA "${q}".`, lgas: lgaNames() }, { status: 404 });
  const a = analyse({ lga: name }), ranking = rankLgas(), extras = posterExtras(name);
  if (a.error || !ranking || !extras) return NextResponse.json({ error: a.error || "Analysis data is not available on this server." }, { status: a.status || 503 });
  return NextResponse.json({ analysis: a, extras, ranking });
}
