# Sundered Crowns: the 3D props of the map (trees, houses, churches, castles, soldiers, ships), modelled
# procedurally with Blender's bmesh and exported to public/models/models.json + models.bin.
#
#   blender -b --python tools/models/build_models.py -- [--out public/models] [--only name,name] [--blend file.blend]
#
# Contract (the renderer depends on it, see tools/models/README.md):
#   models.bin  = all vertices of all meshes, float32 [px,py,pz, nx,ny,nz, r,g,b, tint] (40 bytes each),
#                 then all indices as uint32, local to their mesh (0..vertexCount-1).
#   models.json = { version: 1, stride: 40, totalVertices, totalIndices,
#                   meshes: { name: { vertexOffset, vertexCount, indexOffset, indexCount, height, radius } } }
#   Z up, X east, Y north; origin at the ground centre (z = 0 is the ground, ships: the waterline).
#   Ships point their bow to +Y, and so do the cannon's muzzle and all figures (soldiers, riders).
#   Flat shading: every face has its own vertices and normal. tint = 1 marks parts recoloured with the owner's colour.
#   Colours are the plain RGB values the game's props shader uses (it writes them to the canvas without a
#   gamma step), so they are authored as display values; render_sheet.py decodes them for Cycles.
import sys, os, math, json, struct, random, zlib, argparse
from contextlib import contextmanager
import bpy, bmesh
from mathutils import Vector as V, Matrix

TAU = math.tau
PI = math.pi
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

# ----------------------------------------------------------------------------------------------------------------
# palette (display RGB)
# ----------------------------------------------------------------------------------------------------------------
C = dict(
    # trees
    bark=(0.33, 0.23, 0.15), bark_dark=(0.25, 0.18, 0.12), bark_pine=(0.55, 0.33, 0.20), bark_grey=(0.45, 0.41, 0.36),
    spruce=(0.10, 0.22, 0.14), spruce_tip=(0.16, 0.31, 0.18), spruce_under=(0.07, 0.16, 0.11),
    scots_lo=(0.12, 0.20, 0.16), scots=(0.18, 0.31, 0.22), scots_hi=(0.25, 0.39, 0.27),
    oak_lo=(0.16, 0.29, 0.10), oak=(0.23, 0.40, 0.13), oak_hi=(0.31, 0.49, 0.16),
    lime_lo=(0.22, 0.34, 0.11), lime=(0.31, 0.47, 0.15), lime_hi=(0.40, 0.56, 0.19),
    bush_lo=(0.18, 0.28, 0.11), bush=(0.26, 0.39, 0.14), bush_hi=(0.34, 0.47, 0.17),
    palm_trunk=(0.52, 0.41, 0.28), palm_trunk2=(0.44, 0.34, 0.23), frond=(0.27, 0.47, 0.17), frond_hi=(0.35, 0.55, 0.20),
    coconut=(0.42, 0.30, 0.16),
    # building materials
    plaster=(0.90, 0.85, 0.72), plaster2=(0.93, 0.88, 0.76), timber=(0.27, 0.18, 0.12), whitewash=(0.84, 0.82, 0.76),
    stone=(0.66, 0.63, 0.57), stone_light=(0.80, 0.77, 0.70), stone_dark=(0.48, 0.46, 0.43), limestone=(0.80, 0.76, 0.66),
    sandstone=(0.80, 0.74, 0.61), brick=(0.56, 0.32, 0.23),
    roof_red=(0.62, 0.27, 0.18), roof_red2=(0.55, 0.23, 0.16), terracotta=(0.74, 0.38, 0.23), terracotta2=(0.68, 0.33, 0.20),
    slate=(0.33, 0.35, 0.41), slate2=(0.29, 0.31, 0.37), thatch=(0.72, 0.59, 0.35), thatch2=(0.64, 0.51, 0.30),
    lead=(0.56, 0.60, 0.65), lead2=(0.50, 0.54, 0.60), felt=(0.80, 0.76, 0.66), felt2=(0.72, 0.68, 0.58),
    glass=(0.17, 0.18, 0.22), glass_blue=(0.20, 0.24, 0.33), opening=(0.10, 0.09, 0.09), door=(0.36, 0.23, 0.14),
    shutter=(0.25, 0.43, 0.47), ornament=(0.62, 0.24, 0.17), gold=(0.78, 0.60, 0.25),
    wood=(0.46, 0.32, 0.20), wood_light=(0.62, 0.47, 0.30), wood_dark=(0.30, 0.21, 0.14), hay=(0.80, 0.68, 0.38),
    # people
    skin=(0.80, 0.60, 0.46), steel=(0.66, 0.68, 0.72), steel_dark=(0.42, 0.44, 0.48), gambeson=(0.70, 0.67, 0.56),
    hose=(0.36, 0.31, 0.27), hose_light=(0.78, 0.74, 0.64), boot=(0.24, 0.17, 0.12), leather=(0.46, 0.31, 0.18),
    hood=(0.36, 0.38, 0.25), felt_hat=(0.20, 0.18, 0.17), feather=(0.82, 0.80, 0.75), bronze=(0.74, 0.54, 0.26),
    horse=(0.52, 0.33, 0.19), horse_dark=(0.17, 0.12, 0.09), hoof=(0.20, 0.19, 0.18), canvas=(0.80, 0.77, 0.68),
    tack=(0.19, 0.12, 0.08),
    # ships
    hull=(0.44, 0.30, 0.18), hull2=(0.38, 0.26, 0.16), hull_wet=(0.26, 0.22, 0.17), deck=(0.66, 0.52, 0.34),
    tar=(0.14, 0.13, 0.12), ochre=(0.74, 0.55, 0.26), copper=(0.66, 0.42, 0.28), rope=(0.30, 0.24, 0.17),
    rail=(0.34, 0.24, 0.15), lamp=(0.80, 0.68, 0.38),
)
TINT = (0.82, 0.82, 0.82)  # neutral base of recoloured parts (the shader multiplies it with the owner's colour)
TINT_DARK = (0.56, 0.56, 0.56)
TINT_LIGHT = (0.94, 0.94, 0.94)

# triangle budgets from the contract
BUDGET = {}
for _n in ('tree_conifer_a', 'tree_conifer_b', 'tree_broadleaf_a', 'tree_broadleaf_b', 'tree_palm', 'bush'): BUDGET[_n] = 160
for _n in ('house_timber', 'house_stone', 'house_mediterranean', 'house_steppe_yurt'): BUDGET[_n] = 300
for _n in ('farm_barn', 'windmill', 'church_gothic', 'mosque', 'castle', 'town_wall_tower'): BUDGET[_n] = 1500
for _n in ('soldier_infantry', 'soldier_pikeman', 'soldier_archer', 'soldier_musketeer', 'banner_standard'): BUDGET[_n] = 700
BUDGET['soldier_cavalry'] = 1400
BUDGET['cannon'] = 600
BUDGET['tent'] = 200
for _n in ('ship_cog', 'ship_galley', 'ship_carrack', 'ship_ship_of_the_line'): BUDGET[_n] = 1600


def mulc(c, k):
    return (min(1.0, c[0] * k), min(1.0, c[1] * k), min(1.0, c[2] * k))


def mixc(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def T(x, y, z):
    return Matrix.Translation((x, y, z))


def Rz(a):
    return Matrix.Rotation(a, 4, 'Z')


def Rx(a):
    return Matrix.Rotation(a, 4, 'X')


def Ry(a):
    return Matrix.Rotation(a, 4, 'Y')


def Sc(x, y, z):
    return Matrix.Diagonal((x, y, z, 1.0))


def newell(pts):
    n = V((0.0, 0.0, 0.0))
    k = len(pts)
    for i in range(k):
        a, b = pts[i], pts[(i + 1) % k]
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    return n


PHI = (1 + 5 ** 0.5) / 2
ICO_V = [(-1, PHI, 0), (1, PHI, 0), (-1, -PHI, 0), (1, -PHI, 0), (0, -1, PHI), (0, 1, PHI), (0, -1, -PHI), (0, 1, -PHI),
         (PHI, 0, -1), (PHI, 0, 1), (-PHI, 0, -1), (-PHI, 0, 1)]
ICO_F = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
         (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]


# ----------------------------------------------------------------------------------------------------------------
# modelling toolkit: everything is built into one bmesh per model; faces carry a colour and a tint flag
# ----------------------------------------------------------------------------------------------------------------
class Model:
    def __init__(self, name, center=False, footprint=1.0):
        self.name = name
        self.center = center  # move the footprint's centre to the origin after building
        self.bm = bmesh.new()
        self.lc = self.bm.faces.layers.float_color.new('col')
        self.lt = self.bm.faces.layers.int.new('tint')
        self.rng = random.Random(zlib.crc32(name.encode()))
        self.jit = 0.035
        # footprint < 1 narrows the whole model horizontally (keeps heights) so that it fits the town layout
        self.stack = [Sc(footprint, footprint, 1.0)]

    # ---- state
    def rand(self, a=0.0, b=1.0):
        return a + (b - a) * self.rng.random()

    @contextmanager
    def xf(self, mat):
        self.stack.append(self.stack[-1] @ mat)
        try:
            yield
        finally:
            self.stack.pop()

    def paint(self, f, col, tint=0, jit=None):
        j = (0.015 if tint else self.jit) if jit is None else jit
        k = 1.0 + (self.rng.random() * 2 - 1) * j if j else 1.0
        c = mulc(col, k)
        f[self.lc] = (c[0], c[1], c[2], 1.0)
        f[self.lt] = 1 if tint else 0

    def _pp(self, p):
        """normalise a paint spec: (col,), (col, tint)"""
        return (p[0], p[1] if len(p) > 1 else 0)

    # ---- raw geometry
    def mesh(self, pts, faces, paint, jit=None):
        """pts in local coordinates (the current transform is applied); faces as index tuples; paint is (col, tint)
        or a function of the face index. Returns a list aligned with faces (None where a face was degenerate)."""
        M = self.stack[-1]
        flip = M.determinant() < 0
        vs = [self.bm.verts.new(M @ V(p)) for p in pts]
        out = []
        for i, fi in enumerate(faces):
            idx = []
            for k in fi:
                if not idx or idx[-1] != k:
                    idx.append(k)
            if len(idx) > 1 and idx[0] == idx[-1]:
                idx.pop()
            if len(idx) < 3 or len(set(idx)) < len(idx):
                out.append(None)
                continue
            if flip:
                idx.reverse()
            try:
                f = self.bm.faces.new([vs[k] for k in idx])
            except ValueError:
                out.append(None)
                continue
            col, tint = self._pp(paint(i) if callable(paint) else paint)
            self.paint(f, col, tint, jit)
            out.append(f)
        return out

    def poly(self, pts, col, tint=0, hint=None, jit=None):
        """one free polygon; hint (local direction) decides which way it faces"""
        pts = [V(p) for p in pts]
        q = []
        for p in pts:
            if not q or (p - q[-1]).length > 1e-7:
                q.append(p)
        if len(q) > 2 and (q[0] - q[-1]).length < 1e-7:
            q.pop()
        if len(q) < 3:
            return None
        if hint is not None and newell(q).dot(V(hint)) < 0:
            q.reverse()
        return self.mesh(q, [tuple(range(len(q)))], (col, tint), jit)[0]

    def fix_closed(self, faces):
        """flip a closed part inside out if its signed volume is negative"""
        faces = [f for f in faces if f is not None]
        vol = 0.0
        for f in faces:
            vs = [v.co for v in f.verts]
            for i in range(1, len(vs) - 1):
                vol += vs[0].dot(vs[i].cross(vs[i + 1]))
        if vol < 0:
            for f in faces:
                f.normal_flip()
        return faces

    def orient_from(self, faces, ref):
        """flip faces whose normal points towards ref(center) (an inner reference point)"""
        for f in faces:
            if f is None:
                continue
            c = f.calc_center_median()
            if newell([v.co for v in f.verts]).dot(c - ref(c)) < 0:
                f.normal_flip()

    # ---- primitives
    def box(self, a, b, col, tint=0, bottom=False, bevel=0.0, edges='v', paint=None, jit=None, top=True):
        """an axis box; the bottom is left out unless asked for, the top can be left out where a roof covers it"""
        x0, y0, z0 = a
        x1, y1, z1 = b
        P = [(x1 if i & 1 else x0, y1 if i & 2 else y0, z1 if i & 4 else z0) for i in range(8)]
        F = ([(4, 5, 7, 6)] if top else []) + [(0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)] + ([(0, 2, 3, 1)] if bottom else [])
        fs = [f for f in self.mesh(P, F, paint or (col, tint), jit) if f is not None]
        if bevel > 0:
            self.bevel(fs, bevel, edges)
        return fs

    def bevel(self, faces, w, which='v'):
        es = {e for f in faces for e in f.edges}
        sel = []
        for e in es:
            if len(e.link_faces) != 2:
                continue
            d = (e.verts[1].co - e.verts[0].co).normalized()
            if which == 'v' and abs(d.z) < 0.95:
                continue
            if which == 'h' and abs(d.z) > 0.05:
                continue
            sel.append(e)
        if sel:
            bmesh.ops.bevel(self.bm, geom=sel, offset=w, offset_type='OFFSET', segments=1, profile=0.5,
                            affect='EDGES', clamp_overlap=True)

    def loft(self, rings, paint, cap0=False, cap1=False, closed=True, orient='auto', jit=None):
        """skin a sequence of rings (lists of points, 1 point = apex). paint(band, seg) -> (col, tint);
        band -1 is the start cap, len(rings)-1 the end cap."""
        pts, st = [], []
        for r in rings:
            st.append(len(pts))
            pts.extend(V(p) for p in r)
        F, keys, refs = [], [], []
        cen = [sum((V(p) for p in r), V((0, 0, 0))) / len(r) for r in rings]
        for i in range(len(rings) - 1):
            na, nb = len(rings[i]), len(rings[i + 1])
            if na == 1 and nb == 1:
                continue
            n = max(na, nb)
            segs = n if closed else n - 1
            for j in range(segs):
                a0 = st[i] + (j % na if na > 1 else 0)
                a1 = st[i] + ((j + 1) % na if na > 1 else 0)
                b0 = st[i + 1] + (j % nb if nb > 1 else 0)
                b1 = st[i + 1] + ((j + 1) % nb if nb > 1 else 0)
                F.append((a0, a1, b1, b0))
                keys.append((i, j))
                refs.append((cen[i] + cen[i + 1]) / 2)
        if cap0 and len(rings[0]) > 2:
            F.append(tuple(reversed(range(st[0], st[0] + len(rings[0])))))
            keys.append((-1, 0))
            refs.append(None)
        if cap1 and len(rings[-1]) > 2:
            F.append(tuple(range(st[-1], st[-1] + len(rings[-1]))))
            keys.append((len(rings) - 1, 0))
            refs.append(None)
        pf = (lambda k: paint(*keys[k])) if callable(paint) else paint
        fs = self.mesh(pts, F, pf, jit)
        is_closed = closed and (cap0 or len(rings[0]) == 1) and (cap1 or len(rings[-1]) == 1)
        if orient == 'auto' or (orient == 'closed' and is_closed):
            if is_closed:
                self.fix_closed(fs)
            elif orient == 'auto':
                # a loft is consistently wound by construction (every inner edge is used once in each direction), so
                # it is only ever flipped as a whole: the band faces vote, weighted by area, on whether they face away
                # from the line through the ring centres. Flipping faces one by one would turn the inner faces of a
                # non-convex section (a hull's bulwarks and deck) the wrong way and break the winding at their edges.
                M = self.stack[-1]
                vote = 0.0
                for f, r in zip(fs, refs):
                    if f is None or r is None:
                        continue
                    c = f.calc_center_median()
                    vote += newell([v.co for v in f.verts]).dot(c - M @ r)
                if vote < 0:
                    for f in fs:
                        if f is not None:
                            f.normal_flip()
        return [f for f in fs if f is not None]

    def lathe(self, prof, n, paint, phase=None, a0=None, a1=None, sx=1.0, sy=1.0, deform=None, cap0=False, cap1=False,
              jit=None):
        """revolve a (r, z) profile around the local z axis. Profiles run counter-clockwise around the material
        (r to the right, z up), so normals face outwards. a0/a1 make a partial sweep (open sector)."""
        full = a0 is None
        if phase is None:
            phase = PI / n
        rings = []
        for (r, z) in prof:
            if r < 1e-7:
                rings.append([V((0.0, 0.0, z))])
                continue
            ring = []
            cnt = n if full else n + 1
            for s in range(cnt):
                a = (phase + TAU * s / n) if full else (a0 + (a1 - a0) * s / n)
                ring.append(V((r * sx * math.cos(a), r * sy * math.sin(a), z)))
            rings.append(ring)
        if deform:
            rings = [[deform(V(p)) for p in ring] for ring in rings]
        return self.loft(rings, paint, cap0, cap1, closed=full, orient='closed', jit=jit)

    def tube(self, pts, radii, n, paint, cap0=True, cap1=True, phase=0.0, aspect=1.0, up=None, jit=None):
        """a tapered tube through a polyline; radius 0 makes a point; aspect squashes the ring across 'up'"""
        pts = [V(p) for p in pts]
        if not isinstance(radii, (list, tuple)):
            radii = [radii] * len(pts)
        rings, u_prev = [], None
        for k, p in enumerate(pts):
            t = (pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]).normalized()
            if u_prev is None:
                ref = V(up) if up is not None else (V((0, 0, 1)) if abs(t.z) < 0.9 else V((1, 0, 0)))
                u = ref - t * ref.dot(t)
            else:
                u = u_prev - t * u_prev.dot(t)
            u.normalize()
            u_prev = u
            w = t.cross(u)
            r = radii[k]
            if r <= 1e-7:
                rings.append([p.copy()])
                continue
            rings.append([p + u * (r * math.cos(phase + TAU * s / n)) + w * (r * aspect * math.sin(phase + TAU * s / n))
                          for s in range(n)])
        return self.loft(rings, paint, cap0, cap1, closed=True, orient='auto', jit=jit)

    def limb(self, a, b, ra, rb, n, col, tint=0, cap0=True, cap1=True, up=None, aspect=1.0):
        return self.tube([a, b], [ra, rb], n, (col, tint), cap0, cap1, up=up, aspect=aspect)

    def slab(self, verts, polys, thick, front, pf, pb=None, pe=None, jit=None):
        """a thin plate (sail, banner, shield, leaf) from a surface given as verts + polys: front and back faces
        offset by +-thick/2 along the local normal (oriented to 'front'), boundary edges closed with strips."""
        verts = [V(v) for v in verts]
        front = V(front)
        P2 = []
        for p in polys:
            n = newell([verts[k] for k in p])
            P2.append(tuple(p) if n.dot(front) >= 0 else tuple(reversed(p)))
        vn = [V((0, 0, 0)) for _ in verts]
        for p in P2:
            n = newell([verts[k] for k in p])
            if n.length > 1e-12:
                n.normalize()
            for k in p:
                vn[k] += n
        for k in range(len(vn)):
            vn[k] = vn[k].normalized() if vn[k].length > 1e-9 else front.normalized()
        h = thick / 2
        N = len(verts)
        pts = [v + vn[k] * h for k, v in enumerate(verts)] + [v - vn[k] * h for k, v in enumerate(verts)]
        faces, paints = [], []
        pb = pb if pb is not None else pf
        for i, p in enumerate(P2):
            faces.append(p)
            paints.append(pf(i) if callable(pf) else pf)
            faces.append(tuple(N + k for k in reversed(p)))
            paints.append(pb(i) if callable(pb) else pb)
        used = set()
        for p in P2:
            for a, b in zip(p, p[1:] + p[:1]):
                used.add((a, b))
        for p in P2:
            for a, b in zip(p, p[1:] + p[:1]):
                if (b, a) not in used:
                    faces.append((b, a, N + a, N + b))
                    paints.append(pe if pe is not None else (paints[0] if not callable(pf) else pf(0)))
        return [f for f in self.mesh(pts, faces, lambda i: paints[i], jit) if f is not None]

    def prism(self, outline, d, paint, jit=None):
        """extrude a planar outline (local points) by vector d; closed"""
        outline = [V(p) for p in outline]
        n = len(outline)
        pts = outline + [p + V(d) for p in outline]
        F = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
        F += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
        fs = self.mesh(pts, F, paint, jit)
        return self.fix_closed(fs)

    def blob(self, c, r, lo, mid, hi, jitter=0.12, floor=None, spin=None):
        """a lumpy icosahedron (20 triangles) shaded light on top and dark below"""
        rx, ry, rz = r
        a = self.rand(0, TAU) if spin is None else spin
        ca, sa = math.cos(a), math.sin(a)
        pts = []
        for v in ICO_V:
            p = V(v).normalized() * (1 + self.rand(-jitter, jitter))
            x, y = p.x * ca - p.y * sa, p.x * sa + p.y * ca
            q = V((c[0] + x * rx, c[1] + y * ry, c[2] + p.z * rz))
            if floor is not None:
                q.z = max(q.z, floor)
            pts.append(q)
        fs = self.fix_closed(self.mesh(pts, ICO_F, (mid, 0)))
        self.shade(fs, lo, mid, hi)
        return fs

    def shade(self, faces, lo, mid, hi, jit=0.06):
        """recolour by facing: undersides lo, sides mid, tops hi"""
        for f in faces:
            f.normal_update()
            nz = f.normal.z
            col = lo if nz < -0.35 else (hi if nz > 0.45 else mid)
            self.paint(f, col, 0, jit)

    # ---- architecture helpers
    def decal(self, o, u, v, n, rect, col, tint=0, eps=0.006, jit=0.0):
        """a flat quad on a wall: o origin, u/v unit axes along the wall, n outward normal, rect = (u0, v0, u1, v1)"""
        u0, v0, u1, v1 = rect
        o, u, v, n = V(o) + V(n) * eps, V(u), V(v), V(n)
        return self.poly([o + u * u0 + v * v0, o + u * u1 + v * v0, o + u * u1 + v * v1, o + u * u0 + v * v1], col, tint, n, jit)

    def decal_poly(self, o, u, v, n, uv, col, tint=0, eps=0.006, jit=0.0):
        o, u, v, n = V(o) + V(n) * eps, V(u), V(v), V(n)
        return self.poly([o + u * a + v * b for a, b in uv], col, tint, n, jit)

    def gable_roof(self, x0, x1, D, ztop, over, zr, t, col, col2=None, rows=3, edge=None, under=None, xo=0.06, ends=(True, True)):
        """a gable roof along x over a wall of half-depth D whose top is at ztop: the underside rests on the wall
        top edge; eaves overhang by 'over', the gables by xo. ends=(west, east) leaves out the end strips where
        another roof covers them. Returns the eave height of the top surface."""
        ze = (ztop + t) * (D + over) / D - zr * over / D
        Y = D + over
        X0, X1 = x0 - xo, x1 + xo
        edge = edge or mulc(col, 0.75)
        under = under or mulc(col, 0.6)
        for side in (-1, 1):
            ye = side * Y
            for k in range(rows):
                a, b = k / rows, (k + 1) / rows
                ya, za = ye * (1 - a), ze + (zr - ze) * a
                yb, zb = ye * (1 - b), ze + (zr - ze) * b
                c = col if (k % 2 == 0 or col2 is None) else col2
                self.poly([(X0, ya, za), (X1, ya, za), (X1, yb, zb), (X0, yb, zb)], c, hint=(0, side * (zr - ze), Y))
            self.poly([(X0, ye, ze - t), (X1, ye, ze - t), (X1, 0, zr - t), (X0, 0, zr - t)], under, hint=(0, -side * (zr - ze), -Y))
            self.poly([(X0, ye, ze), (X1, ye, ze), (X1, ye, ze - t), (X0, ye, ze - t)], edge, hint=(0, side, 0))
            for xe, sx, keep in ((X0, -1, ends[0]), (X1, 1, ends[1])):
                if keep:
                    self.poly([(xe, ye, ze), (xe, 0, zr), (xe, 0, zr - t), (xe, ye, ze - t)], edge, hint=(sx, 0, 0))
        return ze

    def gable_wall(self, x, D, ztop, zr, t, col, sx):
        """the triangle under a gable roof at x (facing sx)"""
        return self.poly([(x, -D, ztop), (x, D, ztop), (x, 0, zr - t)], col, hint=(sx, 0, 0))

    def ridge(self, x0, x1, zr, w, col):
        """a small ridge cap along x at height zr"""
        for side in (-1, 1):
            self.poly([(x0, side * w, zr - w * 0.5), (x1, side * w, zr - w * 0.5), (x1, 0, zr + w * 0.6), (x0, 0, zr + w * 0.6)], col,
                      hint=(0, side, 1))
        for x, sx in ((x0, -1), (x1, 1)):
            self.poly([(x, -w, zr - w * 0.5), (x, w, zr - w * 0.5), (x, 0, zr + w * 0.6)], col, hint=(sx, 0, 0))

    def hip_roof(self, x0, x1, y0, y1, ze, zr, t, col, col2=None, rows=2, inset=None, edge=None, under=None):
        """a hipped (or, with no ridge length, pyramid) roof over the rectangle, closed underneath"""
        ym = (y0 + y1) / 2
        if inset is None:
            inset = (y1 - y0) / 2
        rx0, rx1 = x0 + inset, x1 - inset
        if rx1 - rx0 < 1e-4:
            rx0 = rx1 = (x0 + x1) / 2
        E = [V((x0, y0, ze)), V((x1, y0, ze)), V((x1, y1, ze)), V((x0, y1, ze))]
        R = [V((rx0, ym, zr)), V((rx1, ym, zr)), V((rx1, ym, zr)), V((rx0, ym, zr))]
        L = [[E[s] + (R[s] - E[s]) * (k / rows) for s in range(4)] for k in range(rows + 1)]
        for k in range(rows):
            c = col if (k % 2 == 0 or col2 is None) else col2
            for s in range(4):
                self.poly([L[k][s], L[k][(s + 1) % 4], L[k + 1][(s + 1) % 4], L[k + 1][s]], c, hint=(0, 0, 1))
        edge = edge or mulc(col, 0.75)
        under = under or mulc(col, 0.6)
        out = [(0, -1, 0), (1, 0, 0), (0, 1, 0), (-1, 0, 0)]
        for s in range(4):
            a, b = E[s], E[(s + 1) % 4]
            self.poly([a, b, b - V((0, 0, t)), a - V((0, 0, t))], edge, hint=out[s])
        self.poly([p - V((0, 0, t)) for p in E], under, hint=(0, 0, -1))

    def merlons(self, p0, p1, z, count, col, h=0.12, w=0.12, d=0.07):
        """crenellations: 'count' blocks evenly along the line p0 -> p1 (2D) standing on height z"""
        a, b = V((p0[0], p0[1], 0)), V((p1[0], p1[1], 0))
        dv = b - a
        ang = math.atan2(dv.y, dv.x)
        for i in range(count):
            c = a + dv * ((i + 0.5) / count)
            with self.xf(T(c.x, c.y, 0) @ Rz(ang)):
                self.box((-w / 2, -d / 2, z), (w / 2, d / 2, z + h), col)

    # ---- output
    def finish(self):
        bm = self.bm
        loose = [v for v in bm.verts if not v.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context='VERTS')
        if self.center:
            xs = [v.co.x for v in bm.verts]
            ys = [v.co.y for v in bm.verts]
            cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
            for v in bm.verts:
                v.co.x -= cx
                v.co.y -= cy
        # faces made with bm.faces.new carry no normal yet; the triangulator projects each n-gon along its normal,
        # so without this a concave outline (stepped gables, gun carriage cheeks) comes out folded over itself
        bm.normal_update()
        bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='BEAUTY', ngon_method='BEAUTY')
        tris = []
        for f in bm.faces:
            p = [v.co.copy() for v in f.verts]
            nrm = (p[1] - p[0]).cross(p[2] - p[0])
            if nrm.length < 1e-10:
                continue  # degenerate
            c = f[self.lc]
            tris.append((p, nrm.normalized(), (c[0], c[1], c[2]), int(f[self.lt])))
        return tris


