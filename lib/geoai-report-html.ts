// Printable briefing report for a GeoAI area analysis (client-safe: no Node imports).
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const TYPE: Record<string, string> = { school: "School", health: "Health facility", market: "Market" };

function narrativeHtml(text: string) {
  const out: string[] = []; let list: string[] = [];
  const flush = () => { if (list.length) { out.push(`<ul>${list.map(i => `<li>${esc(i)}</li>`).join("")}</ul>`); list = []; } };
  for (const line of text.split(/\n+/).map(l => l.trim()).filter(Boolean)) {
    if (/^[-•*]\s+/.test(line)) list.push(line.replace(/^[-•*]\s+/, "")); else { flush(); out.push(`<p>${esc(line)}</p>`); }
  }
  flush(); return out.join("");
}

// ---- Charts: dependency-free inline SVG (prints and saves to PDF cleanly) ----
const C_HIGH = "#c0392b", C_MOD = "#e69f00", C_SAFE = "#2e8b57", C_INK = "#17231d", C_MUTED = "#5b6b62", C_GRID = "#d7e2db";
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

type Slice = { label: string; value: number; color: string; display?: string };

// Pie / donut chart with a legend that carries the numbers (so colour is never the only cue).
function donutChart(title: string, slices: Slice[], centre: string, centreSub = ""): string {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (total <= 0) return `<figure class="chart"><figcaption>${esc(title)}</figcaption><p class="note">No data for this chart.</p></figure>`;
  const R = 52, CIRC = 2 * Math.PI * R;
  let offset = 0;
  const arcs = slices.filter(s => s.value > 0).map(s => {
    const len = (s.value / total) * CIRC;
    const el = `<circle cx="80" cy="80" r="${R}" fill="none" stroke="${s.color}" stroke-width="30" stroke-dasharray="${len.toFixed(2)} ${(CIRC - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 80 80)"/>`;
    offset += len; return el;
  }).join("");
  const legend = slices.map(s => `<li><i style="background:${s.color}"></i><span>${esc(s.label)}</span><b>${esc(s.display ?? `${fmt((s.value / total) * 100)}%`)}</b></li>`).join("");
  return `<figure class="chart"><figcaption>${esc(title)}</figcaption><div class="donut">
<svg viewBox="0 0 160 160" role="img" aria-label="${esc(title)}"><circle cx="80" cy="80" r="${R}" fill="none" stroke="${C_GRID}" stroke-width="30"/>${arcs}
<text x="80" y="${centreSub ? 79 : 85}" text-anchor="middle" font-size="19" font-weight="700" fill="${C_INK}">${esc(centre)}</text>${centreSub ? `<text x="80" y="95" text-anchor="middle" font-size="9" fill="${C_MUTED}">${esc(centreSub)}</text>` : ""}</svg>
<ul class="legend">${legend}</ul></div></figure>`;
}

