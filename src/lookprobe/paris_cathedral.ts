// The cathedral of the Paris probe (PROTOTYPE, 22 Nov 2026), as Ramon's reference picture of the Île de la Cité shows
// Notre-Dame: a front of two flat-topped towers over three portals, a gallery and a rose; a high nave under slate
// between lower aisles, with flying buttresses; a round apse; a thin spire on the ridge. Every size here is read off
// that picture: OWN RULE for the prototype.
import { type Wall, pane, wallOf } from '../buildings';
import { gableRoof } from '../buildings/core/roofs';
import { battlements } from '../buildings/core/solids';
import { arch, on } from '../buildings/core/wall';
import { ashlar } from '../buildings/houses/parts';
import { type Batch, type V3, rgb, shade } from './batch';
import { LAND_Y } from './layout';
import { masonry, pyramid } from './paris_river';

const STONE = rgb(0xcdbba2),
  SLATE = rgb(0x5f6472),
  GLASS = rgb(0x33343e),
  DOOR = rgb(0x6b4a2c),
  /** the stone of a recess: a portal's jambs, a gallery's arcade */
  DEEP = shade(STONE, 0.38);
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

/**
 * A buttress: a pier at (x, z) with a pinnacle, and from it a flying arch in steps up to the nave's wall, which lies
 * `reach` away in the direction (dx, dz).
 */
function buttress(b: Batch, x: number, z: number, dx: number, dz: number, reach: number) {
  const y = LAND_Y,
    c = shade(STONE, 1.04);
  b.box(x - 0.32, y - 1, z - 0.32, x + 0.32, y + 7, z + 0.32, shade(STONE, 0.9), { foot: 0.86, top: STONE });
  pyramid(b, x, z, 0.32, y + 7, 1.1, c);
  const n = Math.round(reach / 0.4);
  for (let k = 0; k < n; k++) {
    const px = x + dx * (k + 0.5) * 0.4,
      pz = z + dz * (k + 0.5) * 0.4,
      py = y + 6.2 + (2.4 * k) / n;
    b.box(px - 0.2, py, pz - 0.2, px + 0.2, py + 0.45, pz + 0.2, c, { bottom: true });
  }
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
      b.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], shade(STONE, 0.86), out);
      // only the walls turned to the picture's camera get their stones and their window
      if (out[0] > 0.2) {
        ashlar(b, w, Math.max(y0, y), y1, STONE, 40 + k, 2);
        arch(b, w, len / 2, y0 + (r === AISLE ? 2.2 : 1.7), 0.42, y1 - 1.6, GLASS, 0.05);
      }
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

/** The front's face: three portals, the gallery of kings, the rose between two pairs of windows, the open gallery. */
function face(b: Batch, w: Wall) {
  const y = LAND_Y,
    mid = w.len / 2;
  for (const [t, half] of [
    [mid - TOWER, 1.15],
    [mid, 1.4],
    [mid + TOWER, 1.15],
  ] as const) {
    arch(b, w, t, y, half, y + 1.9, DEEP, 0.05);
    arch(b, w, t, y, half * 0.68, y + 1.6, DOOR, 0.08);
    if (t !== mid) for (const s of [-0.5, 0.5]) arch(b, w, t + s, y + 6.3, 0.3, y + 8.2, GLASS, 0.05);
  }
  pane(b, w, 0, y + 4.5, w.len, y + 5.4, shade(STONE, 0.9), 0.05);
  for (let t = 0.4; t < w.len - 0.2; t += 0.5) arch(b, w, t, y + 4.6, 0.13, y + 5.1, DEEP, 0.08);
  for (let t = 0.5; t < w.len - 0.3; t += 0.75) arch(b, w, t, y + 10, 0.2, y + 11, DEEP, 0.05);
  for (const [r, c, lift] of [
    [1.8, shade(STONE, 0.7), 0.05],
    [1.5, GLASS, 0.08],
    [0.2, STONE, 0.1],
  ] as const) {
    const rim: V3[] = [];
    for (let k = 0; k <= 16; k++)
      rim.push(on(w, mid + Math.cos((Math.PI * k) / 8) * r, y + 7.6 + Math.sin((Math.PI * k) / 8) * r, lift));
    b.fan(on(w, mid, y + 7.6, lift), rim, c, w.n);
  }
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
  masonry(b, [xc - AISLE, za, xc + AISLE, zn], y - 1, y + AISLE_H, 11, STONE);
  masonry(b, [xc - NAVE, za, xc + NAVE, zn], y + AISLE_H, y + NAVE_H, 12, STONE);
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
    arch(b, low, (k + 0.5) * BAY, y + 1.2, 0.45, y + 3.3, GLASS, 0.05);
    arch(b, high, (k + 0.5) * BAY, y + AISLE_H + 1.7, 0.5, y + NAVE_H - 1.5, GLASS, 0.05);
  }
  for (const s of [-1, 1])
    for (let k = 1; k < BAYS; k++) buttress(b, xc + s * (AISLE + 0.5), za + k * BAY, -s, 0, AISLE + 0.5 - NAVE);
  apse(b, xc, za);
  // the front: one block up to the open gallery, over it the two towers, flat-topped behind a low parapet
  const front = [xc - HALF, zn, xc + HALF, zf] as const,
    top = y + 11.3;
  masonry(b, front, y - 1, top, 13, STONE);
  face(b, wallOf(...front, 'pz'));
  const flank = wallOf(...front, 'px');
  for (const s of [-0.5, 0.5]) arch(b, flank, TOWER / 2 + s, y + 6.3, 0.3, y + 8.2, GLASS, 0.05);
  for (let t = 0.5; t < TOWER - 0.3; t += 0.75) arch(b, flank, t, y + 10, 0.2, y + 11, DEEP, 0.05);
  for (const x0 of [xc - HALF + 0.1, xc + HALF - TOWER + 0.1]) {
    const at = [x0, zn + 0.1, x0 + TOWER - 0.2, zf - 0.1] as const;
    masonry(b, at, top, y + TOWER_H, 14 + x0, STONE);
    battlements(b, at[0], at[1], at[2], at[3], y + TOWER_H, STONE, 0.25, 0.3);
    for (const side of ['px', 'pz'] as const) {
      const w = wallOf(...at, side);
      for (const s of [-0.8, 0.8]) arch(b, w, w.len / 2 + s, top + 0.6, 0.42, y + TOWER_H - 1.2, GLASS, 0.05);
    }
  }
}
