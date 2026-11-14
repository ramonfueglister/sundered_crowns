// The smooth low-poly buildings of the reference image: houses with hip roofs, the bell tower, the domed church, the
// palace, a castle, village churches, bridges. Every builder returns a model around its own origin (ground at y = 0);
// the scene places it with `Batch.append`.
import { Batch, type RGB, type Rnd, type V3, hash2, rgb, seeded, shade } from './batch';

type Side = 'px' | 'pz' | 'nx' | 'nz';
const SIDES: readonly Side[] = ['px', 'pz', 'nx', 'nz'];
/** a fixed random source for landmarks that exist once */
const seededFlat = () => seeded(977);
/** one wall of a box: `o` is its lower left corner seen from outside, `u` runs along it, `n` points outwards */
interface Wall { o: V3; u: V3; n: V3; len: number }
function wallOf(x0: number, z0: number, x1: number, z1: number, side: Side): Wall {
  if (side === 'pz') return { o: [x0, 0, z1], u: [1, 0, 0], n: [0, 0, 1], len: x1 - x0 };
  if (side === 'nz') return { o: [x1, 0, z0], u: [-1, 0, 0], n: [0, 0, -1], len: x1 - x0 };
  if (side === 'px') return { o: [x1, 0, z1], u: [0, 0, -1], n: [1, 0, 0], len: z1 - z0 };
  return { o: [x0, 0, z0], u: [0, 0, 1], n: [-1, 0, 0], len: z1 - z0 };
}
const LIFT = 0.04;
const on = (w: Wall, t: number, y: number, lift = LIFT): V3 => [w.o[0] + w.u[0] * t + w.n[0] * lift, y, w.o[2] + w.u[2] * t + w.n[2] * lift];
/** a flat rectangle on a wall (window, door, band) */
function pane(b: Batch, w: Wall, t0: number, y0: number, t1: number, y1: number, c: RGB, lift = LIFT) {
  b.quad(on(w, t0, y0, lift), on(w, t1, y0, lift), on(w, t1, y1, lift), on(w, t0, y1, lift), c, w.n);
}
/** a round-headed opening on a wall: `spring` is the height where the arch starts */
function arch(b: Batch, w: Wall, tc: number, y0: number, half: number, spring: number, c: RGB, lift = LIFT) {
  pane(b, w, tc - half, y0, tc + half, spring, c, lift);
  const rim: V3[] = [];
  for (let k = 0; k <= 6; k++) rim.push(on(w, tc + Math.cos((Math.PI * k) / 6) * half, spring + Math.sin((Math.PI * k) / 6) * half, lift));
  b.fan(on(w, tc, spring, lift), rim, c, w.n);
}
/** `n` evenly spaced items along a wall, with a margin at both ends */
const spread = (w: Wall, n: number, margin = 0): number[] => Array.from({ length: n }, (_, k) => margin + ((w.len - 2 * margin) * (k + 0.5)) / n);

const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/**
 * One roof slope from the eaves edge (e0 → e1) up to the ridge edge (r0 → r1), laid as a patchwork of tiles: `rows` up the
 * slope, a column about every block along it, each patch a touch lighter or darker.
 */