// Grouped vertical bar chart: one group per category, one bar per series.
function groupedBarChart(title: string, cats: string[], series: { label: string; color: string; values: number[] }[], yLabel: string): string {
  const max = Math.max(1, ...series.flatMap(s => s.values.map(num)));
  if (!cats.length || series.every(s => s.values.every(v => num(v) === 0))) return `<figure class="chart"><figcaption>${esc(title)}</figcaption><p class="note">No mapped facilities in this area.</p></figure>`;
  const W = 520, H = 230, L = 44, B = 36, T = 14, Rt = 10, pw = W - L - Rt, ph = H - T - B;
  const step = Math.pow(10, Math.floor(Math.log10(max))), nice = [1, 2, 5, 10].map(m => m * step).find(s => max / s <= 5) || step * 10;
  const top = Math.ceil(max / nice) * nice;
  let grid = "";
  for (let v = 0; v <= top; v += nice) { const y = T + ph - (v / top) * ph; grid += `<line x1="${L}" x2="${W - Rt}" y1="${y}" y2="${y}" stroke="${C_GRID}"/><text x="${L - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="${C_MUTED}">${v}</text>`; }
  const gw = pw / cats.length, bw = Math.min(34, (gw * 0.72) / series.length);
  const bars = cats.map((c, ci) => {
    const gx = L + ci * gw + (gw - bw * series.length) / 2;
    const b = series.map((s, si) => {
      const v = num(s.values[ci]), h = (v / top) * ph, x = gx + si * bw, y = T + ph - h;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${s.color}"/><text x="${(x + (bw - 3) / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="600" fill="${C_INK}">${v}</text>`;
    }).join("");
    return `${b}<text x="${(L + ci * gw + gw / 2).toFixed(1)}" y="${H - 14}" text-anchor="middle" font-size="11" fill="${C_INK}">${esc(c)}</text>`;
  }).join("");
  const legend = series.map(s => `<li><i style="background:${s.color}"></i><span>${esc(s.label)}</span></li>`).join("");
  return `<figure class="chart wide"><figcaption>${esc(title)}</figcaption>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${grid}<text x="12" y="${T + ph / 2}" transform="rotate(-90 12 ${T + ph / 2})" text-anchor="middle" font-size="10" fill="${C_MUTED}">${esc(yLabel)}</text>${bars}</svg>
<ul class="legend row">${legend}</ul></figure>`;
}

// Horizontal bar chart (used for the LGA ranking); the analysed LGA is highlighted.
function hBarChart(title: string, rows: { label: string; value: number; highlight?: boolean }[], unit: string): string {
  if (!rows.length) return "";
  const max = Math.max(1, ...rows.map(r => num(r.value))), W = 520, rowH = 24, L = 120, Rt = 56, H = rows.length * rowH + 8, pw = W - L - Rt;
  const bars = rows.map((r, i) => {
    const y = 4 + i * rowH, w = (num(r.value) / max) * pw;
    return `<text x="${L - 8}" y="${y + 15}" text-anchor="end" font-size="11" ${r.highlight ? 'font-weight="700"' : ""} fill="${C_INK}">${esc(r.label.length > 18 ? r.label.slice(0, 17) + "…" : r.label)}</text>
<rect x="${L}" y="${y + 3}" width="${Math.max(w, 1).toFixed(1)}" height="${rowH - 8}" rx="2" fill="${r.highlight ? C_HIGH : "#7f9a8b"}"/>
<text x="${(L + w + 5).toFixed(1)}" y="${y + 15}" font-size="11" font-weight="600" fill="${C_INK}">${fmt(num(r.value))}${esc(unit)}</text>`;
  }).join("");
  return `<figure class="chart wide"><figcaption>${esc(title)}</figcaption><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${bars}</svg></figure>`;
}

export function buildGeoAiReportHtml(a: any, ranking?: any[] | null): string {
  const date =new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const f = a.flood, t = a.terrain, as = a.assets, r = a.roads;
  const kpi = (l: string, v: string, s = "") => `<div class="m"><span>${l}</span><strong>${esc(v)}</strong>${s ? `<em>${esc(s)}</em>` : ""}</div>`;
  const assetRow = (label: string, x: any) => `<tr><td>${label}</td><td class="n">${x.total}</td><td class="n">${x.high}</td><td class="n">${x.moderate}</td></tr>`;
  const lowKm2 = Math.max(0, num(a.areaKm2) - num(f.exposedKm2) - num(f.moderateKm2));
  const areaDonut = donutChart("Share of area by flood-susceptibility zone", [
    { label: "High", value: num(f.exposedPct), color: C_HIGH, display: `${fmt(num(f.exposedPct))}% · ${fmt(num(f.exposedKm2))} km²` },
    { label: "Moderate", value: num(f.moderatePct), color: C_MOD, display: `${fmt(num(f.moderatePct))}% · ${fmt(num(f.moderateKm2))} km²` },
    { label: "Low / outside", value: Math.max(0, 100 - num(f.exposedPct) - num(f.moderatePct)), color: C_SAFE, display: `${fmt(Math.max(0, 100 - num(f.exposedPct) - num(f.moderatePct)))}% · ${fmt(lowKm2)} km²` },
  ], `${fmt(num(f.exposedPct))}%`, "in High zones");
  const roadOut = Math.max(0, num(r.totalKm) - num(r.exposedKm));
  const roadPct = num(r.totalKm) ? (num(r.exposedKm) / num(r.totalKm)) * 100 : 0;
  const roadDonut = donutChart("Mapped road length by zone", [
    { label: "In High zones", value: num(r.exposedKm), color: C_HIGH, display: `${fmt(num(r.exposedKm))} km` },
    { label: "Elsewhere", value: roadOut, color: C_SAFE, display: `${fmt(roadOut)} km` },
  ], `${fmt(roadPct)}%`, "in High zones");
  const facKinds: [string, any][] = [["Schools", as.schools], ["Health facilities", as.health], ["Markets", as.markets]];
  const facBar = groupedBarChart("Facilities by flood-susceptibility zone", facKinds.map(k => k[0]), [
    { label: "High zone", color: C_HIGH, values: facKinds.map(k => num(k[1].high)) },
    { label: "Moderate zone", color: C_MOD, values: facKinds.map(k => num(k[1].moderate)) },
    { label: "Low / outside", color: C_SAFE, values: facKinds.map(k => Math.max(0, num(k[1].total) - num(k[1].high) - num(k[1].moderate))) },
  ], "Facilities");
  const exposed = [...(a.exposedAssets?.high ?? [])].slice(0, 60);
  const exRows = exposed.length
    ? exposed.map((x: any) => `<tr><td>${esc(x.name)}</td><td>${TYPE[x.type] || esc(x.type)}</td><td>${esc(x.level)}</td><td>${esc(x.lga)}</td><td class="n">${x.lat.toFixed(4)}, ${x.lon.toFixed(4)}</td></tr>`).join("")
    : `<tr><td colspan="5">No mapped facilities in High susceptibility zones.</td></tr>`;
  const more = (a.exposedAssets?.highCount ?? 0) > exposed.length ? `<p class="note">Showing ${exposed.length} of ${a.exposedAssets.highCount}. Use the CSV export in the app for the full list.</p>` : "";
  const sites = (a.safeSites ?? []).length
    ? a.safeSites.map((s: any) => `<tr><td>${esc(s.name)}</td><td class="n">${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}</td><td class="n">${s.meanSlopeDeg}°</td><td class="n">${s.nearestRoadKm} km</td><td class="n">${s.nearestMarketKm ?? "n/a"}</td><td class="n">${s.nearestHealthKm ?? "n/a"}</td></tr>`).join("")
    : `<tr><td colspan="6">No block of land met all criteria (fully outside flood-susceptible ground, under 5° slope, within 1 km of a road).</td></tr>`;
  let rank = "";
  if (ranking?.length) {
    const top = ranking.slice(0, 10).map(x => `<tr${x.name === a.name ? ' class="me"' : ""}><td class="n">${x.rank}</td><td>${esc(x.name)}</td><td class="n">${x.exposedPct}%</td><td class="n">${x.healthExposed}/${x.healthTotal}</td><td class="n">${x.roadKmExposed} km</td><td class="n">${x.exposureIndex}</td></tr>`).join("");
    rank = `<h2>LGA ranking (top 10 of ${ranking.length} by exposure index)</h2>${hBarChart("Exposure index, top 10 LGAs (higher = more exposed)", ranking.slice(0, 10).map(x => ({ label: String(x.name), value: num(x.exposureIndex), highlight: x.name === a.name })), "")}<table class="grid2"><thead><tr><th>#</th><th>LGA</th><th>High-zone area</th><th>Health facilities exposed</th><th>Roads exposed</th><th>Index</th></tr></thead><tbody>${top}</tbody></table>`;
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>GeoEstate flood exposure briefing - ${esc(a.name)}</title>
<style>
body{font:14px/1.55 system-ui,Segoe UI,Arial,sans-serif;color:#17231d;max-width:860px;margin:24px auto;padding:0 20px}
h1{font-size:23px;margin:0}h2{font-size:15px;margin:24px 0 8px;color:#0b5d3b;border-bottom:1px solid #d7e2db;padding-bottom:4px}
.eye{color:#0b5d3b;font-weight:700;letter-spacing:.08em;font-size:11px}.sub{color:#5b6b62}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0}.m{border:1px solid #d7e2db;border-radius:8px;padding:8px}
.m span{display:block;font-size:11px;color:#5b6b62}.m strong{font-size:19px}.m em{display:block;font-size:11px;color:#0b5d3b;font-style:normal}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:5px 8px;border-bottom:1px solid #edf2ee;vertical-align:top;text-align:left}th{font-size:11px;color:#5b6b62;font-weight:600}
.n{text-align:right;white-space:nowrap}.me td{background:#eef7f1;font-weight:700}.note{font-size:12px;color:#5b6b62}
p{margin:8px 0}ul{margin:6px 0 6px 18px}.tag{display:inline-block;font-size:10px;border:1px solid #d7e2db;border-radius:99px;padding:1px 8px;color:#5b6b62;margin-left:6px;vertical-align:middle}
button{margin:0 0 14px;padding:8px 14px;border:0;border-radius:8px;background:#0b5d3b;color:#fff;font-weight:600;cursor:pointer}
.charts{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}.chart{margin:10px 0;padding:10px;border:1px solid #d7e2db;border-radius:8px;break-inside:avoid}.chart.wide{margin:10px 0 14px}
.chart figcaption{font-size:12px;font-weight:700;color:#17231d;margin-bottom:6px}.chart svg{display:block;width:100%;height:auto}
.donut{display:flex;align-items:center;gap:12px}.donut svg{width:130px;flex:none}
.legend{list-style:none;margin:0;padding:0;font-size:12px}.legend li{display:flex;align-items:center;gap:6px;margin:3px 0}.legend i{width:10px;height:10px;border-radius:2px;flex:none}.legend span{color:#5b6b62}.legend b{margin-left:auto;padding-left:10px;white-space:nowrap}
.legend.row{display:flex;gap:14px;flex-wrap:wrap;margin-top:6px}
@media(max-width:640px){.charts{grid-template-columns:1fr}}
svg,.chart i{-webkit-print-color-adjust:exact;print-color-adjust:exact}
@media print{button{display:none}body{margin:0}tr{break-inside:avoid}}
</style></head><body>
<button onclick="window.print()">Print / Save as PDF</button>
<div class="eye">GEOESTATE · FLOOD EXPOSURE BRIEFING</div>
<h1>${esc(a.name)}${a.scope === "lga" ? " LGA" : ""}, Osun State</h1>
<div class="sub">${date} · Area analysed: ${a.areaKm2} km²</div>

<h2>Summary<span class="tag">${a.narrative?.source === "ai" ? "AI-written from the figures below" : "Standard template"}</span></h2>
${narrativeHtml(a.narrative?.text || "")}

<div class="kpis">
${kpi("High susceptibility", `${f.exposedPct}%`, `${f.exposedKm2} km²`)}${kpi("Moderate susceptibility", `${f.moderatePct}%`, `${f.moderateKm2} km²`)}
${kpi("Mean slope", t.meanSlopeDeg != null ? `${t.meanSlopeDeg}°` : "n/a", `${t.flatPct}% nearly flat`)}${kpi("Roads in High zones", `${r.exposedKm} km`, `of ${r.totalKm} km mapped`)}
</div>

<div class="charts">${areaDonut}${roadDonut}</div>

<h2>Facilities by flood susceptibility zone</h2>
${facBar}
<table><thead><tr><th>Type</th><th class="n">In area</th><th class="n">High zone</th><th class="n">Moderate zone</th></tr></thead><tbody>
${assetRow("Schools", as.schools)}${assetRow("Health facilities", as.health)}${assetRow("Markets", as.markets)}</tbody></table>

<h2>Facilities in High susceptibility zones</h2>
<table><thead><tr><th>Name</th><th>Type</th><th>Level</th><th>LGA</th><th class="n">Lat, Lon</th></tr></thead><tbody>${exRows}</tbody></table>${more}

<h2>Candidate sites outside flood-susceptible ground</h2>
<table><thead><tr><th>Site</th><th class="n">Lat, Lon</th><th class="n">Slope</th><th class="n">Nearest road</th><th class="n">Market (km)</th><th class="n">Health (km)</th></tr></thead><tbody>${sites}</tbody></table>
<p class="note">Leads for further assessment only: ~480 m blocks entirely outside modelled flood-susceptible ground, under 5° mean slope, within 1 km of a mapped road.</p>
${rank}

<h2>Method and limitations</h2>
<p class="note">Flood susceptibility combines height above the nearest modelled stream (HAND), a topographic wetness index and local relief from the ALOS 30 m elevation model, and is raised where satellite records (JRC Global Surface Water, Global Flood Database, Sentinel-1 radar) show water. <b>High</b> zones include modelled stream channels and mapped water bodies. This is terrain-based susceptibility, not a flood-risk forecast or a determination for any plot: it does not include rainfall, drainage infrastructure, dams, blockages or local flood history, and 30 m elevation data can be wrong in flat or built-up areas.</p>
<p class="note">Facility, school and market counts come from the project datasets (GRID3 health, HOT/OSM schools, Markets in Nigeria survey) and are incomplete: a count of zero may mean missing data. LGA boundaries are geoBoundaries (simplified) and areas may differ from official figures. Exposure index = 40% share of area in High zones + 40% share of facilities in High zones + 20% share of road length in High zones.</p>
<p class="note">Generated by GeoEstate LandCheck. Ground verification is required before any planning, investment or emergency decision.</p>
</body></html>`;
}
