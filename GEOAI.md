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
