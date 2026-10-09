import { qrSvg } from "./qr";

// GeoEstate poster builder: one SVG per LGA, in two formats.
//   "a2"     420 x 594 mm portrait (viewBox 4200 x 5940, 10 units per mm): print / PDF / JPEG
//   "social" 1080 x 1350 px (4:5) post for WhatsApp, Instagram, LinkedIn, Facebook
// Client-safe (no Node imports). Everything printed comes from the computed figures in the bundle from /api/poster-data;
// the conclusion and recommendations are rule-based wording of those figures (no AI call), so every LGA gets its own, reproducible text.
export type PosterFormat = "a2" | "social";
export type PosterOptions = { format: PosterFormat; logo: string; appUrl?: string | null; date?: Date };

export const CONTACT = { whatsapp: "+234 916 042 0100", whatsappLink: "https://wa.me/2349160420100", email: "geoestate.ng@gmail.com" };
const NAVY = "#0c2a4d", GREEN = "#2e7d32", GREEN_L = "#8fd19e", HIGH = "#c0392b", MOD = "#e69f00", LOW = "#2e8b57", INK = "#17231d", MUTED = "#55645c", GRID = "#d7e2db", PAPER = "#f3f7f4", WHITE = "#ffffff";
const FONT = "Arial, Helvetica, 'Segoe UI', sans-serif";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const f1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-GB");
const f0 = (n: number) => Math.round(n).toLocaleString("en-GB");
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/* ---------------------------------------------------------------- text helpers */
// Approximate text width (conservative, so wrapped text never overflows even with wider fallback fonts).
const tw = (s: string, size: number, bold = false) => s.length * size * (bold ? 0.56 : 0.52);
function wrap(text: string, size: number, maxW: number, bold = false): string[] {
  const out: string[] = []; let line = "";
  for (const w of text.split(/\s+/).filter(Boolean)) { const t = line ? line + " " + w : w; if (tw(t, size, bold) <= maxW || !line) line = t; else { out.push(line); line = w; } }
  if (line) out.push(line); return out;
}
type TOpt = { size: number; fill?: string; bold?: boolean; anchor?: "start" | "middle" | "end"; italic?: boolean; opacity?: number; spacing?: number };
const T = (x: number, y: number, s: string, o: TOpt) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${o.size}" fill="${o.fill ?? INK}"${o.bold ? ' font-weight="700"' : ""}${o.italic ? ' font-style="italic"' : ""}${o.anchor ? ` text-anchor="${o.anchor}"` : ""}${o.opacity != null ? ` opacity="${o.opacity}"` : ""}${o.spacing ? ` letter-spacing="${o.spacing}"` : ""}>${esc(s)}</text>`;
// Wrapped paragraph; returns svg and height used.
function P(x: number, y: number, w: number, text: string, size: number, o: Partial<TOpt> & { lh?: number } = {}) {
  const lh = o.lh ?? size * 1.32, lines = wrap(text, size, w, !!o.bold);
  return { svg: lines.map((l, i) => T(x, y + size + i * lh, l, { size, ...o })).join(""), h: lines.length * lh, n: lines.length };
}
// Bulleted/paragraph block that shrinks its font until it fits (w x h).
function fit(items: { text: string; bullet?: boolean }[], x: number, y: number, w: number, h: number, maxSize: number, minSize: number, gapRatio = 0.45, fill = INK, bulletColor = GREEN) {
  for (let size = maxSize; size >= minSize; size -= 1) {
    const lh = size * 1.3, gap = size * gapRatio, ind = size * 1.1; let cy = 0; const parts: string[] = [];
    for (const it of items) {
      const lines = wrap(it.text, size, w - (it.bullet ? ind : 0));
      if (it.bullet) parts.push(`<circle cx="${(x + size * 0.32).toFixed(1)}" cy="${(y + cy + size * 0.68).toFixed(1)}" r="${(size * 0.17).toFixed(1)}" fill="${bulletColor}"/>`);
      lines.forEach((l, i) => parts.push(T(x + (it.bullet ? ind : 0), y + cy + size + i * lh, l, { size, fill })));
      cy += lines.length * lh + gap;
    }
    if (cy - gap <= h || size === minSize) return parts.join("");
  }
  return "";
}
const card = (x: number, y: number, w: number, h: number, fill = WHITE, stroke = GRID, r = 18) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`;
const heading = (x: number, y: number, n: string, title: string, size: number, w: number) =>
  `<circle cx="${x + size * 0.55}" cy="${y + size * 0.55}" r="${size * 0.55}" fill="${GREEN}"/>${T(x + size * 0.55, y + size * 0.74, n, { size: size * 0.62, fill: WHITE, bold: true, anchor: "middle" })}${T(x + size * 1.4, y + size * 0.8, title, { size, fill: NAVY, bold: true })}<line x1="${x}" x2="${x + w}" y1="${y + size * 1.35}" y2="${y + size * 1.35}" stroke="${GRID}" stroke-width="3"/>`;

/* ---------------------------------------------------------------- the story, from the figures */
export function story(b: any) {
  const a = b.analysis, f = a.flood, t = a.terrain, as = a.assets, r = a.roads, rk: any[] = b.ranking, me = rk.find(x => x.name === a.name);
  const hiMed = median(rk.map(x => x.exposedPct)), hiMin = Math.min(...rk.map(x => x.exposedPct)), hiMax = Math.max(...rk.map(x => x.exposedPct));
  const share = (x: number, t: number) => (t ? x / t : 0);
  const comp = (x: any) => { const tot = x.schoolsTotal + x.healthTotal + x.marketsTotal, ex = x.schoolsExposed + x.healthExposed + x.marketsExposed; return { area: 0.4 * x.exposedPct, fac: 40 * share(ex, tot), road: 20 * share(x.roadKmExposed, x.roadKmTotal) }; };
  const mine = comp(me), med = { area: median(rk.map(x => comp(x).area)), fac: median(rk.map(x => comp(x).fac)), road: median(rk.map(x => comp(x).road)) };
  const diffs = (["area", "fac", "road"] as const).map(k => ({ k, d: mine[k] - med[k] })).sort((x, y) => y.d - x.d);
  const totAssets = as.schools.total + as.health.total + as.markets.total, exAssets = as.schools.high + as.health.high + as.markets.high;
  const rel = f.exposedPct > hiMed + 1.5 ? "above" : f.exposedPct < hiMed - 1.5 ? "below" : "close to";
  const driver = diffs[0].d <= 0.5 ? "No single component (land area, facilities or roads) stands clearly above the Osun median, so the position reflects a balanced, moderate exposure."
    : diffs[0].k === "area" ? "Its position is driven mainly by the share of land that lies in High zones."
    : diffs[0].k === "fac" ? `Its position is driven mainly by facilities standing in High zones: ${exAssets} of ${totAssets} mapped schools, health facilities and markets.`
    : `Its position is driven mainly by its road network: ${f1(r.exposedKm)} km of ${f0(r.totalKm)} km of mapped road run through High zones.`;
  const posNote = a.rank.position <= 10 ? "among the more exposed third of Osun LGAs" : a.rank.position <= 20 ? "in the middle band of Osun LGAs" : "among the less exposed third of Osun LGAs";
  const conclusion = [
    `${a.name} has ${f1(f.exposedPct)}% of its land in High flood-susceptibility zones (Osun LGA median ${f1(hiMed)}%, range ${f1(hiMin)}–${f1(hiMax)}%), ${rel} the state median, and a further ${f1(f.moderatePct)}% in Moderate zones. It ranks ${a.rank.position} of ${a.rank.of} on the exposure index (1 = most exposed), ${posNote}.`,
    driver,
    t.flatPct >= 25 ? `${f1(t.flatPct)}% of the area is nearly flat (under 2°), where water drains slowly; mean slope is ${t.meanSlopeDeg ?? "n/a"}°.` : `Mean slope is ${t.meanSlopeDeg ?? "n/a"}° and ${f1(t.flatPct)}% of the area is nearly flat (under 2°).`,
    `Mapped so far: ${as.schools.total} schools, ${as.health.total} health facilities and ${as.markets.total} markets. These counts will rise with field mapping.`,
  ];
  const zeroKinds = [["schools", as.schools.total], ["health facilities", as.health.total], ["markets", as.markets.total]].filter(x => x[1] === 0).map(x => x[0] as string);
  const gov = [
    a.exposedAssets.highCount > 0 ? `Verify on the ground the ${a.exposedAssets.highCount} mapped facilities in High zones.` : "Confirm on the ground that no mapped facility stands on flood-susceptible ground, and extend the mapping.",
    r.exposedKm > 0 ? `Inspect drainage along the ${f1(r.exposedKm)} km of roads in High zones${r.majorExposedKm > 0 ? `, including ${f1(r.majorExposedKm)} km of trunk, primary and secondary roads` : ""}.` : "Keep road drainage under routine inspection.",
    "Use the High and Moderate zones in development control: keep drainage corridors open and steer new housing and services towards Low zones.",
    zeroKinds.length ? `Commission field mapping of every school, clinic and market. Zero ${zeroKinds.join(" and ")} are mapped so far.` : "Commission field mapping to complete the school, clinic and market records.",
  ];
  const sites = a.safeSites?.length ?? 0;
  const inv = [
    "Screen every plot on GeoEstate LandCheck before paying: flood class, slope and road access in one check.",
    sites ? `${sites} candidate sites sit outside flood-susceptible ground, on gentle slope, within 1 km of a mapped road (green markers on the map). Treat them as leads for survey and title checks.` : "No block of land met all of our screening criteria here, so check plots one by one.",
    "Be cautious with plots in or beside High zones: ask for the site drainage plan and the local flood history.",
    "Confirm title, survey and community flood history on site. This poster does not replace them.",
  ];
  return { conclusion, gov, inv, hiMed, hiMin, hiMax, totAssets, exAssets };
}

/* ---------------------------------------------------------------- map */
function mapSvg(b: any, x: number, y: number, w: number, h: number, k: number, opts: { scale?: boolean } = {}) {
  const e = b.extras, [W, S, E, N] = e.mapBox as number[], mid = (S + N) / 2, kx = Math.cos((mid * Math.PI) / 180);
  const dx = (E - W) * kx, dy = N - S, s = Math.min(w / dx, h / dy), pw = dx * s, ph = dy * s, ox = x + (w - pw) / 2, oy = y + (h - ph) / 2;
  const X = (lon: number) => ox + (lon - W) * kx * s, Y = (lat: number) => oy + (N - lat) * s;
  const segs = (a: number[]) => { let d = "", lx = NaN, ly = NaN; for (let i = 0; i + 3 < a.length; i += 4) { const x0 = X(a[i]), y0 = Y(a[i + 1]), x1 = X(a[i + 2]), y1 = Y(a[i + 3]); if (Math.abs(x0 - lx) < 0.05 && Math.abs(y0 - ly) < 0.05) d += `L${x1.toFixed(1)} ${y1.toFixed(1)}`; else d += `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}`; lx = x1; ly = y1; } return d; };
  const R = e.roads, line = (a: number[], c: string, wd: number, op = 1) => (a.length ? `<path d="${segs(a)}" fill="none" stroke="${c}" stroke-width="${(wd * k).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>` : "");
  const ring = (p: number[][][]) => p.map(rg => "M" + rg.map(([lo, la]) => `${X(lo).toFixed(1)} ${Y(la).toFixed(1)}`).join("L") + "Z").join("");
  const bound = e.boundary.map(ring).join("");
  const id = "clip" + Math.round(x * 7 + y * 13 + w);
  const pin = (p: any[]) => {
    const cx = X(p[1]), cy = Y(p[2]), c = p[3] === "H" ? "#7a0d0d" : p[3] === "M" ? "#8a5300" : "#14532d", rr = 11 * k;
    const sh = p[0] === "s" ? `<rect x="${(cx - rr).toFixed(1)}" y="${(cy - rr).toFixed(1)}" width="${2 * rr}" height="${2 * rr}" fill="${c}" stroke="#fff" stroke-width="${3 * k}"/>`
      : p[0] === "m" ? `<path d="M${cx.toFixed(1)} ${(cy - rr * 1.35).toFixed(1)}L${(cx + rr * 1.35).toFixed(1)} ${cy.toFixed(1)}L${cx.toFixed(1)} ${(cy + rr * 1.35).toFixed(1)}L${(cx - rr * 1.35).toFixed(1)} ${cy.toFixed(1)}Z" fill="${c}" stroke="#fff" stroke-width="${3 * k}"/>`
      : `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rr}" fill="${c}" stroke="#fff" stroke-width="${3 * k}"/>`;
    return sh;
  };
  const sites = (b.analysis.safeSites || []).map((st: any, i: number) => { const cx = X(st.lon), cy = Y(st.lat), rr = 26 * k; return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rr}" fill="#16a34a" stroke="#fff" stroke-width="${5 * k}"/>${T(cx, cy + rr * 0.38, String(i + 1), { size: rr * 1.15, fill: WHITE, bold: true, anchor: "middle" })}`; }).join("");
  // scale bar
  let bar = "";
  if (opts.scale !== false) {
    const kmPerUnit = 111.32 * kx / ((E - W) * kx > 0 ? (pw / (E - W)) : 1); // km per svg unit (east-west)
    const targets = [1, 2, 5, 10, 20, 50], want = pw * 0.2 * kmPerUnit, km = targets.reduce((p, c) => (Math.abs(c - want) < Math.abs(p - want) ? c : p), 5), len = km / kmPerUnit;
    const bx = x + 34 * k + 10, by = y + h - 44 * k;
    bar = `<g><rect x="${bx - 14 * k}" y="${by - 42 * k}" width="${len + 28 * k}" height="${78 * k}" rx="${8 * k}" fill="#fff" opacity="0.85"/><line x1="${bx}" x2="${bx + len}" y1="${by}" y2="${by}" stroke="${NAVY}" stroke-width="${6 * k}"/><line x1="${bx}" x2="${bx}" y1="${by - 12 * k}" y2="${by + 12 * k}" stroke="${NAVY}" stroke-width="${5 * k}"/><line x1="${bx + len}" x2="${bx + len}" y1="${by - 12 * k}" y2="${by + 12 * k}" stroke="${NAVY}" stroke-width="${5 * k}"/>${T(bx + len / 2, by - 16 * k, `${km} km`, { size: 30 * k, fill: NAVY, bold: true, anchor: "middle" })}</g>`;
    const nx = x + w - 50 * k, ny = y + 84 * k;
    bar += `<g><path d="M${nx} ${ny - 50 * k}L${nx + 22 * k} ${ny + 14 * k}L${nx} ${ny}L${nx - 22 * k} ${ny + 14 * k}Z" fill="${NAVY}"/>${T(nx, ny + 52 * k, "N", { size: 34 * k, fill: NAVY, bold: true, anchor: "middle" })}</g>`;
  }
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#eaf0ec"/>
<defs><clipPath id="${id}"><path d="${bound}" clip-rule="evenodd"/></clipPath></defs>
<path d="${bound}" fill="#fff"/>
<image href="${e.mapPng}" x="${ox.toFixed(1)}" y="${oy.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" preserveAspectRatio="none"/>
<g clip-path="url(#${id})">${line(R.minorOther, "#5f6b73", 1.6, 0.55)}${line(R.majorOther, NAVY, 4.5)}${line(R.minorHigh, "#4a0a0a", 1.8, 0.75)}${line(R.majorHigh, "#4a0a0a", 5)}</g>
<path d="${bound}" fill="none" stroke="${NAVY}" stroke-width="${6 * k}" stroke-linejoin="round"/>
${e.points.map(pin).join("")}${sites}${bar}</g>`;
}
function mapLegend(x: number, y: number, size: number) {
  const row = size * 1.55; let cy = y; const out: string[] = [];
  const sw = (c: string, label: string) => { out.push(`<rect x="${x}" y="${cy}" width="${size * 1.1}" height="${size * 0.9}" rx="3" fill="${c}"/>`, T(x + size * 1.5, cy + size * 0.82, label, { size })); cy += row; };
  out.push(T(x, cy + size, "Flood-susceptibility zones", { size, bold: true, fill: NAVY })); cy += row * 1.1;
  sw(HIGH, "High (low ground near drainage)"); sw("#f4c26b", "Moderate"); sw("#d6e8c9", "Low (tint = steeper ground)"); sw("#1f6fb2", "Modelled stream / water body");
  cy += size * 0.5; out.push(T(x, cy + size, "Roads and facilities", { size, bold: true, fill: NAVY })); cy += row * 1.1;
  out.push(`<line x1="${x}" x2="${x + size * 1.1}" y1="${cy + size * 0.45}" y2="${cy + size * 0.45}" stroke="${NAVY}" stroke-width="${size * 0.22}"/>`, T(x + size * 1.5, cy + size * 0.82, "Main roads (trunk to tertiary)", { size })); cy += row;
  out.push(`<line x1="${x}" x2="${x + size * 1.1}" y1="${cy + size * 0.45}" y2="${cy + size * 0.45}" stroke="#4a0a0a" stroke-width="${size * 0.22}"/>`, T(x + size * 1.5, cy + size * 0.82, "Roads crossing High zones", { size })); cy += row;
  const shapes: [string, string][] = [["c", "Health facility"], ["s", "School"], ["d", "Market"]];
  for (const [sh, label] of shapes) { const cx = x + size * 0.55, c2 = cy + size * 0.45, r = size * 0.38;
    out.push(sh === "c" ? `<circle cx="${cx}" cy="${c2}" r="${r}" fill="#7a0d0d" stroke="#fff" stroke-width="2"/>` : sh === "s" ? `<rect x="${cx - r}" y="${c2 - r}" width="${2 * r}" height="${2 * r}" fill="#7a0d0d" stroke="#fff" stroke-width="2"/>` : `<path d="M${cx} ${c2 - r * 1.3}L${cx + r * 1.3} ${c2}L${cx} ${c2 + r * 1.3}L${cx - r * 1.3} ${c2}Z" fill="#7a0d0d" stroke="#fff" stroke-width="2"/>`, T(x + size * 1.5, cy + size * 0.82, label, { size })); cy += row; }
  out.push(T(x, cy + size * 0.9, "Marker colour shows the zone it sits in", { size: size * 0.82, fill: MUTED })); cy += row;
  out.push(`<circle cx="${x + size * 0.55}" cy="${cy + size * 0.45}" r="${size * 0.5}" fill="#16a34a" stroke="#fff" stroke-width="3"/>`, T(x + size * 1.5, cy + size * 0.82, "Candidate site on higher ground", { size }));
  return { svg: out.join(""), h: cy + row - y };
}

/* ---------------------------------------------------------------- charts */
function donut(cx: number, cy: number, R: number, thick: number, slices: { v: number; c: string }[], centre: string, sub: string, cs: number) {
  const tot = slices.reduce((s, x) => s + Math.max(0, x.v), 0) || 1, C = 2 * Math.PI * R; let off = 0;
  const arcs = slices.filter(s => s.v > 0).map(s => { const len = (s.v / tot) * C; const el = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${s.c}" stroke-width="${thick}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`; off += len; return el; }).join("");
  return `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${GRID}" stroke-width="${thick}"/>${arcs}${T(cx, cy + cs * 0.12, centre, { size: cs, bold: true, anchor: "middle", fill: NAVY })}${T(cx, cy + cs * 0.62, sub, { size: cs * 0.34, anchor: "middle", fill: MUTED })}`;
}
function legendRows(x: number, y: number, w: number, rows: { c: string; label: string; val: string }[], size: number) {
  return rows.map((r, i) => { const yy = y + i * size * 1.6; return `<rect x="${x}" y="${yy}" width="${size * 0.9}" height="${size * 0.9}" rx="3" fill="${r.c}"/>${T(x + size * 1.3, yy + size * 0.8, r.label, { size, fill: MUTED })}${T(x + w, yy + size * 0.8, r.val, { size, bold: true, anchor: "end" })}`; }).join("");
}
function vBars(x: number, y: number, w: number, h: number, cats: string[], series: { label: string; c: string; v: number[] }[], fs: number) {
  const max = Math.max(1, ...series.flatMap(s => s.v.map(num))), step = Math.pow(10, Math.floor(Math.log10(max))), nice = [1, 2, 5, 10].map(m => m * step).find(s => max / s <= 5) || step * 10, top = Math.ceil(max / nice) * nice;
  const L = fs * 2.4, B = fs * 2, Tp = fs * 1.4, pw = w - L, ph = h - B - Tp; let g = "";
  for (let v = 0; v <= top; v += nice) { const yy = y + Tp + ph - (v / top) * ph; g += `<line x1="${x + L}" x2="${x + w}" y1="${yy}" y2="${yy}" stroke="${GRID}" stroke-width="2"/>${T(x + L - 10, yy + fs * 0.35, String(v), { size: fs * 0.85, fill: MUTED, anchor: "end" })}`; }
  const gw = pw / cats.length, bw = Math.min(fs * 3, (gw * 0.8) / series.length);
  cats.forEach((c, ci) => { const gx = x + L + ci * gw + (gw - bw * series.length) / 2;
    series.forEach((s, si) => { const v = num(s.v[ci]), bh = (v / top) * ph, bx = gx + si * bw, by = y + Tp + ph - bh; g += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${(bw - 5).toFixed(1)}" height="${Math.max(bh, 0).toFixed(1)}" rx="4" fill="${s.c}"/>${T(bx + (bw - 5) / 2, by - fs * 0.3, String(v), { size: fs * 0.95, bold: true, anchor: "middle" })}`; });
    g += T(x + L + ci * gw + gw / 2, y + h - fs * 0.5, c, { size: fs * 0.95, anchor: "middle" }); });
  return g;
}
function hBars(x: number, y: number, w: number, rows: { label: string; v: number; hl: boolean }[], rowH: number, fs: number) {
  const max = Math.max(1, ...rows.map(r => r.v)), L = fs * 8.6, R = fs * 2.6, pw = w - L - R;
  return rows.map((r, i) => { const yy = y + i * rowH, bw = (r.v / max) * pw;
    return `${r.hl ? `<rect x="${x - 6}" y="${yy}" width="${w + 12}" height="${rowH}" rx="6" fill="#fdecea"/>` : ""}${T(x + L - 10, yy + rowH * 0.72, r.label, { size: fs, anchor: "end", bold: r.hl })}<rect x="${x + L}" y="${yy + rowH * 0.18}" width="${Math.max(bw, 2).toFixed(1)}" height="${rowH * 0.64}" rx="3" fill="${r.hl ? HIGH : "#8aa597"}"/>${T(x + L + bw + 10, yy + rowH * 0.72, f1(r.v), { size: fs, bold: true })}`; }).join("");
}
function dotStrip(x: number, y: number, w: number, vals: { v: number; hl: boolean }[], fs: number) {
  const lo = Math.floor(Math.min(...vals.map(d => d.v)) / 5) * 5, hi = Math.ceil(Math.max(...vals.map(d => d.v)) / 5) * 5, X = (v: number) => x + ((v - lo) / (hi - lo || 1)) * w, ay = y + 230;
  let g = `<line x1="${x}" x2="${x + w}" y1="${ay}" y2="${ay}" stroke="${MUTED}" stroke-width="3"/>`;
  for (let v = lo; v <= hi; v += 5) g += `<line x1="${X(v)}" x2="${X(v)}" y1="${ay - 8}" y2="${ay + 8}" stroke="${MUTED}" stroke-width="3"/>${T(X(v), ay + fs * 1.5, `${v}%`, { size: fs * 0.9, fill: MUTED, anchor: "middle" })}`;
  const stack = new Map<number, number>(), step = fs * 0.6;
  [...vals].sort((a, b) => a.v - b.v).forEach(d => { const key = Math.round(X(d.v) / (fs * 0.8)); const n = stack.get(key) ?? 0; stack.set(key, n + 1); g += `<circle cx="${X(d.v).toFixed(1)}" cy="${(ay - 16 - n * step).toFixed(1)}" r="${d.hl ? fs * 0.5 : fs * 0.27}" fill="${d.hl ? HIGH : "#8aa597"}" stroke="${d.hl ? "#fff" : "none"}" stroke-width="3"/>`; });
  return g;
}

/* ---------------------------------------------------------------- shared bits */
const defs = `<defs><linearGradient id="hdr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${NAVY}"/><stop offset="1" stop-color="#14456f"/></linearGradient></defs>`;
function kpi(x: number, y: number, w: number, h: number, big: string, label: string, color: string, bs: number, ls: number) {
  const lines = wrap(label, ls, w - ls * 1.6);
  return `${card(x, y, w, h)}<rect x="${x}" y="${y}" width="${ls * 0.5}" height="${h}" rx="6" fill="${color}"/>${T(x + ls * 1.2, y + h * 0.44, big, { size: bs, bold: true, fill: color })}${lines.map((l, i) => T(x + ls * 1.2, y + h * 0.44 + ls * 1.5 + i * ls * 1.25, l, { size: ls, fill: MUTED })).join("")}`;
}
const dateStr = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const snapStr = (s: string | null) => (s ? dateStr(new Date(s)) : "n/a");

/* ---------------------------------------------------------------- A2 */
function a2(b: any, o: PosterOptions): string {
  const a = b.analysis, f = a.flood, t = a.terrain, as = a.assets, r = a.roads, st = story(b), W = 4200, H = 5940, M = 150, CW = W - 2 * M;
  const date = dateStr(o.date ?? new Date()), rk: any[] = b.ranking, name = `${a.name} LGA`;
  let s = "";
  // header
  s += `<rect width="${W}" height="${H}" fill="${PAPER}"/><rect width="${W}" height="580" fill="url(#hdr)"/><rect y="580" width="${W}" height="22" fill="${GREEN}"/>`;
  s += `<rect x="${M}" y="70" width="440" height="440" rx="40" fill="#fff"/><image href="${o.logo}" x="${M + 15}" y="85" width="410" height="410"/>`;
  s += T(M + 520, 150, "FLOOD SUSCEPTIBILITY & INFRASTRUCTURE EXPOSURE · OSUN STATE", { size: 46, fill: GREEN_L, bold: true, spacing: 4 });
  s += T(M + 520, 320, name, { size: 190, fill: WHITE, bold: true });
  s += T(M + 520, 420, "Where water collects, and what stands in its way", { size: 72, fill: "#d6e4f2" });
  s += T(M + 520, 500, "Modelled susceptibility for planners, investors and land buyers", { size: 52, fill: "#9db8d3" });
  s += T(W - M, 150, date, { size: 50, fill: WHITE, bold: true, anchor: "end" }) + T(W - M, 215, `Data snapshot ${snapStr(b.extras.snapshotDate)}`, { size: 40, fill: "#9db8d3", anchor: "end" });
  // KPI strip
  const ky = 650, kh = 270, kg = 40, kw = (CW - 4 * kg) / 5;
  const sites = a.safeSites?.length ?? 0;
  [[`${f1(f.exposedPct)}%`, "of land in High susceptibility zones", HIGH], [`${as.health.high}`, `health facilities in High zones (of ${as.health.total} mapped)`, HIGH], [`${f1(r.exposedKm)} km`, `of mapped roads cross High zones (of ${f0(r.totalKm)} km)`, MOD], [`#${a.rank.position} of ${a.rank.of}`, "exposure rank among Osun LGAs (1 = most exposed)", NAVY], [`${sites}`, "candidate sites outside flood-susceptible ground", GREEN]]
    .forEach((k, i) => (s += kpi(M + i * (kw + kg), ky, kw, kh, k[0], k[1], k[2], 118, 42)));
  // band 2: left text + map
  const by = 970, bh = 1760, lw = 1380;
  s += card(M, by, lw, bh);
  s += heading(M + 50, by + 40, "1", "Why this matters", 64, lw - 100);
  const why = `Floods damage homes, roads, clinics and markets, and land bought without a drainage check can lose its value or its use. GeoEstate maps where terrain concentrates water, so planners can protect services and buyers can screen plots before they pay. This poster applies our Osun State flood-susceptibility model to ${a.name} LGA and overlays the schools, health facilities, markets and roads mapped so far.`;
  s += fit([{ text: why }], M + 50, by + 170, lw - 100, 520, 52, 40);
  s += heading(M + 50, by + 730, "2", "Study area at a glance", 64, lw - 100);
  const facts: [string, string][] = [["Area", `${f0(a.areaKm2)} km²`], ["Mean slope", `${t.meanSlopeDeg ?? "n/a"}°`], ["Nearly flat (<2°)", `${f1(t.flatPct)}% of area`], ["Mapped roads", `${f0(r.totalKm)} km`], ["Schools mapped", `${as.schools.total}`], ["Health facilities mapped", `${as.health.total}`], ["Markets mapped", `${as.markets.total}`], ["Moderate zone", `${f1(f.moderatePct)}% of area`]];
  facts.forEach((fc, i) => { const yy = by + 900 + i * 100; s += `${i % 2 ? "" : `<rect x="${M + 40}" y="${yy - 14}" width="${lw - 80}" height="96" rx="10" fill="${PAPER}"/>`}${T(M + 70, yy + 52, fc[0], { size: 48, fill: MUTED })}${T(M + lw - 70, yy + 54, fc[1], { size: 54, bold: true, fill: NAVY, anchor: "end" })}`; });
  // map
  const mx = M + lw + 60, mw = CW - lw - 60;
  s += card(mx, by, mw, bh) + T(mx + 50, by + 90, `Flood susceptibility, roads and facilities: ${name}`, { size: 62, bold: true, fill: NAVY });
  const lgW = 800, mapH = bh - 150, mapW = mw - 100 - lgW - 40;
  s += `<g>${mapSvg(b, mx + 50, by + 130, mapW, mapH - 10, 1)}</g>`;
  const lg = mapLegend(mx + 50 + mapW + 40, by + 140, 38); s += lg.svg;
  // candidate sites list in the legend column
  let cy = by + 140 + lg.h + 40; s += T(mx + 50 + mapW + 40, cy + 40, "Candidate sites (lat, lon · slope · road)", { size: 38, bold: true, fill: NAVY });
  (a.safeSites || []).forEach((c: any, i: number) => { const yy = cy + 80 + i * 78; s += `<circle cx="${mx + 50 + mapW + 40 + 24}" cy="${yy + 18}" r="24" fill="#16a34a"/>${T(mx + 50 + mapW + 40 + 24, yy + 30, String(i + 1), { size: 28, fill: WHITE, bold: true, anchor: "middle" })}${T(mx + 50 + mapW + 40 + 62, yy + 30, `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)} · ${c.meanSlopeDeg}° · ${c.nearestRoadKm > 0 ? c.nearestRoadKm + " km" : "<0.1 km"}`, { size: 31 })}`; });
  if (!sites) s += P(mx + 50 + mapW + 40, cy + 70, lgW, "No block met all criteria.", 34, { fill: MUTED }).svg;
  // band 3: method
  const my = 2780, mh = 450;
  s += card(M, my, CW, mh) + heading(M + 50, my + 30, "3", "Data and method", 64, CW - 100);
  const src = ["ALOS 30 m elevation (JAXA)", "JRC Global Surface Water", "Global Flood Database", "Sentinel-1 radar water (ESA)", "GRID3 health facilities v3", "HOT / OSM education facilities", "Markets in Nigeria (OSGOF, eHA, GRID3)", "OSM-derived national roads", "geoBoundaries LGA limits"];
  src.forEach((x, i) => { const col = i < 5 ? 0 : 1, row = i < 5 ? i : i - 5, xx = M + 60 + col * 900, yy = my + 175 + row * 50; s += `<circle cx="${xx + 10}" cy="${yy + 14}" r="8" fill="${GREEN}"/>${T(xx + 34, yy + 26, x, { size: 36 })}`; });
  const steps = [["ALOS 30 m DEM", "Fill depressions, trace flow"], ["Drainage + HAND", "Height above nearest stream"], ["Score", "HAND 55%, wetness 20%, relief 25%"], ["Zones", "Low, Moderate, High; satellite water adds"], ["Overlay", "Schools, clinics, markets, roads"]];
  const fx = M + 1900, fw = (CW - 1900 - 50 - 4 * 34) / 5;
  steps.forEach((st2, i) => { const xx = fx + i * (fw + 34); s += `<rect x="${xx}" y="${my + 175}" width="${fw}" height="250" rx="16" fill="${i === 4 ? GREEN : NAVY}"/>${T(xx + fw / 2, my + 222, st2[0], { size: 38, bold: true, fill: WHITE, anchor: "middle" })}${P(xx + 20, my + 240, fw - 40, st2[1], 32, { fill: "#d6e4f2" }).svg}`; if (i < 4) s += `<path d="M${xx + fw + 4} ${my + 292}l26 14l-26 14z" fill="${GREEN}"/>`; });
  // band 4: results
  const ry = 3280, rh = 1330;
  s += `<rect x="${M}" y="${ry}" width="${CW}" height="86" rx="14" fill="${NAVY}"/>${T(M + 40, ry + 62, "4  Results: what the model and the mapped data show", { size: 56, bold: true, fill: WHITE })}`;
  const py = ry + 110, ph = rh - 110;
  // pie panel
  const p1w = 880; s += card(M, py, p1w, ph);
  s += T(M + 40, py + 70, "Share of area by zone", { size: 50, bold: true, fill: NAVY });
  const lowPct = Math.max(0, 100 - f.exposedPct - f.moderatePct);
  s += donut(M + p1w / 2, py + 380, 200, 120, [{ v: f.exposedPct, c: HIGH }, { v: f.moderatePct, c: MOD }, { v: lowPct, c: LOW }], `${f1(f.exposedPct)}%`, "in High zones", 84);
  s += legendRows(M + 50, py + 640, p1w - 100, [{ c: HIGH, label: "High", val: `${f1(f.exposedPct)}% · ${f0(f.exposedKm2)} km²` }, { c: MOD, label: "Moderate", val: `${f1(f.moderatePct)}% · ${f0(f.moderateKm2)} km²` }, { c: LOW, label: "Low", val: `${f1(lowPct)}%` }], 40);
  const rdOut = Math.max(0, r.totalKm - r.exposedKm), rp = r.totalKm ? (r.exposedKm / r.totalKm) * 100 : 0;
  s += T(M + 40, py + 880, "Mapped road length by zone", { size: 46, bold: true, fill: NAVY });
  s += donut(M + 230, py + 1020, 100, 60, [{ v: r.exposedKm, c: HIGH }, { v: rdOut, c: LOW }], `${f0(rp)}%`, "in High", 44);
  s += legendRows(M + 400, py + 960, p1w - 440, [{ c: HIGH, label: "High zones", val: `${f1(r.exposedKm)} km` }, { c: LOW, label: "Elsewhere", val: `${f1(rdOut)} km` }], 36);
  // facilities
  const p2x = M + p1w + 30, p2w = 1060; s += card(p2x, py, p2w, ph);
  s += T(p2x + 40, py + 70, "Mapped facilities by zone", { size: 50, bold: true, fill: NAVY });
  const kinds: [string, any][] = [["Schools", as.schools], ["Health", as.health], ["Markets", as.markets]];
  s += vBars(p2x + 30, py + 110, p2w - 60, 700, kinds.map(k => k[0]), [{ label: "High", c: HIGH, v: kinds.map(k => k[1].high) }, { label: "Moderate", c: MOD, v: kinds.map(k => k[1].moderate) }, { label: "Low", c: LOW, v: kinds.map(k => Math.max(0, k[1].total - k[1].high - k[1].moderate)) }], 42);
  s += legendRows(p2x + 70, py + 840, p2w - 140, [{ c: HIGH, label: "In High zones", val: `${as.schools.high + as.health.high + as.markets.high}` }, { c: MOD, label: "In Moderate zones", val: `${as.schools.moderate + as.health.moderate + as.markets.moderate}` }, { c: LOW, label: "In Low zones", val: `${st.totAssets - st.exAssets - (as.schools.moderate + as.health.moderate + as.markets.moderate)}` }], 38);
  s += P(p2x + 40, py + 1100, p2w - 80, "Counts are what public datasets map so far. Zero means none mapped yet.", 36, { fill: MUTED }).svg;
  // slope + context
  const p3x = p2x + p2w + 30, p3w = 860; s += card(p3x, py, p3w, ph);
  s += T(p3x + 40, py + 70, "Slope bands (share of area)", { size: 50, bold: true, fill: NAVY });
  s += vBars(p3x + 20, py + 110, p3w - 40, 520, b.extras.slopeBands.map((x: any) => x.label), [{ label: "Area %", c: "#4f8f6a", v: b.extras.slopeBands.map((x: any) => x.pct) }], 40);
  s += T(p3x + 40, py + 710, "High-zone share: all 30 LGAs", { size: 46, bold: true, fill: NAVY });
  s += dotStrip(p3x + 60, py + 740, p3w - 120, rk.map(x => ({ v: x.exposedPct, hl: x.name === a.name })), 36);
  s += P(p3x + 40, py + 1050, p3w - 80, `${a.name} (red): ${f1(f.exposedPct)}% against a state median of ${f1(st.hiMed)}%. Grey dots are the other LGAs.`, 36, { fill: MUTED }).svg;
  // ranking
  const p4x = p3x + p3w + 30, p4w = M + CW - p4x; s += card(p4x, py, p4w, ph);
  s += T(p4x + 40, py + 66, "Exposure index, all 30 LGAs", { size: 46, bold: true, fill: NAVY });
  s += hBars(p4x + 30, py + 100, p4w - 60, rk.map(x => ({ label: x.name, v: x.exposureIndex, hl: x.name === a.name })), 33, 29);
  s += P(p4x + 40, py + ph - 95, p4w - 80, "Index = 40% area in High zones + 40% facilities in High zones + 20% roads in High zones.", 28, { fill: MUTED }).svg;
  // band 5: conclusion & recommendations
  const cy2 = 4640, ch = 780, g3 = 40, w1 = 1360, w2 = (CW - w1 - 2 * g3) / 2;
  s += card(M, cy2, w1, ch, "#eef6ef", "#bcd9c0") + heading(M + 40, cy2 + 30, "5", "Conclusion", 62, w1 - 80);
  s += fit(st.conclusion.slice(0, 3).map((x: string) => ({ text: x })), M + 40, cy2 + 165, w1 - 80, ch - 190, 52, 30, 0.5);
  const gx = M + w1 + g3; s += card(gx, cy2, w2, ch) + heading(gx + 40, cy2 + 30, "6", "For government and planners", 62, w2 - 80);
  s += fit(st.gov.map((x: string) => ({ text: x, bullet: true })), gx + 40, cy2 + 165, w2 - 80, ch - 190, 52, 30, 0.5);
  const ix = gx + w2 + g3; s += card(ix, cy2, w2, ch) + heading(ix + 40, cy2 + 30, "7", "For investors and land buyers", 62, w2 - 80);
  s += fit(st.inv.map((x: string) => ({ text: x, bullet: true })), ix + 40, cy2 + 165, w2 - 80, ch - 190, 52, 30, 0.5);
  // footer
  const fy = 5430; s += `<rect y="${fy}" width="${W}" height="${H - fy}" fill="${NAVY}"/><rect y="${fy}" width="${W}" height="14" fill="${GREEN}"/>`;
  const zero = as.schools.total === 0 || as.health.total === 0 || as.markets.total === 0;
  s += T(M, fy + 110, zero ? "Zero here means zero mapped so far." : "What is mapped today is only the start.", { size: 74, bold: true, fill: WHITE });
  s += P(M, fy + 130, 1900, "Partner with GeoEstate to map every school, clinic and market on the ground, and to screen plots before you buy.", 50, { fill: "#d6e4f2" }).svg;
  s += T(M, fy + 335, `WhatsApp  ${CONTACT.whatsapp}`, { size: 56, bold: true, fill: WHITE }) + T(M, fy + 400, `Email  ${CONTACT.email}`, { size: 56, bold: true, fill: WHITE });
  const qs = 320; let qx = W - M - qs;
  s += qrSvg(CONTACT.whatsappLink, qx, fy + 40, qs, NAVY) + T(qx + qs / 2, fy + 40 + qs + 40, "WhatsApp us", { size: 36, fill: WHITE, bold: true, anchor: "middle" });
  if (o.appUrl) { qx -= qs + 60; s += qrSvg(o.appUrl, qx, fy + 40, qs, NAVY) + T(qx + qs / 2, fy + 40 + qs + 40, "LandCheck", { size: 36, fill: WHITE, bold: true, anchor: "middle" }); }
  const disc = "Modelled susceptibility, not a flood-risk determination. Terrain-based (ALOS 30 m); it excludes rainfall, drainage works and local flood history. Ground verification is required before any planning, investment or emergency decision. LGA boundaries are simplified (geoBoundaries) and areas may differ from official figures.";
  s += P(M, fy + 430, qx - M - 80, disc, 30, { fill: "#9db8d3", lh: 38 }).svg;
  return s;
}

