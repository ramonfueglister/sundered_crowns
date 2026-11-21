// The sea's wave picture, made once at the start (`waveTexture`): random waves worked out by the inverse Fourier
// transform, so that it repeats seamlessly; sea.ts lays it over the world at the octave whose texels are a dot or two
// wide where it is seen.
import * as THREE from 'three/webgpu';

/** the wave picture's size in texels */
export const TEX = 256;
/**
 * the swell's waves (2 to SWELL_K across the picture: 18 to 128 texels long) and the flecks' (FLECK_K, 4 to 11 texels,
 * within FLECK_SPREAD of the wind's direction as the power of the cosine: their crests are long and narrow), and how
 * the flecks' picture is bent (by up to BEND texels, in waves BEND_K across the picture: the strokes curve)
 */
const SWELL_K = 14,
  FLECK_K: readonly [number, number] = [24, 64],
  FLECK_SPREAD = 12,
  BEND = 2.5,
  BEND_K: readonly [number, number] = [5, 12];
/** the wind's direction in the wave picture (radians from its u axis); the flecks' crests stand across it */
export const WIND = 0.55;

/** A small random number source of its own, so that the waves are the same at every start. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The Fourier transform of `n` complex numbers in place (n a power of two); `back`: the inverse, without the 1/n. */
function fft(re: Float64Array, im: Float64Array, back: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = ((back ? 2 : -2) * Math.PI) / len,
      wr = Math.cos(a),
      wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1,
        ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k,
          q = p + len / 2,
          tr = re[q] * cr - im[q] * ci,
          ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr;
        im[q] = im[p] - ti;
        re[p] += tr;
        im[p] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** The inverse transform of a square of TEX × TEX complex numbers, rows then columns; the real part. */
function inverse2(re: Float64Array, im: Float64Array): Float64Array {
  const n = TEX,
    rr = new Float64Array(n),
    ri = new Float64Array(n);
  for (let pass = 0; pass < 2; pass++)
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const i = pass ? b * n + a : a * n + b;
        rr[b] = re[i];
        ri[b] = im[i];
      }
      fft(rr, ri, true);
      for (let b = 0; b < n; b++) {
        const i = pass ? b * n + a : a * n + b;
        re[i] = rr[b];
        im[i] = ri[b];
      }
    }
  return re;
}

/**
 * The wave picture: the swell's slopes along u and v (red, green: rise over run in shares of four times their
 * spread, about 0.5 level), the swell's height (blue: in shares of four times its spread about 0.5) and the height
 * of the flecks' waves (alpha: in shares of eight times its spread about 0.5). The swell is a height field of
 * random phases whose power falls as the fourth power of the wavenumber, from 2 to SWELL_K waves across the
 * picture; the flecks' waves are short (FLECK_K) and run with the wind, so that their crests, where they rise high
 * enough to break, are short strokes across it, and the picture of them is bent (`curved`), so that the strokes
 * curve a little.
 */
export function waveTexture(): THREE.DataTexture {
  const n = TEX,
    random = seeded(1291);
  /** a height field of random phases with the given power at each wavenumber (kx, ky): its real and imaginary parts */
  const field = (power: (kx: number, ky: number) => number) => {
    const hr = new Float64Array(n * n),
      hi = new Float64Array(n * n);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const kx = i < n / 2 ? i : i - n,
          ky = j < n / 2 ? j : j - n,
          p = power(kx, ky);
        // a Gaussian number of each part (Box and Muller), drawn for every wavenumber so that each field keeps its own
        const r = Math.sqrt(-2 * Math.log(1 - random())) * Math.sqrt(p),
          a = 2 * Math.PI * random();
        if (p > 0) {
          hr[j * n + i] = r * Math.cos(a);
          hi[j * n + i] = r * Math.sin(a);
        }
      }
    return [hr, hi] as const;
  };
  const along = (kx: number, ky: number) => Math.cos(Math.atan2(ky, kx) - WIND);
  const [sr, si] = field((kx, ky) => {
    const k = Math.hypot(kx, ky);
    return k < 2 || k > SWELL_K ? 0 : (0.6 + 0.4 * along(kx, ky) ** 2) / k ** 4;
  });
  const [fr, fi] = field((kx, ky) => {
    const k = Math.hypot(kx, ky);
    return k < FLECK_K[0] || k > FLECK_K[1] ? 0 : along(kx, ky) ** FLECK_SPREAD / k ** 2;
  });
  const bent = (k: number) => (k < BEND_K[0] || k > BEND_K[1] ? 0 : 1 / k ** 2);
  const [br, bi] = field((kx, ky) => bent(Math.hypot(kx, ky))),
    [cr, ci] = field((kx, ky) => bent(Math.hypot(kx, ky)));
  // the slopes are the transforms of i·k times the heights' (k in radians per texel)
  const slope = (axis: 0 | 1) => {
    const re = new Float64Array(n * n),
      im = new Float64Array(n * n);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const k = ((axis === 0 ? (i < n / 2 ? i : i - n) : j < n / 2 ? j : j - n) * 2 * Math.PI) / n,
          at = j * n + i;
        re[at] = -si[at] * k;
        im[at] = sr[at] * k;
      }
    return inverse2(re, im);
  };
  const spread = (v: Float64Array) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
  const su = slope(0),
    sv = slope(1),
    h = inverse2(sr.slice(), si.slice()),
    f = curved(inverse2(fr, fi), inverse2(br, bi), inverse2(cr, ci));
  /** the flecks' picture read (between its texels, repeating) at each texel moved by `bu`, `bv` (BEND texels a spread) */
  function curved(straight: Float64Array, bu: Float64Array, bv: Float64Array) {
    const out = new Float64Array(n * n),
      ku = BEND / spread(bu),
      kv = BEND / spread(bv),
      wrap = (i: number) => ((i % n) + n) % n;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const u = i + bu[j * n + i] * ku,
          v = j + bv[j * n + i] * kv,
          u0 = Math.floor(u),
          v0 = Math.floor(v),
          fu = u - u0,
          fv = v - v0;
        const at = (x: number, y: number) => straight[wrap(y) * n + wrap(x)];
        out[j * n + i] =
          (at(u0, v0) * (1 - fu) + at(u0 + 1, v0) * fu) * (1 - fv) +
          (at(u0, v0 + 1) * (1 - fu) + at(u0 + 1, v0 + 1) * fu) * fv;
      }
    return out;
  }
  const s = Math.sqrt((spread(su) ** 2 + spread(sv) ** 2) / 2),
    hs = spread(h),
    fs = spread(f);
  const byte = (v: number) => Math.max(0, Math.min(255, Math.round(127.5 + 127.5 * v)));
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    data[i * 4] = byte(su[i] / (4 * s));
    data[i * 4 + 1] = byte(sv[i] / (4 * s));
    data[i * 4 + 2] = byte(h[i] / (4 * hs));
    data[i * 4 + 3] = byte(f[i] / (8 * fs));
  }
  const t = new THREE.DataTexture(data, n, n);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}
