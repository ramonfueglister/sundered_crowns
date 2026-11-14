// The blocky things of the reference image: trees, crops, piers, border bands, ships, figures. All plain boxes.
import * as THREE from 'three/webgpu';
import { Batch, type RGB, type Rnd, hash2, mix, rgb, shade } from './batch';
import { type Crop, type Ground, type P2, SEA_Y, groundY, isWet } from './layout';

const TRUNK = rgb(0x5a3c26);
const LEAVES = [rgb(0x86a632), rgb(0x92ae36), rgb(0x7ca030), rgb(0x9ab23a), rgb(0x74982e)];
const FLANK = rgb(0x567e3a), FLANK_AWAY = rgb(0x4a8650), FLANK_AWAY_WARM = rgb(0x56863e);
const CYPRESS = [rgb(0x327234), rgb(0x2c6831), rgb(0x387a38)];
const WHEAT = [rgb(0xffcc58), rgb(0xf8c450), rgb(0xffd460)], WHEAT_SIDE = rgb(0xf0bc4c);
/** sides of crops turned from the sun: brighter than a real surface could be, see `crops` */
const WHEAT_GLOW: RGB = [1.9, 1.0, 0.11], VINE_GLOW: RGB = [0.62, 0.62, 0.06], HEDGE_GLOW = rgb(0x7ea634);
const VINE = [rgb(0xdcc838), rgb(0xd0bc34), rgb(0xe4d03c), rgb(0xc8b432)], VINE_SIDE = rgb(0xbcb42c), VINE_BODY = rgb(0x4e7c22), GRAPES = rgb(0xe89038);
const POST = rgb(0x93552f), POST_CAP = rgb(0xf1e8dc), DECK = rgb(0xa9744a);
const HULL = rgb(0x9c6238), HULL_DARK = rgb(0x74482a), SHIP_DECK = rgb(0xc09a68), SAIL = rgb(0xf2e0c6), FLAG = rgb(0xd23b2e), GOLD = rgb(0xf0c040);
const WAKE = rgb(0xd5eeee);
const SKIN = rgb(0xe2b48c);
const SPECKS = [rgb(0xf4e9a0), rgb(0xf6f0e0), rgb(0xe8a0b0), rgb(0xd8d0c4), rgb(0xc8bfb0), rgb(0xf0c850)];
const CLOTHES = [rgb(0x8a3b2e), rgb(0x3f5f8a), rgb(0xcaa24a), rgb(0x5a7a3a), rgb(0x6a4a7a), rgb(0xd8d0c0)];

/**
 * A leafy tree: a short trunk under a tall crown of a few blocks, bright on top and darker down the sides; about two
 * blocks wide and four high at `size` 1.
 */
export function tree(b: Batch, x: number, y: number, z: number, r: Rnd, size = 1) {
  // the sides are a deeper green than the yellowish sunlit top
  const g = r.pick(LEAVES), s = r.range(0.85, 1.15) * size, flank = mix(shade(g, 0.74), FLANK, 0.85), away = mix(FLANK_AWAY_WARM, FLANK_AWAY, r.next());
  b.box(x - 0.22, y, z - 0.22, x + 0.22, y + 1.3 * s, z + 0.22, TRUNK, { foot: 0.75 });
  const w = 1.05 * s, y1 = y + 0.9 * s, y2 = y1 + 2.1 * s;
  b.box(x - w, y1, z - w, x + w, y2, z + w, flank, { top: g, foot: 0.8, bottom: true, away });
  const ox = r.range(-0.25, 0.25) * s, oz = r.range(-0.25, 0.25) * s, t = 0.66 * s;
  b.box(x + ox - t, y2, z + oz - t, x + ox + t, y2 + 0.7 * s, z + oz + t, flank, { top: shade(g, 1.06), away });
  // a second, lower cube set against one corner makes the crown irregular
  if (r.chance(0.55)) {
    const k = r.range(0.6, 0.85) * s, cx = x + r.pick([-1, 1]) * w * 0.7, cz = z + r.pick([-1, 1]) * w * 0.7, top = y1 + r.range(1.2, 1.9) * s;
    b.box(cx - k, y1 + 0.2 * s, cz - k, cx + k, top, cz + k, shade(flank, r.range(0.92, 1.06)), { top: shade(g, r.range(0.94, 1.04)), foot: 0.74, bottom: true, away });
  }
  // lumps on the sides break the cube outline, as on the trees of the reference
  for (const side of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    if (!r.chance(0.6)) continue;
    const k = r.range(0.4, 0.58) * s, out = w + k * 0.4, along = r.range(-0.35, 0.35) * s;
    const cx = x + side[0] * out + side[1] * along, cz = z + side[1] * out + side[0] * along, cy = y1 + r.range(0.1, 1.1) * s;
    b.box(cx - k, cy, cz - k, cx + k, cy + r.range(0.9, 1.3) * s, cz + k, shade(flank, r.range(0.9, 1.05)), { top: shade(g, r.range(0.92, 1.02)), foot: 0.76, bottom: true, away });
  }
}

