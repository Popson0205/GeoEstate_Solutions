import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Open /api/debug/overpass on your deployed site to see which Overpass mirrors your server can reach.
// Remove (or protect) this route before going public.
const ENDPOINTS = [
  process.env.OSM_OVERPASS_URL || "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

export async function GET() {
  const query = `[out:json][timeout:10];node(around:300,7.7827,4.5418)["amenity"];out count;`;
  const results = await Promise.all(ENDPOINTS.map(async ep => {
    const t0 = Date.now();
    const c = new AbortController();
    const timer = setTimeout(() => c.abort(), 12000);
    try {
      const r = await fetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "GeoEstate-LandCheck/0.6", Accept: "application/json" },
        body: new URLSearchParams({ data: query }), signal: c.signal, cache: "no-store",
      });
      const text = await r.text();
      return { endpoint: ep, status: r.status, ms: Date.now() - t0, body: text.slice(0, 200) };
    } catch (e: any) {
      return { endpoint: ep, status: "error", ms: Date.now() - t0, error: e?.name === "AbortError" ? "timeout" : String(e?.message || e) };
    } finally { clearTimeout(timer); }
  }));
  return NextResponse.json(results);
}
