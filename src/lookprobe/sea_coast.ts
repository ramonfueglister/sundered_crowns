// The coast's distance beside the sea's depth (`withCoast`), for the band of lighter water along the coast that
// sea.ts draws within some dots of the coast as the depth picture has it. The distances are those of Felzenszwalb and
// Huttenlocher, "Distance Transforms of Sampled Functions" (Theory of Computing 8, 2012), a row and a column at a time.
import * as THREE from 'three/webgpu';

/** The squared distance of each point of a row to the nearest of `on` (Felzenszwalb and Huttenlocher), in place. */
function distance1(f: Float64Array, n: number, v: Int32Array, z: Float64Array, d: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) ** 2 + f[v[k]];
  }
  for (let q = 0; q < n; q++) f[q] = d[q];
}

/** The distance of every dot of a picture of w × h to the nearest dot that is `inside`, in dots (0 on those). */
function distances(inside: Uint8Array, w: number, h: number): Float64Array {
  const big = 1e12,
    g = new Float64Array(w * h),
    n = Math.max(w, h),
    f = new Float64Array(n),
    d = new Float64Array(n),
    v = new Int32Array(n),
    z = new Float64Array(n + 1);
  for (let i = 0; i < w * h; i++) g[i] = inside[i] ? 0 : big;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = g[y * w + x];
    distance1(f, h, v, z, d);
    for (let y = 0; y < h; y++) g[y * w + x] = f[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    distance1(f, w, v, z, d);
    for (let x = 0; x < w; x++) g[y * w + x] = Math.sqrt(f[x]);
  }
  return g;
}

/** how many dots of the depth picture the coast's distance reaches on either side (it is kept in a byte, COAST_REACH / 128 dots a step) */
export const COAST_REACH = 8;

/**
 * The depth picture with the coast's distance beside the depth: red the depth (as the picture has it, 0 on land),
 * green the distance from the coast in dots of the picture, 128 at the coast, more over the sea, less on the land
 * (so that the coast lies where it crosses 128 between the dots, and not on their edges). The rows run from the
 * bottom up, as a picture loaded by three's loader lies.
 */
export function withCoast(image: CanvasImageSource & { width: number; height: number }): THREE.DataTexture {
  const w = image.width,
    h = image.height,
    canvas = new OffscreenCanvas(w, h),
    c = canvas.getContext('2d')!;
  c.drawImage(image, 0, 0);
  const px = c.getImageData(0, 0, w, h).data,
    land = new Uint8Array(w * h),
    sea = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    land[i] = px[i * 4] === 0 ? 1 : 0;
    sea[i] = 1 - land[i];
  }
  const toLand = distances(land, w, h),
    toSea = distances(sea, w, h),
    data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x,
        o = ((h - 1 - y) * w + x) * 4,
        signed = land[i] ? -(toSea[i] - 0.5) : toLand[i] - 0.5;
      data[o] = px[i * 4];
      data[o + 1] = Math.max(0, Math.min(255, Math.round(128 + (signed * 128) / COAST_REACH)));
      data[o + 3] = 255;
    }
  const t = new THREE.DataTexture(data, w, h);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
