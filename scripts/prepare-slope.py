#!/usr/bin/env python3
"""One-time: convert the ALOS slope GeoTIFF (degrees, float32) into a compact grid for the app.
Usage:  python3 scripts/prepare-slope.py path/to/alos_slope_deg_osun.tif
Needs:  pip install pillow numpy tifffile
Output: data/slope_osun.bin.gz  (uint8 = slope deg x 4, 255 = no data)
        data/slope_osun.json    (grid header)
"""
import sys, json, gzip
import numpy as np
from PIL import Image
import tifffile
Image.MAX_IMAGE_PIXELS = None
src = sys.argv[1]
a = np.array(Image.open(src), dtype="float32")          # rows = north -> south
tags = tifffile.TiffFile(src).pages[0].tags
sx, sy, _ = tags[33550].value                            # ModelPixelScale
_, _, _, x0, y0, _ = tags[33922].value                   # ModelTiepoint (top-left corner)
nrows, ncols = a.shape
q = np.full(a.shape, 255, dtype="uint8")
ok = np.isfinite(a)
q[ok] = np.clip(np.rint(a[ok] * 4), 0, 254).astype("uint8")   # 0.25 deg steps, max 63.5 deg
with gzip.open("data/slope_osun.bin.gz", "wb", 9) as f: f.write(q.tobytes())
json.dump({"ncols": ncols, "nrows": nrows, "west": x0, "north": y0, "cellX": sx, "cellY": sy, "scale": 4, "nodata": 255,
           "source": "ALOS slope (degrees), Osun State"}, open("data/slope_osun.json", "w"), indent=1)
print(ncols, nrows, "valid cells:", int(ok.sum()), "bounds E/S:", x0 + ncols * sx, y0 - nrows * sy)
