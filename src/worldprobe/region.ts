// The real world as cut by tools/worldprobe/build_region.py: the game map at a few cells per map pixel, in square
// tiles, with height (after river erosion), drainage, water, forest and cultivation per cell and the rivers as lines.
// A `Region` is the window of it that one piece of the world needs, put together from the tiles it touches. One cell
// is about 0.77 km × cos(latitude) wide: the map is a Mercator map, so the cells grow smaller towards the north.
import { maybeGunzip } from '../render/assets';

export const Water = { Land: 0, Sea: 1, Lake: 2 } as const;
export interface River { name: string; rank: number; /** cell coordinates of the window */ pts: [number, number][] }
export interface Region {
  w: number; h: number;
  /** the window on the game map: its first map pixel, cells per map pixel, and the map's size and projection */
  x0: number; y0: number; cells: number; mapW: number; mapH: number; lon0: number; lon1: number; latN: number; latS: number;
  /** metres above sea level after river erosion (tools/worldprobe/erosion.py); lakes are level, the sea is 0 */
  shaped: Int16Array;
  /** area draining through the cell: 16 steps per doubling of (km² + 1) */
  drainage: Uint8Array;
  water: Uint8Array;
  /** forest and cultivation of 1356, 0 … 255 */
  forest: Uint8Array; crops: Uint8Array;
  rivers: River[];
}
export interface Index { tile: number; cells: number; mapW: number; mapH: number; lon0: number; lon1: number; latN: number; latS: number; tiles: string[] }

const merc = (deg: number) => Math.asinh(Math.tan((deg * Math.PI) / 180));
/** Map pixel of a place given in degrees (the game map is a Mercator map). */
const mapPixel = (m: Index | Region, lon: number, lat: number): [number, number] =>
  [((lon - m.lon0) / (m.lon1 - m.lon0)) * m.mapW, ((merc(m.latN) - merc(lat)) / (merc(m.latN) - merc(m.latS))) * m.mapH];
/** Latitude in degrees of a row of cells of the window (a cell coordinate of the window). */
export function latOf(r: Region, cy: number): number {
  const y = merc(r.latN) - ((r.y0 + cy / r.cells) / r.mapH) * (merc(r.latN) - merc(r.latS));
  return (Math.atan(Math.sinh(y)) * 180) / Math.PI;
}

/** What one tile of a region holds, unpacked. */
interface Tile { shaped: Int16Array; layers: Uint8Array[]; rivers: River[] }
const indexes = new Map<string, Promise<Index>>(), tiles = new Map<string, Promise<Tile>>();
/** tiles kept unpacked; the oldest go first */
const TILES_KEPT = 24;
const get = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r; };
/** The index of region `name`: its tiles and how it lies on the game map. */
export const indexOf = (name: string, base: string) => {
  if (!indexes.has(name)) indexes.set(name, get(`${base}map/regions/${name}/index.json`).then((r) => r.json() as Promise<Index>));
  return indexes.get(name)!;
};
function tileOf(name: string, base: string, T: number, tx: number, ty: number): Promise<Tile> {
  const key = `${name}/${tx}_${ty}`, kept = tiles.get(key);
  if (kept) { tiles.delete(key); tiles.set(key, kept); return kept; }
  const tile = (async () => {
    const [packed, rivers] = await Promise.all([get(`${base}map/regions/${key}.bin.gz`).then((r) => r.arrayBuffer()), get(`${base}map/regions/${key}.json`).then((r) => r.json() as Promise<River[]>)]);
    const raw = await maybeGunzip(new Uint8Array(packed)), t = T * T;
    if (raw.byteLength !== t * 6) throw new Error(`${key}.bin: expected ${t * 6} bytes, got ${raw.byteLength}`);
    const bytes = (layer: number) => raw.subarray(t * (2 + layer), t * (3 + layer));
    return { shaped: new Int16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + t * 2)), layers: [bytes(0), bytes(1), bytes(2), bytes(3)], rivers };
  })();
  tiles.set(key, tile);
  if (tiles.size > TILES_KEPT) tiles.delete(tiles.keys().next().value!);
  return tile;
}

/**
 * The window of region `name` that starts at cell (gx0, gy0) of the whole map and is w × h cells large. Tiles the
 * region does not have are open sea.
 */
export async function loadWindow(name: string, gx0: number, gy0: number, w: number, h: number, base = '/'): Promise<Region> {
  const index = await indexOf(name, base), T = index.tile, n = w * h;
  const region: Region = {
    w, h, x0: gx0 / index.cells, y0: gy0 / index.cells, cells: index.cells, mapW: index.mapW, mapH: index.mapH, lon0: index.lon0, lon1: index.lon1, latN: index.latN, latS: index.latS,
    shaped: new Int16Array(n), drainage: new Uint8Array(n), water: new Uint8Array(n).fill(Water.Sea), forest: new Uint8Array(n), crops: new Uint8Array(n), rivers: [],
  };
  const wanted: [number, number][] = [];
  for (let ty = Math.floor(gy0 / T); ty * T < gy0 + h; ty++) for (let tx = Math.floor(gx0 / T); tx * T < gx0 + w; tx++) if (index.tiles.includes(`${tx}_${ty}`)) wanted.push([tx, ty]);
  await Promise.all(wanted.map(async ([tx, ty]) => {
    const tile = await tileOf(name, base, T, tx, ty), to = [region.drainage, region.water, region.forest, region.crops];
    // the part of the tile that lies in the window, row by row
    const x0 = Math.max(gx0, tx * T), x1 = Math.min(gx0 + w, (tx + 1) * T);
    for (let gy = Math.max(gy0, ty * T); gy < Math.min(gy0 + h, (ty + 1) * T); gy++) {
      const src = (gy - ty * T) * T + (x0 - tx * T), dst = (gy - gy0) * w + (x0 - gx0), len = x1 - x0;
      region.shaped.set(tile.shaped.subarray(src, src + len), dst);
      for (let k = 0; k < 4; k++) to[k].set(tile.layers[k].subarray(src, src + len), dst);
    }
    for (const r of tile.rivers) region.rivers.push({ ...r, pts: r.pts.map(([x, y]) => [x - gx0, y - gy0]) });
  }));
  return region;
}

/** The projection of region `name`: its cells per map pixel, the whole-map cell of a place given in degrees, and the place of a cell. */
export async function projectionOf(name: string, base = '/'): Promise<{ cells: number; cellOf(lon: number, lat: number): [number, number]; placeOf(u: number, v: number): [number, number] }> {
  const m = await indexOf(name, base);
  return {
    cells: m.cells,
    cellOf: (lon, lat) => { const [x, y] = mapPixel(m, lon, lat); return [x * m.cells, y * m.cells]; },
    placeOf: (u, v) => [m.lon0 + (u / m.cells / m.mapW) * (m.lon1 - m.lon0), (Math.atan(Math.sinh(merc(m.latN) - (v / m.cells / m.mapH) * (merc(m.latN) - merc(m.latS)))) * 180) / Math.PI],
  };
}

/** Cell coordinates of a place given in degrees. */
export function cellOf(r: Region, lon: number, lat: number): [number, number] {
  const [x, y] = mapPixel(r, lon, lat);
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
