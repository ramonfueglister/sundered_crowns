# A tunic draped by Blender's cloth simulation over the MakeHuman base body:
# the body's torso faces (below the neckline, sleeves to the upper arm) as a
# loose shell, close at the shoulders, wider below, falling under gravity onto
# the body (collision), so that the cloth's surplus lays in folds.
# usage: venv/bin/python tunic_sim.py base.obj out.obj [frames]
import sys, math
import bpy, bmesh
import numpy as np
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import neckline
WIDE = float(os.environ.get('WIDE', '0.25')); BEND = float(os.environ.get('BEND', '5.0')); LOOSE = float(os.environ.get('LOOSE', '0.3'))
SFL = float(os.environ.get('SFLARE', '0.06')); NECK = float(os.environ.get('NECK', '0.0')); NDIP = float(os.environ.get('NDIP', '0.12'))
base, outp = sys.argv[-3], sys.argv[-2]
frames = int(sys.argv[-1])
vs, faces, g = [], {}, None
for l in open(base):
    if l.startswith('v '):
        vs.append([float(t) for t in l.split()[1:4]])
    elif l.startswith('g '):
        g = l.split()[1]
    elif l.startswith('f '):
        faces.setdefault(g, []).append([int(t.split('/')[0]) - 1 for t in l.split()[1:]])
V = np.array(vs)
S = 0.1  # base units (about 10 cm) to metres
# (round 170) `ARMS=x`: sleeves cut to the arm. The cloth is the helper's own out to this far from the middle
# (3.9: the elbow, where the body's data ends, `hairlib.py` `BUST_X`), and no tube is drawn out of the armhole;
# the body it lies on reaches a little further.
ARMS = float(os.environ.get('ARMS', '0'))
body = [f for f in faces['body'] if all(V[i][1] > 1.2 and abs(V[i][0]) < max(3.2, ARMS + 0.8) for i in f)]

def neck_ok(c):
    x, y, z = c
    if y > 6.3:
        return False
    t = abs(math.atan2(x, z - 0.45)) / math.pi
    front = z > 0.25
    return y < (5.5 + NECK + (5.9 - 5.5) * min(1, t * 1.6)) - NDIP * max(0, 1 - abs(x) / 0.6) * (1 if front else 0)

# the cloth from MakeHuman's tights helper (even mesh, no nipples or navel)
# (`NECKLINE`: a neckline cut wide, `neckline.py`; it is cut out of the finer mesh below, so that its edge is the
# line and not the helper's faces. `YMIN`: the garment's lower end, for one that is a yoke alone)
YMIN = float(os.environ.get('YMIN', '1.75'))
cl = [f for f in faces['helper-tights'] if all((V[i][1] <= 6.3 if neckline.WIDE else neck_ok(V[i])) and V[i][1] > YMIN and abs(V[i][0]) < (ARMS or 2.25) for i in f)]
# (round 170) Run in a Blender that is open, through its MCP add-on, the script works in a scene of its own
# (`SCENE`) and leaves what is open as it is; run by itself it starts from an empty file as before.
if bpy.app.background:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
else:
    sc = bpy.data.scenes.new(os.environ.get('SCENE', 'tunic_sim'))

def make(name, fl, off=None):
    used = sorted({i for f in fl for i in f}); rm = {o: k for k, o in enumerate(used)}
    P = V[used].copy()
    me = bpy.data.meshes.new(name)
    # Blender is z-up: (x, y, z) -> (x, -z, y)
    me.from_pydata((np.stack([P[:, 0], -P[:, 2], P[:, 1]], -1) * S).tolist(), [], [[rm[i] for i in f] for f in fl])
    me.update()
    ob = bpy.data.objects.new(name, me)
    sc.collection.objects.link(ob)
    return ob, used

