// The hand-made parts of the fine-block house, which the grammar (grammar.ts) sets on a wall or a roof: windows,
// doors, gates, the faint ashlar grid, tiles, chimneys, corbels, the roof terrace. Sizes are in fine blocks (VOXEL,
// measured on the reference class image, traditions/measures/referenzklasse_nahsicht.json); positions in blocks.
import { type Batch, type RGB, type V3, hash2, mix, shade } from '../../lookprobe/batch';
import { type Wall, arch, on, pane } from '../core/wall';
import { VOXEL as V } from './style';

type BoxOpts = Parameters<Batch['box']>[7];

/** An axis-aligned box on a wall: t0 … t1 along it, y0 … y1 up, from `inn` behind its face to `out` in front of it. */
export function boxOn(
  b: Batch,
  w: Wall,
  t0: number,
  y0: number,
  t1: number,
  y1: number,
  inn: number,
  out: number,
  c: RGB,
  o?: BoxOpts,
) {
  const xs: number[] = [],
    zs: number[] = [];
  for (const t of [t0, t1])
    for (const d of [-inn, out]) {
      xs.push(w.o[0] + w.u[0] * t + w.n[0] * d);
      zs.push(w.o[2] + w.u[2] * t + w.n[2] * d);
    }
  b.box(Math.min(...xs), y0, Math.min(...zs), Math.max(...xs), y1, Math.max(...zs), c, o);
}

/**
 * The grid of ashlar, or of plaster scored to look like it, in running bond: every fine block of the wall as a pane
 * in its own tone, a smooth spread from a sixth darker to a sixth lighter than the wall, set a thin joint apart;
 * the wall itself, in the pale joint colour (`jointOf`), shows between them as the joints. One pane per block
 * instead of joints drawn on their own: a fifth of the wall's triangles saved, and every block has a tone.
 */
export function ashlar(b: Batch, w: Wall, y0: number, y1: number, c: RGB, seed: number) {
  const cols = Math.ceil(w.len / V),
    rows = Math.round((y1 - y0) / V),
    j = V * 0.12;
  for (let k = 0; k < rows; k++) {
    const y = y0 + k * V;
    for (let i = -1; i <= cols; i++) {
      const t0 = Math.max(0, (i + (k % 2) * 0.5) * V + j / 2),
        t1 = Math.min(w.len, (i + 1 + (k % 2) * 0.5) * V - j / 2);
      if (t1 - t0 < j) continue;
      pane(b, w, t0, y + j / 2, t1, y + V - j / 2, shade(c, 0.84 + 0.32 * hash2(k, i, seed + 1)), 0.02);
    }
  }
}

/** The colour of the joints between the blocks of a wall of colour `c`: the wall lightened towards white, hue kept. */
export const jointOf = (c: RGB): RGB => mix(c, [1, 1, 1], 0.3);

/** The rim of a pointed (equilateral) arch from the left springing over the apex to the right, `half` the opening's half width. */
function pointedRim(w: Wall, tc: number, spring: number, half: number, lift: number): V3[] {
  const R = 2 * half,
    rim: V3[] = [];
  for (let k = 0; k <= 5; k++) {
    const a = Math.PI - (Math.PI / 3) * (k / 5);
    rim.push(on(w, tc + half + Math.cos(a) * R, spring + Math.sin(a) * R, lift));
  }
  for (let k = 1; k <= 5; k++) {
    const a = (Math.PI / 3) * (1 - k / 5);
    rim.push(on(w, tc - half + Math.cos(a) * R, spring + Math.sin(a) * R, lift));
  }
  return rim;
}

/** A pointed opening on a wall, as the Gothic windows and gates of Venice: straight up to `spring`, then the arch. */
export function pointed(b: Batch, w: Wall, tc: number, y0: number, half: number, spring: number, c: RGB, lift: number) {
  pane(b, w, tc - half, y0, tc + half, spring, c, lift);
  b.fan(on(w, tc, spring, lift), pointedRim(w, tc, spring, half, lift), c, w.n);
}

export interface Materials {
  stone: RGB;
  wood: RGB;
  glass: RGB;
}

/**
 * A window of `wv` × `hv` fine blocks: a dark opening under a stone lintel and over a stone sill, each a block wider
 * on both sides and half a block proud; in the near view also jambs of dark wood. `arched` sets the opening under a
 * pointed arch in a surround of pale stone (ICCD card 10198988: Gothic arch of Istrian stone, 14th century).
 */