# ----------------------------------------------------------------------------------------------------------------
# small shared parts
# ----------------------------------------------------------------------------------------------------------------
def wall_frames(x0, y0, x1, y1, z0=0.0):
    """outward wall frames of an axis box: side -> (origin at bottom left seen from outside, u, v, n, width)"""
    up = V((0, 0, 1))
    return {
        'S': (V((x0, y0, z0)), V((1, 0, 0)), up, V((0, -1, 0)), x1 - x0),
        'N': (V((x1, y1, z0)), V((-1, 0, 0)), up, V((0, 1, 0)), x1 - x0),
        'E': (V((x1, y0, z0)), V((0, 1, 0)), up, V((1, 0, 0)), y1 - y0),
        'W': (V((x0, y1, z0)), V((0, -1, 0)), up, V((-1, 0, 0)), y1 - y0),
    }


def facet_frame(r0, z0, r1, z1, a, n):
    """the frame of one facet of an n-sided lathe band between (r0, z0) and (r1, z1), centred at angle a:
    origin at the bottom centre, u across, v up the facet, n outward"""
    k = math.cos(PI / n)
    p0 = V((r0 * k * math.cos(a), r0 * k * math.sin(a), z0))
    p1 = V((r1 * k * math.cos(a), r1 * k * math.sin(a), z1))
    v = (p1 - p0).normalized()
    u = V((-math.sin(a), math.cos(a), 0))
    n = u.cross(v)
    if n.dot(V((math.cos(a), math.sin(a), 0))) < 0:
        n = -n
    return p0, u, v, n


def arch_uv(u0, v0, w, h, pointed=True, steps=2):
    """a window/door outline: rectangle with a pointed or round top"""
    r = w / 2
    cu = u0 + r
    pts = [(u0, v0), (u0 + w, v0)]
    spring = v0 + h - (r * 1.25 if pointed else r)
    pts.append((u0 + w, spring))
    if pointed:
        pts.append((cu, v0 + h))
    else:
        for k in range(1, steps * 2):
            a = PI * k / (steps * 2)
            pts.append((cu + r * math.cos(a), spring + r * math.sin(a)))
    pts.append((u0, spring))
    return pts


def heater_outline(w, h, n_curve=3):
    """a heater shield outline centred at the origin (u right, v up), counter-clockwise"""
    top = h * 0.5
    side = h * 0.12
    pts = [(-w / 2, top), (-w / 2, side)]
    for k in range(1, n_curve + 1):
        a = k / (n_curve + 1)
        pts.append((-w / 2 * (1 - a) ** 1.3 * 1.0, side - (side + h * 0.5) * (math.sin(a * PI / 2))))
    pts.append((0, -h * 0.5))
    for k in range(n_curve, 0, -1):
        a = k / (n_curve + 1)
        pts.append((w / 2 * (1 - a) ** 1.3, side - (side + h * 0.5) * (math.sin(a * PI / 2))))
    pts.append((w / 2, side))
    pts.append((w / 2, top))
    return pts  # counter-clockwise seen from the front (+v up, +u right)


def shield(m, center, facing, w, h, bulge=0.025, thick=0.022, rim=None, back=None, tint_front=TINT):
    """a heater shield: tinted front with a raised centre, tinted back, wooden rim"""
    f = V(facing).normalized()
    vv = V((0, 0, 1)) - f * f.z
    vv.normalize()
    u = vv.cross(f).normalized()
    c = V(center)
    out = heater_outline(w, h)
    verts = [c + u * a + vv * b for a, b in out]
    verts.append(c + f * bulge + vv * (h * 0.08))
    k = len(out)
    polys = [(i, (i + 1) % k, k) for i in range(k)]
    return m.slab(verts, polys, thick, f, (tint_front, 1), (back or TINT_DARK, 1), (rim or C['wood_dark'], 0))


def flag(m, x, z0, z1, length, cols=4, rows=2, wave=0.035, thick=0.012, base=TINT, back=None, axis='x',
         plane_y=0.0, stripes=False):
    """a waving flag fixed on a vertical pole at (x, plane_y), from z0 to z1, flying towards +axis"""
    verts = []
    for r in range(rows + 1):
        for c in range(cols + 1):
            uu, vv = c / cols, r / rows
            z = z1 + (z0 - z1) * vv
            d = length * uu
            off = wave * math.sin(uu * PI * 1.6) * (0.3 + uu)
            z -= uu * (z1 - z0) * 0.08
            verts.append(V((x + d, plane_y + off, z)) if axis == 'x' else V((plane_y + off, x + d, z)))
    polys = [(r * (cols + 1) + c, r * (cols + 1) + c + 1, (r + 1) * (cols + 1) + c + 1, (r + 1) * (cols + 1) + c)
             for r in range(rows) for c in range(cols)]
    front = V((0, -1, 0)) if axis == 'x' else V((-1, 0, 0))
    pf = (lambda i: (TINT if (i % cols) % 2 == 0 else TINT_DARK, 1)) if stripes else (base, 1)
    return m.slab(verts, polys, thick, front, pf, (back or base, 1), (mulc(base, 0.8), 1))


def pennant(m, base, length, height, direction=(0, 1, 0), droop=0.02, thick=0.008):
    """a long triangular streamer from a point on a mast, flying along 'direction'"""
    b = V(base)
    d = V(direction).normalized()
    verts = [b + V((0, 0, height / 2)), b - V((0, 0, height / 2)), b + d * (length * 0.5) + V((0.015, 0, -droop * 0.5)),
             b + d * length + V((0, 0, -droop))]
    side = d.cross(V((0, 0, 1)))
    return m.slab(verts, [(0, 1, 2), (0, 2, 3)], thick, side, (TINT, 1), (TINT, 1), (TINT_DARK, 1))


def quad_grid(c00, c10, c01, c11, nu, nv, disp=None):
    """a bilinear patch: corners c00 (u0 v0), c10 (u1 v0), c01 (u0 v1), c11; disp(u, v) -> offset vector"""
    c00, c10, c01, c11 = V(c00), V(c10), V(c01), V(c11)
    verts = []
    for j in range(nv + 1):
        for i in range(nu + 1):
            u, v = i / nu, j / nv
            p = c00 * (1 - u) * (1 - v) + c10 * u * (1 - v) + c01 * (1 - u) * v + c11 * u * v
            if disp:
                p = p + V(disp(u, v))
            verts.append(p)
    polys = [(j * (nu + 1) + i, j * (nu + 1) + i + 1, (j + 1) * (nu + 1) + i + 1, (j + 1) * (nu + 1) + i)
             for j in range(nv) for i in range(nu)]
    return verts, polys


def tri_grid(a, b, c, N, disp=None):
    """a subdivided triangle (N rows from edge a-b to apex c); disp(wa, wb, wc) -> offset vector"""
    a, b, c = V(a), V(b), V(c)
    idx, verts = {}, []
    for i in range(N + 1):
        for j in range(N + 1 - i):
            wb, wc = j / N, i / N
            wa = 1 - wb - wc
            p = a * wa + b * wb + c * wc
            if disp:
                p = p + V(disp(wa, wb, wc))
            idx[(i, j)] = len(verts)
            verts.append(p)
    polys = []
    for i in range(N):
        for j in range(N - i):
            polys.append((idx[(i, j)], idx[(i, j + 1)], idx[(i + 1, j)]))
            if j < N - i - 1:
                polys.append((idx[(i, j + 1)], idx[(i + 1, j + 1)], idx[(i + 1, j)]))
    return verts, polys


def yard_sail(m, y, hw, zt, hb, zb, bulge, brace=0.0, nu=3, nv=2, yard_r=0.014):
    """a yard and its square sail on the mast at y, braced round by 'brace' radians"""
    with m.xf(T(0, y, 0) @ Rz(brace) @ T(0, -y, 0)):
        m.limb((-hw - 0.05, y + 0.045, zt + 0.02), (hw + 0.05, y + 0.045, zt + 0.02), yard_r, yard_r, 4, C['wood_dark'])
        square_sail(m, y + 0.06, hw, hb, zt, zb, bulge, nu=nu, nv=nv)


def square_sail(m, y, x_half_top, x_half_bot, z_top, z_bot, bulge, nu=3, nv=2, thick=0.012, stripes=True,
                rake=0.0):
    """a square sail hanging from a yard at (y, z_top), billowing forward (+y)"""
    def disp(u, v):
        return (0, bulge * math.sin(PI * u) * (0.35 + 0.65 * math.sin(PI * min(1.0, v * 1.15))) + rake * v, 0)
    verts, polys = quad_grid((-x_half_top, y, z_top), (x_half_top, y, z_top), (-x_half_bot, y, z_bot),
                             (x_half_bot, y, z_bot), nu, nv, disp)
    pf = (lambda i: (TINT if (i % nu) % 2 == 0 else mulc(TINT, 0.9), 1)) if stripes else (TINT, 1)
    return m.slab(verts, polys, thick, (0, 1, 0), pf, (mulc(TINT, 0.86), 1), (mulc(TINT, 0.8), 1))


def rope(m, a, b, r=0.006):
    return m.limb(a, b, r, r, 3, C['rope'], cap0=False, cap1=False)


# ----------------------------------------------------------------------------------------------------------------
# trees and bushes (kept to 60..110 triangles: the map draws up to a quarter of a million of them)
# ----------------------------------------------------------------------------------------------------------------
def tree_conifer_a():
    """a Norway spruce: four drooping star-shaped tiers on a short trunk; a lighter rim of new growth on every tier"""
    m = Model('tree_conifer_a')
    m.lathe([(0.075, 0.0), (0.045, 0.52)], 5, (C['bark_dark'], 0))
    tiers = [(0.26, 1.02, 0.57), (0.60, 1.36, 0.47), (0.94, 1.70, 0.36), (1.28, 2.06, 0.23)]
    k = 5
    for i, (z0, z1, r) in enumerate(tiers):
        lift = 1.0 + 0.06 * i  # the upper tiers catch more light
        base, tipc = mulc(C['spruce'], lift), mulc(C['spruce_tip'], lift)
        ph = i * 0.73 + 0.2
        pts = []
        for s in range(2 * k):
            a = ph + TAU * s / (2 * k)
            tip = s % 2 == 0
            rr = r * (1.0 if tip else 0.62) * m.rand(0.93, 1.07)
            pts.append(V((rr * math.cos(a), rr * math.sin(a), z0 - (0.05 if tip else -0.04))))
        top = V((0, 0, z1))
        under = V((0, 0, z0 + 0.16))
        for s in range(2 * k):
            a, b = pts[s], pts[(s + 1) % (2 * k)]
            hint = ((a + b) / 2).x, ((a + b) / 2).y, r * 0.8
            # split the face from the branch tip T to the notch N along N -> Q (Q on the edge T-apex, shared with the
            # face on the other side of the tip, so no T-junctions): the outer triangle is the light new growth
            t, n = (a, b) if s % 2 == 0 else (b, a)
            q = t + (top - t) * 0.42
            shade = 1.05 if s % 2 == 0 else 0.95
            if s % 2 == 0:
                m.poly([t, n, q], mulc(tipc, shade), hint=hint, jit=0.05)
                m.poly([q, n, top], mulc(base, shade), hint=hint, jit=0.05)
            else:
                m.poly([n, t, q], mulc(tipc, shade), hint=hint, jit=0.05)
                m.poly([n, q, top], mulc(base, shade), hint=hint, jit=0.05)
            m.poly([b, a, under], C['spruce_under'], hint=(0, 0, -1), jit=0.04)
    return m


