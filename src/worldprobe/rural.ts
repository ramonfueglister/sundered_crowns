// The people on the land of a start year, from the simulation's own numbers (tools/worldprobe/build_rural.py): for
// every place of the game map the people per km² who live outside its towns. One byte per two by two pixels of the
// game map, 255 where no place is, else round(25 · log2(1 + people per km²)). The farmhouses beside the fields stand
// for them (settle.ts), so that the land shows where many live and where few.
import { maybeGunzip } from '../render/assets';

export interface Rural { w: number; h: number; cells: Uint8Array }
/** a byte of the layer: STEPS to a doubling of 1 + people per km², NONE where no place is */
const STEPS = 25, NONE = 255;
/** the start years the layer was made for */
const YEARS: ReadonlySet<number> = new Set([1291]);

const loaded = new Map<number, Promise<Rural | null>>();
/** The people on the land of a start year on the game map of mapW × mapH pixels, once per year; null for a year without the layer: the farmhouses then stand as everywhere alike. */
export function loadRural(base: string, year: number | undefined, mapW: number, mapH: number): Promise<Rural | null> {
  if (year === undefined || !YEARS.has(year)) return Promise.resolve(null);
  let p = loaded.get(year);
  if (!p) {
    p = (async () => {
      const r = await fetch(`${base}map/rural_${year}.bin.gz`);
      if (!r.ok) throw new Error(`rural_${year}.bin.gz: HTTP ${r.status}`);
      const cells = await maybeGunzip(new Uint8Array(await r.arrayBuffer())), w = mapW >> 1, h = mapH >> 1;
      if (cells.length !== w * h) throw new Error(`rural_${year}.bin: expected ${w * h} bytes, got ${cells.length}`);
      return { w, h, cells };
    })();
    loaded.set(year, p);
  }
  return p;
}
/** The people per km² on the land of the place at pixel (px, py) of the game map; null where no place is (water, beyond the game map). Places have borders: nothing is blended between them. */
export function ruralAt(r: Rural, px: number, py: number): number | null {
  const x = Math.floor(px / 2), y = Math.floor(py / 2);
  if (x < 0 || y < 0 || x >= r.w || y >= r.h) return null;
  const v = r.cells[y * r.w + x];
  return v === NONE ? null : 2 ** (v / STEPS) - 1;
}
