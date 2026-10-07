import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { getSnapshot } from "@/lib/osm";
import { slopeGrid } from "@/lib/slope";

// GeoAI area analysis: flood susceptibility, slope, assets and roads for an LGA or a map window.
// All numbers come from the project's grids and datasets; the language model (lib/geoai-narrative.ts) only words them.
type Geom = { type: "Polygon" | "MultiPolygon"; coordinates: any };
type Grid = { ncols: number; nrows: number; west: number; north: number; cellX: number; cellY: number };
export type Zone = "High" | "Moderate" | "Low";
type Spans = { rows: Map<number, number[]>; r0: number; r1: number; c0: number; c1: number; bbox: [number, number, number, number] };
type Asset = { type: "school" | "health" | "market"; name: string; lon: number; lat: number; lga: number; row: number; col: number; cls: number; level: string };

const CELL_NODATA = 255;
const zoneOf = (cls: number): Zone => (cls === 3 || cls === 4 || cls === 5 ? "High" : cls === 2 ? "Moderate" : "Low");

type Ctx = {
  g: Grid; cls: Uint8Array; slope: ReturnType<typeof slopeGrid>;
  lgas: { name: string; geom: Geom; spans: Spans }[]; label: Int8Array;
  assets: Asset[];
  seg: { n: number; mr: Int32Array; mc: Int32Array; km: Float32Array; cls: Uint8Array; major: Uint8Array; lga: Int8Array };
  roadHash: Map<string, number[]>;
};
let ctx: Ctx | null | undefined;

/* ----------------------------------------------------------------------- geometry helpers */
function spansOf(geom: Geom, g: Grid): Spans {
  const polys: number[][][][] = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  const rows = new Map<number, number[]>(); let w = 180, s = 90, e = -180, n = -90, r0 = 1e9, r1 = -1, c0 = 1e9, c1 = -1;
  for (const poly of polys) {
    let pw = 180, ps = 90, pe = -180, pn = -90;
    for (const ring of poly) for (const [x, y] of ring) { pw = Math.min(pw, x); pe = Math.max(pe, x); ps = Math.min(ps, y); pn = Math.max(pn, y); }
    w = Math.min(w, pw); e = Math.max(e, pe); s = Math.min(s, ps); n = Math.max(n, pn);
    const ra = Math.max(0, Math.floor((g.north - pn) / g.cellY)), rb = Math.min(g.nrows - 1, Math.ceil((g.north - ps) / g.cellY));
    for (let r = ra; r <= rb; r++) {
      const y = g.north - (r + 0.5) * g.cellY; const xs: number[] = [];
      for (const ring of poly) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x0, y0] = ring[j], [x1, y1] = ring[i];
        if ((y0 <= y) !== (y1 <= y)) xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const ca = Math.max(0, Math.ceil((xs[k] - g.west) / g.cellX - 0.5)), cb = Math.min(g.ncols - 1, Math.floor((xs[k + 1] - g.west) / g.cellX - 0.5));
        if (cb < ca) continue;
        let arr = rows.get(r); if (!arr) rows.set(r, (arr = [])); arr.push(ca, cb);
        r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, ca); c1 = Math.max(c1, cb);
      }
    }
  }
  return { rows, r0, r1, c0, c1, bbox: [w, s, e, n] };
}
const inSpans = (sp: Spans, r: number, c: number) => { const a = sp.rows.get(r); if (!a) return false; for (let i = 0; i < a.length; i += 2) if (c >= a[i] && c <= a[i + 1]) return true; return false; };
const cellArea = (g: Grid, r: number) => { const lat = g.north - (r + 0.5) * g.cellY; return (g.cellX * 111320 * Math.cos((lat * Math.PI) / 180) * g.cellY * 110574) / 1e6; };
const rc = (g: Grid, lon: number, lat: number): [number, number] => [Math.floor((g.north - lat) / g.cellY), Math.floor((lon - g.west) / g.cellX)];
const kmBetween = (lon0: number, lat0: number, lon1: number, lat1: number) => Math.hypot((lon1 - lon0) * Math.cos(((lat0 + lat1) / 2) * Math.PI / 180) * 111.32, (lat1 - lat0) * 110.574);