export function window(
  b: Batch,
  w: Wall,
  t: number,
  y: number,
  wv: number,
  hv: number,
  mt: Materials,
  arched: boolean,
  detail: number,
) {
  const half = (wv * V) / 2;
  if (!detail) {
    // seen from afar: the opening, its lintel and its sill as flat panes
    pane(b, w, t - half - V, y - V, t + half + V, y, mt.stone, 0.04);
    pane(b, w, t - half - V, y + hv * V, t + half + V, y + (hv + 1) * V, mt.stone, 0.04);
    pane(b, w, t - half, y, t + half, y + hv * V, mt.glass, 0.05);
    return;
  }
  boxOn(b, w, t - half - V / 2, y - V, t + half + V / 2, y, 0, V / 2, mt.stone);
  if (arched) {
    const spring = y + hv * V - 1.732 * half;
    pointed(b, w, t, y, half + V / 2, spring, mt.stone, 0.05);
    pointed(b, w, t, y, half, spring, mt.glass, 0.06);
    return;
  }
  pane(b, w, t - half, y, t + half, y + hv * V, mt.glass, 0.05);
  boxOn(b, w, t - half - V, y + hv * V, t + half + V, y + (hv + 1) * V, 0, V / 2, mt.stone);
  if (!detail) return;
  // the wooden frame: jambs half a block wide and a head under the lintel, as panes (a quarter block of relief is
  // under a pixel at the near zoom, and a pane costs a fifth of a box)
  const frame = shade(mt.wood, 0.7);
  pane(b, w, t - half - V * 0.5, y, t - half, y + hv * V, frame, 0.06);
  pane(b, w, t + half, y, t + half + V * 0.5, y + hv * V, frame, 0.06);
  pane(b, w, t - half - V * 0.5, y + (hv - 0.4) * V, t + half + V * 0.5, y + hv * V, frame, 0.06);
}

/**
 * A door of `wv` × `hv` fine blocks: a leaf of dark wood in a stone frame; in the near view with two paler panels and
 * a wooden hood on two corbels above it (reference class: hood 1 high, 1 proud, on 2 corbels).
 */
export function door(b: Batch, w: Wall, t: number, y: number, wv: number, hv: number, mt: Materials, detail: number) {
  const half = (wv * V) / 2,
    leaf = shade(mt.wood, 0.75);
  if (!detail) {
    pane(b, w, t - half - V / 2, y, t + half + V / 2, y + (hv + 1) * V, mt.stone, 0.04);
    pane(b, w, t - half, y, t + half, y + hv * V, leaf, 0.05);
    return;
  }
  boxOn(b, w, t - half, y, t + half, y + hv * V, 0, V * 0.15, leaf);
  boxOn(b, w, t - half - V / 2, y, t - half, y + hv * V, 0, V * 0.3, mt.stone);
  boxOn(b, w, t + half, y, t + half + V / 2, y + hv * V, 0, V * 0.3, mt.stone);
  boxOn(b, w, t - half - V / 2, y + hv * V, t + half + V / 2, y + (hv + 1) * V, 0, V * 0.3, mt.stone);
  if (!detail) return;
  for (const s of [-1, 1])
    pane(
      b,
      w,
      t + s * half * 0.5 - V * 0.3,
      y + V,
      t + s * half * 0.5 + V * 0.3,
      y + (hv - 1) * V,
      shade(mt.wood, 0.9),
      V * 0.15 + 0.02,
    );
  boxOn(b, w, t - half - V, y + (hv + 1) * V, t + half + V, y + (hv + 2) * V, 0, V, mt.wood, { bottom: true });
  for (const s of [-1, 1])
    boxOn(
      b,
      w,
      t + s * (half + V * 0.75) - V / 4,
      y + hv * V,
      t + s * (half + V * 0.75) + V / 4,
      y + (hv + 1) * V,
      0,
      V * 0.9,
      shade(mt.wood, 0.85),
    );
}

/** A shop front: a round-headed opening `wv` wide and `hv` high in a stone surround, as under the jettied upper storeys of Calle del Paradiso. */
export function shop(b: Batch, w: Wall, t: number, y: number, wv: number, hv: number, mt: Materials) {
  const half = (wv * V) / 2;
  arch(b, w, t, y, half + V / 2, y + hv * V - half - V / 2, mt.stone, 0.05);
  arch(b, w, t, y, half, y + hv * V - half - V / 2, shade(mt.glass, 0.8), 0.06);
}

/** A water gate on the canal front: a pointed opening `wv` wide and `hv` high in a surround of Istrian stone, down to the water. */
export function gate(b: Batch, w: Wall, t: number, y: number, wv: number, hv: number, mt: Materials) {
  const half = (wv * V) / 2,
    spring = y + hv * V - 1.732 * half;
  pointed(b, w, t, y - V, half + V / 2, spring, mt.stone, 0.05);
  pointed(b, w, t, y - V, half, spring, shade(mt.glass, 0.7), 0.06);
}

/** Wooden corbels under a jettied storey: `n` blocks half a fine block wide, one high, reaching `out` from the wall. */
export function corbels(b: Batch, w: Wall, y: number, out: number, n: number, c: RGB) {
  for (let k = 0; k < n; k++) {
    const t = ((k + 0.5) / n) * w.len;
    boxOn(b, w, t - V / 4, y - V, t + V / 4, y, 0, out, c, { bottom: true });
  }
}

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
 * face of every cube (the step to the row below), and all four sides of the rim cubes; an inner cube's other sides
 * are hidden by its neighbours, since the gap between them is a twentieth of a block.
 */
