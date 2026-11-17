#!/usr/bin/env python3
"""A still of the far map as an atlas, painted from the world's data alone (no voxels): relief as hillshade, land
cover as soft tints, sea with a light shallow, rivers as lines, the realms as fills with borders from a distance
field. It is a probe of the look (docs: the concept "Ferne Karte auf Stand 2026"), outside the game; names and town
signs are laid over it by tools/atlas/labels.ts.

Run: python3 tools/atlas/probe.py <out> <lon> <lat> <wide> <political|terrain> [w h year]
  wide: finest blocks across the picture, as in the world probe (16 of them make a map pixel).
Writes <out>.base.png and <out>.frame.json.
"""
import gzip, json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
PUB = os.path.join(ROOT, 'public')
out, lon, lat, wide, mode = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), sys.argv[5]
W, H = (int(sys.argv[6]), int(sys.argv[7])) if len(sys.argv) > 7 else (1280, 720)
year = int(sys.argv[8]) if len(sys.argv) > 8 else 1291
BLOCKS_PER_MAP_PIXEL = 16
index = json.load(open(f'{PUB}/map/regions/world/index.json'))
T, CELLS, MAPW, MAPH, WORLDW = index['tile'], index['cells'], index['mapW'], index['mapH'], index['worldW']

# ---------------------------------------------------------------- the frame
merc = lambda d: math.asinh(math.tan(math.radians(d)))
def map_pixel(lon, lat):
    span = index['lon1'] - index['lon0']
    return ((lon - index['lon0']) / span * MAPW, (merc(index['latN']) - merc(lat)) / (merc(index['latN']) - merc(index['latS'])) * MAPH)
def lat_of(my):
    return math.degrees(math.atan(math.sinh(merc(index['latN']) - my / MAPH * (merc(index['latN']) - merc(index['latS'])))))
mx, my = map_pixel(lon, lat)
mpp = wide / BLOCKS_PER_MAP_PIXEL / W            # map pixels to a pixel of the picture
x0, y0 = mx - W / 2 * mpp, my - H / 2 * mpp      # the picture's north-west corner, in map pixels
# the picture's pixels, in map pixels (centres)
PX = x0 + (np.arange(W) + 0.5) * mpp
PY = y0 + (np.arange(H) + 0.5) * mpp
metres = mpp * 770 * CELLS * math.cos(math.radians(lat))  # a pixel of the picture on the ground, about

# ---------------------------------------------------------------- the land's data, at the level whose cells are about a pixel
z = int(max(0, min(7, round(math.log2(max(1e-9, mpp * CELLS))))))
cpm = CELLS / 2 ** z                              # cells of this level to a map pixel
MARGIN = 8
cx0, cy0 = int(math.floor(x0 * cpm)) - MARGIN, int(math.floor(y0 * cpm)) - MARGIN
cw, ch = int(math.ceil(W * mpp * cpm)) + 2 * MARGIN + 2, int(math.ceil(H * mpp * cpm)) + 2 * MARGIN + 2
have = set(index['tiles'])
def tile(tx, ty):
    name = f'{tx}_{ty}'
    d = f'{PUB}/map/regions/world/' + (f'z{z}/' if z else '')
    p = d + name + '.bin.gz'
    if not os.path.exists(p): return None, []
    raw = gzip.open(p).read(); t = T * T
    lay = lambda k: np.frombuffer(raw, np.uint8, t, t * (2 + k)).reshape(T, T)
    rivers = json.load(open(d + name + '.json')) if os.path.exists(d + name + '.json') else []
    return (np.frombuffer(raw, '<i2', t).reshape(T, T), lay(0), lay(1), lay(2), lay(3)), rivers
