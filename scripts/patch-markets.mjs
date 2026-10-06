// Refresh only the markets layer of an existing data/snapshot.json from the national markets GeoJSON.
//   node scripts/patch-markets.mjs Markets_in_Nigeria_*.geojson
// Keeps every market inside the snapshot bounding box, tidies the attributes and merges near-duplicate records.
import fs from "node:fs";
const src = process.argv[2]; if (!src) { console.error("Usage: node scripts/patch-markets.mjs <markets>.geojson"); process.exit(1); }
const snap = JSON.parse(fs.readFileSync("data/snapshot.json", "utf8"));
const { west: W, south: S, east: E, north: N } = snap.bbox;
const r5 = n => Math.round(n * 1e5) / 1e5;
const s = v => (v == null ? "" : String(v).trim());
const DAYS = [["mrkt_mon", "Mon"], ["mrkt_tue", "Tue"], ["mrkt_wed", "Wed"], ["mrkt_thur", "Thu"], ["mrkt_fri", "Fri"], ["mrkt_sat", "Sat"], ["mrkt_sun", "Sun"]];
const SETTLEMENT = { BUA: "Built-up area", SSA: "Small settlement area", HA: "Hamlet area" };
const norm = n => n.toLowerCase().replace(/\b(market|oja|ọja)\b/g, "").replace(/[^a-z0-9]/g, "");
// Some records misspell "Friday" as "Frida"; any value starting with "y" or "frid" counts as a trading day.
const isYes = v => /^(yes|frid)/i.test(s(v));

const rows = [];
for (const f of JSON.parse(fs.readFileSync(src, "utf8")).features) {
  const g = f.geometry; if (!g || g.type !== "Point") continue;
  const [x, y] = g.coordinates; if (x < W || x > E || y < S || y > N) continue;
  const p = f.properties || {};
  const name = s(p.market_nam) || s(p.mrkt_setnm);
  const flags = DAYS.map(([k]) => s(p[k]));
  const known = flags.some(v => v !== "");
  const days = DAYS.filter(([k]) => isYes(p[k])).map(([, d]) => d);
  const daysTxt = !known ? "" : days.length === 7 ? "Daily" : days.join(", ");
  const type = s(p.mrkt_type), goods = s(p.prdct_desc) || s(p.mrkt_gds_o);
  const rec = {
    name, lga: s(p.lganame), state: s(p.statename), settlement: s(p.mrkt_setnm),
    type: type === "Other" ? "" : type, freq: s(p.mrkt_frqcy) === "Other" ? "" : s(p.mrkt_frqcy),
    days: daysTxt, goods: goods === "Other" ? "" : goods, area: SETTLEMENT[s(p.set_type)] || "",
    lon: r5(x), lat: r5(y),
  };
  rec._score = Object.values(rec).filter(v => v !== "").length;
  rows.push(rec);
}
// Merge duplicates: same normalised name within ~120 m, or identical position within ~30 m. Keep the richest record.
rows.sort((a, b) => b._score - a._score);
const kept = [];
const dist = (a, b) => Math.hypot((a.lon - b.lon) * Math.cos(a.lat * Math.PI / 180) * 111320, (a.lat - b.lat) * 110540);
for (const r of rows) {
  const dup = kept.some(k => { const d = dist(k, r); return d <= 30 || (d <= 120 && norm(k.name) === norm(r.name)); });
  if (!dup) kept.push(r);
}
const out = kept.map(({ _score, ...r }) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== "")));
console.log(`Markets in area: ${rows.length}, after merging duplicates: ${out.length} (was ${snap.markets.length})`);
snap.markets = out; snap.fetchedAt = new Date().toISOString().slice(0, 10);
if (!/markets/i.test(snap.source)) snap.source += ", national markets dataset (GRID3 / eHA / OSGOF)";
fs.writeFileSync("data/snapshot.json", JSON.stringify(snap));
