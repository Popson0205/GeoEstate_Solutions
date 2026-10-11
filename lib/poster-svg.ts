// GeoAI poster builders: A2 print poster (4200 x 5940 units, 10 units = 1 mm) as one SVG string.
// Images (logo, zone raster) are passed in as data URIs so the SVG is self-contained and can be rasterised to JPEG.
import { COL, FONT, ZONE, esc, fmt, block, text1, textWidth, donut, legendRows, stackRows, rankBars, projector, geomPath, scaleBar, northArrow, marker, siteMarker, type Proj } from "./poster-kit";
import { posterContent, SOURCES, METHOD, DISCLAIMER, type PosterAnalysis, type RankRow } from "./poster-content";
import { qrPath, QR_SIZE } from "./qr-whatsapp";

export type PosterData = { analysis: PosterAnalysis; ranking: RankRow[]; map: any };
export type PosterAssets = { logo: string; zoneImg: string; lgaFc: any };
export const A2 = { w: 4200, h: 5940 };
export const SOCIAL = { w: 1080, h: 1350 };
export const CONTACT = { whatsapp: "+234 916 042 0100", email: "geoestate.ng@gmail.com", brand: "GeoEstate Spatial Intelligence" };

const up = (s: string) => s.toUpperCase();
const clipId = (p: string, n: string) => `${p}-${n.replace(/\W+/g, "")}`;

// The LGA flood-zone map: raster clipped to the LGA, roads, facility markers, candidate sites.
function lgaMap(d: PosterData, a: PosterAssets, fx: number, fy: number, fw: number, fh: number, u: number, o: { sites?: boolean; roads?: boolean; assets?: boolean; pad?: number; id: string }): { svg: string; p: Proj } {
  const m = d.map, p = projector(m.bbox, fx, fy, fw, fh, o.pad ?? 40), r = m.raster, cid = clipId("lga", o.id);
  const path = geomPath(m.geometry, p);
  const x0 = p.x(r.west), y0 = p.y(r.north), x1 = p.x(r.west + r.ncols * r.cellX), y1 = p.y(r.north - r.nrows * r.cellY);
  const out: string[] = [`<clipPath id="${cid}"><path d="${path}"/></clipPath>`, `<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="#eef3f1"/>`];
  out.push(`<g clip-path="url(#${cid})"><rect x="${p.left}" y="${p.top}" width="${p.w}" height="${p.h}" fill="#fff"/>`);
  out.push(`<image href="${a.zoneImg}" x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${(y1 - y0).toFixed(1)}" preserveAspectRatio="none"/>`);
  if (o.roads !== false) {
    const line = (k: number) => m.roads.filter((r2: any) => r2.k === k).map((r2: any) => "M" + r2.p.map(([x, y]: number[]) => `${p.x(x).toFixed(1)} ${p.y(y).toFixed(1)}`).join("L")).join("");
    out.push(`<path d="${line(2)}" fill="none" stroke="#6b7480" stroke-opacity="0.55" stroke-width="${1.2 * u}" stroke-dasharray="${5 * u} ${4 * u}"/>`);
    out.push(`<path d="${line(1)}" fill="none" stroke="#ffffff" stroke-opacity="0.9" stroke-width="${4.2 * u}" stroke-linejoin="round"/><path d="${line(1)}" fill="none" stroke="#4a5563" stroke-opacity="0.85" stroke-width="${2 * u}" stroke-linejoin="round"/>`);
    out.push(`<path d="${line(0)}" fill="none" stroke="#fff" stroke-width="${10 * u}" stroke-linejoin="round" stroke-linecap="round"/><path d="${line(0)}" fill="none" stroke="#1d2530" stroke-width="${5.4 * u}" stroke-linejoin="round" stroke-linecap="round"/>`);
  }
  out.push("</g>", `<path d="${path}" fill="none" stroke="${COL.navy}" stroke-width="${5 * u}" stroke-linejoin="round"/>`);
  const ms = Math.max(0.55, Math.min(1, Math.sqrt(45 / Math.max(1, m.assets.length))));
  if (o.assets !== false) for (const t of [2, 0, 1]) for (const as of m.assets) if (as.t === t) out.push(marker(as.t, p.x(as.lon), p.y(as.lat), 7.5 * u * ms, as.z));
  if (o.sites !== false) d.analysis.safeSites.forEach((s, i) => out.push(siteMarker(p.x(s.lon), p.y(s.lat), 17 * u, i + 1)));
  return { svg: out.join(""), p };
}

