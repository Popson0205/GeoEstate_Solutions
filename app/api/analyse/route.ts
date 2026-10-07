import { NextRequest, NextResponse } from "next/server";
import { analyse, rankLgas, findLga, lgaNames } from "@/lib/geoai";
import { narrate } from "@/lib/geoai-narrative";

export const dynamic = "force-dynamic";

// GET /api/analyse?lga=Osogbo        analysis of one LGA
// GET /api/analyse?bbox=w,s,e,n      analysis of a map window (max ~3,000 km²)
// GET /api/analyse?rank=1            all 30 Osun LGAs ranked by exposure
// Add &ai=0 to skip the AI-written summary (uses the template). Without ANTHROPIC_API_KEY the template is always used.
export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  if (sp.get("rank")) {
    const ranking = rankLgas();
    return ranking ? NextResponse.json({ ranking, lgas: lgaNames() }) : NextResponse.json({ error: "Analysis data is not available on this server." }, { status: 503 });
  }
  let result: any;
  if (sp.get("lga")) {
    const name = findLga(sp.get("lga")!);
    if (!name) return NextResponse.json({ error: `Unknown LGA "${sp.get("lga")}".`, lgas: lgaNames() }, { status: 404 });
    result = analyse({ lga: name });
  } else if (sp.get("bbox")) {
    const b = sp.get("bbox")!.split(",").map(Number);
    if (b.length !== 4 || b.some(v => !Number.isFinite(v))) return NextResponse.json({ error: "bbox must be west,south,east,north" }, { status: 400 });
    result = analyse({ bbox: b as [number, number, number, number] });
  } else return NextResponse.json({ error: "Provide lga=, bbox= or rank=1" }, { status: 400 });
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  const narrative = await narrate(result, sp.get("ai") !== "0");
  return NextResponse.json({ ...result, narrative });
}
