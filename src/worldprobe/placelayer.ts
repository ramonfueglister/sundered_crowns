// The layers of the world graphic that hold a number of the simulation for every place of the game map (the people
// on the land: rural.ts; the land under the plough: arable.ts), made by tools/worldprobe from the simulation's own
// data for a start year. One byte per two by two pixels of the game map, 255 where no place is (water, beyond the
// game map). A place has borders: nothing is blended between places.
import { maybeGunzip } from './gunzip';

export interface PlaceLayer {
  w: number;
  h: number;
  cells: Uint8Array;
}
/** the byte where no place is */
const NONE = 255;
/** the start years the layers were made for */
const YEARS: ReadonlySet<number> = new Set([1291]);

const loaded = new Map<string, Promise<PlaceLayer | null>>();
/** The layer `name` of a start year on the game map of mapW × mapH pixels, once per year; null for a year without it. */
export function loadPlaceLayer(
  name: string,
  base: string,
  year: number | undefined,
  mapW: number,
  mapH: number,
): Promise<PlaceLayer | null> {
  if (year === undefined || !YEARS.has(year)) return Promise.resolve(null);
  const file = `${name}_${year}.bin`;
  let p = loaded.get(file);
  if (!p) {
    p = (async () => {
      const r = await fetch(`${base}map/${file}.gz`);
      if (!r.ok) throw new Error(`${file}.gz: HTTP ${r.status}`);
      const cells = await maybeGunzip(new Uint8Array(await r.arrayBuffer())),
        w = mapW >> 1,
        h = mapH >> 1;
      if (cells.length !== w * h) throw new Error(`${file}: expected ${w * h} bytes, got ${cells.length}`);
      return { w, h, cells };
    })();
    loaded.set(file, p);
  }
  return p;
}
/** The byte of the place at pixel (px, py) of the game map; null where no place is. */
export function byteAt(l: PlaceLayer, px: number, py: number): number | null {
  const x = Math.floor(px / 2),
    y = Math.floor(py / 2);
  if (x < 0 || y < 0 || x >= l.w || y >= l.h) return null;
  const v = l.cells[y * l.w + x];
  return v === NONE ? null : v;
}