function slope(b: Batch, e0: V3, e1: V3, r0: V3, r1: V3, c: RGB, facing: V3, rows: number) {
  const cols = rows > 1 ? Math.max(1, Math.round(Math.hypot(e1[0] - e0[0], e1[2] - e0[2]) / 1.1)) : 1;
  for (let k = 0; k < rows; k++) for (let j = 0; j < cols; j++) {
    const t0 = k / rows, t1 = (k + 1) / rows, u0 = j / cols, u1 = (j + 1) / cols;
    // every other row of tiles a touch darker, every patch a touch lighter or darker
    const col = rows > 1 ? shade(c, (k % 2 ? 0.93 : 1.03) + 0.14 * hash2(Math.round(e0[0] * 7 + j * 3 + k), Math.round(e0[2] * 7 + k * 5 - j), 81)) : c;
    b.quad(lerp3(lerp3(e0, e1, u0), lerp3(r0, r1, u0), t0), lerp3(lerp3(e0, e1, u1), lerp3(r0, r1, u1), t0), lerp3(lerp3(e0, e1, u1), lerp3(r0, r1, u1), t1), lerp3(lerp3(e0, e1, u0), lerp3(r0, r1, u0), t1), col, facing);
  }
}
/** A hip roof over a rectangle; a square gives a pyramid. `rows` of tiles per slope, a paler cap along the ridge. */
function hipRoof(b: Batch, x0: number, z0: number, x1: number, z1: number, y: number, h: number, c: RGB, rows = 1) {
  const alongX = x1 - x0 >= z1 - z0, s = Math.min(x1 - x0, z1 - z0) / 2, xc = (x0 + x1) / 2, zc = (z0 + z1) / 2, top = y + h;
  const a: V3 = alongX ? [x0 + s, top, zc] : [xc, top, z0 + s], e: V3 = alongX ? [x1 - s, top, zc] : [xc, top, z1 - s];
  slope(b, [x0, y, z1], [x1, y, z1], alongX ? a : e, e, c, [0, 1, 1], rows);
  slope(b, [x1, y, z0], [x0, y, z0], alongX ? e : a, a, c, [0, 1, -1], rows);
  slope(b, [x1, y, z1], [x1, y, z0], e, alongX ? e : a, c, [1, 1, 0], rows);
  slope(b, [x0, y, z0], [x0, y, z1], a, alongX ? a : e, c, [-1, 1, 0], rows);
  if (rows <= 1) return;
  const k = 0.11, cap = shade(c, 1.14);
  if (Math.hypot(e[0] - a[0], e[2] - a[2]) > 0.4) b.box(Math.min(a[0], e[0]) - k, top - 0.05, Math.min(a[2], e[2]) - k, Math.max(a[0], e[0]) + k, top + 0.1, Math.max(a[2], e[2]) + k, cap);
  // a line of paler cap tiles down each hip
  for (const [cx, cz, end] of [[x0, z0, a], [x0, z1, alongX ? a : e], [x1, z1, e], [x1, z0, alongX ? e : a]] as const) {
    const len = Math.hypot(end[0] - cx, end[2] - cz), px = (-(end[2] - cz) / len) * k, pz = ((end[0] - cx) / len) * k;
    b.quad([cx - px, y + 0.05, cz - pz], [cx + px, y + 0.05, cz + pz], [end[0] + px, top + 0.05, end[2] + pz], [end[0] - px, top + 0.05, end[2] - pz], cap, [0, 1, 0]);
  }
}
/** A gable roof over a rectangle, ridge along its longer side, laid in tiles; the gable ends are filled in the wall colour. */
function gableRoof(b: Batch, x0: number, z0: number, x1: number, z1: number, y: number, h: number, c: RGB, wallC: RGB, rows = 3) {
  const top = y + h, w3: [RGB, RGB, RGB] = [wallC, wallC, wallC];
  if (x1 - x0 >= z1 - z0) {
    const zc = (z0 + z1) / 2;
    slope(b, [x0, y, z1], [x1, y, z1], [x0, top, zc], [x1, top, zc], c, [0, 1, 1], rows);
    slope(b, [x1, y, z0], [x0, y, z0], [x1, top, zc], [x0, top, zc], c, [0, 1, -1], rows);
    b.tri([x1, y, z1], [x1, y, z0], [x1, top, zc], ...w3, [1, 0, 0]);
    b.tri([x0, y, z0], [x0, y, z1], [x0, top, zc], ...w3, [-1, 0, 0]);
  } else {
    const xc = (x0 + x1) / 2;
    slope(b, [x1, y, z1], [x1, y, z0], [xc, top, z1], [xc, top, z0], c, [1, 1, 0], rows);
    slope(b, [x0, y, z0], [x0, y, z1], [xc, top, z0], [xc, top, z1], c, [-1, 1, 0], rows);
    b.tri([x0, y, z1], [x1, y, z1], [xc, top, z1], ...w3, [0, 0, 1]);
    b.tri([x1, y, z0], [x0, y, z0], [xc, top, z0], ...w3, [0, 0, -1]);
  }
}
/** An upright prism with `segs` sides, closed at the top. */
function drum(b: Batch, cx: number, y0: number, cz: number, r: number, y1: number, c: RGB, segs = 10, foot = 1) {
  const p = (i: number, y: number): V3 => [cx + Math.cos((i / segs) * Math.PI * 2) * r, y, cz + Math.sin((i / segs) * Math.PI * 2) * r];
  const lo = shade(c, foot), rim: V3[] = [];
  for (let i = 0; i < segs; i++) {
    const am = ((i + 0.5) / segs) * Math.PI * 2;
    b.quad(p(i, y0), p(i + 1, y0), p(i + 1, y1), p(i, y1), [lo, lo, c, c], [Math.cos(am), 0, Math.sin(am)]);
  }
  for (let i = 0; i <= segs; i++) rim.push(p(i, y1));
  b.fan([cx, y1, cz], rim, c, [0, 1, 0]);
}
/** A dome; `squash` above 1 makes it taller than a half sphere. */
function dome(b: Batch, cx: number, y: number, cz: number, r: number, c: RGB, squash = 1.1, segs = 12, rings = 4) {
  const p = (i: number, k: number): V3 => {
    const a = (i / segs) * Math.PI * 2, e = ((k / rings) * Math.PI) / 2;
    return [cx + Math.cos(a) * Math.cos(e) * r, y + Math.sin(e) * r * squash, cz + Math.sin(a) * Math.cos(e) * r];
  };
  for (let i = 0; i < segs; i++) {
    const am = ((i + 0.5) / segs) * Math.PI * 2;
    // every other gore a touch darker: the ribs of a lead roof
    for (let k = 0; k < rings; k++) b.quad(p(i, k), p(i + 1, k), p(i + 1, k + 1), p(i, k + 1), shade(c, i % 2 ? 0.93 : 1.03), [Math.cos(am), 0.4, Math.sin(am)]);
  }
}
/** A row of small blocks along the top edge of a box (battlements). */
function battlements(b: Batch, x0: number, z0: number, x1: number, z1: number, y: number, c: RGB, size = 0.5, h = 0.5) {
  for (const s of SIDES) {
    const w = wallOf(x0, z0, x1, z1, s), n = Math.max(2, Math.round(w.len / (size * 2)));
    for (let k = 0; k < n; k++) {
      const t = (w.len - size) * (k / (n - 1)), px = w.o[0] + w.u[0] * (t + size / 2) - w.n[0] * size / 2, pz = w.o[2] + w.u[2] * (t + size / 2) - w.n[2] * size / 2;
      b.box(px - size / 2, y, pz - size / 2, px + size / 2, y + h, pz + size / 2, c);
    }
  }
}

