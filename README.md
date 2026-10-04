# GeoEstate LandCheck MVP — Osogbo

GeoEstate LandCheck is the first pilot of the GeoEstate spatial intelligence platform.

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
- **Search:** Open-Meteo geocoding API

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
