# Toga and palla draped by Blender's cloth simulation over the MakeHuman base
# body and the draped tunic (tunic_sim.py's OBJ as a second collider).
#   toga:  the band (balteus) from the right hip across the chest over the
#          left shoulder and down the back, gathered at both ends, so that
#          the slack in between falls in folds along the band; the left
#          shoulder and upper arm under the cloth
#   palla: a mantle round the shoulders and back, open in front, falling in
#          folds (the women's mantle over the tunic)
# usage: venv/bin/python drape_sim.py base.obj tunic.obj kind out.obj [frames]
import sys, math, os
import bpy, bmesh
import numpy as np
base, tunic, kind, outp, frames = sys.argv[-5], sys.argv[-4], sys.argv[-3], sys.argv[-2], int(sys.argv[-1])
BEND = float(os.environ.get('BEND', '1.5')); LOOSE = float(os.environ.get('LOOSE', '0.5'))
FRIC = float(os.environ.get('FRIC', '1.0'))
# the portrait shows the body down to about y 4.6: the cloth only down to YMIN,
# its lowest ring held there (the cloth goes on below)
YMIN = float(os.environ.get('YMIN', '2.6')); VY0 = float(os.environ.get('VY0', '4.3')); GATHER = float(os.environ.get('GATHER', '0.6'))
vs, faces, g = [], {}, None
for l in open(base):
    if l.startswith('v '):
        vs.append([float(t) for t in l.split()[1:4]])
    elif l.startswith('g '):
        g = l.split()[1]
    elif l.startswith('f '):
        faces.setdefault(g, []).append([int(t.split('/')[0]) - 1 for t in l.split()[1:]])
V = np.array(vs)
S = 0.1
body = [f for f in faces['body'] if all(V[i][1] > 1.2 and abs(V[i][0]) < 3.6 for i in f)]

def neck_ok(c, lift=0.0):
    x, y, z = c
    if y > 6.3:
        return False
    t = abs(math.atan2(x, z - 0.45)) / math.pi
    front = z > 0.25
    return y < (5.5 + lift + (5.9 - 5.5) * min(1, t * 1.6)) - 0.12 * max(0, 1 - abs(x) / 0.6) * (1 if front else 0)

# the toga's band: the line from the left shoulder (x > 0 is the body's left)
# down across the chest to the right hip, in front and (mirrored) at the back
# (in toga busts the band's upper edge runs from the left shoulder by the neck
# to under the right arm, so it crosses the upper chest)
_b = [float(t) for t in os.environ.get('BAND', '1.25,5.5,-1.95,-1.8').split(',')]
L0 = np.array(_b[:2]); LD = np.array(_b[2:]); LD = LD / np.linalg.norm(LD)
TEND = float(os.environ.get('TEND', '3.9'))
def band(c):
    q = np.array([c[0], c[1]]) - L0
    t = q @ LD
    d = abs(q[0] * LD[1] - q[1] * LD[0])
    return t, d

def region(c):
    x, y, z = c
    if kind == 'toga':
        if not neck_ok(c, 0.05) or y < YMIN:
            return False
        if x > 0.55 and y > 4.2:      # over the left shoulder and upper arm
            return True
        if z > -0.3 and x > 0.3:      # the first end, hanging down in front on the left
            return True
        t, d = band(c)
        return -0.2 < t < TEND and d < (0.75 if z > -0.3 else 1.1)
    elif kind == 'veil':
        # over the head and onto the shoulders, open for the face and in front
        # of the neck and chest
        if y < VY0 or abs(x) > 2.0:
            return False
        if y > 6.05 and y < 7.95 and z > 0.5 and abs(x) < 0.68:   # the face
            return False
        if y <= 6.05 and z > 0.1 and abs(x) < 0.68:               # neck and chest
            return False
        return True
    else:
        if not neck_ok(c, 0.05) or y < YMIN:
            return False
        # (not round the arms: there the cloth crumpled on the tunic's sleeves)
        return not (z > 0.2 and abs(x) < float(os.environ.get('OPEN', '0.8'))) and abs(x) < 2.1

