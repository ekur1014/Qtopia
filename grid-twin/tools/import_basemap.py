#!/usr/bin/env python3
"""A small vector basemap (state lines, rivers and lakes, main roads, town names) for the real map, so the grid
always sits on the real geography, even where map tiles cannot load (offline, or the claude.ai preview, which
blocks images from other sites). Standard library only.

  python3 grid-twin/tools/import_basemap.py --fetch   # query Overpass, keep the raw replies in data/osm/
  python3 grid-twin/tools/import_basemap.py           # raw replies -> data/basemap/<region>.js (window.QRYPT_BASEMAP)

Data (c) OpenStreetMap contributors, available under the Open Database License (ODbL).
"""
import json
import math
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]

REGIONS = {
    "chattanooga": {
        "bbox": (34.84, -85.62, 35.36, -84.86),
        "tol": 0.00025,  # simplification tolerance in degrees (about 25 m)
        "min_water": 0.006,  # drop ponds smaller than this (bbox diagonal, degrees, about 600 m)
        "queries": [
            ("""way["highway"~"^(motorway|trunk|primary)$"]({b});
                way["waterway"="river"]({b});
                way["natural"="water"]["water"~"^(river|reservoir|lake)$"]({b});
                node["place"~"^(city|town|suburb)$"]({b});
                relation["boundary"="administrative"]["admin_level"="4"]({b});""", "out geom({b});"),
            # Lakes and the river are multipolygons: fetch them whole so their rings can be stitched closed.
            ("""relation["natural"="water"]["water"~"^(river|reservoir|lake)$"]({b});""", "out geom;"),
        ],
    },
    "tennessee500": {
        "bbox": (34.70, -90.60, 36.90, -81.40),
        "tol": 0.004,  # about 400 m
        "min_water": 0.08,
        "queries": [
            ("""way["waterway"="river"]["name"~"^(Tennessee|Cumberland|Mississippi|Clinch|Holston|French Broad|Duck|Hiwassee|Elk|Little Tennessee|Caney Fork|Obion|Hatchie|Big Sandy) River$"]({b});
                way["highway"="motorway"]["ref"~"^I [0-9]+"]({b});
                node["place"="city"]({b});
                relation["boundary"="administrative"]["admin_level"="4"]({b});""", "out geom({b});"),
        ],
    },
}


def fetch(region):
    r = REGIONS[region]
    s, w, n, e = r["bbox"]
    b = f"{s},{w},{n},{e}"
    elements = []
    for body, out_stmt in r["queries"]:
        elements += query(region, f"[out:json][timeout:180];({body.format(b=b)});{out_stmt.format(b=b)}")["elements"]
    out = ROOT / "data" / "osm" / f"basemap_{region}.overpass.json"
    out.write_text(json.dumps({"elements": elements}))
    print(f"{region}: {len(elements)} elements -> {out.relative_to(ROOT)}")


def query(region, q):
    raw, last = None, None
    for url in OVERPASS:  # the main server is often busy; try the public mirrors in turn
        try:
            req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": "qrypt-basemap/1.0"})
            with urllib.request.urlopen(req, timeout=240) as resp:
                raw = resp.read()
            break
        except Exception as err:  # noqa: BLE001
            last = err
            print(f"{region}: {url} failed ({err}), trying the next server")
    if raw is None:
        raise SystemExit(f"{region}: every Overpass server failed: {last}")
    return json.loads(raw)


def simplify(pts, tol):
    """Douglas-Peucker on [lat, lon] points. A closed ring is split at its farthest point first (its two ends
    coincide, so every point would measure zero distance from the chord)."""
    if len(pts) < 3:
        return pts
    if pts[0] == pts[-1]:
        k = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
        if k in (0, len(pts) - 1):
            return pts[:1]
        return simplify(pts[: k + 1], tol)[:-1] + simplify(pts[k:], tol)
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        (ay, ax), (by, bx) = pts[i], pts[j]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy) or 1e-12
        best, idx = 0.0, None
        for k in range(i + 1, j):
            py, px = pts[k]
            d = abs(dy * (px - ax) - dx * (py - ay)) / norm
            if d > best:
                best, idx = d, k
        if idx is not None and best > tol:
            keep[idx] = True
            stack += [(i, idx), (idx, j)]
    return [p for p, k in zip(pts, keep) if k]


def line(geom, tol):
    pts = [[round(g["lat"], 5), round(g["lon"], 5)] for g in geom if g]
    return simplify(pts, tol)


def split_gaps(geom):
    """Clipped geometry marks nodes outside the box as null: split the way there."""
    pieces, cur = [], []
    for g in geom:
        if g is None:
            if len(cur) > 1:
                pieces.append(cur)
            cur = []
        else:
            cur.append(g)
    if len(cur) > 1:
        pieces.append(cur)
    return pieces


