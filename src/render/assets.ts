// Map asset loading: id raster, height field, biome texture and geo.json.
import { gunzip } from 'fflate';
import type { GeoJson } from '../sim/world';

export interface MapAssets {
  ids: Uint16Array; W: number; H: number;
  height: Int16Array /* hw*hh, metres */; hw: number; hh: number;
  biome: ImageBitmap; geo: GeoJson;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`map asset ${url}: HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

/** Gunzip unless the server already removed the gzip layer (Content-Encoding). */
async function maybeGunzip(b: Uint8Array): Promise<Uint8Array> {
  if (b.length < 2 || b[0] !== 0x1f || b[1] !== 0x8b) return b;
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const s = new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Uint8Array(await new Response(s).arrayBuffer());
    } catch { /* fall back to fflate */ }
  }
  return new Promise((res, rej) => gunzip(b, (err, out) => (err ? rej(err) : res(out))));
}

export async function loadMapAssets(base = '/'): Promise<MapAssets> {
  if (!base.endsWith('/')) base += '/';
  const [geo, idsRaw, hRaw, biomeBlob] = await Promise.all([
    fetch(base + 'data/geo.json').then((r) => { if (!r.ok) throw new Error('geo.json: HTTP ' + r.status); return r.json() as Promise<GeoJson>; }),
    fetchBytes(base + 'map/ids.bin.gz').then(maybeGunzip),
    fetchBytes(base + 'map/height.bin.gz').then(maybeGunzip),
    fetch(base + 'map/biome.png').then((r) => { if (!r.ok) throw new Error('biome.png: HTTP ' + r.status); return r.blob(); }),
  ]);
  const W = geo.W, H = geo.H;
  // ids: raw uint16 LE raster W*H, no header (tools/geo/build_export.py)
  if (idsRaw.byteLength !== W * H * 2) throw new Error(`ids.bin: expected ${W * H * 2} bytes, got ${idsRaw.byteLength}`);
  const ids = new Uint16Array(idsRaw.buffer.slice(idsRaw.byteOffset, idsRaw.byteOffset + idsRaw.byteLength));
  // height: [w,h] uint32 LE header, then int16 LE values, delta-coded along each row (first column absolute)
  const hv = new DataView(hRaw.buffer, hRaw.byteOffset, hRaw.byteLength);
  const hw = hv.getUint32(0, true), hh = hv.getUint32(4, true);
  if (hRaw.byteLength !== 8 + hw * hh * 2) throw new Error('height.bin: bad size');
  const height = new Int16Array(hw * hh);
  const d = new Int16Array(hRaw.buffer.slice(hRaw.byteOffset + 8, hRaw.byteOffset + 8 + hw * hh * 2));
  for (let y = 0; y < hh; y++) {
    let acc = 0; const o = y * hw;
    for (let x = 0; x < hw; x++) { acc += d[o + x]; height[o + x] = acc; }
  }
  // premultiplyAlpha 'none' is essential: A holds height, and RGB must survive A = 0
  const biome = await createImageBitmap(biomeBlob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  return { ids, W, H, height, hw, hh, biome, geo };
}
