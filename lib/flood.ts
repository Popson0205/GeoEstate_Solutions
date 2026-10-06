import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

// Flood susceptibility = terrain model (HAND, TWI, local relief from the ALOS DEM)  +  optional observed evidence
// (JRC surface water, Global Flood Database, Sentinel-1 wet/dry-season water from Google Earth Engine).
// Built by scripts/prepare-flood-terrain.py and scripts/prepare-flood-observed.py.
type Header = { ncols: number; nrows: number; west: number; north: number; cellX: number; cellY: number };
type Layers = { h: Header; data: Uint8Array; nbands: number };
const cache: { terrain?: Layers | null; observed?: Layers | null } = {};

function loadLayers(name: string, nbands: number): Layers | null {
  let out: Layers | null = null;
  try {
    const dir = path.join(process.cwd(), "data");
    const h = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8")) as Header;
    const data = new Uint8Array(zlib.gunzipSync(fs.readFileSync(path.join(dir, `${name}.bin.gz`))));
    if (data.length !== h.ncols * h.nrows * nbands) throw new Error("size mismatch");
    out = { h, data, nbands };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") console.error(`${name} unavailable:`, (e as Error).message);
  }
  return out;
}
const terrainLayers = (): Layers | null => (cache.terrain !== undefined ? cache.terrain : (cache.terrain = loadLayers("flood_terrain_osun", 3)));
const observedLayers = (): Layers | null => (cache.observed !== undefined ? cache.observed : (cache.observed = loadLayers("flood_observed_osun", 4)));

// Read a (2r+1)^2 window of one band; returns valid values (255 = no data is dropped for terrain bands).
function window(L: Layers, band: number, row: number, col: number, r: number, skip255: boolean): number[] {
  const { ncols, nrows } = L.h, base = band * ncols * nrows, out: number[] = [];
  for (let dr = -r; dr <= r; dr++) for (let dc = -r; dc <= r; dc++) {
    const rr = row + dr, cc = col + dc; if (rr < 0 || cc < 0 || rr >= nrows || cc >= ncols) continue;
    const v = L.data[base + rr * ncols + cc]; if (skip255 && v === 255) continue; out.push(v);
  }
  return out;
}
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
function interp(x: number, pts: [number, number][]): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0); }
  return pts[pts.length - 1][1];
}

export type FloodClass = "Low" | "Moderate" | "High";
export type FloodResult = {
  score: number; cls: FloodClass; label: string;
  handM: number; twi: number; reliefM: number; terrainScore: number;
  observed: null | { occurrencePct: number; pastFloodEvents: number; seasonalWaterPct: number; evidenceScore: number; note: string };
};

export function floodAt(lat: number, lng: number): FloodResult | null {
  const T = terrainLayers(); if (!T) return null;
  const col = Math.floor((lng - T.h.west) / T.h.cellX), row = Math.floor((T.h.north - lat) / T.h.cellY);
  if (col < 0 || row < 0 || col >= T.h.ncols || row >= T.h.nrows) return null;
  const hand = window(T, 0, row, col, 1, true), twiW = window(T, 1, row, col, 1, true), relW = window(T, 2, row, col, 1, true);
  if (!hand.length || !twiW.length || !relW.length) return null;
  const handM = mean(hand) / 2, twi = mean(twiW) / 4, reliefM = mean(relW) - 20;      // 3x3 mean (~90 m) to damp single-cell DEM noise

  // Terrain score 0-100. HAND = height above nearest modelled stream (the strongest predictor of overbank flooding).
  const handScore = interp(handM, [[0, 100], [2, 85], [5, 60], [10, 30], [15, 10], [20, 0]]);
  const twiScore = clamp(((twi - 6) / 8) * 100);               // wetness index: 6 = well-drained, 14+ = collects water
  const reliefScore = clamp(((4 - reliefM) / 8) * 100);        // sitting >=4 m below surroundings = hollow
  const terrainScore = Math.round(handScore * 0.55 + twiScore * 0.2 + reliefScore * 0.25);

  // Observed evidence (optional layer). Strong evidence lifts the score; it never lowers it.
  let observed: FloodResult["observed"] = null;
  const O = observedLayers();
  if (O && O.h.ncols === T.h.ncols && O.h.nrows === T.h.nrows) {
    const occ = Math.max(...window(O, 0, row, col, 2, false));                       // ~60 m
    const events = Math.max(...window(O, 1, row, col, 5, false));                    // 250 m MODIS pixels
    const wet = window(O, 2, row, col, 1, false), dry = window(O, 3, row, col, 1, false);
    const seasonal = Math.max(0, mean(wet) - mean(dry));                               // wet-season water that is not there in the dry season
    let ev = 0; const notes: string[] = [];
    if (occ >= 90) { notes.push("permanent water body"); ev = Math.max(ev, 100); }
    else if (occ >= 25) { notes.push(`surface water seen in ${occ}% of satellite scenes nearby`); ev = Math.max(ev, 90); }
    else if (occ >= 5) { notes.push(`occasional surface water nearby (${occ}%)`); ev = Math.max(ev, 70); }
    if (events >= 2) { notes.push(`${events} satellite-mapped past floods`); ev = Math.max(ev, 85); }
    else if (events === 1) { notes.push("1 satellite-mapped past flood"); ev = Math.max(ev, 65); }
    if (seasonal >= 25) { notes.push(`radar shows wet-season-only water (${Math.round(seasonal)}%)`); ev = Math.max(ev, 75); }
    observed = { occurrencePct: occ, pastFloodEvents: events, seasonalWaterPct: Math.round(seasonal), evidenceScore: ev, note: notes.length ? notes.join("; ") : "no satellite flood evidence nearby" };
  }
  const score = Math.max(terrainScore, observed?.evidenceScore ?? 0);
  const cls: FloodClass = score >= 65 ? "High" : score >= 35 ? "Moderate" : "Low";
  const parts = [`${handM.toFixed(1)} m above nearest drainage`];
  if (observed && observed.evidenceScore > 0) parts.push(observed.note);
  return { score, cls, label: `${cls} (${parts.join("; ")})`, handM, twi, reliefM, terrainScore, observed };
}
