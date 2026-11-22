// The river of the Paris probe (PROTOTYPE, 22 Nov 2026): the town of paris_probe.ts as the tip of an island, as in
// Ramon's reference picture of the Île de la Cité: one arm of the river behind the town with a meadow and the town
// wall with its towers beyond it, one arm before the town, the two meeting at the picture's right; quays with landing
// stages and boats, river boats under sail, a stone bridge on arches with a gate tower at each end over each arm.
// Every size here is read off that picture: OWN RULE for the prototype.
import { type ColumnAt, type GroundCell, type Side, pane, wallOf, waterColourAt, waterFlecks } from '../buildings';
import { battlements } from '../buildings/core/solids';
import { arch } from '../buildings/core/wall';
import { ashlar } from '../buildings/houses/parts';
import { type Batch, type RGB, type Rnd, rgb, shade } from './batch';
import { boat } from './blocks';
import { LAND_Y, SEA_Y } from './layout';
import { EARTH } from './scenery';

/** what the river takes from the probe: its colours, and how the probe draws a tree */
export interface RiverLook {
  water: RGB;
  grass: RGB;
  wood: RGB;
  canvas: RGB;
  paving: RGB;
  tree: (things: Batch, x: number, z: number, r: Rnd, size: number) => void;
}

/**
 * One arm of the river: the town's quay at `quay` with the water on its `side` (+1: towards greater coordinates) for
 * `width`, the quay running from `from` to `to`, a bridge across at `bridge`. The arm flows along z, or along x if
 * `turn`.
 */
export interface Arm {
  turn: boolean;
  quay: number;
  side: number;
  width: number;
  from: number;
  to: number;
  bridge: number;
}

/** a rectangle of the ground: x0, z0, x1, z1 */
type Rect = readonly [number, number, number, number];
/**
 * The rectangle from `u0` to `u1` across an arm and from `v0` to `v1` along it. Every part of an arm is laid out in
 * these two, so that the same bridge crosses an arm that flows along z and one that flows along x.
 */
const rect = (a: Arm, u0: number, v0: number, u1: number, v1: number): Rect =>
  a.turn ? [v0, u0, v1, u1] : [u0, v0, u1, v1];
const block = (b: Batch, [x0, z0, x1, z1]: Rect, y0: number, y1: number, c: RGB, o?: Parameters<Batch['box']>[7]) =>
  b.box(x0, y0, z0, x1, y1, z1, c, o);

/** the stone of the bridge and the town wall, the slate of the towers' roofs, the dark of a gateway */
const STONE = rgb(0xd6c2a6),
  SLATE = rgb(0x6c7080),
  DARK = rgb(0x3a2e28);
/** how far a bridge's deck rises over the quays, so that its arches clear the water, and the length of its ramps */
const HUMP = 1.8,
  RAMP = 4;
/** a fine block, the grain of the landing stages' planks and the bridges' arches */
const FINE = 0.25;

/**
 * What lies on an arm before the town's quay: a landing stage of planks on posts with a rowing boat every dozen
 * blocks or so, and river boats under one square sail out in the stream.
 */
function traffic(things: Batch, a: Arm, look: RiverLook, r: Rnd) {
  const deck = LAND_Y - 0.15;
  for (let v = a.from + r.range(4, 10); v < a.to - 4; v += r.range(11, 17)) {
    const len = r.range(3.5, 5),
      u0 = a.side > 0 ? a.quay : a.quay - len;
    if (Math.abs(v - a.bridge) < 6) continue;
    for (let k = 0; k < len / FINE; k++)
      block(
        things,
        rect(a, u0 + k * FINE, v - 0.9, u0 + (k + 1) * FINE, v + 0.9),
        deck - 0.08,
        deck,
        shade(look.wood, 0.92 + 0.12 * r.range(0, 1)),
        { bottom: true },
      );
    for (let u = u0 + 0.4; u < u0 + len; u += 1)
      for (const s of [-0.78, 0.78])
        block(things, rect(a, u - 0.12, v + s - 0.12, u + 0.12, v + s + 0.12), SEA_Y - 3, deck + FINE, look.wood, {
          top: shade(look.wood, 1.3),
          foot: 0.7,
        });
    const [bx, bz] = rect(a, a.quay + a.side * r.range(1.5, 3), v + r.pick([-2.2, 2.2]), 0, 0);
    boat(things, bx, bz, r);
  }
  for (let v = a.from + r.range(8, 20); v < a.to - 8; v += r.range(18, 30)) {
    const u = a.quay + a.side * r.range(7, a.width - 4),
      hull = shade(look.wood, r.range(0.85, 1.1));
    if (Math.abs(v - a.bridge) < 6) continue;
    block(things, rect(a, u - 0.7, v - 2, u + 0.7, v + 2), SEA_Y - 0.2, SEA_Y + 0.55, hull, {
      top: shade(hull, 1.35),
      foot: 0.7,
    });
    block(things, rect(a, u - 0.45, v + 2, u + 0.45, v + 2.6), SEA_Y - 0.2, SEA_Y + 0.7, shade(hull, 0.85));
    block(things, rect(a, u - 0.08, v - 0.08, u + 0.08, v + 0.08), SEA_Y + 0.55, SEA_Y + 3.6, shade(hull, 0.7));
    block(things, rect(a, u - 1.1, v + 0.1, u + 1.1, v + 0.22), SEA_Y + 1.3, SEA_Y + 3.3, look.canvas);
  }
}

