// Build data/snapshot.json from locally downloaded national datasets (no Overpass needed).
//   node scripts/build-snapshot.mjs --roads road.geojson --edu education_facilities.geojson \
//        --health GRID3_NGA_health_facility_v3_0_....geojson --adm1 geoBoundaries-NGA-ADM1.geojson \
//        --adm2 geoBoundaries-NGA-ADM2.geojson [--state Osun] [--bbox W,S,E,N]
// Default area = bounding box of the --state polygon (Osun). The big road file is streamed, so memory stays low.
import fs from "node:fs";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > -1 ? process.argv[i + 1] : d; };
const need = k => { const v = arg(k); if (!v) { console.error(`Missing --${k}`); process.exit(1); } return v; };
const roadsPath = need("roads"), eduPath = need("edu"), healthPath = need("health"), adm1Path = need("adm1"), adm2Path = need("adm2");
const STATE = arg("state", "Osun");
const out = arg("out", "data/snapshot.json");
const r5 = n => Math.round(n * 1e5) / 1e5, r4 = n => Math.round(n * 1e4) / 1e4;
const readJson = p => JSON.parse(fs.readFileSync(p, "utf8"));
const ptsOf = g => g.type === "Polygon" ? g.coordinates.flat() : g.coordinates.flat(2);
const bboxOf = pts => pts.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [180, 90, -180, -90]);

const adm1 = readJson(adm1Path);
let BBOX;
if (arg("bbox")) BBOX = arg("bbox").split(",").map(Number);
else {
  const st = adm1.features.find(f => f.properties.shapeName === STATE);
  if (!st) { console.error(`State "${STATE}" not found in ADM1`); process.exit(1); }
  BBOX = bboxOf(ptsOf(st.geometry));
}
const [W, S, E, N] = BBOX;
const inBox = (x, y) => x >= W && x <= E && y >= S && y <= N;
console.log("Area bbox:", BBOX.map(v => v.toFixed(3)).join(", "));

// ---- Roads (streamed) ----
async function streamRoads() {
  const roads = [];
  const marker = '{"type":"Feature","id":';
  let buf = "", total = 0, seenHeader = false;
  const take = piece => {
    piece = piece.trim().replace(/,$/, "");
    if (piece.endsWith("]}")) piece = piece.slice(0, -2);
    let ft; try { ft = JSON.parse(marker + piece); } catch { return; }
    total++;
    const g = ft.geometry; if (!g) return;
    const lines = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
    if (!lines.some(l => l.some(([x, y]) => inBox(x, y)))) return;
    const p = ft.properties || {};
    let h = String(p.osm_class || "").toLowerCase();
    if (!h) h = p.road_class === "Major Road" ? "primary" : p.road_class === "Tertiary" ? "tertiary" : p.road_class === "Residential" ? "residential" : "track";
    if (["path", "footway", "pedestrian", "steps", "cycleway"].includes(h)) return; // keep vehicle-relevant roads only
    for (const l of lines) if (l.length > 1) roads.push({ n: p.name || "", h, g: l.map(([x, y]) => [r5(x), r5(y)]) });
  };
  const rs = fs.createReadStream(roadsPath, { encoding: "utf8", highWaterMark: 8 * 1024 * 1024 });
  for await (const chunk of rs) {
    buf += chunk;
    if (!seenHeader) { const i = buf.indexOf(marker); if (i < 0) continue; buf = buf.slice(i); seenHeader = true; }
    const parts = buf.split(marker);
    buf = parts.pop();
    for (const p of parts) if (p) take(p);
  }
  if (buf) take(buf.startsWith(marker) ? buf.slice(marker.length) : buf);
  console.log(`Roads: scanned ${total}, kept ${roads.length}`);
  return roads;
}

// ---- Points ----
function schools() {
  const d = readJson(eduPath);
  const keep = new Set(["school", "kindergarten", "college", "university"]);
  const res = [];
  for (const f of d.features) {
    const g = f.geometry; if (!g) continue;
    let c = g.type === "Point" ? g.coordinates : null;
    if (!c) { const b = bboxOf(ptsOf(g)); c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
    const [x, y] = c; if (!inBox(x, y)) continue;
    const p = f.properties || {};
    // Many features carry only building=school (no amenity tag), so fall back to it.
    const kind = p.amenity || p.building || "";
    if (!keep.has(kind)) continue;
    // Unnamed building=university/college polygons are campus buildings, not separate institutions.
    if (!p.amenity && (kind === "university" || kind === "college") && !(p.name || p.name_en || p.name_latin)) continue;
    res.push({
      name: p.name || p.name_en || p.name_latin || "", kind,
      op: p.operator_type || "", cap: p.capacity_persons ? Number(p.capacity_persons) || undefined : undefined,
      lga: p.adm2_name || "", lon: r5(x), lat: r5(y),
    });
  }
  // Drop duplicates (a school node plus its building polygon): same kind within ~30 m, keep the named one.
  res.sort((a, b) => (b.name ? 1 : 0) - (a.name ? 1 : 0));
  const out = [], seen = new Map();
  for (const r of res) {
    const k = `${Math.round(r.lon * 3000)},${Math.round(r.lat * 3000)}`;
    if (seen.has(k)) continue;
    seen.set(k, 1); out.push(r);
  }
  console.log("Education facilities:", out.length, "(from", res.length, "before de-duplication)"); return out;
}
function health() {
  const d = readJson(healthPath);
  const res = [];
  for (const f of d.features) {
    const g = f.geometry; if (!g || g.type !== "Point") continue;
    const [x, y] = g.coordinates; if (!inBox(x, y)) continue;
    const p = f.properties || {};
    res.push({ name: p.facility_name || "", lvl: p.facility_level || "", type: p.facility_type || "", lon: r5(x), lat: r5(y) });
  }
  console.log("Health facilities:", res.length); return res;
}

// ---- Admin boundaries (for place names) ----
const roundPoly = g => g.type === "Polygon" ? g.coordinates.map(r => r.map(([x, y]) => [r4(x), r4(y)])) : g.coordinates.map(poly => poly.map(r => r.map(([x, y]) => [r4(x), r4(y)])));
function admin(file, key) {
  const d = readJson(file); const res = [];
  for (const f of d.features) {
    const b = bboxOf(ptsOf(f.geometry));
    if (b[2] < W || b[0] > E || b[3] < S || b[1] > N) continue;
    res.push({ name: f.properties.shapeName, type: f.geometry.type, c: roundPoly(f.geometry) });
  }
  console.log(`${key}:`, res.length); return res;
}

const snapshot = {
  source: "GRID3 health facilities v3, HOT/OSM education facilities, national road dataset (OSM-derived), geoBoundaries",
  fetchedAt: new Date().toISOString().slice(0, 10),
  bbox: { south: S, west: W, north: N, east: E },
  roads: await streamRoads(),
  schools: schools(),
  hospitals: health(),
  markets: [], government: [], water: [], buildings: [],
  adm1: admin(adm1Path, "ADM1"), adm2: admin(adm2Path, "ADM2"),
};
fs.mkdirSync("data", { recursive: true });
fs.writeFileSync(out, JSON.stringify(snapshot));
console.log(`Saved ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
