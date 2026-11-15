// What kind of land a place is, from tools/worldprobe/build_climate.py: one byte per two by two map pixels, the kind
// (from the Köppen-Geiger climate zones and the grasslands of the ecoregions) in the low bits, in bit 7 whether the
// forest layer of 1356 knows the place and in bit 6 whether its fields do.
import { maybeGunzip } from '../render/assets';

export const Land = { None: 0, Temperate: 1, Mediterranean: 2, Steppe: 3, Desert: 4, Savanna: 5, Rainforest: 6, Boreal: 7, Tundra: 8, Ice: 9, Grassland: 10 } as const;
/** the bits of a place's byte: its kind of land, and whether the game's layers of 1356 know its woods and its fields */
export const KIND = 63, WOODS_KNOWN = 128, FIELDS_KNOWN = 64;
export interface Climate { w: number; h: number; cells: Uint8Array }

let loaded: Promise<Climate> | undefined;
/** The climate layer of a map of mapW × mapH pixels (of the world: once round the globe). */
export function loadClimate(base: string, mapW: number, mapH: number): Promise<Climate> {
  loaded ??= (async () => {
    const r = await fetch(`${base}map/climate.bin.gz`);
    if (!r.ok) throw new Error(`climate.bin.gz: HTTP ${r.status}`);
    const cells = await maybeGunzip(new Uint8Array(await r.arrayBuffer())), w = mapW >> 1, h = mapH >> 1;
    if (cells.length !== w * h) throw new Error(`climate.bin: expected ${w * h} bytes, got ${cells.length}`);
    return { w, h, cells };
  })();
  return loaded;
}
/** The byte of the place at map pixel (px, py): round the globe the layer begins again, north and south of it its edge goes on. */
export const climateAt = (c: Climate, px: number, py: number) =>
  c.cells[Math.max(0, Math.min(c.h - 1, Math.floor(py / 2))) * c.w + (((Math.floor(px / 2) % c.w) + c.w) % c.w)];