/** Height of a hip or gable roof above its eaves at (x, z); the roof covers x0 … x1 × z0 … z1 and rises by `rise`. */
function roofAt(x0: number, z0: number, x1: number, z1: number, rise: number, gable: boolean, x: number, z: number) {
  const alongX = x1 - x0 >= z1 - z0, half = Math.min(x1 - x0, z1 - z0) / 2;
  const across = alongX ? Math.min(z - z0, z1 - z) : Math.min(x - x0, x1 - x), along = alongX ? Math.min(x - x0, x1 - x) : Math.min(z - z0, z1 - z);
  return rise * Math.max(0, Math.min(1, (gable ? across : Math.min(across, along)) / half));
}

/** height of one storey; measured on the reference, where the window rows of the town houses lie 2 to 2.3 blocks apart */
export const FLOOR = 2.1;
const WINDOW = rgb(0x3c3e48), WINDOW_WARM = rgb(0x4a3a34), DOOR = rgb(0x5a3a26), FRAME = rgb(0xfdf6ea), DORMER = rgb(0x4e3630);
const SHUTTERS = [rgb(0x5f8a5a), rgb(0x8a5a3c), rgb(0x4f7a8a)];
export const WALLS = [rgb(0xf6e2cc), rgb(0xf6dfbc), rgb(0xf5d6c2), rgb(0xf2dab0), rgb(0xeecf9e), rgb(0xf2c4b4), rgb(0xe9c79a), rgb(0xf0d2b8), rgb(0xeebaa6), rgb(0xdcc6b4),
  rgb(0xf0c684), rgb(0xecc07a), rgb(0xf2c8ae), rgb(0xf6d0c4), rgb(0xf0c0ac)];
export const ROOFS = [rgb(0xf0805c), rgb(0xe87656), rgb(0xf29068), rgb(0xe67a5a), rgb(0xee8c64), rgb(0xe06e54)];
const STONE = rgb(0xd8ccc0), STONE_DARK = rgb(0xb0a69c), BRICK = rgb(0xd0603c), MARBLE = rgb(0xfdf4ea);
const LEAD = rgb(0xb9b6bc), COPPER = rgb(0x6fb078), GOLD = rgb(0xf4c440), PINK = rgb(0xf6dccc);

/**
 * One block of a house: walls with plinth, storey bands, windows and a door, under a tiled hip roof. The walls reach one
 * unit into the ground so that the block also sits on steps.
 */
