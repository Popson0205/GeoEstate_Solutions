#!/usr/bin/env python3
"""Extract the 30 Osun LGAs from the national geoBoundaries ADM2 file and simplify them for the app.
Usage:  python3 scripts/prepare-lga.py path/to/geoBoundaries-NGA-ADM2.geojson
Output: data/lga_osun.json (+ public/lga-osun.geojson for the map). LGAs are picked by centroid-inside-Osun using the Osun polygon in data/snapshot.json."""
import sys, os, json
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOL = 0.0003   # ~30 m, one DEM cell
g = json.load(open(sys.argv[1])); snap = json.load(open(os.path.join(root, "data", "snapshot.json")))
osun = [a for a in snap["adm1"] if a["name"] == "Osun"][0]
def pip(x, y, ring):
    ins = False; j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][:2]; xj, yj = ring[j][:2]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi: ins = not ins
        j = i
    return ins
def polys(geom): return [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
def centroid(geom):
    best = None
    for poly in polys(geom):
        r = poly[0]; a = cx = cy = 0
        for i in range(len(r) - 1):
            x0, y0 = r[i][:2]; x1, y1 = r[i + 1][:2]; c = x0 * y1 - x1 * y0; a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c
        if a == 0: continue
        a /= 2; cx /= 6 * a; cy /= 6 * a
        if best is None or abs(a) > best[0]: best = (abs(a), cx, cy)
    return best[1], best[2]
def dp(pts, tol):
    if len(pts) < 5: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True; stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop(); (ax, ay), (bx, by) = pts[a][:2], pts[b][:2]; dx, dy = bx - ax, by - ay; d2 = dx * dx + dy * dy; md, mi = 0, -1
        for i in range(a + 1, b):
            px, py = pts[i][:2]
            d = abs((px - ax) * dy - (py - ay) * dx) / (d2 ** .5) if d2 else ((px - ax) ** 2 + (py - ay) ** 2) ** .5
            if d > md: md, mi = d, i
        if md > tol and mi > 0: keep[mi] = True; stack += [(a, mi), (mi, b)]
    out = [p for p, k in zip(pts, keep) if k]
    return out if len(out) >= 4 else pts
feats = []
for f in g["features"]:
    cx, cy = centroid(f["geometry"])
    if not (4.0 <= cx <= 5.2 and 6.9 <= cy <= 8.2): continue
    if not (pip(cx, cy, osun["c"][0]) and not any(pip(cx, cy, h) for h in osun["c"][1:])): continue
    P = [[[[round(x, 5), round(y, 5)] for x, y in dp(r, TOL)] for r in poly] for poly in polys(f["geometry"])]
    feats.append({"type": "Feature", "properties": {"name": f["properties"]["shapeName"], "id": f["properties"]["shapeID"]},
                  "geometry": {"type": "MultiPolygon", "coordinates": P}})
feats.sort(key=lambda x: x["properties"]["name"])
fc = {"type": "FeatureCollection", "features": feats}
for p in (os.path.join(root, "data", "lga_osun.json"), os.path.join(root, "public", "lga-osun.geojson")): json.dump(fc, open(p, "w"), separators=(",", ":"))
print(len(feats), "LGAs;", os.path.getsize(os.path.join(root, "data", "lga_osun.json")) // 1024, "KB;", sum(len(r) for f in feats for p in f["geometry"]["coordinates"] for r in p), "vertices")
