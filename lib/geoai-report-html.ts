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

export function buildGeoAiReportHtml(a: any, ranking?: any[] | null): string {
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const f = a.flood, t = a.terrain, as = a.assets, r = a.roads;
  const kpi = (l: string, v: string, s = "") => `<div class="m"><span>${l}</span><strong>${esc(v)}</strong>${s ? `<em>${esc(s)}</em>` : ""}</div>`;
  const assetRow = (label: string, x: any) => `<tr><td>${label}</td><td class="n">${x.total}</td><td class="n">${x.high}</td><td class="n">${x.moderate}</td></tr>`;
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
    rank = `<h2>LGA ranking (top 10 of ${ranking.length} by exposure index)</h2><table class="grid2"><thead><tr><th>#</th><th>LGA</th><th>High-zone area</th><th>Health facilities exposed</th><th>Roads exposed</th><th>Index</th></tr></thead><tbody>${top}</tbody></table>`;
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

<h2>Facilities by flood susceptibility zone</h2>
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