/* ----------------------------------------------------------------------- one-time load */
function load(): Ctx | null {
  if (ctx !== undefined) return ctx;
  let out: Ctx | null = null;
  try {
    const dir = path.join(process.cwd(), "data");
    const g = JSON.parse(fs.readFileSync(path.join(dir, "flood_terrain_osun.json"), "utf8")) as Grid;
    const cls = new Uint8Array(zlib.gunzipSync(fs.readFileSync(path.join(dir, "flood_class_osun.bin.gz"))));
    if (cls.length !== g.ncols * g.nrows) throw new Error("class grid size mismatch");
    const slope = slopeGrid();
    const fc = JSON.parse(fs.readFileSync(path.join(dir, "lga_osun.json"), "utf8"));
    const lgas = fc.features.map((f: any) => ({ name: f.properties.name as string, geom: f.geometry as Geom, spans: spansOf(f.geometry, g) }));
    const label = new Int8Array(g.ncols * g.nrows).fill(-1);
    lgas.forEach((l: any, i: number) => { for (const [r, a] of l.spans.rows) for (let k = 0; k < a.length; k += 2) label.fill(i, r * g.ncols + a[k], r * g.ncols + a[k + 1] + 1); });
    const snap = getSnapshot();
    const assets: Asset[] = [];
    const put = (type: Asset["type"], p: any, level: string) => {
      const [r, c] = rc(g, p.lon, p.lat); if (r < 0 || c < 0 || r >= g.nrows || c >= g.ncols) return;
      const k = cls[r * g.ncols + c]; if (k === CELL_NODATA) return;
      assets.push({ type, name: String(p.name || "Unnamed"), lon: p.lon, lat: p.lat, lga: label[r * g.ncols + c], row: r, col: c, cls: k, level });
    };
    for (const p of snap?.schools || []) if (p.kind !== "campus") put("school", p, [p.cat, p.kind].filter(Boolean)[0] || "");
    for (const p of snap?.hospitals || []) put("health", p, p.lvl || p.type || "");
    for (const p of snap?.markets || []) put("market", p, p.type || "");
    // road segments (midpoint cell decides class and LGA)
    const MAJOR = /^(trunk|primary|secondary)(_link)?$/;
    let total = 0; for (const r of snap?.roads || []) total += Math.max(0, (r.g?.length || 0) - 1);
    const seg = { n: 0, mr: new Int32Array(total), mc: new Int32Array(total), km: new Float32Array(total), cls: new Uint8Array(total), major: new Uint8Array(total), lga: new Int8Array(total) };
    const roadHash = new Map<string, number[]>();
    for (const r of snap?.roads || []) {
      const pts: number[][] = r.g || [];
      if (r.h !== "track") for (const [x, y] of pts) { const key = `${Math.floor(x / 0.01)}|${Math.floor(y / 0.01)}`; let a = roadHash.get(key); if (!a) roadHash.set(key, (a = [])); a.push(x, y); }
      for (let i = 0; i + 1 < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; const [mr, mc] = rc(g, (x0 + x1) / 2, (y0 + y1) / 2);
        if (mr < 0 || mc < 0 || mr >= g.nrows || mc >= g.ncols) continue;
        const k = cls[mr * g.ncols + mc]; if (k === CELL_NODATA) continue;
        const n = seg.n++; seg.mr[n] = mr; seg.mc[n] = mc; seg.km[n] = kmBetween(x0, y0, x1, y1); seg.cls[n] = k; seg.major[n] = MAJOR.test(r.h || "") ? 1 : 0; seg.lga[n] = label[mr * g.ncols + mc];
      }
    }
    out = { g, cls, slope, lgas, label, assets, seg, roadHash };
  } catch (e) { console.error("GeoAI data unavailable:", (e as Error).message); }
  ctx = out;
  return out;
}

export const lgaNames = (): string[] => load()?.lgas.map(l => l.name) ?? [];
export const findLga = (q: string): string | null => {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/ilesa/g, "ilesha");
  return load()?.lgas.find(l => n(l.name) === n(q))?.name ?? null;
};