/** A cypress: a dark, narrow column in three steps, a good block wide and five to six high. */
export function cypress(b: Batch, x: number, y: number, z: number, r: Rnd) {
  const g = r.pick(CYPRESS), s = r.range(0.85, 1.15), away = mix(g, FLANK_AWAY, 0.5);
  b.box(x - 0.16, y, z - 0.16, x + 0.16, y + 0.8, z + 0.16, TRUNK);
  b.box(x - 0.78, y + 0.6, z - 0.78, x + 0.78, y + 3.0 * s, z + 0.78, g, { foot: 0.74, bottom: true, top: shade(g, 1.25), away });
  b.box(x - 0.54, y + 3.0 * s, z - 0.54, x + 0.54, y + 4.5 * s, z + 0.54, shade(g, 1.05), { foot: 0.92, top: shade(g, 1.3), away });
  b.box(x - 0.3, y + 4.5 * s, z - 0.3, x + 0.3, y + 5.5 * s, z + 0.3, shade(g, 1.1), { top: shade(g, 1.35), away });
}

/**
 * A field. Wheat stands as single sheaves in rows; vines come as single plants on a grid (a green body under a yellow
 * head) or, every other field, as green hedges along x with yellow tips. The crops of the reference glow more than
 * the light allows: their sides turned from the sun are as bright as the lit ones. The `GLOW` colours (above 1) give
 * those sides that brightness.
 */
export function crops(b: Batch, g: Ground, at: P2, w: number, d: number, crop: Crop, r: Rnd) {
  const x0 = Math.round(at[0] - w / 2), z0 = Math.round(at[1] - d / 2);
  if (crop === 'wheat') {
    for (let row = 0; row + 1 <= w; row++) for (let k = 0; k + 1 <= d; k++) {
      const x = x0 + row + 0.5, z = z0 + k + 0.5;
      if (isWet(g, x, z)) continue;
      const y = groundY(g, x, z), top = y + 1.35 + 0.5 * hash2(row, k, 51);
      b.box(x - 0.36, y, z - 0.36, x + 0.36, top, z + 0.36, WHEAT_SIDE, { top: shade(WHEAT[Math.floor(hash2(row, k, 53) * WHEAT.length)], 1.2), foot: 0.85, away: WHEAT_GLOW });
    }
    return;
  }
  const hedges = hash2(x0, z0, 55) < 0.5, pitchX = hedges ? 0.92 : 1.3, pitchZ = hedges ? 2.2 : 1.2;
  for (let row = 0.6; row < w - 0.3; row += pitchX) for (let k = 0; k * pitchZ < d - 0.5; k++) {
    const x = x0 + row, z = z0 + k * pitchZ + 0.6, seed = Math.round(row * 10), lot = hash2(k, seed, 51);
    if (isWet(g, x, z) || lot < 0.04) continue;
    const y = groundY(g, x, z), c = VINE[Math.floor(hash2(k, seed, 59) * VINE.length)];
    if (hedges) {
      const h = 1.7 + 0.3 * lot;
      b.box(x - 0.46, y, z - 0.46, x + 0.46, y + h, z + 0.46, VINE_BODY, { top: mix(VINE_BODY, c, 0.75), foot: 0.7, away: HEDGE_GLOW });
      if (r.chance(0.55)) b.box(x - 0.3, y + h, z - 0.3, x + 0.3, y + h + 0.3, z + 0.3, VINE_SIDE, { top: c, away: VINE_GLOW });
    } else {
      const h = 1.7 + 0.6 * lot;
      // the green body shows under a smaller yellow head, so the field reads as speckled, not as one yellow sheet
      b.box(x - 0.44, y, z - 0.44, x + 0.44, y + h - 0.5, z + 0.44, VINE_BODY, { top: mix(VINE_BODY, c, 0.4), foot: 0.8, away: HEDGE_GLOW });
      b.box(x - 0.3, y + h - 0.5, z - 0.3, x + 0.3, y + h, z + 0.3, shade(VINE_SIDE, 0.9 + 0.2 * hash2(k, seed, 57)), { top: c, away: VINE_GLOW });
    }
    if (r.chance(0.5)) b.box(x + 0.4, y + 1.1, z - 0.1, x + 0.58, y + 1.36, z + 0.14, GRAPES, { bottom: true, away: [2.4, 1.0, 0.2] });
  }
}

