// What kind of land a place is, from tools/worldprobe/build_climate.py: one byte per two by two map pixels, the kind
// (from the Köppen-Geiger climate zones) in the low bits and, in bit 7, whether the forest layer of 1356 knows the place.
import { maybeGunzip } from '../render/assets';

export const Land = { None: 0, Temperate: 1, Mediterranean: 2, Steppe: 3, Desert: 4, Savanna: 5, Rainforest: 6, Boreal: 7, Tundra: 8, Ice: 9 } as const;
export interface Climate { w: number; h: number; cells: Uint8Array }

let loaded: Promise<Climate> | undefined;
/** The climate layer of a map of mapW × mapH pixels. */
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
/** The byte of the place at map pixel (px, py); beyond the map that of its edge. */
export const climateAt = (c: Climate, px: number, py: number) =>
  c.cells[Math.max(0, Math.min(c.h - 1, Math.floor(py / 2))) * c.w + Math.max(0, Math.min(c.w - 1, Math.floor(px / 2)))];
