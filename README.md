# GeoEstate LandCheck

Location and due-diligence reports on land in Nigeria: part of the GeoEstate platform, beside Geohub, Land Registry and
FarmScan. Detailed data covers Osun State today.

## How it is sold (v0.20)

- **Anyone** can explore the map and click a location for a free preview: the place, its overall score and the four parts
  (accessibility, infrastructure, development, environment).
- **Organizations with LandCheck** (licensed in Geohub, invoiced from the CRM) buy the **full report**: distances to
  roads, schools and health facilities, flood susceptibility, slope, elevation, land cover and nearby education. Each one
  is counted against the month's allowance (the licence's `reports_per_month`: Standard 50, Advanced 300), numbered per
  organization (`LC-2026-000123`), kept exactly as issued under **Reports**, printable, and carries a QR code and a code
  anyone can check at `/verify/<code>` to confirm it is genuine.
- **Sign-in** is with the person's Geohub account (GeoEstate ID): no LandCheck accounts. Owners, admins and members buy
  reports; collectors and viewers read the organization's reports. An expired licence is read-only; a suspended one is
  closed.
- **LandCheck Advanced** adds batch checks (CSV of locations) and the AI-written GeoAI briefing; GeoAI area analysis is
  for signed-in organizations.

### Setting it up

1. In Geohub's variables: add LandCheck to `ID_CLIENTS`
   (`{"id":"check","name":"LandCheck","redirect_uris":["https://<landcheck>/api/auth/callback"],"secret":"<a long random secret>"}`)
   and `check=https://<landcheck>` to `PRODUCT_URLS`.
2. In LandCheck's variables: `DATABASE_URL` (Geohub's database), `APP_URL`, `GEOHUB_URL`, `GEOHUB_API`, `ID_CLIENT=check`,
   `ID_SECRET` (the same secret). The `insight` schema is created on the first request.
3. Give an organization LandCheck in Geohub's staff console (Products), or from a paid CRM invoice.

Tests: `npm test` (needs PostgreSQL; `DATABASE_URL` defaults to `postgresql://hub:hub@localhost:5432/check_test`).

## Earlier notes

## Current provider-backed layers

- **Roads:** OpenStreetMap via Overpass
- **Properties:** OpenStreetMap building footprints (these are buildings, not legal cadastral parcels)
- **Schools:** OpenStreetMap
- **Hospitals:** OpenStreetMap
- **Markets:** OpenStreetMap
- **Government:** OpenStreetMap government/town-hall features
- **Flood indicator:** mapped OSM waterways/water bodies as a proximity/context indicator; this is **not** an official flood hazard map
- **Land cover:** ESA WorldCover 2021 WMS visualization
- **Elevation:** Copernicus DEM GLO-90 through Open-Meteo's elevation API
- **Slope:** ALOS-derived slope (degrees, ~30 m) for Osun State, served from `data/slope_osun.bin.gz`. Regenerate with `python3 scripts/prepare-slope.py alos_slope_deg_osun.tif`. Reports the mean and max slope within 90 m of the point, and lowers the Environment score above 5° mean slope
- **Flood susceptibility:** terrain model (HAND/TWI/relief) from the ALOS DEM plus optional Google Earth Engine evidence. See `FLOOD.md`
- **Markets:** from the Markets in Nigeria dataset (335 in the Osun area), added with `scripts/add-markets.mjs`
- **Search (v0.17):** live suggestions as you type. Searches the project's own data first (towns, LGAs, schools, health facilities, markets, named roads - works offline), then adds OpenStreetMap (Nominatim) and Open-Meteo results. See `lib/search.ts` and `app/api/search/route.ts`
- **GeoAI (v0.19):** LGA/area flood-exposure analysis, LGA ranking, pins, briefing report and batch CSV check. See `GEOAI.md`
- **Google Places (v0.18):** optional; set `GOOGLE_MAPS_API_KEY`. See `GOOGLE_SEARCH.md`
- **Search (old note):** Open-Meteo geocoding API

