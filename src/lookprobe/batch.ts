// Geometry collector for the look probe: flat-shaded triangles with a colour per corner, merged into one mesh.
import * as THREE from 'three/webgpu';

export type V3 = readonly [number, number, number];
/** linear RGB, 0 … 1 */
export type RGB = readonly [number, number, number];

const tmp = new THREE.Color();
export function rgb(hex: number, mul = 1): RGB { tmp.setHex(hex); return [tmp.r * mul, tmp.g * mul, tmp.b * mul]; }
export const shade = (c: RGB, m: number): RGB => [c[0] * m, c[1] * m, c[2] * m];
/** Smooth step from 0 at `a` to 1 at `b` (also with a > b). */
export const smooth = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** no numbers yet */
const NONE = new Float64Array(0);

export class Batch {
  // The lists grow as runs of doubles side by side, not as arrays of numbers: a piece of the world is millions of
  // corners, and adding nine numbers to an array took four times as long as working them out (a fifth of what a
  // worker takes for a far piece). The numbers are the same doubles as before; `pos`, `nor` and `col` show what is
  // filled, as it stands when they are asked for: a list taken before more is added does not grow with the batch.
  private p = NONE; private n = NONE; private c = NONE;
  /** numbers filled, of `p` and `n`, and of `c` */
  private filled = 0; private tinted = 0;
  private shownP = NONE; private shownN = NONE; private shownC = NONE;

  get pos(): Float64Array { return this.shownP.length === this.filled ? this.shownP : (this.shownP = this.p.subarray(0, this.filled)); }
  get nor(): Float64Array { return this.shownN.length === this.filled ? this.shownN : (this.shownN = this.n.subarray(0, this.filled)); }
  get col(): Float64Array { return this.shownC.length === this.tinted ? this.shownC : (this.shownC = this.c.subarray(0, this.tinted)); }

  get triangles() { return this.filled / 9; }

  /** room for `more` numbers of places and directions, and `tints` of colours */
  private room(more: number, tints: number) {
    if (this.filled + more > this.p.length) {
      const size = Math.max(144, this.p.length * 2, this.filled + more), p = new Float64Array(size), n = new Float64Array(size);
      p.set(this.p.subarray(0, this.filled)); n.set(this.n.subarray(0, this.filled));
      this.p = p; this.n = n; this.shownP = this.shownN = NONE;
    }
    if (this.tinted + tints > this.c.length) {
      const c = new Float64Array(Math.max(144, this.c.length * 2, this.tinted + tints));
      c.set(this.c.subarray(0, this.tinted));
      this.c = c; this.shownC = NONE;
    }
  }

  /** Makes room for this many triangles at once, where a builder knows about how many are to come: a batch that grows on its own is copied each time it doubles. */
  reserve(triangles: number) { this.room(triangles * 9 - this.filled, triangles * 9 - this.tinted); }

