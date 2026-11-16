// The people on the land of a start year, from the simulation's own numbers (tools/worldprobe/build_rural.py): for
// every place of the game map the people per km² who live outside its towns. One byte per two by two pixels of the
// game map, 255 where no place is, else round(25 · log2(1 + people per km²)). The farmhouses beside the fields stand
// for them (settle.ts), so that the land shows where many live and where few.
import { type PlaceLayer, byteAt, loadPlaceLayer } from './placelayer';

export type Rural = PlaceLayer;
/** a byte of the layer: STEPS to a doubling of 1 + people per km² */
const STEPS = 25;

/** The people on the land of a start year on the game map of mapW × mapH pixels, once per year; null for a year without the layer: the farmhouses then stand as everywhere alike. */
export const loadRural = (base: string, year: number | undefined, mapW: number, mapH: number): Promise<Rural | null> => loadPlaceLayer('rural', base, year, mapW, mapH);
/** The people per km² on the land of the place at pixel (px, py) of the game map; null where no place is (water, beyond the game map). Places have borders: nothing is blended between them. */
export function ruralAt(r: Rural, px: number, py: number): number | null {
  const v = byteAt(r, px, py);
  return v === null ? null : 2 ** (v / STEPS) - 1;
}
