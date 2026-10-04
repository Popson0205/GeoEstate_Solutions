import fs from "node:fs";
import path from "node:path";

const CLASSES: Record<number, string> = {
  10: "Tree cover", 20: "Shrubland", 30: "Grassland", 40: "Cropland", 50: "Built-up",
  60: "Bare / sparse vegetation", 70: "Snow and ice", 80: "Permanent water", 90: "Herbaceous wetland",
  95: "Mangroves", 100: "Moss and lichen",
};

type Grid = { ncols: number; nrows: number; xll: number; yll: number; cell: number; data: Uint8Array };
let grid: Grid | null | undefined;

function load(): Grid | null {
  if (grid !== undefined) return grid;
  try {
    const txt = fs.readFileSync(path.join(process.cwd(), "data", "worldcover_osogbo.asc"), "utf8");
    const lines = txt.split("\n");
    const h: Record<string, number> = {};
    let i = 0;
    for (; i < 6; i++) { const [k, v] = lines[i].trim().split(/\s+/); h[k.toLowerCase()] = Number(v); }
    const ncols = h.ncols, nrows = h.nrows;
    const data = new Uint8Array(ncols * nrows);
    let p = 0;
    for (; i < lines.length && p < data.length; i++) {
      const row = lines[i].trim(); if (!row) continue;
      for (const t of row.split(/\s+/)) data[p++] = Number(t) || 0;
    }
    grid = { ncols, nrows, xll: h.xllcorner, yll: h.yllcorner, cell: h.cellsize, data };
  } catch { grid = null; }
  return grid;
}

export function landCoverBounds() {
  const g = load(); if (!g) return null;
  return { west: g.xll, south: g.yll, east: g.xll + g.ncols * g.cell, north: g.yll + g.nrows * g.cell };
}

export function landCoverAt(lat: number, lng: number): string | null {
  const g = load(); if (!g) return null;
  const col = Math.floor((lng - g.xll) / g.cell);
  const row = Math.floor((g.yll + g.nrows * g.cell - lat) / g.cell);
  if (col < 0 || row < 0 || col >= g.ncols || row >= g.nrows) return null;
  return CLASSES[g.data[row * g.ncols + col]] ?? null;
}
