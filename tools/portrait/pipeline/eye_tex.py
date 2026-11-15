# Eyeball texture atlas: 4x4 cells, one iris colour each along the game's
# eye colour chain (look.rs eye_colour). Each cell maps the whole eyeball by
# azimuthal equidistant projection around the gaze axis: centre = pupil,
# cell edge = back of the eye (180 deg). Left in a cell = towards the nose.
# Iris 27.5 deg (the faceted eye 29), pupil 9.5 deg, limbal ring at the iris
# edge, radial fibres and a lighter collarette; sclera off-white, pinker
# towards the corners, a few faint vessels. Anatomy after Lefohn et al.
# (2003), "An ocularist's approach to human iris synthesis", not verified
# online; all colours and widths PLACEHOLDER.
# usage: python3 eye_tex.py out.png [cell_px]
import sys
import numpy as np
from PIL import Image
out = sys.argv[1]
C = int(sys.argv[2]) if len(sys.argv) > 2 else 512
CHAIN = ["#2e1c10", "#4f3219", "#6b5a2e", "#5b6b4a", "#55788a", "#6f92b8"]
hexc = lambda h: np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255
def chain(t):
    t = min(max(t, 0.0), 1.0) * (len(CHAIN) - 1)
    i = min(int(t), len(CHAIN) - 2)
    return hexc(CHAIN[i]) * (1 - (t - i)) + hexc(CHAIN[i + 1]) * (t - i)
rng = np.random.default_rng(11)
yy, xx = (np.mgrid[0:C, 0:C].astype(np.float32) + 0.5) / C - 0.5
r = np.hypot(xx, yy)
th = r * 360.0                     # degrees from the gaze axis
ph = np.arctan2(-yy, xx)           # 0 = temporal side... x<0 nasal
def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)
def angnoise(freq, seed, rr=None):
    """noise around the circle (periodic in phi), optionally drifting with r"""
    g = np.random.default_rng(seed)
    k = np.arange(1, freq + 1)
    amp = g.normal(0, 1, freq) / np.sqrt(k)
    pha = g.random(freq) * 2 * np.pi
    drift = g.normal(0, 1, freq) * 0.0
    v = np.zeros_like(ph)
    for a, f, p in zip(amp, k, pha):
        v += a * np.cos(f * ph + p + (0 if rr is None else rr * (1 + f % 3)))
    return v / np.abs(v).max()
atlas = np.zeros((4 * C, 4 * C, 3), np.float32)
for i in range(16):
    t = i / 15
    base = chain(t) ** 1.25         # the faceted eye's colours read darker in the game
    light = float(base.mean())
    blue = base[2] > base[0]
    # sclera: off-white, warmer and pinker towards the corners and the back
    corner = np.abs(np.cos(ph)) ** 2 * ss(35, 75, th)
    scl = hexc("#ddd3c6") * (1 - 0.10 * ss(40, 110, th))[..., None]
    scl = scl * (1 - 0.35 * corner[..., None]) + hexc("#d9a69a") * (0.35 * corner)[..., None]
    nasal = (ss(0.0, -0.12, xx) * ss(40, 70, th))[..., None]
    scl = scl * (1 - 0.15 * nasal) + hexc("#d58f86") * (0.15 * nasal)
    # faint vessels from the corners towards the iris
    for side in (0.0, np.pi):
        for k in range(5):
            a0 = side + rng.normal(0, 0.35)
            wig = 0.12 * np.sin(th / 9 + rng.random() * 6)
            d = np.abs(np.angle(np.exp(1j * (ph - a0 - wig))))
            w = 0.006 + 0.004 * rng.random()
            vis = np.exp(-(d / w) ** 2) * ss(34, 55, th) * (1 - ss(85, 110, th)) * 0.18
            scl = scl * (1 - vis[..., None]) + hexc("#b0544c") * vis[..., None]
    # iris: radial fibres, darker crypts, lighter collarette near the pupil
    fib = 0.6 * angnoise(90, 100 + i, th / 6) + 0.4 * angnoise(240, 200 + i)
    irr = base * (1 + 0.22 * fib)[..., None]
    col_r = ss(9.5, 12, th) * (1 - ss(15, 19, th))
    amber = hexc("#9a7a3a") if blue else base * 1.5
    irr = irr * (1 - 0.35 * col_r[..., None]) + np.clip(amber, 0, 1) * (0.35 * col_r)[..., None]
    crypt = np.clip(angnoise(40, 300 + i, th / 4), 0.55, 1) - 0.55
    irr = irr * (1 - 0.8 * crypt * ss(12, 16, th) * (1 - ss(22, 25, th)))[..., None]
    # limbal ring: the iris darkens towards its edge and blends softly into the sclera
    limb = ss(19.5, 26.5, th)
    irr = irr * (1 - (0.55 if light < 0.35 else 0.6) * limb)[..., None]
    edge = ss(26, 29, th)
    col = irr * (1 - edge[..., None]) + scl * edge[..., None]
    # pupil, soft edged
    pup = 1 - ss(8.6, 10.2, th)
    col = col * (1 - pup[..., None]) + hexc("#060403") * pup[..., None]
    cy, cx = divmod(i, 4)
    atlas[cy * C:(cy + 1) * C, cx * C:(cx + 1) * C] = np.clip(col, 0, 1)
Image.fromarray((atlas * 255).round().astype(np.uint8)).save(out)
print(out, atlas.shape)
