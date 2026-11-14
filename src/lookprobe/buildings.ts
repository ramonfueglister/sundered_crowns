// The smooth low-poly buildings of the reference image: houses with hip roofs, the bell tower, the domed church, the
// palace, a castle, village churches, bridges. Every builder returns a model around its own origin (ground at y = 0);
// the scene places it with `Batch.append`.
import { Batch, type RGB, type Rnd, type V3, rgb, shade } from './batch';

type Side = 'px' | 'pz' | 'nx' | 'nz';
const SIDES: readonly Side[] = ['px', 'pz', 'nx', 'nz'];
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

/** A hip roof over a rectangle; a square gives a pyramid. */
function hipRoof(b: Batch, x0: number, z0: number, x1: number, z1: number, y: number, h: number, c: RGB) {
  const alongX = x1 - x0 >= z1 - z0, s = Math.min(x1 - x0, z1 - z0) / 2, xc = (x0 + x1) / 2, zc = (z0 + z1) / 2, top = y + h;
  const a: V3 = alongX ? [x0 + s, top, zc] : [xc, top, z0 + s], e: V3 = alongX ? [x1 - s, top, zc] : [xc, top, z1 - s];
  b.quad([x0, y, z1], [x1, y, z1], e, alongX ? a : e, c, [0, 1, 1]);
  b.quad([x1, y, z0], [x0, y, z0], a, alongX ? e : a, c, [0, 1, -1]);
  b.quad([x1, y, z1], [x1, y, z0], alongX ? e : a, e, c, [1, 1, 0]);
  b.quad([x0, y, z0], [x0, y, z1], alongX ? a : e, a, c, [-1, 1, 0]);
}
/** A gable roof with the ridge along z; the two gable ends are filled in the wall colour. */
function gableRoofZ(b: Batch, x0: number, z0: number, x1: number, z1: number, y: number, h: number, c: RGB, wallC: RGB) {
  const xc = (x0 + x1) / 2, ov = 0.3, drop = (ov * h) / (xc - x0);
  b.quad([x1 + ov, y - drop, z1 + ov], [x1 + ov, y - drop, z0 - ov], [xc, y + h, z0 - ov], [xc, y + h, z1 + ov], c, [1, 1, 0]);
  b.quad([x0 - ov, y - drop, z0 - ov], [x0 - ov, y - drop, z1 + ov], [xc, y + h, z1 + ov], [xc, y + h, z0 - ov], c, [-1, 1, 0]);
  b.tri([x0, y, z1], [x1, y, z1], [xc, y + h, z1], wallC, wallC, wallC, [0, 0, 1]);
  b.tri([x1, y, z0], [x0, y, z0], [xc, y + h, z0], wallC, wallC, wallC, [0, 0, -1]);
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
function cone(b: Batch, cx: number, y: number, cz: number, r: number, h: number, c: RGB, segs = 10) {
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2, am = (a0 + a1) / 2;
    b.tri([cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r], [cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r], [cx, y + h, cz], c, c, c, [Math.cos(am), 0.5, Math.sin(am)]);
  }
}
/** A dome; `squash` above 1 makes it taller than a half sphere. */
function dome(b: Batch, cx: number, y: number, cz: number, r: number, c: RGB, squash = 1.1, segs = 12, rings = 4) {
  const p = (i: number, k: number): V3 => {
    const a = (i / segs) * Math.PI * 2, e = ((k / rings) * Math.PI) / 2;
    return [cx + Math.cos(a) * Math.cos(e) * r, y + Math.sin(e) * r * squash, cz + Math.sin(a) * Math.cos(e) * r];
  };
  for (let i = 0; i < segs; i++) {
    const am = ((i + 0.5) / segs) * Math.PI * 2;
    for (let k = 0; k < rings; k++) b.quad(p(i, k), p(i + 1, k), p(i + 1, k + 1), p(i, k + 1), c, [Math.cos(am), 0.4, Math.sin(am)]);
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

/** height of one storey; measured on the reference, where a house of two storeys is about four blocks to the eaves */
const FLOOR = 1.85;
const WINDOW = rgb(0x4a4c58), WINDOW_WARM = rgb(0x5c4a40), DOOR = rgb(0x70482c), FRAME = rgb(0xfdf6ea);
export const WALLS = [rgb(0xfbe9d6), rgb(0xfdf0e2), rgb(0xf6dfbc), rgb(0xf5d6c2), rgb(0xf2dab0), rgb(0xf8e4cc), rgb(0xeecf9e), rgb(0xfae6d8)];
export const ROOFS = [rgb(0xdc6e50), rgb(0xd26446), rgb(0xe27854), rgb(0xd0684c), rgb(0xde7250)];
const STONE = rgb(0xd8ccc0), STONE_DARK = rgb(0xb0a69c), BRICK = rgb(0xd0603c), MARBLE = rgb(0xfdf4ea);
const LEAD = rgb(0xb9b6bc), COPPER = rgb(0x6fb078), GOLD = rgb(0xf4c440), PINK = rgb(0xf6dccc);

/** A plain house: `w` along x, `d` along z, walls sunk one unit into the ground so that it sits on slopes. */
export function house(w: number, d: number, floors: number, wallC: RGB, roofC: RGB, r: Rnd): Batch {
  const b = new Batch(), x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2, top = floors * FLOOR + 0.3;
  b.box(x0, -1, z0, x1, top, z1, wallC, { foot: 0.86 });
  const doorSide = r.pick(SIDES), glass = r.chance(0.5) ? WINDOW : WINDOW_WARM;
  for (const s of SIDES) {
    const wl = wallOf(x0, z0, x1, z1, s), cols = spread(wl, Math.max(2, Math.round(wl.len / 1.7)), 0.15);
    const doorAt = s === doorSide ? r.int(0, cols.length - 1) : -1;
    for (let f = 0; f < floors; f++) cols.forEach((t, k) => {
      const y = f * FLOOR + 0.7;
      if (f === 0 && k === doorAt) arch(b, wl, t, 0, 0.32, 1.1, DOOR);
      else arch(b, wl, t, y, 0.23, y + 0.5, glass);
    });
  }
  const ov = 0.3, rise = (Math.min(w, d) / 2) * r.range(0.4, 0.52);
  b.box(x0 - ov, top, z0 - ov, x1 + ov, top + 0.14, z1 + ov, shade(roofC, 0.8));
  hipRoof(b, x0 - ov, z0 - ov, x1 + ov, z1 + ov, top + 0.14, rise, roofC);
  for (let k = r.int(0, 2); k > 0; k--) {
    const cx = r.range(x0 + 0.8, x1 - 0.8), cz = r.range(z0 + 0.8, z1 - 0.8);
    b.box(cx - 0.2, top + rise * 0.3, cz - 0.2, cx + 0.2, top + rise + 0.45, cz + 0.2, shade(wallC, 0.94), { top: shade(roofC, 0.7) });
  }
  return b;
}

/** The bell tower: brick shaft, white belfry with arches, attic, green spire. 4 × 4 at the foot, about 29 high. */
export function campanile(): Batch {
  const b = new Batch(), h = 2;
  b.box(-h - 0.25, -1, -h - 0.25, h + 0.25, 1.1, h + 0.25, STONE, { foot: 0.8 });
  b.box(-h, 1.1, -h, h, 17.5, h, BRICK, { foot: 0.86 });
  for (const s of SIDES) {
    const w = wallOf(-h, -h, h, h, s);
    for (const t of [1.0, 2.0, 3.0]) pane(b, w, t - 0.17, 2.2, t + 0.17, 16.6, shade(BRICK, 0.8));
  }
  b.box(-h - 0.3, 17.5, -h - 0.3, h + 0.3, 18.0, h + 0.3, MARBLE);
  b.box(-h - 0.05, 18.0, -h - 0.05, h + 0.05, 21.2, h + 0.05, MARBLE, { foot: 0.92 });
  for (const s of SIDES) {
    const w = wallOf(-h - 0.05, -h - 0.05, h + 0.05, h + 0.05, s);
    for (const t of spread(w, 4, 0.35)) arch(b, w, t, 18.35, 0.3, 20.2, rgb(0x3d4650));
  }
  b.box(-h - 0.35, 21.2, -h - 0.35, h + 0.35, 21.7, h + 0.35, MARBLE);
  b.box(-h + 0.2, 21.7, -h + 0.2, h - 0.2, 24.0, h - 0.2, BRICK, { foot: 0.9 });
  b.box(-h, 24.0, -h, h, 24.35, h, MARBLE);
  hipRoof(b, -h + 0.25, -h + 0.25, h - 0.25, h - 0.25, 24.35, 4.9, COPPER);
  b.box(-0.16, 28.9, -0.16, 0.16, 29.9, 0.16, GOLD);
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
    b.box(cx - 0.1, top + 2.1 + rad * 1.12, cz - 0.1, cx + 0.1, top + 2.7 + rad * 1.12, cz + 0.1, GOLD);
  };
  domeAt(0, 0, 2.5); domeAt(-3.9, 0, 1.75); domeAt(3.9, 0, 1.75); domeAt(0, -3.4, 1.75); domeAt(0, 3.1, 1.75);
  return b;
}

/** The palace, 16 × 13: two arcades below, a pale pink wall with large windows above, battlements, tiled roof. */
export function palace(): Batch {
  const b = new Batch(), x0 = -8, x1 = 8, z0 = -6.5, z1 = 6.5, top = 9.5, dark = rgb(0x4b4a50);
  b.box(x0, -1, z0, x1, top, z1, PINK, { foot: 0.9 });
  for (const s of SIDES) {
    const w = wallOf(x0, z0, x1, z1, s);
    pane(b, w, 0, 0, w.len, 5.3, MARBLE, 0.02);
    for (const t of spread(w, Math.round(w.len / 1.75), 0.2)) arch(b, w, t, 0, 0.58, 1.85, dark, 0.05);
    pane(b, w, 0, 2.75, w.len, 3.0, shade(MARBLE, 0.9), 0.06);
    for (const t of spread(w, Math.round(w.len / 0.9), 0.15)) arch(b, w, t, 3.1, 0.27, 4.45, dark, 0.05);
    pane(b, w, 0, 5.2, w.len, 5.5, shade(MARBLE, 0.9), 0.06);
    for (const t of spread(w, Math.max(3, Math.round(w.len / 2.7)), 0.8)) { arch(b, w, t, 6.3, 0.5, 7.9, FRAME, 0.05); arch(b, w, t, 6.4, 0.38, 7.85, dark, 0.07); }
  }
  battlements(b, x0, z0, x1, z1, top, MARBLE, 0.34, 0.45);
  hipRoof(b, x0 + 0.5, z0 + 0.5, x1 - 0.5, z1 - 0.5, top, 1.9, ROOFS[0]);
  return b;
}

/** A castle on its hill: curtain wall, four corner towers with pointed roofs, a keep. */
export function castle(): Batch {
  const b = new Batch(), s = 5.2, wallH = 4.2;
  b.box(-s, -2, -s, s, wallH, s, STONE, { foot: 0.8 });
  battlements(b, -s, -s, s, s, wallH, STONE, 0.5, 0.5);
  pane(b, wallOf(-s, -s, s, s, 'px'), s - 0.8, 0, s + 0.8, 2.2, rgb(0x4a3f38));
  for (const [tx, tz] of [[-s, -s], [s, -s], [s, s], [-s, s]] as const) {
    b.box(tx - 1.4, -2, tz - 1.4, tx + 1.4, 7, tz + 1.4, shade(STONE, 0.97), { foot: 0.8 });
    b.box(tx - 1.6, 7, tz - 1.6, tx + 1.6, 7.3, tz + 1.6, STONE_DARK);
    hipRoof(b, tx - 1.6, tz - 1.6, tx + 1.6, tz + 1.6, 7.3, 2.6, ROOFS[1]);
  }
  b.box(-2.2, wallH, -2.2, 2.2, 9.5, 2.2, shade(STONE, 1.03), { foot: 0.88 });
  battlements(b, -2.2, -2.2, 2.2, 2.2, 9.5, STONE, 0.5, 0.5);
  for (const sd of SIDES) { const w = wallOf(-2.2, -2.2, 2.2, 2.2, sd); for (const t of spread(w, 2, 0.4)) pane(b, w, t - 0.22, 6.6, t + 0.22, 7.7, WINDOW); }
  return b;
}

/** A village church: nave along z with a gable roof, a square tower at its -z end. */
export function church(r: Rnd): Batch {
  const b = new Batch(), wallC = r.pick([MARBLE, WALLS[0], WALLS[6]]), roofC = r.pick(ROOFS), th = r.range(9.5, 12);
  b.box(-2.6, -1, -3, 2.6, 4.2, 5, wallC, { foot: 0.84 });
  gableRoofZ(b, -2.6, -3, 2.6, 5, 4.2, 2.2, roofC, wallC);
  const front = wallOf(-2.6, -3, 2.6, 5, 'pz');
  arch(b, front, 2.6, 0, 0.6, 1.5, DOOR); arch(b, front, 2.6, 3.3, 0.45, 3.5, WINDOW);
  for (const s of ['px', 'nx'] as const) { const w = wallOf(-2.6, -3, 2.6, 5, s); for (const t of spread(w, 3, 0.6)) arch(b, w, t, 1.3, 0.32, 2.5, WINDOW); }
  b.box(-1.5, -1, -5.6, 1.5, th, -2.6, wallC, { foot: 0.86 });
  for (const s of SIDES) arch(b, wallOf(-1.5, -5.6, 1.5, -2.6, s), 1.5, th - 2.3, 0.42, th - 1.2, rgb(0x3d4650));
  b.box(-1.7, th, -5.8, 1.7, th + 0.25, -2.4, shade(roofC, 0.74));
  hipRoof(b, -1.7, -5.8, 1.7, -2.4, th + 0.25, 2.8, roofC);
  return b;
}

/** A round tower on an islet: white shaft, gallery, red cap. */
export function lighthouse(): Batch {
  const b = new Batch();
  drum(b, 0, -1, 0, 1.5, 7.2, MARBLE, 10, 0.82);
  drum(b, 0, 7.2, 0, 1.85, 7.6, STONE, 10);
  drum(b, 0, 7.6, 0, 1.0, 9.0, rgb(0xf2d27a), 8);
  cone(b, 0, 9.0, 0, 1.4, 1.9, ROOFS[1], 10);
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