function sectionHead(x: number, y: number, w: number, n: number | string, title: string, size = 74): { svg: string; h: number } {
  return { svg: `<circle cx="${x + size * 0.55}" cy="${y + size * 0.55}" r="${size * 0.55}" fill="${COL.green}"/>${text1(x + size * 0.55, y + size * 0.1, String(n), size * 0.7, "#fff", true, "middle")}${text1(x + size * 1.4, y + size * 0.1, title, size * 0.86, COL.navy, true)}<rect x="${x}" y="${y + size * 1.28}" width="${w}" height="6" fill="${COL.green}"/>`, h: size * 1.28 + 40 };
}

function qrBlock(x: number, y: number, size: number): string {
  const q = 4, unit = size / (QR_SIZE + 2 * q);
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.04}" fill="#fff"/><path transform="translate(${x + q * unit} ${y + q * unit})" d="${qrPath(unit)}" fill="${COL.navy}"/>`;
}

function locator(fc: any, name: string, x: number, y: number, w: number, h: number): string {
  const feats: any[] = fc?.features || []; if (!feats.length) return "";
  let W = 180, S = 90, E = -180, N = -90;
  const scan = (c: any) => { if (typeof c[0] === "number") { W = Math.min(W, c[0]); E = Math.max(E, c[0]); S = Math.min(S, c[1]); N = Math.max(N, c[1]); } else c.forEach(scan); };
  feats.forEach(f => scan(f.geometry.coordinates));
  const p = projector([W, S, E, N], x, y, w, h, 6); let sel = "", rest = "";
  for (const f of feats) { const dd = geomPath(f.geometry, p); if (f.properties?.name === name) sel = dd; else rest += dd; }
  return `<path d="${rest}" fill="#dfe8e3" stroke="#fff" stroke-width="3"/><path d="${sel}" fill="${COL.green}" stroke="${COL.navy}" stroke-width="5"/>`;
}

