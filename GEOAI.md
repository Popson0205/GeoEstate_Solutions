# GeoAI - flood exposure analysis for government

Button: sparkles icon in the top bar (also in the sidebar and the mobile bar).

## What it does
- **Analyse an LGA or the current map view** (up to ~3,000 km²). Returns: share of area in High / Moderate flood-susceptibility zones, mean slope,
  schools / health facilities / markets in each zone, km of road in High zones (and of trunk/primary/secondary roads), up to 5 candidate sites on safer ground.
- **Pins on the map**: red = facility in a High zone, amber = Moderate zone, green = candidate site. Click a pin for details.
- **LGA ranking**: all 30 Osun LGAs by an exposure index (40% area in High zones + 40% facilities in High zones + 20% roads in High zones); optional map colouring.
- **Briefing report**: printable/PDF, with summary, tables, ranking, method and limitations. Plus CSV exports (exposed facilities, ranking).
- **Batch check**: upload a CSV of plot coordinates, get it back with LGA, flood class, score, HAND, slope and land cover (`/api/batch`, up to 2,000 rows).

## Where the numbers come from
All figures are computed on the server from the project's data: `flood_class_osun.bin.gz` (per-cell flood class), the slope grid,
`snapshot.json` (schools, health, markets, roads) and `lga_osun.json` (geoBoundaries ADM2, Osun's 30 LGAs). The AI never calculates anything.

## AI-written summary (optional)
Set `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`, default `claude-sonnet-5-5`) in Railway. The model receives only the computed figures
and is instructed not to invent numbers, places or causes, and to say "susceptibility", not "risk". Without a key, or if the call fails,
a built-in template writes the summary, and the report says which was used.

## API
- `GET /api/analyse?lga=Osogbo` | `?bbox=w,s,e,n` | `?rank=1` (add `&ai=0` to skip the AI summary)
- `POST /api/batch` with `text/csv`

## Rebuilding the data
```
python3 scripts/prepare-lga.py geoBoundaries-NGA-ADM2.geojson    # LGA polygons
python3 scripts/prepare-flood-overlay.py                          # per-cell flood classes + map overlay
```

## Known limits
- Facility data is incomplete (e.g. ~140 schools statewide), so a zero can mean missing data; ranking leans on health facilities.
- LGA boundaries are simplified geoBoundaries; areas may differ from official figures. A national dataset covers other states, but only Osun's grids exist.
- High zones are ~22% of Osun in the current calibration (see FLOOD.md) - validate before official use.

## Posters (per LGA)
Select an LGA, press Analyse, then use the **Poster** buttons: A2 poster (PDF, opens a print view sized 420 x 594 mm), A2 poster (JPEG, ~150 dpi) and Social post (JPEG, 1080 x 1350).
- Data: `GET /api/poster-data?lga=Osogbo` (figures, LGA map raster, roads, facility points, slope bands, 30-LGA ranking). Built in `posterExtras()` in `lib/geoai.ts`.
- Layout and wording: `lib/geoai-poster.ts` (one SVG per format). Conclusion and recommendations are rule-based from the figures (no AI call), so each LGA gets its own reproducible text.
- Browser delivery: `lib/poster-client.ts`. QR codes: `lib/qr.ts` (WhatsApp always; a LandCheck QR is added when the app runs on a public address).
- Batch: `node scripts/generate-posters.mjs [--lga "Ife South"] [--url https://your-app/] [--out posters] [--svg-only]` (Node 22.18+; JPEG needs `sharp`, PDF needs `playwright` + Chromium; otherwise SVGs are written). A harmless "Module type of file" warning may print.
- Wording rules: "susceptibility", never "risk"; facility counts say "mapped", and zero means none mapped so far. Land cover is not on the poster because that raster exists for Osogbo only.

