import { NextRequest, NextResponse } from "next/server";
import { floodAt } from "@/lib/flood";
import { slopeAt } from "@/lib/slope";
import { landCoverAt } from "@/lib/landcover";
import { placeAt } from "@/lib/osm";

export const dynamic = "force-dynamic";
const MAX_ROWS = 2000;

// Minimal CSV parser (quoted fields, "" escapes, CRLF).
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some(v => v.trim() !== "")) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur); if (row.some(v => v.trim() !== "")) rows.push(row);
  return rows;
}
const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// POST text/csv with latitude/longitude columns -> same CSV plus flood, slope, land-cover and LGA columns.
export async function POST(request: NextRequest) {
  const text = await request.text();
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) return NextResponse.json({ error: "CSV needs a header row and at least one data row." }, { status: 400 });
  const head = rows[0].map(h => h.trim().toLowerCase());
  const find = (names: string[]) => head.findIndex(h => names.includes(h));
  const li = find(["lat", "latitude", "y"]), gi = find(["lng", "lon", "long", "longitude", "x"]);
  if (li < 0 || gi < 0) return NextResponse.json({ error: "Could not find latitude/longitude columns. Use headers like lat,lng." }, { status: 400 });
  if (rows.length - 1 > MAX_ROWS) return NextResponse.json({ error: `Too many rows (max ${MAX_ROWS}).` }, { status: 400 });
  const extra = ["lga", "flood_class", "flood_score", "hand_m", "slope_mean_deg", "slope_band", "land_cover", "note"];
  const out = [[...rows[0], ...extra].map(esc).join(",")];
  for (const r of rows.slice(1)) {
    const lat = Number(r[li]), lng = Number(r[gi]); const base = rows[0].map((_, i) => r[i] ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { out.push([...base, "", "", "", "", "", "", "", "invalid coordinates"].map(esc).join(",")); continue; }
    const f = floodAt(lat, lng), s = slopeAt(lat, lng), place = placeAt(lat, lng);
    out.push([...base, place?.split(",")[0] ?? "", f?.cls ?? "", f?.score ?? "", f ? Math.round(f.handM * 10) / 10 : "", s ? Math.round(s.mean * 10) / 10 : "", s?.band ?? "", landCoverAt(lat, lng) ?? "",
      f ? "" : "outside Osun data coverage"].map(esc).join(","));
  }
  return new NextResponse(out.join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="geoestate-batch-results.csv"' } });
}