# (the tights helper covers the arms too: the toga takes the left upper arm)
src = 'body' if kind in ('veil', 'hood', 'cowl') else 'helper-tights'
cl = [f for f in faces[src] if all(region(V[i]) and abs(V[i][0]) < 3.0 for i in f)]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def make(name, P, fl):
    me = bpy.data.meshes.new(name)
    me.from_pydata((np.stack([P[:, 0], -P[:, 2], P[:, 1]], -1) * S).tolist(), [], fl)
    me.update()
    ob = bpy.data.objects.new(name, me)
    sc.collection.objects.link(ob)
    return ob

def sub(fl):
    used = sorted({i for f in fl for i in f}); rm = {o: k for k, o in enumerate(used)}
    return used, [[rm[i] for i in f] for f in fl]

# collider: the body with the chest smoothed (as tunic_sim.py)
V0 = V.copy()
nb = {}
for f in body:
    for k in range(len(f)):
        nb.setdefault(f[k], set()).update((f[k - 1], f[(k + 1) % len(f)]))
chest = [i for i in nb if abs(V[i][0]) < 1.3 and 3.6 < V[i][1] < 5.2 and V[i][2] > 0.3]
for _ in range(25):
    Vn = V.copy()
    for i in chest:
        Vn[i] = 0.5 * V[i] + 0.5 * V[list(nb[i])].mean(0)
    V = Vn
used, fl = sub(body)
bo = make('body', V[used], fl)
V = V0
bo.modifiers.new('col', 'COLLISION')
bo.collision.cloth_friction = FRIC
bo.collision.thickness_outer = 0.009
# the tunic underneath as a second collider
tv, tf = [], []
for l in open(tunic):
    if l.startswith('v '):
        tv.append([float(t) for t in l.split()[1:4]])
    elif l.startswith('f '):
        tf.append([int(t) - 1 for t in l.split()[1:]])
tu = make('tunic', np.array(tv), tf)
from mathutils.bvhtree import BVHTree
from mathutils import Vector
# the tunic's crumples would catch the cloth: the collider is instead the body
# grown over the tunic (per body vertex the tunic's distance along the normal,
# spread to the neighbours and smoothed), a calm hull round body and tunic
from mathutils.bvhtree import BVHTree
from mathutils import Vector
tbv = BVHTree.FromObject(tu, bpy.context.evaluated_depsgraph_get())
HULL = os.environ.get('HULL', '0') == '1'
if not HULL:
    tu.modifiers.new('col', 'COLLISION')
    tu.collision.cloth_friction = FRIC
    tu.collision.thickness_outer = 0.006
bme = bo.data
nbv = np.zeros((len(bme.vertices), 3)); bme.vertices.foreach_get('normal', nbv.ravel())
pbv = np.zeros((len(bme.vertices), 3)); bme.vertices.foreach_get('co', pbv.ravel())
dd = np.zeros(len(pbv))
for i in range(len(pbv)):
    h = tbv.ray_cast(Vector(pbv[i]), Vector(nbv[i]), 0.25)
    if h[0] is not None:
        dd[i] = h[3]
adj = [set() for _ in range(len(pbv))]
for e in bme.edges:
    a_, b_ = e.vertices
    adj[a_].add(b_); adj[b_].add(a_)
adjl = [np.array(sorted(a_)) if a_ else np.array([i]) for i, a_ in enumerate(adj)]
for _ in range(3):
    dd = np.array([max(dd[i], dd[adjl[i]].max()) for i in range(len(dd))])
for _ in range(4):
    dd = 0.5 * dd + 0.5 * np.array([dd[a_].mean() for a_ in adjl])
if HULL:
    bme.vertices.foreach_set('co', (pbv + nbv * (dd[:, None] + 0.004)).ravel()); bme.update()