function block(b: Batch, x0: number, z0: number, x1: number, z1: number, floors: number, wallC: RGB, roofC: RGB, r: Rnd, door = true) {
  const top = floors * FLOOR + 0.3, w = x1 - x0, d = z1 - z0;
  b.box(x0, -1, z0, x1, top, z1, wallC, { foot: 0.9 });
  const glass = r.chance(0.5) ? WINDOW : WINDOW_WARM, shutter = r.chance(0.08) ? r.pick(SHUTTERS) : null, arched = r.chance(0.25);
  for (const s of SIDES) {
    const wl = wallOf(x0, z0, x1, z1, s), cols = spread(wl, Math.max(1, Math.round(wl.len / 1.5)), 0.2);
    // a door on most walls of the ground floor, two on a long one
    const doors = new Set<number>();
    if (door) for (let k = wl.len > 9 ? 2 : r.chance(0.7) ? 1 : 0; k > 0; k--) doors.add(r.int(0, cols.length - 1));
    pane(b, wl, 0, 0, wl.len, 0.4, shade(wallC, 0.8), 0.02);
    for (let f = 1; f < floors; f++) pane(b, wl, 0, f * FLOOR + 0.2, wl.len, f * FLOOR + 0.32, shade(wallC, 1.06), 0.02);
    // the shadow line under the eaves, and patches of older plaster
    pane(b, wl, 0, top - 0.2, wl.len, top, shade(wallC, 0.7), 0.02);
    for (let k = Math.round(wl.len / 3) + r.int(0, 1); k > 0 && wl.len > 3; k--) {
      const t = r.range(0, wl.len - 2), y = r.range(0.4, top - 1.6);
      pane(b, wl, t, y, t + r.range(0.8, 2), y + r.range(0.5, 1.3), shade(wallC, r.chance(0.7) ? r.range(0.86, 0.94) : r.range(1.05, 1.1)), 0.015);
    }
    for (let f = 0; f < floors; f++) cols.forEach((t, k) => {
      const y = f * FLOOR + 0.72;
      if (f === 0 && doors.has(k)) { arch(b, wl, t, 0, 0.4, 1.15, DOOR, 0.05); return; }
      if (shutter) { pane(b, wl, t - 0.52, y, t - 0.29, y + 0.9, shutter); pane(b, wl, t + 0.29, y, t + 0.52, y + 0.9, shutter); }
      pane(b, wl, t - 0.38, y - 0.1, t + 0.38, y, shade(wallC, 1.1));
      if (arched) arch(b, wl, t, y, 0.3, y + 0.68, glass, 0.05); else pane(b, wl, t - 0.3, y, t + 0.3, y + 0.98, glass, 0.05);
    });
  }
  const ov = 0.2, rise = Math.min((Math.min(w, d) / 2) * r.range(0.26, 0.36), 1.5), gable = r.chance(0.3), eaves = top + 0.12;
  b.box(x0 - ov, top, z0 - ov, x1 + ov, eaves, z1 + ov, shade(roofC, 0.78));
  const rows = Math.max(4, Math.round(Math.min(w, d) / 0.7));
  if (gable) gableRoof(b, x0 - ov, z0 - ov, x1 + ov, z1 + ov, eaves, rise, roofC, wallC, rows);
  else hipRoof(b, x0 - ov, z0 - ov, x1 + ov, z1 + ov, eaves, rise, roofC, rows);
  // dormers, chimneys and hatches: the small clutter that makes the roofs of the reference lively
  for (let k = r.int(1, 2) + Math.round((w * d) / 5.5); k > 0; k--) {
    const cx = r.range(x0 + 0.7, x1 - 0.7), cz = r.range(z0 + 0.7, z1 - 0.7), under = eaves + roofAt(x0 - ov, z0 - ov, x1 + ov, z1 + ov, rise, gable, cx, cz), kind = r.next();
    if (kind < 0.7) {
      // a dormer: a dark opening under its own piece of roof
      const hw = r.range(0.16, 0.26);
      b.box(cx - hw, under - 0.3, cz - hw, cx + hw, under + r.range(0.2, 0.32), cz + hw, r.chance(0.25) ? DORMER : shade(roofC, 0.66), { top: shade(roofC, r.range(1.04, 1.16)) });
    } else if (kind < 0.86) {
      const sz = r.range(0.13, 0.2);
      b.box(cx - sz, under - 0.3, cz - sz, cx + sz, under + r.range(0.45, 0.8), cz + sz, r.chance(0.5) ? shade(roofC, 0.55) : rgb(0x6a5a58), { top: r.chance(0.6) ? rgb(0xf0e6dc) : shade(roofC, 0.6) });
    } else {
      // a hatch or a patch of new tiles: a pale spot lying on the slope
      const sz = r.range(0.16, 0.26);
      b.box(cx - sz, under - 0.3, cz - sz, cx + sz, under + 0.12, cz + sz, rgb(0xf2e2d2));
    }
  }
}

/** A plain house of one block: `w` along x, `d` along z. */
export function house(w: number, d: number, floors: number, wallC: RGB, roofC: RGB, r: Rnd): Batch {
  const b = new Batch();
  block(b, -w / 2, -d / 2, w / 2, d / 2, floors, wallC, roofC, r);
  return b;
}

/**
 * A larger town house inside a footprint of w × d: a main block with a lower wing in an L, or two blocks of different
 * height side by side, sometimes with a slim tower. This gives the broken roof line of the city in the reference.
 */
