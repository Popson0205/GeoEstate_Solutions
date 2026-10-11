// Drawing helpers for the GeoAI poster: text measuring/wrapping, charts and map pieces, all as plain SVG strings.
// Client-safe (no Node imports). Sizes are in SVG user units; the A2 poster is 4200 x 5940 units (10 units = 1 mm).
export const COL = { navy: "#0b2a4f", green: "#2e7d32", greenL: "#e8f3ea", high: "#c0392b", mod: "#e69f00", low: "#2e8b57", water: "#1f78b4", ink: "#17231d", muted: "#5b6b62", line: "#d7e2db", panel: "#f3f7f4", white: "#ffffff", purple: "#6a3d9a" };
export const FONT = "'Segoe UI', Helvetica, Arial, sans-serif";
export const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
export const r1 = (n: number) => Math.round(n * 10) / 10;
export const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toLocaleString("en-GB", { maximumFractionDigits: d }) : "–");

// Approximate Arial/Helvetica advance widths (em) so wrapping and fitting stay accurate without a DOM.
const NARROW = new Set("iljtfI.,;:'!|()[]/\\ ".split("")), WIDE = new Set("mwMW@%".split(""));
export function textWidth(s: string, size: number, bold = false) {
  let w = 0;
  for (const ch of s) w += ch === " " ? 0.278 : NARROW.has(ch) ? 0.3 : WIDE.has(ch) ? 0.86 : /[A-Z]/.test(ch) ? 0.69 : /[0-9]/.test(ch) ? 0.556 : 0.53;
  return w * size * (bold ? 1.07 : 1);
}
export function wrap(text: string, maxW: number, size: number, bold = false): string[] {
  const out: string[] = [];
  for (const para of String(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = line ? line + " " + word : word;
      if (line && textWidth(t, size, bold) > maxW) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}
type TB = { x: number; y: number; w: number; text: string; size: number; lh?: number; color?: string; bold?: boolean; anchor?: "start" | "middle" | "end"; italic?: boolean; maxLines?: number };
// Wrapped text. y = top of the first line. Returns the svg and the height used.
export function block(o: TB): { svg: string; h: number } {
  const lh = o.lh ?? Math.round(o.size * 1.38); let lines = wrap(o.text, o.w, o.size, o.bold);
  if (o.maxLines && lines.length > o.maxLines) { lines = lines.slice(0, o.maxLines); lines[o.maxLines - 1] = lines[o.maxLines - 1].replace(/[\s,;.]*$/, "") + "…"; }
  const ax = o.anchor === "middle" ? o.x + o.w / 2 : o.anchor === "end" ? o.x + o.w : o.x;
  const tsp = lines.map((l, i) => `<tspan x="${ax}" y="${o.y + o.size * 0.86 + i * lh}">${esc(l)}</tspan>`).join("");
  return { svg: `<text font-family="${FONT}" font-size="${o.size}" fill="${o.color ?? COL.ink}"${o.bold ? ' font-weight="700"' : ""}${o.italic ? ' font-style="italic"' : ""} text-anchor="${o.anchor ?? "start"}">${tsp}</text>`, h: lines.length * lh - (lh - o.size) + 0 };
}
export const text1 = (x: number, y: number, s: string, size: number, color = COL.ink, bold = false, anchor: "start" | "middle" | "end" = "start") =>
  `<text x="${x}" y="${y + size * 0.86}" font-family="${FONT}" font-size="${size}" fill="${color}"${bold ? ' font-weight="700"' : ""} text-anchor="${anchor}">${esc(s)}</text>`;

/* ----------------------------------------------------------------------- charts */
export type Slice = { label: string; value: number; color: string; note?: string };
// Donut chart with the headline figure in the middle.
export function donut(cx: number, cy: number, R: number, r: number, slices: Slice[], centre: string, centreSub: string, centreSize = R * 0.5): string {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0); if (total <= 0) return "";
  let a0 = -Math.PI / 2; const parts: string[] = [];
  for (const s of slices) {
    const v = Math.max(0, s.value); if (!v) continue; const a1 = a0 + (v / total) * Math.PI * 2;
    if (v / total > 0.9999) parts.push(`<path d="M${cx} ${cy - R}A${R} ${R} 0 1 1 ${cx - 0.01} ${cy - R}L${cx - 0.01} ${cy - r}A${r} ${r} 0 1 0 ${cx} ${cy - r}Z" fill="${s.color}"/>`);
    else {
      const p = (rad: number, a: number) => `${(cx + rad * Math.cos(a)).toFixed(1)} ${(cy + rad * Math.sin(a)).toFixed(1)}`; const big = a1 - a0 > Math.PI ? 1 : 0;
      parts.push(`<path d="M${p(R, a0)}A${R} ${R} 0 ${big} 1 ${p(R, a1)}L${p(r, a1)}A${r} ${r} 0 ${big} 0 ${p(r, a0)}Z" fill="${s.color}" stroke="#fff" stroke-width="${Math.max(3, R * 0.015)}"/>`);
    }
    a0 = a1;
  }
  return parts.join("") + text1(cx, cy - centreSize * 0.62, centre, centreSize, COL.ink, true, "middle") + text1(cx, cy + centreSize * 0.5, centreSub, centreSize * 0.36, COL.muted, false, "middle");
}
export function legendRows(x: number, y: number, w: number, items: { color: string; label: string; value: string }[], size: number, gap: number): { svg: string; h: number } {
  const svg = items.map((it, i) => { const yy = y + i * gap; return `<rect x="${x}" y="${yy + size * 0.1}" width="${size * 0.8}" height="${size * 0.8}" rx="${size * 0.12}" fill="${it.color}"/>` + text1(x + size * 1.15, yy, it.label, size, COL.ink) + text1(x + w, yy, it.value, size, COL.ink, true, "end"); }).join("");
  return { svg, h: items.length * gap };
}
export type StackRow = { label: string; sub?: string; parts: { v: number; color: string }[]; right?: string; empty?: string };
// 100% stacked horizontal bars (share of each row), with the raw values printed inside the segments.
export function stackRows(x: number, y: number, w: number, rows: StackRow[], o: { labelW: number; barH: number; gap: number; size: number; showUnit?: string }): { svg: string; h: number } {
  const bx = x + o.labelW, bw = w - o.labelW - 10; const out: string[] = [];
  rows.forEach((row, i) => {
    const yy = y + i * (o.barH + o.gap); const tot = row.parts.reduce((s, p) => s + p.v, 0);
    out.push(text1(x, yy + o.barH / 2 - o.size * (row.sub ? 0.95 : 0.5), row.label, o.size, COL.ink, true));
    if (row.sub) out.push(text1(x, yy + o.barH / 2 + o.size * 0.18, row.sub, o.size * 0.72, COL.muted));
    if (tot <= 0) { out.push(`<rect x="${bx}" y="${yy}" width="${bw}" height="${o.barH}" rx="14" fill="#fff" stroke="${COL.line}" stroke-width="4" stroke-dasharray="14 10"/>` + text1(bx + bw / 2, yy + o.barH / 2 - o.size * 0.5, row.empty ?? "0 on record", o.size, COL.muted, true, "middle")); return; }
    let cx = bx;
    out.push(`<clipPath id="sr${Math.round(x)}_${Math.round(y)}_${i}"><rect x="${bx}" y="${yy}" width="${bw}" height="${o.barH}" rx="14"/></clipPath><g clip-path="url(#sr${Math.round(x)}_${Math.round(y)}_${i})">`);
    for (const p of row.parts) { if (p.v <= 0) continue; const pw = (p.v / tot) * bw; out.push(`<rect x="${cx.toFixed(1)}" y="${yy}" width="${pw.toFixed(1)}" height="${o.barH}" fill="${p.color}"/>`); if (pw > o.size * 2.2) out.push(text1(cx + pw / 2, yy + o.barH / 2 - o.size * 0.5, fmt(p.v, p.v % 1 ? 1 : 0), o.size, "#fff", true, "middle")); cx += pw; }
    out.push("</g>");
    if (row.right) out.push(text1(bx + bw, yy + o.barH + 6, row.right, o.size * 0.72, COL.muted, false, "end"));
  });
  return { svg: out.join(""), h: rows.length * (o.barH + o.gap) };
}
// Horizontal ranking bars (all LGAs), one highlighted.
export function rankBars(x: number, y: number, w: number, rows: { label: string; value: number; hi: boolean }[], o: { rowH: number; size: number; labelW: number; color: string; hiColor: string }): { svg: string; h: number } {
  const max = Math.max(...rows.map(r => r.value), 1), bx = x + o.labelW, bw = w - o.labelW - 130; const out: string[] = [];
  rows.forEach((r, i) => {
    const yy = y + i * o.rowH, bh = o.rowH * 0.7, bwid = Math.max(6, (r.value / max) * bw);
    out.push(text1(x + o.labelW - 14, yy + (o.rowH - o.size) / 2 - 2, r.label, o.size, r.hi ? COL.navy : COL.ink, r.hi, "end"));
    out.push(`<rect x="${bx}" y="${yy + (o.rowH - bh) / 2}" width="${bwid.toFixed(1)}" height="${bh}" rx="8" fill="${r.hi ? o.hiColor : o.color}"/>`);
    out.push(text1(bx + bwid + 14, yy + (o.rowH - o.size) / 2 - 2, fmt(r.value), o.size, r.hi ? COL.navy : COL.muted, r.hi));
  });
  return { svg: out.join(""), h: rows.length * o.rowH };
}

/* ----------------------------------------------------------------------- map pieces */
export type Proj = { x: (lon: number) => number; y: (lat: number) => number; kmPerUnit: number; w: number; h: number; left: number; top: number };
// Fit a lon/lat box into a frame (equirectangular with cos(lat) correction), centred.
export function projector(bbox: number[], fx: number, fy: number, fw: number, fh: number, pad = 0): Proj {
  const [w, s, e, n] = bbox, lat0 = (s + n) / 2, k = Math.cos((lat0 * Math.PI) / 180);
  const sc = Math.min((fw - 2 * pad) / ((e - w) * k), (fh - 2 * pad) / (n - s)); const ww = (e - w) * k * sc, hh = (n - s) * sc;
  const left = fx + (fw - ww) / 2, top = fy + (fh - hh) / 2;
  return { x: lon => left + (lon - w) * k * sc, y: lat => top + (n - lat) * sc, kmPerUnit: 110.574 / sc, w: ww, h: hh, left, top };
}
export const ringPath = (ring: number[][], p: Proj) => ring.map(([x, y], i) => `${i ? "L" : "M"}${p.x(x).toFixed(1)} ${p.y(y).toFixed(1)}`).join("") + "Z";
export function geomPath(g: { type: string; coordinates: any }, p: Proj): string {
  const polys: number[][][][] = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polys.map(poly => poly.map(r => ringPath(r, p)).join("")).join("");
}
export function scaleBar(x: number, y: number, kmPerUnit: number, size: number): string {
  const nice = [1, 2, 5, 10, 20, 50]; let km = nice[0]; for (const n of nice) if (n / kmPerUnit < 420) km = n;
  const len = km / kmPerUnit;
  return `<g><rect x="${x}" y="${y}" width="${len}" height="14" fill="${COL.ink}"/><rect x="${x + len / 2}" y="${y}" width="${len / 2}" height="14" fill="#fff" stroke="${COL.ink}" stroke-width="3"/>${text1(x, y + 22, "0", size, COL.ink)}${text1(x + len, y + 22, km + " km", size, COL.ink, false, "end")}</g>`;
}
export const northArrow = (x: number, y: number, s: number) => `<g><path d="M${x} ${y}L${x + s * 0.34} ${y + s}L${x} ${y + s * 0.74}L${x - s * 0.34} ${y + s}Z" fill="${COL.ink}"/>${text1(x, y + s + 6, "N", s * 0.5, COL.ink, true, "middle")}</g>`;

// Facility markers, drawn by type. Marker size s = half-width.
export function marker(type: number, x: number, y: number, s: number, zone: number): string {
  const ring = zone === 2 ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s * 1.75}" fill="none" stroke="#fff" stroke-width="${s * 0.5}"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s * 1.75}" fill="none" stroke="${COL.high}" stroke-width="${s * 0.28}"/>` : "";
  const X = x.toFixed(1), Y = y.toFixed(1);
  if (type === 0) return ring + `<rect x="${(x - s).toFixed(1)}" y="${(y - s).toFixed(1)}" width="${s * 2}" height="${s * 2}" rx="${s * 0.2}" fill="${COL.navy}" stroke="#fff" stroke-width="${s * 0.3}"/>`;
  if (type === 1) return ring + `<circle cx="${X}" cy="${Y}" r="${s * 1.05}" fill="#fff" stroke="${COL.navy}" stroke-width="${s * 0.3}"/><path d="M${x - s * 0.55} ${y}H${x + s * 0.55}M${x} ${y - s * 0.55}V${y + s * 0.55}" stroke="${COL.high}" stroke-width="${s * 0.34}" stroke-linecap="round"/>`;
  return ring + `<path d="M${X} ${(y - s * 1.2).toFixed(1)}L${(x + s * 1.2).toFixed(1)} ${Y}L${X} ${(y + s * 1.2).toFixed(1)}L${(x - s * 1.2).toFixed(1)} ${Y}Z" fill="${COL.purple}" stroke="#fff" stroke-width="${s * 0.3}"/>`;
}
export function siteMarker(x: number, y: number, s: number, n: number): string {
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s}" fill="#1b8a3a" stroke="#fff" stroke-width="${s * 0.22}"/>` + text1(x, y - s * 0.62, String(n), s * 1.15, "#fff", true, "middle");
}

// Zone colours shared by the map raster, pies and bars so the poster reads as one picture.
export const ZONE = { low: "#9fd2a6", mod: "#f2b84b", high: "#d64541", water: "#2b7fc4" };
