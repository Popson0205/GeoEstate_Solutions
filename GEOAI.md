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

## LGA posters (A2 print + social post)

The GeoAI panel can produce a presentation poster for any of the 30 Osun LGAs, in the style of an academic conference poster. It is meant for printing and for posting on social media as advertising for GeoEstate.

**Where:** GeoAI panel, analyse an LGA, then use **Poster A2 (JPEG)** or **Social post (JPEG)**. In the Ranking tab, **All 30 LGA posters (ZIP)** makes both formats for every LGA with a progress message (A2_print/ and Social_1080x1350/ folders).

**Formats**
- A2 print: 420 x 594 mm, 3307 x 4677 px (about 200 dpi). Print at 100% on A2.
- Social: 1080 x 1350 px (4:5 portrait), exported at 2160 x 2700 px.

**Contents (A2):** title band, key figures, background and aim, study area with a locator map of Osun, data and method, the LGA flood-zone map (roads, schools, health facilities, markets and numbered candidate safer sites), donut chart of area by zone, candidate-site table, bar charts (facilities by zone, road exposure, terrain), ranking bars for all 30 LGAs, conclusions, recommendations, call to action with WhatsApp QR code, limitations and data credits.

**How the text is made:** `lib/poster-content.ts` fills sentence templates from the computed figures. Nothing is written freehand per LGA, and zeros are printed as zeros (for example "0 schools on record"), with field mapping as the first recommendation. Wording says "susceptibility", never "risk".

**How it is built:** `/api/poster-data?lga=Name` returns the analysis, the ranking and the map data (class raster clipped to the LGA, outline, roads, facilities). The browser colours the raster, builds one SVG (`lib/poster-svg.ts`) and rasterises it to JPEG (`lib/poster-client.ts`). No extra packages and no server-side rendering are needed.

**Change the contact details or logo:** edit `CONTACT` in `lib/poster-svg.ts`, regenerate the QR rows in `lib/qr-whatsapp.ts` for the new link (any QR tool, 1 = dark module), and replace `public/geoestate-logo.png`.