export function townHouse(w: number, d: number, floors: number, wallC: RGB, roofC: RGB, r: Rnd): Batch {
  const b = new Batch(), x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2, alongX = w >= d, wing = shade(wallC, r.range(0.94, 1.04));
  const cut = r.range(0.5, 0.68), low = Math.max(1, floors - 1);
  if (Math.min(w, d) >= 6 && r.chance(0.3)) {
    // three wings round a court that opens to one side
    const t = Math.min(w, d) * 0.36;
    if (alongX) { block(b, x0, z0, x1, z0 + t, floors, wallC, roofC, r); block(b, x0, z0 + t, x0 + t, z1, low, wing, roofC, r, false); block(b, x1 - t, z0 + t, x1, z1, low, wing, roofC, r, false); }
    else { block(b, x0, z0, x0 + t, z1, floors, wallC, roofC, r); block(b, x0 + t, z0, x1, z0 + t, low, wing, roofC, r, false); block(b, x0 + t, z1 - t, x1, z1, low, wing, roofC, r, false); }
  } else if (r.chance(0.5)) {
    // L: the main block takes one end at full depth, the wing the rest at part of the depth
    if (alongX) { block(b, x0, z0, x0 + w * cut, z1, floors, wallC, roofC, r); block(b, x0 + w * cut, z0, x1, z0 + d * r.range(0.55, 0.75), low, wing, roofC, r, false); }
    else { block(b, x0, z0, x1, z0 + d * cut, floors, wallC, roofC, r); block(b, x0, z0 + d * cut, x0 + w * r.range(0.55, 0.75), z1, low, wing, roofC, r, false); }
  } else if (alongX) { block(b, x0, z0, x0 + w * cut, z1, floors, wallC, roofC, r); block(b, x0 + w * cut, z0, x1, z1, low, wing, r.pick(ROOFS), r, false); }
  else { block(b, x0, z0, x1, z0 + d * cut, floors, wallC, roofC, r); block(b, x0, z0 + d * cut, x1, z1, low, wing, r.pick(ROOFS), r, false); }
  if (r.chance(0.12)) {
    const tx = x1 - 1.1, tz = z1 - 1.1, th = (floors + 1.3) * FLOOR;
    b.box(tx - 1, -1, tz - 1, tx + 1, th, tz + 1, shade(wallC, 0.97), { foot: 0.9 });
    for (const s of SIDES) arch(b, wallOf(tx - 1, tz - 1, tx + 1, tz + 1, s), 1, th - 1.1, 0.24, th - 0.6, WINDOW);
    b.box(tx - 1.2, th, tz - 1.2, tx + 1.2, th + 0.12, tz + 1.2, shade(roofC, 0.78));
    hipRoof(b, tx - 1.2, tz - 1.2, tx + 1.2, tz + 1.2, th + 0.12, 1.1, roofC, 3);
  }
  return b;
}

/** A slim town tower of brick with a pointed roof, as in the towns of the reference; 2.4 × 2.4, about 10 high. */
export function tower(r: Rnd): Batch {
  const b = new Batch(), h = 1.2, top = r.range(8, 10.5), c = r.pick([rgb(0xc98a64), rgb(0xd29a72), rgb(0xbf7f5c)]);
  b.box(-h, -1, -h, h, top, h, c, { foot: 0.88 });
  for (const s of SIDES) {
    const wl = wallOf(-h, -h, h, h, s);
    for (const y of [2.2, 4.4]) pane(b, wl, 1.05, y, 1.35, y + 0.7, WINDOW);
    for (const t of [0.75, 1.65]) arch(b, wl, t, top - 1.7, 0.26, top - 0.9, rgb(0x3d4650));
    pane(b, wl, 0, top - 2.2, wl.len, top - 2.05, shade(c, 1.12), 0.02);
  }
  b.box(-h - 0.18, top, -h - 0.18, h + 0.18, top + 0.16, h + 0.18, shade(c, 1.1));
  hipRoof(b, -h - 0.1, -h - 0.1, h + 0.1, h + 0.1, top + 0.16, 2.0, ROOFS[5], 4);
  return b;
}

/** The bell tower: brick shaft, white belfry with arches, brick band with a clock, green spire. 4 × 4, about 27 high. */
export function campanile(): Batch {
  const b = new Batch(), h = 2, dark = rgb(0x3d4650);
  b.box(-h - 0.2, -1, -h - 0.2, h + 0.2, 0.9, h + 0.2, STONE, { foot: 0.8 });
  b.box(-h, 0.9, -h, h, 13.2, h, BRICK, { foot: 0.88 });
  for (const s of SIDES) {
    const w = wallOf(-h, -h, h, h, s);
    for (const t of [0.8, 1.6, 2.4, 3.2]) pane(b, w, t - 0.14, 1.6, t + 0.14, 12.6, shade(BRICK, 0.8));
  }
  b.box(-h - 0.3, 13.2, -h - 0.3, h + 0.3, 13.7, h + 0.3, MARBLE);
  b.box(-h - 0.05, 13.7, -h - 0.05, h + 0.05, 17.0, h + 0.05, MARBLE, { foot: 0.92 });
  for (const s of SIDES) {
    const w = wallOf(-h - 0.05, -h - 0.05, h + 0.05, h + 0.05, s);
    for (const t of spread(w, 4, 0.35)) arch(b, w, t, 14.1, 0.3, 15.9, dark);
  }
  b.box(-h - 0.35, 17.0, -h - 0.35, h + 0.35, 17.45, h + 0.35, MARBLE);
  b.box(-h + 0.1, 17.45, -h + 0.1, h - 0.1, 19.4, h - 0.1, BRICK, { foot: 0.92 });
  for (const s of SIDES) { const w = wallOf(-h + 0.1, -h + 0.1, h - 0.1, h - 0.1, s); pane(b, w, 1.35, 17.85, 2.45, 18.95, MARBLE); pane(b, w, 1.5, 18.0, 2.3, 18.8, rgb(0xb0463a), 0.06); }
  b.box(-h - 0.2, 19.4, -h - 0.2, h + 0.2, 19.8, h + 0.2, MARBLE);
  hipRoof(b, -h - 0.05, -h - 0.05, h + 0.05, h + 0.05, 19.8, 6.0, COPPER);
  b.box(-0.14, 25.6, -0.14, 0.14, 27.0, 0.14, GOLD);
  b.box(-0.4, 26.3, -0.1, 0.4, 26.55, 0.1, GOLD);
  return b;
}

