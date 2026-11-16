// The field land of a start year: for every piece of the game map, the share of its land that lies under field lots
// when the arable the simulation has cultivated in each place is laid on the place's best soil first, as the
// simulation takes it (tools/worldprobe/build_fieldland.py: the yields of the simulation's own land data, the forest
// of the year left standing). One byte per two by two pixels of the game map, 0 … 250 for 0 … 1 and 255 where no
// land of a place is (water, beyond the game map).
import { maybeGunzip } from '../render/assets';

export interface FieldLand { w: number; h: number; cells: Uint8Array }
/** a byte of the layer: 0 … FULL is a share of 0 … 1, NONE no land */
const FULL = 250, NONE = 255;
/** the start years the layer was made for */
const YEARS: ReadonlySet<number> = new Set([1291]);

const loaded = new Map<number, Promise<FieldLand | null>>();
/** The field land of a start year on the game map of mapW × mapH pixels, once per year; null for a year without it. */
export function loadFieldLand(base: string, year: number | undefined, mapW: number, mapH: number): Promise<FieldLand | null> {
  if (year === undefined || !YEARS.has(year)) return Promise.resolve(null);
  let p = loaded.get(year);
  if (!p) {
    p = (async () => {
      const r = await fetch(`${base}map/fieldland_${year}.bin.gz`);
      if (!r.ok) throw new Error(`fieldland_${year}.bin.gz: HTTP ${r.status}`);
      const cells = await maybeGunzip(new Uint8Array(await r.arrayBuffer())), w = mapW >> 1, h = mapH >> 1;
      if (cells.length !== w * h) throw new Error(`fieldland_${year}.bin: expected ${w * h} bytes, got ${cells.length}`);
      return { w, h, cells };
    })();
    loaded.set(year, p);
  }
  return p;
}
/**
 * The share of the land about pixel (px, py) of the game map that lies under field lots, 0 … 1, between the cells
 * that hold land; null where none of the four round it does (water, beyond the game map).
 */
export function fieldLandAt(f: FieldLand, px: number, py: number): number | null {
  const fx = px / 2 - 0.5, fy = py / 2 - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  let sum = 0, weight = 0;
  for (let k = 0; k < 4; k++) {
    const x = x0 + (k & 1), y = y0 + (k >> 1);
    if (x < 0 || y < 0 || x >= f.w || y >= f.h) continue;
    const v = f.cells[y * f.w + x], part = (k & 1 ? tx : 1 - tx) * (k >> 1 ? ty : 1 - ty);
    if (v !== NONE) { sum += v * part; weight += part; }
  }
  return weight > 0 ? sum / weight / FULL : null;
}
