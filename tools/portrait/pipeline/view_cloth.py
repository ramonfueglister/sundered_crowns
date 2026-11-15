# Workbench views (front, three-quarter) of the base body and a cloth OBJ.
# usage: venv/bin/python view_cloth.py base.obj cloth.obj out.png
import sys, math
import bpy
import numpy as np
base, cloth, outp = sys.argv[-3:]
vs, faces, g = [], {}, None
for l in open(base):
    if l.startswith('v '): vs.append([float(t) for t in l.split()[1:4]])
    elif l.startswith('g '): g = l.split()[1]
    elif l.startswith('f '): faces.setdefault(g, []).append([int(t.split('/')[0]) - 1 for t in l.split()[1:]])
V = np.array(vs)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
def add(name, P, F, col):
    me = bpy.data.meshes.new(name); me.from_pydata(P, [], F); me.update()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
    mat = bpy.data.materials.new(name); mat.use_nodes = True; mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = col; mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9; ob.data.materials.append(mat)
    return ob
bf = [f for f in faces['body'] if all(V[i][1] > 2.0 and abs(V[i][0]) < 3.2 for i in f)]
zu = lambda P: [[a, -c, b] for a, b, c in P]
add('body', zu(V.tolist()), bf, (0.85, 0.65, 0.5, 1))
cv, cf = [], []
for l in open(cloth):
    if l.startswith('v '): cv.append([float(t) for t in l.split()[1:4]])
    elif l.startswith('f '): cf.append([int(t) - 1 for t in l.split()[1:]])
add('cloth', zu(cv), cf, (0.55, 0.6, 0.7, 1))
import os
if os.environ.get('EXTRA'):
    ev_, ef_ = [], []
    for l in open(os.environ['EXTRA']):
        if l.startswith('v '): ev_.append([float(t) for t in l.split()[1:4]])
        elif l.startswith('f '): ef_.append([int(t) - 1 for t in l.split()[1:]])
    add('extra', zu(ev_), ef_, (0.75, 0.68, 0.55, 1))
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'; sc.cycles.samples = 16
sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w'); sc.world = w; w.color = (0.25, 0.25, 0.27)
for nm, rot, en in (('key', (50, 0, -30), 3.5), ('fill', (60, 0, 50), 1.2)):
    L = bpy.data.objects.new(nm, bpy.data.lights.new(nm, 'SUN')); L.data.energy = en
    L.rotation_euler = (math.radians(rot[0]), 0, math.radians(rot[2])); sc.collection.objects.link(L)
sc.render.resolution_x, sc.render.resolution_y = 700, 800
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 85
tgt = bpy.data.objects.new('t', None); sc.collection.objects.link(tgt); tgt.location = (0, -0.3, 5.3)
c = cam.constraints.new('TRACK_TO'); c.target = tgt; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
imgs = []
angs = [float(a) for a in os.environ.get('ANGS', '0,35,90').split(',')]
for k, ang in enumerate(angs):
    a = math.radians(ang); r = 16
    cam.location = (r * math.sin(a), -(0.3 + r * math.cos(a)), 5.5)
    sc.render.filepath = f'{outp}.vc{k}.png'; bpy.ops.render.render(write_still=True); imgs.append(sc.render.filepath)
import subprocess
subprocess.run(['python3', '-I', '-c', 'import sys\nfrom PIL import Image\nims=[Image.open(p).convert("RGB") for p in sys.argv[2:]]\no=Image.new("RGB",(700*len(ims),800))\nfor i,im in enumerate(ims): o.paste(im,(700*i,0))\no.save(sys.argv[1])', outp] + imgs, check=True)
