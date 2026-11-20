// The hand-made parts of the fine-block house that the grammar (grammar.ts) sets on a roof: the tiles, a tiled gable,
// the frustum of a chimney or a turret, chimneys and the roof terrace (altana); those of the wall are in parts.ts.
// Sizes are in fine blocks (VOXEL, measured on the reference class image,
// traditions/measures/referenzklasse_nahsicht.json); positions in blocks.
import { type Batch, type RGB, type V3, hash2, shade } from '../../lookprobe/batch';
import { VOXEL as V } from './style';

/** the tiles' shades: the darkest, and how much lighter the lightest is */
export type Shades = readonly [number, number];
const SHADES: Shades = [0.88, 0.2];

const lerp3 = (a: V3, b: V3, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * A slope of tiles, each a cube of one fine block set on the slope from the eaves edge e0 → e1 up to the ridge edge
 * r0 → r1: the plate of tile cubes of the reference class. Every cube reaches down under the slope and stands a
 * little higher or lower on it, a touch lighter or darker; the cubes along the eaves, the verges and the ridge stand
 * a block higher: the raised rim of the plate. Only the faces that can be seen are drawn: the top and the downhill
 * face of every cube (the step to the row below), and all four sides of the rim cubes (`verges` false: no rim at the sides); an inner cube's other sides
 * are hidden by its neighbours, since the gap between them is a twentieth of a block.
 */
export function tiles(
  b: Batch,
  e0: V3,
  e1: V3,
  r0: V3,
  r1: V3,
  c: RGB,
  seed: number,
  verges = true,
  [low, spread]: Shades = SHADES,
) {
  const cols = Math.max(1, Math.round(Math.hypot(e1[0] - e0[0], e1[2] - e0[2]) / V)),
    rows = Math.max(1, Math.round(Math.hypot(r0[0] - e0[0], r0[2] - e0[2]) / V));
  const at = (u: number, t: number): V3 => lerp3(lerp3(e0, e1, u), lerp3(r0, r1, u), t);
  // the way down the slope, towards the eaves: one of the ground axes
  const dx = e0[0] - r0[0],
    dz = e0[2] - r0[2],
    down = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'px' : 'nx') : dz > 0 ? 'pz' : 'nz';
  for (let k = 0; k < rows; k++)
    for (let j = 0; j < cols; j++) {
      const a = at(j / cols, k / rows),
        d = at((j + 1) / cols, (k + 1) / rows),
        h = hash2(j, k, seed),
        col = shade(c, low + spread * hash2(j, k, seed + 5));
      const rim = (verges && (j === 0 || j === cols - 1)) || k === 0 || k === rows - 1,
        top = Math.max(a[1], d[1]) + V * (0.15 + 0.2 * h) + (rim ? V * 0.7 : 0),
        g = V * 0.05;
      const x0 = Math.min(a[0], d[0]) + g,
        x1 = Math.max(a[0], d[0]) - g,
        z0 = Math.min(a[2], d[2]) + g,
        z1 = Math.max(a[2], d[2]) - g,
        y0 = Math.min(a[1], d[1]) - V * 0.5;
      if (rim) {
        b.box(x0, y0, z0, x1, top, z1, col, { top: shade(col, 1.12) });
        continue;
      }
      b.quad([x0, top, z0], [x0, top, z1], [x1, top, z1], [x1, top, z0], shade(col, 1.12), [0, 1, 0]);
      if (down === 'px') b.quad([x1, y0, z0], [x1, y0, z1], [x1, top, z1], [x1, top, z0], col, [1, 0, 0]);
      else if (down === 'nx') b.quad([x0, y0, z1], [x0, y0, z0], [x0, top, z0], [x0, top, z1], col, [-1, 0, 0]);
      else if (down === 'pz') b.quad([x0, y0, z1], [x1, y0, z1], [x1, top, z1], [x0, top, z1], col, [0, 0, 1]);
      else b.quad([x1, y0, z0], [x0, y0, z0], [x0, top, z0], [x1, top, z0], col, [0, 0, -1]);
    }
}

