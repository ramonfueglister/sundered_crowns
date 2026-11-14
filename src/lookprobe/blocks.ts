// The blocky things of the reference image: trees, crops, piers, border bands, ships, figures. All plain boxes.
import * as THREE from 'three/webgpu';
import { Batch, type RGB, type Rnd, hash2, mix, rgb, shade } from './batch';
import { type Crop, type Ground, type P2, SEA_Y, groundY, isWet } from './layout';

const TRUNK = rgb(0x6b4a2f);
const LEAVES = [rgb(0x5f9230), rgb(0x6a9c34), rgb(0x548731), rgb(0x7aa338), rgb(0x4c8234)];
const CYPRESS = [rgb(0x3a7a36), rgb(0x336f33), rgb(0x41833a)];
const WHEAT = [rgb(0xecb63e), rgb(0xe2ab38), rgb(0xf2c04a)];
const VINE = [rgb(0x6a9a30), rgb(0x80a834), rgb(0x5a8c2e), rgb(0x98b03a)];
const GRAPE = rgb(0xd98a2e);
const POST = rgb(0x93552f), POST_CAP = rgb(0xf1e8dc), DECK = rgb(0xa9744a);
const HULL = rgb(0x8a5a36), HULL_DARK = rgb(0x6f4528), SHIP_DECK = rgb(0xb48f62), SAIL = rgb(0xf3ecde), FLAG = rgb(0xd23b2e), GOLD = rgb(0xf0c040);
const WAKE = rgb(0xd5eeee);
const SKIN = rgb(0xe2b48c);
const CLOTHES = [rgb(0x8a3b2e), rgb(0x3f5f8a), rgb(0xcaa24a), rgb(0x5a7a3a), rgb(0x6a4a7a), rgb(0xd8d0c0)];

/** A leafy tree: trunk, a tall block of leaves, a smaller block on top; about five blocks high. */
export function tree(b: Batch, x: number, y: number, z: number, r: Rnd) {
  const g = r.pick(LEAVES), s = r.range(0.82, 1.15);
  b.box(x - 0.28, y, z - 0.28, x + 0.28, y + 1.6 * s, z + 0.28, TRUNK, { foot: 0.75 });
  const w = 1.3 * s, y1 = y + 1.25 * s, y2 = y1 + 2.5 * s;
  b.box(x - w, y1, z - w, x + w, y2, z + w, g, { foot: 0.78, bottom: true });
  const ox = r.range(-0.35, 0.35) * s, oz = r.range(-0.35, 0.35) * s, t = 0.85 * s;
  b.box(x + ox - t, y2, z + oz - t, x + ox + t, y2 + 1.15 * s, z + oz + t, shade(g, 1.05), { foot: 0.9 });
  if (r.chance(0.45)) {
    // a side lump breaks the cube outline
    const side = r.pick([[1, 0], [-1, 0], [0, 1], [0, -1]] as const), k = 0.7 * s;
    const cx = x + side[0] * w, cz = z + side[1] * w, cy = y1 + r.range(0.3, 0.9) * s;
    b.box(cx - k, cy, cz - k, cx + k, cy + 1.3 * s, cz + k, shade(g, 0.96), { foot: 0.84, bottom: true });
  }
}

/** A cypress: a dark, narrow column in three steps, about six blocks high. */
export function cypress(b: Batch, x: number, y: number, z: number, r: Rnd) {
  const g = r.pick(CYPRESS), s = r.range(0.85, 1.2);
  b.box(x - 0.2, y, z - 0.2, x + 0.2, y + 0.8, z + 0.2, TRUNK);
  b.box(x - 0.8, y + 0.7, z - 0.8, x + 0.8, y + 3.6 * s, z + 0.8, g, { foot: 0.76, bottom: true });
  b.box(x - 0.58, y + 3.6 * s, z - 0.58, x + 0.58, y + 5.1 * s, z + 0.58, shade(g, 1.04), { foot: 0.92 });
  b.box(x - 0.32, y + 5.1 * s, z - 0.32, x + 0.32, y + 6.0 * s, z + 0.32, shade(g, 1.08));
}

/** A field of rows running along x. */
export function crops(b: Batch, g: Ground, at: P2, w: number, d: number, crop: Crop, r: Rnd) {
  const x0 = Math.round(at[0] - w / 2), z0 = Math.round(at[1] - d / 2);
  const pitch = crop === 'wheat' ? 1.25 : 1.5;
  for (let rz = 0.5; rz < d - 0.2; rz += pitch) {
    for (let cx = 0; cx < w; cx++) {
      const x = x0 + cx, z = z0 + rz;
      if (isWet(g, x + 0.5, z)) continue;
      const y = groundY(g, x + 0.5, z);
      if (crop === 'wheat') {
        const h = 1.05 + 0.35 * hash2(x, Math.round(z * 10), 51), c = WHEAT[Math.floor(hash2(x, Math.round(z * 10), 53) * WHEAT.length)];
        b.box(x + 0.03, y, z - 0.44, x + 0.97, y + h, z + 0.44, shade(c, 0.92), { top: c, foot: 0.78 });
      } else {
        if (hash2(x, Math.round(z * 10), 55) < 0.08) continue;
        const h = 0.95 + 0.4 * hash2(x, Math.round(z * 10), 57), c = VINE[Math.floor(hash2(x, Math.round(z * 10), 59) * VINE.length)];
        b.box(x + 0.1, y, z - 0.45, x + 0.9, y + h, z + 0.45, shade(c, 0.9), { top: c, foot: 0.7 });
        if (r.chance(0.35)) b.box(x + 0.3, y + h, z - 0.2, x + 0.7, y + h + 0.3, z + 0.2, GRAPE);
      }
    }
  }
}