/* ----------------------------------------------------------------------- statistics */
function coreStats(c: Ctx, sp: Spans, lgaIdx: number | null) {
  const { g } = c; const km = { low: 0, moderate: 0, high: 0, stream: 0, water: 0 };
  let slopeSum = 0, slopeKm = 0, steep = 0, flat = 0, total = 0;
  const sg = c.slope;
  for (const [r, a] of sp.rows) {
    const A = cellArea(g, r);
    for (let k = 0; k < a.length; k += 2) for (let col = a[k]; col <= a[k + 1]; col++) {
      const i = r * g.ncols + col; const v = c.cls[i]; if (v === CELL_NODATA) continue;
      total += A; if (v === 0) km.low += A; else if (v === 2) km.moderate += A; else if (v === 3) km.high += A; else if (v === 4) km.stream += A; else if (v === 5) km.water += A;
      if (sg) { const q = sg.data[i]; if (q !== sg.nodata) { const d = q / sg.scale; slopeSum += d * A; slopeKm += A; if (d >= 10) steep += A; if (d < 2) flat += A; } }
    }
  }
  const pct = (x: number) => (total ? Math.round((x / total) * 1000) / 10 : 0);
  const exposedKm = km.high + km.stream + km.water;
  // assets
  const mine = c.assets.filter(a => (lgaIdx !== null ? a.lga === lgaIdx : inSpans(sp, a.row, a.col)));
  const tally = (t: Asset["type"]) => { const l = mine.filter(a => a.type === t); return { total: l.length, high: l.filter(a => zoneOf(a.cls) === "High").length, moderate: l.filter(a => zoneOf(a.cls) === "Moderate").length }; };
  // roads
  const S = c.seg; let rk = 0, rke = 0, rkm = 0, rkme = 0;
  for (let i = 0; i < S.n; i++) {
    if (lgaIdx !== null ? S.lga[i] !== lgaIdx : !inSpans(sp, S.mr[i], S.mc[i])) continue;
    const ex = zoneOf(S.cls[i]) === "High"; rk += S.km[i]; if (ex) rke += S.km[i]; if (S.major[i]) { rkm += S.km[i]; if (ex) rkme += S.km[i]; }
  }
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    areaKm2: r1(total),
    flood: { highPct: pct(km.high), streamPct: pct(km.stream), waterPct: pct(km.water), exposedPct: pct(exposedKm), moderatePct: pct(km.moderate), lowPct: pct(km.low), exposedKm2: r1(exposedKm), moderateKm2: r1(km.moderate) },
    terrain: { meanSlopeDeg: slopeKm ? r1(slopeSum / slopeKm) : null, steepPct: pct(steep), flatPct: pct(flat) },
    assets: { schools: tally("school"), health: tally("health"), markets: tally("market") },
    roads: { totalKm: Math.round(rk), exposedKm: r1(rke), majorKm: Math.round(rkm), majorExposedKm: r1(rkme) },
    mine,
  };
}

const share = (x: number, t: number) => (t ? x / t : 0);
function exposureIndex(s: ReturnType<typeof coreStats>) {
  const a = s.assets, tot = a.schools.total + a.health.total + a.markets.total, ex = a.schools.high + a.health.high + a.markets.high;
  return Math.round((0.4 * s.flood.exposedPct + 0.4 * 100 * share(ex, tot) + 0.2 * 100 * share(s.roads.exposedKm, s.roads.totalKm)) * 10) / 10;
}

let rankCache: ReturnType<typeof computeRank> | undefined;
export function rankLgas() { return rankCache ?? (rankCache = computeRank()); }
function computeRank() {
  const c = load(); if (!c) return null;
  const rows = c.lgas.map((l, i) => {
    const s = coreStats(c, l.spans, i); const a = s.assets;
    return { name: l.name, areaKm2: s.areaKm2, exposedPct: s.flood.exposedPct, moderatePct: s.flood.moderatePct, meanSlopeDeg: s.terrain.meanSlopeDeg,
      schoolsExposed: a.schools.high, schoolsTotal: a.schools.total, healthExposed: a.health.high, healthTotal: a.health.total, marketsExposed: a.markets.high, marketsTotal: a.markets.total,
      roadKmExposed: s.roads.exposedKm, roadKmTotal: s.roads.totalKm, exposureIndex: exposureIndex(s) };
  });
  rows.sort((a, b) => b.exposureIndex - a.exposureIndex);
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

/* ----------------------------------------------------------------------- safe-site finder */
function safeSites(c: Ctx, sp: Spans, n = 5) {
  const { g } = c, B = 16, sg = c.slope; const cand: { lon: number; lat: number; slope: number; road: number; score: number }[] = [];
  const nearestRoadKm = (lon: number, lat: number) => {
    let best = 9; const kx = Math.floor(lon / 0.01), ky = Math.floor(lat / 0.01);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const a = c.roadHash.get(`${kx + dx}|${ky + dy}`); if (!a) continue; for (let i = 0; i < a.length; i += 2) best = Math.min(best, kmBetween(lon, lat, a[i], a[i + 1])); }
    return best;
  };
  for (let r = sp.r0; r + B <= sp.r1 + 1; r += B) for (let col = sp.c0; col + B <= sp.c1 + 1; col += B) {
    let inside = 0, ok = true, sl = 0, sn = 0;
    for (let rr = r; rr < r + B && ok; rr++) for (let cc = col; cc < col + B; cc++) {
      if (!inSpans(sp, rr, cc)) continue; const i = rr * g.ncols + cc; const v = c.cls[i];
      if (v !== 0) { ok = false; break; }                       // any moderate/high/stream/water/no-data cell disqualifies the block
      inside++; if (sg) { const q = sg.data[i]; if (q !== sg.nodata) { sl += q / sg.scale; sn++; } }
    }
    if (!ok || inside < B * B * 0.9 || !sn) continue;
    const slope = sl / sn; if (slope > 5) continue;
    const lon = g.west + (col + B / 2) * g.cellX, lat = g.north - (r + B / 2) * g.cellY;
    const road = nearestRoadKm(lon, lat); if (road > 1) continue;
    cand.push({ lon, lat, slope, road, score: 100 - slope * 5 - road * 20 });
  }
  const near = (t: Asset["type"], lon: number, lat: number) => c.assets.filter(a => a.type === t).reduce((m, a) => Math.min(m, kmBetween(lon, lat, a.lon, a.lat)), 99);
  cand.sort((a, b) => b.score - a.score);
  const picked: (typeof cand[number] & { marketKm: number; schoolKm: number; healthKm: number })[] = [];
  for (const k of cand.slice(0, 400)) {
    if (picked.some(p => kmBetween(p.lon, p.lat, k.lon, k.lat) < 1.5)) continue;
    const marketKm = near("market", k.lon, k.lat), schoolKm = near("school", k.lon, k.lat), healthKm = near("health", k.lon, k.lat);
    picked.push({ ...k, marketKm, schoolKm, healthKm, score: k.score + (marketKm <= 3 ? 10 : 0) + (schoolKm <= 3 ? 5 : 0) + (healthKm <= 3 ? 5 : 0) });
  }
  picked.sort((a, b) => b.score - a.score);
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return picked.slice(0, n).map((p, i) => ({ name: `Candidate site ${i + 1}`, lon: Math.round(p.lon * 1e5) / 1e5, lat: Math.round(p.lat * 1e5) / 1e5, meanSlopeDeg: r1(p.slope), nearestRoadKm: r1(p.road),
    nearestMarketKm: p.marketKm < 99 ? r1(p.marketKm) : null, nearestSchoolKm: p.schoolKm < 99 ? r1(p.schoolKm) : null, nearestHealthKm: p.healthKm < 99 ? r1(p.healthKm) : null }));
}