/**
 * A gable roof of fine-block tiles over x0 … z1 at height y, ridge along the longer side rising by `rise`: a dark
 * slope under the plate of cubes, the gable ends filled in the wall colour.
 */
export function tiledGable(
  b: Batch,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  rise: number,
  c: RGB,
  wallC: RGB,
  seed: number,
  shades: Shades = SHADES,
) {
  const top = y + rise,
    under = shade(c, 0.68),
    w3: [RGB, RGB, RGB] = [wallC, wallC, wallC];
  if (x1 - x0 >= z1 - z0) {
    const zc = (z0 + z1) / 2;
    b.quad([x0, y, z1], [x1, y, z1], [x1, top, zc], [x0, top, zc], under, [0, 1, 1]);
    b.quad([x1, y, z0], [x0, y, z0], [x0, top, zc], [x1, top, zc], under, [0, 1, -1]);
    tiles(b, [x0, y, z1], [x1, y, z1], [x0, top, zc], [x1, top, zc], c, seed, true, shades);
    tiles(b, [x1, y, z0], [x0, y, z0], [x1, top, zc], [x0, top, zc], c, seed + 1, true, shades);
    b.tri([x1, y, z1], [x1, y, z0], [x1, top, zc], ...w3, [1, 0, 0]);
    b.tri([x0, y, z0], [x0, y, z1], [x0, top, zc], ...w3, [-1, 0, 0]);
  } else {
    const xc = (x0 + x1) / 2;
    b.quad([x1, y, z1], [x1, y, z0], [xc, top, z0], [xc, top, z1], under, [1, 1, 0]);
    b.quad([x0, y, z0], [x0, y, z1], [xc, top, z1], [xc, top, z0], under, [-1, 1, 0]);
    tiles(b, [x1, y, z1], [x1, y, z0], [xc, top, z1], [xc, top, z0], c, seed, true, shades);
    tiles(b, [x0, y, z0], [x0, y, z1], [xc, top, z0], [xc, top, z1], c, seed + 1, true, shades);
    b.tri([x0, y, z1], [x1, y, z1], [xc, top, z1], ...w3, [0, 0, 1]);
    b.tri([x1, y, z0], [x0, y, z0], [xc, top, z0], ...w3, [0, 0, -1]);
  }
}

/**
 * A hip roof of fine-block tiles over x0 … z1 at height y rising by `rise`: four slopes of tile cubes over dark
 * undersides, the ridge along the longer side; a square gives a pyramid.
 */
export function tiledHip(
  b: Batch,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  rise: number,
  c: RGB,
  seed: number,
  shades: Shades = SHADES,
) {
  const s = Math.min(x1 - x0, z1 - z0) / 2,
    top = y + rise,
    under = shade(c, 0.68),
    xc = (x0 + x1) / 2,
    zc = (z0 + z1) / 2,
    alongX = x1 - x0 >= z1 - z0;
  const ra: V3 = alongX ? [x0 + s, top, zc] : [xc, top, z0 + s],
    rb: V3 = alongX ? [x1 - s, top, zc] : [xc, top, z1 - s];
  const c00: V3 = [x0, y, z0],
    c10: V3 = [x1, y, z0],
    c11: V3 = [x1, y, z1],
    c01: V3 = [x0, y, z1];
  // each slope: eaves from left to right seen from outside, the ridge points above them
  const slopes: [V3, V3, V3, V3, V3][] = alongX
    ? [
        [c01, c11, ra, rb, [0, 1, 1]],
        [c10, c00, rb, ra, [0, 1, -1]],
        [c11, c10, rb, rb, [1, 1, 0]],
        [c00, c01, ra, ra, [-1, 1, 0]],
      ]
    : [
        [c11, c10, rb, ra, [1, 1, 0]],
        [c00, c01, ra, rb, [-1, 1, 0]],
        [c01, c11, rb, rb, [0, 1, 1]],
        [c10, c00, ra, ra, [0, 1, -1]],
      ];
  slopes.forEach(([e0, e1, r0, r1, n], i) => {
    b.quad(e0, e1, r1, r0, under, n);
    // a hip has no verges: the slopes meet along the hips, where a raised rim would stand as a comb
    tiles(b, e0, e1, r0, r1, c, seed + i, false, shades);
  });
}

