// The real world as cut by tools/worldprobe/build_region.py: the game map at a few cells per map pixel, in square
// tiles, with height (after river erosion), drainage, water, forest and cultivation per cell and the rivers as lines.
// A `Region` is the window of it that one piece of the world needs, put together from the tiles it touches. One cell
// is about 0.77 km × cos(latitude) wide: the map is a Mercator map, so the cells grow smaller towards the poles.
// The region `world` goes once round the globe: after `worldW` map pixels it begins again, so a window may lie
// anywhere to the east or west. The first `mapW` of those pixels are the game map; beyond it a pixel spans a touch
// less longitude, so that the way round is a whole number of cells at every step of the map.
import { maybeGunzip } from './gunzip';
import { unbrotli } from './brotli';

export const Water = { Land: 0, Sea: 1, Lake: 2 } as const;
export interface River {
  name: string; rank: number;
  /** cell coordinates of the window */
  pts: [number, number][];
  /**
   * The river's bed, settled for the whole river (tools/worldprobe/beds.py): the height of its water at every point
   * of `pts`, in metres. Between two points it runs straight, or through the heights of `mid`: [the first point's
   * index, heights between the two points at even distances].
   */
  bed?: number[]; mid?: number[][];
}
export interface Region {
  w: number; h: number;
  /** the window on the game map: its first map pixel, cells per map pixel, and the map's size and projection */
  x0: number; y0: number; cells: number; mapW: number; mapH: number; lon0: number; lon1: number; latN: number; latS: number;
  /** map pixels round the globe and from the north edge to the south edge, where the region is the whole world */
  worldW?: number; worldH?: number;
  /** metres above sea level after river erosion (tools/worldprobe/erosion.py); lakes are level, the sea is 0 */
  shaped: Int16Array;
  /** area draining through the cell: 16 steps per doubling of (km² + 1) */
  drainage: Uint8Array;
  water: Uint8Array;
  /** forest and cultivation of 1356, 0 … 255 */
  forest: Uint8Array; crops: Uint8Array;
  rivers: River[];
}
export interface Index {
  tile: number; cells: number; mapW: number; mapH: number; lon0: number; lon1: number; latN: number; latS: number; worldW?: number; worldH?: number; tiles: string[];
  /** 'br': the tiles are <tx>_<ty>.bin, their heights as differences and all zipped with Brotli (`fromDifferences`); else <tx>_<ty>.bin.gz, the rasters zipped with gzip */
  coding?: 'br';
}
type Frame = Pick<Index, 'mapW' | 'mapH' | 'lon0' | 'lon1' | 'latN' | 'latS' | 'worldW'>;

const merc = (deg: number) => Math.asinh(Math.tan((deg * Math.PI) / 180));
const mod = (a: number, n: number) => ((a % n) + n) % n;
/** Map pixel of a place given in degrees (the game map is a Mercator map); of a world, the pixel of its first lap. */
function mapPixel(m: Frame, lon: number, lat: number): [number, number] {
  const span = m.lon1 - m.lon0, east = m.worldW ? mod(lon - m.lon0, 360) : lon - m.lon0;
  return [east <= span || !m.worldW ? (east / span) * m.mapW : m.mapW + ((east - span) / (360 - span)) * (m.worldW - m.mapW), ((merc(m.latN) - merc(lat)) / (merc(m.latN) - merc(m.latS))) * m.mapH];
}
/** Longitude in degrees (-180 … 180 round a world) of a map pixel column. */
function lonOf(m: Frame, x: number): number {
  if (!m.worldW) return m.lon0 + (x / m.mapW) * (m.lon1 - m.lon0);
  const xm = mod(x, m.worldW), lon = xm < m.mapW ? m.lon0 + (xm / m.mapW) * (m.lon1 - m.lon0) : m.lon1 + ((xm - m.mapW) / (m.worldW - m.mapW)) * (360 - m.lon1 + m.lon0);
  return mod(lon + 180, 360) - 180;
}
// the map's north edge on the Mercator scale and its height there, kept from the last asking: a builder asks for
// every column of a piece, and working the two out anew each time was three quarters of what the asking cost
let keptN = NaN, keptS = NaN, north = 0, height = 0;
/** Latitude in degrees of a row of cells of the window (a cell coordinate of the window). */
export function latOf(r: Region, cy: number): number {
  if (r.latN !== keptN || r.latS !== keptS) { keptN = r.latN; keptS = r.latS; north = merc(r.latN); height = merc(r.latN) - merc(r.latS); }
  const y = north - ((r.y0 + cy / r.cells) / r.mapH) * height;
  return (Math.atan(Math.sinh(y)) * 180) / Math.PI;
}

