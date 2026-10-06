#!/usr/bin/env python3
"""Convert the Earth Engine export (scripts/gee/export_flood_observed_osun.js) into the compact grid the app reads.
Usage:  python3 scripts/prepare-flood-observed.py path/to/flood_observed_osun.tif
Needs:  pip install numpy tifffile pillow   (imagecodecs optional - Pillow is used to read LZW-compressed exports)
Output: data/flood_observed_osun.bin.gz   4 planar uint8 bands on the same grid as slope/terrain:
        jrc_occurrence | gfd_events | s1_wet_pct | s1_dry_pct
        data/flood_observed_osun.json
If the export's grid is shifted/cropped relative to the master grid it is aligned by whole cells; anything else is rejected."""
import sys, os, json, gzip
import numpy as np, tifffile
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
master = json.load(open(os.path.join(root, "data", "flood_terrain_osun.json")))     # master grid (= ALOS grid)
t = tifffile.TiffFile(sys.argv[1]); pg = t.pages[0]
try:
    a = t.asarray()
except ValueError:                                  # LZW without imagecodecs: a 4-band uint8 TIFF opens as RGBA in Pillow
    a = np.array(Image.open(sys.argv[1]))
if a.ndim == 3 and a.shape[-1] == 4 and a.shape[0] != 4: a = np.moveaxis(a, -1, 0)   # pixel-interleaved -> planar
if a.ndim != 3 or a.shape[0] != 4: sys.exit(f"expected 4 bands, got shape {a.shape}")
a = a.astype("uint8")
sx, sy, _ = pg.tags[33550].value; _, _, _, x0, y0, _ = pg.tags[33922].value
if abs(sx - master["cellX"]) > 1e-9 or abs(sy - master["cellY"]) > 1e-9: sys.exit("cell size differs from the ALOS grid - re-export using the provided script")
dc, dr = (x0 - master["west"]) / sx, (master["north"] - y0) / sy
if abs(dc - round(dc)) > 0.05 or abs(dr - round(dr)) > 0.05: sys.exit("export is not aligned to the ALOS grid - re-export using the provided script")
dc, dr = int(round(dc)), int(round(dr)); W, H = master["ncols"], master["nrows"]
out = np.zeros((4, H, W), "uint8")
h, w = a.shape[1:]
r0, c0 = max(dr, 0), max(dc, 0); r1, c1 = min(dr + h, H), min(dc + w, W)
out[:, r0:r1, c0:c1] = a[:, r0 - dr:r1 - dr, c0 - dc:c1 - dc]
print("export", (w, h), "offset", (dc, dr), "-> master", (W, H))
with gzip.open(os.path.join(root, "data", "flood_observed_osun.bin.gz"), "wb", 9) as f: f.write(out.tobytes())
json.dump({"ncols": W, "nrows": H, "west": master["west"], "north": master["north"], "cellX": master["cellX"], "cellY": master["cellY"],
           "bands": ["jrc_occurrence", "gfd_events", "s1_wet_pct", "s1_dry_pct"], "source": "JRC GSW, Global Flood Database, Sentinel-1 (via Google Earth Engine)"},
          open(os.path.join(root, "data", "flood_observed_osun.json"), "w"), indent=1)
for i, n in enumerate(["jrc_occurrence", "gfd_events", "s1_wet_pct", "s1_dry_pct"]):
    b = out[i]; print(f"{n:15s} max {b.max():3d}  cells>0: {100*(b>0).mean():.2f}%")