def tree_conifer_b():
    """a Scots pine: a tall, slightly leaning trunk, grey-brown at the foot and fox-red above, two bare limbs and a
    flat, irregular umbrella crown of blue-green pads (reads apart from the spruce's cone at any distance)"""
    m = Model('tree_conifer_b')
    trunk = [(0, 0, 0), (0.02, 0.01, 0.42), (0.055, 0.02, 0.92), (0.08, 0.02, 1.50)]
    m.tube(trunk, [0.072, 0.056, 0.044, 0.03], 5, lambda i, j: ((C['bark_grey'] if i == 0 else C['bark_pine']), 0), cap0=False,
           cap1=False)
    m.limb((0.05, 0.02, 0.98), (-0.27, 0.05, 1.30), 0.026, 0.012, 4, C['bark_pine'], cap0=False, cap1=False)
    m.limb((0.07, 0.02, 1.18), (0.33, -0.07, 1.42), 0.022, 0.011, 4, C['bark_pine'], cap0=False, cap1=False)
    lo, mid, hi = C['scots_lo'], C['scots'], C['scots_hi']
    for c, r in (((0.08, 0.02, 1.64), (0.42, 0.38, 0.17)), ((-0.30, 0.06, 1.34), (0.27, 0.24, 0.11)),
                 ((0.36, -0.08, 1.46), (0.25, 0.23, 0.11)), ((0.02, 0.06, 1.88), (0.25, 0.23, 0.12)),
                 ((0.10, 0.24, 1.50), (0.21, 0.19, 0.10))):
        m.blob(c, r, lo, mid, hi, jitter=0.12)
    return m


def tree_broadleaf_a():
    """an oak: short stout trunk with two limbs and a broad, lumpy crown"""
    m = Model('tree_broadleaf_a')
    m.tube([(0, 0, 0), (0.0, 0.0, 0.42), (0.03, 0.0, 0.78)], [0.11, 0.075, 0.06], 5, (C['bark'], 0), cap0=False, cap1=False)
    m.limb((0.02, 0, 0.6), (0.28, 0.06, 0.98), 0.042, 0.022, 4, C['bark'], cap0=False)
    m.limb((0.0, 0, 0.64), (-0.24, -0.1, 1.0), 0.042, 0.022, 4, C['bark'], cap0=False)
    m.blob((0.0, 0.0, 1.16), (0.58, 0.54, 0.38), C['oak_lo'], C['oak'], C['oak_hi'], jitter=0.10)
    m.blob((0.28, 0.10, 1.40), (0.36, 0.33, 0.29), C['oak_lo'], C['oak'], C['oak_hi'], jitter=0.10)
    m.blob((-0.24, -0.13, 1.42), (0.37, 0.35, 0.29), C['oak_lo'], C['oak'], C['oak_hi'], jitter=0.10)
    return m


def tree_broadleaf_b():
    """a lime / beech: straight grey trunk and a tall, oval, light green crown of clustered lobes"""
    m = Model('tree_broadleaf_b')
    m.tube([(0, 0, 0), (0, 0, 0.95)], [0.085, 0.05], 5, (C['bark_grey'], 0), cap0=False, cap1=False)
    for c, r in (((0.0, 0.0, 1.02), (0.47, 0.45, 0.40)), ((0.04, 0.06, 1.44), (0.37, 0.35, 0.34)), ((-0.20, -0.10, 1.22), (0.29, 0.28, 0.27)),
                 ((0.22, -0.08, 1.18), (0.27, 0.26, 0.25))):
        m.blob(c, r, C['lime_lo'], C['lime'], C['lime_hi'], jitter=0.09)
    return m


def tree_palm():
    """a date palm: curved ringed trunk, drooping fronds, a cluster of fruit"""
    m = Model('tree_palm')
    pts = [(0, 0, 0), (0.06, 0, 0.55), (0.13, 0, 1.10), (0.17, 0, 1.6)]
    m.tube(pts, [0.08, 0.062, 0.052, 0.046], 5, lambda i, j: (C['palm_trunk'] if i % 2 == 0 else C['palm_trunk2'], 0),
           cap0=False, cap1=True)
    top = V((0.17, 0, 1.62))
    nf = 7
    for k in range(nf):
        a = k * TAU / nf + 0.3
        d = V((math.cos(a), math.sin(a), 0))
        s = V((-d.y, d.x, 0))
        p1 = top + d * 0.22 + V((0, 0, 0.10))
        p2 = top + d * 0.44 + V((0, 0, 0.02))
        tip = top + d * 0.63 + V((0, 0, -0.20))
        w1, w2 = 0.11, 0.08
        col = C['frond'] if k % 2 else C['frond_hi']
        l1, r1 = p1 + s * w1 - V((0, 0, 0.035)), p1 - s * w1 - V((0, 0, 0.035))
        l2, r2 = p2 + s * w2 - V((0, 0, 0.05)), p2 - s * w2 - V((0, 0, 0.05))
        for tri in ((top, l1, p1), (top, p1, r1), (p1, l1, l2, p2), (p1, p2, r2, r1), (p2, l2, tip), (p2, tip, r2)):
            m.poly(tri, col, hint=(0, 0, 1), jit=0.06)
    m.blob((0.15, 0.0, 1.53), (0.09, 0.09, 0.07), mulc(C['coconut'], 0.8), C['coconut'], mulc(C['coconut'], 1.15), jitter=0.1)
    return m


def bush():
    m = Model('bush')
    m.blob((0.0, 0.0, 0.24), (0.36, 0.34, 0.27), C['bush_lo'], C['bush'], C['bush_hi'], floor=0.0)
    m.blob((0.24, 0.12, 0.22), (0.24, 0.23, 0.21), C['bush_lo'], C['bush'], C['bush_hi'], floor=0.0)
    m.blob((-0.20, 0.13, 0.19), (0.22, 0.21, 0.18), C['bush_lo'], C['bush'], C['bush_hi'], floor=0.0)
    return m


# ----------------------------------------------------------------------------------------------------------------
# houses (<= 300 triangles)
# ----------------------------------------------------------------------------------------------------------------
def house_timber():
    """a jettied half-timbered town house with a steep tiled roof and a chimney"""
    m = Model('house_timber', center=True, footprint=0.94)
    W0, D0, W1, D1 = 0.40, 0.28, 0.44, 0.32
    z1, z2, z3, zr, t = 0.42, 0.46, 0.80, 1.30, 0.04
    m.box((-W0 - 0.012, -D0 - 0.012, 0), (W0 + 0.012, D0 + 0.012, 0.07), C['stone_dark'])
    m.box((-W0, -D0, 0.07), (W0, D0, z1), C['plaster'], top=False)  # (under the jetty)
    m.box((-W1 + 0.01, -D1 + 0.01, z1), (W1 - 0.01, D1 - 0.01, z2), C['timber'], bottom=True)
    m.box((-W1, -D1, z2), (W1, D1, z3), C['plaster2'], top=False)  # (under the roof)
    m.gable_roof(-W1, W1, D1, z3, 0.09, zr, t, C['roof_red'], C['roof_red2'], rows=3, xo=0.07)
    m.ridge(-W1 - 0.07, W1 + 0.07, zr + 0.005, 0.03, mulc(C['roof_red'], 0.8))
    tb, gl = C['timber'], C['glass']
    for sx, x in ((-1, -W1), (1, W1)):
        m.gable_wall(x, D1, z3, zr, t, C['plaster2'], sx)
        n = V((sx, 0, 0))
        o = V((x, -D1 * sx, z3))
        u = V((0, sx, 0))
        v = V((0, 0, 1))
        h = zr - t - z3
        m.decal_poly(o, u, v, n, [(D1 - 0.018, 0), (D1 + 0.018, 0), (D1 + 0.018, h - 0.03), (D1 - 0.018, h - 0.03)], tb)
        m.decal(o, u, v, n, (D1 * 0.38, 0.20, D1 * 1.62, 0.235), tb)
        m.decal(o, u, v, n, (D1 - 0.06, 0.06, D1 - 0.025, 0.17), gl)
        m.decal(o, u, v, n, (D1 + 0.025, 0.06, D1 + 0.06, 0.17), gl)
    # framing on the upper storey
    for side, (o, u, v, n, w) in wall_frames(-W1, -D1, W1, D1, z2).items():
        hgt = z3 - z2
        posts = [0.0, w / 2 - 0.0175, w - 0.035] if side in 'EW' else [0.0, w / 4 - 0.0175, w / 2 - 0.0175, 3 * w / 4 - 0.0175, w - 0.035]
        for p in posts:
            m.decal(o, u, v, n, (p, 0, p + 0.035, hgt), tb)
        m.decal(o, u, v, n, (0, hgt - 0.035, w, hgt), tb)
        m.decal(o, u, v, n, (0, 0, w, 0.03), tb)
        if side in 'SN':
            q = w / 4
            m.decal_poly(o, u, v, n, [(0.035, 0.03), (0.07, 0.03), (q - 0.0175, hgt - 0.035), (q - 0.0525, hgt - 0.035)], tb)
            m.decal_poly(o, u, v, n, [(w - 0.07, 0.03), (w - 0.035, 0.03), (w - q + 0.0525, hgt - 0.035), (w - q + 0.0175, hgt - 0.035)], tb)
            for c in (q + 0.0175, 2 * q + 0.0175):
                m.decal(o, u, v, n, (c + 0.03, 0.09, c + q - 0.065, 0.25), gl)
        else:
            m.decal(o, u, v, n, (w / 4 - 0.04, 0.09, w / 4 + 0.04, 0.25), gl)
    # ground floor: door and windows
    fr = wall_frames(-W0, -D0, W0, D0, 0.07)
    o, u, v, n, w = fr['S']
    m.decal(o, u, v, n, (0.50, 0.0, 0.64, 0.30), C['door'])
    m.decal(o, u, v, n, (0.49, 0.30, 0.65, 0.33), tb)
    m.decal(o, u, v, n, (0.14, 0.12, 0.30, 0.26), gl)
    o, u, v, n, w = fr['N']
    m.decal(o, u, v, n, (0.16, 0.12, 0.30, 0.26), gl)
    m.decal(o, u, v, n, (0.50, 0.12, 0.64, 0.26), gl)
    for s in 'EW':
        o, u, v, n, w = fr[s]
        m.decal(o, u, v, n, (w / 2 - 0.06, 0.12, w / 2 + 0.06, 0.26), gl)
    # chimney
    m.box((0.17, 0.04, 0.95), (0.29, 0.16, 1.44), C['brick'])
    m.box((0.155, 0.025, 1.44), (0.305, 0.175, 1.48), mulc(C['brick'], 0.7), bottom=True)
    return m


def house_stone():
    """a stone town house with stepped gables, a slate roof and stone-framed windows"""
    m = Model('house_stone', center=True)
    W, D, ztop, zr, t = 0.36, 0.29, 0.80, 1.22, 0.04
    m.box((-W - 0.015, -D - 0.015, 0), (W + 0.015, D + 0.015, 0.08), C['stone_dark'])
    m.box((-W, -D, 0.08), (W, D, ztop), C['stone'])
    m.gable_roof(-W + 0.03, W - 0.03, D, ztop, 0.06, zr, t, C['slate'], C['slate2'], rows=3, xo=0.0)
    steps = [(-0.31, 0.80), (0.31, 0.80), (0.31, 0.95), (0.21, 0.95), (0.21, 1.08), (0.11, 1.08), (0.11, 1.21), (0.05, 1.21),
             (0.05, 1.34), (-0.05, 1.34), (-0.05, 1.21), (-0.11, 1.21), (-0.11, 1.08), (-0.21, 1.08), (-0.21, 0.95), (-0.31, 0.95)]
    for sx in (-1, 1):
        x0 = sx * (W - 0.03)
        m.prism([(x0, y, z) for y, z in steps], (sx * 0.06, 0, 0), (C['stone'], 0))
        # the gable's face below the roof line
    for side, (o, u, v, n, w) in wall_frames(-W, -D, W, D, 0.08).items():
        hgt = ztop - 0.08
        # quoins
        for q in (0.0, w - 0.07):
            m.decal(o, u, v, n, (q, 0.04, q + 0.07, 0.16), C['stone_light'])
            m.decal(o, u, v, n, (q + (0.02 if q == 0 else -0.02), 0.32, q + 0.07 + (0.02 if q == 0 else -0.02), 0.44), C['stone_light'])
            m.decal(o, u, v, n, (q, 0.58, q + 0.07, hgt), C['stone_light'])
        if side in 'SN':
            for c in (0.17, 0.47):
                m.decal(o, u, v, n, (c - 0.015, 0.40, c + 0.095, 0.60), C['stone_light'])
                m.decal(o, u, v, n, (c, 0.415, c + 0.08, 0.585), C['glass'], eps=0.009)
            if side == 'S':
                m.decal_poly(o, u, v, n, arch_uv(0.30, 0.0, 0.12, 0.30, pointed=False), C['door'])
            else:
                m.decal(o, u, v, n, (0.30, 0.12, 0.40, 0.26), C['glass'])
        else:
            m.decal(o, u, v, n, (w / 2 - 0.05, 0.42, w / 2 + 0.05, 0.58), C['glass'])
    m.box((-0.12, 0.05, 1.0), (-0.02, 0.15, 1.42), C['stone_dark'])
    m.box((-0.13, 0.04, 1.42), (-0.01, 0.16, 1.45), mulc(C['stone_dark'], 0.8), bottom=True)
    return m


def house_mediterranean():
    """a whitewashed house with a low hipped terracotta roof, shutters and a lower annex"""
    m = Model('house_mediterranean', center=True, footprint=0.9)
    W, D, H = 0.40, 0.30, 0.62
    m.box((-W, -D, 0), (W, D, H), C['whitewash'], bevel=0.015)
    m.hip_roof(-W - 0.05, W + 0.05, -D - 0.05, D + 0.05, H + 0.03, H + 0.25, 0.03, C['terracotta'], C['terracotta2'], rows=3,
               inset=0.24)
    # annex with a lean-to roof
    ax0, ax1, ay0, ay1, ah = W, W + 0.30, -0.22, 0.20, 0.40
    m.box((ax0 - 0.01, ay0, 0), (ax1, ay1, ah), mulc(C['whitewash'], 0.97))
    hi, lo, t = ah + 0.10, ah + 0.01, 0.025
    pts_top = [V((ax0, ay0 - 0.04, hi)), V((ax1 + 0.05, ay0 - 0.04, lo)), V((ax1 + 0.05, ay1 + 0.04, lo)), V((ax0, ay1 + 0.04, hi))]
    m.poly(pts_top, C['terracotta'], hint=(0.3, 0, 1))
    m.poly([p - V((0, 0, t)) for p in pts_top], mulc(C['terracotta'], 0.6), hint=(0, 0, -1))
    outn = [(0, -1, 0), (1, 0, 0), (0, 1, 0)]
    for s in range(3):
        a, b = pts_top[s], pts_top[s + 1]
        m.poly([a, b, b - V((0, 0, t)), a - V((0, 0, t))], mulc(C['terracotta'], 0.75), hint=outn[s])
    # end walls of the annex under the lean-to
    m.poly([(ax0, ay0, ah), (ax1, ay0, ah), (ax0, ay0, hi - t)], mulc(C['whitewash'], 0.97), hint=(0, -1, 0))
    m.poly([(ax0, ay1, ah), (ax1, ay1, ah), (ax0, ay1, hi - t)], mulc(C['whitewash'], 0.97), hint=(0, 1, 0))
    # windows with shutters, an arched door
    fr = wall_frames(-W, -D, W, D)
    for side, (o, u, v, n, w) in fr.items():
        cols = (0.18, 0.56) if side in 'SN' else (w / 2 - 0.05,)
        for c in cols:
            m.decal(o, u, v, n, (c, 0.36, c + 0.09, 0.50), C['glass'])
            m.decal(o, u, v, n, (c - 0.045, 0.36, c, 0.50), C['shutter'])
            m.decal(o, u, v, n, (c + 0.09, 0.36, c + 0.135, 0.50), C['shutter'])
        if side == 'S':
            m.decal_poly(o, u, v, n, arch_uv(0.36, 0.0, 0.11, 0.28, pointed=False), C['door'])
    o, u, v, n, w = wall_frames(ax0, ay0, ax1, ay1)['S']
    m.decal(o, u, v, n, (0.10, 0.14, 0.19, 0.27), C['glass'])
    # a flight of steps against the annex and a chimney
    for k in range(3):
        m.box((ax1 - 0.06 - k * 0.07, ay1, 0), (ax1 + 0.0 - k * 0.07, ay1 + 0.10, 0.08 * (k + 1)), mulc(C['whitewash'], 0.9))
    m.box((-0.22, 0.06, H + 0.12), (-0.12, 0.16, H + 0.36), C['whitewash'])
    m.box((-0.235, 0.045, H + 0.36), (-0.105, 0.175, H + 0.39), C['terracotta'], bottom=True)
    return m


def house_steppe_yurt():
    """a felt yurt with a decorated band, a domed roof with rope ties, a smoke ring and a painted door"""
    m = Model('house_steppe_yurt')
    n = 12
    ph = -PI / 2 + PI / n  # a facet faces south (-y)
    m.lathe([(0.50, 0.0), (0.50, 0.15), (0.50, 0.22), (0.50, 0.36)], n,
            lambda i, j: ((C['ornament'] if i == 1 else C['felt']), 0), phase=ph)
    m.lathe([(0.54, 0.34), (0.31, 0.57), (0.11, 0.68), (0.11, 0.72), (0.0, 0.72)], n,
            lambda i, j: (C['wood'] if i == 2 else (C['wood_dark'] if i == 3 else (C['felt2'] if (i == 0 and j % 3 == 0) else C['felt'])), 0),
            phase=ph)
    # underside of the roof's eave
    m.lathe([(0.50, 0.36), (0.54, 0.34)], n, (mulc(C['felt'], 0.6), 0), phase=ph)
    r_in = 0.50 * math.cos(PI / n)
    o = V((0, -r_in, 0))
    m.decal(o, V((1, 0, 0)), V((0, 0, 1)), V((0, -1, 0)), (-0.10, 0.0, 0.10, 0.31), C['ornament'], eps=0.008)
    m.decal(o, V((1, 0, 0)), V((0, 0, 1)), V((0, -1, 0)), (-0.075, 0.0, 0.075, 0.28), (0.78, 0.42, 0.16), eps=0.012)
    m.decal(o, V((1, 0, 0)), V((0, 0, 1)), V((0, -1, 0)), (-0.006, 0.0, 0.006, 0.28), C['wood_dark'], eps=0.015)
    return m


# ----------------------------------------------------------------------------------------------------------------
# other buildings (<= 1500 triangles)
# ----------------------------------------------------------------------------------------------------------------
def plank_wall(m, o, u, v, n, w, h, count, a, b):
    """a wall made of vertical boards in two shades"""
    for k in range(count):
        u0, u1 = w * k / count, w * (k + 1) / count
        c = a if k % 2 == 0 else b
        p = [o + u * u0, o + u * u1, o + u * u1 + v * h, o + u * u0 + v * h]
        m.poly(p, c, hint=n, jit=0.05)