height = np.zeros((ch, cw), np.float32); water = np.ones((ch, cw), np.uint8)
forest = np.zeros((ch, cw), np.float32); crops = np.zeros((ch, cw), np.float32)
rivers = []
for ty in range(cy0 // T, (cy0 + ch - 1) // T + 1):
    for tx in range(cx0 // T, (cx0 + cw - 1) // T + 1):
        layers, rs = tile(tx, ty)
        if layers is None: continue
        ax0, ay0 = max(cx0, tx * T), max(cy0, ty * T); ax1, ay1 = min(cx0 + cw, tx * T + T), min(cy0 + ch, ty * T + T)
        src = (slice(ay0 - ty * T, ay1 - ty * T), slice(ax0 - tx * T, ax1 - tx * T)); dst = (slice(ay0 - cy0, ay1 - cy0), slice(ax0 - cx0, ax1 - cx0))
        height[dst] = layers[0][src]; water[dst] = layers[2][src]; forest[dst] = layers[3][src] / 255; crops[dst] = layers[4][src] / 255
        rivers += rs
# cell coordinates of the picture's pixels within the window
GX = (PX * cpm - cx0 - 0.5)[None, :].repeat(H, 0); GY = (PY * cpm - cy0 - 0.5)[:, None].repeat(W, 1)
samp = lambda a, order=1: ndi.map_coordinates(a, [GY, GX], order=order, mode='nearest')

sea_c = ndi.gaussian_filter((water == 1).astype(np.float32), 0.7); lake_c = ndi.gaussian_filter((water == 2).astype(np.float32), 0.6)
sea = samp(sea_c) > 0.5; lake = (samp(lake_c) > 0.5) & ~sea; wet = sea | lake; land = ~wet
hgt = samp(ndi.gaussian_filter(height, 0.6), 3)
hgt = ndi.gaussian_filter(hgt, 0.8)
broad = ndi.gaussian_filter(hgt, 3.0)   # the land's large forms, without the creases of every valley
woods = np.clip(samp(ndi.gaussian_filter(forest, 1.5)), 0, 1); fields = np.clip(samp(ndi.gaussian_filter(crops, 1.5)), 0, 1)

# ---------------------------------------------------------------- relief: a hillshade lit from the north-west
# steeper than life, the more so the more ground a pixel spans, so that mountains stay mountains from far away
EX = 6.0 * (metres / 400) ** 0.7
def hillshade(h):
    gy, gx = np.gradient(h); sx, sy = gx / metres * EX, gy / metres * EX; norm = np.sqrt(sx * sx + sy * sy + 1)
    def lit(az, alt):
        a, e = math.radians(az), math.radians(alt)
        lx, ly, lz = math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)   # x east, y south in the picture
        return (-sx * lx - sy * ly + lz) / norm / lz
    return 0.6 * lit(315, 45) + 0.25 * lit(350, 50) + 0.15 * lit(270, 50)   # 1 on level ground
relief = np.clip(0.6 * hillshade(hgt) + 0.4 * hillshade(broad), 0.3, 1.5)

# ---------------------------------------------------------------- colours (sRGB 0 … 255, mixed in linear light)
lin = lambda c: np.where(np.asarray(c, np.float32) / 255 <= 0.04045, np.asarray(c, np.float32) / 255 / 12.92, ((np.asarray(c, np.float32) / 255 + 0.055) / 1.055) ** 2.4)
srgb = lambda v: np.where(v <= 0.0031308, v * 12.92, 1.055 * np.clip(v, 0, None) ** (1 / 2.4) - 0.055)
mix = lambda a, b, t: a + (b - a) * (t[..., None] if isinstance(t, np.ndarray) else t)

# the kinds of land (climate.ts) and the lines of trees and snow, over the world frame
cl = np.frombuffer(gzip.open(f'{PUB}/map/climate.bin.gz').read(), np.uint8).reshape(index['worldH'] // 2, WORLDW // 2)
kx = np.clip((PX / 2).astype(int), 0, cl.shape[1] - 1); ky = np.clip((PY / 2).astype(int), 0, cl.shape[0] - 1)
kind = cl[np.ix_(ky, kx)] & 63
def line(name):
    a = np.frombuffer(gzip.open(f'{PUB}/map/{name}.bin.gz').read(), np.uint8).reshape(index['worldH'] // 16, WORLDW // 16).astype(np.float32) * 32
    return ndi.map_coordinates(a, [(PY / 16 - 0.5)[:, None].repeat(W, 1), (PX / 16 - 0.5)[None, :].repeat(H, 0)], order=1, mode='nearest')
treeline, snowline = line('treeline'), line('snowline')

WOODS_C, FIELDS_C, ROCK, SNOW, HIGH = lin((112, 150, 96)), lin((236, 222, 164)), lin((172, 164, 154)), lin((246, 248, 250)), lin((204, 192, 156))
# the ground as in a physical atlas: green lowlands, buff hills, brown mountains; dry lands buff from the plain up
RAMP = [(0, (170, 200, 132)), (150, (190, 210, 146)), (400, (216, 218, 162)), (800, (226, 208, 156)), (1500, (206, 180, 138)), (2400, (184, 164, 142)), (9000, (184, 164, 142))]
terrain = np.stack([np.interp(hgt, [m for m, _ in RAMP], [float(lin(c)[k]) for _, c in RAMP]) for k in range(3)], -1).astype(np.float32)
DRY = {2: ((222, 212, 160), 0.35), 3: ((224, 212, 166), 0.75), 4: ((234, 218, 178), 1.0), 5: ((214, 204, 144), 0.6), 7: ((176, 196, 150), 0.5), 8: ((196, 196, 174), 0.85), 9: ((240, 243, 246), 1.0), 10: ((208, 210, 150), 0.45), 6: ((130, 178, 106), 0.6)}
dry_c = np.zeros((H, W, 3), np.float32); dry_w = np.zeros((H, W), np.float32)
for k, (c, w) in DRY.items(): dry_c[kind == k] = lin(c); dry_w[kind == k] = w
dry_c = np.stack([ndi.gaussian_filter(dry_c[..., c], 3) for c in range(3)], -1); dry_w = ndi.gaussian_filter(dry_w, 3)
terrain = mix(terrain, dry_c / np.maximum(ndi.gaussian_filter((dry_w > 0).astype(np.float32), 3), 0.05)[..., None], np.clip(dry_w, 0, 1))
terrain = mix(terrain, FIELDS_C, np.clip(fields * 1.2, 0, 1) * 0.35)
terrain = mix(terrain, WOODS_C, np.clip(woods * 1.25, 0, 1) * 0.5 * np.clip((treeline - hgt) / 150 + 0.5, 0, 1))
terrain = mix(terrain, ROCK, np.clip((hgt - treeline) / 250, 0, 1) * 0.85)
terrain = mix(terrain, SNOW, np.clip((hgt - snowline) / 200 + 0.2, 0, 1) * (hgt > snowline - 200))

# ---------------------------------------------------------------- the realms: who holds every pixel, with smooth borders
raw = gzip.open(f'{PUB}/map/ids.bin.gz').read(); ids = np.frombuffer(raw, '<u2').reshape(MAPH, MAPW)
setup = json.load(open(f'{PUB}/data/setup_{year}.json'))
owner = np.array([-1 if o is None else o for o in setup['owner']], np.int32); lands = len(owner)
def label_of(kind_of):
    """The label of every pixel of the picture: of the four map pixels around it, the label with the most weight."""
    fx, fy = PX - 0.5, PY - 0.5
    ix, iy = np.floor(fx).astype(int), np.floor(fy).astype(int); tx, ty = (fx - ix)[None, :], (fy - iy)[:, None]
    def at(dy, dx):
        yy, xx = np.clip(iy + dy, 0, MAPH - 1), np.clip(ix + dx, 0, MAPW - 1)
        inside = ((iy + dy >= 0) & (iy + dy < MAPH))[:, None] & ((ix + dx >= 0) & (ix + dx < MAPW))[None, :]
        return np.where(inside, kind_of(ids[np.ix_(yy, xx)]), -2)
    labs = [at(0, 0), at(0, 1), at(1, 0), at(1, 1)]
    wts = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty]
    best, best_w = labs[0], np.zeros((H, W), np.float32) - 1
    for a in range(4):
        # water never wins over land: the coast is the land's own (finer) coast
        w = sum(np.where(labs[b] == labs[a], wts[b], 0) for b in range(4)) * np.where(labs[a] == -2, 0.001, 1)
        take = w > best_w; best = np.where(take, labs[a], best); best_w = np.where(take, w, best_w)
    return best
place_of = lambda v: np.where((v >= 1) & (v <= lands), v.astype(np.int32) - 1, -2)
realm_of = lambda v: np.where((v >= 1) & (v <= lands), owner[np.clip(v.astype(np.int32) - 1, 0, lands - 1)], -2)
def settle(lab):
    """Land the map knows as water takes the nearest land's label; the borders are rounded off."""
    known = lab != -2
    if known.any() and (~known & land).any():
        _, (iy, ix) = ndi.distance_transform_edt(~known, return_indices=True); lab = lab[iy, ix]
    return lab
realm = settle(label_of(realm_of)); place = settle(label_of(place_of))
def rounded(lab, r):
    """A label map whose borders are rounded: every pixel takes the label most common within r pixels of it (of the labels its neighbourhood holds)."""
    outl = lab.copy(); best = np.zeros(lab.shape, np.float32)
    edge = ndi.maximum_filter(lab, 5) != ndi.minimum_filter(lab, 5)
    for v in np.unique(lab[edge]):
        m = ndi.gaussian_filter((lab == v).astype(np.float32), r); take = edge & (m > best); outl[take] = v; best[take] = m[take]
    return outl
realm = rounded(realm, 1.6)
def border(lab):
    """Distance in pixels to the nearest border between two labels, from the pixels' centres."""
    e = np.zeros(lab.shape, bool)
    d = lab[:, 1:] != lab[:, :-1]; e[:, 1:] |= d; e[:, :-1] |= d
    d = lab[1:, :] != lab[:-1, :]; e[1:, :] |= d; e[:-1, :] |= d
    return ndi.distance_transform_edt(~e) + 0.5
d_realm = border(np.where(land, realm, -5)); d_place = border(np.where(land, place, -5))
d_coast_sea = ndi.distance_transform_edt(wet); d_coast_land = ndi.distance_transform_edt(land)
d_realm_land = border(realm)   # borders between realms only, not the coast

# a realm's colour, held in a band of lightness and chroma (OKLCH) so that no realm shouts and none is mud
def oklch_band(hexes, l_low, l_high, c_most):
    c = lin(np.array([[int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)] for h in hexes], np.float32))
    l = 0.4122214708 * c[:, 0] + 0.5363325363 * c[:, 1] + 0.0514459929 * c[:, 2]; m = 0.2119034982 * c[:, 0] + 0.6806995451 * c[:, 1] + 0.1073969566 * c[:, 2]; s = 0.0883024619 * c[:, 0] + 0.2817188376 * c[:, 1] + 0.6299787005 * c[:, 2]
    l, m, s = np.cbrt(l), np.cbrt(m), np.cbrt(s)
    L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s; A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s; B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    C = np.hypot(A, B); hue = np.arctan2(B, A)
    L = l_low + (l_high - l_low) * np.clip((L - 0.25) / 0.6, 0, 1); C = np.minimum(C, c_most)
    return L, C, hue
def from_oklch(L, C, hue):
    A, B = C * np.cos(hue), C * np.sin(hue)
    l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3; m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3; s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
    return np.clip(np.stack([4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s], -1), 0, 1)
L, C, hue = oklch_band([s['color'] for s in setup['states']], 0.64, 0.8, 0.085)
FILL = from_oklch(L, C, hue); EDGE = from_oklch(L - 0.17, np.minimum(C * 1.5, 0.13), hue); INK = from_oklch(L - 0.3, C * 0.9, hue)
SAND = lin((176, 168, 152))
has = realm >= 0
fill = np.where(has[..., None], FILL[np.clip(realm, 0, len(FILL) - 1)], SAND)
edge = np.where(has[..., None], EDGE[np.clip(realm, 0, len(FILL) - 1)], SAND * 0.8)
ink = np.where(has[..., None], INK[np.clip(realm, 0, len(FILL) - 1)], SAND * 0.55)

# ---------------------------------------------------------------- the picture
shade = lambda c, r, k: c * (1 + k * (r - 1))[..., None]
if mode == 'political':
    grey = (terrain * np.array([0.2126, 0.7152, 0.0722])).sum(-1, keepdims=True)
    img = mix(fill, fill * (grey / 0.55), 0.18)                     # a breath of the land's own lightness
    band = np.clip(1 - d_realm_land / 9.0, 0, 1) ** 1.6
    img = mix(img, edge, band * 0.75)                               # the seam inside the border
    if mpp < 0.8: img = mix(img, edge, np.clip(1.15 - d_place, 0, 1) * 0.28)   # the places of a realm, faintly
    img = shade(img, relief, 0.78)
    img = mix(img, ink, np.clip(1.6 - d_realm_land, 0, 1) * 0.9)    # the border itself
else:
    grey = (terrain * np.array([0.2126, 0.7152, 0.0722])).sum(-1, keepdims=True)
    img = shade(np.clip(grey + (terrain - grey) * 1.3, 0, 1) * 1.06, relief, 0.95)   # a little fuller and lighter than the tints mix to
    band = np.clip(1 - d_realm_land / 7.0, 0, 1) ** 1.3
    img = mix(img, np.where(has[..., None], from_oklch(L, np.minimum(C * 1.6, 0.14), hue)[np.clip(realm, 0, len(FILL) - 1)], img), band * (0.5 if mpp < 0.4 else 0.38 if mpp < 0.8 else 0.26))   # a ribbon of the realm's colour
    img = mix(img, lin((70, 58, 48)) * np.ones_like(img), np.clip(1.3 - d_realm_land, 0, 1) * 0.6)
# the sea: deep, lighter along the coasts; lakes; a fine line of ink along every shore
DEEP, SHALLOW, LAKE, SHORE = (lin((104, 138, 160)), lin((160, 192, 202)), lin((146, 182, 200)), lin((62, 84, 100))) if mode == 'terrain' else (lin((92, 116, 134)), lin((140, 166, 178)), lin((132, 160, 176)), lin((58, 74, 88)))
reach = min(34.0, max(8.0, 14 / mpp))
water_c = mix(DEEP * np.ones((H, W, 3), np.float32), SHALLOW, np.exp(-d_coast_sea / reach * 2.2) * 0.85)
water_c[lake] = LAKE
img = np.where(wet[..., None], water_c, img)
img = mix(img, SHORE * np.ones_like(img), np.clip(1.1 - np.minimum(d_coast_sea, d_coast_land), 0, 1) * 0.55)

# ---------------------------------------------------------------- rivers: smooth lines, as wide as their rank
SS = 3
layer = Image.new('L', (W * SS, H * SS), 0); draw = ImageDraw.Draw(layer)
def chaikin(p, n=2):
    for _ in range(n):
        if len(p) < 3: break
        q = [p[0]]
        for a, b in zip(p[:-1], p[1:]): q += [(0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]), (0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1])]
        p = q + [p[-1]]
    return p