/** A landing stage from the quay out over the water, along +x or +z. */
export function pier(b: Batch, x: number, z: number, dir: 'x' | 'z', length: number, deckY: number) {
  const half = 1.0;
  const [x0, x1, z0, z1] = dir === 'x' ? [x, x + length, z - half, z + half] : [x - half, x + half, z, z + length];
  b.box(x0, deckY - 0.3, z0, x1, deckY, z1, shade(DECK, 0.85), { top: DECK, bottom: true });
  const post = (px: number, pz: number) => {
    b.box(px - 0.26, SEA_Y - 1.2, pz - 0.26, px + 0.26, deckY + 0.9, pz + 0.26, POST, { foot: 0.6 });
    b.box(px - 0.26, deckY + 0.9, pz - 0.26, px + 0.26, deckY + 1.1, pz + 0.26, POST_CAP);
  };
  for (let k = 0.8; k < length - 1; k += 2.4) for (const side of [-1, 1]) {
    if (dir === 'x') post(x + k, z + side * (half + 0.15)); else post(x + side * (half + 0.15), z + k);
  }
  // a cross piece at the head makes a T, as on the landing stages of the reference
  const arm = 2.6, [hx0, hx1, hz0, hz1] = dir === 'x' ? [x + length - 1.6, x + length, z - arm, z + arm] : [x - arm, x + arm, z + length - 1.6, z + length];
  b.box(hx0, deckY - 0.3, hz0, hx1, deckY, hz1, shade(DECK, 0.85), { top: DECK, bottom: true });
  for (const px of [hx0, hx1]) for (const pz of [hz0, hz1]) post(px, pz);
}

/** A realm border: a band of low blocks along a line, one block wide, as in the reference image. */
export function borderBand(b: Batch, g: Ground, pts: readonly P2[], hex: number, blocked: (x: number, z: number) => boolean) {
  const base = rgb(hex), done = new Set<number>();
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], c = pts[i + 1], len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    for (let k = 0; k <= len; k += 0.25) {
      const wobble = (hash2(i, Math.floor(k / 4), 61) - 0.5) * 1.1;
      const x = Math.floor(a[0] + ((c[0] - a[0]) * k) / len + wobble), z = Math.floor(a[1] + ((c[1] - a[1]) * k) / len - wobble);
      const key = z * 4096 + x;
      if (done.has(key) || isWet(g, x + 0.5, z + 0.5) || blocked(x, z)) continue;
      done.add(key);
      const y = groundY(g, x + 0.5, z + 0.5), col = shade(base, 0.9 + 0.2 * hash2(x, z, 65));
      b.box(x + 0.02, y, z + 0.02, x + 0.98, y + 0.5 + 0.16 * hash2(x, z, 67), z + 0.98, col, { top: mix(col, rgb(0xffffff), 0.18), foot: 0.8 });
    }
  }
}