def farm_barn():
    """a timber barn on a stone plinth under a big hipped thatched roof, with a haystack"""
    m = Model('farm_barn', center=True)
    W, D, H = 0.75, 0.42, 0.55
    m.box((-W - 0.02, -D - 0.02, 0), (W + 0.02, D + 0.02, 0.10), C['stone_dark'])
    for side, (o, u, v, n, w) in wall_frames(-W, -D, W, D, 0.10).items():
        plank_wall(m, o, u, v, n, w, H - 0.10, 12 if side in 'SN' else 7, C['wood'], C['wood_dark'])
    m.hip_roof(-W - 0.10, W + 0.10, -D - 0.10, D + 0.10, H - 0.02, 1.18, 0.06, C['thatch'], C['thatch2'], rows=3, inset=0.30)
    m.ridge(-W + 0.20, W - 0.20, 1.18, 0.035, mulc(C['thatch2'], 0.85))
    o, u, v, n, w = wall_frames(-W, -D, W, D, 0.10)['S']
    m.decal(o, u, v, n, (0.52, 0.0, 0.98, 0.40), C['wood_dark'], eps=0.008)
    m.decal(o, u, v, n, (0.745, 0.0, 0.755, 0.40), C['opening'], eps=0.012)
    for x0 in (0.52, 0.75):
        m.decal_poly(o, u, v, n, [(x0 + 0.01, 0.02), (x0 + 0.04, 0.02), (x0 + 0.22, 0.36), (x0 + 0.19, 0.36)], C['wood_light'], eps=0.011)
    o, u, v, n, w = wall_frames(-W, -D, W, D, 0.10)['E']
    m.decal(o, u, v, n, (w / 2 - 0.12, 0.0, w / 2 + 0.12, 0.34), C['wood_dark'], eps=0.008)
    # haystack
    with m.xf(T(W + 0.30, -D - 0.12, 0)):
        m.lathe([(0.20, 0.0), (0.22, 0.16), (0.15, 0.34), (0.0, 0.46)], 8, lambda i, j: (C['hay'] if i % 2 == 0 else mulc(C['hay'], 0.9), 0))
    # a fence stub
    for k in range(4):
        x = -W - 0.05 + k * 0.22
        m.box((x - 0.015, -D - 0.30, 0), (x + 0.015, -D - 0.27, 0.22), C['wood_dark'])
    m.box((-W - 0.06, -D - 0.295, 0.13), (-W + 0.62, -D - 0.275, 0.16), C['wood'], bottom=True)
    return m


def windmill():
    """a whitewashed tower mill with a thatched cap and four lattice sails facing south"""
    m = Model('windmill', center=False)
    m.lathe([(0.44, 0.0), (0.44, 0.10), (0.37, 0.95), (0.32, 1.40)], 8,
            lambda i, j: ((C['stone_dark'] if i == 0 else C['whitewash']), 0))
    m.lathe([(0.32, 1.40), (0.37, 1.38), (0.36, 1.50), (0.19, 1.74), (0.0, 1.84)], 8,
            lambda i, j: ((C['wood_dark'] if i == 0 else (C['wood'] if i == 1 else (C['thatch'] if i == 2 else C['thatch2']))), 0))
    hub = V((0, -0.42, 1.52))
    m.limb((0, -0.10, 1.52), hub, 0.05, 0.05, 6, C['wood_dark'])
    for k in range(4):
        a = PI / 4 + k * PI / 2
        d = V((math.cos(a), 0, math.sin(a)))
        s = V((-math.sin(a), 0, math.cos(a)))  # sail side
        tip = hub + d * 1.0
        m.limb(hub, tip, 0.026, 0.018, 4, C['wood_dark'], up=(0, 1, 0))
        p0 = hub + d * 0.20 + V((0, 0.012, 0))
        p1 = hub + d * 0.98 + V((0, 0.012, 0))
        q0, q1 = p0 + s * 0.20, p1 + s * 0.22
        verts, polys = quad_grid(p0, p1, q0, q1, 1, 1)
        m.slab(verts, polys, 0.012, (0, -1, 0), (C['canvas'], 0), (mulc(C['canvas'], 0.85), 0), (C['wood'], 0))
        for f in (0.35, 0.6, 0.85):
            a0 = hub + d * (0.20 + 0.78 * f) + V((0, -0.002, 0))
            m.poly([a0, a0 + d * 0.025, a0 + d * 0.025 + s * 0.215, a0 + s * 0.215], C['wood_dark'], hint=(0, -1, 0), jit=0)
        m.poly([p0 + V((0, -0.008, 0)), p1 + V((0, -0.008, 0)), p1 + s * 0.02 + V((0, -0.008, 0)), p0 + s * 0.02 + V((0, -0.008, 0))],
               C['wood_dark'], hint=(0, -1, 0), jit=0)
    # door and windows on the south side
    o, u, v, n = facet_frame(0.44, 0.10, 0.37, 0.95, -PI / 2, 8)
    m.decal_poly(o, u, v, n, arch_uv(-0.08, 0.0, 0.16, 0.34, pointed=False), C['door'])
    m.decal_poly(o, u, v, n, arch_uv(-0.05, 0.62, 0.10, 0.16, pointed=False), C['glass'])
    o, u, v, n = facet_frame(0.37, 0.95, 0.32, 1.40, -PI / 2, 8)
    m.decal_poly(o, u, v, n, arch_uv(-0.045, 0.12, 0.09, 0.15, pointed=False), C['glass'])
    for a in (0.0, PI):
        o, u, v, n = facet_frame(0.44, 0.10, 0.37, 0.95, a, 8)
        m.decal_poly(o, u, v, n, arch_uv(-0.045, 0.45, 0.09, 0.15, pointed=False), C['glass'])
    # a small gallery
    m.lathe([(0.42, 0.56), (0.52, 0.56), (0.52, 0.60), (0.40, 0.60)], 8, (C['wood'], 0))
    return m


def church_gothic():
    """a Gothic hall church: buttressed nave, chancel with a polygonal apse, west tower with pinnacles and a
    tall slate spire, south porch"""
    m = Model('church_gothic', center=True, footprint=0.83)
    st, sl = C['limestone'], C['slate']
    NX0, NX1, ND, NH, NR = -0.55, 0.80, 0.36, 1.05, 1.80
    m.box((NX0, -ND, 0), (NX1, ND, NH), st)
    m.gable_roof(NX0, NX1, ND, NH, 0.06, NR, 0.04, sl, C['slate2'], rows=3, xo=0.03)
    m.ridge(NX0 - 0.03, NX1 + 0.03, NR + 0.005, 0.025, mulc(sl, 0.8))
    m.gable_wall(NX1, ND, NH, NR, 0.04, st, 1)
    m.gable_wall(NX0, ND, NH, NR, 0.04, st, -1)
    # buttresses and lancet windows
    for sy in (-1, 1):
        for x in (-0.20, 0.15, 0.50, NX1 - 0.04):
            y0 = sy * ND
            m.box((x - 0.045, min(y0, y0 + sy * 0.15), 0), (x + 0.045, max(y0, y0 + sy * 0.15), 0.60), mulc(st, 0.95))
            m.box((x - 0.04, min(y0, y0 + sy * 0.09), 0.60), (x + 0.04, max(y0, y0 + sy * 0.09), 0.95), mulc(st, 0.95))
            m.poly([(x - 0.04, y0 + sy * 0.09, 0.95), (x + 0.04, y0 + sy * 0.09, 0.95), (x + 0.04, y0, 1.04), (x - 0.04, y0, 1.04)],
                   mulc(st, 0.85), hint=(0, sy, 1))
            m.poly([(x - 0.045, y0 + sy * 0.15, 0.60), (x + 0.045, y0 + sy * 0.15, 0.60), (x + 0.045, y0 + sy * 0.09, 0.66),
                    (x - 0.045, y0 + sy * 0.09, 0.66)], mulc(st, 0.85), hint=(0, sy, 1))
        fr = wall_frames(NX0, -ND, NX1, ND)['S' if sy < 0 else 'N']
        o, u, v, n, w = fr
        for xc in (-0.025, 0.325, 0.65):
            uc = (xc - NX0) if sy < 0 else (NX1 - xc)
            m.decal_poly(o, u, v, n, arch_uv(uc - 0.065, 0.30, 0.13, 0.56), C['glass_blue'])
            m.decal(o, u, v, n, (uc - 0.008, 0.30, uc + 0.008, 0.76), mulc(st, 0.9), eps=0.009)
    # chancel and apse
    CX0, CX1, CD, CH, CR = NX1, 1.15, 0.27, 0.90, 1.42
    m.box((CX0 - 0.02, -CD, 0), (CX1, CD, CH), st)
    # (its east end lies under the apse roof, which starts on the same edge)
    ze = m.gable_roof(CX0, CX1, CD, CH, 0.05, CR, 0.035, sl, C['slate2'], rows=2, xo=0.0, ends=(True, False))
    ring = [V((CX1 + CD * math.cos(a), CD * math.sin(a), 0)) for a in [-PI / 2 + k * PI / 4 for k in range(5)]]
    for k in range(4):
        a, b = ring[k], ring[k + 1]
        nrm = ((a + b) / 2 - V((CX1, 0, 0)))
        m.poly([a, b, b + V((0, 0, CH)), a + V((0, 0, CH))], st, hint=nrm)
        mid = (a + b) / 2
        uu = (b - a).normalized()
        m.decal_poly(mid - uu * 0.05, uu, V((0, 0, 1)), nrm.normalized(), arch_uv(0, 0.28, 0.10, 0.48), C['glass_blue'])
    R = CD + 0.05
    eave = [V((CX1 + R * math.cos(a), R * math.sin(a), ze)) for a in [-PI / 2 + k * PI / 4 for k in range(5)]]
    apex = V((CX1, 0, CR))
    for k in range(4):
        m.poly([eave[k], eave[k + 1], apex], sl, hint=(eave[k] + eave[k + 1] - V((2 * CX1, 0, -1))))
        m.poly([eave[k], eave[k + 1], eave[k + 1] - V((0, 0, 0.035)), eave[k] - V((0, 0, 0.035))], mulc(sl, 0.75),
               hint=(eave[k] + eave[k + 1] - V((2 * CX1, 0, 0))))
    # west tower
    TX0, TX1, TD, TH = -1.05, -0.55, 0.25, 2.0
    m.box((TX0, -TD, 0), (TX1, TD, TH), st, bevel=0.012)
    for z in (0.74, 1.40):
        m.box((TX0 - 0.02, -TD - 0.02, z), (TX1 + 0.02, TD + 0.02, z + 0.04), mulc(st, 0.9), bottom=True)
    for cx in (TX0, TX1):
        for cy in (-TD, TD):
            m.box((cx - 0.04, cy - 0.04, 0), (cx + 0.04, cy + 0.04, 1.36), mulc(st, 0.95))
    for side, (o, u, v, n, w) in wall_frames(TX0, -TD, TX1, TD).items():
        for uc in (w / 2 - 0.10, w / 2 + 0.02):
            m.decal_poly(o, u, v, n, arch_uv(uc, 1.52, 0.08, 0.32), C['opening'])
        if side in 'SW':
            m.decal_poly(o, u, v, n, arch_uv(w / 2 - 0.035, 0.95, 0.07, 0.22), C['glass_blue'])
        if side == 'W':
            m.decal_poly(o, u, v, n, arch_uv(w / 2 - 0.10, 0.0, 0.20, 0.42), mulc(st, 0.75))
            m.decal_poly(o, u, v, n, arch_uv(w / 2 - 0.07, 0.0, 0.14, 0.34), C['door'], eps=0.009)
    # parapet, pinnacles, spire with lucarnes, finial
    m.box((TX0 - 0.025, -TD - 0.025, TH), (TX1 + 0.025, -TD + 0.02, TH + 0.10), mulc(st, 0.92), bottom=True)
    m.box((TX0 - 0.025, TD - 0.02, TH), (TX1 + 0.025, TD + 0.025, TH + 0.10), mulc(st, 0.92), bottom=True)
    m.box((TX0 - 0.025, -TD + 0.02, TH), (TX0 + 0.02, TD - 0.02, TH + 0.10), mulc(st, 0.92), bottom=True)
    m.box((TX1 - 0.02, -TD + 0.02, TH), (TX1 + 0.025, TD - 0.02, TH + 0.10), mulc(st, 0.92), bottom=True)
    tcx = (TX0 + TX1) / 2
    for cx in (TX0, TX1):
        for cy in (-TD, TD):
            m.box((cx - 0.035, cy - 0.035, TH), (cx + 0.035, cy + 0.035, TH + 0.17), st)
            with m.xf(T(cx, cy, TH + 0.17)):
                m.lathe([(0.05, 0.0), (0.0, 0.20)], 4, (sl, 0), phase=PI / 4)
    with m.xf(T(tcx, 0, TH)):
        m.lathe([(0.21, 0.0), (0.15, 0.48), (0.0, 1.04)], 8, (sl, 0), phase=PI / 8)
        for k in range(4):
            a = k * PI / 2
            with m.xf(Rz(a)):
                rr = 0.19
                # a small gabled dormer on the spire
                m.prism([(rr - 0.04, -0.05, 0.10), (rr - 0.04, 0.05, 0.10), (rr - 0.04, 0.0, 0.24)], (0.08, 0, 0), (sl, 0))
                m.decal_poly(V((rr + 0.04, 0.0, 0.10)), V((0, 1, 0)), V((0, 0, 1)), V((1, 0, 0)),
                             [(-0.025, 0.0), (0.025, 0.0), (0.0, 0.08)], C['opening'])
        m.lathe([(0.0, 1.0), (0.03, 1.035), (0.0, 1.07)], 4, (C['gold'], 0))
        m.box((-0.008, -0.008, 1.07), (0.008, 0.008, 1.20), C['gold'])
        m.box((-0.045, -0.008, 1.125), (0.045, 0.008, 1.145), C['gold'])
    # south porch
    with m.xf(T(-0.375, -ND, 0) @ Rz(-PI / 2)):
        # local x runs south, y runs east
        m.box((0.0, -0.11, 0), (0.22, 0.11, 0.50), st)
        m.gable_roof(-0.0, 0.22, 0.11, 0.50, 0.04, 0.74, 0.03, sl, rows=1, xo=0.03)
        m.gable_wall(0.22, 0.11, 0.50, 0.74, 0.03, st, 1)
        o, u, v, n = V((0.22, 0.11, 0)), V((0, -1, 0)), V((0, 0, 1)), V((1, 0, 0))
        m.decal_poly(o, u, v, n, arch_uv(0.05, 0.0, 0.12, 0.38), C['door'])
    return m


def mosque():
    """an Ottoman-style mosque: prayer hall with a drum and lead dome, corner turrets, a portico with three
    small domes and a slender pencil minaret"""
    m = Model('mosque', center=True, footprint=0.86)
    st = C['sandstone']
    HX, HY0, HY1, HH = 0.70, -0.62, 0.70, 0.82
    m.box((-HX, HY0, 0), (HX, HY1, HH), st, bevel=0.02)
    m.box((-HX - 0.025, HY0 - 0.025, HH - 0.03), (HX + 0.025, HY1 + 0.025, HH + 0.03), mulc(st, 0.9), bottom=True)
    cy = (HY0 + HY1) / 2
    with m.xf(T(0, cy, HH + 0.03)):
        m.lathe([(0.50, 0.0), (0.50, 0.05), (0.50, 0.14), (0.50, 0.19), (0.53, 0.19)], 12,
                lambda i, j: ((C['opening'] if (i == 1 and j % 2 == 0) else st), 0) if i < 3 else (mulc(st, 0.85), 0))
        m.lathe([(0.53, 0.19), (0.49, 0.37), (0.38, 0.53), (0.21, 0.63), (0.0, 0.67)], 12,
                lambda i, j: (C['lead'] if (i + j) % 2 else C['lead2'], 0))
        m.lathe([(0.0, 0.66), (0.035, 0.70), (0.022, 0.74), (0.032, 0.77), (0.0, 0.84)], 6, (C['gold'], 0))
        # crescent
        pts = [V((0.055 * math.cos(a), 0, 0.90 + 0.055 * math.sin(a))) for a in [-PI * 0.75 + k * PI * 0.3 for k in range(6)]]
        m.tube(pts, 0.010, 3, (C['gold'], 0))
    for sx in (-1, 1):
        for sy in (HY0 + 0.12, HY1 - 0.12):
            with m.xf(T(sx * (HX - 0.12), sy, HH)):
                m.lathe([(0.10, 0.0), (0.10, 0.14), (0.12, 0.14), (0.10, 0.22), (0.06, 0.28), (0.0, 0.30)], 8,
                        lambda i, j: ((st if i < 2 else C['lead']), 0))
                m.lathe([(0.0, 0.30), (0.012, 0.31), (0.0, 0.37)], 4, (C['gold'], 0))
    # portico
    PY0, PY1, PH = -1.02, HY0, 0.50
    m.box((-HX - 0.02, PY0, PH), (HX + 0.02, PY1, PH + 0.08), mulc(st, 0.92), bottom=True)
    for x in (-0.62, -0.21, 0.21, 0.62):
        with m.xf(T(x, PY0 + 0.06, 0)):
            m.lathe([(0.04, 0.0), (0.035, 0.46), (0.05, 0.50)], 6, (st, 0))
    o, u, v, n, w = wall_frames(-HX, HY0, HX, HY1)['S']
    for uc in (0.29, 0.70, 1.11):
        m.decal_poly(o, u, v, n, arch_uv(uc - 0.11, 0.0, 0.22, 0.44), mulc(st, 0.65))
    m.decal_poly(o, u, v, n, arch_uv(0.70 - 0.07, 0.0, 0.14, 0.34), C['door'], eps=0.009)
    for x in (-0.42, 0.0, 0.42):
        with m.xf(T(x, (PY0 + PY1) / 2, PH + 0.08)):
            m.lathe([(0.15, 0.0), (0.13, 0.08), (0.08, 0.14), (0.0, 0.16)], 8, (C['lead'], 0))
    # windows around the hall
    for side, (o, u, v, n, w) in wall_frames(-HX, HY0, HX, HY1).items():
        if side == 'S':
            for uc in (0.29, 0.70, 1.11):
                m.decal_poly(o, u, v, n, arch_uv(uc - 0.05, 0.60, 0.10, 0.16, pointed=True), C['glass'])
            continue
        k = 3
        for i in range(k):
            uc = w * (i + 0.5) / k
            m.decal_poly(o, u, v, n, arch_uv(uc - 0.055, 0.22, 0.11, 0.26), C['glass'])
            m.decal_poly(o, u, v, n, arch_uv(uc - 0.04, 0.58, 0.08, 0.14), C['glass'])
    # minaret
    with m.xf(T(HX + 0.20, PY0 + 0.10, 0)):
        m.box((-0.12, -0.12, 0), (0.12, 0.12, 0.62), st)
        m.lathe([(0.12, 0.62), (0.085, 0.74), (0.08, 1.98), (0.135, 2.02), (0.135, 2.07), (0.072, 2.09), (0.068, 2.40), (0.0, 2.90)], 8,
                lambda i, j: ((C['lead'] if i == 6 else (mulc(st, 0.9) if i in (2, 3, 4) else st)), 0))
        m.lathe([(0.0, 2.88), (0.016, 2.92), (0.0, 3.0)], 4, (C['gold'], 0))
    return m


