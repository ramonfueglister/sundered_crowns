// A region of the real world as cut by tools/worldprobe/build_region.py: a window of the game map at a few cells per
// map pixel, with height, water, forest and cultivation per cell and the rivers as lines.
import { maybeGunzip } from '../render/assets';

export const Water = { Land: 0, Sea: 1, Lake: 2 } as const;
export interface River { name: string; rank: number; /** cell coordinates */ pts: [number, number][] }
export interface Region {
  w: number; h: number;
  /** the window on the game map: its first map pixel, cells per map pixel, and the map's size and projection */
  x0: number; y0: number; cells: number; mapW: number; mapH: number; lon0: number; lon1: number; latN: number; latS: number;
  kmPerCell: number;
  /** metres above sea level; lakes are level, the sea is 0 */
  height: Int16Array;
  water: Uint8Array;
  /** forest and cultivation of 1356, 0 … 255 */
  forest: Uint8Array; crops: Uint8Array;
  rivers: River[];
}

export async function loadRegion(name: string, base = '/'): Promise<Region> {
  const get = async (file: string) => { const r = await fetch(`${base}map/regions/${file}`); if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`); return r; };
  const [meta, packed] = await Promise.all([get(`${name}.json`).then((r) => r.json()), get(`${name}.bin.gz`).then((r) => r.arrayBuffer())]);
  const raw = await maybeGunzip(new Uint8Array(packed)), n = meta.w * meta.h;
  if (raw.byteLength !== n * 5) throw new Error(`${name}.bin: expected ${n * 5} bytes, got ${raw.byteLength}`);
  const part = (from: number, len: number) => raw.buffer.slice(raw.byteOffset + from, raw.byteOffset + from + len);
  return {
    ...meta,
    height: new Int16Array(part(0, n * 2)), water: new Uint8Array(part(n * 2, n)),
    forest: new Uint8Array(part(n * 3, n)), crops: new Uint8Array(part(n * 4, n)),
  };
}

/** Cell coordinates of a place given in degrees (the game map is a Mercator map). */
export function cellOf(r: Region, lon: number, lat: number): [number, number] {
  const merc = (deg: number) => Math.asinh(Math.tan((deg * Math.PI) / 180));
  const x = ((lon - r.lon0) / (r.lon1 - r.lon0)) * r.mapW, y = ((merc(r.latN) - merc(lat)) / (merc(r.latN) - merc(r.latS))) * r.mapH;
  return [(x - r.x0) * r.cells, (y - r.y0) * r.cells];
}

/** A layer at a point between cell centres, blended from the four cells around it; the edge cells go on outside. */
export function sample(r: Region, layer: Int16Array | Uint8Array, cx: number, cy: number): number {
  const x = Math.max(0, Math.min(r.w - 1.001, cx - 0.5)), y = Math.max(0, Math.min(r.h - 1.001, cy - 0.5));
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, i = yi * r.w + xi;
  return (layer[i] * (1 - fx) + layer[i + 1] * fx) * (1 - fy) + (layer[i + r.w] * (1 - fx) + layer[i + r.w + 1] * fx) * fy;
}
/** The water class of the cell under a point (outside the region: land). */
export function waterAt(r: Region, cx: number, cy: number): number {
  const x = Math.floor(cx), y = Math.floor(cy);
  return x < 0 || y < 0 || x >= r.w || y >= r.h ? Water.Land : r.water[y * r.w + x];
}
