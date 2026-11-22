// The cathedral of the Paris probe (PROTOTYPE, 22 Nov 2026), as Ramon's reference picture of the Île de la Cité shows
// Notre-Dame: a front of two flat-topped towers over three portals, a gallery and a rose; a high nave under slate
// between lower aisles, with flying buttresses; a round apse; a thin spire on the ridge. Its stone is smooth, as the
// picture draws it, and takes its relief from buttresses, string courses and pointed openings. Every size here is
// read off that picture: OWN RULE for the prototype.
import { type Wall, pane, wallOf } from '../buildings';
import { gableRoof } from '../buildings/core/roofs';
import { battlements } from '../buildings/core/solids';
import { on } from '../buildings/core/wall';
import { type Batch, type RGB, type V3, rgb, shade } from './batch';
import { LAND_Y } from './layout';
import { type Rect, SLATE, STONE, pyramid } from './paris_stone';

/** the dark of a window, the wood of a door, the stone of a recess (a portal's jambs, a gallery's arcade) */
const GLASS = rgb(0x3a3230),
  DOOR = rgb(0x7a5236),
  DEEP = shade(STONE, 0.42);
/** half the front, a tower's side, the towers' height; the aisles' half width and height; the nave's; a bay */
const HALF = 6,
  TOWER = 4,
  TOWER_H = 15,
  AISLE = 5,
  AISLE_H = 5,
  NAVE = 2.6,
  NAVE_H = 10,
  RIDGE = 3,
  BAY = 2.6,
  BAYS = 5;
/** the cathedral's footprint: across its front, and from its front to the end of its apse */
export const CATHEDRAL = { width: 2 * HALF, length: TOWER + BAYS * BAY + AISLE };

const unit = (x: number, y: number, z: number): V3 => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
};

/** A pointed opening on a wall: upright to `spring`, over it two arcs that meet in a point (struck from the far foot each). */
function lancet(b: Batch, w: Wall, tc: number, y0: number, half: number, spring: number, c: RGB, lift: number) {
  pane(b, w, tc - half, y0, tc + half, spring, c, lift);
  const rim: V3[] = [];
  for (let k = 0; k <= 8; k++) {
    const a = (Math.PI / 3) * (k <= 4 ? k / 4 : (8 - k) / 4),
      x = (k <= 4 ? -1 : 1) * half * (1 - 2 * Math.cos(a));
    rim.push(on(w, tc - x, spring + 2 * half * Math.sin(a), lift));
  }
  b.fan(on(w, tc, spring, lift), rim, c, w.n);
}

/** A box of smooth stone; its two sides turned from the light are a little darker at the foot. */
const stone = (b: Batch, [x0, z0, x1, z1]: Rect, y0: number, y1: number, tone = 1) =>
  b.box(x0, y0, z0, x1, y1, z1, shade(STONE, tone), { top: shade(STONE, tone * 0.97), foot: 0.9 });

/**
 * A buttress: a pier at (x, z) with a pinnacle, and from it a flying arch, a sloping bar of stone, up to the nave's
 * wall, which lies `reach` away in the direction (dx, dz).
 */
function buttress(b: Batch, x: number, z: number, dx: number, dz: number, reach: number) {
  const y = LAND_Y,
    c = shade(STONE, 1.03);
  stone(b, [x - 0.42, z - 0.42, x + 0.42, z + 0.42], y - 1, y + 3.6, 0.96);
  stone(b, [x - 0.3, z - 0.3, x + 0.3, z + 0.3], y + 3.6, y + 7.2);
  pyramid(b, x, z, 0.3, y + 7.2, 1.2, c);
  // the bar: its two cheeks and its back, from the pier's head to the wall
  const px = -dz * 0.16,
    pz = dx * 0.16,
    [ax, az, bx, bz] = [x + dx * 0.3, z + dz * 0.3, x + dx * reach, z + dz * reach],
    [ya, yb, thick] = [y + 6.1, y + 8.7, 0.55];
  for (const s of [-1, 1])
    b.quad(
      [ax + s * px, ya, az + s * pz],
      [bx + s * px, yb, bz + s * pz],
      [bx + s * px, yb + thick, bz + s * pz],
      [ax + s * px, ya + thick, az + s * pz],
      shade(c, s > 0 === px + pz > 0 ? 1 : 0.8),
      unit(s * px, 0, s * pz),
    );
  b.quad(
    [ax - px, ya + thick, az - pz],
    [ax + px, ya + thick, az + pz],
    [bx + px, yb + thick, bz + pz],
    [bx - px, yb + thick, bz - pz],
    c,
    unit(-dx * (yb - ya), reach, -dz * (yb - ya)),
  );
}

