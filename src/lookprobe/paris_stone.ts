// The stone of the Paris probe (PROTOTYPE, 22 Nov 2026): what Ramon's reference picture of the Île de la Cité builds
// its quays, bridges, town wall and towers of: large ashlar in warm pale stone, each block with its own tone and a
// dark joint round it, under roofs of dark slate. Colours and sizes are read off that picture: OWN RULE for the
// prototype.
import { type Wall, pane, wallOf } from '../buildings';
import { type Batch, type RGB, hash2, rgb, shade } from './batch';

/** the stone, lit as the picture's (243, 198, 161), and the slate of the roofs */
export const STONE = rgb(0xd3b69b),
  SLATE = rgb(0x4f505e);

/** a rectangle of the ground: x0, z0, x1, z1 */
export type Rect = readonly [number, number, number, number];

/**
 * Large ashlar on a wall from `y0` to `y1`: stones a block long and half a block high in running bond, a little
 * apart, each in its own tone; the wall behind them shows as the joints. `keep` is asked about the middle of each
 * stone and leaves out those it refuses, as where an arch opens.
 */
export function courses(
  b: Batch,
  w: Wall,
  y0: number,
  y1: number,
  c: RGB,
  seed: number,
  keep?: (t: number, y: number) => boolean,
) {
  const high = 0.5,
    joint = 0.06;
  for (let k = 0; y0 + k * high < y1 - 2 * joint; k++) {
    const ya = y0 + k * high,
      yb = Math.min(y1, ya + high);
    for (let i = -1; i < w.len; i++) {
      const t0 = Math.max(0, i + (k % 2) * 0.5 + joint / 2),
        t1 = Math.min(w.len, i + 1 + (k % 2) * 0.5 - joint / 2);
      if (t1 - t0 < joint || (keep && !keep((t0 + t1) / 2, (ya + yb) / 2))) continue;
      pane(b, w, t0, ya + joint / 2, t1, yb - joint / 2, shade(c, 0.93 + 0.14 * hash2(i, k, seed)), 0.02);
    }
  }
}

/** A box of stone, in large ashlar on the two sides the picture's camera sees (+x and +z). */
export function masonry(b: Batch, at: Rect, y0: number, y1: number, seed: number) {
  const [x0, z0, x1, z1] = at;
  b.box(x0, y0, z0, x1, y1, z1, shade(STONE, 0.7), { top: shade(STONE, 0.95) });
  courses(b, wallOf(...at, 'px'), y0, y1, STONE, seed);
  courses(b, wallOf(...at, 'pz'), y0, y1, STONE, seed + 1);
}

/** A pyramid on the square of half side `s` round (xc, zc) at `y`, `h` high: four slopes up to one point. */
export function pyramid(b: Batch, xc: number, zc: number, s: number, y: number, h: number, c: RGB) {
  const corners: [number, number][] = [
    [xc - s, zc - s],
    [xc - s, zc + s],
    [xc + s, zc + s],
    [xc + s, zc - s],
  ];
  corners.forEach(([ax, az], k) => {
    const [bx, bz] = corners[(k + 1) % 4];
    b.tri([ax, y, az], [bx, y, bz], [xc, y + h, zc], c, c, shade(c, 1.15), [(ax + bx) / 2 - xc, s, (az + bz) / 2 - zc]);
  });
}
