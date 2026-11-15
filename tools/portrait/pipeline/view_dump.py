# Render the Rust dump (skin, cards, cap) in flat colours from 4 views (debug).
# usage: python view_dump.py dump.obj out.png
import sys, bpy, math
src, out = sys.argv[-2:]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.wm.obj_import(filepath=src, forward_axis='NEGATIVE_Z', up_axis='Y')
cols = {'s0': (0.8, 0.6, 0.5), 's4': (0.1, 0.1, 0.6), 's5': (0.9, 0.05, 0.05)}
for o in list(bpy.context.selected_objects):
    c = cols.get(o.name.split('.')[0])
    if c is None:
        bpy.data.objects.remove(o); continue
    m = bpy.data.materials.new(o.name); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*c, 1)
    o.data.materials.clear(); o.data.materials.append(m)
cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = 2.8
co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
sun = bpy.data.lights.new('s', 'SUN'); sun.energy = 3
so = bpy.data.objects.new('s', sun); sc.collection.objects.link(so); so.rotation_euler = (math.radians(50), 0, math.radians(20))
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[1].default_value = 0.8
sc.render.engine = 'CYCLES'; sc.cycles.samples = 8
sc.render.resolution_x = 400; sc.render.resolution_y = 400
cx, cy, cz = 0.0, -0.5, 8.3
tgt = bpy.data.objects.new('t', None); sc.collection.objects.link(tgt); tgt.location = (cx, cy, cz)
tc = co.constraints.new('TRACK_TO'); tc.target = tgt; tc.track_axis = 'TRACK_NEGATIVE_Z'; tc.up_axis = 'UP_Y'
for i, (ang, el) in enumerate([(0, 5), (90, 5), (180, 5), (35, 20)]):
    a = math.radians(ang); e = math.radians(el); r = 10
    co.location = (cx + r * math.sin(a) * math.cos(e), cy - r * math.cos(a) * math.cos(e), cz + r * math.sin(e))
    sc.render.filepath = out.replace('.png', f'_{i}.png'); bpy.ops.render.render(write_still=True)
