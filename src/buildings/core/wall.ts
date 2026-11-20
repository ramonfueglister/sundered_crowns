// Walls of box-shaped bodies and what is drawn flat on them: panes (windows, doors, bands) and round-headed arches.
// Every builder works around its own origin with the ground at y = 0.
import type { Batch, RGB, V3 } from '../../lookprobe/batch';

export type Side = 'px' | 'pz' | 'nx' | 'nz';
export const SIDES: readonly Side[] = ['px', 'pz', 'nx', 'nz'];

/** one wall of a box: `o` is its lower left corner seen from outside, `u` runs along it, `n` points outwards */
export interface Wall {
  o: V3;
  u: V3;
  n: V3;
  len: number;
}

export function wallOf(x0: number, z0: number, x1: number, z1: number, side: Side): Wall {
  if (side === 'pz') return { o: [x0, 0, z1], u: [1, 0, 0], n: [0, 0, 1], len: x1 - x0 };
  if (side === 'nz') return { o: [x1, 0, z0], u: [-1, 0, 0], n: [0, 0, -1], len: x1 - x0 };
  if (side === 'px') return { o: [x1, 0, z1], u: [0, 0, -1], n: [1, 0, 0], len: z1 - z0 };
  return { o: [x0, 0, z0], u: [0, 0, 1], n: [-1, 0, 0], len: z1 - z0 };
}

/** how far a pane stands off its wall, so that it does not flicker into it */
const LIFT = 0.04;

/** the point `t` along the wall at height `y`, `lift` off it */
export const on = (w: Wall, t: number, y: number, lift = LIFT): V3 => [
  w.o[0] + w.u[0] * t + w.n[0] * lift,
  y,
  w.o[2] + w.u[2] * t + w.n[2] * lift,
];

/** a flat rectangle on a wall (window, door, band) */
export function pane(b: Batch, w: Wall, t0: number, y0: number, t1: number, y1: number, c: RGB, lift = LIFT) {
  b.quad(on(w, t0, y0, lift), on(w, t1, y0, lift), on(w, t1, y1, lift), on(w, t0, y1, lift), c, w.n);
}

/** a round-headed opening on a wall: `spring` is the height where the arch starts */
export function arch(b: Batch, w: Wall, tc: number, y0: number, half: number, spring: number, c: RGB, lift = LIFT) {
  pane(b, w, tc - half, y0, tc + half, spring, c, lift);
  const rim: V3[] = [];
  for (let k = 0; k <= 6; k++)
    rim.push(on(w, tc + Math.cos((Math.PI * k) / 6) * half, spring + Math.sin((Math.PI * k) / 6) * half, lift));
  b.fan(on(w, tc, spring, lift), rim, c, w.n);
}

/** `n` evenly spaced items along a wall, with a margin at both ends */
export const spread = (w: Wall, n: number, margin = 0): number[] =>
  Array.from({ length: n }, (_, k) => margin + ((w.len - 2 * margin) * (k + 0.5)) / n);
