# Renders every mesh of public/models/models.{json,bin} with Cycles (CPU) into a labelled contact sheet.
# It reads the exported binary (not the generator), so the sheet shows exactly what the game loads,
# with the stored per-face normals as custom normals (a flipped normal shows as a wrongly lit face).
#
#   blender -b --python tools/models/render_sheet.py -- [--models public/models]
#           [--out /mnt/project-files/sundered-crowns/screens/models/contact_sheet.png] [--only a,b] [--tile 380]
#           [--samples 16] [--threads 2]
#
# Each tile shows the mesh twice from the game's camera direction (looking north, tilted 52 degrees from the
# vertical, a little from the west for a 3/4 view): left as placed (rotation 0), right turned by 180 degrees.
# Tinted parts are shown in a sample red mixed exactly like the game's shader does it. A last row lines the
# main figures up at their true relative scale. Labels and the montage come from ImageMagick.
import sys, os, json, math, struct, subprocess, shutil
import bpy
import numpy as np
from mathutils import Vector as V, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SAMPLE = (0.70, 0.13, 0.11)  # the sample nation colour (display RGB)
SUN = V((-0.62, 0.78, 0.95)).normalized()  # towards the game's sun: from the north-west, high (x east, y north)
FILL = V((0.3, -0.9, 0.5)).normalized()   # the game's soft fill light from the south


def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def args():
    import argparse
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--models', default=os.path.join(ROOT, 'public', 'models'))
    ap.add_argument('--out', default='/mnt/project-files/sundered-crowns/screens/models/contact_sheet.png')
    ap.add_argument('--only', default=None)
    ap.add_argument('--tile', type=int, default=380)
    ap.add_argument('--samples', type=int, default=16)
    ap.add_argument('--threads', type=int, default=2)
    ap.add_argument('--tiles-dir', default=None, help='keep the single tiles here')
    ap.add_argument('--no-lineup', action='store_true')
    return ap.parse_args(argv)


def load(models):
    meta = json.load(open(os.path.join(models, 'models.json')))
    raw = open(os.path.join(models, 'models.bin'), 'rb').read()
    nv, ni = meta['totalVertices'], meta['totalIndices']
    assert meta['stride'] == 40 and len(raw) == nv * 40 + ni * 4, 'size mismatch'
    verts = np.frombuffer(raw, dtype='<f4', count=nv * 10).reshape(nv, 10)
    idx = np.frombuffer(raw, dtype='<u4', count=ni, offset=nv * 40)
    return meta, verts, idx


def setup_scene(a):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = a.samples
    sc.cycles.use_denoising = False
    sc.cycles.use_adaptive_sampling = False
    sc.cycles.max_bounces = 3
    sc.cycles.tile_size = 256
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = a.threads
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.render.image_settings.file_format = 'PNG'
    w = bpy.data.worlds.new('w')
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.55, 0.62, 0.72, 1)
    bg.inputs[1].default_value = 0.55
    sc.world = w
    # sun and fill like the game's props shader
    for name, d, e, shadow in (('sun', SUN, 3.2, True), ('fill', FILL, 0.9, False)):
        ld = bpy.data.lights.new(name, 'SUN')
        ld.energy = e
        ld.angle = math.radians(4)
        ld.cycles.cast_shadow = shadow
        ob = bpy.data.objects.new(name, ld)
        ob.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        sc.collection.objects.link(ob)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    sc.collection.objects.link(cam)
    sc.camera = cam
    return sc, cam


def material(name, rgb=None, attr=None, rough=0.85):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    p.inputs['Roughness'].default_value = rough
    for key in ('Specular IOR Level', 'Specular'):
        if key in p.inputs:
            p.inputs[key].default_value = 0.15
    if attr:
        at = nt.nodes.new('ShaderNodeVertexColor')
        at.layer_name = attr
        nt.links.new(at.outputs['Color'], p.inputs['Base Color'])
    else:
        p.inputs['Base Color'].default_value = (*[srgb_to_lin(c) for c in rgb], 1)
    return m


def make_object(name, meta, verts, idx, mat, xoff=0.0, rot=0.0, scale=1.0):
    mm = meta['meshes'][name]
    v = verts[mm['vertexOffset']:mm['vertexOffset'] + mm['vertexCount']]
    ii = idx[mm['indexOffset']:mm['indexOffset'] + mm['indexCount']].reshape(-1, 3)
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(p) for p in v[:, 0:3].tolist()], [], [tuple(t) for t in ii.tolist()])
    me.update()
    col = me.color_attributes.new('col', 'FLOAT_COLOR', 'CORNER')
    nrm = []
    lin = np.vectorize(srgb_to_lin)
    rgb = v[:, 6:9].copy()
    tint = v[:, 9] > 0.5
    nc = np.array(SAMPLE)
    rgb[tint] = nc * 0.65 + rgb[tint] * nc * 1.25 * 0.35  # mix(nc, vcol * nc * 1.25, 0.35), as in the game
    rgb = np.clip(rgb, 0, 1)
    rgbl = lin(rgb)
    for li, loop in enumerate(me.loops):
        k = loop.vertex_index
        col.data[li].color = (rgbl[k, 0], rgbl[k, 1], rgbl[k, 2], 1.0)
        nrm.append(tuple(v[k, 3:6]))
    for p in me.polygons:
        p.use_smooth = True
    if hasattr(me, 'use_auto_smooth'):
        me.use_auto_smooth = True
    me.normals_split_custom_set(nrm)
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.location = (xoff, 0, 0)
    ob.rotation_euler = (0, 0, rot)
    ob.scale = (scale, scale, scale)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def frame(cam, obs, aspect, pad=1.1, el=math.radians(38), az=math.radians(-22)):
    """point the ortho camera from the south (a little west), elevation el, and fit all objects"""
    d = V((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))  # from target to camera
    rot = (-d).to_track_quat('-Z', 'Y')
    R = rot.to_matrix()
    pts = []
    for ob in obs:
        mw = ob.matrix_world
        pts += [mw @ vv.co for vv in ob.data.vertices]
    Ri = R.transposed()
    cs = [Ri @ p for p in pts]
    xs, ys = [c.x for c in cs], [c.y for c in cs]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    cam.data.ortho_scale = max(w, h * aspect) * pad
    zs = [c.z for c in cs]
    center = R @ V((cx, cy, max(zs) + 20.0))
    cam.location = center
    cam.rotation_euler = rot.to_euler()
    cam.data.clip_end = 200