/** The round apse behind (xc, za): the ambulatory and over it the choir, each a half ring of walls under slate. */
function apse(b: Batch, xc: number, za: number) {
  const y = LAND_Y,
    n = 7,
    at = (r: number, k: number): [number, number] => [
      xc + r * Math.cos((Math.PI * k) / n),
      za - r * Math.sin((Math.PI * k) / n),
    ];
  for (const [r, y0, y1, roofTo, rise] of [
    [AISLE, y - 1, y + AISLE_H, NAVE, 1.3],
    [NAVE, y + AISLE_H, y + NAVE_H, 0, RIDGE],
  ] as const)
    for (let k = 0; k < n; k++) {
      const [ax, az] = at(r, k),
        [bx, bz] = at(r, k + 1),
        len = Math.hypot(bx - ax, bz - az),
        out = unit((ax + bx) / 2 - xc, 0, (az + bz) / 2 - za),
        w: Wall = { o: [ax, 0, az], u: [(bx - ax) / len, 0, (bz - az) / len], n: out, len };
      b.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], STONE, out);
      // only the walls turned to the picture's camera get their window
      if (out[0] > 0.2) lancet(b, w, len / 2, y0 + (r === AISLE ? 2.2 : 1.5), 0.4, y1 - 2.2, GLASS, 0.05);
      const [cx, cz] = at(roofTo, k),
        [dx, dz] = at(roofTo, k + 1);
      b.quad([ax, y1, az], [bx, y1, bz], [dx, y1 + rise, dz], [cx, y1 + rise, cz], SLATE, unit(out[0], 1.2, out[2]));
    }
  for (let k = 0; k <= n; k++) {
    const [px, pz] = at(AISLE + 0.5, k),
      l = Math.hypot(px - xc, pz - za);
    buttress(b, px, pz, (xc - px) / l, (za - pz) / l, AISLE + 0.5 - NAVE);
  }
}

/** The rose at (t, y) of a wall, `r` across its half: a ring of stone, the glass, and the tracery as spokes round a boss. */
function rose(b: Batch, w: Wall, t: number, y: number, r: number) {
  const disc = (radius: number, c: RGB, lift: number) => {
    const rim: V3[] = [];
    for (let k = 0; k <= 16; k++)
      rim.push(on(w, t + Math.cos((Math.PI * k) / 8) * radius, y + Math.sin((Math.PI * k) / 8) * radius, lift));
    b.fan(on(w, t, y, lift), rim, c, w.n);
  };
  disc(r + 0.3, shade(STONE, 0.78), 0.05);
  disc(r, GLASS, 0.08);
  for (let k = 0; k < 12; k++) {
    const a = (Math.PI * k) / 6,
      [ca, sa] = [Math.cos(a), Math.sin(a)],
      d = 0.05,
      at = (along: number, s: number) => on(w, t + ca * along - sa * s * d, y + sa * along + ca * s * d, 0.1);
    b.quad(at(0, -1), at(r, -1), at(r, 1), at(0, 1), STONE, w.n);
  }
  disc(r * 0.45, GLASS, 0.11);
  disc(0.22, STONE, 0.12);
}

/** The front's face: three portals, the gallery of kings, the rose between two pairs of windows, the open gallery. */
function face(b: Batch, w: Wall) {
  const y = LAND_Y,
    mid = w.len / 2;
  for (const [t, half] of [
    [mid - TOWER, 1.1],
    [mid, 1.3],
    [mid + TOWER, 1.1],
  ] as const) {
    lancet(b, w, t, y, half, y + 1.6, DEEP, 0.05);
    lancet(b, w, t, y, half * 0.66, y + 1.5, DOOR, 0.08);
    if (t !== mid) for (const s of [-0.5, 0.5]) lancet(b, w, t + s, y + 6.4, 0.3, y + 7.9, GLASS, 0.05);
  }
  for (let t = 0.55; t < w.len - 0.3; t += 0.5) lancet(b, w, t, y + 4.75, 0.14, y + 5.15, DEEP, 0.05);
  for (let t = 0.6; t < w.len - 0.3; t += 0.7) lancet(b, w, t, y + 9.95, 0.2, y + 10.75, DEEP, 0.05);
  rose(b, w, mid, y + 7.5, 1.45);
}

