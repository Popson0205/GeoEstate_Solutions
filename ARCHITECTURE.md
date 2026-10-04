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