export function buildA2Svg(d: PosterData, a: PosterAssets): string {
  const { w: W, h: H } = A2, M = 140, GAP = 90, colW = (W - 2 * M - 2 * GAP) / 3, X = [M, M + colW + GAP, M + 2 * (colW + GAP)];
  const an = d.analysis, fl = an.flood, as = an.assets, rd = an.roads;
  const C = posterContent(an, d.ranking), o: string[] = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>`);

  /* header */
  o.push(`<rect width="${W}" height="600" fill="${COL.navy}"/><rect y="600" width="${W}" height="16" fill="${COL.green}"/>`);
  o.push(text1(M, 46, "FLOOD SUSCEPTIBILITY & INFRASTRUCTURE EXPOSURE  |  OSUN STATE, NIGERIA", 52, "#9fe0a8", true));
  const titleMax = W - 2 * M - 640, tsz = Math.min(250, titleMax / (textWidth(up(an.name), 1, true)));
  o.push(text1(M, 108, up(an.name), tsz, "#fff", true));
  o.push(text1(M, 108 + tsz * 1.04, "LOCAL GOVERNMENT AREA  ·  GeoAI BRIEFING POSTER", 56, "#cfe3ff", false));
  const sub = block({ x: M, y: 108 + tsz * 1.04 + 98, w: titleMax, text: `${C.headline} ${C.tagline}`, size: 62, lh: 80, color: "#fff", bold: true, maxLines: 2 }); o.push(sub.svg);
  o.push(`<rect x="${W - M - 520}" y="40" width="520" height="520" rx="42" fill="#fff"/><image href="${a.logo}" x="${W - M - 495}" y="58" width="470" height="484" preserveAspectRatio="xMidYMid meet"/>`);

  /* stat cards */
  const cw = (W - 2 * M - 3 * 60) / 4, sy = 672, sh = 250;
  const cards: [string, string, string][] = [
    [`${fmt(an.areaKm2, 0)} km²`, "Study area", COL.navy],
    [`${fmt(fl.exposedPct)}%`, "of the LGA in High-susceptibility zones", COL.high],
    [`${as.health.high} / ${as.health.total}`, "health facilities in High zones", COL.high],
    [`#${an.rank.position} of ${an.rank.of}`, "exposure rank (1 = most exposed)", COL.navy],
  ];
  cards.forEach(([v, l, c], i) => { const x = M + i * (cw + 60); o.push(`<rect x="${x}" y="${sy}" width="${cw}" height="${sh}" rx="34" fill="${COL.panel}" stroke="${COL.line}" stroke-width="5"/><rect x="${x}" y="${sy}" width="20" height="${sh}" rx="10" fill="${c}"/>`, text1(x + 70, sy + 22, v, 130, c, true), block({ x: x + 70, y: sy + 172, w: cw - 110, text: l, size: 42, lh: 50, color: COL.muted }).svg); });

  const top = 990; let sn = 0; const nx = () => ++sn; const ends: number[] = [];
  /* ---- column 1: background, study area, data & method ---- */
  { let y = top; const x = X[0];
    let s = sectionHead(x, y, colW, nx(), "Background & aim"); o.push(s.svg); y += s.h + 24;
    const intro = block({ x, y, w: colW, text: C.intro, size: 50, lh: 72 }); o.push(intro.svg); y += intro.h + 70;
    s = sectionHead(x, y, colW, nx(), "Study area"); o.push(s.svg); y += s.h + 24;
    const lw = 520, lh = 560; o.push(`<rect x="${x}" y="${y}" width="${lw}" height="${lh}" rx="26" fill="${COL.panel}" stroke="${COL.line}" stroke-width="4"/>` + locator(a.lgaFc, an.name, x + 20, y + 20, lw - 40, lh - 90) + text1(x + lw / 2, y + lh - 66, `${an.name} in Osun State`, 40, COL.navy, true, "middle"));
    const facts: [string, string][] = [["Area", `${fmt(an.areaKm2, 0)} km²`], ["Mean slope", `${fmt(an.terrain.meanSlopeDeg)}°`], ["Flat (< 2°)", `${fmt(an.terrain.flatPct)}%`], ["Steep (≥ 10°)", `${fmt(an.terrain.steepPct)}%`], ["Roads", `${fmt(rd.totalKm, 0)} km`], ["Major roads", `${fmt(rd.majorKm, 0)} km`]];
    facts.forEach(([k, v], i) => { const yy = y + i * 94, fx = x + lw + 50, fw = colW - lw - 50; o.push(`<rect x="${fx}" y="${yy}" width="${fw}" height="84" rx="18" fill="${i % 2 ? "#fff" : COL.panel}"/>`, text1(fx + 24, yy + 22, k, 44, COL.muted), text1(fx + fw - 24, yy + 20, v, 50, COL.navy, true, "end")); });
    y += lh + 70;
    s = sectionHead(x, y, colW, nx(), "Data & method"); o.push(s.svg); y += s.h + 20;
    for (const [k, v] of SOURCES) { o.push(text1(x, y, k, 40, COL.green, true)); const b = block({ x, y: y + 48, w: colW, text: v, size: 38, lh: 48, color: COL.ink }); o.push(b.svg); y += 48 + b.h + 20; }
    y += 14; METHOD.forEach(([k, v], i) => { o.push(`<rect x="${x}" y="${y}" width="${colW}" height="10" fill="none"/><circle cx="${x + 40}" cy="${y + 40}" r="40" fill="${COL.navy}"/>${text1(x + 40, y + 4, String(i + 1), 46, "#fff", true, "middle")}${text1(x + 110, y + 4, k, 46, COL.navy, true)}`); const b = block({ x: x + 110, y: y + 58, w: colW - 110, text: v, size: 38, lh: 48 }); o.push(b.svg); y += 58 + b.h + 28; });
    ends.push(y); }

  /* ---- column 2: results map, pie, candidate sites ---- */
  { let y = top; const x = X[1];
    let s = sectionHead(x, y, colW, nx(), "Flood-susceptibility zones"); o.push(s.svg); y += s.h + 24;
    const mh = 1180; const mp = lgaMap(d, a, x, y, colW, mh, 2.1, { id: "a2", pad: 30 }); o.push(mp.svg);
    o.push(`<rect x="${x}" y="${y}" width="${colW}" height="${mh}" fill="none" stroke="${COL.line}" stroke-width="5"/>`, northArrow(x + colW - 90, y + 40, 80), scaleBar(x + 40, y + mh - 80, mp.p.kmPerUnit, 36));
    y += mh + 28;
    // legend strip
    const lg = [[ZONE.high, "High"], [ZONE.mod, "Moderate"], [ZONE.low, "Low"], [ZONE.water, "Stream / water"]];
    let lx = x; lg.forEach(([c, l]) => { o.push(`<rect x="${lx}" y="${y}" width="40" height="40" rx="8" fill="${c}"/>${text1(lx + 54, y + 2, l, 38)}`); lx += 54 + textWidth(l, 38) + 36; });
    y += 70; let mx = x;
    const ml: [string, string][] = [["sq", `School (${as.schools.total})`], ["hc", `Health (${as.health.total})`], ["mk", `Market (${as.markets.total})`]];
    ml.forEach(([k, l], i) => { o.push(marker(i === 0 ? 0 : i === 1 ? 1 : 2, mx + 22, y + 22, 17, 0), text1(mx + 56, y + 2, l, 38)); mx += 56 + textWidth(l, 38) + 36; });
    y += 62; o.push(siteMarker(x + 22, y + 22, 24, 1), text1(x + 62, y + 2, "Candidate safer site", 38), `<circle cx="${x + 62 + textWidth("Candidate safer site", 38) + 66}" cy="${y + 22}" r="26" fill="none" stroke="${COL.high}" stroke-width="7"/>`, text1(x + 62 + textWidth("Candidate safer site", 38) + 106, y + 2, "Facility in High zone", 38));
    y += 100;
    // pie
    s = sectionHead(x, y, colW, nx(), "Share of LGA area by zone"); o.push(s.svg); y += s.h + 30;
    const R = 270, cx0 = x + R + 10, cy0 = y + R + 10, lowKm = (an.areaKm2 * fl.lowPct) / 100;
    o.push(donut(cx0, cy0, R, R * 0.58, [{ label: "High", value: fl.exposedPct, color: ZONE.high }, { label: "Moderate", value: fl.moderatePct, color: ZONE.mod }, { label: "Low", value: fl.lowPct, color: ZONE.low }], `${fmt(fl.exposedPct)}%`, "High", 92));
    const lgd = legendRows(x + 2 * R + 80, cy0 - 170, colW - 2 * R - 80, [{ color: ZONE.high, label: "High", value: `${fmt(fl.exposedPct)}%` }, { color: ZONE.mod, label: "Moderate", value: `${fmt(fl.moderatePct)}%` }, { color: ZONE.low, label: "Low", value: `${fmt(fl.lowPct)}%` }], 46, 100); o.push(lgd.svg);
    o.push(block({ x: x + 2 * R + 80, y: cy0 + 150, w: colW - 2 * R - 80, text: `${fmt(fl.exposedKm2)} km² High, ${fmt(fl.moderateKm2)} km² Moderate, ${fmt(lowKm)} km² Low. High includes ${fmt(fl.streamPct + fl.waterPct)}% modelled streams and water.`, size: 36, lh: 48, color: COL.muted }).svg);
    y = cy0 + R + 70;
    s = sectionHead(x, y, colW, nx(), "Candidate safer sites"); o.push(s.svg); y += s.h + 14;
    if (!an.safeSites.length) o.push(block({ x, y, w: colW, text: "No Low-susceptibility block met the slope and road-access criteria. Detailed site investigation is advised.", size: 40, lh: 54, color: COL.muted }).svg), (y += 120);
    else {
      o.push(text1(x + 90, y, "Location (lat, lon)", 34, COL.muted, true), text1(x + colW - 560, y, "Slope", 34, COL.muted, true, "end"), text1(x + colW - 330, y, "Road", 34, COL.muted, true, "end"), text1(x + colW, y, "Health", 34, COL.muted, true, "end")); y += 52;
      an.safeSites.slice(0, 5).forEach((st, i) => { o.push(`<rect x="${x}" y="${y}" width="${colW}" height="66" rx="14" fill="${i % 2 ? "#fff" : COL.panel}"/>`, siteMarker(x + 38, y + 33, 24, i + 1), text1(x + 90, y + 14, `${st.lat.toFixed(4)}, ${st.lon.toFixed(4)}`, 38, COL.ink), text1(x + colW - 560, y + 14, `${fmt(st.meanSlopeDeg)}°`, 38, COL.navy, true, "end"), text1(x + colW - 330, y + 14, `${fmt(st.nearestRoadKm)} km`, 38, COL.navy, true, "end"), text1(x + colW - 10, y + 14, `${fmt(st.nearestHealthKm)} km`, 38, COL.navy, true, "end")); y += 72; });
      y += 8; o.push(text1(x, y, "Indicative screening only; confirm on the ground.", 32, COL.muted, false)); y += 50;
    }
    ends.push(y); }

  /* ---- column 3: charts ---- */
  { let y = top; const x = X[2];
    let s = sectionHead(x, y, colW, nx(), "Infrastructure by flood zone"); o.push(s.svg); y += s.h + 10;
    const zr = (t: { total: number; high: number; moderate: number }) => [{ v: t.total - t.high - t.moderate, color: ZONE.low }, { v: t.moderate, color: ZONE.mod }, { v: t.high, color: ZONE.high }];
    const rows = [{ label: "Schools", sub: `${as.schools.total} on record`, parts: zr(as.schools), empty: "0 on record" }, { label: "Health", sub: `${as.health.total} on record`, parts: zr(as.health), empty: "0 on record" }, { label: "Markets", sub: `${as.markets.total} on record`, parts: zr(as.markets), empty: "0 on record" }];
    const st = stackRows(x, y + 10, colW, rows, { labelW: 280, barH: 84, gap: 46, size: 42 }); o.push(st.svg); y += st.h + 14;
    let lx = x; [[ZONE.low, "Low"], [ZONE.mod, "Moderate"], [ZONE.high, "High"]].forEach(([c, l]) => { o.push(`<rect x="${lx}" y="${y}" width="38" height="38" rx="8" fill="${c}"/>${text1(lx + 52, y + 1, l, 38)}`); lx += 52 + textWidth(l, 38) + 40; });
    o.push(text1(x + colW, y + 1, "share of facilities on record", 34, COL.muted, false, "end")); y += 96;
    s = sectionHead(x, y, colW, nx(), "Road network exposure"); o.push(s.svg); y += s.h + 10;
    const rr = stackRows(x, y + 10, colW, [{ label: "All roads", sub: `${fmt(rd.totalKm, 0)} km`, parts: [{ v: rd.totalKm - rd.exposedKm, color: ZONE.low }, { v: rd.exposedKm, color: ZONE.high }], right: `${fmt(rd.exposedKm)} km in High zones` }, { label: "Major roads", sub: `${fmt(rd.majorKm, 0)} km`, parts: [{ v: rd.majorKm - rd.majorExposedKm, color: ZONE.low }, { v: rd.majorExposedKm, color: ZONE.high }], right: `${fmt(rd.majorExposedKm)} km in High zones` }], { labelW: 280, barH: 84, gap: 58, size: 42 });
    o.push(rr.svg); y += rr.h + 36;
    s = sectionHead(x, y, colW, nx(), "Terrain composition"); o.push(s.svg); y += s.h + 10;
    const gentle = Math.max(0, 100 - an.terrain.flatPct - an.terrain.steepPct);
    const tr = stackRows(x, y + 10, colW, [{ label: "Slope", sub: `mean ${fmt(an.terrain.meanSlopeDeg)}°`, parts: [{ v: an.terrain.flatPct, color: "#7fb7d9" }, { v: gentle, color: "#4a8db8" }, { v: an.terrain.steepPct, color: "#1c4f7a" }], right: "flat < 2°  ·  gentle 2–10°  ·  steep ≥ 10°" }], { labelW: 280, barH: 84, gap: 58, size: 42 });
    o.push(tr.svg); y += tr.h + 44;
    s = sectionHead(x, y, colW, nx(), "Exposure rank across Osun"); o.push(s.svg); y += s.h + 10;
    o.push(text1(x, y, "Exposure index: 40% area, 40% facilities, 20% roads in High zones", 33, COL.muted)); y += 50;
    const rk = rankBars(x, y, colW, d.ranking.map(r => ({ label: r.name, value: r.exposureIndex, hi: r.name === an.name })), { rowH: 42, size: 33, labelW: 330, color: "#c9d6cf", hiColor: COL.navy }); o.push(rk.svg); y += rk.h + 20;
    ends.push(y); }

  const bodyEnd = Math.max(...ends);
  /* ---- bottom band: conclusions, recommendations, call to action ---- */
  const fy0 = H - 300, by = bodyEnd + 60, ph = fy0 - 40 - by; const wC = 1330, wR = 1330, wA = W - 2 * M - wC - wR - 2 * 60; const bx = [M, M + wC + 60, M + wC + wR + 120];
  // Largest body size (50 down to 38) at which both panels fit their box.
  const need = (items: string[], w: number, size: number) => 44 + 74 * 1.28 + 40 + 24 + items.reduce((t, it) => t + block({ x: 0, y: 0, w: w - 135 - 55, text: it, size, lh: Math.round(size * 1.38) }).h + 34, 0) + 30;
  const recItems = C.recs.slice(0, 5); let psize = 50; while (psize > 38 && Math.max(need(C.conclusions, wC, psize), need(recItems, wR, psize)) > ph) psize -= 2;
  const panel = (x: number, w: number, n: number, title: string, items: string[], numbered: boolean, size = psize) => {
    o.push(`<rect x="${x}" y="${by}" width="${w}" height="${ph}" rx="40" fill="${COL.panel}" stroke="${COL.line}" stroke-width="5"/>`);
    const s2 = sectionHead(x + 50, by + 44, w - 100, n, title); o.push(s2.svg); let y = by + 44 + s2.h + 24;
    items.forEach((t, i) => { o.push(numbered ? `<circle cx="${x + 80}" cy="${y + 28}" r="28" fill="${COL.green}"/>${text1(x + 80, y + 4, String(i + 1), 34, "#fff", true, "middle")}` : `<circle cx="${x + 80}" cy="${y + 28}" r="12" fill="${COL.green}"/>`); const b = block({ x: x + 135, y, w: w - 135 - 55, text: t, size, lh: Math.round(size * 1.38) }); o.push(b.svg); y += b.h + 34; });
    return y;
  };
  const e1 = panel(bx[0], wC, nx(), "Conclusions", C.conclusions, false), e2 = panel(bx[1], wR, nx(), "Recommendations", recItems, true);
  if (Math.max(e1, e2) > by + ph - 20) console.warn(`[poster] bottom panels overflow: ${Math.round(Math.max(e1, e2) - by)} > ${ph}`);
  // call to action
  { const x = bx[2], w = wA; o.push(`<rect x="${x}" y="${by}" width="${w}" height="${ph}" rx="40" fill="${COL.navy}"/>`);
    const h1 = block({ x: x + 60, y: by + 70, w: w - 120, text: "Know before you buy.", size: 92, lh: 104, color: "#fff", bold: true }); o.push(h1.svg); let y = by + 70 + h1.h + 24;
    const p = block({ x: x + 60, y, w: w - 120, text: "GeoEstate LandCheck screens any plot in Osun for flood susceptibility, slope, land cover and nearby services in seconds.", size: 46, lh: 66, color: "#dbe8ff" }); o.push(p.svg); y += p.h + 40;
    for (const t of ["Field mapping of schools, clinics, markets and drainage", "Flood and terrain analysis for LGAs and estates", "Plot due diligence before you pay"]) { o.push(`<circle cx="${x + 78}" cy="${y + 26}" r="13" fill="#7ad084"/>`); const b = block({ x: x + 115, y, w: w - 175, text: t, size: 44, lh: 60, color: "#fff" }); o.push(b.svg); y += b.h + 22; }
    const qs = 380, qy = by + ph - qs - 120, tx = x + 60 + qs + 50, tw = w - 60 - qs - 50 - 50; o.push(qrBlock(x + 60, qy, qs));
    o.push(text1(tx, qy + 4, "Scan to chat on WhatsApp", 36, "#9fe0a8", true), text1(tx, qy + 66, CONTACT.whatsapp, 50, "#fff", true), text1(tx, qy + 190, "Email", 36, "#9fe0a8", true), block({ x: tx, y: qy + 244, w: tw, text: CONTACT.email, size: 38, lh: 48, color: "#fff", bold: true }).svg);
    o.push(text1(x + w / 2, by + ph - 74, CONTACT.brand, 40, "#9fe0a8", true, "middle")); }

  /* footer */
  const fy = fy0; o.push(`<rect y="${fy}" width="${W}" height="${H - fy}" fill="${COL.navy}"/>`);
  o.push(block({ x: M, y: fy + 40, w: 2700, text: DISCLAIMER, size: 34, lh: 48, color: "#cfe0ff" }).svg);
  o.push(text1(W - M, fy + 44, `${CONTACT.brand}  ·  ${CONTACT.email}`, 40, "#fff", true, "end"), text1(W - M, fy + 108, `WhatsApp ${CONTACT.whatsapp}   ·   Generated ${an.generatedAt}`, 36, "#9fe0a8", false, "end"));
  o.push("</svg>"); return o.join("");
}