/** The domed church, 13 × 11, main front with five portals on +z. */
export function basilica(): Batch {
  const b = new Batch(), x0 = -6.5, x1 = 6.5, z0 = -5.5, z1 = 5.5, top = 6.2;
  b.box(x0, -1, z0, x1, top, z1, MARBLE, { foot: 0.84 });
  const front = wallOf(x0, z0, x1, z1, 'pz'), dark = rgb(0x4a3f3a), mosaic = rgb(0xd9a441);
  for (const [k, t] of spread(front, 5, 0.3).entries()) {
    const big = k === 2 ? 1.2 : 1;
    arch(b, front, t, 0, 0.92 * big, 2.3 * big, shade(STONE, 0.9), 0.03);
    arch(b, front, t, 0, 0.66 * big, 2.1 * big, dark, 0.06);
    arch(b, front, t, 2.2 * big, 0.6 * big, 2.2 * big, mosaic, 0.08);
    // the upper row: a window over each portal and a round gable standing above the roof line
    arch(b, front, t, top - 2.2, 0.62 * big, top - 0.9, k === 2 ? mosaic : rgb(0x55606c), 0.06);
    arch(b, front, t, top, 1.15 * big, top + 0.4, MARBLE, 0);
  }
  for (const s of ['px', 'nx', 'nz'] as const) {
    const w = wallOf(x0, z0, x1, z1, s);
    for (const t of spread(w, 5, 0.4)) { arch(b, w, t, 0.6, 0.55, 2.4, rgb(0x55606c)); arch(b, w, t, 3.6, 0.4, 4.8, rgb(0x55606c)); }
  }
  b.box(x0 - 0.2, top, z0 - 0.2, x1 + 0.2, top + 0.3, z1 - 0.5, STONE);
  const domeAt = (cx: number, cz: number, rad: number) => {
    drum(b, cx, top + 0.3, cz, rad * 0.92, top + 1.5, MARBLE, 12, 0.9);
    dome(b, cx, top + 1.5, cz, rad, LEAD, 1.15);
    drum(b, cx, top + 1.5 + rad * 1.12, cz, 0.22, top + 1.5 + rad * 1.12 + 0.6, MARBLE, 6);
    const tip = top + 2.1 + rad * 1.12;
    b.box(cx - 0.08, tip, cz - 0.08, cx + 0.08, tip + 1.0, cz + 0.08, MARBLE);
    b.box(cx - 0.08, tip + 0.55, cz - 0.34, cx + 0.08, tip + 0.72, cz + 0.34, MARBLE, { bottom: true });
  };
  for (const t of spread(front, 6, -0.9)) {
    b.box(x0 + t - 0.22, top, z1 - 0.45, x0 + t + 0.22, top + 1.5, z1, MARBLE, { foot: 0.92 });
    hipRoof(b, x0 + t - 0.3, z1 - 0.52, x0 + t + 0.3, z1 + 0.08, top + 1.5, 0.7, GOLD);
  }
  domeAt(0, 0, 3.2); domeAt(-4.3, 0, 1.9); domeAt(4.3, 0, 1.9); domeAt(0, -3.6, 1.9); domeAt(0, 3.3, 1.9);
  return b;
}

