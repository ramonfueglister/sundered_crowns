# Renders eight wisp tiles (root at the top, tip at the bottom) with Blender
# Cycles into one grey atlas with alpha, 2048 x 1024: strands as Blender hair
# curves, each its own brightness, converging towards the tip.
# usage: venv/bin/python tiles.py out.png
import sys, math, random
import bpy
import numpy as np
out = sys.argv[-1]
import os
CURLY = bool(os.environ.get('CURLY'))
BEARD = bool(os.environ.get('BEARD'))  # coarse wavy beard hair
random.seed(3)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = 24
sc.render.film_transparent = True
sc.view_settings.view_transform = 'Standard'
sc.render.resolution_x, sc.render.resolution_y = 256, 1024
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 4.0
cam.location = (0, 0, 10); sc.collection.objects.link(cam); sc.camera = cam
mat = bpy.data.materials.new('hair'); mat.use_nodes = True
nt = mat.node_tree; nt.nodes.clear()
at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'shade'
em = nt.nodes.new('ShaderNodeEmission')
ou = nt.nodes.new('ShaderNodeOutputMaterial')
nt.links.new(at.outputs['Fac'], em.inputs['Strength'])
em.inputs['Color'].default_value = (1, 1, 1, 1)
nt.links.new(em.outputs['Emission'], ou.inputs['Surface'])
tiles = []
for tile in range(8):
    for o in list(sc.collection.objects):
        if o.type == 'CURVES':
            bpy.data.objects.remove(o)
    n = random.randint(170, 220) if not BEARD else random.randint(120, 160)
    npts = 24
    cv = bpy.data.hair_curves.new('w%d' % tile)
    cv.add_curves([npts] * n)
    pos, rad, shade = [], [], []
    conv = random.uniform(0.08, 0.2) if tile < 4 else random.uniform(0.25, 0.4)
    wave = random.uniform(0.0, 0.06) if not CURLY else random.uniform(0.07, 0.12)
    if BEARD:
        conv = random.uniform(0.15, 0.3) if tile < 4 else random.uniform(0.4, 0.6)
        wave = random.uniform(0.03, 0.06)
    for s in range(n):
        x0 = random.uniform(-0.47, 0.47)
        ln = random.uniform(0.6, 1.0)
        f0 = random.uniform(0.0, 0.25)
        ph = random.uniform(0, 6.3)
        br = random.uniform(0.55, 1.0)
        for k in range(npts):
            f = f0 + k / (npts - 1) * (ln - f0)
            x = x0 * (1 - conv * f) + wave * math.sin(ph + f * (9 if not CURLY else 26) + (5 * f * f if BEARD else 0)) * (1 if not BEARD else 0.5 + f)
            y = 2.0 - 4.0 * f
            pos += [x, y, 0.0]
            rad.append((0.010 if not BEARD else 0.013) * (1 - 0.75 * f * f))
        shade.append(br)
    cv.position_data.foreach_set('vector', pos)
    ra = cv.attributes.get('radius') or cv.attributes.new('radius', 'FLOAT', 'POINT')
    ra.data.foreach_set('value', rad)
    sa = cv.attributes.new('shade', 'FLOAT', 'CURVE')
    sa.data.foreach_set('value', shade)
    cv.materials.append(mat)
    ob = bpy.data.objects.new('w%d' % tile, cv)
    sc.collection.objects.link(ob)
    path = '/tmp/tile%d.png' % tile
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    tiles.append(path)
img = np.zeros((1024, 2048, 4), np.float32)
for i, p in enumerate(tiles):
    im = bpy.data.images.load(p)
    px = np.array(im.pixels[:], np.float32).reshape(1024, 256, 4)[::-1]
    img[:, i * 256:(i + 1) * 256] = px
o = bpy.data.images.new('atlas', 2048, 1024, alpha=True)
o.pixels.foreach_set(img[::-1].ravel())
o.filepath_raw = out; o.file_format = 'PNG'; o.save()
print('atlas', out)