The browser talks to GeoEstate's own `/api/*` routes. Provider calls are therefore server-side, making it possible to add caching, rate limiting, provider switching, and PostGIS analysis without rewriting the UI.

## Important data distinction

GeoEstate does **not** treat OSM building footprints as land ownership or cadastral parcels. Legal title, survey plans, C of O records and other authoritative land records must come from the appropriate government/authorized source.

Likewise, the current flood indicator is contextual water-feature data, not an official flood-risk determination. A later GeoEstate flood model should combine terrain, drainage/hydrology and an authoritative flood dataset.

## Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_MAP_STYLE_URL=
OSM_OVERPASS_URL=https://overpass-api.de/api/interpreter
```

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Railway

Set the same environment variables in the Railway service. Do not commit Supabase service-role keys or any other secrets to GitHub.

## Next engineering phase

1. Persist provider results and GeoEstate entities in Supabase/PostGIS.
2. Add real cadastral/parcel data only from authorized sources.
3. Calculate nearest-road/POI metrics with PostGIS.
4. Add real slope calculation from DEM.
5. Add an authoritative flood-risk model/dataset.
6. Add analytical land-cover class lookup rather than only WMS visualization.
7. Add report generation and saved LandChecks.


## v0.4 provider reliability

The spatial endpoint now keeps Overpass requests within a bounded viewport, requests road geometry separately from building/POI centers, uses multiple public Overpass endpoints, and returns a non-blocking empty FeatureCollection if all providers are temporarily unavailable instead of producing a Railway 502.

Buildings are represented as OSM building-center features at the pilot zoom level to keep responses lightweight. True building polygons should be introduced through a dedicated high-zoom/vector-tile or PostGIS pipeline rather than downloading every building geometry on each map load.

## v0.5 fixes

- `/api/landcheck` no longer calls its own `/api/spatial` over the public URL or downloads every building in 6 km. It runs one small targeted Overpass query (nearest road/school/hospital + building count within 1 km), races all mirrors in parallel with a 12 s cap, and returns a clean 503 + message (never a proxy 502) if OSM is down.
- Nearest-road distance now uses point-to-segment distance instead of a way's midpoint.
- `/api/spatial` caps viewport smaller, loads buildings only at zoom >= 14, limits result counts, and the client refetches on pan/zoom.
- Map layers are created up front, so layer toggles work even when the provider fails.
- Land cover WMS moved from `titiler.terrascope.be` (returned 400) to the documented `services.terrascope.be/wms/v2`.

## v0.6

- Land cover now uses Terrascope WMTS (pre-rendered tiles, zoom 5-14) instead of WMS, which dropped connections under load (`ERR_HTTP2_PROTOCOL_ERROR`).
- LandCheck races Overpass mirrors with staggered starts, adds `overpass.kumi.systems`, caches results ~15 min, and logs per-mirror failure reasons.
- `/api/debug/overpass` reports which mirrors your server can reach (remove before launch).

## v0.7 — local OSM snapshot (no live Overpass dependency)

Public Overpass servers are unreliable from cloud hosts, so the pilot now reads a local snapshot.

1. On your own computer (Node 18+): `npm run fetch:osm`  (writes `data/osogbo.json`; takes a few minutes, retries automatically)
2. Commit `data/osogbo.json` and redeploy to Railway.
3. `/api/spatial` and `/api/landcheck` use the file for anything inside its bounding box; live Overpass is only a fallback outside it / if the file is missing.

If the script cannot reach any Overpass mirror either, use a Geofabrik extract instead:
download `nigeria-latest.osm.pbf` from download.geofabrik.de, clip it with
`osmium extract -b 4.45,7.68,4.68,7.90 nigeria-latest.osm.pbf -o osogbo.osm.pbf`,
then load it into PostGIS with osm2pgsql (the planned Supabase/PostGIS phase).

## v0.8 — land cover without a third-party tile server

Terrascope's tile servers drop connections from browsers (`ERR_HTTP2_PROTOCOL_ERROR`) on both WMS and WMTS, so land cover is now a static overlay from ESA WorldCover 2021 v200:

1. Install GDAL, then from the project root: `bash scripts/prepare-worldcover.sh` (downloads only the Osogbo window from the public AWS COG).
2. Commit `public/worldcover-osogbo.png` and `data/worldcover_osogbo.asc`, redeploy.
3. The map shows the overlay and the LandCheck card reports the actual class at the clicked point (Built-up, Cropland, Tree cover, ...).
Without those files the app still works; the layer is skipped and land cover shows "Not available".

## v0.9 — runs on your downloaded national datasets

`data/snapshot.json` (included, Osun State) is built from: national road dataset (`road.geojson`), HOT/OSM education facilities, GRID3 health facilities v3, geoBoundaries ADM1/ADM2. No Overpass call is needed at runtime.
Rebuild or change area (e.g. another state):
`node scripts/build-snapshot.mjs --roads road.geojson --edu education_facilities.geojson --health GRID3_....geojson --adm1 geoBoundaries-NGA-ADM1.geojson --adm2 geoBoundaries-NGA-ADM2.geojson --state Osun`
Not in these datasets (so empty/proxied): buildings (development score uses road density within 1 km), markets, government offices, water/flood lines. `scripts/fetch-osm.mjs` can still add those from Overpass.
Nearest "hospital" is now the nearest GRID3 health facility of any level (label shows Primary/Secondary/Tertiary).

## v0.10 — education facilities + working report

- Education layer rebuilt from the HOT/OSM file: schools, kindergartens, colleges and universities, including features tagged only `building=school`; name falls back to `name_en`/`name_latin`; near-duplicates (node + building polygon) merged; kind, operator type, capacity and LGA stored. Refresh just this layer with `node scripts/patch-education.mjs education_facilities.geojson`.
- LandCheck now returns the number of education facilities within 2 km and the 8 nearest (name, type, distance).
- **Generate report** now works: opens a printable report in a new tab (Print / Save as PDF). Allow pop-ups if the browser blocks it.

## v0.11 — symbology, names, land cover

- **Education names/types:** `scripts/edu-classify.mjs` corrects OSM tagging by name (e.g. "Bowen University" tagged as a school becomes a university; nurseries; "Staff Primary School" stays a school), derives a level (Nursery / Primary / Secondary / Tertiary) and flags campus buildings (faculty blocks, labs, halls) so they are not counted as schools.
- **Symbology:** Education is coloured by level, Health facilities by GRID3 level (tertiary / secondary / primary, sized accordingly), roads by class incl. `_link`, `service` and `track`. A legend is in the sidebar. Click a school or health dot to see its name, level, type and LGA.
- **Layer panel:** each layer shows its feature count, or "no data" when the snapshot has none (Properties, Markets, Government, Flood).
- **Viewport:** `/api/spatial` no longer cuts the viewport to 0.06 x 0.09 degrees when serving the local snapshot, so layers fill the whole screen. Roads of all classes show from zoom 12.
- **Land cover:** `/api/landcover/meta` returns 200 `{available:false}` instead of 404 when the overlay files are missing, and the client skips it quietly. To get the overlay, run `bash scripts/prepare-worldcover.sh` (needs GDAL and internet) and commit `public/worldcover-osogbo.png` and `data/worldcover_osogbo.asc`.
- `scripts/fetch-osm.mjs` now **merges** markets, government, water and buildings into the existing `data/snapshot.json` instead of overwriting it (use `--overwrite` for the old behaviour).

## v0.12 — land cover from Google Earth Engine

`public/worldcover-osogbo.png` (3352 x 3718 px colour overlay) and `data/worldcover_osogbo.asc` (1676 x 1859 class grid, ~66 m) now come from the GEE export (`gee_worldcover_export.js` + `convert_worldcover.py`) and cover all of Osun (4.0524, 6.9804 to 5.058, 8.0958). No online land cover source is used. `data/worldcover_legend.csv` has area per class. The sidebar shows the land cover legend while the layer is on.
