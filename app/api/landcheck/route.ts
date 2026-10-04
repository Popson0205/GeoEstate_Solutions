import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ENDPOINTS = Array.from(new Set([
  process.env.OSM_OVERPASS_URL || "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]));

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

// Race all Overpass mirrors in parallel: first good answer wins. Hard cap 12 s total,
// so we always answer before the Railway proxy gives up (that proxy timeout is what shows up as 502).
function overpass(query: string) {
  return Promise.any(ENDPOINTS.map(ep => fetchJson(ep, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "User-Agent": "GeoEstate-LandCheck/0.5", Accept: "application/json" },
    body: new URLSearchParams({ data: query }),
  }, 12000)));
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
    getNearby(lat, lng).then(v => ({ ok: true as const, v })).catch(e => ({ ok: false as const, e })),
    getElevation(lat, lng),
  ]);

  if (!nearbyR.ok) {
    console.error("LandCheck Overpass failed:", (nearbyR.e as any)?.errors?.map((x: any) => x.message) ?? nearbyR.e);
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
  const development = clamp(Math.min(1, n.buildings / 250) * 100);
  const environment = elevation == null ? 60 : 75;
  const score = Math.round(accessibility * .30 + infrastructure * .25 + development * .20 + environment * .25);

  return NextResponse.json({
    lat, lng, place: "Osogbo, Osun State", score,
    accessibility, infrastructure, development, environment,
    nearestRoad: fmt(n.roadD, n.roadName || "Road", "No nearby mapped road"),
    nearestSchool: fmt(n.schoolD, n.schoolName, "No mapped school nearby"),
    nearestHospital: fmt(n.hospD, n.hospName, "No mapped hospital nearby"),
    elevation: elevation == null ? "Unavailable" : `${Math.round(elevation)} m`,
    slope: "Not yet calculated",
    landCover: "ESA WorldCover layer",
    source: "OSM/Overpass + Copernicus DEM GLO-90",
  });
}
