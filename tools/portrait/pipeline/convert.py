# Converts makehuman-js hair proxies (three.js JSON of MakeHuman's .mhclo
# hairs) into a small JSON our portrait builder reads: per vertex three
# reference vertices in head.bin's numbering, weights and offsets; triangles
# with per-corner UVs. Also writes a grey, alpha-kept texture.
# usage: python3 -I convert.py base.obj hairdir outdir name...
import json, sys, os, struct, zlib
base, hdir, out = sys.argv[1:4]
names = sys.argv[4:]
vs, faces, g = [], {}, None
for l in open(base):
    if l.startswith('v '):
        vs.append([float(t) for t in l.split()[1:4]])
    elif l.startswith('g '):
        g = l.split()[1]
    elif l.startswith('f '):
        faces.setdefault(g, []).append([int(t.split('/')[0]) - 1 for t in l.split()[1:]])
keep = lambda f: all(vs[i][1] > 3.4 and abs(vs[i][0]) < 2.85 for i in f)
parts = [ [f for f in faces['body'] if keep(f)], [f for f in faces['helper-tights'] if keep(f)], faces['helper-hair'], faces['helper-l-eye'], faces['helper-r-eye'] ]
used = sorted({i for p in parts for f in p for i in f})
remap = {o: n for n, o in enumerate(used)}
print('kept vertices', len(used))
os.makedirs(out, exist_ok=True)
for name in names:
    d = json.load(open(os.path.join(hdir, name, name + '.json')))
    refs, w, off = d['ref_vIdxs'], d['weights'], d['offsets']
    miss = sum(1 for r in refs for i in r if i not in remap)
    if miss and os.environ.get('NEAREST'):
        # refs on helpers head.bin does not keep (the eyelash helpers): the
        # nearest kept vertex instead, the offset taking up the difference
        import math
        kept = list(remap.keys())
        def near(i):
            p = vs[i]
            return min(kept, key=lambda k: (vs[k][0]-p[0])**2 + (vs[k][1]-p[1])**2 + (vs[k][2]-p[2])**2)
        nr, no = [], []
        for r, ww, o in zip(refs, w, off):
            r2 = [i if i in remap else near(i) for i in r]
            o2 = [o[a] + sum(ww[j] * (vs[r[j]][a] - vs[r2[j]][a]) for j in range(3)) for a in range(3)]
            nr.append(r2); no.append(o2)
        refs, off, miss = nr, no, 0
    # check: rebuild the vertices on the base mesh
    err = 0.0
    V = d['vertices']
    for k, (r, ww, o) in enumerate(zip(refs, w, off)):
        p = [sum(ww[j] * vs[r[j]][a] for j in range(3)) + o[a] for a in range(3)]
        err = max(err, max(abs(p[a] - V[3 * k + a]) for a in range(3)))
    F, uvs = d['faces'], d['uvs'][0]
    tris, i = [], 0
    while i < len(F):
        t = F[i]; i += 1
        quad = t & 1; nv = 4 if quad else 3
        vv = F[i:i + nv]; i += nv
        if t & 2: i += 1
        uu = None
        if t & 4: i += 1
        if t & 8:
            uu = F[i:i + nv]; i += nv
        if t & 16: i += 1
        if t & 32: i += nv
        if t & 64: i += 1
        if t & 128: i += nv
        uv = [[uvs[2 * u], uvs[2 * u + 1]] for u in uu]
        for a, b, c in ([(0, 1, 2), (0, 2, 3)] if quad else [(0, 1, 2)]):
            tris.append([vv[a], vv[b], vv[c], uv[a], uv[b], uv[c]])
    print(name, 'verts', len(refs), 'tris', len(tris), 'missing refs', miss, 'max fit error', round(err, 5))
    if miss:
        continue
    with open(os.path.join(out, name + '.txt'), 'w') as f:
        f.write(f'{len(refs)} {len(tris)}\n')
        for r, ww, o in zip(refs, w, off):
            f.write(' '.join(str(remap[i]) for i in r) + ' ' + ' '.join(f'{x:.6f}' for x in list(ww) + list(o)) + '\n')
        for t in tris:
            f.write(f'{t[0]} {t[1]} {t[2]} ' + ' '.join(f'{x:.6f}' for x in t[3] + t[4] + t[5]) + '\n')