def castle():
    """a stone castle: square curtain walls with crenellations, four round corner towers with slate cones,
    a gatehouse to the south, a tall keep with corner turrets, a hall in the bailey and the lord's flag"""
    m = Model('castle', center=False)
    st, sl = C['stone'], C['slate']
    A, Wt, WH = 1.55, 0.22, 0.95
    m.box((-A, -A, 0), (A, -A + Wt, WH), st)
    m.box((-A, A - Wt, 0), (A, A, WH), st)
    m.box((-A, -A + Wt, 0), (-A + Wt, A - Wt, WH), st)
    m.box((A - Wt, -A + Wt, 0), (A, A - Wt, WH), st)
    e = A - 0.035
    TR = 0.42
    m.merlons((-A + TR, -e), (-0.48, -e), WH, 3, st)
    m.merlons((0.48, -e), (A - TR, -e), WH, 3, st)
    m.merlons((-A + TR, e), (A - TR, e), WH, 7, st)
    m.merlons((-e, -A + TR), (-e, A - TR), WH, 7, st)
    m.merlons((e, -A + TR), (e, A - TR), WH, 7, st)
    # corner towers
    for sx in (-1, 1):
        for sy in (-1, 1):
            with m.xf(T(sx * A, sy * A, 0)):
                m.lathe([(TR, 0.0), (TR - 0.02, 1.30), (TR + 0.06, 1.28), (0.0, 2.02)], 10,
                        lambda i, j: ((st if i == 0 else (C['wood_dark'] if i == 1 else (sl if j % 2 else C['slate2']))), 0))
                # arrow slits facing out
                a = math.atan2(sy, sx)
                for da in (-0.45, 0.45):
                    aa = a + da
                    nrm = V((math.cos(aa), math.sin(aa), 0))
                    uu = V((-math.sin(aa), math.cos(aa), 0))
                    o = nrm * (TR - 0.012)
                    m.decal(o, uu, V((0, 0, 1)), nrm, (-0.012, 0.55, 0.012, 0.80), C['opening'], eps=0.012)
                if sy < 0:
                    m.limb((0, 0, 1.98), (0, 0, 2.30), 0.01, 0.008, 4, C['wood_dark'])
                    pennant(m, (0, 0, 2.24), 0.30, 0.10, direction=(1, 0.2, 0), droop=0.03)
    # gatehouse
    GX, GY0, GY1, GH = 0.45, -A - 0.20, -A + Wt + 0.12, 1.30
    m.box((-GX, GY0, 0), (GX, GY1, GH), st, bevel=0.02, top=False)  # (the parapet band's top closes it)
    m.box((-GX - 0.04, GY0 - 0.04, GH - 0.10), (GX + 0.04, GY1 + 0.04, GH), mulc(st, 0.9), bottom=True)
    ge = 0.035
    m.merlons((-GX - 0.04, GY0 - 0.04 + ge), (GX + 0.04, GY0 - 0.04 + ge), GH, 4, st)
    m.merlons((-GX - 0.04, GY1 + 0.04 - ge), (GX + 0.04, GY1 + 0.04 - ge), GH, 4, st)
    m.merlons((-GX - 0.04 + ge, GY0 + 0.12), (-GX - 0.04 + ge, GY1 - 0.06), GH, 2, st)
    m.merlons((GX + 0.04 - ge, GY0 + 0.12), (GX + 0.04 - ge, GY1 - 0.06), GH, 2, st)
    o, u, v, n, w = wall_frames(-GX, GY0, GX, GY1)['S']
    m.decal_poly(o, u, v, n, arch_uv(w / 2 - 0.17, 0.0, 0.34, 0.62, pointed=False, steps=2), mulc(st, 0.72))
    m.decal_poly(o, u, v, n, arch_uv(w / 2 - 0.14, 0.0, 0.28, 0.56, pointed=False, steps=2), C['opening'], eps=0.009)
    for uc in (0.16, w - 0.20):
        m.decal(o, u, v, n, (uc, 0.80, uc + 0.04, 1.02), C['opening'])
    # keep
    KX, KY0, KY1, KH = 0.62, 0.05, 1.15, 2.15
    m.box((-KX, KY0, 0), (KX, KY1, KH), mulc(st, 1.04), bevel=0.03, top=False)  # (the parapet band's top closes it)
    m.box((-KX - 0.045, KY0 - 0.045, KH - 0.12), (KX + 0.045, KY1 + 0.045, KH), mulc(st, 0.9), bottom=True)
    ke = 0.03
    m.merlons((-KX + 0.10, KY0 - 0.045 + ke), (KX - 0.10, KY0 - 0.045 + ke), KH, 4, st)
    m.merlons((-KX + 0.10, KY1 + 0.045 - ke), (KX - 0.10, KY1 + 0.045 - ke), KH, 4, st)
    m.merlons((-KX - 0.045 + ke, KY0 + 0.12), (-KX - 0.045 + ke, KY1 - 0.12), KH, 3, st)
    m.merlons((KX + 0.045 - ke, KY0 + 0.12), (KX + 0.045 - ke, KY1 - 0.12), KH, 3, st)
    m.hip_roof(-KX + 0.06, KX - 0.06, KY0 + 0.06, KY1 - 0.06, KH - 0.02, KH + 0.42, 0.03, sl, C['slate2'], rows=2)
    for sx in (-1, 1):
        for yy in (KY0, KY1):
            with m.xf(T(sx * KX, yy, 0)):
                m.lathe([(0.0, KH - 0.40), (0.13, KH - 0.18), (0.13, KH + 0.10), (0.16, KH + 0.08), (0.0, KH + 0.46)], 6,
                        lambda i, j: ((st if i < 2 else sl), 0))
    for side, (o, u, v, n, w) in wall_frames(-KX, KY0, KX, KY1).items():
        cols = (w * 0.3, w * 0.7) if side in 'SN' else (w * 0.5,)
        for uc in cols:
            m.decal_poly(o, u, v, n, arch_uv(uc - 0.04, 1.05, 0.08, 0.18, pointed=False, steps=1), C['opening'])
            m.decal_poly(o, u, v, n, arch_uv(uc - 0.045, 1.55, 0.09, 0.22, pointed=False, steps=1), C['opening'])
        if side == 'S':
            m.decal_poly(o, u, v, n, arch_uv(w / 2 - 0.08, 0.0, 0.16, 0.36, pointed=False), C['door'])
    # flag on the keep
    m.limb((0, (KY0 + KY1) / 2, KH + 0.40), (0, (KY0 + KY1) / 2, KH + 1.12), 0.018, 0.012, 5, C['wood_dark'])
    m.lathe([(0.0, KH + 1.11), (0.03, KH + 1.14), (0.0, KH + 1.18)], 4, (C['gold'], 0))
    flag(m, 0.015, KH + 0.66, KH + 1.08, 0.64, cols=4, rows=2, wave=0.05, plane_y=(KY0 + KY1) / 2)
    # hall in the bailey
    with m.xf(T(1.00, -0.25, 0) @ Rz(PI / 2)):
        m.box((-0.62, -0.18, 0), (0.62, 0.18, 0.62), C['plaster'], top=False)
        m.gable_roof(-0.62, 0.62, 0.18, 0.62, 0.05, 0.95, 0.03, C['roof_red'], C['roof_red2'], rows=2, xo=0.04)
        m.gable_wall(0.62, 0.18, 0.62, 0.95, 0.03, C['plaster'], 1)
        m.gable_wall(-0.62, 0.18, 0.62, 0.95, 0.03, C['plaster'], -1)
        for side, (o, u, v, n, w) in wall_frames(-0.62, -0.18, 0.62, 0.18).items():
            if side in 'SN':
                for k in range(4):
                    m.decal(o, u, v, n, (0.16 + k * 0.28, 0.30, 0.24 + k * 0.28, 0.46), C['glass'])
    # a well
    with m.xf(T(-0.80, -0.70, 0)):
        m.lathe([(0.14, 0.0), (0.14, 0.16), (0.10, 0.16), (0.10, 0.10)], 8, (C['stone_light'], 0))
    return m


def town_wall_tower():
    """a square town-wall tower with a tiled pyramid roof, flanked by stubs of crenellated wall"""
    m = Model('town_wall_tower', center=False)
    st = C['stone']
    TW, TH = 0.36, 1.55
    m.box((-1.25, -0.14, 0), (-TW, 0.14, 0.95), st)
    m.box((TW, -0.14, 0), (1.25, 0.14, 0.95), st)
    m.box((-1.25, 0.10, 0.95), (-TW, 0.14, 1.0), mulc(st, 0.9))
    m.box((TW, 0.10, 0.95), (1.25, 0.14, 1.0), mulc(st, 0.9))
    m.merlons((-1.20, -0.105), (-TW - 0.04, -0.105), 0.95, 4, st)
    m.merlons((TW + 0.04, -0.105), (1.20, -0.105), 0.95, 4, st)
    m.box((-TW, -TW, 0), (TW, TW, TH), mulc(st, 1.03), bevel=0.02, top=False)  # (under the band and the roof)
    m.box((-TW - 0.03, -TW - 0.03, 0.0), (TW + 0.03, TW + 0.03, 0.18), mulc(st, 0.86))
    m.box((-TW - 0.04, -TW - 0.04, TH - 0.14), (TW + 0.04, TW + 0.04, TH), mulc(st, 0.9), bottom=True, top=False)
    m.hip_roof(-TW - 0.10, TW + 0.10, -TW - 0.10, TW + 0.10, TH - 0.02, TH + 0.62, 0.03, C['roof_red'], C['roof_red2'], rows=3)
    m.lathe([(0.0, TH + 0.60), (0.02, TH + 0.64), (0.0, TH + 0.72)], 4, (C['gold'], 0))
    for side, (o, u, v, n, w) in wall_frames(-TW, -TW, TW, TW).items():
        m.decal(o, u, v, n, (w / 2 - 0.015, 0.45, w / 2 + 0.015, 0.72), C['opening'])
        m.decal_poly(o, u, v, n, arch_uv(w / 2 - 0.05, 1.05, 0.10, 0.20, pointed=False, steps=1), C['opening'])
        if side == 'N':
            m.decal_poly(o, u, v, n, arch_uv(w / 2 - 0.08, 0.0, 0.16, 0.36, pointed=False), C['door'])
    return m


def tent():
    """a round campaign pavilion: canvas wall, striped conical roof and valance, centre pole with a pennant"""
    m = Model('tent')
    n = 10
    ph = -PI / 2 + PI / n
    m.lathe([(0.47, 0.0), (0.47, 0.42)], n, (C['canvas'], 0), phase=ph)
    stripe = lambda i, j: ((TINT, 1) if j % 2 == 0 else (C['canvas'], 0))
    m.lathe([(0.52, 0.36), (0.53, 0.44), (0.30, 0.70), (0.0, 0.97)], n, stripe, phase=ph)
    m.lathe([(0.47, 0.42), (0.52, 0.36)], n, (mulc(C['canvas'], 0.65), 0), phase=ph)
    r_in = 0.47 * math.cos(PI / n)
    o = V((0, -r_in, 0))
    m.decal_poly(o, V((1, 0, 0)), V((0, 0, 1)), V((0, -1, 0)), [(-0.10, 0.0), (0.10, 0.0), (0.0, 0.34)], C['opening'], eps=0.008)
    m.poly([o + V((0.10, -0.01, 0.0)), o + V((0.16, -0.08, 0.0)), o + V((0.0, -0.01, 0.34))], mulc(C['canvas'], 0.9), hint=(0.3, -1, 0))
    m.limb((0, 0, 0.95), (0, 0, 1.22), 0.013, 0.010, 4, C['wood_dark'], cap0=False)
    pennant(m, (0.0, 0.0, 1.15), 0.24, 0.10, direction=(1, 0, 0), droop=0.025)
    return m


# ----------------------------------------------------------------------------------------------------------------
# soldiers (face +y; a standing man is 1.0 tall)
# ----------------------------------------------------------------------------------------------------------------
def coat_paint(pattern):
    """paint for the 8-segment body: 'tabard' = front and back tinted, sides gambeson; 'full' = all tinted"""
    def f(i, j):
        if i < 0:
            return (C['gambeson'], 0)
        if pattern == 'full':
            return (TINT, 1)
        if pattern == 'coat':
            return (TINT, 1)
        side = j in (3, 7)
        return (C['gambeson'], 0) if side else (TINT, 1)
    return f


def body(m, z0=0.33, pattern='tabard', hem=0.15, belt=C['leather'], col_fn=None):
    """torso from the hem to the neck; 8 segments with a facet facing front and back"""
    rings = []
    spec = [(z0, hem, 0.115), (0.49, 0.125, 0.09), (0.65, 0.15, 0.098), (0.75, 0.138, 0.085), (0.795, 0.06, 0.05)]
    ph = PI / 8
    for z, rx, ry in spec:
        rings.append([V((rx * math.cos(ph + TAU * s / 8), ry * math.sin(ph + TAU * s / 8), z)) for s in range(8)])
    rings.append([V((0, 0, 0.80))])
    m.loft(rings, col_fn or coat_paint(pattern), cap0=True)
    if belt:
        m.lathe([(0.132, 0.475), (0.132, 0.51)], 8, (belt, 0), sx=1.0, sy=0.74)


def legs(m, col_l=C['hose'], col_r=C['hose'], boots=C['boot'], top=0.42, spread=0.062, tint_l=0, tint_r=0):
    for sx, col, tn in ((-1, col_l, tint_l), (1, col_r, tint_r)):
        x = sx * spread
        m.tube([(x, 0.0, 0.05), (x * 1.04, 0.0, 0.22), (x * 1.08, -0.005, top)], [0.035, 0.04, 0.05], 5, (col, tn), cap0=False, cap1=False)
        # an ankle boot, a little longer than the leg is thick, with a lower toe
        m.box((x - 0.031, -0.036, 0), (x + 0.031, 0.040, 0.055), boots)
        m.box((x - 0.029, 0.040, 0), (x + 0.029, 0.066, 0.034), mulc(boots, 0.9))


def arm(m, sx, shoulder, elbow, hand, sleeve, skin=C['skin'], r=0.046, tint=0, fist=0.032):
    """an arm from the shoulder through the elbow to a fist centred on 'hand': weapons are placed so that their
    shaft runs through that point, so the fist closes round them. Returns the wrist (for cuffs)."""
    h, e = V(hand), V(elbow)
    d = (h - e).normalized()
    wrist = h - d * (fist * 0.85)
    m.tube([shoulder, elbow, wrist], [r, r * 0.88, r * 0.75], 5, (sleeve, tint))  # the cap at the wrist is the cuff
    m.blob((h.x, h.y, h.z), (fist, fist, fist * 1.15), skin, skin, skin, jitter=0.0, spin=0.3)
    return wrist


def head(m, z=0.80, skin=C['skin']):
    with m.xf(T(0, 0.006, 0)):
        m.lathe([(0.0, z - 0.005), (0.058, z + 0.03), (0.056, z + 0.10), (0.0, z + 0.135)], 6, (skin, 0), phase=PI / 2)


def kettle_hat(m, z=0.875, col=C['steel']):
    m.lathe([(0.072, z + 0.012), (0.14, z - 0.006), (0.14, z + 0.006), (0.078, z + 0.024), (0.074, z + 0.085), (0.045, z + 0.122),
             (0.0, z + 0.13)], 8, lambda i, j: ((mulc(col, 0.8) if i == 0 else col), 0))


def spear(m, x, y, z0, z1, r=0.012, head_len=0.16, head_w=0.03, shaft=C['wood']):
    m.limb((x, y, z0), (x, y, z1), r, r * 0.85, 4, shaft)
    p = V((x, y, z1))
    pts = [p, p + V((head_w, 0, head_len * 0.35)), p + V((0, 0, head_len)), p + V((-head_w, 0, head_len * 0.35))]
    m.slab(pts, [(0, 1, 2, 3)], 0.012, (0, -1, 0), (C['steel'], 0), (C['steel'], 0), (C['steel_dark'], 0))


def sword_at_hip(m, side=-1):
    x = side * 0.14
    m.limb((x, 0.02, 0.50), (x * 1.2, -0.12, 0.20), 0.014, 0.012, 4, C['leather'])
    m.box((x - 0.035, 0.0, 0.50), (x + 0.035, 0.04, 0.515), C['steel_dark'])
    m.limb((x, 0.02, 0.515), (x * 0.95, 0.04, 0.59), 0.01, 0.01, 4, C['leather'])


def soldier_infantry():
    """a man-at-arms on foot: kettle hat, gambeson under a tinted tabard, a spear gripped in the right fist and a
    heater shield on the left arm"""
    m = Model('soldier_infantry')
    legs(m)
    body(m, pattern='tabard')
    head(m)
    kettle_hat(m)
    sx, sy = 0.205, 0.135  # the spear's line
    arm(m, 1, (0.165, 0.0, 0.735), (0.215, 0.02, 0.58), (sx, sy, 0.53), C['gambeson'])
    spear(m, sx, sy, 0.02, 1.36)
    arm(m, -1, (-0.165, 0.0, 0.735), (-0.205, 0.05, 0.57), (-0.165, 0.15, 0.53), C['gambeson'])
    shield(m, (-0.19, 0.19, 0.52), (-0.38, 0.92, 0.0), 0.27, 0.36)
    sword_at_hip(m, 1)
    return m


def morion(m, z=0.875):
    """a combed morion: the brim sweeps up into points at front and back, a tall comb runs over the crown"""
    def dfm(p):
        r = math.hypot(p.x, p.y)
        if r > 0.10:
            k = (p.y / r) ** 2
            p.y *= 1.0 + 0.16 * k
            p.z += 0.085 * k ** 1.5 - 0.008
        return p
    m.lathe([(0.072, z + 0.012), (0.152, z - 0.004), (0.152, z + 0.008), (0.078, z + 0.026), (0.074, z + 0.075), (0.045, z + 0.115),
             (0.0, z + 0.124)], 8, lambda i, j: ((mulc(C['steel'], 0.85) if i == 0 else C['steel']), 0), deform=dfm, phase=0.0)
    pts = [(0, -0.088, z + 0.05), (0, -0.07, z + 0.15), (0, -0.03, z + 0.205), (0, 0.02, z + 0.215), (0, 0.06, z + 0.18),
           (0, 0.088, z + 0.05)]
    verts = [V(p) for p in pts] + [V((0, 0, z + 0.05))]
    k = len(pts)
    m.slab(verts, [(k, i, i + 1) for i in range(k - 1)], 0.016, (1, 0, 0), (C['steel'], 0), (C['steel'], 0), (C['steel_dark'], 0))


def soldier_pikeman():
    """a pikeman: combed morion, steel breastplate, pauldrons and tassets over a tinted doublet, parti-coloured
    hose, a pike of 2.8 figure heights (about 5 m) gripped upright in the right fist, a sword at the left hip"""
    m = Model('soldier_pikeman')
    legs(m, col_l=TINT, col_r=C['hose_light'], tint_l=1)
    body(m, pattern='full')
    # breastplate over the chest front
    rings = []
    for z, rx, ry in ((0.47, 0.135, 0.10), (0.63, 0.158, 0.108), (0.74, 0.146, 0.094)):
        rings.append([V((rx * math.cos(a), ry * math.sin(a), z)) for a in [PI * 0.12 + k * PI * 0.76 / 4 for k in range(5)]])
    m.loft(rings, (C['steel'], 0), closed=False, orient='auto')
    m.lathe([(0.10, 0.75), (0.085, 0.80)], 8, (C['steel'], 0), sy=0.8)
    # tassets: two plates hanging from the breastplate over the thighs
    for sx in (-1, 1):
        x = sx * 0.068
        verts = [V((x - 0.058, 0.095, 0.475)), V((x + 0.058, 0.095, 0.475)), V((x + sx * 0.012 + 0.052, 0.085, 0.36)),
                 V((x + sx * 0.012 - 0.052, 0.085, 0.36))]
        m.slab(verts, [(0, 1, 2, 3)], 0.016, (0, 1, 0.1), (C['steel'], 0), (C['steel_dark'], 0), (C['steel_dark'], 0))
    # pauldrons: steel caps over the shoulders
    for sx in (-1, 1):
        with m.xf(T(sx * 0.158, 0.0, 0.705) @ Ry(sx * 0.55)):
            m.lathe([(0.066, -0.035), (0.068, 0.0), (0.05, 0.04), (0.0, 0.055)], 6, (C['steel'], 0), sy=0.95)
    head(m)
    morion(m)
    px, py = 0.20, 0.135  # the pike's line
    arm(m, 1, (0.165, 0.0, 0.735), (0.222, 0.04, 0.55), (px, py, 0.64), TINT_DARK, tint=1)
    spear(m, px, py, 0.0, 2.68, r=0.011, head_len=0.13, head_w=0.018)
    sword_at_hip(m, -1)
    arm(m, -1, (-0.165, 0.0, 0.735), (-0.205, 0.0, 0.58), (-0.14, 0.04, 0.58), TINT_DARK, tint=1)  # resting on the hilt
    return m