/* ---------------------------------------------------------------- social 1080 x 1350 */
function social(b: any, o: PosterOptions): string {
  const a = b.analysis, f = a.flood, as = a.assets, r = a.roads, st = story(b), W = 1080, H = 1350, M = 40, CW = W - 2 * M;
  let s = `<rect width="${W}" height="${H}" fill="${PAPER}"/><rect width="${W}" height="250" fill="url(#hdr)"/><rect y="250" width="${W}" height="8" fill="${GREEN}"/>`;
  s += `<rect x="${M}" y="36" width="178" height="178" rx="22" fill="#fff"/><image href="${o.logo}" x="${M + 6}" y="42" width="166" height="166"/>`;
  s += T(M + 210, 76, "FLOOD SUSCEPTIBILITY · OSUN STATE", { size: 22, fill: GREEN_L, bold: true, spacing: 2 }) + T(M + 210, 150, `${a.name} LGA`, { size: a.name.length > 12 ? 66 : 76, bold: true, fill: WHITE });
  s += T(M + 210, 192, "What stands on low ground near drainage?", { size: 27, fill: "#d6e4f2" }) + T(M + 210, 226, `Rank ${a.rank.position} of ${a.rank.of} on exposure (1 = most exposed)`, { size: 24, fill: "#9db8d3" });
  const ky = 282, kh = 168, kg = 18, kw = (CW - 2 * kg) / 3;
  [[`${f1(f.exposedPct)}%`, "of land in High zones", HIGH], [`${as.health.high}/${as.health.total}`, "mapped health facilities in High zones", HIGH], [`${f1(r.exposedKm)} km`, `of ${f0(r.totalKm)} km mapped roads cross High zones`, MOD]].forEach((k, i) => (s += kpi(M + i * (kw + kg), ky, kw, kh, k[0] as string, k[1] as string, k[2] as string, 58, 22)));
  // map + side panel
  const my = 462, mh = 470; s += card(M, my, CW, mh);
  const mapW = 600; s += mapSvg(b, M + 14, my + 14, mapW, mh - 28, 0.4, { scale: true });
  const sx = M + mapW + 40, sw = CW - mapW - 60, low = Math.max(0, 100 - f.exposedPct - f.moderatePct);
  s += donut(sx + sw / 2, my + 92, 56, 34, [{ v: f.exposedPct, c: HIGH }, { v: f.moderatePct, c: MOD }, { v: low, c: LOW }], `${f1(f.exposedPct)}%`, "High", 26);
  s += legendRows(sx, my + 180, sw, [{ c: HIGH, label: "High", val: `${f1(f.exposedPct)}%` }, { c: MOD, label: "Moderate", val: `${f1(f.moderatePct)}%` }, { c: LOW, label: "Low", val: `${f1(low)}%` }], 21);
  const fl: [string, any][] = [["Schools", as.schools], ["Health", as.health], ["Markets", as.markets]];
  s += T(sx, my + 308, "Mapped, in High zones", { size: 21, bold: true, fill: NAVY });
  fl.forEach((k, i) => (s += T(sx, my + 342 + i * 32, k[0], { size: 21, fill: MUTED }) + T(sx + sw, my + 342 + i * 32, `${k[1].high} of ${k[1].total}`, { size: 21, bold: true, anchor: "end" })));
  s += `<circle cx="${sx + 11}" cy="${my + 438}" r="11" fill="#16a34a"/>` + T(sx + 32, my + 446, `${a.safeSites.length} candidate sites`, { size: 21, fill: MUTED });
  // headline insight
  const iy = 948; s += `<rect x="${M}" y="${iy}" width="${CW}" height="128" rx="18" fill="#eef6ef" stroke="#bcd9c0" stroke-width="2"/>`;
  s += fit([{ text: st.conclusion[0] + " " + st.conclusion[1] }], M + 26, iy + 14, CW - 52, 104, 26, 16, 0.3);
  // footer
  const fy = 1092; s += `<rect y="${fy}" width="${W}" height="${H - fy}" fill="${NAVY}"/><rect y="${fy}" width="${W}" height="6" fill="${GREEN}"/>`;
  s += T(M, fy + 56, (as.schools.total === 0 || as.health.total === 0 || as.markets.total === 0) ? "Zero means zero mapped so far." : "What is mapped today is only the start.", { size: 36, bold: true, fill: WHITE }) + P(M, fy + 70, 720, "Partner with GeoEstate for field mapping and plot screening.", 25, { fill: "#d6e4f2" }).svg;
  s += T(M, fy + 172, `WhatsApp ${CONTACT.whatsapp}`, { size: 28, bold: true, fill: WHITE }) + T(M, fy + 208, `Email ${CONTACT.email}`, { size: 28, bold: true, fill: WHITE });
  s += qrSvg(CONTACT.whatsappLink, W - M - 190, fy + 22, 190, NAVY) + T(W - M - 95, fy + 232, "Scan to WhatsApp us", { size: 17, bold: true, fill: WHITE, anchor: "middle" });
  s += T(M, fy + 245, "Modelled susceptibility, not a flood-risk determination. Ground verification required.", { size: 17, fill: "#9db8d3" });
  return s;
}

export function buildPosterSvg(bundle: any, o: PosterOptions): string {
  const dim = o.format === "a2" ? { w: 4200, h: 5940 } : { w: 1080, h: 1350 };
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${dim.w}" height="${dim.h}" viewBox="0 0 ${dim.w} ${dim.h}" font-family="${FONT}">${defs}${o.format === "a2" ? a2(bundle, o) : social(bundle, o)}</svg>`;
}
export const posterSize = (f: PosterFormat) => (f === "a2" ? { w: 4200, h: 5940, mm: [420, 594] } : { w: 1080, h: 1350, mm: [0, 0] });
