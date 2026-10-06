import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

// Slope grid prepared by scripts/prepare-slope.py from ALOS slope (degrees), ~30 m cells.
type Grid = { ncols: number; nrows: number; west: number; north: number; cellX: number; cellY: number; scale: number; nodata: number; data: Uint8Array };
let grid: Grid | null | undefined;

function load(): Grid | null {
  if (grid !== undefined) return grid;
  try {
    const dir = path.join(process.cwd(), "data");
    const h = JSON.parse(fs.readFileSync(path.join(dir, "slope_osun.json"), "utf8"));
    const data = new Uint8Array(zlib.gunzipSync(fs.readFileSync(path.join(dir, "slope_osun.bin.gz"))));
    if (data.length !== h.ncols * h.nrows) throw new Error("slope grid size mismatch");
    grid = { ...h, data };
  } catch (e) { console.error("Slope grid unavailable:", (e as Error).message); grid = null; }
  return grid;
}

export type SlopeResult = { point: number; mean: number; max: number; band: string; label: string };

export function slopeBand(deg: number): string {
  if (deg < 2) return "Flat / gentle";
  if (deg < 5) return "Gently sloping";
  if (deg < 10) return "Moderately sloping";
  if (deg < 15) return "Steep";
  return "Very steep";
}

// Slope at a point plus mean/max over a small neighbourhood (radiusM, default ~90 m) so one noisy 30 m cell doesn't decide the answer.
export function slopeAt(lat: number, lng: number, radiusM = 90): SlopeResult | null {
  const g = load(); if (!g) return null;
  const col = Math.floor((lng - g.west) / g.cellX);
  const row = Math.floor((g.north - lat) / g.cellY);
  if (col < 0 || row < 0 || col >= g.ncols || row >= g.nrows) return null;
  const v = (r: number, c: number) => {
    if (r < 0 || c < 0 || r >= g.nrows || c >= g.ncols) return null;
    const q = g.data[r * g.ncols + c];
    return q === g.nodata ? null : q / g.scale;
  };
  const point = v(row, col);
  if (point == null) return null;
  const rc = Math.max(1, Math.round(radiusM / 30));
  let sum = 0, n = 0, max = 0;
  for (let dr = -rc; dr <= rc; dr++) for (let dc = -rc; dc <= rc; dc++) {
    if (dr * dr + dc * dc > rc * rc) continue;
    const s = v(row + dr, col + dc); if (s == null) continue;
    sum += s; n++; if (s > max) max = s;
  }
  const mean = n ? sum / n : point;
  return { point, mean, max, band: slopeBand(mean), label: `${mean.toFixed(1)}° avg (${slopeBand(mean)}), max ${max.toFixed(1)}° within ${radiusM} m` };
}
