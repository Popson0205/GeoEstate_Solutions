import type { LandCheckResult } from "@/lib/demo";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const band = (n: number) => (n >= 75 ? "Strong" : n >= 50 ? "Moderate" : "Limited");

// Builds a self-contained, printable HTML report (use the Print / Save as PDF button inside it).
export function buildReportHtml(r: LandCheckResult): string {
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const edu = r.educationNearby ?? [];
  const eduRows = edu.length
    ? edu.map(e => `<tr><td>${esc(e.name)}</td><td>${esc(e.kind)}</td><td class="n">${e.d} m</td></tr>`).join("")
    : `<tr><td colspan="3">No mapped education facilities within 2 km.</td></tr>`;
  const metric = (l: string, v: number) => `<div class="m"><span>${l}</span><strong>${v}/100</strong><em>${band(v)}</em></div>`;
  const row = (k: string, v: string) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>GeoEstate LandCheck Report</title>
<style>
body{font:14px/1.5 system-ui,Segoe UI,Arial,sans-serif;color:#17231d;max-width:780px;margin:24px auto;padding:0 20px}
h1{font-size:22px;margin:0}h2{font-size:15px;margin:22px 0 8px;color:#0b5d3b;border-bottom:1px solid #d7e2db;padding-bottom:4px}
.eye{color:#0b5d3b;font-weight:700;letter-spacing:.08em;font-size:11px}.sub{color:#5b6b62}
.score{display:flex;align-items:center;gap:16px;margin:16px 0}.score b{font-size:44px;color:#0b5d3b}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.m{border:1px solid #d7e2db;border-radius:8px;padding:8px}
.m span{display:block;font-size:11px;color:#5b6b62}.m strong{font-size:18px}.m em{display:block;font-size:11px;color:#0b5d3b;font-style:normal}
table{width:100%;border-collapse:collapse}td{padding:6px 8px;border-bottom:1px solid #edf2ee;vertical-align:top}td:first-child{width:38%;color:#5b6b62}
.n{text-align:right;white-space:nowrap}.note{font-size:12px;color:#5b6b62;margin-top:22px}
button{margin:0 0 14px;padding:8px 14px;border:0;border-radius:8px;background:#0b5d3b;color:#fff;font-weight:600;cursor:pointer}
@media print{button{display:none}body{margin:0}}
</style></head><body>
<button onclick="window.print()">Print / Save as PDF</button>
<div class="eye">GEOESTATE LANDCHECK REPORT</div>
<h1>${esc(r.place)}</h1>
<div class="sub">${r.lat.toFixed(5)}, ${r.lng.toFixed(5)} &middot; Generated ${date}</div>
<div class="score"><b>${r.score}</b><div><strong>Spatial context score (${band(r.score)})</strong><br><span class="sub">Based on road access, nearby services, development intensity and environment.</span></div></div>
<div class="grid">${metric("Accessibility", r.accessibility)}${metric("Infrastructure", r.infrastructure)}${metric("Development", r.development)}${metric("Environment", r.environment)}</div>
<h2>Site context</h2>
<table>${row("Nearest road", r.nearestRoad)}${row("Nearest school", r.nearestSchool)}${row("Nearest health facility", r.nearestHospital)}${row("Elevation", r.elevation)}${row("Slope", r.slope)}${row("Land cover", r.landCover)}</table>
<h2>Education facilities within 2 km${r.educationCount != null ? ` (${r.educationCount} mapped)` : ""}</h2>
<table><tr><td><b>Name</b></td><td><b>Type</b></td><td class="n"><b>Distance</b></td></tr>${eduRows}</table>
<p class="note"><b>Data sources:</b> ${esc(r.source || "OpenStreetMap, GRID3, Copernicus DEM")}. Education data: HOT/OSM (ODbL). This report is a spatial context summary only. It is not a land title search, survey, valuation or flood-risk determination; verify ownership and title with the appropriate government authority.</p>
</body></html>`;
}
