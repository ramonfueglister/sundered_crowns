// The land under the plough of a start year, from the simulation's own numbers (tools/worldprobe/build_arable.py):
// for every place of the game map the share of its land the simulation has cultivated, the fallow counted in. One
// byte per two by two pixels of the game map, 255 where no place is, else round(250 · share). The world graphic lays
// its fields by it (world.ts), so that it shows as much ploughed land as the simulation reckons with.
import { type PlaceLayer, byteAt, loadPlaceLayer } from './placelayer';

export type Arable = PlaceLayer;
/** the byte of a place all under the plough */
const FULL = 250;

/** The land under the plough of a start year on the game map of mapW × mapH pixels, once per year; null for a year without the layer: the fields then lie as the game's layer of 1356 has them. */
export const loadArable = (
  base: string,
  year: number | undefined,
  mapW: number,
  mapH: number,
): Promise<Arable | null> => loadPlaceLayer('arable', base, year, mapW, mapH);
/** The share of its land the place at pixel (px, py) of the game map has under the plough, 0 … 1; null where no place is (water, beyond the game map). */
export function arableAt(a: Arable, px: number, py: number): number | null {
  const v = byteAt(a, px, py);
  return v === null ? null : v / FULL;
}