def clear_props():
    for ob in list(bpy.data.objects):
        if ob.type == 'MESH':
            bpy.data.objects.remove(ob, do_unlink=True)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)


def add_ground(z, size, mat):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, z))
    g = bpy.context.active_object
    g.data.materials.append(mat)
    return g


def main():
    a = args()
    meta, verts, idx = load(a.models)
    names = list(meta['meshes'].keys())
    if a.only:
        names = [n for n in names if n in a.only.split(',')]
    sc, cam = setup_scene(a)
    mat = material('vc', attr='col')
    ground = material('ground', (0.58, 0.56, 0.50))
    water = material('water', (0.24, 0.36, 0.44), rough=0.4)
    tiles = a.tiles_dir or os.path.join(os.path.dirname(os.path.abspath(a.out)), '_tiles')
    os.makedirs(tiles, exist_ok=True)
    W, H = a.tile, int(a.tile * 0.72)
    sc.render.resolution_x, sc.render.resolution_y = W, H
    files = []
    for name in names:
        clear_props()
        mm = meta['meshes'][name]
        r = mm['radius']
        gap = max(0.35, r * 0.25)
        o1 = make_object(name, meta, verts, idx, mat, -r - gap / 2, 0.0)
        o2 = make_object(name, meta, verts, idx, mat, r + gap / 2, math.pi)
        ship = name.startswith('ship_')
        add_ground(0.0 if ship else -0.001, 60, water if ship else ground)
        frame(cam, [o1, o2], W / H)
        path = os.path.join(tiles, name + '.png')
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        tris = mm['indexCount'] // 3
        files.append((path, '%s  %d tris  h %.2f r %.2f' % (name, tris, mm['height'], mm['radius'])))
        print('rendered', name, flush=True)
    lineup = None
    if not a.no_lineup and not a.only:
        clear_props()
        row = ['tree_conifer_a', 'tree_broadleaf_a', 'bush', 'house_timber', 'house_steppe_yurt', 'tent', 'soldier_infantry',
               'soldier_pikeman', 'soldier_cavalry', 'cannon', 'banner_standard', 'church_gothic', 'ship_cog']
        x, obs = 0.0, []
        for n in row:
            r = meta['meshes'][n]['radius']
            x += r
            obs.append(make_object(n, meta, verts, idx, mat, x, 0.0))
            x += r + 0.15
        for ob in obs:
            ob.location.x -= x / 2
        add_ground(-0.001, 200, ground)
        sc.render.resolution_x, sc.render.resolution_y = W * 4, int(W * 0.9)
        frame(cam, obs, sc.render.resolution_x / sc.render.resolution_y, pad=1.04, az=0.0)
        lineup = os.path.join(tiles, '_lineup.png')
        sc.render.filepath = lineup
        bpy.ops.render.render(write_still=True)
    # montage with labels (ImageMagick)
    out = os.path.abspath(a.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    mont = shutil.which('montage')
    if not mont:
        print('montage (ImageMagick) not found; tiles are in', tiles)
        return
    cmd = [mont, '-background', '#2b2b2b', '-fill', '#f0f0f0', '-font', 'DejaVu-Sans', '-pointsize', '13']
    for path, label in files:
        cmd += ['-label', label, path]
    cols = 6 if len(files) > 6 else len(files)
    grid = out if not lineup else os.path.join(tiles, '_grid.png')
    cmd += ['-tile', '%dx' % cols, '-geometry', '+4+4', grid]
    subprocess.run(cmd, check=True)
    if lineup:
        lab = os.path.join(tiles, '_lineup_l.png')
        subprocess.run(['montage', '-background', '#2b2b2b', '-fill', '#f0f0f0', '-font', 'DejaVu-Sans', '-pointsize', '13', '-label',
                        'true relative scale, as placed (rotation 0), seen from the game camera', lineup, '-tile', '1x', '-geometry', '+4+4',
                        lab], check=True)
        subprocess.run(['convert', grid, lab, '-background', '#2b2b2b', '-gravity', 'center', '-append', out], check=True)
    print('wrote', out)


main()
