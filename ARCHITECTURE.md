# GeoEstate LandCheck Architecture

```text
                    GeoEstate LandCheck UI
                             |
                    Next.js / MapLibre
                             |
                    GeoEstate API layer
              _____________/ | \\____________
             /               |              \\
            /                |               \\
      OSM / Overpass   Elevation API    ESA WorldCover
            |                |               |
            +----------------+---------------+
                             |
                         GeoEstate
                       Spatial Core
                             |
                         Supabase
                       PostgreSQL/PostGIS
```

The provider layer is deliberately isolated from the UI. External services can therefore be cached, replaced, or supplemented without changing the user experience.

### Current API routes

- `/api/spatial` — OSM/Overpass feature extraction for the current map extent
- `/api/elevation` — Copernicus DEM GLO-90 elevation through Open-Meteo
- `/api/search` — place search through Open-Meteo geocoding
- `/api/landcheck` — combines spatial features and elevation into the first provider-backed LandCheck response
- `lib/slope.ts` — local ALOS slope grid lookup (used by `/api/landcheck`)
- `lib/flood.ts` — flood susceptibility from `data/flood_terrain_osun.bin.gz` (+ optional `flood_observed_osun.bin.gz`)
- `scripts/flood/hydro.c`, `scripts/prepare-flood-*.py`, `scripts/gee/*.js` — data preparation (see FLOOD.md)
- `lib/search.ts` — local place index (towns, LGAs, facilities, markets, roads); `/api/search` merges it with online geocoders
- `lib/google-places.ts`, `app/api/search/place/route.ts` — Google Places (New) autocomplete + details (optional, key-gated)