/** A cog with two sails, bow towards +x, waterline at y = 0; place it with `Batch.append`. */
function shipModel(): Batch {
  const b = new Batch();
  b.box(-3, -0.5, -1.2, 2.2, 0.85, 1.2, HULL, { top: SHIP_DECK, foot: 0.7 });
  b.box(2.2, -0.5, -0.85, 3.1, 0.85, 0.85, HULL, { top: SHIP_DECK, foot: 0.7 });
  b.box(3.1, -0.3, -0.45, 3.8, 0.95, 0.45, HULL_DARK, { foot: 0.7 });
  b.box(-3.6, -0.3, -1.05, -3, 1.6, 1.05, HULL_DARK, { top: SHIP_DECK, foot: 0.7 });
  b.box(-3, 0.85, -1.2, -1.6, 1.45, 1.2, HULL, { top: SHIP_DECK });
  for (const z of [-1.2, 1.08]) b.box(-1.6, 0.85, z, 2.2, 1.1, z + 0.12, HULL_DARK);
  const mast = (x: number, top: number) => b.box(x - 0.1, 0.85, -0.1, x + 0.1, top, 0.1, HULL_DARK);
  const sail = (x: number, y0: number, y1: number, half: number) => {
    b.box(x + 0.12, y0, -half, x + 0.3, y1, half, shade(SAIL, 0.9), { top: SAIL });
    b.box(x + 0.05, y1, -half - 0.1, x + 0.36, y1 + 0.14, half + 0.1, HULL_DARK);
  };
  mast(0.9, 6.2); sail(0.9, 1.7, 5.6, 1.75);
  mast(-1.1, 5.2); sail(-1.1, 1.9, 4.9, 1.45);
  mast(2.6, 3.4); sail(2.6, 1.5, 3.2, 0.9);
  b.box(0.3, 6.2, -0.04, 1.0, 6.8, 0.04, FLAG);
  b.box(0.45, 6.4, -0.06, 0.8, 6.6, 0.06, GOLD);
  return b;
}

export function ship(b: Batch, x: number, z: number, quarterTurns: number) {
  const size = 1.5, m = new THREE.Matrix4().makeRotationY((quarterTurns * Math.PI) / 2).scale(new THREE.Vector3(size, size, size)).setPosition(x, SEA_Y, z);
  b.append(shipModel(), m);
  // wake: short pale strokes behind the stern, as in the reference
  const ang = (quarterTurns * Math.PI) / 2, bx = -Math.cos(ang), bz = Math.sin(ang);
  for (let k = 0; k < 9; k++) for (const side of [-1, 1]) {
    const dist = 6 + k * 1.25, spread = side * (0.5 + k * 0.16);
    const wx = x + bx * dist - bz * spread, wz = z + bz * dist + bx * spread;
    const hx = Math.abs(bx) > 0.5 ? 0.5 : 0.2, hz = Math.abs(bx) > 0.5 ? 0.2 : 0.5;
    if (hash2(k, side, 71 + quarterTurns) < 0.8) b.box(wx - hx, SEA_Y, wz - hz, wx + hx, SEA_Y + 0.05, wz + hz, WAKE);
  }
  // foam where the hull cuts the water
  for (let k = 0; k < 14; k++) {
    const along = -4.6 + k * 0.75, side = k % 2 ? 1 : -1, wx = x - bx * along - bz * side * 1.9, wz = z - bz * along + bx * side * 1.9, q = 0.22 + 0.2 * hash2(k, 3, 73);
    if (hash2(k, 5, 75 + quarterTurns) < 0.7) b.box(wx - q, SEA_Y, wz - q, wx + q, SEA_Y + 0.06, wz + q, WAKE);
  }
}

/** A rowing boat on the water: a low hull with a pale inside, lying along x or z. */
export function boat(b: Batch, x: number, z: number, r: Rnd) {
  const [hx, hz] = r.chance(0.5) ? [1.1, 0.42] : [0.42, 1.1];
  b.box(x - hx, SEA_Y - 0.2, z - hz, x + hx, SEA_Y + 0.4, z + hz, HULL, { top: SHIP_DECK, foot: 0.7 });
  b.box(x - hx * 0.25, SEA_Y + 0.4, z - hz * 0.25, x + hx * 0.25, SEA_Y + 0.75, z + hz * 0.25, r.pick(CLOTHES));
}

