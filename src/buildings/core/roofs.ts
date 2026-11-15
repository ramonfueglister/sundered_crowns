// Roofs over rectangles: tiled slopes, hip and gable roofs, and the height of a roof at a point (for what sits on it).
import { type Batch, type RGB, type V3, hash2, shade } from '../../lookprobe/batch';

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
    const col = rows > 1 ? shade(c, (k % 2 ? 0.9 : 1.03) + 0.2 * hash2(Math.round(e0[0] * 7 + j * 3 + k), Math.round(e0[2] * 7 + k * 5 - j), 81)) : c;
    b.quad(lerp3(lerp3(e0, e1, u0), lerp3(r0, r1, u0), t0), lerp3(lerp3(e0, e1, u1), lerp3(r0, r1, u1), t0), lerp3(lerp3(e0, e1, u1), lerp3(r0, r1, u1), t1), lerp3(lerp3(e0, e1, u0), lerp3(r0, r1, u0), t1), col, facing);
  }
}

/** A hip roof over a rectangle; a square gives a pyramid. `rows` of tiles per slope, a paler cap along the ridge. */
export function hipRoof(b: Batch, x0: number, z0: number, x1: number, z1: number, y: number, h: number, c: RGB, rows = 1) {
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
export function gableRoof(b: Batch, x0: number, z0: number, x1: number, z1: number, y: number, h: number, c: RGB, wallC: RGB, rows = 3) {
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

/** Height of a hip or gable roof above its eaves at (x, z); the roof covers x0 … x1 × z0 … z1 and rises by `rise`. */
export function roofAt(x0: number, z0: number, x1: number, z1: number, rise: number, gable: boolean, x: number, z: number) {
  const alongX = x1 - x0 >= z1 - z0, half = Math.min(x1 - x0, z1 - z0) / 2;
  const across = alongX ? Math.min(z - z0, z1 - z) : Math.min(x - x0, x1 - x), along = alongX ? Math.min(x - x0, x1 - x) : Math.min(z - z0, z1 - z);
  return rise * Math.max(0, Math.min(1, (gable ? across : Math.min(across, along)) / half));
}
