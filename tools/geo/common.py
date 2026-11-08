"""Shared map projection and helpers for the Sundered Crowns geodata pipeline."""
import math, os, json
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CACHE = os.environ.get('GEO_CACHE', '/home/user/geo-cache')
OUT_PUBLIC = os.path.join(ROOT, 'public', 'map')
OUT_DATA = os.path.join(ROOT, 'public', 'data')

LON0, LON1 = -100.0, 70.0
LAT_N, LAT_S = 72.0, -38.0
W = 6144

def merc(lat):
    return math.asinh(math.tan(math.radians(lat)))

YMAX, YMIN = merc(LAT_N), merc(LAT_S)
H = int(round(W * (YMAX - YMIN) / math.radians(LON1 - LON0)))
H -= H % 8

def lonlat_to_px(lon, lat):
    x = (lon - LON0) / (LON1 - LON0) * W
    y = (YMAX - merc(lat)) / (YMAX - YMIN) * H
    return x, y

def lonlat_to_px_np(lon, lat):
    lon = np.asarray(lon, dtype=np.float64); lat = np.asarray(lat, dtype=np.float64)
    x = (lon - LON0) / (LON1 - LON0) * W
    y = (YMAX - np.arcsinh(np.tan(np.radians(lat)))) / (YMAX - YMIN) * H
    return x, y

def px_to_lonlat_np(x, y):
    lon = LON0 + np.asarray(x, dtype=np.float64) / W * (LON1 - LON0)
    Y = YMAX - np.asarray(y, dtype=np.float64) / H * (YMAX - YMIN)
    lat = np.degrees(np.arctan(np.sinh(Y)))
    return lon, lat

def km_per_px(lat):
    """Horizontal size of one map pixel in km at a latitude (Mercator: same vertically)."""
    return (LON1 - LON0) / W * 111.32 * np.cos(np.radians(lat))

def load_json(path, default=None):
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    return default

def polys_from_geojson_geom(geom):
    """Yield polygons as list of rings (each ring a list of (lon,lat))."""
    t = geom['type']
    if t == 'Polygon':
        yield geom['coordinates']
    elif t == 'MultiPolygon':
        for p in geom['coordinates']:
            yield p

def lines_from_geojson_geom(geom):
    t = geom['type']
    if t == 'LineString':
        yield geom['coordinates']
    elif t == 'MultiLineString':
        for l in geom['coordinates']:
            yield l