def soldier_archer():
    """a longbowman: hood, tinted livery coat, a strung longbow as tall as he is gripped in his left fist, a quiver
    of arrows on the right hip"""
    m = Model('soldier_archer')
    legs(m)
    body(m, pattern='full')
    head(m)
    # hood: cape over the shoulders, an open front at face level, a pointed crown
    hc = C['hood']
    m.lathe([(0.185, 0.69), (0.17, 0.74), (0.09, 0.80)], 8, (hc, 0))
    m.lathe([(0.088, 0.80), (0.08, 0.93)], 6, (hc, 0), a0=PI / 2 + 0.55, a1=PI / 2 + TAU - 0.55)
    m.lathe([(0.08, 0.93), (0.05, 0.99), (0.0, 1.0)], 8, (hc, 0))
    m.tube([(0, -0.06, 0.96), (0, -0.12, 0.92), (0, -0.15, 0.82)], [0.03, 0.02, 0.0], 4, (hc, 0), cap1=False)
    # arms: the right hand rests by the quiver, the left fist holds the bow at its grip
    arm(m, 1, (0.165, 0.0, 0.735), (0.21, -0.02, 0.57), (0.20, 0.06, 0.47), TINT_DARK, tint=1)
    grip = V((-0.215, 0.115, 0.51))
    arm(m, -1, (-0.165, 0.0, 0.735), (-0.22, 0.03, 0.58), grip, TINT_DARK, tint=1)
    ang = math.radians(35)
    back = V((-math.sin(ang), math.cos(ang), 0))  # the bow's back faces forward and a little outward
    half, brace = 0.49, 0.075
    pts, radii = [], []
    for k in range(7):
        s = -1 + 2 * k / 6
        # the grip sits in the fist; the limbs bend back towards the string, which runs behind the grip
        pts.append(grip + V((0, 0, half * s)) + back * (brace * (1 - s * s) - brace))
        radii.append(0.014 - 0.007 * abs(s))
    m.tube(pts, radii, 4, (C['wood_light'], 0))
    # the string: a thin plate from nock to nock, broad side across the bow so it shows from the front and back
    side = back.cross(V((0, 0, 1))).normalized()
    a, b = pts[0] + V((0, 0, 0.012)), pts[-1] - V((0, 0, 0.012))
    w = 0.0045
    m.slab([a - side * w, a + side * w, b + side * w, b - side * w], [(0, 1, 2, 3)], 0.003, back, (C['canvas'], 0), (C['canvas'], 0),
           (C['canvas'], 0))
    # quiver on the right hip, arrows sticking out
    q0, q1 = V((0.15, -0.08, 0.34)), V((0.19, -0.13, 0.70))
    m.limb(q0, q1, 0.035, 0.04, 6, C['leather'])
    for dx, dy in ((0.0, 0.0), (0.02, -0.015), (-0.015, -0.02)):
        a = q1 + V((dx, dy, 0))
        m.limb(a, a + V((0.012, -0.02, 0.09)), 0.006, 0.006, 3, C['wood_light'], cap0=False)
        m.box((a.x - 0.012 + 0.01, a.y - 0.015, a.z + 0.05), (a.x + 0.012 + 0.01, a.y - 0.005, a.z + 0.10), C['feather'])
    return m


def soldier_musketeer():
    """a musketeer: broad-brimmed hat with a tinted plume, long tinted coat with dark cuffs, bandolier, a matchlock
    shouldered at about 35 degrees (butt in the left fist in front, barrel over the left shoulder) and a forked rest
    in the right fist"""
    m = Model('soldier_musketeer')
    legs(m, col_l=(0.40, 0.36, 0.32), col_r=(0.40, 0.36, 0.32), top=0.34)
    body(m, z0=0.25, hem=0.165, pattern='coat')
    head(m)
    z = 0.885
    m.lathe([(0.07, z + 0.015), (0.175, z - 0.004), (0.175, z + 0.008), (0.078, z + 0.026), (0.074, z + 0.10), (0.06, z + 0.13),
             (0.0, z + 0.134)], 10, lambda i, j: ((mulc(C['felt_hat'], 0.85) if i == 0 else C['felt_hat']), 0),
            deform=lambda p: V((p.x, p.y, p.z + (0.035 * max(0.0, p.x / 0.175) ** 2 if math.hypot(p.x, p.y) > 0.1 else 0.0))))
    plume = [V((0.06, -0.02, z + 0.10)), V((0.10, -0.08, z + 0.17)), V((0.16, -0.15, z + 0.15)), V((0.21, -0.20, z + 0.08))]
    verts = []
    for k, p in enumerate(plume):
        w = 0.035 * (1 - k / 4) + 0.01
        verts += [p + V((0, 0, w)), p - V((0, 0, w * 0.4))]
    polys = [(2 * k, 2 * k + 1, 2 * k + 3, 2 * k + 2) for k in range(3)]
    m.slab(verts, polys, 0.014, (1, 1, 0.5), (TINT_LIGHT, 1), (TINT, 1), (TINT, 1))
    # the musket: it rests on the left shoulder and slopes up behind him at about 35 degrees
    rest = V((-0.178, 0.0, 0.795))
    d = V((-0.08, -math.cos(math.radians(35)), math.sin(math.radians(35)))).normalized()
    butt = rest - d * 0.31
    lh = rest - d * 0.235  # the left fist round the wrist of the stock
    rx, ry = 0.195, 0.13   # the rest's line
    rh = V((rx, ry, 0.56))
    wl = arm(m, -1, (-0.165, 0.0, 0.735), (-0.215, 0.07, 0.585), lh, TINT, tint=1)
    wr = arm(m, 1, (0.165, 0.0, 0.735), (0.215, 0.03, 0.58), rh, TINT, tint=1)
    for c in (wl, wr):  # dark turned-back cuffs
        m.blob((c.x, c.y, c.z), (0.04, 0.04, 0.03), C['tar'], C['felt_hat'], C['felt_hat'], jitter=0.0, spin=0.0)
    m.tube([butt, butt + d * 0.13, butt + d * 0.36], [0.03, 0.022, 0.016], 4, (C['wood'], 0), up=(1, 0, 0), aspect=1.35)
    m.limb(butt + d * 0.32, butt + d * 0.98, 0.011, 0.010, 5, C['steel_dark'])
    # bandolier with powder flasks
    a, b = V((-0.14, 0.0, 0.78)), V((0.15, 0.0, 0.46))
    m.tube([a + V((0, 0.105, 0)), (a + b) / 2 + V((0, 0.115, 0)), b + V((0, 0.10, 0))], 0.014, 4, (C['leather'], 0), up=(0, 1, 0),
           aspect=0.4)
    m.tube([a + V((0, -0.09, 0)), (a + b) / 2 + V((0, -0.11, 0)), b + V((0, -0.09, 0))], 0.014, 4, (C['leather'], 0), up=(0, 1, 0),
           aspect=0.4)
    for k in range(4):
        p = a + (b - a) * (0.25 + k * 0.17) + V((0, 0.12, -0.03))
        m.box((p.x - 0.014, p.y - 0.012, p.z - 0.04), (p.x + 0.014, p.y + 0.012, p.z + 0.02), C['wood_dark'], bottom=True)
    # forked rest
    m.limb((rx, ry, 0.0), (rx, ry, 0.84), 0.008, 0.008, 4, C['wood_dark'], cap0=False)
    m.limb((rx, ry, 0.84), (rx - 0.03, ry, 0.90), 0.007, 0.006, 3, C['steel_dark'], cap0=False)
    m.limb((rx, ry, 0.84), (rx + 0.03, ry, 0.90), 0.007, 0.006, 3, C['steel_dark'], cap0=False)
    sword_at_hip(m, 1)
    return m


def soldier_cavalry():
    """a knight on a bay destrier walking forward (+y). The neck is arched and the head carried high, well forward
    of the rider and turned a little to his right, so that it clears his silhouette both from behind and from the
    front. A tinted caparison with a dagged hem covers the back and upper flanks but leaves the legs, the belly, the
    chest and the rump free. Saddle, bridle and breast strap are dark leather against the bay coat. The rider wears a
    tinted surcoat and a great helm with a tinted crest, holds an upright lance with a pennon and carries his shield
    on the left."""
    m = Model('soldier_cavalry')
    hc, hd, tk = C['horse'], C['horse_dark'], C['tack']
    # body barrel: (y, centre z, half width, half height), rump at -y, chest at +y
    spec = [(-0.61, 0.79, 0.06, 0.07), (-0.56, 0.79, 0.15, 0.16), (-0.42, 0.77, 0.20, 0.19), (-0.16, 0.73, 0.19, 0.18),
            (0.10, 0.74, 0.185, 0.185), (0.29, 0.78, 0.155, 0.17), (0.40, 0.83, 0.075, 0.10)]

    def at(y):
        for (y0, *a), (y1, *b) in zip(spec, spec[1:]):
            if y0 <= y <= y1:
                t = (y - y0) / (y1 - y0)
                return [a[k] + (b[k] - a[k]) * t for k in range(3)]
        return spec[0][1:] if y < spec[0][0] else spec[-1][1:]

    rings = [[V((rx * math.cos(a), y, cz + rz * math.sin(a))) for a in [PI / 8 + k * TAU / 8 for k in range(8)]] for y, cz, rx, rz in spec]
    m.loft(rings, (hc, 0), cap0=True, cap1=True)

    def leg(pts, radii):
        m.tube(pts, radii, 5, lambda i, j: ((hc if i < len(pts) - 2 else hd), 0), cap0=False, cap1=False)
        b = V(pts[-1])
        m.box((b.x - 0.036, b.y - 0.04, max(0.0, b.z - 0.05)), (b.x + 0.036, b.y + 0.05, b.z + 0.012), C['hoof'])
    for sx in (-1, 1):
        x = sx * 0.10
        if sx < 0:  # the near fore lifted in the walk
            leg([(x, 0.27, 0.68), (x, 0.34, 0.40), (x, 0.31, 0.25), (x, 0.36, 0.15)], [0.072, 0.042, 0.034, 0.031])
        else:
            leg([(x, 0.27, 0.68), (x, 0.28, 0.38), (x, 0.28, 0.16), (x, 0.29, 0.05)], [0.072, 0.042, 0.034, 0.031])
        hx = sx * 0.115
        dy = 0.04 if sx > 0 else 0.0
        leg([(hx, -0.40 + dy, 0.74), (hx, -0.31 + dy, 0.48), (hx, -0.43 + dy, 0.28), (hx, -0.40 + dy, 0.05)], [0.088, 0.058, 0.036, 0.031])
    # caparison: a cloth over the back and upper flanks, shorter at both ends, its hem cut into deep points (every
    # other ring hangs lower), a light border above the hem. It stops short of the rump and the chest.
    cap_rings = []
    ys = [-0.45, -0.35, -0.25, -0.14, -0.03, 0.08, 0.18, 0.27]
    for k, y in enumerate(ys):
        cz, rx, rz = at(y)
        R = rx + 0.022
        end = 1.0 if k in (0, len(ys) - 1) else 0.0
        hem = 0.585 + (0.0 if k % 2 == 0 else 0.085) + 0.07 * end
        z2 = hem + 0.045
        z3 = max(z2 + 0.03, cz - 0.02)
        pts = [(R + 0.012, hem), (R + 0.010, z2), (R + 0.004, z3), (R * 0.88, cz + rz * 0.62), (R * 0.48, cz + rz + 0.022),
               (0.0, cz + rz + 0.032)]
        pts = pts + [(-x, z) for x, z in reversed(pts[:-1])]
        cap_rings.append([V((x, y, z)) for x, z in pts])
    nr = len(cap_rings[0])
    m.loft(cap_rings, lambda i, j: ((C['canvas'], 0) if j in (0, nr - 2) else ((TINT, 1) if j != nr - 1 else (TINT_DARK, 1))), cap0=True, cap1=True)
    # neck: rising steeply from the withers and arched at the crest, turned to the rider's right
    m.tube([(0, 0.30, 0.86), (0.035, 0.45, 1.08), (0.10, 0.56, 1.27)], [0.125, 0.10, 0.074], 6, (hc, 0), up=(1, 0, 0), aspect=1.35,
           cap0=False, cap1=False)
    # head: poll at about z 1.36, muzzle well forward at y 0.88
    poll, muzzle = V((0.115, 0.585, 1.335)), V((0.175, 0.875, 1.065))
    hm = poll + (muzzle - poll) * 0.45 + V((0, 0.012, 0.02))
    m.tube([poll, hm, muzzle], [0.064, 0.064, 0.044], 6, lambda i, j: ((hc if i < 1 else mulc(hc, 0.84)), 0), up=(1, 0, 0), aspect=1.25)
    # steel chanfron down the face, ears, mane, forelock, tail
    m.limb(poll + (muzzle - poll) * 0.30 + V((0, 0.03, 0.045)), muzzle + V((0, 0.02, 0.03)), 0.044, 0.032, 4, C['steel'], cap0=False,
           up=(1, 0, 0))
    for sx in (-1, 1):
        e0 = poll + V((sx * 0.032, -0.01, 0.03))
        m.limb(e0, e0 + V((sx * 0.014, -0.035, 0.095)), 0.022, 0.0, 3, hc, cap0=False)
    mane = [V((0.0, 0.22, 0.95)), V((0.025, 0.36, 1.12)), V((0.07, 0.47, 1.27)), V((0.105, 0.55, 1.37))]
    verts = [p + V((0, -0.03, 0.02)) for p in mane] + [p + V((0, 0.025, -0.05)) for p in mane]
    m.slab(verts, [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6)], 0.04, (1, 0, 0), (hd, 0), (hd, 0), (hd, 0))
    m.tube([(0, -0.59, 0.86), (0, -0.67, 0.76), (0.0, -0.71, 0.54), (0.02, -0.69, 0.30)], [0.042, 0.062, 0.055, 0.0], 5, (hd, 0),
           up=(1, 0, 0), aspect=0.65)
    # tack in dark leather: saddle with a high cantle and pommel, breast strap, browband and noseband, reins
    m.box((-0.13, -0.21, 0.93), (0.13, 0.12, 0.965), tk)
    m.box((-0.11, -0.22, 0.965), (0.11, -0.18, 1.07), tk)
    m.box((-0.075, 0.09, 0.965), (0.075, 0.12, 1.03), tk)
    m.tube([(-0.17, 0.20, 0.86), (-0.12, 0.37, 0.76), (0.0, 0.42, 0.73), (0.12, 0.37, 0.76), (0.17, 0.20, 0.86)], 0.016, 4, (tk, 0),
           up=(0, 0, 1), aspect=1.6)
    hd_dir = (muzzle - poll).normalized()
    for f, r in ((0.12, 0.069), (0.78, 0.052)):
        c = poll + (muzzle - poll) * f
        with m.xf(T(c.x, c.y, c.z) @ hd_dir.to_track_quat('Z', 'X').to_matrix().to_4x4()):
            m.lathe([(r, -0.012), (r, 0.012)], 6, (tk, 0), sy=1.25, cap0=True, cap1=True)
    lh = V((-0.09, 0.20, 1.165))
    bit = poll + (muzzle - poll) * 0.82
    for sx in (-1, 1):
        m.limb(lh, bit + V((sx * 0.05, 0, -0.02)), 0.006, 0.006, 3, tk, cap0=False, cap1=False)
    # rider: legs in plate, surcoat, arms, great helm (all raised to sit in the saddle)
    with m.xf(T(0, 0, 0.09)):
        for sx in (-1, 1):
            m.tube([(sx * 0.09, -0.05, 0.92), (sx * 0.25, 0.08, 0.82), (sx * 0.265, 0.04, 0.58)], [0.052, 0.042, 0.035], 5,
                   (C['steel'], 0), cap0=False)
            m.box((sx * 0.265 - 0.03, 0.0, 0.52), (sx * 0.265 + 0.03, 0.12, 0.57), C['steel_dark'])
            m.limb((sx * 0.20, -0.02, 0.84), (sx * 0.265, 0.05, 0.55), 0.008, 0.008, 3, tk)  # stirrup leather
        with m.xf(T(0, -0.04, 0.60)):
            body(m, z0=0.28, hem=0.20, pattern='full', belt=C['leather'])
        m.tube([(0.165, -0.04, 1.33), (0.215, 0.0, 1.17), (0.225, 0.12, 1.10)], [0.05, 0.044, 0.036], 5, (C['steel'], 0))
        m.tube([(-0.165, -0.04, 1.33), (-0.21, 0.02, 1.17), (-0.10, 0.18, 1.08)], [0.05, 0.044, 0.036], 5, (C['steel'], 0))
        m.blob((0.226, 0.15, 1.10), (0.032, 0.032, 0.037), C['steel_dark'], C['steel_dark'], C['steel_dark'], jitter=0, spin=0)
        m.blob((-0.09, 0.20, 1.075), (0.03, 0.03, 0.035), C['steel_dark'], C['steel_dark'], C['steel_dark'], jitter=0, spin=0)
        with m.xf(T(0, -0.035, 0)):
            z = 1.39
            m.lathe([(0.078, z), (0.084, z + 0.06), (0.084, z + 0.075), (0.082, z + 0.10), (0.07, z + 0.135), (0.0, z + 0.15)], 8,
                    lambda i, j: ((C['opening'] if (i == 1 and j in (1, 2)) else C['steel']), 0), phase=PI / 8)
            m.lathe([(0.06, z - 0.06), (0.078, z)], 8, (C['steel_dark'], 0), phase=PI / 8)
            m.limb((0, 0.0, z + 0.14), (0, -0.04, z + 0.25), 0.03, 0.012, 4, TINT, tint=1)
        # lance with a pennon, its shaft running through the right fist
        hand = V((0.226, 0.15, 1.10))
        d = V((0, 0.16, 1)).normalized()
        butt = hand - d * 0.45
        tip = hand + d * 0.95
        m.tube([butt, hand - d * 0.04, hand + d * 0.06, tip], [0.016, 0.02, 0.016, 0.009], 5, (C['wood_light'], 0))
        with m.xf(T(hand.x, hand.y, hand.z) @ Rx(-math.atan2(d.y, d.z))):
            m.lathe([(0.018, 0.04), (0.05, 0.10), (0.018, 0.10)], 6, (C['steel'], 0))
        m.limb(tip, tip + d * 0.10, 0.012, 0.0, 4, C['steel'], cap0=False)
        t0, b0 = tip - d * 0.03, tip - d * 0.19
        back = V((0, -1, 0))
        pen = [t0, b0, t0 + back * 0.15 + V((0.015, 0, -0.012)), b0 + back * 0.15 + V((0.015, 0, -0.012)),
               t0 + back * 0.31 + V((0.0, 0, -0.035)), (t0 + b0) / 2 + back * 0.21 + V((0.01, 0, -0.025)),
               b0 + back * 0.31 + V((0.0, 0, -0.035))]
        polys = [(0, 1, 3, 2), (2, 3, 5), (2, 5, 4), (3, 6, 5)]
        m.slab(pen, polys, 0.008, (1, 0, 0), (TINT, 1), (TINT, 1), (TINT_DARK, 1))
        shield(m, (-0.27, 0.0, 1.10), (-0.92, -0.38, 0.0), 0.24, 0.32)
    return m


