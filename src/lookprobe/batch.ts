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

export class Batch {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly col: number[] = [];

  get triangles() { return this.pos.length / 9; }

  /** One triangle. If `facing` is given, the corners are reordered so that the normal points that way. */
  tri(a: V3, b: V3, c: V3, ca: RGB, cb: RGB = ca, cc: RGB = ca, facing?: V3) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return;
    nx /= len; ny /= len; nz /= len;
    if (facing && nx * facing[0] + ny * facing[1] + nz * facing[2] < 0) {
      [b, c] = [c, b]; [cb, cc] = [cc, cb]; nx = -nx; ny = -ny; nz = -nz;
    }
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.col.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2]);
  }

  /** A planar quad a → b → c → d (around its edge), one colour or one per corner. */
  quad(a: V3, b: V3, c: V3, d: V3, color: RGB | readonly [RGB, RGB, RGB, RGB], facing?: V3) {
    const per = typeof color[0] !== 'number';
    const ca = per ? (color as readonly RGB[])[0] : color as RGB, cb = per ? (color as readonly RGB[])[1] : ca;
    const cc = per ? (color as readonly RGB[])[2] : ca, cd = per ? (color as readonly RGB[])[3] : ca;
    this.tri(a, b, c, ca, cb, cc, facing);
    this.tri(a, c, d, ca, cc, cd, facing);
  }

  /** A fan around `centre` through `rim` (closed shapes: repeat the first rim point at the end). */
  fan(centre: V3, rim: readonly V3[], color: RGB, facing?: V3) {
    for (let i = 0; i + 1 < rim.length; i++) this.tri(centre, rim[i], rim[i + 1], color, color, color, facing);
  }

  /**
   * An axis-aligned box. `top` recolours the upper face; `foot` darkens the lower corners of the sides (cheap contact
   * shading); `bottom` adds the lower face, which is left out by default.
   */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: RGB, o: { top?: RGB; foot?: number; bottom?: boolean } = {}) {
    const lo = shade(color, o.foot ?? 1), side: readonly [RGB, RGB, RGB, RGB] = [lo, lo, color, color];
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], o.top ?? color, [0, 1, 0]);
    if (o.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], lo, [0, -1, 0]);
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], side, [1, 0, 0]);
    this.quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], side, [-1, 0, 0]);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [lo, lo, color, color], [0, 0, 1]);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], side, [0, 0, -1]);
  }

  /** Adds another batch, moved by `m` (rotation, one scale for all axes, translation). */
  append(o: Batch, m: THREE.Matrix4) {
    const e = m.elements, p = o.pos, n = o.nor, k = 1 / Math.hypot(e[0], e[1], e[2]);
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      this.pos.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
      const a = n[i], b = n[i + 1], c = n[i + 2];
      this.nor.push((e[0] * a + e[4] * b + e[8] * c) * k, (e[1] * a + e[5] * b + e[9] * c) * k, (e[2] * a + e[6] * b + e[10] * c) * k);
    }
    for (let i = 0; i < o.col.length; i++) this.col.push(o.col[i]);
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
