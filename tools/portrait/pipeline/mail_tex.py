# Riveted mail (European 4-in-1) as a tiling image: colour with dark gaps and a normal map
# from the rings' height. One tile holds NX x NY rings; the uv of the aventail repeats it.
# usage: python3 -I mail_tex.py out_color.webp out_normal.webp [size] [NX] [NY]
import sys
import numpy as np
from PIL import Image

out_c, out_n = sys.argv[1:3]
S = int(sys.argv[3]) if len(sys.argv) > 3 else 512
NX = int(sys.argv[4]) if len(sys.argv) > 4 else 8
NY = int(sys.argv[5]) if len(sys.argv) > 5 else 16

y, x = np.mgrid[0:S, 0:S].astype(np.float64) + 0.5
dx, dy = S / NX, S / NY          # rings per row, rows (rows overlap: half offset)
R = dx * 0.44                    # ring radius (to the wire's middle)
w = dx * 0.085                   # wire radius
H = np.full((S, S), -1.0)
OCC = np.zeros((S, S))
for j in range(-1, NY + 1):
    for i in range(-1, NX + 2):
        cx = (i + 0.5 * (j % 2)) * dx
        cy = (j + 0.5) * dy
        tilt = 0.35 if j % 2 else -0.35
        for ox in (-S, 0, S):
            for oy in (-S, 0, S):
                px, py = x - cx - ox, (y - cy - oy) * 1.25   # rings seen a little from the side
                d = np.hypot(px, py)
                m = np.abs(d - R) < w
                if not m.any():
                    continue
                h = np.sqrt(np.clip(w * w - (d - R) ** 2, 0, None)) / w
                h = h + tilt * px / R * 0.6 + 0.15 * (py / R)   # lower rows lie under upper ones
                upd = m & (h > H)
                H[upd] = h[upd]
                OCC[m] += 1
gap = H < -0.5
H[gap] = -0.8
# normal map from the height (tangent space, y up as three.js expects)
k = 2.2
gx = (np.roll(H, -1, 1) - np.roll(H, 1, 1)) * 0.5 * k
gy = (np.roll(H, -1, 0) - np.roll(H, 1, 0)) * 0.5 * k
n = np.stack([-gx, gy, np.ones_like(H)], -1)
n /= np.linalg.norm(n, axis=-1, keepdims=True)
Image.fromarray(((n * 0.5 + 0.5) * 255).round().astype(np.uint8)).save(out_n, quality=90)
# colour: iron grey, darker in the gaps and where rings cross (shade), light on the tops
rng = np.random.default_rng(3)
base = np.array([0.46, 0.45, 0.43])
lum = np.where(gap, 0.08, 0.55 + 0.45 * np.clip(H, 0, 1))
lum = lum * (1 - 0.12 * np.clip(OCC - 1, 0, 2))
grime = 0.9 + 0.1 * rng.random((S // 16, S // 16))
grime = np.kron(grime, np.ones((16, 16)))[:S, :S]
c = np.clip(base[None, None] * (lum * grime)[..., None] * 1.5, 0, 1)
# the padded cloth under the mail shows through the gaps
c[gap] = np.array([0.16, 0.12, 0.08])
Image.fromarray((c * 255).round().astype(np.uint8)).save(out_c, quality=92)
# roughness/metal stay constant in the stage profile; alpha not needed (the aventail is a closed surface)
print('mail', S, NX, NY)
