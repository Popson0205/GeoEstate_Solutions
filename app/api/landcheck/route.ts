import { NextRequest, NextResponse } from "next/server";
import { nearbyFromSnapshot, placeAt } from "@/lib/osm";
import { landCoverAt } from "@/lib/landcover";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ENDPOINTS = Array.from(new Set([
  process.env.OSM_OVERPASS_URL || "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]));

// Tiny in-memory cache (per server instance) keyed by ~110 m grid cell.
const cache = new Map<string, { t: number; v: any }>();
const TTL = 15 * 60 * 1000;

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

function haversine(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Distance from point P to segment AB (local equirectangular projection, fine at <5 km).
function pointToSegment(pLat: number, pLng: number, a: [number, number], b: [number, number]) {
  const k = Math.cos(rad(pLat));
  const ax = (a[0] - pLng) * k * 111320, ay = (a[1] - pLat) * 110540;
  const bx = (b[0] - pLng) * k * 111320, by = (b[1] - pLat) * 110540;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

async function fetchJson(url: string, init: RequestInit, ms: number) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: c.signal, cache: "no-store" });
    if (!r.ok) throw new Error(`${url} returned ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

// Hedged requests: start the first mirror immediately and each further mirror 2.5 s later
// (or at once if the previous one already failed). First good answer wins; hard cap ~15 s.
function overpass(query: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const errors: string[] = [];
    const controllers: AbortController[] = [];
    let done = false, started = 0, failed = 0;
    const launch = () => {
      if (done || started >= ENDPOINTS.length) return;
      const ep = ENDPOINTS[started++];
      const c = new AbortController(); controllers.push(c);
      const t = setTimeout(() => c.abort(), 12000);
      fetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "User-Agent": "GeoEstate-LandCheck/0.6 (contact: set-your-email)", Accept: "application/json" },
        body: new URLSearchParams({ data: query }), cache: "no-store", signal: c.signal,
      }).then(async r => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        const data = await r.json();
        // Overpass can answer 200 with a runtime remark and no elements when it is overloaded.
        if (data.remark && /error|timeout|out of memory/i.test(data.remark) && !(data.elements || []).length) throw new Error(`remark: ${data.remark}`);
        if (!done) { done = true; controllers.forEach(x => x.abort()); resolve(data); }
      }).catch(e => {
        errors.push(`${ep} -> ${e?.name === "AbortError" ? "timeout" : e?.message || e}`);
        failed++;
        if (done) return;
        if (failed >= ENDPOINTS.length) { done = true; reject(new Error(errors.join(" | "))); } else launch();
      }).finally(() => clearTimeout(t));
      setTimeout(launch, 2500);
    };
    launch();
  });
}

async function getElevation(lat: number, lng: number): Promise<number | null> {
  try {
    const d = await fetchJson(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`, {}, 6000);
    return d.elevation?.[0] ?? null;
  } catch { return null; }
}

async function getNearby(lat: number, lng: number) {
  // Small, targeted query: no buildings, only what the score needs.
  const q = `[out:json][timeout:10];
(
  way(around:2000,${lat},${lng})["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential)$"];
);
out geom qt 200;
(
  nwr(around:5000,${lat},${lng})["amenity"="school"];
  nwr(around:8000,${lat},${lng})["amenity"="hospital"];
);
out center qt 100;
(
  nwr(around:1000,${lat},${lng})["building"];
);
out count;`;
  const data = await overpass(q);
  const els: any[] = data.elements || [];

  let roadD = Infinity, roadName = "";
  let schoolD = Infinity, schoolName = "";
  let hospD = Infinity, hospName = "";
  let buildings = 0;

  for (const e of els) {
    const tags = e.tags || {};
    if (e.type === "count") { buildings = Number(e.tags?.total || 0); continue; }
    if (tags.highway && Array.isArray(e.geometry)) {
      for (let i = 0; i < e.geometry.length - 1; i++) {
        const A = e.geometry[i], B = e.geometry[i + 1];
        const d = pointToSegment(lat, lng, [A.lon, A.lat], [B.lon, B.lat]);
        if (d < roadD) { roadD = d; roadName = tags.name || tags.highway; }
      }
    } else if (tags.amenity === "school" || tags.amenity === "hospital") {
      const c = e.type === "node" ? { lat: e.lat, lon: e.lon } : e.center;
      if (!c) continue;
      const d = haversine(lat, lng, c.lat, c.lon);
      if (tags.amenity === "school" && d < schoolD) { schoolD = d; schoolName = tags.name || "School"; }
      if (tags.amenity === "hospital" && d < hospD) { hospD = d; hospName = tags.name || "Hospital"; }
    }
  }
  return { roadD, roadName, schoolD, schoolName, hospD, hospName, buildings };
}

const fmt = (d: number, name: string, none: string) => (Number.isFinite(d) ? `${name} • ${Math.round(d)} m` : none);
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const lat = Number(sp.get("lat")), lng = Number(sp.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });

  // Run both providers concurrently; neither is allowed to throw.
  const [nearbyR, elevation] = await Promise.all([
    (async () => {
      const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
      const local = nearbyFromSnapshot(lat, lng);
      if (local) return local;
      const hit = cache.get(key);
      if (hit && Date.now() - hit.t < TTL) return hit.v;
      const v = nearbyFromSnapshot(lat, lng) ?? await getNearby(lat, lng);
      cache.set(key, { t: Date.now(), v });
      if (cache.size > 500) cache.delete(cache.keys().next().value as string);
      return v;
    })().then(v => ({ ok: true as const, v })).catch(e => ({ ok: false as const, e })),
    getElevation(lat, lng),
  ]);

  if (!nearbyR.ok) {
    console.error("LandCheck Overpass failed:", (nearbyR.e as any)?.message ?? nearbyR.e);
    // Honest degraded answer instead of a 502 and instead of invented scores.
    return NextResponse.json({
      error: "OpenStreetMap data is temporarily unavailable. Please try again in a moment.",
      providerStatus: "temporarily_unavailable",
      lat, lng,
      elevation: elevation == null ? "Unavailable" : `${Math.round(elevation)} m`,
    }, { status: 503 });
  }

  const n = nearbyR.v;
  const accessibility = clamp(100 - (Number.isFinite(n.roadD) ? n.roadD : 2000) / 45);
  const infrastructure = clamp(100 - (Number.isFinite(n.schoolD) ? n.schoolD : 5000) / 80 - (Number.isFinite(n.hospD) ? n.hospD : 8000) / 100);
  // Buildings are not in the national datasets, so development falls back to road density within 1 km (about 8 km of road = fully built-up).
  const development = clamp(Math.min(1, ((n as any).buildings > 0 ? (n as any).buildings / 250 : ((n as any).roadLen || 0) / 8000)) * 100);
  const environment = elevation == null ? 60 : 75;
  const score = Math.round(accessibility * .30 + infrastructure * .25 + development * .20 + environment * .25);

  return NextResponse.json({
    lat, lng, place: placeAt(lat, lng) ?? "Nigeria", score,
    accessibility, infrastructure, development, environment,
    nearestRoad: fmt(n.roadD, n.roadName || "Road", "No nearby mapped road"),
    nearestSchool: fmt(n.schoolD, n.schoolName, "No mapped school nearby"),
    nearestHospital: fmt(n.hospD, n.hospName, "No mapped hospital nearby"),
    elevation: elevation == null ? "Unavailable" : `${Math.round(elevation)} m`,
    educationCount: (n as any).eduCount2km ?? null,
    educationNearby: (n as any).eduNearby ?? [],
    slope: "Not yet calculated",
    landCover: landCoverAt(lat, lng) ?? "Not available",
    source: "GRID3 health, HOT/OSM schools, national roads, geoBoundaries + Copernicus DEM",
  });
}