print('hull: tunic over the body up to', round(dd.max() / S, 2), 'units')

GRID = kind in ('veil', 'hood', 'cowl')
FACE_W = float(os.environ.get('FACE_W', '40')); FACE_LO = float(os.environ.get('FACE_LO', '-30')); FACE_HI = float(os.environ.get('FACE_HI', '40'))
SK_OUT = float(os.environ.get('SK_OUT', '0.12')); SK_DOWN = float(os.environ.get('SK_DOWN', '0.28'))
if GRID:
    # the veil as a regular grid round the head's centre: rays from there to
    # the body (head, neck, shoulders), open for the face and the front of the
    # neck and chest (the body's own head mesh has ears and lids that tore the
    # cloth into spikes)
    hb = BVHTree.FromObject(bo, bpy.context.evaluated_depsgraph_get())
    C = np.array([0.0, 6.95, 0.2])
    rows, gp, fl = [], [], []
    gdir = []
    NPH = 96
    ths = np.arange(84.0, -56.0, -2.5)
    idx = {}
    for r_, th in enumerate(ths):
        for k in range(NPH):
            ph = 360.0 * k / NPH - 180.0    # 0 in front
            if kind == 'cowl':
                continue
            # a veil is open in front of the face, and wider below the jaw (VJ, to VW2 at 30 degrees lower), so
            # that its front edges hang from the temples to the shoulders instead of clinging to the neck
            _vj = float(os.environ.get('VJ', '-90')); _vw = 42 + (float(os.environ.get('VW2', '42')) - 42) * min(1.0, max(0.0, (_vj - th) / 30.0))
            if kind == 'veil' and abs(ph) < _vw and th < float(os.environ.get('VTH', '38')):
                continue
            if kind == 'hood' and (th < float(os.environ.get('TH0', '-33')) or th > float(os.environ.get('THMAX', '90'))):
                continue
            if kind == 'hood' and FACE_LO < th < FACE_HI and abs(ph) < FACE_W * math.sqrt(max(0.0, 1 - ((th - (FACE_LO + FACE_HI) / 2) / ((FACE_HI - FACE_LO) / 2)) ** 2)) + 6:
                continue   # the face: an oval, closed under the chin                     # the face and the neck in front
            t_, p_ = math.radians(th), math.radians(ph)
            d = np.array([math.cos(t_) * math.sin(p_), math.sin(t_), math.cos(t_) * math.cos(p_)])
            o_ = Vector(np.array([C[0], -C[2], C[1]]) * S); dv = Vector([d[0], -d[2], d[1]])
            h = hb.ray_cast(o_, dv, 1.0)
            if h[0] is None:
                continue
            q = np.array(h[0]) / S
            idx[(r_, k)] = len(gp)
            gp.append([q[0], q[2], -q[1]])
            rows.append(h[3] / S)
            gdir.append(d)
    if kind in ('hood', 'cowl'):
        # below the jaw a hood does not follow the body (rays from the head's
        # centre run down inside the neck): each column goes on downwards in
        # rings, each point just outside the body and the tunic at its height
        # (a ray from outside towards the axis), never narrower than the ring above
        TH0 = float(os.environ.get('TH0', '-33')); DY = float(os.environ.get('DY', '0.2')); HEM = float(os.environ.get('HEMY', '4.5'))
        AX = np.array([0.0, 0.0, 0.1])
        R0 = max(r_ for r_, th in enumerate(ths) if th >= TH0) if kind == 'hood' else int(os.environ.get('NU', '9'))
        for key in [key for key in idx if key[0] > R0]:
            del idx[key]
        def outer(y, dx, dz, of=None):
            o_ = np.array([AX[0] + dx * 6, y, AX[2] + dz * 6])
            best = 0.0
            for bv in (of or (hb, tbv)):
                h = bv.ray_cast(Vector(np.array([o_[0], -o_[2], o_[1]]) * S), Vector([-dx, dz, 0.0]), 0.6)
                if h[0] is not None:
                    best = max(best, 6 - h[3] / S)
            return best
        if kind == 'cowl':
            # the hood thrown back: a roll of cloth round the neck, low and
            # narrow under the chin, high and thick at the nape (where the
            # hood lies folded), from its inner edge over the top and down
            # to the shoulders; the cape goes on from there
            for k in range(NPH):
                ph = math.radians(360.0 * k / NPH - 180.0)
                back = 0.5 - 0.5 * math.cos(ph)          # 0 in front, 1 behind
                dx, dz = math.sin(ph), math.cos(ph)
                yn = float(os.environ.get('CW_Y', '5.72')) + 0.2 * back
                ro = outer(yn, dx, dz) + 0.06
                # CW_IN draws the roll's inner edge from the gown's neckline in to the neck itself (1: on the
                # neck); the roll then grows wider by as much, so that its foot stays outside the gown
                # and CW_UP lifts that edge up the neck (fully at the nape, two fifths of it under the chin, where
                # CW_GAP lets it hang off the throat)
                yi = yn + float(os.environ.get('CW_UP', '0')) * (0.4 + 0.6 * back)
                rn = ro - float(os.environ.get('CW_IN', '0')) * (ro - outer(yi, dx, dz, (hb,)) - 0.06 - float(os.environ.get('CW_GAP', '0')) * (1 - back))
                _c = [float(t) for t in os.environ.get('COWL', '0.3,0.75,0.26,0.5').split(',')]
                w = _c[0] + _c[1] * back ** 1.5 + (ro - rn); hgt = _c[2] + _c[3] * back ** 1.5
                # the bunched cloth: folds running across the roll, uneven
                _fa = float(os.environ.get('FOLD', '0.0')); _kk = 2 * math.pi * k / NPH
                _f1 = math.sin(11 * _kk + 0.7) + 0.6 * math.sin(17 * _kk + 2.1) + 0.4 * math.sin(29 * _kk + 4.0)
                _f2 = math.sin(7 * _kk + 1.3) + 0.5 * math.sin(23 * _kk + 0.2)
                w *= 1 + 0.5 * _fa * _f2; hgt *= 1 + 0.35 * _fa * _f1
                for j in range(R0 + 1):
                    u = math.pi * (0.12 + 0.88 * j / R0)
                    rho = rn + w * (1 - math.cos(u)) / 2 + 0.05 * _fa * _f1 * math.sin(u) * math.sin(3 * u + 0.8 * _f2)
                    idx[(j, k)] = len(gp); gp.append([AX[0] + dx * rho, yn + (yi - yn) * (1 + math.cos(u)) / 2 + hgt * math.sin(u), AX[2] + dz * rho]); rows.append(0.0)
        UCUT = [tuple(float(t) for t in c.split(':')) for c in os.environ.get('UCUT', '').split(',') if c]
        DCUT = [tuple(float(t) for t in c.split(':')) for c in os.environ.get('DCUT', '').split(',') if c]
        # CHIN=angle: the hood closed under the chin. Where the face's oval has cut the last row of rays (FACE_LO
        # below TH0), that row is laid under the jaw instead: on the skin a ray from the head's centre leaves the
        # head through (the first thing it meets in front is the mouth's cavity), at `angle` below the horizon in
        # the middle, rising to the row's own angle beside the oval
        CHIN = [float(t) for t in os.environ.get('CHIN', '').split(',') if t]
        if kind == 'hood' and CHIN:
            K0 = NPH // 2
            miss = [k for k in range(NPH) if (R0, k) not in idx and abs(k - K0) < NPH // 6]
            kl = min(miss) - 1
            for k in miss:
                t_ = abs(k - K0) / (K0 - kl)
                th = math.radians(CHIN[0] + (ths[R0] - CHIN[0]) * t_ ** 2); ph = math.radians(360.0 * k / NPH - 180.0)
                d = np.array([math.cos(th) * math.sin(ph), math.sin(th), math.cos(th) * math.cos(ph)])
                o_ = Vector(np.array([C[0], -C[2], C[1]]) * S); dv = Vector([d[0], -d[2], d[1]]); far, t, q = 1.7 * S, 0.0, None
                while True:
                    h = hb.ray_cast(o_ + dv * t, dv, far - t)
                    if h[0] is None:
                        break
                    q = np.array(h[0]) / S; t += h[3] + 1e-3 * S
                idx[(R0, k)] = len(gp); gp.append([q[0], q[2], -q[1]]); rows.append(0.0)
            print('chin: columns', kl + 1, 'to', max(miss), 'in the middle at', [round(float(c), 2) for c in gp[idx[(R0, K0)]]])
        st = {}
        for k in range(NPH):
            i0 = idx.get((R0, k))
            if i0 is None:
                continue
            q = np.array(gp[i0])
            rho = math.hypot(q[0] - AX[0], q[2] - AX[2])
            st[k] = [q[1], rho, (q[0] - AX[0]) / rho, (q[2] - AX[2]) / rho]
        # every column the same number of rings down to the hem
        NR = int(os.environ.get('NR', '8'))
        for j in range(1, NR + 1):
            act = list(st)
            ys = {k: st[k][0] - (st[k][0] - HEM) / (NR + 1 - j) for k in act}
            raw = {k: max(outer(ys[k], st[k][2], st[k][3]) + 0.08, st[k][1] - 0.03) for k in act}
            # round the ring: no point further in than its neighbours' mean
            for _ in range(int(os.environ.get('ROUND', '30'))):
                nr = dict(raw)
                for k in act:
                    ns = [raw[n_] for n_ in ((k - 1) % NPH, (k + 1) % NPH) if n_ in raw]
                    if ns:
                        nr[k] = max(raw[k], sum(ns) / len(ns))
                raw = nr
            for k in act:
                _, _, dx, dz = st[k]
                st[k] = [ys[k], raw[k], dx, dz]
                # the face's opening goes on below the chin as a U cut into the front
                phd = abs(360.0 * k / NPH - 180.0)
                if kind == 'hood' and any(phd < w_ and j <= n_ for w_, n_ in UCUT):
                    continue
                # and may widen further down (DCUT=width:from ring), for a veil that hangs behind the shoulders
                if kind == 'hood' and any(phd < w_ and j >= n_ for w_, n_ in DCUT):
                    continue
                idx[(R0 + j, k)] = len(gp); gp.append([AX[0] + dx * raw[k], ys[k], AX[2] + dz * raw[k]]); rows.append(0.0)
    # below the last ring of rays the cloth goes on as a skirt, a little
    # outwards and down, to fall onto the shoulders in the simulation
    R = len(ths) - 1
    for j in range(1, (0 if kind in ('hood', 'cowl') else int(os.environ.get('SKIRT', '6'))) + 1):
        for k in range(NPH):
            if (R + j - 1, k) not in idx:
                continue
            ph = math.radians(360.0 * k / NPH - 180.0)
            q = np.array(gp[idx[(R + j - 1, k)]]) + np.array([SK_OUT * math.sin(ph), -SK_DOWN, SK_OUT * math.cos(ph)])
            idx[(R + j, k)] = len(gp)
            gp.append(list(q))
    for (r_, k), i in idx.items():
        a_, b_, c_ = idx.get((r_, (k + 1) % NPH)), idx.get((r_ + 1, k)), idx.get((r_ + 1, (k + 1) % NPH))
        if a_ is not None and b_ is not None and c_ is not None:
            fl += [[i, b_, c_], [i, c_, a_]]
    # the crown closed by a fan
    gp.append(list(C + np.array([0.0, 1.6, -0.1]))); top = len(gp) - 1
    for k in range(NPH):
        a_, b_ = idx.get((0, k)), idx.get((0, (k + 1) % NPH))
        if a_ is not None and b_ is not None and kind != 'cowl':
            fl.append([top, a_, b_])
    GP = np.array(gp)
    # the crown point on the head
    hh = hb.ray_cast(Vector(np.array([C[0], -C[2], C[1]]) * S), Vector([0, 0.06, 1]), 1.0)
    if kind == 'cowl':
        GP[top] = GP[0]
    elif hh[0] is not None:
        q = np.array(hh[0]) / S; GP[top] = [q[0], q[2], -q[1]]
    to = make('drape', GP, fl)
    print('veil grid', len(GP), len(fl))
else:
    used, fl = sub(cl)
    to = make('drape', V[used], fl)
me = to.data
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0005)
if not GRID:
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True, smooth=0.5)
bmesh.ops.triangulate(bm, faces=bm.faces[:])
inner = [v for v in bm.verts if not v.is_boundary]
for _ in range(10):
    bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