/** A landing stage from the quay out over the water, along +x or +z. */
export function pier(b: Batch, x: number, z: number, dir: 'x' | 'z', length: number, deckY: number) {
  const half = 1.0;
  const [x0, x1, z0, z1] = dir === 'x' ? [x, x + length, z - half, z + half] : [x - half, x + half, z, z + length];
  b.box(x0, deckY - 0.3, z0, x1, deckY, z1, shade(DECK, 0.85), { top: DECK, bottom: true });
  for (let k = 0.6; k < length + 0.1; k += 2.2) for (const side of [-1, 1]) {
    const px = dir === 'x' ? x + k : x + side * (half + 0.12), pz = dir === 'x' ? z + side * (half + 0.12) : z + k;
    b.box(px - 0.2, SEA_Y - 1.2, pz - 0.2, px + 0.2, deckY + 0.75, pz + 0.2, POST, { foot: 0.6 });
    b.box(px - 0.2, deckY + 0.75, pz - 0.2, px + 0.2, deckY + 0.95, pz + 0.2, POST_CAP);
  }
}

/** A realm border: a band of low blocks along a line, one block wide, as in the reference image. */
export function borderBand(b: Batch, g: Ground, pts: readonly P2[], hex: number, blocked: (x: number, z: number) => boolean) {
  const base = rgb(hex), pale = mix(base, rgb(0xffffff), 0.75), done = new Set<number>();
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], c = pts[i + 1], len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    for (let k = 0; k <= len; k += 0.5) {
      const wobble = (hash2(i, Math.floor(k / 3), 61) - 0.5) * 1.6;
      const x = Math.floor(a[0] + ((c[0] - a[0]) * k) / len + wobble), z = Math.floor(a[1] + ((c[1] - a[1]) * k) / len - wobble);
      const key = z * 4096 + x;
      if (done.has(key) || isWet(g, x + 0.5, z + 0.5) || blocked(x, z)) continue;
      done.add(key);
      const y = groundY(g, x + 0.5, z + 0.5), col = hash2(x, z, 63) < 0.1 ? pale : shade(base, 0.88 + 0.24 * hash2(x, z, 65));
      b.box(x + 0.04, y, z + 0.04, x + 0.96, y + 0.42 + 0.14 * hash2(x, z, 67), z + 0.96, col, { foot: 0.78 });
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
  const size = 1.3, m = new THREE.Matrix4().makeRotationY((quarterTurns * Math.PI) / 2).scale(new THREE.Vector3(size, size, size)).setPosition(x, SEA_Y, z);
  b.append(shipModel(), m);
  // wake: short pale strokes behind the stern, as in the reference
  const ang = (quarterTurns * Math.PI) / 2, bx = -Math.cos(ang), bz = Math.sin(ang);
  for (let k = 0; k < 9; k++) for (const side of [-1, 1]) {
    const dist = 6 + k * 1.25, spread = side * (0.5 + k * 0.16);
    const wx = x + bx * dist - bz * spread, wz = z + bz * dist + bx * spread;
    const hx = Math.abs(bx) > 0.5 ? 0.34 : 0.12, hz = Math.abs(bx) > 0.5 ? 0.12 : 0.34;
    if (hash2(k, side, 71 + quarterTurns) < 0.8) b.box(wx - hx, SEA_Y, wz - hz, wx + hx, SEA_Y + 0.03, wz + hz, WAKE);
  }
}

export function person(b: Batch, x: number, y: number, z: number, r: Rnd) {
  const c = r.pick(CLOTHES);
  b.box(x - 0.17, y, z - 0.13, x + 0.17, y + 0.72, z + 0.13, c, { foot: 0.8 });
  b.box(x - 0.13, y + 0.72, z - 0.13, x + 0.13, y + 1.0, z + 0.13, SKIN);
}

export function sheep(b: Batch, x: number, y: number, z: number, r: Rnd) {
  const along = r.chance(0.5), w = rgb(0xf0ece2);
  const [hx, hz] = along ? [0.32, 0.2] : [0.2, 0.32];
  b.box(x - hx, y + 0.12, z - hz, x + hx, y + 0.5, z + hz, w, { foot: 0.8, bottom: true });
  b.box(x + (along ? hx : -0.1), y + 0.3, z + (along ? -0.1 : hz), x + (along ? hx + 0.2 : 0.1), y + 0.55, z + (along ? 0.1 : hz + 0.2), rgb(0x3a3430));
}
