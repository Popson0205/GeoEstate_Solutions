import { NextRequest, NextResponse } from "next/server";
import { searchLocal, norm, type PlaceHit } from "@/lib/search";
import { googleAutocomplete } from "@/lib/google-places";

export const dynamic = "force-dynamic";
const UA = "GeoEstate-LandCheck/0.3 (contact: geoestate.app)";
const OSUN_VIEWBOX = "4.05,8.10,5.06,6.98"; // west,north,east,south: prefer results inside Osun State (not a hard limit)

async function getJson(url: string, ms = 5000): Promise<any | null> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctl.signal, cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

// Fallback geocoders, used only when Google isn't configured or fails.
async function nominatim(q: string): Promise<PlaceHit[]> {
  const d = await getJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=ng&limit=6&viewbox=${OSUN_VIEWBOX}&q=${encodeURIComponent(q)}`);
  if (!Array.isArray(d)) return [];
  return d.map((x: any) => {
    const parts = String(x.display_name || "").split(",").map((s: string) => s.trim());
    const kind = String(x.type || x.category || "Place").replace(/_/g, " "); const bb = (x.boundingbox || []).map(Number);
    const span = bb.length === 4 ? Math.max(Math.abs(bb[1] - bb[0]), Math.abs(bb[3] - bb[2])) : 0;
    return { name: x.name || parts[0], kind: kind.charAt(0).toUpperCase() + kind.slice(1), sub: parts.slice(1, 3).join(", "), display: x.display_name,
      latitude: Number(x.lat), longitude: Number(x.lon), zoom: span > 0.5 ? 10 : span > 0.1 ? 12 : span > 0.02 ? 14 : 16, source: "OpenStreetMap" };
  }).filter((h: PlaceHit) => Number.isFinite(h.latitude) && Number.isFinite(h.longitude));
}
async function openMeteo(q: string): Promise<PlaceHit[]> {
  const d = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json&countryCode=NG`);
  return (d?.results || []).map((x: any) => ({ name: x.name, kind: "Town / place", sub: [x.admin2, x.admin1].filter(Boolean).join(", "), display: [x.name, x.admin1, "Nigeria"].filter(Boolean).join(", "),
    latitude: x.latitude, longitude: x.longitude, zoom: 13, source: "Open-Meteo" }));
}

const near = (a: PlaceHit, b: PlaceHit) => Math.hypot((a.longitude - b.longitude) * 111, (a.latitude - b.latitude) * 111) < 0.4;

export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const q = sp.get("q")?.trim() || "";
  const token = sp.get("token") || undefined;
  if (q.length < 2) return NextResponse.json({ results: [] });

  // 1) Google Places (when GOOGLE_MAPS_API_KEY is set). Suggestions carry a placeId; coordinates come from /api/search/place on selection.
  const g = q.length >= 3 ? await googleAutocomplete(q, token, 5) : ({ ok: false, reason: "error" } as const);
  const googleUsed = g.ok;
  const local = searchLocal(q, googleUsed ? 4 : 8);
  const results: (PlaceHit & { placeId?: string })[] = [...local];

  if (g.ok) {
    for (const h of g.data) {
      if (results.some(r => norm(r.name) === norm(h.name))) continue;             // already have this from our own data
      results.push({ name: h.name, kind: h.kind, sub: h.sub, display: h.display, latitude: NaN, longitude: NaN, zoom: 15, source: "Google", placeId: h.placeId });
    }
  } else {
    if (!g.ok && "message" in g && g.message) console.error("Google Places autocomplete failed:", g.message);
    const [nom, om] = await Promise.all([nominatim(q), openMeteo(q)]);
    for (const h of [...nom, ...om]) {
      if (results.some(r => norm(r.name) === norm(h.name) && near(r, h))) continue;
      results.push(h);
    }
  }
  return NextResponse.json({ results: results.slice(0, 10), google: googleUsed, source: googleUsed ? "GeoEstate data + Google Places" : "GeoEstate data + OpenStreetMap + Open-Meteo" });
}