bm.to_mesh(me); bm.free(); me.update()
n = np.zeros((len(me.vertices), 3)); me.vertices.foreach_get('normal', n.ravel())
P = np.zeros((len(me.vertices), 3)); me.vertices.foreach_get('co', P.ravel())
B = np.stack([P[:, 0], P[:, 2], -P[:, 1]], -1) / S   # back in base units
if kind == 'toga':
    # standing off the tunic, more in the band's middle (the slack)
    tb = np.array([band(c)[0] for c in B])
    mid = np.clip(1 - np.abs(tb - TEND / 2) / (TEND / 2), 0, 1)
    off = (0.16 + LOOSE * mid) * S
elif kind == 'veil':
    # close over the flat hair on the head, looser down the sides
    off = (float(os.environ.get('OFF0', '0.1')) + LOOSE * np.clip((7.6 - B[:, 1]) / 1.8, 0, 1) - 0.4 * LOOSE * np.clip((5.6 - B[:, 1]) / 1.0, 0, 1)) * S
elif kind == 'cowl':
    off = np.full(len(B), 0.02 * S)
elif kind == 'hood':
    # close on the crown, baggy round the neck, the cape standing off the shoulders
    off = (float(os.environ.get('OFF0', '0.12')) + LOOSE * np.clip((7.6 - B[:, 1]) / 1.6, 0, 1)) * S
    # THROAT=share,height,width,span: a hood that lies close round the neck (closed under the chin): that share of the
    # bagginess is taken off below `height` (wholly from `span` further down), within `width` degrees to either
    # side of the front (300: all round)
    _t = [float(t) for t in os.environ.get('THROAT', '0,6.9,300,0.9').split(',')]
    _ph = np.degrees(np.abs(np.arctan2(B[:, 0], B[:, 2] - 0.1)))
    off = off - LOOSE * S * np.clip((7.6 - B[:, 1]) / 1.6, 0, 1) * _t[0] * np.clip((_t[1] - B[:, 1]) / _t[3], 0, 1) * np.clip((_t[2] - _ph) / 25.0, 0, 1)