export function person(b: Batch, x: number, y: number, z: number, r: Rnd) {
  const c = r.pick(CLOTHES);
  b.box(x - 0.17, y, z - 0.13, x + 0.17, y + 0.72, z + 0.13, c, { foot: 0.8 });
  b.box(x - 0.13, y + 0.72, z - 0.13, x + 0.13, y + 1.0, z + 0.13, SKIN);
}

/** Smoke over a chimney: a few pale blocks drifting to the left of the picture as they rise. */
export function smoke(b: Batch, x: number, y: number, z: number, r: Rnd) {
  const c = rgb(0xfbf6f0);
  for (let k = 0; k < 6; k++) {
    const s = 0.28 + k * 0.07, px = x - k * 0.35 + r.range(-0.2, 0.2), pz = z + k * 0.35 + r.range(-0.2, 0.2), py = y + k * 0.95;
    b.box(px - s, py, pz - s, px + s, py + s * 1.8, pz + s, c, { bottom: true });
  }
}

/** A market stall: four posts under a striped awning, a counter with goods. */
export function stall(b: Batch, x: number, y: number, z: number, r: Rnd) {
  const stripe = r.pick([rgb(0xd0453a), rgb(0x3f6f9a), rgb(0xd9a23a)]), white = rgb(0xf6efe2);
  for (const [px, pz] of [[-1, -0.7], [1, -0.7], [-1, 0.7], [1, 0.7]]) b.box(x + px - 0.07, y, z + pz - 0.07, x + px + 0.07, y + 1.5, z + pz + 0.07, POST);
  for (let k = 0; k < 5; k++) b.box(x - 1.15 + k * 0.46, y + 1.5, z - 0.85, x - 1.15 + (k + 1) * 0.46, y + 1.62, z + 0.85, k % 2 ? white : stripe, { bottom: true });
  b.box(x - 0.9, y, z - 0.4, x + 0.9, y + 0.6, z + 0.4, DECK, { top: r.pick(SPECKS) });
}

/** Goods on the quay: a crate or a barrel, sometimes two stacked. */
export function crate(b: Batch, x: number, y: number, z: number, r: Rnd) {
  const s = r.range(0.22, 0.34), c = r.pick([DECK, POST, rgb(0xc09a64), rgb(0x8a6a48)]);
  b.box(x - s, y, z - s, x + s, y + s * 2, z + s, shade(c, 0.9), { top: c, foot: 0.8 });
  if (r.chance(0.3)) b.box(x - s * 0.7, y + s * 2, z - s * 0.7, x + s * 0.7, y + s * 3.3, z + s * 0.7, c);
}

/** A flower or a stone in the grass: one tiny bright block. */
export function speck(b: Batch, x: number, y: number, z: number, r: Rnd) {
  const s = r.range(0.15, 0.26);
  b.box(x - s, y, z - s, x + s, y + s * 1.6, z + s, r.pick(SPECKS));
}

/** A low bush or tuft: one small dark green block. */
export function bush(b: Batch, x: number, y: number, z: number, r: Rnd) {
  const s = r.range(0.25, 0.5);
  b.box(x - s, y, z - s, x + s, y + s * r.range(0.9, 1.5), z + s, shade(r.pick(LEAVES), 0.92), { foot: 0.8 });
}

export function sheep(b: Batch, x: number, y: number, z: number, r: Rnd) {
  const along = r.chance(0.5), w = rgb(0xf0ece2);
  const [hx, hz] = along ? [0.32, 0.2] : [0.2, 0.32];
  b.box(x - hx, y + 0.12, z - hz, x + hx, y + 0.5, z + hz, w, { foot: 0.8, bottom: true });
  b.box(x + (along ? hx : -0.1), y + 0.3, z + (along ? -0.1 : hz), x + (along ? hx + 0.2 : 0.1), y + 0.55, z + (along ? 0.1 : hz + 0.2), rgb(0x3a3430));
}
