# Great helm (Topfhelm) of the late 13th century: a flat-topped cylinder of riveted plates
# with a frontal ridge, two vision slits, an iron cross over the face and breathing holes.
# Rigid: written unbound in base.obj's coordinates (see headwear_lib.py). Shape by eye
# (PLACEHOLDER until held against surviving helms or sources).
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
import numpy as np
from mathutils import Vector
import headwear_lib as L

P = dict(
    Y0=5.50,      # lower edge (throat, on the shoulders behind)
    Y1=8.62,      # where the side wall meets the top plate
    TOP=8.82,     # crown of the slightly domed top plate
    CZ=0.58,      # centre of the section front to back
    A=1.03,       # half width over the ears
    BF=1.30,      # front half depth (to the face plate)
    BB=1.05,      # back half depth
    TAPER=0.05,   # narrower at the top by this share
    FLARE=0.04,   # wider at the lower edge
    E=2.5,        # squareness of the section (2 = ellipse)
    RIDGE=0.08,   # frontal ridge
    SL=(7.21, 7.33),  # vision slit, from to
    SLW=66,       # slit reaches this many degrees from the centre
    BAR=4.5,      # half width of the vertical bar in degrees
    TH=0.035,     # plate thickness
)


def sec(t, y, off=0.0, p=P):
    s = (y - p['Y0']) / (p['Y1'] - p['Y0'])
    k = 1.0 - p['TAPER'] * s + p['FLARE'] * max(0.0, 1 - s / 0.25) ** 2
    c, sn = math.cos(t), math.sin(t)
    a = p['A'] * k + off
    b = (p['BF'] if c > 0 else p['BB']) * k + off
    e = p['E']
    x = a * np.sign(sn) * abs(sn) ** (2 / e)
    z = b * np.sign(c) * abs(c) ** (2 / e) + p['RIDGE'] * max(0.0, c) ** 30
    return Vector((x, y, p['CZ'] + z))


def normal_at(t, y):
    return (sec(t, y, 0.1) - sec(t, y, 0.0)).normalized()