/**
 * The rasters of a tile from a tile's file of the coding 'br' (tools/worldprobe/tiles.py), unzipped: its heights come
 * as their differences to the cell on the left (in the first column: to the cell above), zigzagged into whole numbers
 * from nought, the low bytes of all cells before their high bytes; the layers of bytes follow as they are. A tile is a
 * quarter smaller so than as rasters zipped with gzip.
 */
export function fromDifferences(body: Uint8Array, T: number): Uint8Array {
  const t = T * T, raw = new Uint8Array(t * 6), shaped = new Int16Array(raw.buffer, 0, t);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const i = y * T + x, z = body[i] | (body[t + i] << 8);
    // (the sum is taken as a number of 16 bits, as the difference was)
    shaped[i] = (z & 1 ? -((z + 1) >> 1) : z >> 1) + (x ? shaped[i - 1] : y ? shaped[i - T] : 0);
  }
  raw.set(body.subarray(t * 2, t * 6), t * 2);
  return raw;
}

/** What one tile of a region holds, unpacked. */
interface Tile { shaped: Int16Array; layers: Uint8Array[]; rivers: River[] }
const indexes = new Map<string, Promise<Index & { has: Set<string> }>>(), tiles = new Map<string, Promise<Tile>>();
/** tiles kept unpacked; the oldest go first */
const TILES_KEPT = 24;
const get = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r; };
/** The index of region `name`: its tiles and how it lies on the game map. */
export const indexOf = (name: string, base: string) => {
  if (!indexes.has(name)) indexes.set(name, get(`${base}map/regions/${name}/index.json`).then(async (r) => { const index = (await r.json()) as Index; return { ...index, has: new Set(index.tiles) }; }));
  return indexes.get(name)!;
};
function tileOf(name: string, base: string, T: number, tx: number, ty: number, coding?: Index['coding']): Promise<Tile> {
  const key = `${name}/${tx}_${ty}`, kept = tiles.get(key);
  if (kept) { tiles.delete(key); tiles.set(key, kept); return kept; }
  const tile = (async () => {
    const [packed, rivers] = await Promise.all([get(`${base}map/regions/${key}.${coding === 'br' ? 'bin' : 'bin.gz'}`).then((r) => r.arrayBuffer()), get(`${base}map/regions/${key}.json`).then((r) => r.json() as Promise<River[]>)]);
    const raw = coding === 'br' ? fromDifferences(await unbrotli(new Uint8Array(packed)), T) : await maybeGunzip(new Uint8Array(packed)), t = T * T;
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
 * region does not have are open sea, and so is all that lies north or south of it; to the east and west a world
 * begins again. With `finer` above 1 the window is drawn that many times finer than the region's cells (its cells,
 * gx0 and gy0 count in the finer cells): see `refine`.
 */
export async function loadWindow(name: string, gx0: number, gy0: number, w: number, h: number, base = '/', finer = 1): Promise<Region> {
  if (finer > 1) {
    // the cells of the data under the window, with one more on every side for the blending
    const x0 = Math.floor(gx0 / finer) - 1, y0 = Math.floor(gy0 / finer) - 1;
    return refine(await loadWindow(name, x0, y0, Math.ceil((gx0 + w) / finer) + 1 - x0, Math.ceil((gy0 + h) / finer) + 1 - y0, base), finer, gx0 - x0 * finer, gy0 - y0 * finer, w, h);
  }
  const index = await indexOf(name, base), T = index.tile, n = w * h, round = index.worldW ? index.worldW * index.cells : Infinity;
  const region: Region = {
    w, h, x0: gx0 / index.cells, y0: gy0 / index.cells, cells: index.cells, mapW: index.mapW, mapH: index.mapH, lon0: index.lon0, lon1: index.lon1, latN: index.latN, latS: index.latS, worldW: index.worldW, worldH: index.worldH,
    shaped: new Int16Array(n), drainage: new Uint8Array(n), water: new Uint8Array(n).fill(Water.Sea), forest: new Uint8Array(n), crops: new Uint8Array(n), rivers: [],
  };
  // the window's columns in runs that lie in one tile: `at` is the run's first column, `x` the same column on the first lap
  const wanted: { tx: number; ty: number; at: number; x: number; len: number }[] = [];
  for (let at = gx0; at < gx0 + w;) {
    const x = round === Infinity ? at : mod(at, round), tx = Math.floor(x / T), len = Math.min(gx0 + w - at, (tx + 1) * T - x, round - x);
    for (let ty = Math.floor(gy0 / T); ty * T < gy0 + h; ty++) if (index.has.has(`${tx}_${ty}`)) wanted.push({ tx, ty, at, x, len });
    at += len;
  }
  await Promise.all(wanted.map(async ({ tx, ty, at, x, len }) => {
    const tile = await tileOf(name, base, T, tx, ty, index.coding), to = [region.drainage, region.water, region.forest, region.crops];
    // the part of the tile that lies in the window, row by row
    for (let gy = Math.max(gy0, ty * T); gy < Math.min(gy0 + h, (ty + 1) * T); gy++) {
      const src = (gy - ty * T) * T + (x - tx * T), dst = (gy - gy0) * w + (at - gx0);
      region.shaped.set(tile.shaped.subarray(src, src + len), dst);
      for (let k = 0; k < 4; k++) to[k].set(tile.layers[k].subarray(src, src + len), dst);
    }
    for (const r of tile.rivers) region.rivers.push({ ...r, pts: r.pts.map(([px, py]) => [px + at - x - gx0, py - gy0]) });
  }));
  return region;
}

/**
 * A window `finer` times finer than `data`, w × h of its new cells from (x0, y0) of them on. The data hold nothing
 * finer than their cells, so the new cells take what lies between the data's: heights, forest and fields are blended
 * from the four cells around (as `sample` does), a cell is sea or lake where more than half the water about it is,
 * and a lake keeps the level of its own cells; drainage is that of the cell the new one lies in. The rivers are the
 * same lines.
 */
export function refine(data: Region, finer: number, x0: number, y0: number, w: number, h: number): Region {
  const n = w * h, cell = (x: number, y: number) => Math.max(0, Math.min(data.h - 1, y)) * data.w + Math.max(0, Math.min(data.w - 1, x));
  const r: Region = {
    ...data, w, h, x0: data.x0 + x0 / (data.cells * finer), y0: data.y0 + y0 / (data.cells * finer), cells: data.cells * finer,
    shaped: new Int16Array(n), drainage: new Uint8Array(n), water: new Uint8Array(n), forest: new Uint8Array(n), crops: new Uint8Array(n),
    rivers: data.rivers.map((v) => ({ ...v, pts: v.pts.map(([px, py]): [number, number] => [px * finer - x0, py * finer - y0]) })),
  };
  const sea = new Uint8Array(data.water.length), lake = new Uint8Array(data.water.length);
  for (let k = 0; k < sea.length; k++) { if (data.water[k] === Water.Sea) sea[k] = 1; else if (data.water[k] === Water.Lake) lake[k] = 1; }
  const { shaped, forest, crops } = data, dw = data.w;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // the new cell's middle in cells of the data
    const cx = (x0 + x + 0.5) / finer, cy = (y0 + y + 0.5) / finer, i = y * w + x;
    // `sample` of the five layers at this point, its four cells and their weights worked out once for all five (the
    // sums are `sample`'s own, term for term)
    const sx = Math.max(0, Math.min(dw - 1.001, cx - 0.5)), sy = Math.max(0, Math.min(data.h - 1.001, cy - 0.5));
    const xi = Math.floor(sx), yi = Math.floor(sy), fx = sx - xi, fy = sy - yi, gx = 1 - fx, gy = 1 - fy, a = yi * dw + xi, b = a + dw;
    r.shaped[i] = Math.round((shaped[a] * gx + shaped[a + 1] * fx) * gy + (shaped[b] * gx + shaped[b + 1] * fx) * fy);
    r.forest[i] = Math.round((forest[a] * gx + forest[a + 1] * fx) * gy + (forest[b] * gx + forest[b + 1] * fx) * fy);
    r.crops[i] = Math.round((crops[a] * gx + crops[a + 1] * fx) * gy + (crops[b] * gx + crops[b + 1] * fx) * fy);
    r.drainage[i] = data.drainage[cell(Math.floor(cx), Math.floor(cy))];
    const wet = (sea[a] * gx + sea[a + 1] * fx) * gy + (sea[b] * gx + sea[b + 1] * fx) * fy, still = (lake[a] * gx + lake[a + 1] * fx) * gy + (lake[b] * gx + lake[b + 1] * fx) * fy;
    r.water[i] = wet + still <= 0.5 ? Water.Land : wet >= still ? Water.Sea : Water.Lake;
    if (r.water[i] !== Water.Lake) continue;
    // a lake lies level: at the height of the nearest of its cells of the data
    let best = Infinity;
    for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
      const qx = Math.floor(cx - 0.5) + dx, qy = Math.floor(cy - 0.5) + dy, j = cell(qx, qy), d = Math.hypot(qx + 0.5 - cx, qy + 0.5 - cy);
      if (data.water[j] === Water.Lake && d < best) { best = d; r.shaped[i] = data.shaped[j]; }
    }
  }
  return r;
}

