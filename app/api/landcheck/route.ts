import { NextRequest, NextResponse } from "next/server";
import { analyseLocation } from "@/lib/analysis";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * The free preview of a location, shown on the map to anyone: the place, the overall score and its four parts.
 * The details (distances, flood, slope, land cover, title status…) are in the report, which an organization buys
 * (POST /api/reports).
 */
export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const lat = Number(sp.get("lat")), lng = Number(sp.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  const a = await analyseLocation(lat, lng);
  if (!a.ok) return NextResponse.json({ error: a.body.error, providerStatus: a.body.providerStatus }, { status: a.status });
  const r = a.result;
  return NextResponse.json({ preview: true, lat: r.lat, lng: r.lng, place: r.place, score: r.score, accessibility: r.accessibility,
    infrastructure: r.infrastructure, development: r.development, environment: r.environment });
}
