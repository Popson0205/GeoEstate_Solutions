# Flood susceptibility layer

The LandCheck "Flood susceptibility" row (Low / Moderate / High) combines two things. It is **terrain-based susceptibility, not a flood-risk determination**: it knows nothing about rainfall, drainage works, dams or blocked channels.

## 1. Terrain model (from `alos_elevation_osun.tif`) - already built
`python3 scripts/prepare-flood-terrain.py path/to/alos_elevation_osun.tif [stream_km2=0.5]`
Compiles `scripts/flood/hydro.c` (needs gcc; ~15 s) and writes `data/flood_terrain_osun.bin.gz`.

| Layer | Meaning | Score |
|---|---|---|
| HAND | metres above nearest modelled stream (stream = >= 0.5 km² upslope area) | 55 % weight; 0 m = 100, 2 m = 85, 5 m = 60, 10 m = 30, 15 m = 10, 20 m+ = 0 |
| TWI | topographic wetness index, ln(catchment area / tan slope) | 20 %; 6 = 0, 14+ = 100 |
| Local relief | elevation minus mean within ~500 m (negative = hollow) | 25 %; -4 m or lower = 100, +4 m or higher = 0 |

Values are 3x3-cell (~90 m) means. Lower `stream_km2` = more small streams = more cells flagged.
Class: score < 35 Low, 35-64 Moderate, 65+ High. Weights/breakpoints live in `lib/flood.ts`.

## 2. Observed evidence (Google Earth Engine) - optional, adds to the score
1. Run `scripts/gee/export_flood_observed_osun.js` in the Earth Engine Code Editor and start the export task.
2. Download `flood_observed_osun.tif` from Drive (folder `GeoEstate`).
3. `python3 scripts/prepare-flood-observed.py flood_observed_osun.tif` (needs `pip install numpy tifffile pillow`; handles LZW exports without imagecodecs)
   writes `data/flood_observed_osun.bin.gz`. Restart the app; it is picked up automatically.

Bands: JRC surface-water occurrence, Global Flood Database past-flood count, Sentinel-1 wet-season and dry-season water frequency.
Evidence can only raise the score (permanent/frequent water -> 90-100, 2+ past floods -> 85, wet-season-only radar water -> 75).
Without this file the app uses the terrain model only.

## Notes
- Environment score drops by `0.3 x flood score` (max 30 points), together with the slope penalty.
- Both grids are held in memory (~46 MB terrain + ~62 MB observed). Fine for Railway's default plan.
- Outside Osun State the row shows "Not available".
- Known limits: 30 m DEM noise in flat areas, no urban drainage, no rainfall, small streams under 0.5 km² catchment are not modelled.

## Checks on the Osun export (Oct 2026)
- 92% of cells with JRC occurrence >= 25% also show water in wet-season radar.
- Wet-season-only radar water cells sit at a median 0 m above drainage (i.e. in channels/floodplains).
- Dry-season radar water has false positives away from rivers (likely dark dry/burnt surfaces); it only ever *reduces* the wet-minus-dry signal.
- Observed evidence mostly confirms the terrain model (those cells already score High); it adds little new area.
- Terrain model alone puts ~25% of Osun in High, which may be too many: tune `handScore` breakpoints / class cut-offs in `lib/flood.ts`.