def stitch(ways):
    """Join open ways that share end points into closed rings (OSM multipolygon outers)."""
    key = lambda g: (round(g["lat"], 7), round(g["lon"], 7))
    segs = [[g for g in w if g] for w in ways]
    segs = [s for s in segs if len(s) > 1]
    rings = []
    while segs:
        ring = segs.pop()
        closed = key(ring[0]) == key(ring[-1])
        while not closed:
            end = key(ring[-1])
            for i, s in enumerate(segs):
                if key(s[0]) == end:
                    ring += s[1:]
                    break
                if key(s[-1]) == end:
                    ring += list(reversed(s))[1:]
                    break
            else:
                break  # cannot close: leave it open
            segs.pop(i)
            closed = key(ring[0]) == key(ring[-1])
        if closed:
            rings.append(ring)
    return rings


def clip(pts, bbox, margin=0.05):
    """Sutherland-Hodgman: clip a closed ring to the box (plus a margin) so a river polygon hundreds of km long
    keeps only the part on the map."""
    s, w, n, e = bbox[0] - margin, bbox[1] - margin, bbox[2] + margin, bbox[3] + margin
    edges = [(0, s, True), (0, n, False), (1, w, True), (1, e, False)]
    ring = pts[:-1] if pts and pts[0] == pts[-1] else pts
    for axis, v, keep_above in edges:
        if not ring:
            break
        inside = (lambda p: p[axis] >= v) if keep_above else (lambda p: p[axis] <= v)
        out = []
        for i, cur in enumerate(ring):
            prev = ring[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(cross(prev, cur, axis, v))
                out.append(cur)
            elif inside(prev):
                out.append(cross(prev, cur, axis, v))
        ring = out
    return ring + ring[:1] if ring else []


def cross(a, b, axis, v):
    t = (v - a[axis]) / ((b[axis] - a[axis]) or 1e-12)
    return [round(a[0] + t * (b[0] - a[0]), 5), round(a[1] + t * (b[1] - a[1]), 5)]


def overlaps(pts, bbox):
    s, w, n, e = bbox
    ys = [p[0] for p in pts]
    xs = [p[1] for p in pts]
    return min(ys) < n and max(ys) > s and min(xs) < e and max(xs) > w


def diag(pts):
    ys = [p[0] for p in pts]
    xs = [p[1] for p in pts]
    return math.hypot(max(ys) - min(ys), max(xs) - min(xs))


def build(region):
    r = REGIONS[region]
    raw = json.loads((ROOT / "data" / "osm" / f"basemap_{region}.overpass.json").read_text())
    tol = r["tol"]
    base = {"bbox": r["bbox"], "water": [], "rivers": [], "borders": [], "roads": {"motorway": [], "trunk": [], "primary": []}, "places": []}
    seen_place = set()
    for el in raw["elements"]:
        tags = el.get("tags", {})
        if el["type"] == "node":
            name = tags.get("name")
            if name and name not in seen_place:
                seen_place.add(name)
                base["places"].append({"name": name, "kind": tags.get("place"), "ll": [round(el["lat"], 4), round(el["lon"], 4)]})
            continue
        if el["type"] == "way":
            pts = line(el.get("geometry", []), tol)
            if len(pts) < 2:
                continue
            if tags.get("natural") == "water":
                if pts[0] == pts[-1] and len(pts) > 3 and diag(pts) >= r["min_water"]:
                    base["water"].append(pts)
            elif tags.get("waterway") == "river":
                base["rivers"].append(pts)
            elif tags.get("boundary") == "administrative":
                base["borders"].append(pts)
            elif tags.get("highway") in base["roads"]:
                base["roads"][tags["highway"]].append(pts)
        elif el["type"] == "relation" and tags.get("boundary") == "administrative":
            for m in el.get("members", []):
                if m.get("type") != "way" or not m.get("geometry"):
                    continue
                for piece in split_gaps(m["geometry"]):
                    pts = line(piece, tol)
                    if len(pts) >= 2:
                        base["borders"].append(pts)
        elif el["type"] == "relation" and tags.get("natural") == "water":
            # Multipolygon water (the Tennessee River and its lakes): stitch the outer ways into closed rings.
            for ring in stitch([m["geometry"] for m in el.get("members", []) if m.get("role") == "outer" and m.get("geometry")]):
                pts = clip(line(ring, tol), r["bbox"])
                if len(pts) > 3 and diag(pts) >= r["min_water"] and overlaps(pts, r["bbox"]):
                    base["water"].append(pts)
    out = ROOT / "data" / "basemap" / f"{region}.js"
    out.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(base, separators=(",", ":"))
    out.write_text(
        "// Generated by grid-twin/tools/import_basemap.py. Data (c) OpenStreetMap contributors, ODbL.\n"
        f"(window.QRYPT_BASEMAP = window.QRYPT_BASEMAP || {{}})[{json.dumps(region)}] = {body};\n"
    )
    counts = {k: len(v) for k, v in base.items() if isinstance(v, list)}
    counts["roads"] = {k: len(v) for k, v in base["roads"].items()}
    print(f"{region}: {len(body) / 1e3:.0f} KB {counts}")


if __name__ == "__main__":
    for reg in REGIONS:
        if "--fetch" in sys.argv:
            fetch(reg)
        build(reg)