# rank 1 is a great river, 9 and 10 are the brooks of the drainage; the further out, the fewer of the small ones
most = 10 if mpp < 0.4 else 9 if mpp < 0.8 else 8
faint = Image.new('L', (W * SS, H * SS), 0); draw_faint = ImageDraw.Draw(faint)
for r in sorted(rivers, key=lambda r: -r['rank']):
    if r['rank'] > most: continue
    pts = [(((x + 0.5) / cpm - x0) / mpp * SS, ((y + 0.5) / cpm - y0) / mpp * SS) for x, y in r['pts']]
    if len(pts) < 2: continue
    small = r['rank'] >= 9
    width = (0.8 if small else 1.0 + 0.22 * (8 - min(8, r['rank']))) * (1.0 if mode == 'terrain' else 0.85)
    (draw_faint if small else draw).line(chaikin(pts), fill=255, width=max(1, round(width * SS)), joint='curve')
riv = np.maximum(np.asarray(layer.resize((W, H), Image.LANCZOS), np.float32) / 255, 0.5 * np.asarray(faint.resize((W, H), Image.LANCZOS), np.float32) / 255)
RIVER = lin((96, 140, 172)) if mode == 'terrain' else lin((70, 96, 120))
img = mix(img, RIVER * np.ones_like(img), riv * land * (0.95 if mode == 'terrain' else 0.6))