/* ----------------------------------------------------------------------- public API */
export type AnalysisError = { error: string; status: number };
export function analyse(spec: { lga: string } | { bbox: [number, number, number, number] }): any | AnalysisError {
  const c = load(); if (!c) return { error: "Analysis data is not available on this server.", status: 503 };
  let sp: Spans, name: string, lgaIdx: number | null = null, scope: "lga" | "view";
  if ("lga" in spec) {
    const i = c.lgas.findIndex(l => l.name === spec.lga); if (i < 0) return { error: `Unknown LGA "${spec.lga}".`, status: 404 };
    sp = c.lgas[i].spans; name = c.lgas[i].name; lgaIdx = i; scope = "lga";
  } else {
    const [w, s, e, n] = spec.bbox; if (!(e > w && n > s)) return { error: "Invalid map window.", status: 400 };
    const approx = (e - w) * 111.32 * Math.cos(((s + n) / 2) * Math.PI / 180) * (n - s) * 110.57;
    if (approx > 3000) return { error: `Map window is too large (${Math.round(approx)} km²). Zoom in, or choose an LGA.`, status: 400 };
    sp = spansOf({ type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] }, c.g); name = "Current map view"; scope = "view";
    if (!sp.rows.size) return { error: "The map window is outside the Osun State data.", status: 400 };
  }
  const s = coreStats(c, sp, lgaIdx);
  if (!s.areaKm2) return { error: "No analysis data in this area.", status: 400 };
  const pins = (z: Zone, cap: number) => s.mine.filter(a => zoneOf(a.cls) === z).slice(0, cap).map(a => ({ type: a.type, name: a.name, level: a.level, lon: a.lon, lat: a.lat, zone: z, lga: a.lga >= 0 ? c.lgas[a.lga].name : "" }));
  const high = s.mine.filter(a => zoneOf(a.cls) === "High").length, mod = s.mine.filter(a => zoneOf(a.cls) === "Moderate").length;
  let rank: any = null;
  if (scope === "lga") { const all = rankLgas()!; const me = all.find(r => r.name === name); rank = me ? { position: me.rank, of: all.length, exposureIndex: me.exposureIndex } : null; }
  const { mine, ...stats } = s;
  return { scope, name, bbox: sp.bbox.map(v => Math.round(v * 1e4) / 1e4), ...stats, rank,
    exposedAssets: { highCount: high, moderateCount: mod, high: pins("High", 150), moderate: pins("Moderate", 100) },
    safeSites: safeSites(c, sp), generatedAt: new Date().toISOString().slice(0, 10) };
}
