#!/usr/bin/env python3
"""Build the map overlay for the Flood indicator layer from the flood grids (run after prepare-flood-terrain.py,
and again after prepare-flood-observed.py to include satellite water bodies).
Usage:  python3 scripts/prepare-flood-overlay.py
Output: data/flood_class_osun.bin.gz (per-cell classes, used by GeoAI area analysis)
        public/flood-overlay-osun.png   (half resolution, ~60 m) + public/flood-overlay-osun.json (bounds)
Classes drawn (same scoring as lib/flood.ts): water body > modelled stream > High > Moderate."""
import os, json, gzip
import numpy as np
from PIL import Image
from scipy.ndimage import uniform_filter, maximum_filter
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
m = json.load(open(os.path.join(root, "data", "flood_terrain_osun.json"))); W, H = m["ncols"], m["nrows"]
T = np.frombuffer(gzip.open(os.path.join(root, "data", "flood_terrain_osun.bin.gz")).read(), "uint8").reshape(3, H, W)
hand8, twi8, rel8 = T
valid = hand8 != 255
def mean3(b, scale, offset=0.0):
    ok = (b != 255)
    num = uniform_filter(np.where(ok, b, 0).astype("float32"), 3, mode="nearest"); den = uniform_filter(ok.astype("float32"), 3, mode="nearest")
    return num / np.maximum(den, 1e-6) / scale - offset
hand = mean3(hand8, 2); twi = mean3(twi8, 4); rel = mean3(rel8, 1, 20)
hs = np.interp(hand, [0, 2, 5, 10, 15, 20], [100, 85, 60, 30, 10, 0])
ts = np.clip((twi - 6) / 8 * 100, 0, 100); rs = np.clip((4 - rel) / 8 * 100, 0, 100)
score = np.rint(hs * .55 + ts * .2 + rs * .25)
water = np.zeros((H, W), bool)
obs_path = os.path.join(root, "data", "flood_observed_osun.bin.gz")
if os.path.exists(obs_path):
    O = np.frombuffer(gzip.open(obs_path).read(), "uint8").reshape(4, H, W)
    occ = maximum_filter(O[0], 5); ev = maximum_filter(O[1], 11)
    sea = np.maximum(0, uniform_filter(O[2].astype("float32"), 3) - uniform_filter(O[3].astype("float32"), 3))
    e = np.zeros((H, W), "float32")
    e = np.where(occ >= 5, 70, e); e = np.where(occ >= 25, 90, e); e = np.where(occ >= 90, 100, e)
    e = np.where((ev >= 1) & (e < 65), 65, e); e = np.where((ev >= 2) & (e < 85), 85, e); e = np.where((sea >= 25) & (e < 75), 75, e)
    score = np.maximum(score, e); water = O[0] >= 25
    print("observed evidence included")
cls = np.zeros((H, W), "uint8")
cls[(score >= 35)] = 2; cls[(score >= 65)] = 3; cls[hand8 == 0] = 4; cls[water] = 5; cls[~valid] = 0
# Per-cell class grid for the app's area analysis (GeoAI): 0 low, 2 moderate, 3 high, 4 stream, 5 water body, 255 no data
full = cls.copy(); full[~valid] = 255
with gzip.open(os.path.join(root, "data", "flood_class_osun.bin.gz"), "wb", 9) as f: f.write(full.tobytes())
# half resolution, keeping the highest class in each 2x2 block so thin streams survive
H2, W2 = (H + 1) // 2, (W + 1) // 2
pad = np.zeros((H2 * 2, W2 * 2), "uint8"); pad[:H, :W] = cls
c2 = pad.reshape(H2, 2, W2, 2).max(axis=(1, 3))
PAL = {2: (125, 200, 222, 70), 3: (22, 138, 173, 135), 4: (12, 74, 110, 235), 5: (0, 90, 190, 225)}
rgba = np.zeros((H2, W2, 4), "uint8")
for k, col in PAL.items(): rgba[c2 == k] = col
Image.fromarray(rgba, "RGBA").save(os.path.join(root, "public", "flood-overlay-osun.png"), optimize=True)
b = {"west": m["west"], "north": m["north"], "east": m["west"] + W2 * 2 * m["cellX"], "south": m["north"] - H2 * 2 * m["cellY"]}
json.dump({"bounds": b, "classes": {"2": "Moderate", "3": "High", "4": "Modelled stream", "5": "Water body (satellite)"}}, open(os.path.join(root, "public", "flood-overlay-osun.json"), "w"))
tot = valid.sum()
for k, n in ((2, "Moderate"), (3, "High"), (4, "stream"), (5, "water")): print(f"{n:9s} {100 * (cls == k).sum() / tot:5.1f}% of Osun")
print("png", rgba.shape[1], "x", rgba.shape[0], "bounds", {k: round(v, 4) for k, v in b.items()})