/** How region `name` lies on the globe. */
export interface Projection {
  /** cells per map pixel */
  cells: number;
  /** cells round the globe, after which the region begins again (a region that is not the whole world: none), and from its north edge to its south edge */
  round: number; rows: number;
  /** the game map's width and height in cells */
  map: readonly [number, number];
  /** the whole-map cell of a place given in degrees, on the first lap round the globe */
  cellOf(lon: number, lat: number): [number, number];
  /** the place of a cell, in degrees */
  placeOf(u: number, v: number): [number, number];
}
/** `finer`: the cells counted are that many times finer than the region's own (see loadWindow). */
export const projectionOf = async (name: string, base = '/', finer = 1): Promise<Projection> => projectionFrom(await indexOf(name, base), finer);
/** The projection of a region with this index. */
export function projectionFrom(index: Index, finer = 1): Projection {
  const m = { ...index, cells: index.cells * finer };
  return {
    cells: m.cells, round: m.worldW ? m.worldW * m.cells : Infinity, rows: (m.worldH ?? m.mapH) * m.cells, map: [m.mapW * m.cells, m.mapH * m.cells],
    cellOf: (lon, lat) => { const [x, y] = mapPixel(m, lon, lat); return [x * m.cells, y * m.cells]; },
    placeOf: (u, v) => [lonOf(m, u / m.cells), (Math.atan(Math.sinh(merc(m.latN) - (v / m.cells / m.mapH) * (merc(m.latN) - merc(m.latS)))) * 180) / Math.PI],
  };
}

/** Cell coordinates of a place given in degrees; of a world, on the lap round the globe on which the window lies. */
export function cellOf(r: Region, lon: number, lat: number): [number, number] {
  const [x, y] = mapPixel(r, lon, lat), lap = r.worldW ? Math.round((r.x0 + r.w / r.cells / 2 - x) / r.worldW) * r.worldW : 0;
  return [(x + lap - r.x0) * r.cells, (y - r.y0) * r.cells];
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
