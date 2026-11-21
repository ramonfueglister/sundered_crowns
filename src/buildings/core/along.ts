// Boxes laid along a straight line that need not run with the axes: the runs of a town's wall, the deck of a bridge.
import type { Batch, RGB } from '../../lookprobe/batch';

/** the colours of a box along a line: its sides, the lower corners of its sides, its top */
export interface Faces {
  side: RGB;
  foot: RGB;
  top: RGB;
}

/**
 * The boxes along the line from (ax, az) to (bx, bz), u metres along it and v across it (positive to the right of the
 * way from a to b, seen from above with z south), from height lo to hi; `bottom` draws the lower face too (a box that
 * spans a passage or the water). Null for a line without length.
 */
export function along(b: Batch, ax: number, az: number, bx: number, bz: number) {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 1e-6) return null;
  const dx = (bx - ax) / len,
    dz = (bz - az) / len;
  const at = (u: number, v: number): [number, number] => [ax + u * dx - v * dz, az + u * dz + v * dx];
  const box = (u0: number, v0: number, u1: number, v1: number, lo: number, hi: number, f: Faces, bottom = false) => {
    const [p, q, r, t] = [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)],
      { side: c, foot, top } = f;
    b.quadAt(p[0], hi, p[1], t[0], hi, t[1], r[0], hi, r[1], q[0], hi, q[1], top, top, top, top, 0, 1, 0);
    if (bottom)
      b.quadAt(p[0], lo, p[1], q[0], lo, q[1], r[0], lo, r[1], t[0], lo, t[1], foot, foot, foot, foot, 0, -1, 0);
    b.quadAt(q[0], lo, q[1], r[0], lo, r[1], r[0], hi, r[1], q[0], hi, q[1], foot, foot, c, c, dx, 0, dz);
    b.quadAt(t[0], lo, t[1], p[0], lo, p[1], p[0], hi, p[1], t[0], hi, t[1], foot, foot, c, c, -dx, 0, -dz);
    b.quadAt(t[0], lo, t[1], r[0], lo, r[1], r[0], hi, r[1], t[0], hi, t[1], foot, foot, c, c, -dz, 0, dx);
    b.quadAt(q[0], lo, q[1], p[0], lo, p[1], p[0], hi, p[1], q[0], hi, q[1], foot, foot, c, c, dz, 0, -dx);
  };
  return { len, box };
}