export function tiles(b: Batch, e0: V3, e1: V3, r0: V3, r1: V3, c: RGB, seed: number) {
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
        col = shade(c, 0.88 + 0.2 * hash2(j, k, seed + 5));
      const rim = j === 0 || j === cols - 1 || k === 0 || k === rows - 1,
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
) {
  const top = y + rise,
    under = shade(c, 0.68),
    w3: [RGB, RGB, RGB] = [wallC, wallC, wallC];
  if (x1 - x0 >= z1 - z0) {
    const zc = (z0 + z1) / 2;
    b.quad([x0, y, z1], [x1, y, z1], [x1, top, zc], [x0, top, zc], under, [0, 1, 1]);
    b.quad([x1, y, z0], [x0, y, z0], [x0, top, zc], [x1, top, zc], under, [0, 1, -1]);
    tiles(b, [x0, y, z1], [x1, y, z1], [x0, top, zc], [x1, top, zc], c, seed);
    tiles(b, [x1, y, z0], [x0, y, z0], [x1, top, zc], [x0, top, zc], c, seed + 1);
    b.tri([x1, y, z1], [x1, y, z0], [x1, top, zc], ...w3, [1, 0, 0]);
    b.tri([x0, y, z0], [x0, y, z1], [x0, top, zc], ...w3, [-1, 0, 0]);
  } else {
    const xc = (x0 + x1) / 2;
    b.quad([x1, y, z1], [x1, y, z0], [xc, top, z0], [xc, top, z1], under, [1, 1, 0]);
    b.quad([x0, y, z0], [x0, y, z1], [xc, top, z1], [xc, top, z0], under, [-1, 1, 0]);
    tiles(b, [x1, y, z1], [x1, y, z0], [xc, top, z1], [xc, top, z0], c, seed);
    tiles(b, [x0, y, z0], [x0, y, z1], [xc, top, z0], [xc, top, z1], c, seed + 1);
    b.tri([x0, y, z1], [x1, y, z1], [xc, top, z1], ...w3, [0, 0, 1]);
    b.tri([x1, y, z0], [x0, y, z0], [xc, top, z0], ...w3, [0, 0, -1]);
  }
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

/**
 * A pair of wooden shutters thrown open beside a window of `wv` × `hv` fine blocks, each a block wide and the
 * opening's height, hinged at the jambs and lying flat on the wall as panes, of paler wood than the
 * frame so they read as leaves and not as a wider opening. Glass was rare before
 * 1400; windows were closed with wooden shutters or impannate (Venice measure file, assumption).
 */
export function shutters(b: Batch, w: Wall, t: number, y: number, wv: number, hv: number, wood: RGB, seed: number) {
  const half = (wv * V) / 2,
    c = shade(wood, 1.3 + 0.35 * hash2(seed, 3, 5)),
    dark = shade(c, 0.75);
  for (const q of [-1, 1]) {
    const t0 = t + q * (half + V * 0.5),
      t1 = t + q * (half + V * 1.5);
    pane(b, w, Math.min(t0, t1), y, Math.max(t0, t1), y + hv * V, c, 0.06);
    // two panels on the leaf, read as a dark groove across the middle
    pane(
      b,
      w,
      Math.min(t0, t1) + V * 0.15,
      y + hv * V * 0.5 - V * 0.08,
      Math.max(t0, t1) - V * 0.15,
      y + hv * V * 0.5 + V * 0.08,
      dark,
      0.07,
    );
  }
}

/**
 * Washing on a line between two points of a wall at height `y`: a thin pole-to-pole cord a block in front of the
 * wall and a few pale cloths hanging from it, each two to three fine blocks wide and three tall (assumption: no source
 * for 1356, taken from the reference class, which hangs cloth from most upper storeys).
 */
export function washing(b: Batch, w: Wall, t0: number, t1: number, y: number, cloths: readonly RGB[], seed: number) {
  const out = V * 1.0,
    cord = shade(cloths[0], 0.6);
  boxOn(b, w, t0, y - V * 0.06, t1, y + V * 0.06, -out - V * 0.04, out + V * 0.04, cord);
  let t = t0 + V * 0.4,
    k = 0;
  while (t + V < t1) {
    const wv = 2 + Math.round(hash2(seed, k, 17)),
      c = cloths[Math.floor(hash2(seed, k, 19) * cloths.length) % cloths.length];
    boxOn(b, w, t, y - 3 * V, t + wv * V, y, -out - V * 0.08, out + V * 0.08, c, { bottom: true });
    t += (wv + 0.6) * V;
    k++;
  }
}