def build():
    L.clear(['helm_great', 'helm_great_bands', 'helm_great_rivets', 'helm_great_holes'])
    steel = L.material('metal_steel', (0.60, 0.60, 0.61), 1.0, 0.30, bump=0.06)
    iron = L.material('metal_iron', (0.34, 0.34, 0.35), 1.0, 0.45, bump=0.04)
    dark = L.material('helm_inside', (0.01, 0.01, 0.01), 0.0, 0.9)

    N = 64
    sl0, sl1 = P['SL']
    rows = list(np.linspace(P['Y0'], 7.0, 6)) + [7.10, sl0, sl1, 7.45] + list(np.linspace(7.6, P['Y1'], 5))
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('uv')
    G = [[bm.verts.new(sec(2 * math.pi * i / N, y)) for i in range(N + 1)] for y in rows]  # seam column N at the back
    for r in range(len(rows) - 1):
        for i in range(N):
            td = math.degrees(2 * math.pi * (i + 0.5) / N)
            td = td - 360 if td > 180 else td
            if abs(rows[r] - sl0) < 1e-6 and P['BAR'] < abs(td) < P['SLW']:
                continue
            f = bm.faces.new((G[r][i], G[r][i + 1], G[r + 1][i + 1], G[r + 1][i]))
            for lp, (u, v) in zip(f.loops, ((i, r), (i + 1, r), (i + 1, r + 1), (i, r + 1))):
                lp[uvl].uv = (u / N, (rows[v] - P['Y0']) / (P['TOP'] - P['Y0']) * 0.8)
    # rounded shoulder into the top plate
    prev = G[-1]
    for k, (dy, sh) in enumerate([(0.06, 0.975), (0.11, 0.92), (0.15, 0.84), (0.18, 0.6)]):
        ring = []
        for i in range(N + 1):
            b = sec(2 * math.pi * i / N, P['Y1'])
            ring.append(bm.verts.new(Vector((b.x * sh, P['Y1'] + dy, P['CZ'] + (b.z - P['CZ']) * sh))))
        for i in range(N):
            f = bm.faces.new((prev[i], prev[i + 1], ring[i + 1], ring[i]))
            for lp, (vv, s) in zip(f.loops, ((prev[i], 0), (prev[i + 1], 0), (ring[i + 1], 1), (ring[i], 1))):
                lp[uvl].uv = (0.5 + 0.1 * (vv.co.x), 0.85 + 0.1 * (vv.co.z - P['CZ']))
        prev = ring
    c = bm.verts.new(Vector((0, P['TOP'], P['CZ'])))
    for i in range(N):
        f = bm.faces.new((prev[i], prev[i + 1], c))
        for lp in f.loops:
            lp[uvl].uv = (0.5 + 0.1 * lp.vert.co.x, 0.85 + 0.1 * (lp.vert.co.z - P['CZ']))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    shell = L.obj_from_bm('helm_great', bm, steel)
    s = shell.modifiers.new('solid', 'SOLIDIFY'); s.thickness = P['TH']; s.offset = 1.0
    s.material_offset = 1; shell.data.materials.append(dark)  # inner side dark

    # iron bands: the cross over the face, frames of the slits, lower edge, seam of the top plate
    bm = bmesh.new()
    d = math.radians

    def strip(t0, t1, y0, y1, nt, ny, off=P['TH']):
        S = [[bm.verts.new(sec(t0 + (t1 - t0) * i / nt, y0 + (y1 - y0) * j / ny, off)) for i in range(nt + 1)] for j in range(ny + 1)]
        for j in range(ny):
            for i in range(nt):
                bm.faces.new((S[j][i], S[j][i + 1], S[j + 1][i + 1], S[j + 1][i]))

    bw = d(P['BAR'])
    sw = d(P['SLW'] + 2)
    strip(-bw, bw, P['Y0'] + 0.03, P['Y1'], 2, 14)
    for sg in (-1, 1):
        lo, hi = sorted((sg * bw, sg * sw))
        strip(lo, hi, sl0 - 0.15, sl0 - 0.01, 10, 1)
        strip(lo, hi, sl1 + 0.01, sl1 + 0.15, 10, 1)
    strip(0, 2 * math.pi, P['Y0'] + 0.01, P['Y0'] + 0.15, 64, 1)
    strip(0, 2 * math.pi, P['Y1'] - 0.14, P['Y1'], 64, 1)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bands = L.obj_from_bm('helm_great_bands', bm, iron)
    s = bands.modifiers.new('solid', 'SOLIDIFY'); s.thickness = 0.02; s.offset = 1

    # rivets on the bands
    bm = bmesh.new()
    off = P['TH'] + 0.02
    pts = [(2 * math.pi * k / 24, P['Y0'] + 0.08) for k in range(24)] + [(2 * math.pi * k / 24, P['Y1'] - 0.07) for k in range(24)]
    pts += [(0, P['Y0'] + 0.3 + j * 0.33) for j in range(8)]
    for sg in (-1, 1):
        for k in range(4):
            pts += [(sg * d(13 + k * 15), sl0 - 0.08), (sg * d(13 + k * 15), sl1 + 0.08)]
    for t, y in pts:
        L.stud(bm, sec(t, y, off), normal_at(t, y), 0.024)
    L.obj_from_bm('helm_great_rivets', bm, iron)

    # breathing holes in a cross on either side of the face plate
    bm = bmesh.new()
    for sg in (-1, 1):
        cx = sg * d(27)
        hp = [(cx + d(6) * k, 6.35) for k in range(-2, 3)] + [(cx, 6.35 + 0.13 * k) for k in (-2, -1, 1, 2)]
        for t, y in hp:
            L.disc(bm, sec(t, y, P['TH'] + 0.002), normal_at(t, y), 0.027)
    L.obj_from_bm('helm_great_holes', bm, dark, smooth=False)
    return ['helm_great', 'helm_great_bands', 'helm_great_rivets', 'helm_great_holes']


if __name__ == '__main__' or 'MCP' in os.environ.get('HELM_RUN', 'MCP'):
    names = build()
    out = os.environ.get('OUT')
    if out:
        L.export_obj([bpy.data.objects[n] for n in names], out)
