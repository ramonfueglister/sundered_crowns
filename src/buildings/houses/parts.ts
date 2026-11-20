// The hand-made parts of the fine-block house that the grammar (grammar.ts) sets on a wall: windows, doors, gates,
// shops, the faint ashlar grid, corbels, shutters, washing; those of the roof are in roof_parts.ts. Sizes are in fine
// blocks (VOXEL, measured on the reference class image, traditions/measures/referenzklasse_nahsicht.json); positions in
// blocks.
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

/** A round-arched opening on a wall, as the arcades of an Italian street: straight up to `spring`, then a half circle. */
export function rounded(b: Batch, w: Wall, tc: number, y0: number, half: number, spring: number, c: RGB, lift: number) {
  pane(b, w, tc - half, y0, tc + half, spring, c, lift);
  const rim: V3[] = [];
  for (let k = 0; k <= 8; k++) {
    const a = Math.PI * (1 - k / 8);
    rim.push(on(w, tc + Math.cos(a) * half, spring + Math.sin(a) * half, lift));
  }
  b.fan(on(w, tc, spring, lift), rim, c, w.n);
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
