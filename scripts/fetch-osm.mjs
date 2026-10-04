// One-time (or occasional) download of OpenStreetMap data for the Osogbo pilot area.
// Run on your own computer:   node scripts/fetch-osm.mjs
// Output: data/osogbo.json  -> commit it to GitHub so Railway deploys it with the app.
// Node 18+ required. Takes a few minutes; it retries and rotates mirrors automatically.
import fs from "node:fs";

const BBOX = { south: 7.68, west: 4.45, north: 7.90, east: 4.68 }; // Osogbo + surroundings
const STEP = 0.05;
const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const r5 = n => Math.round(n * 1e5) / 1e5;

async function runQuery(query, label) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    for (const ep of MIRRORS) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 90000);
        const res = await fetch(ep, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "GeoEstate-LandCheck-fetch/1.0", Accept: "application/json" },
          body: new URLSearchParams({ data: query }), signal: ctrl.signal,
        });
        clearTimeout(t);
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        if (json.remark && /error|timeout|memory/i.test(json.remark) && !(json.elements || []).length) throw new Error(json.remark);
        return json.elements || [];
      } catch (e) {
        console.log(`  ${label}: ${ep} failed (${e.message || e}); trying next`);
        await sleep(1500);
      }
    }
    console.log(`  ${label}: all mirrors failed, waiting before retry ${attempt}/6`);
    await sleep(8000 * attempt);
  }
  throw new Error(`Gave up on ${label}. Try again later or see the README for the Geofabrik alternative.`);
}

const roads = new Map(), points = { schools: new Map(), hospitals: new Map(), markets: new Map(), government: new Map() };
const water = new Map(); const buildings = new Map();

const geomOf = e => (e.geometry || []).map(p => [r5(p.lon), r5(p.lat)]);
const centerOf = e => e.type === "node" ? { lon: e.lon, lat: e.lat } : e.center;

const cells = [];
for (let s = BBOX.south; s < BBOX.north; s += STEP)
  for (let w = BBOX.west; w < BBOX.east; w += STEP)
    cells.push([s, w, Math.min(s + STEP, BBOX.north), Math.min(w + STEP, BBOX.east)]);

let i = 0;
for (const [s, w, n, e] of cells) {
  i++;
  const bb = `${s},${w},${n},${e}`;
  console.log(`Cell ${i}/${cells.length}`);
  const q = `[out:json][timeout:60];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service)$"](${bb});
out geom qt;
(way["waterway"~"^(river|stream|canal|drain)$"](${bb}); way["natural"="water"](${bb}););
out geom qt;
(nwr["amenity"~"^(school|hospital|marketplace|townhall)$"](${bb}); nwr["shop"="market"](${bb}); nwr["office"="government"](${bb}); nwr["government"](${bb}););
out center qt;
way["building"](${bb});
out center qt;`;
  const els = await runQuery(q, `cell ${i}`);
  for (const el of els) {
    const t = el.tags || {};
    if (t.highway && el.type === "way") {
      const g = geomOf(el); if (g.length > 1) roads.set(el.id, { n: t.name || "", h: t.highway, g });
    } else if ((t.waterway || t.natural === "water") && el.type === "way") {
      const g = geomOf(el); if (g.length > 1) water.set(el.id, { k: t.natural === "water" ? "poly" : "line", g });
    } else if (t.building) {
      const c = centerOf(el); if (c) buildings.set(el.id, [r5(c.lon), r5(c.lat)]);
    } else {
      const c = centerOf(el); if (!c) continue;
      const rec = { name: t.name || t["name:en"] || "", lon: r5(c.lon), lat: r5(c.lat) };
      if (t.amenity === "school") points.schools.set(el.id, rec);
      else if (t.amenity === "hospital") points.hospitals.set(el.id, rec);
      else if (t.amenity === "marketplace" || t.shop === "market") points.markets.set(el.id, rec);
      else points.government.set(el.id, rec);
    }
  }
  await sleep(2000); // be polite to the public servers
}

const out = {
  source: "OpenStreetMap contributors (ODbL) via Overpass",
  fetchedAt: new Date().toISOString(),
  bbox: BBOX,
  roads: [...roads.values()],
  water: [...water.values()],
  schools: [...points.schools.values()], hospitals: [...points.hospitals.values()],
  markets: [...points.markets.values()], government: [...points.government.values()],
  buildings: [...buildings.values()].flat(), // flat [lon,lat,lon,lat,...]
};
fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/osogbo.json", JSON.stringify(out));
console.log(`Done: ${out.roads.length} roads, ${out.schools.length} schools, ${out.hospitals.length} hospitals, ${out.buildings.length / 2} buildings, ${out.water.length} water features.`);
console.log("Saved data/osogbo.json - commit it and redeploy.");
