// Convert the "Markets in Nigeria" GeoJSON (OSGOF / eHA Polio / GRID3) into snapshot market records.
// Used by build-snapshot.mjs (--markets file) and add-markets.mjs (patch an existing snapshot).
import fs from "node:fs";
const r5 = n => Math.round(n * 1e5) / 1e5;
const clean = v => String(v ?? "").trim();
const real = v => { const t = clean(v); return /^(other|none|n\/a|unknown)$/i.test(t) ? "" : t; };   // "Other" carries no information
const DAYS = [["mrkt_mon", "Mon"], ["mrkt_tue", "Tue"], ["mrkt_wed", "Wed"], ["mrkt_thur", "Thu"], ["mrkt_fri", "Fri"], ["mrkt_sat", "Sat"], ["mrkt_sun", "Sun"]];
const SETTLEMENT = { BUA: "Built-up area", SSA: "Small settlement area", HA: "Hamlet area" };
const norm = s => s.toLowerCase().replace(/\b(market|kasuwan|ojoja|oja)\b/g, "").replace(/[^a-z0-9]/g, "");
const distM = (a, b) => Math.hypot((a.lon - b.lon) * Math.cos(a.lat * Math.PI / 180) * 111320, (a.lat - b.lat) * 110540);

export function marketsFromGeoJSON(file, inBox) {
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const all = [];
  for (const f of d.features || []) {
    const g = f.geometry; if (!g || g.type !== "Point") continue;
    const [x, y] = g.coordinates; if (!inBox(x, y)) continue;
    const p = f.properties || {};
    const on = DAYS.filter(([k]) => /^yes$/i.test(clean(p[k]))).map(([, n]) => n);
    const freq = real(p.mrkt_frqcy);
    // All seven days ticked on a weekly/bi-weekly/monthly market is a survey default, not a real schedule.
    const days = on.length === 7 ? (freq && !/daily/i.test(freq) ? "" : "Every day") : on.join(", ");
    all.push({
      name: clean(p.market_nam) || clean(p.mrkt_setnm) || "Market",
      type: real(p.mrkt_type), freq, days,
      goods: real(p.prdct_desc) || real(p.mrkt_gds_o),
      settlement: SETTLEMENT[clean(p.set_type)] || "",
      ward: clean(p.wardname), lga: clean(p.lganame), state: clean(p.statename),
      lon: r5(x), lat: r5(y),
    });
  }
  for (const m of all) if (m.goods === m.type) m.goods = "";   // avoid showing the same text twice
  // Two source surveys overlap: drop a record if one with the same name already sits within 300 m (keep the richer one).
  const info = m => [m.type, m.freq, m.days, m.goods, m.settlement].filter(Boolean).length;
  all.sort((a, b) => info(b) - info(a));
  const kept = [];
  for (const m of all) if (!kept.some(k => norm(k.name) === norm(m.name) && distM(k, m) < 300)) kept.push(m);
  console.log(`Markets: ${all.length} in area, ${kept.length} after removing duplicates`);
  return kept;
}
