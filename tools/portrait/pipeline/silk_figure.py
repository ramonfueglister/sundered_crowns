# (round 156) A figured silk: the plain silk's image (fabric_tex.py, kind silk) with a figure woven in in gold
# thread, as the silks of Lucca and Venice of the 14th century have it (lampas: a ground weave and a second weft
# that makes the figure). The figure is written into the image's covering (alpha): 1 is ground, 0 is gold thread.
# The stage draws the gold (src/portrait/materials.ts, an image named `_figured`). In the normal map the figure
# stands a little over the ground: its weft lies on the cloth.
#
# The figure: palmettes in rows, each row set off by half a step against the one under it, and between them a
# sprig of two leaves. After the words of three museums' records, read 21.11.2026 as accounts of the pages, no
# picture looked at: the Cleveland Museum of Art, 1926.507 (Italy, 1300s, silk and gold thread, lampas): "the
# paired eagles and gazelles flanking concentric bulb-shaped palmettes", like pieces dated 1334 to 1361; the
# same museum's 1977.14 (Italy, 1350 to 1400): "large palmette leaves", deer, birds and dogs amid vines; the
# Victoria and Albert Museum, O261087 (Lucca, 1300 to 1350): "scrolling vines, squirrels and deer". The beasts
# and birds are NOT drawn (a palmette and a leaf can be written as a formula; a gazelle cannot), and no record
# gives a repeat's measure: the palmette's form, every size and the half step are PLACEHOLDER, by eye.
# usage: python3 -I silk_figure.py silk.png silk_n.png out.png out_n.png
import os
import sys
import numpy as np
from PIL import Image
src, src_n, out, out_n = sys.argv[1:5]
# how many palmettes across the tile and how many rows up it (the tile is about 22 cm of cloth on a gown: 3.7 cm
# from palmette to palmette), a palmette's height and half breadth and a leaf's length as shares of that step,
# and how far the figure stands over the ground (in the normal map's own measure)
# (round 169) Six palmettes across and up the tile for four, each a little larger in its step and the sprig a
# third larger (0.86, 0.68, 0.32 for 0.8, 0.62, 0.24): the figure covers 27 in a hundred of the cloth for 20. At
# 5.5 cm from palmette to palmette four of them lay across a chest, far apart, as printed on the cloth; the
# reference's figured gowns have six or seven small figures across a chest, close together. PLACEHOLDER, by eye
# beside two of its gowns; no record read gives a repeat's measure.
COLS, ROWS = (int(os.environ.get(k, d)) for k, d in (('COLS', '6'), ('ROWS', '6')))
TALL, WIDE, LEAF, RISE = (float(os.environ.get(k, d)) for k, d in (('TALL', '0.86'), ('WIDE', '0.68'), ('LEAF', '0.32'), ('RISE', '0.5')))
silk = np.asarray(Image.open(src).convert('RGBA')).astype(np.float32) / 255
S = silk.shape[0]
Z = 2 * S                                       # drawn at twice the size and halved: soft edges
v, u = np.meshgrid((np.arange(Z) + 0.5) / Z, (np.arange(Z) + 0.5) / Z, indexing='ij')
row = np.floor(v * ROWS)
# within a step: x from the palmette's upright (-0.5..0.5), y from the step's lower edge (0..1). A cloth's file
# holds 1 - v and the stage draws v downwards (round 152): up the cloth is up the image's rows as numpy counts
# them, and the palmette's point is at the larger v
x = (u * COLS + 0.5 * (row % 2)) % 1.0 - 0.5
y = v * ROWS - row
def band(d, lo, hi, soft=0.02):
    return np.clip((d - lo) / soft, 0, 1) * np.clip((hi - d) / soft, 0, 1)
# the palmette: a bulb, round below and pointed above, standing on its foot. Its half breadth at the share s of
# its height is sqrt(s) (1 - s), widest a third up. Within it stand smaller bulbs on the same foot: the figure
# is the outermost bulb without the next, the third without the fourth, and the innermost whole
s = (y - (1 - TALL) / 2) / TALL
def bulb(k, soft=0.06):
    t = np.clip(s / k, 1e-6, 1)
    return np.clip((1 - np.abs(x) / (k * WIDE * np.sqrt(t) * (1 - t) + 1e-6)) / soft, 0, 1) * (s > 0) * (s < k)
figure = np.maximum.reduce([bulb(1.0) * (1 - bulb(0.8)), bulb(0.6) * (1 - bulb(0.42)), bulb(0.24)])
# the sprig, half a step to the side of the palmettes: a stem, two leaves slanting up from it and a bud on top
xs = (x + 1.0) % 1.0 - 0.5                      # from the middle between two palmettes
ys = y - 0.42
stem = band(np.abs(xs), -1, 0.012, 0.01) * band(ys, -0.6 * LEAF, 0.75 * LEAF, 0.01)
bud = band(np.hypot(xs, ys - 0.95 * LEAF), -1, 0.2 * LEAF, 0.015)
leaves = 0
for side in (-1, 1):
    # a leaf from the stem out and up by 50 degrees from the level: pointed at both ends
    c, sn = np.cos(np.radians(50)), np.sin(np.radians(50))
    along = (side * xs * c + ys * sn) / LEAF
    across = (-side * xs * sn + ys * c) / LEAF
    leaves = np.maximum(leaves, np.clip((1 - np.abs(across) / (0.3 * np.sin(np.pi * np.clip(along, 1e-6, 1)) + 1e-6)) / 0.15, 0, 1) * (along > 0) * (along < 1))
figure = np.clip(np.maximum.reduce([figure, stem, bud, leaves]), 0, 1)
figure = figure.reshape(S, 2, S, 2).mean(axis=(1, 3))
silk[..., 3] = 1 - figure
Image.fromarray((silk * 255 + 0.5).astype(np.uint8), 'RGBA').save(out)
n = np.asarray(Image.open(src_n).convert('RGB')).astype(np.float32) / 255 * 2 - 1
soft = figure.copy()
for _ in range(2):                              # a blur that wraps round the tile: the figure's edge is a slope
    soft = (soft + np.roll(soft, 1, 0) + np.roll(soft, -1, 0) + np.roll(soft, 1, 1) + np.roll(soft, -1, 1)) / 5
n[..., 0] -= RISE * (np.roll(soft, -1, 1) - np.roll(soft, 1, 1))
n[..., 1] += RISE * (np.roll(soft, -1, 0) - np.roll(soft, 1, 0))
n /= np.linalg.norm(n, axis=2, keepdims=True)
Image.fromarray(((n * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8), 'RGB').save(out_n)
print('figure covers', figure.mean().round(3), 'of the cloth;', COLS, 'by', ROWS, 'palmettes a tile; normal tilt mean', np.degrees(np.arccos(np.clip(n[..., 2], -1, 1))).mean().round(1), 'deg')
