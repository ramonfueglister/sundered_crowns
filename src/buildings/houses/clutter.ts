// What stands before the houses in the near view: awnings, jars, crates of goods, cloth hung out, steps, bollards
// and the paving of the quay. Sizes in fine blocks, as listed under "beiwerk" in the reference class measure file.
import { type Batch, type RGB, hash2, shade } from '../../lookprobe/batch';
import { type Wall, on } from '../core/wall';
import { boxOn, frustum } from './parts';
import { VOXEL as V } from './style';

/** A striped awning before a shop: `wv` stripes a fine block wide from the wall at `y`, reaching `dv` out and `fall` down, on two posts. */
export function awning(b: Batch, w: Wall, t: number, y: number, wv: number, dv: number, fall: number, stripe: RGB, white: RGB, wood: RGB) {
  const t0 = t - (wv * V) / 2, yf = y - fall * V, out = dv * V, p = V * 0.15;
  for (let k = 0; k < wv; k++) {
    const a = t0 + k * V, c = t0 + (k + 1) * V, col = k % 2 ? white : stripe;
    b.quad(on(w, a, y, 0.03), on(w, c, y, 0.03), on(w, c, yf, out), on(w, a, yf, out), col, [0, 1, 0]);
    b.quad(on(w, a, yf - V * 0.4, out), on(w, c, yf - V * 0.4, out), on(w, c, yf, out), on(w, a, yf, out), shade(col, 0.85), w.n);
  }
  for (const s of [t0 + p, t0 + wv * V - p]) boxOn(b, w, s - p, 0, s + p, yf, -out + p * 2, out, wood);
}

/** A clay jar beside a door: one fine block wide, one and a half high, belly, shoulder and neck as frustums. */
export function jar(b: Batch, x: number, y: number, z: number, c: RGB) {
  frustum(b, x, z, y, y + V * 0.55, V * 0.28, V * 0.5, c);
  frustum(b, x, z, y + V * 0.55, y + V * 1.25, V * 0.5, V * 0.22, shade(c, 1.05));
  b.box(x - V * 0.26, y + V * 1.25, z - V * 0.26, x + V * 0.26, y + V * 1.5, z + V * 0.26, shade(c, 0.95), { top: shade(c, 0.5) });
}

/** A crate of goods on the quay, two fine blocks by one, with fruit or cloth heaped on top. */
export function crate(b: Batch, x: number, y: number, z: number, along: 'x' | 'z', wood: RGB, goods: readonly RGB[], seed: number) {
  const hx = along === 'x' ? V : V / 2, hz = along === 'x' ? V / 2 : V;
  b.box(x - hx, y, z - hz, x + hx, y + V, z + hz, wood, { top: shade(wood, 0.8), foot: 0.85 });
  for (let k = 0; k < 4; k++) {
    const s = V * 0.22, px = x + (hash2(k, 1, seed) - 0.5) * (hx - s) * 2, pz = z + (hash2(k, 2, seed) - 0.5) * (hz - s) * 2;
    b.box(px - s, y + V, pz - s, px + s, y + V + s * 1.6, pz + s, goods[Math.floor(hash2(k, 3, seed) * goods.length)]);
  }
}

/** A cloth hung out to dry on a rod before a wall: `wv` wide, `hv` high, the rod reaching a little further than the cloth. */
export function cloth(b: Batch, w: Wall, t: number, y: number, wv: number, hv: number, c: RGB, wood: RGB) {
  const half = (wv * V) / 2;
  boxOn(b, w, t - half - V * 0.3, y, t + half + V * 0.3, y + V * 0.15, 0, V * 1.3, wood, { bottom: true });
  boxOn(b, w, t - half, y - hv * V, t + half, y, -V * 0.95, V * 1.1, c, { bottom: true });
}

/** Steps from the quay at `y` down `drop` blocks, one fine block a step, between z0 and z1, going down towards +x from x0. */
export function stairs(b: Batch, x0: number, z0: number, z1: number, y: number, drop: number, c: RGB) {
  const n = Math.max(1, Math.round(drop / V));
  for (let k = 0; k < n; k++) b.box(x0 + k * V, y - drop - 0.5, z0, x0 + (k + 1) * V, y - (k + 1) * (drop / n), z1, shade(c, 0.97 - 0.01 * k), { top: shade(c, 1.02), foot: 0.9 });
}

/** A mooring post on the quay's edge: a block of wood two fine blocks high with a pale cap. */
export function bollard(b: Batch, x: number, y: number, z: number, wood: RGB) {
  const s = V * 0.4;
  b.box(x - s, y, z - s, x + s, y + 2 * V, z + s, wood, { top: shade(wood, 1.3), foot: 0.85 });
}

/** The paving of the quay: slabs of two by two fine blocks in running bond on the ground at `y`, each a touch lighter or darker. */
export function paving(b: Batch, x0: number, z0: number, x1: number, z1: number, y: number, c: RGB, seed: number) {
  const S = 2 * V, cols = Math.ceil((x1 - x0) / S), rows = Math.ceil((z1 - z0) / S);
  for (let k = 0; k < rows; k++) for (let j = -1; j < cols; j++) {
    const ax = Math.max(x0, x0 + (j + (k % 2) * 0.5) * S), bx = Math.min(x1, x0 + (j + 1 + (k % 2) * 0.5) * S), az = z0 + k * S, bz = Math.min(z1, z0 + (k + 1) * S);
    if (bx <= ax) continue;
    const h = hash2(j, k, seed), col = shade(c, h < 0.08 ? 0.84 : 0.92 + 0.16 * h);
    b.quad([ax, y + 0.01, az], [ax, y + 0.01, bz], [bx, y + 0.01, bz], [bx, y + 0.01, az], col, [0, 1, 0]);
  }
}

/** A landing stage of planks on posts a fine block square, from the quay's edge at (x, z) `length` blocks out over the water along +x. */
export function jetty(b: Batch, x: number, y: number, z: number, length: number, half: number, deckY: number, wood: RGB) {
  const planks = Math.round(length / V);
  for (let k = 0; k < planks; k++) b.box(x + k * V, deckY - V * 0.3, z - half, x + (k + 1) * V, deckY, z + half, shade(wood, 0.92 + 0.12 * hash2(k, 0, 17)), { bottom: true });
  for (let k = 1.5 * V; k < length; k += 4 * V) for (const s of [-1, 1]) {
    const px = x + k, pz = z + s * (half - V * 0.5);
    b.box(px - V / 2, y - 3, pz - V / 2, px + V / 2, deckY + V, pz + V / 2, wood, { top: shade(wood, 1.3), foot: 0.7 });
  }
}