/** A box of the stone with ashlar on the two sides the picture's camera sees (+x and +z). */
function masonry(b: Batch, at: Rect, y0: number, y1: number, seed: number) {
  block(b, at, y0, y1, shade(STONE, 0.86), { top: shade(STONE, 0.95) });
  ashlar(b, wallOf(...at, 'px'), Math.max(y0, SEA_Y), y1, STONE, seed, 2);
  ashlar(b, wallOf(...at, 'pz'), Math.max(y0, SEA_Y), y1, STONE, seed + 1, 2);
}

/**
 * A tower of the wall or the bridge over `at`, `h` above the ground: masonry with battlements, under a pyramid of
 * slate if `roofed`, with a gateway on its `gate` side if it has one.
 */
function tower(b: Batch, at: Rect, h: number, roofed: boolean, gate: Side | null) {
  const [x0, z0, x1, z1] = at,
    top = LAND_Y + h;
  masonry(b, at, LAND_Y - 1, top, Math.round(x0 * 7 + z0 * 13));
  battlements(b, x0, z0, x1, z1, top, STONE, 0.45, 0.45);
  if (roofed) {
    const s = Math.min(x1 - x0, z1 - z0) / 2 - 0.5,
      xc = (x0 + x1) / 2,
      zc = (z0 + z1) / 2;
    // a pyramid as four slopes up to one point
    const corners: [number, number][] = [
      [xc - s, zc - s],
      [xc - s, zc + s],
      [xc + s, zc + s],
      [xc + s, zc - s],
    ];
    corners.forEach(([ax, az], k) => {
      const [bx, bz] = corners[(k + 1) % 4];
      b.tri([ax, top, az], [bx, top, bz], [xc, top + s * 2.2, zc], SLATE, SLATE, shade(SLATE, 1.15), [
        (ax + bx) / 2 - xc,
        s,
        (az + bz) / 2 - zc,
      ]);
    });
  }
  for (const side of ['px', 'pz'] as const) {
    const w = wallOf(...at, side);
    if (side === gate) arch(b, w, w.len / 2, LAND_Y, 1.0, LAND_Y + 1.5, DARK, 0.04);
    else pane(b, w, w.len / 2 - 0.12, LAND_Y + h * 0.55, w.len / 2 + 0.12, LAND_Y + h * 0.55 + 0.9, DARK, 0.04);
  }
}

/**
 * A stone bridge across an arm, from its quay to its bank: a paved deck on three arches, raised over the quays by
 * HUMP and reached by a ramp of RAMP at each end, parapets, and a gate tower on the land at each end. It is built
 * column by column along its length: each column reaches from the deck down to the arch below it, or into the water
 * where a pier stands.
 */
