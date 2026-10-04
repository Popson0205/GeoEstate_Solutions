#!/usr/bin/env bash
# One-time: clip ESA WorldCover 2021 (10 m) to the Osogbo pilot area.
# Needs GDAL (gdal_translate, gdaldem):  macOS `brew install gdal` | Ubuntu `sudo apt install gdal-bin` | Windows: OSGeo4W or WSL
# Run from the project root:  bash scripts/prepare-worldcover.sh
# Osogbo (7.78N, 4.54E) lies inside the 3x3 degree tile N06E003. Only the needed part is downloaded (it is a Cloud-Optimized GeoTIFF).
set -euo pipefail
SRC="/vsicurl/https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N06E003_Map.tif"
W=4.45; S=7.68; E=4.68; N=7.90   # keep in sync with scripts/fetch-osm.mjs
mkdir -p data public

gdal_translate -of GTiff -projwin $W $N $E $S "$SRC" data/wc_clip.tif

cat > data/wc_colors.txt <<'COLORS'
nv 0 0 0 0 0
10 0 100 0 255
20 255 187 34 255
30 255 255 76 255
40 240 150 255 255
50 250 0 0 255
60 180 180 180 255
70 240 240 240 255
80 0 100 200 255
90 0 150 160 255
95 0 207 117 255
100 250 230 160 255
COLORS

# Colour overlay for the map (transparent where no data)
gdaldem color-relief data/wc_clip.tif data/wc_colors.txt public/worldcover-osogbo.png -of PNG -alpha -nearest_color_entry

# Small class grid (40 m cells) for the "land cover at this point" lookup
gdal_translate -of AAIGrid -outsize 25% 25% -r nearest data/wc_clip.tif data/worldcover_osogbo.asc
rm -f data/*.aux.xml public/*.aux.xml data/worldcover_osogbo.prj
echo "Done. Commit public/worldcover-osogbo.png and data/worldcover_osogbo.asc, then redeploy."