else:
    off = (0.15 + LOOSE * np.clip((5.4 - B[:, 1]) / 1.4, 0, 1)) * S
# start outside the tunic: where a ray along the normal meets the tunic, at
# least a little beyond it (collisions only keep the cloth from crossing)
hbv = BVHTree.FromObject(bo, bpy.context.evaluated_depsgraph_get()) if HULL else tbv
for i in range(len(P)):
    hit = hbv.ray_cast(Vector(P[i]), Vector(n[i]), 0.25)
    if hit[0] is not None:
        off[i] = max(off[i], hit[3] + 0.04 * S)
P1 = P + n * off[:, None]
me.vertices.foreach_set('co', P1.ravel()); me.update()
# gathering: the band's lower ends drawn together towards the line over the
# first frames and held there (tucked under the belt, or held on the arm)
to.shape_key_add(name='Basis')
G = P1.copy()
pin = np.zeros(len(P), bool)
if kind == 'toga':
    for i, c in enumerate(B):
        t, d = band(c)
        if c[1] < YMIN + 0.35 and (c[0] > 0.3 or c[2] < -0.3 or YMIN > 3.0):
            pin[i] = True   # the cloth goes on below the cut: held there
        if c[1] > 5.5 and 0.75 < c[0] < 2.0:
            pin[i] = True   # resting on the shoulder (its weight on both sides),
            # gathered there into a narrower width, so that folds fan out below
            SG = float(os.environ.get('SGATHER', '0.0'))
            G[i, 0] = (1.35 + (c[0] - 1.35) * (1 - SG)) * S
        if t > TEND - 0.5 and c[0] < -0.9 and c[2] > -0.3:
            q = np.array([c[0], c[1]]) - L0
            on = L0 + LD * t
            k = GATHER
            G[i, 0] = (c[0] + (on[0] - c[0]) * k) * S
            G[i, 2] = (c[1] + (on[1] - c[1]) * k) * S
            pin[i] = True
