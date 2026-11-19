# Adds the bust to head.bin (round 124): the vertices of MakeHuman's body from the chest's cut down to the waist and
# out to the forearm (`hairlib.bust_faces`), after the head's own vertices, with what each of the file's morph
# targets does to them. Nothing that is there is renumbered or changed: every file bound to head.bin's vertices
# stays as it is. The new vertices are in no part that is drawn (body, tights, hair, eyes): they carry the cloth
# that is bound to them (`bust_bind.py`), and the builder moves them with the body as it does every vertex. Their
# triangles are kept as a part of their own, `bust`.
#
# usage: python3 -I extend_head.py base.obj targets head.bin.zst out.bin.zst
#   targets: MakeHuman's target files as they lie in its repository (github.com/makehumancommunity/makehuman,
#   makehuman/data/targets, CC0): <targets>/<name>.target for every target's name in head.bin
# Needs `pip install zstandard numpy`.
import os, struct, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import zstandard
from hairlib import bust_faces

base, tdir, src, out = sys.argv[1:5]
raw = zstandard.ZstdDecompressor().decompress(open(src, 'rb').read(), max_output_size=1 << 30)
assert raw[:8] == b'APOLHEAD' and struct.unpack_from('<I', raw, 8)[0] == 1, 'not a head file'
o = 12
def u32():
    global o
    o += 4
    return struct.unpack_from('<I', raw, o - 4)[0]
def name():
    global o
    l = raw[o]; o += 1 + l
    return raw[o - l:o].decode()
def u16s(c):
    global o
    o += 2 * c
    return np.frombuffer(raw, '<u2', c, o - 2 * c)
n = u32()
P = np.frombuffer(raw, '<f4', 3 * n, o).reshape(n, 3); o += 12 * n
parts = [(name(), [u16s(u32()) for _ in range(u32())]) for _ in range(u32())]
targets = [(name(), *(lambda c: (u16s(c), u16s(3 * c)))(u32())) for _ in range(u32())]
assert o == len(raw), 'head file: bytes left over'
assert all(k != 'bust' for k, _ in parts), 'this head has its bust already'

vs, faces, g = [], {}, None
for l in open(base):
    if l.startswith('v '):
        vs.append([float(t) for t in l.split()[1:4]])
    elif l.startswith('g '):
        g = l.split()[1]
    elif l.startswith('f '):
        faces.setdefault(g, []).append([int(t.split('/')[0]) - 1 for t in l.split()[1:]])
keep = lambda f: all(vs[i][1] > 3.4 and abs(vs[i][0]) < 2.85 for i in f)
kept = [[f for f in faces['body'] if keep(f)], [f for f in faces['helper-tights'] if keep(f)], faces['helper-hair'], faces['helper-l-eye'], faces['helper-r-eye']]
used = sorted({i for p in kept for f in p for i in f})
assert len(used) == n and np.abs(np.array(vs)[used] - P).max() < 1e-5, 'head.bin is not this base.obj as the pipeline cuts it'
bust = bust_faces(vs, faces['body'])
more = sorted({i for f in bust for i in f} - set(used))
remap = {v: k for k, v in enumerate(used + more)}
assert len(remap) < 65536
tris = [remap[i] for f in bust for k in range(1, len(f) - 1) for i in (f[0], f[k], f[k + 1])]
print('head', n, 'vertices; bust', len(more), 'more,', len(tris) // 3, 'triangles')

def packed_name(s):
    b = s.encode()
    return bytes([len(b)]) + b
w = [b'APOLHEAD', struct.pack('<II', 1, n + len(more)), P.tobytes(), np.array(vs, '<f4')[more].tobytes()]
w.append(struct.pack('<I', len(parts) + 1))
for k, levels in parts:
    w.append(packed_name(k) + struct.pack('<I', len(levels)))
    for lv in levels:
        w.append(struct.pack('<I', len(lv)) + lv.tobytes())
w.append(packed_name('bust') + struct.pack('<II', 1, len(tris)) + np.array(tris, '<u2').tobytes())
w.append(struct.pack('<I', len(targets)))
moved = 0
for k, ids, d in targets:
    # a target's file: a vertex of base.obj and how far it moves, a line each; head.bin holds the moves in 1/3000
    add_i, add_d = [], []
    for l in open(os.path.join(tdir, k + '.target')):
        t = l.split()
        if not t or t[0].startswith('#') or int(t[0]) not in remap or remap[int(t[0])] < n:
            continue
        q = [round(float(x) * 3000) for x in t[1:4]]
        if any(q):
            add_i.append(remap[int(t[0])]); add_d.append(q)
    moved += bool(add_i)
    w.append(packed_name(k) + struct.pack('<I', len(ids) + len(add_i)) + ids.tobytes() + np.array(add_i, '<u2').tobytes() + d.tobytes() + np.array(add_d, '<i2').reshape(-1, 3).tobytes())
print(moved, 'of', len(targets), 'targets move the bust')
data = b''.join(w)
open(out, 'wb').write(zstandard.ZstdCompressor(level=19).compress(data))
print(out, len(data), 'bytes,', os.path.getsize(out), 'packed')