/** The palace, 9 × 20 (the long front along z, facing +x), 8.6 high: two arcades, a pale wall with windows, battlements, a court. */
export function palace(): Batch {
  const b = new Batch(), x0 = -4.5, x1 = 4.5, z0 = -10, z1 = 10, top = 8.6, dark = rgb(0x4b4a50), wing = 3.0, roof = rgb(0xc4bfc2);
  b.box(x0, -1, z0, x1, top, z0 + wing, PINK, { foot: 0.9, top: roof });
  b.box(x0, -1, z1 - wing, x1, top, z1, PINK, { foot: 0.9, top: roof });
  b.box(x0, -1, z0 + wing, x0 + wing, top, z1 - wing, PINK, { foot: 0.9, top: roof });
  b.box(x1 - wing, -1, z0 + wing, x1, top, z1 - wing, PINK, { foot: 0.9, top: roof });
  b.box(x0 + wing, -1, z0 + wing, x1 - wing, 0.05, z1 - wing, STONE);
  for (const s of SIDES) {
    const w = wallOf(x0, z0, x1, z1, s);
    pane(b, w, 0, 0, w.len, 4.9, MARBLE, 0.02);
    for (const t of spread(w, Math.round(w.len / 1.55), 0.2)) arch(b, w, t, 0, 0.52, 1.7, dark, 0.05);
    pane(b, w, 0, 2.55, w.len, 2.8, shade(MARBLE, 0.9), 0.06);
    for (const t of spread(w, Math.round(w.len / 0.8), 0.15)) arch(b, w, t, 2.9, 0.24, 4.1, dark, 0.05);
    pane(b, w, 0, 4.8, w.len, 5.08, shade(MARBLE, 0.9), 0.06);
    for (const t of spread(w, Math.max(3, Math.round(w.len / 2.6)), 0.8)) { arch(b, w, t, 5.8, 0.46, 7.2, FRAME, 0.05); arch(b, w, t, 5.9, 0.34, 7.15, dark, 0.07); }
  }
  battlements(b, x0, z0, x1, z1, top, MARBLE, 0.34, 0.55);
  return b;
}

/** A castle on its hill, 11 × 11: a curtain wall with square corner towers, a tall keep with a flag, a hall in the court. */
export function castle(): Batch {
  const b = new Batch(), s = 5.2, wallH = 4.2, c = rgb(0xb09c8c), flag = rgb(0xd23b2e);
  const slit = (x0: number, z0: number, x1: number, z1: number, y: number) => { for (const sd of SIDES) { const w = wallOf(x0, z0, x1, z1, sd); for (const t of spread(w, Math.max(1, Math.round(w.len / 2)), 0.3)) pane(b, w, t - 0.12, y, t + 0.12, y + 0.7, rgb(0x4a4038)); } };
  b.box(-s, -2, -s, s, wallH, s, c, { foot: 0.8, top: shade(c, 0.9) });
  b.box(-s + 1, wallH - 1.2, -s + 1, s - 1, wallH - 1.19, s - 1, shade(c, 0.7));
  battlements(b, -s, -s, s, s, wallH, c, 0.5, 0.55);
  slit(-s, -s, s, s, 2.4); slit(-s, -s, s, s, 0.9);
  arch(b, wallOf(-s, -s, s, s, 'px'), s, 0, 0.8, 1.6, rgb(0x4a3f38));
  for (const [tx, tz, th] of [[-s, -s, 7.2], [s, -s, 6.6], [s, s, 6.4], [-s, s, 6.6]] as const) {
    b.box(tx - 1.5, -2, tz - 1.5, tx + 1.5, th, tz + 1.5, shade(c, 1.03), { foot: 0.8, top: shade(c, 0.92) });
    battlements(b, tx - 1.5, tz - 1.5, tx + 1.5, tz + 1.5, th, c, 0.5, 0.55);
    slit(tx - 1.5, tz - 1.5, tx + 1.5, tz + 1.5, th - 1.8);
  }
  block(b, -2.6, -1.2, 1.6, 2.6, 2, shade(c, 1.08), ROOFS[1], seededFlat(), false);
  b.box(-3.6, -2, -3.6, -0.8, 10.2, -0.8, shade(c, 1.06), { foot: 0.86, top: shade(c, 0.92) });
  battlements(b, -3.6, -3.6, -0.8, -0.8, 10.2, c, 0.5, 0.55);
  slit(-3.6, -3.6, -0.8, -0.8, 7.6); slit(-3.6, -3.6, -0.8, -0.8, 4.8);
  // pointed tile roofs on the keep and on the tower beside the gate, as on the castle of the reference
  hipRoof(b, -3.3, -3.3, -1.1, -1.1, 10.2, 2.0, ROOFS[1], 3);
  hipRoof(b, s - 1.2, -s - 1.2, s + 1.2, -s + 1.2, 6.6, 1.8, ROOFS[3], 3);
  for (const [fx, fz, fy] of [[-2.2, -2.2, 12.2], [s, -s, 8.4], [-s, s, 6.6]] as const) {
    b.box(fx - 0.06, fy, fz - 0.06, fx + 0.06, fy + 2.2, fz + 0.06, rgb(0x6a4a30));
    b.box(fx - 0.9, fy + 1.5, fz - 0.03, fx - 0.06, fy + 2.15, fz + 0.03, flag, { bottom: true });
  }
  return b;
}