# the collider without nipples: the chest's front smoothed (Laplacian, 25 passes)
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
bo, _ = make('body', body)
V = V0
bo.modifiers.new('col', 'COLLISION')
bo.collision.thickness_outer = 0.003
bo.collision.cloth_friction = float(os.environ.get("FRIC", "3.0"))
bo.collision.thickness_outer = 0.009
sm = bo.modifiers.new('smooth', 'SMOOTH'); sm.factor = 0.8; sm.iterations = 4
bo.modifiers.move(1, 0)

to, used = make('tunic', cl)
me = to.data
# twice as fine
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True, smooth=0.5)
if neckline.WIDE:
    neckline.cut(bm)
bmesh.ops.triangulate(bm, faces=bm.faces[:])
# the cloth does not remember the body's details (nipples, collarbones)
for _ in range(8):
    bmesh.ops.smooth_vert(bm, verts=bm.verts[:], factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
# short sleeves: each armhole (a boundary loop off the middle) extruded down the arm
if os.environ.get('SLEEVES', '1') == '1' and not ARMS:
    bm.edges.ensure_lookup_table()
    bnd = [e for e in bm.edges if e.is_boundary]
    loops, seen = [], set()
    for e in bnd:
        if e.index in seen:
            continue
        loop, stack = set(), [e]
        while stack:
            x = stack.pop()
            if x.index in seen:
                continue
            seen.add(x.index); loop.add(x)
            for v in x.verts:
                for y in v.link_edges:
                    if y.is_boundary and y.index not in seen:
                        stack.append(y)
        loops.append(list(loop))
    for loop in loops:
        vs_ = list({v for e in loop for v in e.verts})
        c = vs_[0].co.copy() * 0
        for v in vs_:
            c += v.co
        c /= len(vs_)
        if abs(c.x) < 0.08:   # neck and hem stay open (blender units: 0.8 base)
            continue
        sx = 1 if c.x > 0 else -1
        d = np.array([0.55 * sx, 0.0, -0.83])  # down the arm (z up)
        edges = loop
        for k in range(int(os.environ.get('SLEN', '3'))):
            r = bmesh.ops.extrude_edge_only(bm, edges=edges)
            nv = [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]
            for v in nv:
                off = v.co - c
                v.co.x += d[0] * 0.03 + off.x * SFL
                v.co.y += off.y * SFL
                v.co.z += d[2] * 0.03 + off.z * SFL
            c = c.copy(); c.x += d[0] * 0.03; c.z += d[2] * 0.03
            edges = [g for g in r['geom'] if isinstance(g, bmesh.types.BMEdge) and g.is_boundary]
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
bm.to_mesh(me); bm.free(); me.update()
# loose shell: along the vertex normals, close on the shoulders, wider lower down
me = to.data
me.update()
n = np.zeros((len(me.vertices), 3)); me.vertices.foreach_get('normal', n.ravel())
P = np.zeros((len(me.vertices), 3)); me.vertices.foreach_get('co', P.ravel())
# `ONSKIN=distance`: no drape. What is worn under a gown and shows at its neck alone (a shirt, a smock) lies on the
# body: the smoothed shell this far off the skin, written as it is
if os.environ.get('ONSKIN'):
    P = P + n * float(os.environ['ONSKIN']) * S
    with open(outp, 'w') as fo:
        for v in P:
            fo.write('v %.5f %.5f %.5f\n' % (v[0] / S, v[2] / S, -v[1] / S))
        for p in me.polygons:
            fo.write('f ' + ' '.join(str(i + 1) for i in p.vertices) + '\n')
    print('on the skin: verts', len(P), 'faces', len(me.polygons))
    sys.exit(0)
y = P[:, 2] / S
off = (0.07 + LOOSE * np.clip((5.6 - y) / 1.2, 0, 1)) * S
# A neckline cut wide is held where it is cut (its edge is pinned below): left to the drape, a gown with a wide
# opening and a notch slid off one shoulder. Its edge lies close on the body, and the cloth comes off it over four
# rings of the mesh.
neck_edge = np.zeros(len(P), bool)
if neckline.WIDE:
    from collections import Counter
    ec = Counter(tuple(sorted((p.vertices[k], p.vertices[(k + 1) % len(p.vertices)]))) for p in me.polygons for k in range(len(p.vertices)))
    near_ = {}
    for a_, b_ in ec:
        near_.setdefault(a_, set()).add(b_); near_.setdefault(b_, set()).add(a_)
    ring = {i: 0 for e, c in ec.items() if c == 1 for i in e if y[i] > 4.9 and abs(P[i, 0] / S) < neckline.WIDE[0] + 0.3}
    front_ = set(ring)
    for r in range(1, 5):
        front_ = {j for i in front_ for j in near_[i]} - set(ring)
        ring.update({j: r for j in front_})
    for i, r in ring.items():
        off[i] = 0.07 * S + (off[i] - 0.07 * S) * (r / 5.0) ** 2
        neck_edge[i] = r == 0
    print('neck edge pinned:', int(neck_edge.sum()), 'points')
P0 = P.copy()
P = P + n * off[:, None]
# wider than the body below the chest (a tunic is cut wide): sideways outwards
wide = 1 + WIDE * np.clip((5.4 - y) / 1.0, 0, 1) * np.clip((1.5 - np.abs(P[:, 0] / S)) / 0.3, 0, 1)
P[:, 0] *= wide
me.vertices.foreach_set('co', P.ravel()); me.update()
# the belt (cingulum): the lowest ring is drawn in to the waist over the first frames
bot = y < 1.95
belt = P.copy()
belt[bot] = P0[bot] + n[bot] * 0.02 * S
belt[bot, 2] -= 0.05 * S
to.shape_key_add(name='Basis')
kb = to.shape_key_add(name='belt')
kb.data.foreach_set('co', belt.ravel())
kb.value = 0.0; kb.keyframe_insert('value', frame=1)
kb.value = 1.0; kb.keyframe_insert('value', frame=25)
vg = to.vertex_groups.new(name='pin')
vg.add([int(i) for i in np.where(bot | neck_edge)[0]], 1.0, 'REPLACE')
cm = to.modifiers.new('cloth', 'CLOTH')
s = cm.settings
s.vertex_group_mass = 'pin'
s.quality = 8
s.mass = 0.35
s.tension_stiffness = 30; s.compression_stiffness = 60; s.shear_stiffness = 10
s.bending_stiffness = BEND
s.air_damping = 1.0
# (round 170) `FIT=share`: a gown cut to the body. The cloth is this share shorter each way than the shell it
# starts as, as a garment cut narrower than the body and closed on it with buttons or a lace: it lies on the
# body under its own pull, spans the hollows and goes in at the waist, where a cloth let fall hangs from the
# chest (round 151).
if os.environ.get('FIT'):
    s.shrink_min = float(os.environ['FIT'])
cm.collision_settings.use_collision = True
cm.collision_settings.distance_min = 0.002
cm.collision_settings.use_self_collision = True
cm.collision_settings.self_distance_min = 0.002
cm.point_cache.frame_end = frames
sc.frame_start, sc.frame_end = 1, frames
for f in range(1, frames + 1):
    sc.frame_set(f)
dg = bpy.context.evaluated_depsgraph_get() if bpy.app.background else sc.view_layers[0].depsgraph
ev = to.evaluated_get(dg)
m2 = ev.to_mesh()
with open(outp, 'w') as fo:
    for v in m2.vertices:
        fo.write('v %.5f %.5f %.5f\n' % (v.co[0] / S, v.co[2] / S, -v.co[1] / S))
    for p in m2.polygons:
        fo.write('f ' + ' '.join(str(i + 1) for i in p.vertices) + '\n')
print('tunic verts', len(m2.vertices), 'faces', len(m2.polygons))
