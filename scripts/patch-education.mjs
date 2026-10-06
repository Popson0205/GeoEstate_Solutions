// Refresh only the education layer of an existing data/snapshot.json (no road/health files needed).
//   node scripts/patch-education.mjs education_facilities.geojson
import fs from "node:fs";
const src = process.argv[2]; if (!src) { console.error("Usage: node scripts/patch-education.mjs education_facilities.geojson"); process.exit(1); }
const snap = JSON.parse(fs.readFileSync("data/snapshot.json", "utf8"));
const { west: W, south: S, east: E, north: N } = snap.bbox;
const r5 = n => Math.round(n * 1e5) / 1e5;
const pts = g => g.type === "Polygon" ? g.coordinates.flat() : g.coordinates.flat(2);
const keep = new Set(["school", "kindergarten", "college", "university"]);
const res = [];
for (const f of JSON.parse(fs.readFileSync(src, "utf8")).features) {
  const g = f.geometry; if (!g) continue;
  let c = g.type === "Point" ? g.coordinates : null;
  if (!c) { const p = pts(g), xs = p.map(a => a[0]), ys = p.map(a => a[1]); c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; }
  const [x, y] = c; if (x < W || x > E || y < S || y > N) continue;
  const p = f.properties || {}, kind = p.amenity || p.building || "";
  if (!keep.has(kind)) continue;
    // Unnamed building=university/college polygons are campus buildings, not separate institutions.
    if (!p.amenity && (kind === "university" || kind === "college") && !(p.name || p.name_en || p.name_latin)) continue;
  res.push({ name: p.name || p.name_en || p.name_latin || "", kind, op: p.operator_type || "", cap: p.capacity_persons ? Number(p.capacity_persons) || undefined : undefined, lga: p.adm2_name || "", lon: r5(x), lat: r5(y) });
}
res.sort((a, b) => (b.name ? 1 : 0) - (a.name ? 1 : 0));
const seen = new Set(), out = [];
for (const r of res) { const k = `${Math.round(r.lon * 3000)},${Math.round(r.lat * 3000)}`; if (seen.has(k)) continue; seen.add(k); out.push(r); }
console.log(`Education facilities: ${snap.schools.length} -> ${out.length}`);
snap.schools = out; snap.fetchedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync("data/snapshot.json", JSON.stringify(snap));