def cannon():
    """a bronze cannon on a split-trail field carriage with two spoked wheels; the muzzle points +y"""
    m = Model('cannon')
    wood, wdk = C['wood'], C['wood_dark']
    AX = 0.31  # axle height = wheel radius
    # barrel along +y
    prof = [(0.0, -0.46), (0.032, -0.445), (0.022, -0.41), (0.082, -0.39), (0.082, -0.34), (0.076, -0.33), (0.072, 0.06),
            (0.08, 0.065), (0.08, 0.10), (0.064, 0.11), (0.056, 0.47), (0.07, 0.50), (0.07, 0.56), (0.042, 0.56), (0.0, 0.53)]
    with m.xf(T(0, 0.0, 0.47) @ Rx(-PI / 2)):
        m.lathe(prof, 8, lambda i, j: ((C['opening'] if i == 13 else (mulc(C['bronze'], 1.07) if i in (3, 7, 11) else C['bronze'])), 0))
    m.limb((-0.128, 0.0, 0.47), (0.128, 0.0, 0.47), 0.025, 0.025, 6, mulc(C['bronze'], 0.9), up=(0, 0, 1))  # trunnions
    # carriage cheeks (split trail)
    side = [(0.14, 0.33), (0.14, 0.48), (0.02, 0.50), (-0.30, 0.38), (-0.86, 0.10), (-0.92, 0.0), (-0.80, 0.0), (-0.30, 0.22),
            (0.0, 0.30)]
    for sx in (-1, 1):
        x0 = sx * 0.075
        m.prism([(x0, y, z) for y, z in side], (sx * 0.045, 0, 0), (wood, 0))
    m.box((-0.075, 0.06, 0.32), (0.075, 0.13, 0.40), wdk)
    m.box((-0.075, -0.55, 0.16), (0.075, -0.47, 0.22), wdk)
    m.box((-0.22, -0.035, AX - 0.035), (0.22, 0.035, AX + 0.035), wdk)
    # wheels
    for sx in (-1, 1):
        with m.xf(T(sx * 0.21, 0.0, AX)):
            n = 10
            ro, ri, hw = 0.31, 0.265, 0.025
            pts, F = [], []
            for k in range(n):
                a = TAU * k / n + PI / n
                ca, sa = math.cos(a), math.sin(a)
                for (r, x) in ((ro, -hw), (ro, hw), (ri, hw), (ri, -hw)):
                    pts.append(V((x, r * ca, r * sa)))
            for k in range(n):
                a0, b0 = 4 * k, 4 * ((k + 1) % n)
                for s in range(4):
                    F.append((a0 + s, a0 + (s + 1) % 4, b0 + (s + 1) % 4, b0 + s))
            fs = m.mesh(pts, F, lambda i: ((C['steel_dark'] if i % 4 == 0 else wood), 0))
            m.fix_closed(fs)
            with m.xf(Ry(PI / 2)):
                m.lathe([(0.0, -0.065), (0.06, 0.0), (0.0, 0.065)], 6, (wdk, 0))
            for k in range(6):
                a = TAU * k / 6
                m.limb((0, 0.05 * math.cos(a), 0.05 * math.sin(a)), (0, 0.27 * math.cos(a), 0.27 * math.sin(a)), 0.013, 0.011, 3, wood,
                       cap0=False, cap1=False, up=(1, 0, 0))
    return m


def banner_standard():
    """a war standard: tall pole with a gilt finial and crossbar, a large tinted swallow-tailed banner with a
    light border, tassels"""
    m = Model('banner_standard')
    m.limb((0, 0, 0), (0, 0, 2.0), 0.022, 0.017, 6, C['wood_dark'])
    m.lathe([(0.0, 1.98), (0.03, 2.03), (0.018, 2.07), (0.0, 2.18)], 6, (C['gold'], 0))
    m.limb((-0.03, 0, 1.90), (0.64, 0, 1.90), 0.012, 0.012, 4, C['wood_dark'], up=(0, 0, 1))
    for x in (-0.03, 0.64):
        m.blob((x, 0, 1.90), (0.022, 0.022, 0.022), C['gold'], C['gold'], C['gold'], jitter=0.0, spin=0.0)
    cols, rows = 4, 3
    x0, x1, ztop = 0.02, 0.60, 1.885
    bottom = [1.05, 1.11, 1.24, 1.11, 1.05]
    verts = []
    for r in range(rows + 1):
        for c in range(cols + 1):
            u = c / cols
            zb = bottom[c]
            z = ztop + (zb - ztop) * (r / rows)
            y = 0.035 * math.sin(u * PI * 2.0 + r * 0.4) * (0.4 + 0.6 * (r / rows))
            verts.append(V((x0 + (x1 - x0) * u, y, z)))
    polys = [(r * (cols + 1) + c, r * (cols + 1) + c + 1, (r + 1) * (cols + 1) + c + 1, (r + 1) * (cols + 1) + c)
             for r in range(rows) for c in range(cols)]
    m.slab(verts, polys, 0.014, (0, -1, 0), (TINT, 1), (TINT, 1), (TINT_DARK, 1))
    # a gilt fringe along the swallow-tailed foot
    foot = verts[rows * (cols + 1):]
    fv = [p + V((0, 0, 0.004)) for p in foot] + [p + V((0, 0, -0.045)) for p in foot]
    k = len(foot)
    m.slab(fv, [(i, i + 1, k + i + 1, k + i) for i in range(k - 1)], 0.02, (0, -1, 0), (C['gold'], 0), (C['gold'], 0), (C['gold'], 0))
    # a gilt hem at the top, where the banner wraps the crossbar
    m.limb((0.02, 0, 1.875), (0.60, 0, 1.875), 0.018, 0.018, 4, C['gold'], up=(0, 0, 1))
    for x in (0.0, 0.62):
        m.limb((x, 0, 1.89), (x, 0.0, 1.72), 0.006, 0.006, 3, C['gold'], cap0=False)
        m.limb((x, 0, 1.74), (x, 0.0, 1.66), 0.018, 0.0, 4, C['gold'])
    return m


# ----------------------------------------------------------------------------------------------------------------
# ships (bow +y, waterline z = 0)
# ----------------------------------------------------------------------------------------------------------------
def hull(m, stations, sides, paint_side, deck_drop=0.06, wall=0.03, transom=False, deck=C['deck'], rail=C['rail'],
         inner=None):
    """loft a hull through stations (y, half-beam b, keel depth d, gunwale height h, tumblehome tb) from stern
    to bow; b = 0 makes a post. 'sides' are the heights (fractions of h) of the side's strakes above the
    waterline; paint_side(seg) colours the outer strakes (seg 0 = keel ... )."""
    inner = inner or mulc(C['hull'], 1.15)
    rings = []
    for (y, b, d, h, tb) in stations:
        side = [(0.48 * b, -0.92 * d), (0.86 * b, -0.52 * d), (b, 0.0)]
        for f in sides:
            k = f ** 1.5
            side.append((b * (1 - (1 - tb) * k), h * f))
        xg = side[-1][0]
        xi = max(0.0, xg - wall)
        right = side + [(xi, h), (xi, h - deck_drop)]
        ring = [V((0.0, y, -d))] + [V((x, y, z)) for x, z in right] + [V((-x, y, z)) for x, z in reversed(right)]
        rings.append(ring)
    nside = 3 + len(sides)  # outer segments on one side (keel -> gunwale)
    npts = len(rings[0])

    def paint(i, j):
        if i < 0 or i >= len(stations) - 1:
            return (mulc(C['hull'], 0.9), 0)
        # segments: 0..nside-1 right outer, nside: rail top, nside+1: inner, nside+2: deck, then mirrored
        if j < nside:
            return paint_side(j)
        if j == nside:
            return (rail, 0)
        if j == nside + 1:
            return (inner, 0)
        if j == nside + 2:
            return (deck, 0)
        if j == nside + 3:
            return (inner, 0)
        if j == nside + 4:
            return (rail, 0)
        return paint_side(npts - 1 - j)
    return m.loft(rings, paint, cap0=transom, cap1=False)


def ship_cog():
    """a Hanseatic cog: round high-sided clinker hull, straight stem and sternpost, a crenellated aftcastle and a
    triangular forecastle, one mast with a fighting top and a big tinted square sail"""
    m = Model('ship_cog')
    st = [(-1.20, 0.0, 0.18, 0.62, 1.0), (-1.06, 0.24, 0.22, 0.58, 0.95), (-0.70, 0.37, 0.24, 0.50, 0.93), (-0.20, 0.41, 0.25, 0.46, 0.92),
          (0.35, 0.40, 0.25, 0.47, 0.92), (0.80, 0.31, 0.23, 0.53, 0.94), (1.08, 0.16, 0.20, 0.60, 1.0), (1.22, 0.0, 0.16, 0.66, 1.0)]

    def ps(j):
        if j < 3:
            return (C['hull_wet'], 0)
        return (C['hull'] if j % 2 else C['hull2'], 0)
    hull(m, st, [0.25, 0.5, 0.75, 1.0], ps)
    # stem and sternpost
    m.tube([(0, 1.18, -0.10), (0, 1.25, 0.30), (0, 1.27, 0.74)], 0.025, 4, (C['hull2'], 0), up=(1, 0, 0))
    m.tube([(0, -1.17, -0.12), (0, -1.21, 0.30), (0, -1.22, 0.68)], 0.025, 4, (C['hull2'], 0), up=(1, 0, 0))
    m.box((-0.015, -1.32, -0.16), (0.015, -1.20, 0.42), C['wood_dark'], bottom=True)
    # aftcastle
    m.box((-0.33, -1.05, 0.38), (0.33, -0.52, 0.80), C['hull2'], bottom=True)
    m.box((-0.33, -1.05, 0.80), (0.33, -0.52, 0.82), C['deck'])
    for (a, b, nm) in (((-0.31, -0.535), (0.31, -0.535), 4), ((-0.31, -1.035), (0.31, -1.035), 4), ((-0.315, -1.0), (-0.315, -0.58), 3),
                       ((0.315, -1.0), (0.315, -0.58), 3)):
        m.merlons(a, b, 0.82, nm, C['hull2'], h=0.10, w=0.09, d=0.03)
    for sx in (-1, 1):
        o, u, v, n = V((sx * 0.33, -1.05 if sx > 0 else -0.52, 0.38)), V((0, sx, 0)), V((0, 0, 1)), V((sx, 0, 0))
        for k in range(3):
            c = 0.09 + k * 0.17
            m.decal_poly(o, u, v, n, [(c + a * 0.6, 0.30 + b * 0.75) for a, b in [(0.0, 0.2), (0.12, 0.2), (0.12, 0.08), (0.06, 0.0), (0.0, 0.08)]],
                         TINT, tint=1, eps=0.008)
    o, u, v, n = V((-0.33, -0.52, 0.38)), V((1, 0, 0)), V((0, 0, 1)), V((0, 1, 0))
    m.decal(o, u, v, n, (0.26, 0.0, 0.40, 0.24), C['opening'])
    # forecastle
    plan = [(-0.24, 0.66), (0.24, 0.66), (0.0, 1.26)]
    m.prism([(x, y, 0.58) for x, y in plan], (0, 0, 0.16), lambda i: ((C['hull2'] if i != 1 else C['deck']), 0))
    m.merlons((-0.22, 0.70), (0.0, 1.20), 0.74, 3, C['hull2'], h=0.08, w=0.08, d=0.03)
    m.merlons((0.22, 0.70), (0.0, 1.20), 0.74, 3, C['hull2'], h=0.08, w=0.08, d=0.03)
    for sx in (-1, 1):
        m.limb((sx * 0.20, 0.70, 0.40), (sx * 0.20, 0.70, 0.58), 0.018, 0.018, 4, C['wood_dark'], cap0=False, cap1=False)
    # mast, top, yard, sail
    MY = 0.0
    m.limb((0, MY, 0.30), (0, MY, 2.40), 0.035, 0.022, 6, C['wood'])
    with m.xf(T(0, MY, 0)):
        m.lathe([(0.04, 1.96), (0.10, 2.02), (0.11, 2.12), (0.10, 2.12), (0.0, 2.10)], 6, lambda i, j: ((C['wood'] if i < 2 else C['wood_dark']), 0))
    yard_sail(m, MY, 0.66, 1.84, 0.70, 0.72, 0.28, brace=0.22, nu=4, nv=3, yard_r=0.016)
    # bowsprit and rigging
    m.limb((0, 1.05, 0.58), (0, 1.62, 0.90), 0.025, 0.014, 4, C['wood'])
    rope(m, (0, MY, 2.35), (0, 1.60, 0.89))
    rope(m, (0, MY, 2.35), (0, -1.10, 0.84))
    for sx in (-1, 1):
        for yy in (-0.12, 0.14):
            rope(m, (0, MY, 2.0), (sx * 0.39, yy, 0.47))
    m.limb((0, MY, 2.40), (0, MY, 2.55), 0.01, 0.008, 4, C['wood_dark'])
    pennant(m, (0, MY, 2.50), 0.42, 0.10, direction=(0, 1, -0.05))
    return m


def ship_galley():
    """a Mediterranean war galley: long low hull with a spur, outrigger with nine oars a side, pavises, a striped
    stern awning, a forward-raked mast with a tinted lateen sail"""
    m = Model('ship_galley')
    st = [(-1.30, 0.0, 0.10, 0.34, 1.0), (-1.14, 0.11, 0.12, 0.26, 1.0), (-0.80, 0.19, 0.13, 0.20, 1.0), (-0.20, 0.215, 0.14, 0.18, 1.0),
          (0.50, 0.205, 0.14, 0.18, 1.0), (0.95, 0.13, 0.12, 0.20, 1.0), (1.20, 0.0, 0.08, 0.25, 1.0)]

    def ps(j):
        if j < 3:
            return (C['hull_wet'], 0)
        return ((C['ornament'] if j == 4 else C['hull']), 0)
    hull(m, st, [0.45, 0.75, 1.0], ps, deck_drop=0.04, wall=0.02)
    # spur and stern post
    with m.xf(T(0, 1.12, 0.16) @ Rx(-PI / 2 + 0.12)):
        m.lathe([(0.0, -0.02), (0.045, 0.0), (0.0, 0.50)], 4, (C['hull2'], 0), phase=PI / 4)
    m.tube([(0, -1.27, 0.30), (0, -1.38, 0.46), (0, -1.36, 0.60)], [0.03, 0.025, 0.02], 4, (C['hull2'], 0), up=(1, 0, 0))
    m.blob((0, -1.36, 0.65), (0.04, 0.04, 0.05), C['gold'], C['lamp'], C['lamp'], jitter=0.0, spin=0.0)
    # outrigger frame and gangway
    for sx in (-1, 1):
        m.box((sx * 0.20 if sx > 0 else -0.34, -0.85, 0.17), (0.34 if sx > 0 else -0.20, 0.80, 0.21), C['wood'], bottom=True)
    for yy in (-0.85, 0.80):  # cross beams, a little lower than the side rails so their faces do not coincide
        m.box((-0.335, yy - 0.02, 0.165), (0.335, yy + 0.02, 0.205), C['wood'], bottom=True)
    m.box((-0.05, -0.90, 0.18), (0.05, 0.95, 0.23), C['deck'])
    # oars
    for sx in (-1, 1):
        for k in range(9):
            y = -0.70 + k * 0.175
            a = V((sx * 0.33, y, 0.22))
            b = V((sx * 0.88, y - 0.10, -0.02))
            m.limb(a - (b - a) * 0.12, b, 0.009, 0.008, 3, C['wood_light'], cap0=False, cap1=False)
            d = (b - a).normalized()
            m.poly([b - d * 0.14 + V((0, 0.025, 0)), b + d * 0.02 + V((0, 0.025, 0)), b + d * 0.02 - V((0, 0.025, 0)),
                    b - d * 0.14 - V((0, 0.025, 0))], C['wood_light'], hint=(0, 0, 1))
        # pavises along the outrigger rail
        for k in range(6):
            y = -0.62 + k * 0.26
            o = V((sx * 0.345, y, 0.21))
            m.poly([o + V((0, -0.06, 0)), o + V((0, 0.06, 0)), o + V((0, 0.06, 0.11)), o + V((0, 0.0, 0.14)), o + V((0, -0.06, 0.11))],
                   TINT, tint=1, hint=(sx, 0, 0.2))
    # stern awning (striped, tinted)
    verts = []
    ring = 5
    for r, y in enumerate((-1.12, -0.92, -0.70)):
        for k in range(ring):
            a = PI * k / (ring - 1)
            verts.append(V((0.20 * math.cos(a), y, 0.30 + 0.20 * math.sin(a) * (0.85 if r == 0 else 1.0))))
    polys = [(r * ring + k, r * ring + k + 1, (r + 1) * ring + k + 1, (r + 1) * ring + k) for r in range(2) for k in range(ring - 1)]
    m.slab(verts, polys, 0.012, (0, 0, 1), lambda i: ((TINT if i % 2 == 0 else C['canvas']), 1 if i % 2 == 0 else 0),
           (mulc(C['canvas'], 0.7), 0), (C['wood_dark'], 0))
    for y in (-1.12, -0.70):
        for sx in (-1, 1):
            m.limb((sx * 0.19, y, 0.18), (sx * 0.19, y, 0.31), 0.01, 0.01, 3, C['wood_dark'], cap0=False, cap1=False)
    # mast, lateen yard and sail
    mb, mt = V((0, 0.45, 0.18)), V((0, 0.52, 1.50))
    m.limb(mb, mt, 0.03, 0.02, 5, C['wood'])
    swing = T(0, 0.48, 0) @ Rz(-0.42) @ T(0, -0.48, 0)
    tack, peak = V((0.03, 1.22, 0.92)), V((0.03, -0.92, 2.36))
    clew = V((0.03, -0.32, 0.44))
    with m.xf(swing):
        m.tube([tack, peak], [0.018, 0.012], 4, (C['wood_dark'], 0))

        def bump(wa, wb, wc):
            return (0.18 * 27 * wa * wb * wc * 0.9, 0, 0)
        a, b = tack + V((0.02, -0.03, -0.02)), peak + V((0.02, 0.03, -0.02))
        verts, polys = tri_grid(a, b, clew, 3, bump)
        m.slab(verts, polys, 0.012, (1, 0, 0), lambda i: ((TINT if i % 2 == 0 else mulc(TINT, 0.92)), 1), (mulc(TINT, 0.86), 1),
               (mulc(TINT, 0.8), 1))
    tack = swing @ tack
    peak = swing @ peak
    rope(m, tack, (0, 1.18, 0.26))
    rope(m, mt, (0, -1.2, 0.34))
    for sx in (-1, 1):
        rope(m, mt, (sx * 0.30, 0.40, 0.20))
    pennant(m, peak + V((0, -0.02, 0.02)), 0.30, 0.08, direction=(0.2, 1.0, 0.1))
    return m