/** A square frustum round (cx, cz): half width s0 at y0, s1 at y1, with its top face. */
export function frustum(
  b: Batch,
  cx: number,
  cz: number,
  y0: number,
  y1: number,
  s0: number,
  s1: number,
  c: RGB,
  top: RGB = c,
) {
  const lo = (sx: number, sz: number): V3 => [cx + sx * s0, y0, cz + sz * s0],
    hi = (sx: number, sz: number): V3 => [cx + sx * s1, y1, cz + sz * s1];
  b.quad(lo(1, -1), lo(1, 1), hi(1, 1), hi(1, -1), c, [1, 0, 0]);
  b.quad(lo(-1, 1), lo(-1, -1), hi(-1, -1), hi(-1, 1), c, [-1, 0, 0]);
  b.quad(lo(-1, 1), lo(1, 1), hi(1, 1), hi(-1, 1), c, [0, 0, 1]);
  b.quad(lo(1, -1), lo(-1, -1), hi(-1, -1), hi(1, -1), c, [0, 0, -1]);
  b.quad(hi(-1, -1), hi(-1, 1), hi(1, 1), hi(1, -1), top, [0, 1, 0]);
}

/**
 * A Venetian chimney `hv` fine blocks high: a shaft of a block and a half square that widens at the top into an inverted
 * bell against sparks (Lupo 2016, ArcHistoR 5: "alla Carpaccio"), the opening dark on top.
 */
export function chimney(b: Batch, cx: number, cz: number, y: number, hv: number, c: RGB, dark: RGB) {
  const s = V * 0.7,
    neck = y + (hv - 2) * V,
    top = y + hv * V;
  b.box(cx - s, y - V, cz - s, cx + s, neck, cz + s, c, { foot: 0.88 });
  frustum(b, cx, cz, neck, top, s, V, shade(c, 0.96), shade(c, 1.04));
  b.box(cx - V * 0.6, top, cz - V * 0.6, cx + V * 0.6, top + V * 0.12, cz + V * 0.6, dark);
}

/** A plain chimney `hv` fine blocks high: a square shaft with a capping slab and the dark opening on top. */
export function stack(b: Batch, cx: number, cz: number, y: number, hv: number, c: RGB, dark: RGB) {
  const s = V * 0.75,
    top = y + hv * V;
  b.box(cx - s, y - V, cz - s, cx + s, top, cz + s, c, { foot: 0.88 });
  b.box(
    cx - s - V * 0.15,
    top,
    cz - s - V * 0.15,
    cx + s + V * 0.15,
    top + V * 0.35,
    cz + s + V * 0.15,
    shade(c, 1.05),
  );
  b.box(cx - s * 0.6, top + V * 0.35, cz - s * 0.6, cx + s * 0.6, top + V * 0.4, cz + s * 0.6, dark);
}

/** A roof terrace (altana) of wood over the ridge: a deck on four posts, a rail round it, as in Carpaccio's Venice. */
export function altana(b: Batch, x0: number, z0: number, x1: number, z1: number, y: number, c: RGB) {
  const p = V * 0.3,
    deck = y + 3 * V;
  for (const [x, z] of [
    [x0, z0],
    [x1, z0],
    [x0, z1],
    [x1, z1],
  ])
    b.box(x - p, y - 2 * V, z - p, x + p, deck + 2 * V, z + p, shade(c, 0.9));
  b.box(x0 - p, deck, z0 - p, x1 + p, deck + V * 0.4, z1 + p, c, { bottom: true });
  for (const [ax, az, bx, bz] of [
    [x0, z0, x1, z0],
    [x0, z1, x1, z1],
    [x0, z0, x0, z1],
    [x1, z0, x1, z1],
  ])
    b.box(
      Math.min(ax, bx) - p / 2,
      deck + 2 * V,
      Math.min(az, bz) - p / 2,
      Math.max(ax, bx) + p / 2,
      deck + 2.4 * V,
      Math.max(az, bz) + p / 2,
      shade(c, 0.95),
      { bottom: true },
    );
}
