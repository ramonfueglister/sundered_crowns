"""The outlines of the atlas probe (probe.py): borders between labels as a distance field, labels rounded at their
borders, and lines smoothed by Chaikin's corner cutting.
"""

import numpy as np
from scipy import ndimage as ndi


def rounded(lab, r):
    """A label map whose borders are rounded: every pixel takes the label most common within r pixels of it (of the labels its neighbourhood holds)."""
    outl = lab.copy()
    best = np.zeros(lab.shape, np.float32)
    edge = ndi.maximum_filter(lab, 5) != ndi.minimum_filter(lab, 5)
    for v in np.unique(lab[edge]):
        m = ndi.gaussian_filter((lab == v).astype(np.float32), r)
        take = edge & (m > best)
        outl[take] = v
        best[take] = m[take]
    return outl


def border(lab):
    """Distance in pixels to the nearest border between two labels, from the pixels' centres."""
    e = np.zeros(lab.shape, bool)
    d = lab[:, 1:] != lab[:, :-1]
    e[:, 1:] |= d
    e[:, :-1] |= d
    d = lab[1:, :] != lab[:-1, :]
    e[1:, :] |= d
    e[:-1, :] |= d
    return ndi.distance_transform_edt(~e) + 0.5


def chaikin(p, n=2):
    for _ in range(n):
        if len(p) < 3:
            break
        q = [p[0]]
        for a, b in zip(p[:-1], p[1:]):
            q += [
                (0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]),
                (0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]),
            ]
        p = q + [p[-1]]
    return p
