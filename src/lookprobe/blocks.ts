// The blocky things of the reference image: trees, crops, piers, border bands, ships, figures. All plain boxes.
import * as THREE from 'three/webgpu';
import { Batch, type RGB, type Rnd, hash2, mix, rgb, shade } from './batch';
import { type Crop, type Ground, type P2, SEA_Y, groundY, isWet } from './layout';

const TRUNK = rgb(0x6b4a2f);
const LEAVES = [rgb(0x5c9a34), rgb(0x69a638), rgb(0x4f8c32), rgb(0x74ae3c), rgb(0x478232)];
const CYPRESS = [rgb(0x327234), rgb(0x2c6831), rgb(0x387a38)];
const WHEAT = [rgb(0xf4c84c), rgb(0xecbc42), rgb(0xf8d058)];
const VINE = [rgb(0x86aa34), rgb(0x9ab83a), rgb(0x76a030), rgb(0xaac040)];
const POST = rgb(0x93552f), POST_CAP = rgb(0xf1e8dc), DECK = rgb(0xa9744a);
const HULL = rgb(0x8a5a36), HULL_DARK = rgb(0x6f4528), SHIP_DECK = rgb(0xb48f62), SAIL = rgb(0xf3ecde), FLAG = rgb(0xd23b2e), GOLD = rgb(0xf0c040);
const WAKE = rgb(0xd5eeee);
const SKIN = rgb(0xe2b48c);
const CLOTHES = [rgb(0x8a3b2e), rgb(0x3f5f8a), rgb(0xcaa24a), rgb(0x5a7a3a), rgb(0x6a4a7a), rgb(0xd8d0c0)];

/** A leafy tree: a short trunk under a tall crown of a few blocks; about two blocks wide and four high. */
export function tree(b: Batch, x: number, y: number, z: number, r: Rnd) {
  const g = r.pick(LEAVES), s = r.range(0.85, 1.15);
  b.box(x - 0.22, y, z - 0.22, x + 0.22, y + 1.3 * s, z + 0.22, TRUNK, { foot: 0.75 });
  const w = 0.9 * s, y1 = y + 0.9 * s, y2 = y1 + 2.3 * s;
  b.box(x - w, y1, z - w, x + w, y2, z + w, g, { foot: 0.7, bottom: true });
  const ox = r.range(-0.25, 0.25) * s, oz = r.range(-0.25, 0.25) * s, t = 0.58 * s;
  b.box(x + ox - t, y2, z + oz - t, x + ox + t, y2 + 0.7 * s, z + oz + t, shade(g, 1.08), { foot: 0.92 });
  // lumps on the sides break the cube outline, as on the trees of the reference
  for (const side of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    if (!r.chance(0.6)) continue;
    const k = r.range(0.4, 0.58) * s, out = w + k * 0.4, along = r.range(-0.35, 0.35) * s;
    const cx = x + side[0] * out + side[1] * along, cz = z + side[1] * out + side[0] * along, cy = y1 + r.range(0.1, 1.1) * s;
    b.box(cx - k, cy, cz - k, cx + k, cy + r.range(0.9, 1.3) * s, cz + k, shade(g, r.range(0.9, 1.06)), { foot: 0.8, bottom: true });
  }
}

/** A cypress: a dark, narrow column in three steps, a good block wide and five to six high. */
export function cypress(b: Batch, x: number, y: number, z: number, r: Rnd) {
  const g = r.pick(CYPRESS), s = r.range(0.85, 1.15);
  b.box(x - 0.16, y, z - 0.16, x + 0.16, y + 0.8, z + 0.16, TRUNK);
  b.box(x - 0.6, y + 0.6, z - 0.6, x + 0.6, y + 3.4 * s, z + 0.6, g, { foot: 0.74, bottom: true });
  b.box(x - 0.44, y + 3.4 * s, z - 0.44, x + 0.44, y + 4.7 * s, z + 0.44, shade(g, 1.05), { foot: 0.92 });
  b.box(x - 0.24, y + 4.7 * s, z - 0.24, x + 0.24, y + 5.5 * s, z + 0.24, shade(g, 1.1));
}

/** A field: wheat stands in rows of tall sheaves along z, vines in rows of bushy lumps along x. */
export function crops(b: Batch, g: Ground, at: P2, w: number, d: number, crop: Crop, r: Rnd) {
  const x0 = Math.round(at[0] - w / 2), z0 = Math.round(at[1] - d / 2), wheat = crop === 'wheat';
  const pitch = wheat ? 1.3 : 1.7, across = wheat ? w : d, along = wheat ? d : w;
  for (let row = 0.6; row < across - 0.3; row += pitch) for (let k = 0; k < along; k++) {
    // centre of this plant: rows of wheat step along x, rows of vines along z
    const x = wheat ? x0 + row : x0 + k + 0.5, z = wheat ? z0 + k + 0.5 : z0 + row, seed = Math.round(row * 10);
    if (isWet(g, x, z)) continue;
    const y = groundY(g, x, z), lot = hash2(k, seed, 51);
    const [hx, hz] = wheat ? [0.4, 0.47] : [0.46, 0.42];
    if (wheat) {
      const c = WHEAT[Math.floor(hash2(k, seed, 53) * WHEAT.length)];
      b.box(x - hx, y, z - hz, x + hx, y + 1.45 + 0.4 * lot, z + hz, shade(c, 0.9), { top: c, foot: 0.7 });
    } else if (lot > 0.07) {
      const c = VINE[Math.floor(hash2(k, seed, 59) * VINE.length)], h = 1.0 + 0.45 * lot;
      b.box(x - hx, y, z - hz, x + hx, y + h, z + hz, shade(c, 0.86), { top: c, foot: 0.62 });
      if (r.chance(0.5)) b.box(x - 0.26, y + h, z - 0.24, x + 0.26, y + h + 0.32, z + 0.24, shade(c, 1.1));
    }
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

/** Smoke over a chimney: a few pale blocks drifting to the left of the picture as they rise. */
export function smoke(b: Batch, x: number, y: number, z: number, r: Rnd) {
  const c = rgb(0xfbf6f0);
  for (let k = 0; k < 6; k++) {
    const s = 0.28 + k * 0.07, px = x - k * 0.35 + r.range(-0.2, 0.2), pz = z + k * 0.35 + r.range(-0.2, 0.2), py = y + k * 0.95;
    b.box(px - s, py, pz - s, px + s, py + s * 1.8, pz + s, c, { bottom: true });
  }
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