elif kind == 'veil':
    pin = (B[:, 1] > 8.05) | (B[:, 1] < VY0 + 0.2)
elif kind in ('hood', 'cowl'):
    pin = B[:, 1] > float(os.environ.get('PINY', '8.15'))
else:
    pin = B[:, 1] < YMIN + 0.25
    # resting on both shoulders
    pin |= (B[:, 1] > 5.5) & (np.abs(B[:, 0]) > 0.75) & (np.abs(B[:, 0]) < 1.9)
kb = to.shape_key_add(name='gather')
kb.data.foreach_set('co', G.ravel())
kb.value = 0.0; kb.keyframe_insert('value', frame=1)
kb.value = 1.0; kb.keyframe_insert('value', frame=20)
vg = to.vertex_groups.new(name='pin')
vg.add([int(i) for i in np.where(pin)[0]], 1.0, 'REPLACE')
print('drape verts', len(P), 'pinned', int(pin.sum()))
cm = to.modifiers.new('cloth', 'CLOTH')
s = cm.settings
s.vertex_group_mass = 'pin'
s.quality = 8
s.mass = float(os.environ.get('MASS', '0.45'))
s.tension_stiffness = float(os.environ.get('TENS', '30')); s.compression_stiffness = 60; s.shear_stiffness = 10
s.bending_stiffness = BEND
s.air_damping = 1.0
cm.collision_settings.use_collision = True
cm.collision_settings.distance_min = 0.003
cm.collision_settings.use_self_collision = True
cm.collision_settings.self_distance_min = 0.002
cm.point_cache.frame_end = frames
sc.frame_start, sc.frame_end = 1, frames
for f in range(1, frames + 1):
    sc.frame_set(f)
