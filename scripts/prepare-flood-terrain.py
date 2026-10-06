#!/usr/bin/env python3
"""Terrain-based flood susceptibility layers from the ALOS DEM (one-time).
Usage:  python3 scripts/prepare-flood-terrain.py path/to/alos_elevation_osun.tif [stream_km2=0.5]
Needs:  gcc, pip install pillow numpy scipy tifffile ; data/slope_osun.bin.gz (run prepare-slope.py first)
Output: data/flood_terrain_osun.bin.gz   3 planar uint8 bands:  HAND (m x2) | TWI (x4) | relief (m + 20, clipped +-20)   255 = no data
        data/flood_terrain_osun.json     grid header
"""
import sys, os, json, gzip, subprocess, tempfile
import numpy as np
from PIL import Image
from scipy.ndimage import uniform_filter
import tifffile
Image.MAX_IMAGE_PIXELS = None
src = sys.argv[1]; stream_km2 = float(sys.argv[2]) if len(sys.argv) > 2 else 0.5
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
dem = np.array(Image.open(src)).astype("int16")          # 0 = no data
tags = tifffile.TiffFile(src).pages[0].tags
sx, sy, _ = tags[33550].value; _, _, _, x0, y0, _ = tags[33922].value
H, W = dem.shape
tmp = tempfile.mkdtemp()
exe = os.path.join(tmp, "hydro")
subprocess.check_call(["gcc", "-O2", "-o", exe, os.path.join(here, "flood", "hydro.c"), "-lm"])
dem.tofile(os.path.join(tmp, "dem.i16"))
with gzip.open(os.path.join(root, "data", "slope_osun.bin.gz")) as f: open(os.path.join(tmp, "slope.u8"), "wb").write(f.read())
subprocess.check_call([exe, os.path.join(tmp, "dem.i16"), os.path.join(tmp, "slope.u8"), str(W), str(H), str(y0), str(sx), str(sy), str(stream_km2), tmp])
hand = np.fromfile(os.path.join(tmp, "hand.u8"), "uint8").reshape(H, W)
twi = np.fromfile(os.path.join(tmp, "twi.u8"), "uint8").reshape(H, W)
acc = np.fromfile(os.path.join(tmp, "acc.i32"), "int32").reshape(H, W)

# Local relief: elevation minus mean elevation within ~500 m (33x33 cells). Negative = sits in a hollow.
valid = dem != 0
z = np.where(valid, dem, 0).astype("float32")
k = 33
mean = uniform_filter(z, k, mode="nearest") / np.maximum(uniform_filter(valid.astype("float32"), k, mode="nearest"), 1e-3)
relief = np.clip(np.rint(z - mean) + 20, 0, 40).astype("uint8")   # -20..+20 m, 1 m steps; relief[~valid] = 255
del mean, z

with gzip.open(os.path.join(root, "data", "flood_terrain_osun.bin.gz"), "wb", 9) as f:
    twi = np.where(twi == 255, 255, np.minimum(np.rint(twi / 2.0), 120)).astype("uint8")   # TWI x4 (0.25 steps), capped at 30
    for b in (hand, twi, relief): f.write(b.tobytes())
json.dump({"ncols": W, "nrows": H, "west": x0, "north": y0, "cellX": sx, "cellY": sy, "streamKm2": stream_km2,
           "bands": ["hand_m_x2", "twi_x4", "relief_m_plus20"], "nodata": 255,
           "source": "ALOS DEM, priority-flood + D8 (GeoEstate)"}, open(os.path.join(root, "data", "flood_terrain_osun.json"), "w"), indent=1)

v = valid
cell_m2 = (sx * 111320 * np.cos(np.radians(y0 - (np.arange(H) + .5) * sy)))[:, None] * (sy * 110574)
stream = (acc * cell_m2 >= stream_km2 * 1e6) & valid
print("valid", int(v.sum()), "stream cells", int(stream.sum()), "(%.1f%%)" % (100 * stream.sum() / v.sum()))
print("HAND m percentiles 5/25/50/75/95:", np.percentile(hand[v] / 2, [5, 25, 50, 75, 95]))
print("share HAND<2m: %.1f%%  <5m: %.1f%%" % (100 * (hand[v] < 4).mean(), 100 * (hand[v] < 10).mean()))
print("TWI percentiles:", np.percentile(twi[v] / 4, [5, 50, 95]))
