// What kind of land a place is, from tools/worldprobe/build_climate.py: one byte per two by two map pixels, the kind
// (from the Köppen-Geiger climate zones and the grasslands of the ecoregions) in the low bits, in bit 7 whether the
// forest layer of 1356 knows the place and in bit 6 whether its fields do. With it come the snow line and the tree
// line of every place (tools/worldprobe/build_lines.py): one byte per sixteen by sixteen map pixels, the height in
// steps of LINE_STEP.
import { maybeGunzip } from './gunzip';

export const Land = { None: 0, Temperate: 1, Mediterranean: 2, Steppe: 3, Desert: 4, Savanna: 5, Rainforest: 6, Boreal: 7, Tundra: 8, Ice: 9, Grassland: 10 } as const;
/** the bits of a place's byte: its kind of land, and whether the game's layers of 1356 know its woods and its fields */
export const KIND = 63, WOODS_KNOWN = 128, FIELDS_KNOWN = 64;
/** metres a step of the bytes of the snow line and the tree line */
const LINE_STEP = 32;
export interface Climate { w: number; h: number; cells: Uint8Array; /** the snow line and the tree line, in cells eight times as wide */ snow: Uint8Array; trees: Uint8Array }

let loaded: Promise<Climate> | undefined;
/** The climate layer of a map of mapW × mapH pixels (of the world: once round the globe). */
export function loadClimate(base: string, mapW: number, mapH: number): Promise<Climate> {
  loaded ??= (async () => {
    const r = await fetch(`${base}map/climate.bin.gz`);
    if (!r.ok) throw new Error(`climate.bin.gz: HTTP ${r.status}`);
    const cells = await maybeGunzip(new Uint8Array(await r.arrayBuffer())), w = mapW >> 1, h = mapH >> 1;
    if (cells.length !== w * h) throw new Error(`climate.bin: expected ${w * h} bytes, got ${cells.length}`);
    const line = async (name: string) => {
      const r = await fetch(`${base}map/${name}.bin.gz`);
      if (!r.ok) throw new Error(`${name}.bin.gz: HTTP ${r.status}`);
      const bytes = await maybeGunzip(new Uint8Array(await r.arrayBuffer()));
      if (bytes.length !== (w >> 3) * (h >> 3)) throw new Error(`${name}.bin: expected ${(w >> 3) * (h >> 3)} bytes, got ${bytes.length}`);
      return bytes;
    };
    return { w, h, cells, snow: await line('snowline'), trees: await line('treeline') };
  })();
  return loaded;
}
/** The byte of the place at map pixel (px, py): round the globe the layer begins again, north and south of it its edge goes on. */
export const climateAt = (c: Climate, px: number, py: number) =>
  c.cells[Math.max(0, Math.min(c.h - 1, Math.floor(py / 2))) * c.w + (((Math.floor(px / 2) % c.w) + c.w) % c.w)];
/** A line's height in metres at map pixel (px, py), between the points of its layer. */
function lineAt(c: Climate, line: Uint8Array, px: number, py: number): number {
  const w = c.w >> 3, h = c.h >> 3, fx = px / 16 - 0.5, fy = Math.max(0, Math.min(h - 1, py / 16 - 0.5)), x0 = Math.floor(fx), y0 = Math.min(h - 2, Math.floor(fy)), tx = fx - x0, ty = fy - y0;
  const at = (x: number, y: number) => line[y * w + (((x % w) + w) % w)];
  return LINE_STEP * ((at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty);
}
/** The height of the snow line in metres at map pixel (px, py). */
export const snowLineAt = (c: Climate, px: number, py: number) => lineAt(c, c.snow, px, py);
/** The height in metres at map pixel (px, py) up to which the climate lets a tree grow. */
export const treeLineAt = (c: Climate, px: number, py: number) => lineAt(c, c.trees, px, py);