export function buildSocialSvg(d: PosterData, a: PosterAssets): string {
  const { w: W, h: H } = SOCIAL, M = 36, an = d.analysis, fl = an.flood, as = an.assets, C = posterContent(an, d.ranking), o: string[] = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>`);
  /* top band: logo + eyebrow */
  o.push(`<rect width="${W}" height="150" fill="${COL.navy}"/><rect y="150" width="${W}" height="8" fill="${COL.green}"/>`);
  o.push(`<rect x="${M}" y="16" width="120" height="120" rx="20" fill="#fff"/><image href="${a.logo}" x="${M + 6}" y="22" width="108" height="108" preserveAspectRatio="xMidYMid meet"/>`);
  o.push(text1(M + 150, 26, "OSUN STATE  ·  FLOOD SUSCEPTIBILITY", 30, "#9fe0a8", true), text1(M + 150, 70, "GeoAI Briefing", 40, "#fff", true), text1(M + 150, 118, "Infrastructure exposure by LGA", 26, "#cfe3ff"));
  /* title */
  const tsz = Math.min(104, (W - 2 * M) / textWidth(up(an.name), 1, true));
  o.push(text1(M, 168, up(an.name), tsz, COL.navy, true), text1(M, 168 + tsz * 1.0, "LOCAL GOVERNMENT AREA", 24, COL.muted, true));
  const hy = 168 + tsz + 46, hsz = Math.max(30, Math.min(40, (W - 2 * M) / textWidth(C.headline, 1, true)));
  o.push(text1(M, hy, C.headline, hsz, COL.ink, true), text1(M, hy + hsz * 1.3, C.tagline, 30, COL.green, true));
  /* map */
  const my = hy + hsz * 1.3 + 54, mh = 400; const mp = lgaMap(d, a, M, my, W - 2 * M, mh, 1.45, { id: "so", pad: 14 });
  o.push(mp.svg, `<rect x="${M}" y="${my}" width="${W - 2 * M}" height="${mh}" fill="none" stroke="${COL.line}" stroke-width="3"/>`, northArrow(W - M - 34, my + 14, 40), scaleBar(M + 16, my + mh - 40, mp.p.kmPerUnit, 20));
  let lx = M + 10; const ly = my + 12;
  o.push(`<rect x="${M + 6}" y="${ly - 4}" width="262" height="112" rx="10" fill="#fff" fill-opacity="0.9"/>`);
  [[ZONE.high, "High"], [ZONE.mod, "Moderate"], [ZONE.low, "Low"]].forEach(([c, l], i) => o.push(`<rect x="${lx}" y="${ly + i * 34}" width="24" height="24" rx="5" fill="${c}"/>${text1(lx + 36, ly + i * 34 + 1, l + " susceptibility", 22)}`));
  /* stat cards */
  const sy = my + mh + 14, sw = (W - 2 * M - 2 * 18) / 3, sh = 112;
  const cards: [string, string, string][] = [[`${fmt(fl.exposedPct)}%`, "of the LGA in High zones", COL.high], [`${as.health.high} / ${as.health.total}`, "health facilities in High zones", COL.high], [`#${an.rank.position} of ${an.rank.of}`, "exposure rank (1 = highest)", COL.navy]];
  cards.forEach(([v, l, c], i) => { const x = M + i * (sw + 18); o.push(`<rect x="${x}" y="${sy}" width="${sw}" height="${sh}" rx="18" fill="${COL.panel}" stroke="${COL.line}" stroke-width="3"/><rect x="${x}" y="${sy}" width="10" height="${sh}" rx="5" fill="${c}"/>`, text1(x + 28, sy + 8, v, 52, c, true), block({ x: x + 28, y: sy + 66, w: sw - 40, text: l, size: 21, lh: 25, color: COL.muted }).svg); });
  /* charts row: donut + facilities bars */
  const cy = sy + sh + 16, R = 76;
  o.push(donut(M + R + 6, cy + R + 10, R, R * 0.58, [{ label: "High", value: fl.exposedPct, color: ZONE.high }, { label: "Moderate", value: fl.moderatePct, color: ZONE.mod }, { label: "Low", value: fl.lowPct, color: ZONE.low }], `${fmt(fl.exposedPct, 0)}%`, "High", 38));
  const lg = legendRows(M + 2 * R + 34, cy + 14, 250, [{ color: ZONE.high, label: "High", value: `${fmt(fl.exposedPct)}%` }, { color: ZONE.mod, label: "Moderate", value: `${fmt(fl.moderatePct)}%` }, { color: ZONE.low, label: "Low", value: `${fmt(fl.lowPct)}%` }], 24, 40); o.push(lg.svg);
  o.push(text1(M + 2 * R + 34, cy + 138, "Share of LGA area by zone", 20, COL.muted));
  const bx = M + 2 * R + 34 + 250 + 30, bw = W - M - bx;
  const zr = (t: { total: number; high: number; moderate: number }) => [{ v: t.total - t.high - t.moderate, color: ZONE.low }, { v: t.moderate, color: ZONE.mod }, { v: t.high, color: ZONE.high }];
  o.push(text1(bx, cy - 2, "Facilities by flood zone", 24, COL.navy, true));
  const sr = stackRows(bx, cy + 34, bw, [{ label: "Schools", parts: zr(as.schools), empty: "0 on record" }, { label: "Health", parts: zr(as.health), empty: "0 on record" }, { label: "Markets", parts: zr(as.markets), empty: "0 on record" }], { labelW: 108, barH: 34, gap: 12, size: 22 }); o.push(sr.svg);
  /* footer CTA */
  const fy = H - 160; o.push(`<rect y="${fy}" width="${W}" height="160" fill="${COL.navy}"/>`, qrBlock(W - M - 128, fy + 16, 128));
  o.push(text1(M, fy + 14, "Know before you buy.", 44, "#fff", true), text1(M, fy + 70, "WhatsApp " + CONTACT.whatsapp, 30, "#9fe0a8", true), text1(M, fy + 110, CONTACT.email, 26, "#fff", true), text1(W - M - 144, fy + 62, "Scan to chat", 20, "#cfe3ff", false, "end"), text1(W - M - 144, fy + 88, "on WhatsApp", 20, "#cfe3ff", false, "end"));
  o.push("</svg>"); return o.join("");
}
