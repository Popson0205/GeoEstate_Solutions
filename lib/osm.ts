import fs from "node:fs";
import path from "node:path";

// Local snapshot produced by scripts/build-snapshot.mjs (national GeoJSON files) or scripts/fetch-osm.mjs (Overpass). Null if the file hasn't been generated yet.
let snap: any | undefined;
export function getSnapshot(): any | null {
  if (snap !== undefined) return snap;
  try { snap = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "snapshot.json"), "utf8")); }
  catch { snap = null; }
  return snap;
}

export function covers(lat: number, lng: number) {
  const s = getSnapshot(); if (!s) return false;
  const b = s.bbox; return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

const rad = (d: number) => (d * Math.PI) / 180;

export function distToSegment(pLat: number, pLng: number, a: number[], b: number[]) {
  const k = Math.cos(rad(pLat));
  const ax = (a[0] - pLng) * k * 111320, ay = (a[1] - pLat) * 110540;
  const bx = (b[0] - pLng) * k * 111320, by = (b[1] - pLat) * 110540;
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}
const distPt = (lat: number, lng: number, lon2: number, lat2: number) =>
  Math.hypot((lon2 - lng) * Math.cos(rad(lat)) * 111320, (lat2 - lat) * 110540);

export function nearbyFromSnapshot(lat: number, lng: number) {
  const s = getSnapshot(); if (!s || !covers(lat, lng)) return null;
  let roadD = Infinity, roadName = "", roadLen = 0;
  const kLng = Math.cos(rad(lat)) * 111320;
  for (const r of s.roads) {
    // cheap reject: skip roads whose first vertex is > ~4 km away
    const f = r.g[0]; if (Math.abs(f[1] - lat) > 0.04 || Math.abs(f[0] - lng) > 0.04) continue;
    for (let i = 0; i < r.g.length - 1; i++) {
      const A = r.g[i], B = r.g[i + 1];
      const d = distToSegment(lat, lng, A, B);
      if (d < roadD) { roadD = d; roadName = r.n || r.h; }
      if (d <= 1000) roadLen += Math.hypot((B[0] - A[0]) * kLng, (B[1] - A[1]) * 110540); // road length near the point (development proxy)
    }
  }
  const nearest = (arr: any[], fallback: string) => {
    let best = Infinity, name = fallback;
    for (const p of arr) { const d = distPt(lat, lng, p.lon, p.lat); if (d < best) { best = d; name = p.name || fallback; } }
    return { d: best, name };
  };
  // Campus buildings (faculty blocks, labs...) are not separate schools, so they are excluded from school metrics.
  const instSchools = (s.schools as any[]).filter(p => p.kind !== "campus");
  const sc = nearest(instSchools, "School");
  const ho = nearest((s.hospitals as any[]).map(h => ({ ...h, name: (h.name || "Health facility") + (h.lvl ? ` (${h.lvl})` : "") })), "Health facility");
  const KIND: Record<string, string> = { school: "School", kindergarten: "Kindergarten", college: "College", university: "University" };
  const edu = instSchools
    .map(p => ({ name: p.name || `${KIND[p.kind] || "Education facility"} (unnamed)`, kind: p.cat && p.cat !== "School" ? `${p.cat} ${(KIND[p.kind] || "School").toLowerCase()}` : (KIND[p.kind] || "School"), d: distPt(lat, lng, p.lon, p.lat) }))
    .filter(p => p.d <= 2000).sort((a, b) => a.d - b.d);
  const eduNearby = edu.slice(0, 8).map(p => ({ ...p, d: Math.round(p.d) }));
  let buildings = 0;
  const B = s.buildings;
  for (let i = 0; i < B.length; i += 2) {
    if (Math.abs(B[i + 1] - lat) < 0.01 && distPt(lat, lng, B[i], B[i + 1]) <= 1000) buildings++;
  }
  return { roadD, roadName, roadLen, schoolD: sc.d, schoolName: sc.name, eduCount2km: edu.length, eduNearby, hospD: ho.d, hospName: ho.name, buildings };
}

export function featuresFromSnapshot(b: { south: number; west: number; north: number; east: number }, zoom: number) {
  const s = getSnapshot(); if (!s) return null;
  const cLat = (b.south + b.north) / 2, cLng = (b.west + b.east) / 2;
  if (!covers(cLat, cLng)) return null;
  const inBox = (lon: number, lat: number) => lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north;
  const fc = (features: any[]) => ({ type: "FeatureCollection", features });
  const pt = (p: any) => ({ type: "Feature", properties: { name: p.name || "Unnamed", kind: p.kind || "", cat: p.cat || "", lvl: p.lvl || "", type: p.type || "", op: p.op || "", lga: p.lga || "" }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } });
  const major = /^(motorway|trunk|primary|secondary|tertiary)$/;

  const roads: any[] = [];
  for (const r of s.roads) {
    if (zoom < 12 && !major.test(r.h)) continue;
    if (!r.g.some((c: number[]) => inBox(c[0], c[1]))) continue;
    roads.push({ type: "Feature", properties: { name: r.n, highway: r.h }, geometry: { type: "LineString", coordinates: r.g } });
    if (roads.length >= 8000) break;
  }
  const props: any[] = [];
  if (zoom >= 14) {
    const B = s.buildings;
    for (let i = 0; i < B.length && props.length < 5000; i += 2)
      if (inBox(B[i], B[i + 1])) props.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [B[i], B[i + 1]] } });
  }
  const flood: any[] = [];
  for (const w of s.water) {
    if (!w.g.some((c: number[]) => inBox(c[0], c[1]))) continue;
    if (w.k === "poly" && w.g.length >= 4) {
      const g = w.g.slice(); const f = g[0], l = g[g.length - 1];
      if (f[0] !== l[0] || f[1] !== l[1]) g.push(f);
      flood.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [g] } });
    } else flood.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: w.g } });
  }
  const pts = (arr: any[]) => fc(arr.filter(p => inBox(p.lon, p.lat)).map(pt));
  return {
    source: "OpenStreetMap snapshot " + s.fetchedAt,
    roads: fc(roads), properties: fc(props), flood: fc(flood),
    schools: pts(s.schools), hospitals: pts(s.hospitals), markets: pts(s.markets), government: pts(s.government),
    counts: {
      roads: s.roads.length, properties: (s.buildings || []).length / 2, schools: s.schools.length, hospitals: s.hospitals.length,
      markets: s.markets.length, government: s.government.length, flood: s.water.length,
    },
  };
}

function inRing(x: number, y: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPoly(x: number, y: number, a: any) {
  const polys: number[][][][] = a.type === "Polygon" ? [a.c] : a.c;
  return polys.some(poly => inRing(x, y, poly[0]) && !poly.slice(1).some(h => inRing(x, y, h)));
}
export function placeAt(lat: number, lng: number): string | null {
  const s = getSnapshot(); if (!s?.adm2) return null;
  const lga = s.adm2.find((a: any) => inPoly(lng, lat, a));
  const st = (s.adm1 || []).find((a: any) => inPoly(lng, lat, a));
  if (!lga && !st) return null;
  return [lga?.name, st?.name && `${st.name} State`].filter(Boolean).join(", ");
}