/**
 * The cathedral, the middle of its front at (xc, zf), the front turned towards +z and the apse towards -z:
 * CATHEDRAL.width across and CATHEDRAL.length deep.
 */
export function cathedral(b: Batch, xc: number, zf: number) {
  const y = LAND_Y,
    zn = zf - TOWER,
    za = zn - BAYS * BAY;
  // the aisles and the nave over them, their roofs of slate
  stone(b, [xc - AISLE, za, xc + AISLE, zn], y - 1, y + AISLE_H);
  stone(b, [xc - NAVE, za, xc + NAVE, zn], y + AISLE_H, y + NAVE_H);
  for (const s of [-1, 1])
    b.quad(
      [xc + s * (AISLE + 0.15), y + AISLE_H, za],
      [xc + s * (AISLE + 0.15), y + AISLE_H, zn],
      [xc + s * NAVE, y + AISLE_H + 1.3, zn],
      [xc + s * NAVE, y + AISLE_H + 1.3, za],
      SLATE,
      unit(s * 1.3, AISLE - NAVE, 0),
    );
  gableRoof(b, xc - NAVE - 0.25, za, xc + NAVE + 0.25, zn + 0.4, y + NAVE_H, RIDGE, SLATE, STONE, 7);
  pyramid(b, xc, za + 2 * BAY, 0.45, y + NAVE_H + RIDGE - 0.7, 6.5, shade(SLATE, 0.85));
  // a window to each bay below and above, a buttress between the bays on both sides
  const low = wallOf(xc - AISLE, za, xc + AISLE, zn, 'px'),
    high = wallOf(xc - NAVE, za, xc + NAVE, zn, 'px');
  for (let k = 0; k < BAYS; k++) {
    lancet(b, low, (k + 0.5) * BAY, y + 1.2, 0.45, y + 2.9, GLASS, 0.05);
    lancet(b, high, (k + 0.5) * BAY, y + AISLE_H + 1.6, 0.5, y + NAVE_H - 2, GLASS, 0.05);
  }
  for (const s of [-1, 1])
    for (let k = 1; k < BAYS; k++) buttress(b, xc + s * (AISLE + 0.5), za + k * BAY, -s, 0, AISLE + 0.5 - NAVE);
  apse(b, xc, za);
  // the front: one block up to the open gallery, over it the two towers, flat-topped behind a low parapet
  const front: Rect = [xc - HALF, zn, xc + HALF, zf],
    top = y + 11.2;
  stone(b, front, y - 1, top);
  face(b, wallOf(...front, 'pz'));
  const flank = wallOf(...front, 'px');
  for (const s of [-0.5, 0.5]) lancet(b, flank, TOWER / 2 + s, y + 6.4, 0.3, y + 7.9, GLASS, 0.05);
  for (let t = 0.6; t < TOWER - 0.3; t += 0.7) lancet(b, flank, t, y + 9.95, 0.2, y + 10.75, DEEP, 0.05);
  // its relief: a string course under and over each gallery, a buttress up each corner of the towers
  for (const h of [4.4, 5.6, 9.6, top - y])
    stone(b, [xc - HALF - 0.12, zn, xc + HALF + 0.12, zf + 0.12], y + h - 0.12, y + h + 0.12, 1.05);
  for (const x of [-HALF, -HALF + TOWER, HALF - TOWER, HALF])
    stone(b, [xc + x - 0.28, zf - 0.3, xc + x + 0.28, zf + 0.22], y - 1, y + TOWER_H - 0.4, 1.03);
  stone(b, [xc + HALF - 0.3, zn - 0.1, xc + HALF + 0.22, zn + 0.5], y - 1, y + TOWER_H - 0.4, 1.03);
  for (const x0 of [xc - HALF + 0.1, xc + HALF - TOWER + 0.1]) {
    const at: Rect = [x0, zn + 0.1, x0 + TOWER - 0.2, zf - 0.1];
    stone(b, at, top, y + TOWER_H);
    stone(b, [at[0] - 0.12, at[1] - 0.12, at[2] + 0.12, at[3] + 0.12], y + TOWER_H - 0.5, y + TOWER_H - 0.25, 1.05);
    battlements(b, at[0], at[1], at[2], at[3], y + TOWER_H, STONE, 0.25, 0.3);
    for (const side of ['px', 'pz'] as const) {
      const w = wallOf(...at, side);
      for (const s of [-0.8, 0.8]) lancet(b, w, w.len / 2 + s, top + 0.5, 0.42, y + TOWER_H - 1.9, GLASS, 0.05);
    }
  }
}