function bridge(b: Batch, arm: Arm, look: RiverLook) {
  const ua = arm.side > 0 ? arm.quay : arm.quay - arm.width,
    ub = ua + arm.width,
    v = arm.bridge,
    hw = 1.7,
    rim = 0.3,
    top = LAND_Y + HUMP,
    pier = 1.2,
    span = (ub - ua) / 3,
    a = (span - pier) / 2,
    spring = SEA_Y + 0.1,
    body = shade(STONE, 0.9);
  /** the deck's height at u: up the ramps, level between them */
  const deck = (u: number) => LAND_Y + HUMP * Math.min(1, (u - ua) / RAMP, (ub - u) / RAMP);
  for (let u = ua; u < ub - 1e-6; u += FINE) {
    const um = u + FINE / 2,
      mid = ua + (Math.min(2, Math.floor((um - ua) / span)) + 0.5) * span,
      m = Math.abs(um - mid),
      // an arch's crown stays under the deck over its middle, so the arches under the ramps are lower
      crown = deck(mid) - 0.45,
      soffit = m < a ? spring + (crown - spring) * Math.sqrt(1 - (m / a) ** 2) : SEA_Y - 1.5,
      y = deck(um);
    block(b, rect(arm, u, v - hw, u + FINE, v + hw), soffit, y, body, { top: look.paving, bottom: true, foot: 0.6 });
    // the parapets of the ramps; those of the level deck are one piece each, below
    if (y < top - 1e-6)
      for (const v0 of [v - hw, v + hw - rim])
        block(b, rect(arm, u, v0, u + FINE, v0 + rim), y, y + 0.6, STONE, { top: shade(STONE, 0.95) });
  }
  // the cutwaters: each pier stands out of the bridge's sides up to where the arches spring
  for (const k of [1, 2]) {
    const u = ua + k * span;
    masonry(b, rect(arm, u - pier / 2, v - hw - 0.35, u + pier / 2, v + hw + 0.35), SEA_Y - 1.5, spring + 0.9, k);
  }
  for (const v0 of [v - hw, v + hw - rim]) {
    const [x0, z0, x1, z1] = rect(arm, ua + RAMP, v0, ub - RAMP, v0 + rim);
    masonry(b, [x0, z0, x1, z1], top - 0.4, top + 0.6, 31 + v0);
    battlements(b, x0, z0, x1, z1, top + 0.6, STONE, 0.3, 0.3, 0.9);
  }
  const gate = arm.turn ? 'pz' : 'px';
  tower(b, rect(arm, ua - 3.2, v - 2.3, ua - 0.2, v + 2.3), 6.5, true, gate);
  tower(b, rect(arm, ub + 0.2, v - 2.3, ub + 3.2, v + 2.3), 6.5, true, gate);
}

/**
 * The town wall beyond an arm, from `from` to `to` along it, its face towards the river at `face`: masonry with
 * battlements, a tower every 24 blocks or so.
 */
function wall(b: Batch, arm: Arm, face: number, from: number, to: number, r: Rnd) {
  const h = 4.2,
    [x0, z0, x1, z1] = rect(arm, face - 1.2, from, face, to);
  masonry(b, [x0, z0, x1, z1], LAND_Y - 1, LAND_Y + h, 5);
  battlements(b, x0, z0, x1, z1, LAND_Y + h, STONE, 0.45, 0.45);
  for (let v = from + r.range(6, 16); v < to - 4; v += r.range(20, 28))
    tower(b, rect(arm, face - 2.8, v - 1.8, face + 0.8, v + 1.8), h + 2.6, r.chance(0.5), null);
}

/**
 * The river round the town, whose quays are `near` (the arm before the town, along z) and `far` (the arm behind it,
 * along x); `at` tells which column is land, water or bank. Beyond the far arm lie a meadow and the town wall, beyond
 * the near arm a meadow. Returns the z at which the land behind the wall begins.
 */
export function river(
  ground: Batch,
  things: Batch,
  water: Batch,
  cell: GroundCell,
  at: ColumnAt,
  near: Arm,
  far: Arm,
  look: RiverLook,
  r: Rnd,
): number {
  const x9 = cell.x0 + cell.size,
    z9 = cell.z0 + cell.size;
  for (let x = cell.x0; x < x9; x++)
    for (let z = cell.z0; z < z9; z++)
      if (at(x, z)?.wet)
        water.quad(
          [x, SEA_Y, z],
          [x, SEA_Y, z + 1],
          [x + 1, SEA_Y, z + 1],
          [x + 1, SEA_Y, z],
          waterColourAt(x, z, look.water),
          [0, 1, 0],
        );
  waterFlecks(water, cell, at);
  for (const arm of [far, near]) {
    traffic(things, arm, look, r);
    bridge(things, arm, look);
  }
  // the banks: meadows with trees along the water; the wall stands four blocks back from the far arm
  const bankZ = far.quay - far.width,
    bankX = near.quay + near.width,
    face = bankZ - 4.5;
  ground.box(cell.x0, LAND_Y - 2, cell.z0, x9, LAND_Y, bankZ, EARTH, { top: look.grass });
  ground.box(bankX, LAND_Y - 2, far.quay, x9, LAND_Y, z9, EARTH, { top: look.grass });
  wall(things, far, face, cell.x0, x9, r);
  for (let v = cell.x0 + 2; v < x9 - 2; v += r.range(2.5, 6))
    look.tree(things, v, r.range(face + 1.2, bankZ - 1), r, r.range(1.5, 2.1));
  for (let v = far.quay + 2; v < z9 - 2; v += r.range(2.5, 6))
    look.tree(things, r.range(bankX + 1.5, bankX + 7), v, r, r.range(1.6, 2.4));
  return face - 1.2;
}