def ship_carrack():
    """a carrack: deep round hull, high overhanging forecastle, two-deck sterncastle with a tinted strake and
    stern windows, three masts (square fore and main courses, main topsail, lateen mizzen), spritsail"""
    m = Model('ship_carrack')
    st = [(-1.20, 0.27, 0.22, 0.80, 0.84), (-1.00, 0.38, 0.26, 0.70, 0.84), (-0.60, 0.44, 0.29, 0.58, 0.85), (-0.10, 0.46, 0.30, 0.52, 0.86),
          (0.40, 0.44, 0.29, 0.54, 0.87), (0.85, 0.34, 0.26, 0.62, 0.90), (1.12, 0.17, 0.22, 0.72, 0.95), (1.26, 0.0, 0.16, 0.80, 1.0)]

    def ps(j):
        if j < 3:
            return (C['hull_wet'], 0)
        if j == 5:
            return (TINT, 1)
        return (C['hull'] if j % 2 else C['hull2'], 0)
    hull(m, st, [0.3, 0.55, 0.7, 1.0], ps, transom=True)
    m.tube([(0, 1.20, -0.10), (0, 1.29, 0.40), (0, 1.30, 0.86)], 0.026, 4, (C['hull2'], 0), up=(1, 0, 0))
    m.box((-0.015, -1.30, -0.18), (0.015, -1.19, 0.70), C['wood_dark'], bottom=True)
    # sterncastle: two decks
    plan = [(-0.30, -1.17), (0.30, -1.17), (0.40, -0.80), (0.40, -0.45), (-0.40, -0.45), (-0.40, -0.80)]
    m.prism([(x, y, 0.50) for x, y in plan], (0, 0, 0.44), lambda i: ((C['deck'] if i == 1 else (C['hull2'] if i % 2 else C['hull'])), 0))
    plan2 = [(-0.28, -1.21), (0.28, -1.21), (0.36, -0.95), (0.36, -0.76), (-0.36, -0.76), (-0.36, -0.95)]
    m.prism([(x, y, 0.94) for x, y in plan2], (0, 0, 0.20), lambda i: ((C['deck'] if i == 1 else C['hull']), 0))
    for sx in (-1, 1):
        o, u, v, n = V((sx * 0.40, -0.80 if sx > 0 else -0.45, 0.50)), V((0, sx, 0)), V((0, 0, 1)), V((sx, 0, 0))
        m.decal(o, u, v, n, (0.0, 0.28, 0.35, 0.34), TINT, tint=1)
        for k in range(3):
            m.decal(o, u, v, n, (0.05 + k * 0.11, 0.12, 0.10 + k * 0.11, 0.20), C['opening'])
    o, u, v, n = V((0.30, -1.17, 0.50)), V((-1, 0, 0)), V((0, 0, 1)), V((0, -1, 0))
    for k in range(3):
        m.decal(o, u, v, n, (0.10 + k * 0.15, 0.26, 0.17 + k * 0.15, 0.36), C['lamp'])
    m.decal(o, u, v, n, (0.0, 0.40, 0.60, 0.44), TINT, tint=1)
    # forecastle overhanging the bow
    plan = [(-0.32, 0.66), (0.32, 0.66), (0.24, 1.18), (0.0, 1.44), (-0.24, 1.18)]
    m.prism([(x, y, 0.64) for x, y in plan], (0, 0, 0.30), lambda i: ((C['deck'] if i == 1 else (C['hull2'] if i % 2 else C['hull'])), 0))
    for sx in (-1, 1):
        a, b = V((sx * 0.32, 0.66, 0.64)), V((sx * 0.24, 1.18, 0.64))
        d = (b - a).normalized()
        nn = V((sx * d.y, -sx * d.x, 0))
        if nn.x * sx < 0:
            nn = -nn
        m.decal(a, d, V((0, 0, 1)), nn, (0.0, 0.18, (b - a).length, 0.24), TINT, tint=1)
    # masts
    masts = {'fore': (0.82, 2.05), 'main': (0.06, 2.62), 'mizzen': (-0.72, 1.86)}
    for k, (y, h) in masts.items():
        m.limb((0, y, 0.40), (0, y, h), 0.036 if k == 'main' else 0.028, 0.018, 6, C['wood'])
    with m.xf(T(0, 0.06, 0)):
        m.lathe([(0.04, 1.90), (0.11, 1.96), (0.12, 2.06), (0.11, 2.06), (0.0, 2.04)], 6, lambda i, j: ((C['wood'] if i < 2 else C['wood_dark']), 0))
    # yards and sails
    for (y, zt, hw, zb, hb, bulge) in ((0.82, 1.72, 0.50, 1.00, 0.54, 0.18), (0.06, 1.86, 0.72, 0.88, 0.76, 0.24),
                                       (0.06, 2.46, 0.36, 2.10, 0.42, 0.11)):
        yard_sail(m, y, hw, zt, hb, zb, bulge, brace=0.18)
    with m.xf(T(0, -0.72, 0) @ Rz(-0.45) @ T(0, 0.72, 0)):
        tack, peak = V((0.02, -0.40, 1.02)), V((0.02, -1.14, 1.98))
        m.tube([tack, peak], [0.014, 0.01], 4, (C['wood_dark'], 0))
        verts, polys = tri_grid(tack + V((0.015, 0, -0.02)), peak + V((0.015, 0, -0.02)), V((0.02, -1.12, 0.98)), 2,
                                lambda wa, wb, wc: (0.12 * 27 * wa * wb * wc * 0.6, 0, 0))
        m.slab(verts, polys, 0.012, (1, 0, 0), (TINT, 1), (mulc(TINT, 0.86), 1), (mulc(TINT, 0.8), 1))
    # bowsprit and spritsail
    m.limb((0, 1.10, 0.80), (0, 1.86, 1.16), 0.028, 0.014, 5, C['wood'])
    m.limb((-0.26, 1.70, 1.04), (0.26, 1.70, 1.04), 0.011, 0.011, 4, C['wood_dark'])
    square_sail(m, 1.72, 0.24, 0.26, 1.03, 0.74, 0.09, nu=2, nv=1)
    # rigging
    rope(m, (0, 0.06, 2.55), (0, 0.82, 2.0))
    rope(m, (0, 0.82, 2.0), (0, 1.84, 1.15))
    rope(m, (0, 0.06, 2.40), (0, -0.72, 1.82))
    for sx in (-1, 1):
        for (my, mz, yy) in ((0.06, 1.92, -0.10), (0.06, 1.92, 0.20), (0.82, 1.66, 0.74), (-0.72, 1.60, -0.80)):
            rope(m, (0, my, mz), (sx * 0.43, yy, 0.56))
    m.limb((0, 0.06, 2.62), (0, 0.06, 2.74), 0.01, 0.008, 4, C['wood_dark'])
    pennant(m, (0, 0.06, 2.70), 0.55, 0.10, direction=(0, 1, -0.06))
    pennant(m, (0, 0.82, 2.0), 0.28, 0.07, direction=(0, 1, -0.06))
    pennant(m, (0, -0.72, 1.84), 0.25, 0.07, direction=(0, 1, -0.06))
    return m


def ship_ship_of_the_line():
    """a two-decker ship of the line (18th century): black hull with ochre gun-deck bands and port lids,
    copper sheathing, stern galleries, beakhead with a gilt figurehead, three masts with courses, topsails and
    topgallants, jibs, a spanker and a large tinted ensign"""
    m = Model('ship_ship_of_the_line')
    st = [(-1.34, 0.36, 0.28, 0.80, 0.80), (-1.15, 0.45, 0.32, 0.75, 0.80), (-0.70, 0.51, 0.35, 0.70, 0.80), (-0.10, 0.53, 0.36, 0.68, 0.80),
          (0.50, 0.51, 0.35, 0.68, 0.81), (0.95, 0.41, 0.32, 0.70, 0.84), (1.22, 0.22, 0.27, 0.73, 0.90), (1.36, 0.0, 0.20, 0.76, 1.0)]
    bands = [0.12, 0.26, 0.40, 0.56, 0.70, 1.0]  # fractions of h for strake lines

    def ps(j):
        if j < 3:
            return (C['copper'], 0)
        k = j - 3  # 0: wl..0.12h, 1: ..0.26 (ochre), 2: ..0.40, 3: ..0.56 (ochre), 4: ..0.70, 5: ..h
        return ((C['ochre'] if k in (1, 3) else C['tar']), 0)
    hull(m, st, bands, ps, transom=True, wall=0.035, deck_drop=0.07, rail=C['tar'], inner=C['ochre'])
    # gun ports on the ochre bands (approximately on the hull surface)
    def side_x(y, z):
        # interpolate the half-beam at (y, z) from the stations
        for i in range(len(st) - 1):
            y0, y1 = st[i][0], st[i + 1][0]
            if y0 <= y <= y1:
                t = (y - y0) / (y1 - y0)
                b = st[i][1] * (1 - t) + st[i + 1][1] * t
                h = st[i][3] * (1 - t) + st[i + 1][3] * t
                tb = st[i][4] * (1 - t) + st[i + 1][4] * t
                f = max(0.0, min(1.0, z / h))
                return b * (1 - (1 - tb) * f ** 1.5)
        return 0.0
    for sx in (-1, 1):
        for (z0, z1, ys) in ((0.24, 0.31, [-0.95 + k * 0.24 for k in range(9)]), (0.42, 0.49, [-1.0 + k * 0.25 for k in range(9)])):
            for y in ys:
                pts = []
                for (yy, zz) in ((y - 0.035, z0), (y + 0.035, z0), (y + 0.035, z1), (y - 0.035, z1)):
                    pts.append(V((sx * (side_x(yy, zz) + 0.009), yy, zz)))
                m.poly(pts, C['tar'], hint=(sx, 0, 0), jit=0)
    # stern: galleries and windows, quarter galleries
    for row, z in enumerate((0.48, 0.64)):
        for k in range(5):
            x = -0.26 + k * 0.13
            m.poly([(x - 0.04, -1.345, z), (x + 0.04, -1.345, z), (x + 0.04, -1.345, z + 0.09), (x - 0.04, -1.345, z + 0.09)], C['lamp'],
                   hint=(0, -1, 0), jit=0)
        m.box((-0.33, -1.39, z - 0.02), (0.33, -1.34, z), C['ochre'], bottom=True)
    for sx in (-1, 1):
        m.box((sx * 0.33 if sx > 0 else -0.46, -1.25, 0.40), (0.46 if sx > 0 else -0.33, -1.05, 0.72), C['tar'], bottom=True)
        m.poly([(sx * 0.461, -1.22, 0.50), (sx * 0.461, -1.08, 0.50), (sx * 0.461, -1.08, 0.62), (sx * 0.461, -1.22, 0.62)], C['lamp'],
               hint=(sx, 0, 0), jit=0)
    # quarterdeck and forecastle decks
    m.box((-0.40, -1.30, 0.66), (0.40, -0.45, 0.74), C['deck'])
    m.box((-0.34, 0.75, 0.66), (0.34, 1.15, 0.73), C['deck'])
    # beakhead and figurehead
    m.prism([(-0.14, 1.30, 0.40), (0.14, 1.30, 0.40), (0.0, 1.62, 0.52)], (0, 0, 0.10), (C['tar'], 0))
    m.blob((0, 1.58, 0.56), (0.035, 0.05, 0.07), C['gold'], C['gold'], C['gold'], jitter=0.1)
    # masts: lower mast + topmast
    for (y, h0, h1, r) in ((0.85, 1.70, 2.45, 0.032), (0.05, 1.95, 2.95, 0.038), (-0.80, 1.55, 2.15, 0.026)):
        m.limb((0, y, 0.50), (0, y, h0 + 0.08), r, r * 0.8, 6, C['wood'])
        m.limb((0, y, h0 - 0.10), (0, y, h1), r * 0.65, r * 0.4, 5, C['wood'])
        m.box((-0.12, y - 0.07, h0 - 0.02), (0.12, y + 0.07, h0 + 0.02), C['wood_dark'], bottom=True)
    # yards and square sails: (mast y, top, half width top, foot, half width foot, bulge)
    sails = [(0.85, 1.62, 0.56, 1.00, 0.60, 0.16), (0.85, 2.12, 0.40, 1.70, 0.50, 0.12), (0.85, 2.40, 0.25, 2.16, 0.36, 0.07),
             (0.05, 1.86, 0.70, 1.02, 0.74, 0.20), (0.05, 2.46, 0.50, 1.96, 0.62, 0.14), (0.05, 2.86, 0.32, 2.52, 0.44, 0.08),
             (-0.80, 1.98, 0.32, 1.60, 0.40, 0.09)]
    for (y, zt, hw, zb, hb, bulge) in sails:
        yard_sail(m, y, hw, zt, hb, zb, bulge * 1.15, brace=0.2, yard_r=0.012)
    # spanker (gaff sail) on the mizzen, swung out
    with m.xf(T(0, -0.80, 0) @ Rz(-0.40) @ T(0, 0.80, 0)):
        gaff0, gaff1 = V((0.02, -0.82, 1.50)), V((0.02, -1.30, 1.66))
        m.limb(gaff0, gaff1, 0.01, 0.01, 4, C['wood_dark'])
        m.limb(V((0.02, -0.82, 0.86)), V((0.02, -1.42, 0.86)), 0.01, 0.01, 4, C['wood_dark'])
        verts, polys = quad_grid(gaff0 + V((0.01, -0.03, -0.02)), gaff1 + V((0.01, 0, -0.02)), V((0.03, -0.85, 0.88)), V((0.03, -1.40, 0.88)),
                                 2, 2, lambda u, v: (0.08 * math.sin(PI * u) * math.sin(PI * v), 0, 0))
        m.slab(verts, polys, 0.01, (1, 0, 0), (TINT, 1), (mulc(TINT, 0.86), 1), (mulc(TINT, 0.8), 1))
    # bowsprit, jib-boom and jibs
    m.limb((0, 1.18, 0.66), (0, 2.02, 1.12), 0.035, 0.015, 5, C['wood'])
    # (the staysail is sheeted a little to the side so that it does not share a plane with the jib)
    for (top, foot_a, foot_b) in (((0, 0.88, 2.30), (0, 1.40, 0.82), (0, 1.98, 1.10)), ((0.05, 0.88, 1.85), (0.05, 1.25, 0.76), (0.05, 1.62, 0.92))):
        verts, polys = tri_grid(V(foot_a), V(foot_b), V(top), 2, lambda wa, wb, wc: (0.05 * 27 * wa * wb * wc * 0.5, 0, 0))
        m.slab(verts, polys, 0.01, (1, 0, 0), (TINT_LIGHT, 1), (mulc(TINT, 0.86), 1), (mulc(TINT, 0.8), 1))
        rope(m, top, foot_b)
    # rigging
    rope(m, (0, 0.05, 2.90), (0, 0.85, 2.40))
    rope(m, (0, 0.05, 2.80), (0, -0.80, 2.10))
    for sx in (-1, 1):
        for (my, mz, yy) in ((0.05, 1.92, -0.15), (0.05, 1.92, 0.25), (0.85, 1.68, 0.75), (-0.80, 1.52, -0.90)):
            rope(m, (0, my, mz), (sx * 0.47, yy, 0.66))
    # ensign at the stern and pennants
    m.limb((0, -1.40, 0.70), (0, -1.48, 1.40), 0.012, 0.009, 4, C['wood_dark'])
    verts, polys = quad_grid((0, -1.475, 1.37), (0, -1.84, 1.32), (0, -1.475, 1.09), (0, -1.84, 1.06), 4, 2,
                             lambda u, v: (0.045 * math.sin(u * PI * 1.6) * (0.3 + u), 0, 0))
    m.slab(verts, polys, 0.012, (1, 0, 0), (TINT, 1), (TINT, 1), (TINT_DARK, 1))
    for (y, h) in ((0.85, 2.45), (0.05, 2.95), (-0.80, 2.15)):
        pennant(m, (0, y, h - 0.04), 0.40 if y == 0.05 else 0.26, 0.07, direction=(0, 1, -0.05))
    return m


BUILDERS = [tree_conifer_a, tree_conifer_b, tree_broadleaf_a, tree_broadleaf_b, tree_palm, bush,
            house_timber, house_stone, house_mediterranean, house_steppe_yurt,
            farm_barn, windmill, church_gothic, mosque, castle, town_wall_tower, tent,
            soldier_infantry, soldier_pikeman, soldier_archer, soldier_musketeer, soldier_cavalry, cannon, banner_standard,
            ship_cog, ship_galley, ship_carrack, ship_ship_of_the_line]
NAMES = [b.__name__ for b in BUILDERS]


# ----------------------------------------------------------------------------------------------------------------
# export
# ----------------------------------------------------------------------------------------------------------------
def pack(name, tris):
    """dedupe vertices within a face (same position, normal, colour, tint) and return float/index lists"""
    index, verts, idx = {}, [], []
    for (p, n, c, t) in tris:
        for q in p:
            key = (round(q.x, 5), round(q.y, 5), round(q.z, 5), round(n.x, 4), round(n.y, 4), round(n.z, 4), round(c[0], 4),
                   round(c[1], 4), round(c[2], 4), t)
            k = index.get(key)
            if k is None:
                k = len(verts)
                index[key] = k
                verts.append((q.x, q.y, q.z, n.x, n.y, n.z, c[0], c[1], c[2], float(t)))
            idx.append(k)
    return verts, idx


def export(results, out):
    os.makedirs(out, exist_ok=True)
    meshes, allv, alli = {}, [], []
    for name, (verts, idx) in results.items():
        h = max(v[2] for v in verts)
        r = max(math.hypot(v[0], v[1]) for v in verts)
        meshes[name] = dict(vertexOffset=len(allv), vertexCount=len(verts), indexOffset=len(alli), indexCount=len(idx),
                            height=round(h, 4), radius=round(r, 4))
        allv.extend(verts)
        alli.extend(idx)
    with open(os.path.join(out, 'models.bin'), 'wb') as f:
        f.write(struct.pack('<%df' % (len(allv) * 10), *[x for v in allv for x in v]))
        f.write(struct.pack('<%dI' % len(alli), *alli))
    meta = dict(version=1, stride=40, totalVertices=len(allv), totalIndices=len(alli), meshes=meshes)
    with open(os.path.join(out, 'models.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    return meta


def to_blend(name, tris, x):
    """an object per model (for inspection with --blend)"""
    me = bpy.data.meshes.new(name)
    vs, fs = [], []
    for (p, n, c, t) in tris:
        fs.append((len(vs), len(vs) + 1, len(vs) + 2))
        vs.extend((q.x + x, q.y, q.z) for q in p)
    me.from_pydata(vs, [], fs)
    attr = me.color_attributes.new('col', 'FLOAT_COLOR', 'CORNER')
    tint = me.attributes.new('tint', 'FLOAT', 'FACE')
    for i, (p, n, c, t) in enumerate(tris):
        for k in range(3):
            attr.data[i * 3 + k].color = (c[0], c[1], c[2], 1.0)
        tint.data[i].value = t
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(ROOT, 'public', 'models'))
    ap.add_argument('--blend', default=None)
    ap.add_argument('--only', default=None, help='build only these (comma separated); the export then holds only them')
    a = ap.parse_args(argv)
    only = set(a.only.split(',')) if a.only else None
    results, report, errors = {}, [], []
    x = 0.0
    for b in BUILDERS:
        if only and b.__name__ not in only:
            continue
        m = b()
        tris = m.finish()
        verts, idx = pack(m.name, tris)
        results[m.name] = (verts, idx)
        nt = len(idx) // 3
        budget = BUDGET[m.name]
        h = max(v[2] for v in verts)
        r = max(math.hypot(v[0], v[1]) for v in verts)
        zmin = min(v[2] for v in verts)
        ntint = sum(1 for (p, n, c, t) in tris if t)
        report.append('%-24s %5d tris (budget %4d)  %5d verts  h %.2f  r %.2f  zmin %+.2f  tinted tris %d' % (
            m.name, nt, budget, len(verts), h, r, zmin, ntint))
        if nt > budget:
            errors.append('%s: %d triangles > budget %d' % (m.name, nt, budget))
        if a.blend:
            to_blend(m.name, tris, x)
            x += 2 * r + 1.0
        m.bm.free()
    meta = export(results, a.out)
    print('\n'.join(report))
    size = os.path.getsize(os.path.join(a.out, 'models.bin'))
    print('meshes %d, vertices %d, indices %d, models.bin %d bytes' % (len(meta['meshes']), meta['totalVertices'], meta['totalIndices'], size))
    if a.blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(a.blend))
    if errors:
        print('BUDGET ERRORS:\n' + '\n'.join(errors))
        sys.exit(1)


if __name__ == '__main__':
    try:
        main()
    except SystemExit as e:
        if e.code:
            os._exit(int(e.code))
        raise