# paper: a faint grain, and the corners a little darker
rng = np.random.default_rng(7); grain = ndi.gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), 0.8)
img = img * (1 + 0.012 * grain / grain.std())[..., None]
yy, xx = np.mgrid[0:H, 0:W]; r2 = ((xx / W - 0.5) ** 2 + (yy / H - 0.5) ** 2) * 2
img = img * (1 - 0.1 * np.clip(r2 - 0.3, 0, 1))[..., None]
Image.fromarray((np.clip(srgb(img), 0, 1) * 255 + 0.5).astype(np.uint8)).save(out + '.base.png')

# ---------------------------------------------------------------- towns, for the labels
gaz = json.load(open(f'{ROOT}/data/content/gazetteer.json'))['places']; people = json.load(open(f'{PUB}/data/towns_{year}.json'))['people']
capitals = {(round(s['capital']['lat'], 2), round(s['capital']['lon'], 2)) for s in setup['states'] if s.get('capital')}
towns = []
for g, p in zip(gaz, people):
    tx_, ty_ = map_pixel(g['lon'], g['lat']); px, py = (tx_ - x0) / mpp, (ty_ - y0) / mpp
    if -20 < px < W + 20 and -20 < py < H + 20:
        towns.append({'name': g['name'], 'x': round(px, 1), 'y': round(py, 1), 'people': p or {1: 1500, 2: 3000, 3: 6000, 4: 12000, 5: 25000}.get(g.get('size') or 1, 1500), 'capital': (round(g['lat'], 2), round(g['lon'], 2)) in capitals})
json.dump({'w': W, 'h': H, 'x0': x0, 'y0': y0, 'mpp': mpp, 'mx': mx, 'my': my, 'mode': mode, 'year': year, 'wide': wide, 'towns': towns}, open(out + '.frame.json', 'w'))
print(f'{out}.base.png: level z{z}, {metres:.0f} m to a pixel, {len(rivers)} rivers, {len(towns)} towns, {len(np.unique(realm))} realms')
