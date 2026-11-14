// The real world as cut by tools/worldprobe/build_region.py: the game map at a few cells per map pixel, in square
// tiles, with height (after river erosion), drainage, water, forest and cultivation per cell and the rivers as lines.
// A `Region` is the window of it that one view needs, put together from the tiles it touches.
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
interface Index { tile: number; cells: number; mapW: number; mapH: number; lon0: number; lon1: number; latN: number; latS: number; tiles: string[] }

const merc = (deg: number) => Math.asinh(Math.tan((deg * Math.PI) / 180));
/** Map pixel of a place given in degrees (the game map is a Mercator map). */
const mapPixel = (m: Index | Region, lon: number, lat: number): [number, number] =>
  [((lon - m.lon0) / (m.lon1 - m.lon0)) * m.mapW, ((merc(m.latN) - merc(lat)) / (merc(m.latN) - merc(m.latS))) * m.mapH];
/** Side of one cell in kilometres at a latitude: cells are as wide as they are high, and smaller towards the north. */
const kmPerCell = (m: Index, lat: number) => (Math.cos((lat * Math.PI) / 180) * (m.lon1 - m.lon0) * 111.32) / m.mapW / m.cells;

/**
 * The window of region `name` around a place: `reach` kilometres to every side. Tiles the region does not have are
 * open sea. Returns the window and the side of its cells in kilometres.
 */
export async function loadRegion(name: string, lon: number, lat: number, reach: number, base = '/'): Promise<{ region: Region; kmPerCell: number }> {
  const get = async (file: string) => { const r = await fetch(`${base}map/regions/${name}/${file}`); if (!r.ok) throw new Error(`${name}/${file}: HTTP ${r.status}`); return r; };
  const index: Index = await (await get('index.json')).json(), T = index.tile, km = kmPerCell(index, lat), [px, py] = mapPixel(index, lon, lat);
  const half = Math.ceil(reach / km), gx0 = Math.floor(px * index.cells) - half, gy0 = Math.floor(py * index.cells) - half, w = 2 * half, h = 2 * half, n = w * h;
  const region: Region = {
    w, h, x0: gx0 / index.cells, y0: gy0 / index.cells, cells: index.cells, mapW: index.mapW, mapH: index.mapH, lon0: index.lon0, lon1: index.lon1, latN: index.latN, latS: index.latS,
    shaped: new Int16Array(n), drainage: new Uint8Array(n), water: new Uint8Array(n).fill(Water.Sea), forest: new Uint8Array(n), crops: new Uint8Array(n), rivers: [],
  };
  const wanted: [number, number][] = [];
  for (let ty = Math.floor(gy0 / T); ty * T < gy0 + h; ty++) for (let tx = Math.floor(gx0 / T); tx * T < gx0 + w; tx++) if (index.tiles.includes(`${tx}_${ty}`)) wanted.push([tx, ty]);
  await Promise.all(wanted.map(async ([tx, ty]) => {
    const [packed, rivers] = await Promise.all([get(`${tx}_${ty}.bin.gz`).then((r) => r.arrayBuffer()), get(`${tx}_${ty}.json`).then((r) => r.json() as Promise<River[]>)]);
    const raw = await maybeGunzip(new Uint8Array(packed)), t = T * T;
    if (raw.byteLength !== t * 6) throw new Error(`${name}/${tx}_${ty}.bin: expected ${t * 6} bytes, got ${raw.byteLength}`);
    const shaped = new Int16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + t * 2));
    const bytes = (layer: number) => raw.subarray(t * (2 + layer), t * (3 + layer));
    const from = [bytes(0), bytes(1), bytes(2), bytes(3)], to = [region.drainage, region.water, region.forest, region.crops];
    // the part of the tile that lies in the window, row by row
    const x0 = Math.max(gx0, tx * T), x1 = Math.min(gx0 + w, (tx + 1) * T);
    for (let gy = Math.max(gy0, ty * T); gy < Math.min(gy0 + h, (ty + 1) * T); gy++) {
      const src = (gy - ty * T) * T + (x0 - tx * T), dst = (gy - gy0) * w + (x0 - gx0), len = x1 - x0;
      region.shaped.set(shaped.subarray(src, src + len), dst);
      for (let k = 0; k < 4; k++) to[k].set(from[k].subarray(src, src + len), dst);
    }
    for (const r of rivers) region.rivers.push({ ...r, pts: r.pts.map(([x, y]) => [x - gx0, y - gy0]) });
  }));
  return { region, kmPerCell: km };
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
