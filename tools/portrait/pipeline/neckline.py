# A neckline that is cut along a line (round 110), for `tunic_sim.py`: the line, and the cut along it.
# `NECKLINE=half breadth,front,back,shoulder`: the opening reaches that far out on either shoulder, where its edge
# lies at the shoulder's height; from there it falls to its height in the middle of the front and of the back
# (base units: 1 is 10 cm, the collarbones' notch lies near 5.7, the shoulders' top near 5.8). In front `NDIP`
# deepens it in the middle, over `NDIPW` to either side: a notch, a slit, a V. `NROUND=1` (round 149): the line falls
# from the shoulder as a quarter of an ellipse, steep at the shoulder and flat in the middle (a boat's shape), in
# place of the S between two flat ends, which is a tub with a ledge on either shoulder when it is cut wide and low.
import os
import numpy as np
import bmesh

WIDE = [float(t) for t in os.environ.get('NECKLINE', '').split(',') if t]
NDIP = float(os.environ.get('NDIP', '0.12'))
NDIPW = float(os.environ.get('NDIPW', '0.6'))
NROUND = os.environ.get('NROUND', '0') == '1'
S = 0.1  # base units to Blender's metres; Blender is z-up: the base's (x, y, z) is its (x, -z, y)


def line(c):
    """The height the cloth reaches up to at a place of the body (base units)."""
    x, y, z = c
    w, yf, yb, ys = WIDE
    if abs(x) >= w:
        return 6.3
    g = abs(x) / w
    g = 1 - (1 - g * g) ** 0.5 if NROUND else g * g * (3 - 2 * g)
    low = yf if z > 0.1 else yb
    return low + (ys - low) * g - (NDIP * max(0, 1 - abs(x) / NDIPW) if z > 0.25 else 0)


def ok(c):
    return c[1] <= 6.3 and c[1] < line(c)


def at(v):
    return (v.co.x / S, v.co.z / S, -v.co.y / S)


def cut(bm):
    """Cuts the opening out of a mesh (Blender's coordinates): finer once more within 2.5 cm of the line, the faces
    above it taken out, and the points of the edge that leaves moved onto the line. That edge is the mesh's faces, a
    zigzag: each of its points goes two steps down the slope of "how far below the line", within the plane of the
    cloth there, 1.2 cm at most. Returns the edge's points."""
    near = [e for e in bm.edges if all(abs(line(at(v)) - at(v)[1]) < 0.25 for v in e.verts)]
    bmesh.ops.subdivide_edges(bm, edges=near, cuts=1, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    was = {v for v in bm.verts if v.is_boundary}
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(ok(at(v)) for v in f.verts)], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.normal_update()
    edge = [v for v in bm.verts if v.is_boundary and v not in was]
    for v in edge:
        for _ in range(2):
            c = at(v)
            if abs(c[0]) >= WIDE[0] - 0.02:
                break
            e = 0.01
            gx = (line((c[0] + e, c[1], c[2])) - line((c[0] - e, c[1], c[2]))) / (2 * e)
            g = np.array([gx, 0.0, -1.0])       # the slope (gx, -1, 0) of the base's (x, y, z) in Blender's axes
            n = np.array(v.normal)
            gt = g - (g @ n) * n
            if gt @ gt < 1e-6:
                break
            step = -(line(c) - c[1]) * gt / (gt @ gt) * S
            k = min(1.0, 0.012 / (np.linalg.norm(step) + 1e-12))
            v.co.x += step[0] * k; v.co.y += step[1] * k; v.co.z += step[2] * k
    return edge
