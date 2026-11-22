"""The masks of the Euratlas entity pages for tools/history/borders/euratlas_places.py (step 2 of its method): each
page outlines one entity on the full-Europe frame; the outline is filled by a ray-parity inside test.
"""

import os

import numpy as np
from PIL import Image
from scipy import ndimage as nd

SEA = np.array([230, 233, 242])


DIRS = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]


def inside_vote(cm, wall, anchor, y, x):
    H, W = wall.shape
    votes = []
    for dy, dx in DIRS:
        cy, cx, cr, inw = y, x, 0, False
        while 0 <= cy < H and 0 <= cx < W:
            w = wall[cy, cx]
            if w and not inw:
                cr += 1
            inw = w
            if not w and anchor[cy, cx] and not cm[cy, cx]:
                votes.append(cr % 2)
                break
            cy += dy
            cx += dx
    return votes


def lines_of(a, base):
    d = np.abs(a - base).sum(-1)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return d, {
        'red': (d > 60) & (r > 150) & (g < 120) & (b < 120),
        'grn': (d > 60) & (g > 140) & (g - r > 25) & (g - b > 35),
    }


def build_masks(d, ents, base):
    H, W = base.shape[:2]
    sea18 = np.abs(base - SEA).sum(-1) < 18
    lab, _ = nd.label(sea18)
    sz = np.bincount(lab.ravel())
    anchor18 = np.isin(lab, np.where(sz > 40)[0][1:])
    sea = np.abs(base - SEA).sum(-1) < 25
    white = base.min(-1) > 247
    lab, _ = nd.label(sea | white)
    sz = np.bincount(lab.ravel())
    anchor25 = np.isin(lab, np.where(sz > 40)[0][1:])
    masks = {}
    for e, v in ents.items():
        a = np.asarray(Image.open(os.path.join(d, 'entities', f'entity_{e}.jpg')).convert('RGB')).astype(int)
        dd, lines = lines_of(a, base)
        res = {}
        # seg2: fill outlines by parity
        for kind, line in lines.items():
            if line.sum() < 5:
                continue
            wall = nd.binary_dilation(line, iterations=1)
            lab, n = nd.label(~wall)
            m = np.zeros((H, W), bool)
            objs = nd.find_objects(lab)
            for c in range(1, n + 1):
                sl = objs[c - 1]
                cm = lab[sl] == c
                s = cm.sum()
                if s > H * W * 0.5 or (cm & anchor18[sl]).sum() > 0.5 * s:
                    continue
                dt = nd.distance_transform_edt(cm)
                iy, ix = np.unravel_index(dt.argmax(), dt.shape)
                full = np.zeros((H, W), bool)
                full[sl] = cm
                vts = inside_vote(full, wall, anchor18, iy + sl[0].start, ix + sl[1].start)
                if vts and sum(vts) * 2 > len(vts):
                    m |= full
            m |= wall & nd.binary_dilation(m, iterations=2)
            m |= line
            res[kind] = m
        # tint: green tint touching the green outline
        if 'grn' in res:
            df = a - base
            tint = (dd > 30) & (df[..., 1] > 12) & (df[..., 1] - df[..., 0] > 8) & (df[..., 1] - df[..., 2] > 8)
            tint = nd.binary_opening(tint, iterations=1) | lines['grn']
            lab, n = nd.label(tint)
            touch = np.unique(lab[nd.binary_dilation(res['grn'], iterations=1) & tint])
            res['grn'] |= np.isin(lab, touch[touch > 0])
        # refill: thin outlines without interior
        for kk, m in list(res.items()):
            line = lines[kk]
            ln = line.sum()
            interior = m & ~nd.binary_dilation(line, iterations=1)
            if interior.sum() >= 0.15 * ln or ln < 30:
                continue
            for it in (2, 3):
                wall = nd.binary_dilation(line, iterations=it)
                lab, n = nd.label(~wall)
                sz = np.bincount(lab.ravel())
                sz[0] = 0
                big = sz.argmax()
                add = np.zeros((H, W), bool)
                for c in range(1, n + 1):
                    if c == big or sz[c] < 3 or sz[c] > 0.3 * H * W:
                        continue
                    cm = lab == c
                    if (cm & sea).sum() > 0.5 * sz[c]:
                        continue
                    ring = nd.binary_dilation(cm, iterations=it + 1) & ~cm
                    if (ring & wall).sum() < 0.8 * ring.sum():
                        continue
                    add |= cm
                if add.sum() > 0:
                    if add.sum() <= 6 * ln:
                        res[kk] = m | (nd.binary_dilation(add, iterations=1) & ~sea) | add
                    break
        # fixfill: flat-colour areas inside a red outline
        if 'red' in res and v['status'] != 'D' and lines['red'].sum() >= 300:
            line = lines['red']
            wall = nd.binary_dilation(line, iterations=1)
            m = res['red']
            ring = nd.binary_dilation(line, iterations=3) & ~wall & ~sea & ~white & (base.sum(-1) > 250)
            if ring.sum():
                keys, cnt = np.unique(base[ring] // 12, axis=0, return_counts=True)
                for ci in np.argsort(-cnt)[:8]:
                    c = keys[ci] * 12 + 6
                    if np.abs(c - SEA).sum() < 45 or cnt[ci] < 0.02 * ring.sum():
                        continue
                    same = nd.binary_closing(np.abs(base - c).sum(-1) < 30, iterations=1) & ~wall
                    lab, n = nd.label(same)
                    for comp in range(1, n + 1):
                        cm = lab == comp
                        if cm.sum() < 10 or (cm & m).sum() == cm.sum():
                            continue
                        dt = nd.distance_transform_edt(cm)
                        ys, xs = np.nonzero(dt >= max(1, dt.max() * 0.5))
                        pick = np.linspace(0, len(ys) - 1, min(5, len(ys))).astype(int)
                        votes = sum((inside_vote(cm, wall, anchor25, ys[k], xs[k]) for k in pick), [])
                        if len(votes) >= 3 and sum(votes) > 0.7 * len(votes):
                            m = m | cm
                res['red'] = m
        masks[e] = res
        print(f'  mask {e} {v["short"]}: ' + ', '.join(f'{k} {int(x.sum())}' for k, x in res.items()), flush=True)
    return masks
