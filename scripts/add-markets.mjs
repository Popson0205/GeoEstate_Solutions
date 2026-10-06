// Add markets to an existing data/snapshot.json without rebuilding it.
//   node scripts/add-markets.mjs path/to/Markets_in_Nigeria.geojson [data/snapshot.json]
import fs from "node:fs";
import { marketsFromGeoJSON } from "./markets.mjs";
const [src, snapPath = "data/snapshot.json"] = process.argv.slice(2);
if (!src) { console.error("Usage: node scripts/add-markets.mjs <markets.geojson> [snapshot.json]"); process.exit(1); }
const s = JSON.parse(fs.readFileSync(snapPath, "utf8")); const b = s.bbox;
s.markets = marketsFromGeoJSON(src, (x, y) => x >= b.west && x <= b.east && y >= b.south && y <= b.north);
if (!/Markets/.test(s.source)) s.source += ", Markets in Nigeria (OSGOF/eHA/GRID3)";
fs.writeFileSync(snapPath, JSON.stringify(s));
console.log(`Saved ${snapPath}: ${s.markets.length} markets`);