  /** A triangle a → b → c; with `facing`, it is turned to face that way. */
  tri(a: V3, b: V3, c: V3, ca: RGB, cb: RGB = ca, cc: RGB = ca, facing?: V3) {
    if (facing) this.triAt(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], ca, cb, cc, facing[0], facing[1], facing[2]);
    else this.triAt(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], ca, cb, cc);
  }

  /**
   * `tri` with its corners and its facing as numbers (a facing of noughts turns nothing, as none does). The builders
   * of the ground use this and `quadAt`: a corner handed over as a list of three numbers costs the list, and more
   * than that where corners on whole numbers and corners on fractions pass through the same place, for the engine
   * keeps the two as lists of different kinds and repacks the one into the other, corner by corner (with the next
   * note a tenth of what a worker takes for a far piece). The colours stay lists: they should all hold fractions,
   * so a colour of whole numbers is best kept as one constant, not written out where it is used.
   */
  triAt(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, ca: RGB, cb: RGB = ca, cc: RGB = ca, fx = 0, fy = 0, fz = 0) {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    // (along an axis the length is the one number that is not nought, as the root of the squares gives it too)
    const len = nx === 0 ? (ny === 0 ? Math.abs(nz) : nz === 0 ? Math.abs(ny) : Math.hypot(nx, ny, nz)) : ny === 0 && nz === 0 ? Math.abs(nx) : Math.hypot(nx, ny, nz);
    if (len < 1e-9) return;
    nx /= len; ny /= len; nz /= len;
    this.room(9, 9);
    const i = this.filled, j = this.tinted, p = this.p, n = this.n, t = this.c;
    p[i] = ax; p[i + 1] = ay; p[i + 2] = az;
    t[j] = ca[0]; t[j + 1] = ca[1]; t[j + 2] = ca[2];
    if (nx * fx + ny * fy + nz * fz < 0) {
      // turned over: b and c change places, and their colours with them
      nx = -nx; ny = -ny; nz = -nz;
      p[i + 3] = cx; p[i + 4] = cy; p[i + 5] = cz; p[i + 6] = bx; p[i + 7] = by; p[i + 8] = bz;
      t[j + 3] = cc[0]; t[j + 4] = cc[1]; t[j + 5] = cc[2]; t[j + 6] = cb[0]; t[j + 7] = cb[1]; t[j + 8] = cb[2];
    } else {
      p[i + 3] = bx; p[i + 4] = by; p[i + 5] = bz; p[i + 6] = cx; p[i + 7] = cy; p[i + 8] = cz;
      t[j + 3] = cb[0]; t[j + 4] = cb[1]; t[j + 5] = cb[2]; t[j + 6] = cc[0]; t[j + 7] = cc[1]; t[j + 8] = cc[2];
    }
    n[i] = nx; n[i + 1] = ny; n[i + 2] = nz; n[i + 3] = nx; n[i + 4] = ny; n[i + 5] = nz; n[i + 6] = nx; n[i + 7] = ny; n[i + 8] = nz;
    this.filled = i + 9; this.tinted = j + 9;
  }

  /** A planar quad a → b → c → d (around its edge), one colour or one per corner. */
  quad(a: V3, b: V3, c: V3, d: V3, color: RGB | readonly [RGB, RGB, RGB, RGB], facing?: V3) {
    // (asked by the count first: a look into a list of numbers at the place where lists of colours are looked into as
    // well makes the engine repack every list of numbers that comes by into one of boxed numbers)
    const per = color.length === 4 && typeof color[0] !== 'number';
    const ca = per ? (color as readonly RGB[])[0] : color as RGB, cb = per ? (color as readonly RGB[])[1] : ca;
    const cc = per ? (color as readonly RGB[])[2] : ca, cd = per ? (color as readonly RGB[])[3] : ca;
    if (facing) this.quadAt(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2], ca, cb, cc, cd, facing[0], facing[1], facing[2]);
    else this.quadAt(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2], ca, cb, cc, cd);
  }

  /** `quad` with its corners and its facing as numbers and a colour to each corner (see `triAt`). */
  quadAt(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, dx: number, dy: number, dz: number, ca: RGB, cb: RGB, cc: RGB, cd: RGB, fx = 0, fy = 0, fz = 0) {
    this.triAt(ax, ay, az, bx, by, bz, cx, cy, cz, ca, cb, cc, fx, fy, fz);
    this.triAt(ax, ay, az, cx, cy, cz, dx, dy, dz, ca, cc, cd, fx, fy, fz);
  }

  /** A fan around `centre` through `rim` (closed shapes: repeat the first rim point at the end). */
  fan(centre: V3, rim: readonly V3[], color: RGB, facing?: V3) {
    for (let i = 0; i + 1 < rim.length; i++) this.tri(centre, rim[i], rim[i + 1], color, color, color, facing);
  }

  /**
   * An axis-aligned box. `top` recolours the upper face; `foot` darkens the lower corners of the sides (cheap contact
   * shading); `bottom` adds the lower face, which is left out by default; `away` recolours the two sides turned from
   * the sun (-x and +z), for things whose shaded side has its own hue, such as foliage.
   */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: RGB, o: { top?: RGB; foot?: number; bottom?: boolean; away?: RGB } = {}) {
    const lo = shade(color, o.foot ?? 1), dark = o.away ?? color, darkLo = shade(dark, o.foot ?? 1), top = o.top ?? color;
    this.quadAt(x0, y1, z0, x0, y1, z1, x1, y1, z1, x1, y1, z0, top, top, top, top, 0, 1, 0);
    if (o.bottom) this.quadAt(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, lo, lo, lo, lo, 0, -1, 0);
    this.quadAt(x1, y0, z0, x1, y0, z1, x1, y1, z1, x1, y1, z0, lo, lo, color, color, 1, 0, 0);
    this.quadAt(x0, y0, z1, x0, y0, z0, x0, y1, z0, x0, y1, z1, darkLo, darkLo, dark, dark, -1, 0, 0);
    this.quadAt(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, darkLo, darkLo, dark, dark, 0, 0, 1);
    this.quadAt(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, lo, lo, color, color, 0, 0, -1);
  }

  /** A batch of the lists of another, as they were taken from it (pos, nor and col, three numbers to a corner each). */
  static of(pos: ArrayLike<number>, nor: ArrayLike<number>, col: ArrayLike<number>): Batch {
    const b = new Batch();
    b.room(pos.length, col.length);
    b.p.set(pos); b.n.set(nor); b.c.set(col);
    b.filled = pos.length; b.tinted = col.length;
    return b;
  }

  /** Adds another batch, moved by `m` (rotation, one scale for all axes, translation). */
  append(o: Batch, m: THREE.Matrix4) {
    const e = m.elements, p = o.pos, n = o.nor, tints = o.col, k = 1 / Math.hypot(e[0], e[1], e[2]);
    this.room(p.length, tints.length);
    const pos = this.p, nor = this.n, at = this.filled;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      pos[at + i] = e[0] * x + e[4] * y + e[8] * z + e[12]; pos[at + i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; pos[at + i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const a = n[i], b = n[i + 1], c = n[i + 2];
      nor[at + i] = (e[0] * a + e[4] * b + e[8] * c) * k; nor[at + i + 1] = (e[1] * a + e[5] * b + e[9] * c) * k; nor[at + i + 2] = (e[2] * a + e[6] * b + e[10] * c) * k;
    }
    this.c.set(tints, this.tinted);
    this.filled += p.length; this.tinted += tints.length;
  }

  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** Small seeded generator (mulberry32) so that the probe scene is the same on every load. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo: number, hi: number) => lo + (hi - lo) * next(),
    int: (lo: number, hi: number) => lo + Math.floor((hi - lo + 1) * next()),
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)],
    chance: (p: number) => next() < p,
  };
}
export type Rnd = ReturnType<typeof seeded>;

/** Hash of two integers to 0 … 1. */
export function hash2(x: number, z: number, seed = 0): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise, 0 … 1. */
export function noise2(x: number, z: number, seed = 0): number {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(xi, zi, seed), b = hash2(xi + 1, zi, seed), c = hash2(xi, zi + 1, seed), d = hash2(xi + 1, zi + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
export const fbm2 = (x: number, z: number, seed = 0) => (noise2(x, z, seed) * 4 + noise2(x * 2.1, z * 2.1, seed + 7) * 2 + noise2(x * 4.3, z * 4.3, seed + 13)) / 7;
