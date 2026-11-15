# UV-space position map of the base head: for each texel of an N x N atlas,
# the 3D point of the base mesh (NaN where no face). Saves pos.npy.
# usage: python3 -I uvpos.py base.obj N out.npy
import sys
import numpy as np
base, N, outp = sys.argv[1], int(sys.argv[2]), sys.argv[3]
vs, vts, faces, g = [], [], [], None
for l in open(base):
    if l.startswith('v '):
        vs.append([float(t) for t in l.split()[1:4]])
    elif l.startswith('vt '):
        vts.append([float(t) for t in l.split()[1:3]])
    elif l.startswith('g '):
        g = l.split()[1]
    elif l.startswith('f ') and g == 'body':
        faces.append([tuple(int(x) - 1 for x in t.split('/')[:2]) for t in l.split()[1:]])
V, T = np.array(vs), np.array(vts)
pos = np.full((N, N, 3), np.nan, np.float32)
for f in faces:
    if min(V[i][1] for i, _ in f) < 5.6:
        continue
    for k in range(1, len(f) - 1):
        tri = [f[0], f[k], f[k + 1]]
        P = np.array([V[i] for i, _ in tri])
        U = np.array([[T[t][0] * N, (1 - T[t][1]) * N] for _, t in tri])
        x0, y0 = np.floor(U.min(0)).astype(int)
        x1, y1 = np.ceil(U.max(0)).astype(int)
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, N - 1), min(y1, N - 1)
        if x1 < x0 or y1 < y0:
            continue
        yy, xx = np.mgrid[y0:y1 + 1, x0:x1 + 1] + 0.5
        a, b, c = U
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-12:
            continue
        l0 = ((b[1] - c[1]) * (xx - c[0]) + (c[0] - b[0]) * (yy - c[1])) / d
        l1 = ((c[1] - a[1]) * (xx - c[0]) + (a[0] - c[0]) * (yy - c[1])) / d
        l2 = 1 - l0 - l1
        m = (l0 >= -0.01) & (l1 >= -0.01) & (l2 >= -0.01)
        p = l0[..., None] * P[0] + l1[..., None] * P[1] + l2[..., None] * P[2]
        sub = pos[y0:y1 + 1, x0:x1 + 1]
        sub[m] = p[m]
np.save(outp, pos)
ok = ~np.isnan(pos[..., 0])
print('texels', int(ok.sum()), 'y range', np.nanmin(pos[..., 1]), np.nanmax(pos[..., 1]))
