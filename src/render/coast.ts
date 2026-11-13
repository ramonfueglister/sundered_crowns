// Signed distance field of the coastline at full id-raster resolution, encoded r8:
// 0.5 = coast, > 0.5 water, < 0.5 land, range ±SDF_RANGE map pixels.
// Exact Euclidean distance (linear column sweeps + Felzenszwalb lower envelope per row), then a light
// binomial blur that rounds off the pixel staircase. Runs in a worker (coast.worker.ts) when possible.
export const SDF_RANGE = 40;

/** water mask from the id raster: 1 = sea zone or no location (lakes) */
export function waterMask(ids: Uint16Array, L: number): Uint8Array {
  const m = new Uint8Array(ids.length);
  for (let i = 0; i < ids.length; i++) { const id = ids[i]; m[i] = id === 0 || id > L ? 1 : 0; }
  return m;
}

/** squared distance (capped) from every pixel to the nearest pixel with mask[i] === want */
function edtSquared(mask: Uint8Array, want: number, w: number, h: number, out: Float32Array, cap: number) {
  // 1) vertical distance, two row-major sweeps (cache friendly)
  for (let x = 0; x < w; x++) out[x] = mask[x] === want ? 0 : cap;
  for (let y = 1; y < h; y++) {
    const o = y * w, p = o - w;
    for (let x = 0; x < w; x++) { const v = out[p + x] + 1; out[o + x] = mask[o + x] === want ? 0 : v < cap ? v : cap; }
  }
  for (let y = h - 2; y >= 0; y--) {
    const o = y * w, n = o + w;
    for (let x = 0; x < w; x++) { const v = out[n + x] + 1; if (v < out[o + x]) out[o + x] = v; }
  }
  const cap2 = cap * cap;
  for (let i = 0; i < out.length; i++) out[i] = out[i] * out[i];
  // 2) horizontal lower envelope of parabolas per row
  const f = new Float32Array(w), v = new Int32Array(w), z = new Float32Array(w + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let all = true;
    for (let x = 0; x < w; x++) { f[x] = out[o + x]; if (f[x] < cap2) all = false; }
    if (all) continue;
    let k = 0; v[0] = 0; z[0] = -1e30; z[1] = 1e30;
    for (let q = 1; q < w; q++) {
      const fq = f[q] + q * q;
      let s = (fq - (f[v[k]] + v[k] * v[k])) / (2 * (q - v[k]));
      while (s <= z[k]) { k--; s = (fq - (f[v[k]] + v[k] * v[k])) / (2 * (q - v[k])); }
      k++; v[k] = q; z[k] = s; z[k + 1] = 1e30;
    }
    k = 0;
    for (let q = 0; q < w; q++) {
      while (z[k + 1] < q) k++;
      const d = q - v[k];
      const r = d * d + f[v[k]];
      out[o + q] = r < cap2 ? r : cap2;
    }
  }
}

export function sdfFromMask(water: Uint8Array, w: number, h: number): Uint8Array {
  const cap = SDF_RANGE + 2;
  const s = new Float32Array(w * h), t = new Float32Array(w * h);
  edtSquared(water, 0, w, h, s, cap); // distance to nearest land
  edtSquared(water, 1, w, h, t, cap); // distance to nearest water
  for (let i = 0; i < s.length; i++) s[i] = water[i] ? Math.sqrt(s[i]) - 0.5 : 0.5 - Math.sqrt(t[i]);
  // [1 2 1] blur, horizontal then vertical, and encode
  for (let y = 0; y < h; y++) {
    const o = y * w;
    t[o] = (3 * s[o] + s[o + 1]) / 4; t[o + w - 1] = (3 * s[o + w - 1] + s[o + w - 2]) / 4;
    for (let x = 1; x < w - 1; x++) t[o + x] = (s[o + x - 1] + 2 * s[o + x] + s[o + x + 1]) / 4;
  }
  const out = new Uint8Array(w * h);
  const k = 255 / (2 * SDF_RANGE);
  for (let y = 0; y < h; y++) {
    const o = y * w, a = (y > 0 ? y - 1 : 0) * w, b = (y < h - 1 ? y + 1 : h - 1) * w;
    for (let x = 0; x < w; x++) {
      const v = 127.5 + ((t[a + x] + 2 * t[o + x] + t[b + x]) / 4) * k;
      out[o + x] = v < 0 ? 0 : v > 255 ? 255 : v + 0.5;
    }
  }
  return out;
}

/** compute the coast SDF (W x H) in a worker, falling back to the main thread */
export async function buildCoastSdf(ids: Uint16Array, W: number, H: number, L: number): Promise<Uint8Array> {
  if (typeof Worker !== 'undefined') {
    try {
      const mask = waterMask(ids, L);
      const worker = new Worker(new URL('./coast.worker.ts', import.meta.url), { type: 'module' });
      try {
        return await new Promise<Uint8Array>((resolve, reject) => {
          worker.onmessage = (e: MessageEvent<Uint8Array>) => resolve(e.data);
          worker.onerror = (e) => reject(new Error(e.message || 'coast worker failed'));
          worker.postMessage({ mask, w: W, h: H }, [mask.buffer]);
        });
      } finally { worker.terminate(); }
    } catch (e) {
      console.warn('coast worker unavailable, computing on the main thread', e);
    }
  }
  return sdfFromMask(waterMask(ids, L), W, H);
}
