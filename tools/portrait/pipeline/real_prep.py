# Per kept head.bin vertex all its UVs (base.obj corners), and skin textures
# normalised by the face's mean colour per channel (x 0.88), so the genes'
# skin colour tints them. usage: real_prep.py base.obj skins_dir out_dir
import sys, os
import numpy as np
from PIL import Image
base, skins, out = sys.argv[1:4]
vs, vts, faces, g = [], [], {}, None
for l in open(base):
    if l.startswith('v '):
        vs.append([float(t) for t in l.split()[1:4]])
    elif l.startswith('vt '):
        vts.append([float(t) for t in l.split()[1:3]])
    elif l.startswith('g '):
        g = l.split()[1]
    elif l.startswith('f '):
        faces.setdefault(g, []).append([tuple(int(x) - 1 if x else -1 for x in (t.split('/') + [''])[:2]) for t in l.split()[1:]])
keep = lambda f: all(vs[i][1] > 3.4 and abs(vs[i][0]) < 2.85 for i, _ in f)
parts = [[f for f in faces['body'] if keep(f)], [f for f in faces['helper-tights'] if keep(f)], faces['helper-hair'], faces['helper-l-eye'], faces['helper-r-eye']]
used = sorted({i for p in parts for f in p for i, _ in f})
remap = {o: n for n, o in enumerate(used)}
uvs = [[] for _ in used]
for f in parts[0]:
    for i, t in f:
        if t >= 0:
            uv = tuple(round(c, 5) for c in vts[t])
            if uv not in uvs[remap[i]]:
                uvs[remap[i]].append(uv)
with open(os.path.join(out, 'uvs.txt'), 'w') as fo:
    for u in uvs:
        fo.write(' '.join(f'{a:.5f} {b:.5f}' for a, b in u) + '\n')
print('vertices', len(used), 'with uv', sum(1 for u in uvs if u), 'multi', sum(1 for u in uvs if len(u) > 1))
# the face: front of the head
face_uv = [uvs[remap[i]][0] for i in used if uvs[remap[i]] and vs[i][1] > 7.0 and vs[i][1] < 8.0 and vs[i][2] > 0.6 and abs(vs[i][0]) < 0.6]
print('face uvs', len(face_uv))
for age in ['young', 'middleage', 'old']:
    for sex in ['male', 'female']:
        d = os.path.join(skins, f'{age}_caucasian_{sex}', 'textures')
        f = [x for x in os.listdir(d) if 'diffuse' in x and 'special' not in x][0]
        a = np.asarray(Image.open(os.path.join(d, f)).convert('RGB')).astype(np.float32) / 255
        h, w = a.shape[:2]
        px = np.array([a[min(h - 1, int((1 - v) * h)), min(w - 1, int(u * w))] for u, v in face_uv])
        m = px.mean(0)
        o = np.clip((1 + 0.5 * (a / m - 1)) * 0.88, 0, 1)
        Image.fromarray((o * 255).astype(np.uint8)).save(os.path.join(out, f'skin_{age}_{sex}.png'))
        print(age, sex, f, 'face mean', m.round(3))
