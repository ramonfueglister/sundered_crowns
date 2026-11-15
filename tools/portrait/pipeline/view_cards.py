# Render the hair cards on the base head from front, side and back (debug).
# usage: python view_cards.py head.obj cards.obj atlas.png out.png
import sys, bpy, math
head, cards, atlas, cap, capimg, out = sys.argv[-6:]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
def load(p):
    bpy.ops.wm.obj_import(filepath=p, forward_axis='NEGATIVE_Z', up_axis='Y')
    return bpy.context.selected_objects[0]
H = load(head); C = load(cards)
mh = bpy.data.materials.new('skin'); mh.use_nodes = True
mh.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.75, 0.55, 0.45, 1)
H.data.materials.append(mh)
for p in H.data.polygons: p.use_smooth = True
mc = bpy.data.materials.new('hair'); mc.use_nodes = True
nt = mc.node_tree; bsdf = nt.nodes['Principled BSDF']
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(atlas)
mul = nt.nodes.new('ShaderNodeMixRGB'); mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = 1
mul.inputs[2].default_value = (0.12, 0.07, 0.04, 1)
nt.links.new(tex.outputs['Color'], mul.inputs[1]); nt.links.new(mul.outputs[0], bsdf.inputs['Base Color'])
nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
bsdf.inputs['Roughness'].default_value = 0.5
C.data.materials.append(mc)
for p in C.data.polygons: p.use_smooth = True
K = load(cap)
mk = bpy.data.materials.new('cap'); mk.use_nodes = True
nk = mk.node_tree; bk = nk.nodes['Principled BSDF']
tk = nk.nodes.new('ShaderNodeTexImage'); tk.image = bpy.data.images.load(capimg)
mk2 = nk.nodes.new('ShaderNodeMixRGB'); mk2.blend_type = 'MULTIPLY'; mk2.inputs[0].default_value = 1
mk2.inputs[2].default_value = (0.12, 0.07, 0.04, 1)
nk.links.new(tk.outputs['Color'], mk2.inputs[1]); nk.links.new(mk2.outputs[0], bk.inputs['Base Color'])
nk.links.new(tk.outputs['Alpha'], bk.inputs['Alpha']); bk.inputs['Roughness'].default_value = 0.6
K.data.materials.append(mk)
for p in K.data.polygons: p.use_smooth = True
# camera + light
cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = 2.6
co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
sun = bpy.data.lights.new('s', 'SUN'); sun.energy = 3
so = bpy.data.objects.new('s', sun); sc.collection.objects.link(so); so.rotation_euler = (math.radians(50), 0, math.radians(20))
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.6, 0.6, 0.6, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
sc.render.engine = 'CYCLES'; sc.cycles.samples = 16; sc.cycles.device = 'CPU'
sc.render.resolution_x = 500; sc.render.resolution_y = 500
# head centre in Blender coords (obj y up -> blender z up, z forward -> -y)
cx, cy, cz = 0.0, -0.57, 7.75
import os
tgt = bpy.data.objects.new('t', None); sc.collection.objects.link(tgt); tgt.location = (cx, cy, cz)
tc = co.constraints.new('TRACK_TO'); tc.target = tgt; tc.track_axis = 'TRACK_NEGATIVE_Z'; tc.up_axis = 'UP_Y'
outs = []
for i, (ang, el) in enumerate([(0, 5), (90, 5), (180, 5), (35, 45)]):
    a = math.radians(ang); e = math.radians(el); r = 10
    co.location = (cx + r * math.sin(a) * math.cos(e), cy - r * math.cos(a) * math.cos(e), cz + r * math.sin(e))
    p = out.replace('.png', f'_{i}.png'); sc.render.filepath = p
    bpy.ops.render.render(write_still=True); outs.append(p)
print('done', outs)
