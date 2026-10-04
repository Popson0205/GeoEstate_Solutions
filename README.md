# GeoEstate LandCheck — Osogbo MVP

A UI-first geospatial intelligence prototype for GeoEstate NIG Limited.

## What is included

- Premium responsive GeoEstate UI
- MapLibre map
- Osogbo pilot starting view
- Layer control UI
- Click-to-LandCheck interaction
- Spatial score card
- Responsive mobile map experience
- Supabase-ready environment variables
- Provider-agnostic structure for OSM, DEM and land-cover integrations

## Important

The current LandCheck values are **demo values**. They are deliberately isolated in `lib/demo.ts`.

The next implementation phase should replace the demo function with server-side provider adapters:

- OpenStreetMap / Overpass for roads, buildings and POIs
- Copernicus DEM for elevation
- Dynamic World / Earth Engine or another appropriate land-cover provider
- PostGIS for GeoEstate caching and derived spatial data

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Supabase

Create a Supabase project and add:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Do not put service-role keys in browser-exposed variables.

## Railway

Railway can deploy this as a standard Next.js application.

Build command:

```bash
npm run build
```

Start command:

```bash
npm start
```

## Suggested next milestone

1. Add a FastAPI or Next.js server-side geospatial API.
2. Add PostGIS tables in Supabase.
3. Add OSM/Overpass adapter.
4. Add DEM adapter.
5. Add land-cover adapter.
6. Replace demo scoring with transparent provider-backed calculations.
7. Add report generation.
8. Add authentication and saved LandChecks.