/**
 * A town wall round a rectangle of w × d: four runs with battlements, a turret on each corner, a gate in the middle of
 * the runs that face the viewer.
 */
export function townWall(w: number, d: number): Batch {
  const b = new Batch(), x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2, t = 0.8, h = 2.0, c = rgb(0xcdb89c), gate = 1.3;
  const run = (ax: number, az: number, bx: number, bz: number) => {
    b.box(ax, -1, az, bx, h, bz, c, { foot: 0.82, top: shade(c, 0.94) });
    battlements(b, ax, az, bx, bz, h, c, 0.4, 0.45);
  };
  run(x0, z0, x1, z0 + t); run(x0, z0, x0 + t, z1);
  run(x1 - t, z0, x1, -gate); run(x1 - t, gate, x1, z1);
  run(x0, z1 - t, -gate, z1); run(gate, z1 - t, x1, z1);
  for (const [tx, tz] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) {
    b.box(tx - 1, -1, tz - 1, tx + 1, 3.4, tz + 1, shade(c, 1.04), { foot: 0.82, top: shade(c, 0.94) });
    battlements(b, tx - 1, tz - 1, tx + 1, tz + 1, 3.4, c, 0.4, 0.45);
  }
  return b;
}

/** A village church: nave along z with a gable roof, a square tower at its -z end. */
export function church(r: Rnd): Batch {
  const b = new Batch(), wallC = r.pick([MARBLE, WALLS[0], WALLS[6]]), roofC = r.pick(ROOFS), th = r.range(9.5, 12);
  b.box(-2.6, -1, -3, 2.6, 4.2, 5, wallC, { foot: 0.84 });
  gableRoof(b, -2.9, -3.3, 2.9, 5.3, 4.2, 2.2, roofC, wallC, 4);
  const front = wallOf(-2.6, -3, 2.6, 5, 'pz');
  arch(b, front, 2.6, 0, 0.6, 1.5, DOOR); arch(b, front, 2.6, 3.3, 0.45, 3.5, WINDOW);
  for (const s of ['px', 'nx'] as const) { const w = wallOf(-2.6, -3, 2.6, 5, s); for (const t of spread(w, 3, 0.6)) arch(b, w, t, 1.3, 0.32, 2.5, WINDOW); }
  b.box(-1.5, -1, -5.6, 1.5, th, -2.6, wallC, { foot: 0.86 });
  for (const s of SIDES) arch(b, wallOf(-1.5, -5.6, 1.5, -2.6, s), 1.5, th - 2.3, 0.42, th - 1.2, rgb(0x3d4650));
  b.box(-1.7, th, -5.8, 1.7, th + 0.25, -2.4, shade(roofC, 0.74));
  hipRoof(b, -1.7, -5.8, 1.7, -2.4, th + 0.25, 2.8, roofC);
  return b;
}

/** A square stone tower in three steps on an islet, with a small lantern under a gilded tip. */
export function lighthouse(): Batch {
  const b = new Batch(), c = rgb(0xe6dcd2);
  let y = -1;
  for (const [half, top] of [[1.6, 3.2], [1.2, 6.0], [0.85, 7.6]] as const) {
    b.box(-half, y, -half, half, top, half, c, { foot: 0.84 });
    b.box(-half - 0.12, top - 0.25, -half - 0.12, half + 0.12, top, half + 0.12, shade(c, 1.05));
    for (const s of SIDES) arch(b, wallOf(-half, -half, half, half, s), half, top - 1.5, 0.22, top - 0.95, WINDOW);
    y = top;
  }
  b.box(-0.55, 7.6, -0.55, 0.55, 8.7, 0.55, rgb(0xe9a45c), { foot: 0.9 });
  hipRoof(b, -0.7, -0.7, 0.7, 0.7, 8.7, 0.7, ROOFS[1]);
  b.box(-0.1, 9.4, -0.1, 0.1, 10.0, 0.1, GOLD);
  return b;
}

/** A stone bridge along x over `span` units of water, deck at `rise` above its ends. */
export function bridge(span: number, width = 3): Batch {
  const b = new Batch(), half = span / 2 + 1.6, hw = width / 2, c = rgb(0xd3c7b4), steps = 5;
  for (let k = 0; k < steps; k++) {
    // a stepped hump: the middle pieces lie highest
    const t0 = -half + (2 * half * k) / steps, t1 = -half + (2 * half * (k + 1)) / steps, y = 0.25 + 0.5 * (1 - Math.abs((k + 0.5) / steps - 0.5) * 2);
    b.box(t0, -1.6, -hw, t1, y, hw, shade(c, 0.9), { top: c, foot: 0.7 });
    for (const z of [-hw - 0.2, hw]) b.box(t0, y - 0.3, z, t1, y + 0.55, z + 0.2, shade(c, 0.96), { bottom: true });
  }
  return b;
}