dg = bpy.context.evaluated_depsgraph_get()
m2 = to.evaluated_get(dg).to_mesh()
# where the tunic still pokes through (or lies closer than 3 mm), the cloth is
# lifted off it along its normal
Q = np.zeros((len(m2.vertices), 3)); m2.vertices.foreach_get('co', Q.ravel())
Nq = np.zeros((len(m2.vertices), 3)); m2.vertices.foreach_get('normal', Nq.ravel())
lifted = 0
for i in range(len(Q)):
    # the cloth's normals point outward (as the helper's): the tunic between 3 mm
    # under the cloth and 4 cm over it
    nn = Nq[i]
    h = tbv.ray_cast(Vector(Q[i] - nn * 0.003), Vector(nn), 0.043)
    if h[0] is not None:
        Q[i] = np.array(h[0]) + nn * 0.003
        lifted += 1
print('lifted off the tunic', lifted)
with open(outp, 'w') as fo:
    for v in Q:
        fo.write('v %.5f %.5f %.5f\n' % (v[0] / S, v[2] / S, -v[1] / S))
    for p in m2.polygons:
        fo.write('f ' + ' '.join(str(i + 1) for i in p.vertices) + '\n')
print(kind, 'verts', len(m2.vertices), 'faces', len(m2.polygons))
