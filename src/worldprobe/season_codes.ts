// The fields by the season (people feature 12): what a piece of the world tells the stage of each of its field
// columns, so that the stage can show the field as it is on the world's day (src/lookprobe/stage/seasons.ts, by
// src/worldprobe/field_season.ts). A column's code says its farming year, the course it carries in the year the pieces
// are built for and in how many courses its land is tilled; its own number spreads the fields of a place over the
// weeks of their work. The fields are built in the colours and heights of that year's high summer, as before; the
// stage changes them from there.
//
// A piece hands the stage its season map (`SeasonMap`): four bytes to each of its own columns and those just beyond
// them, the code (with FAR_LOOK where the column shows its field's colour from afar, far_fields.ts, rather than its
// soil and sheaves), the number, and the height of the column's ground, on which the sheaves stand.
import { hash2 } from '../lookprobe/batch';
import { FIELD_COLUMNS } from '../lookprobe/faces';
import type { Part } from '../lookprobe/terrain';
import { FARM_YEAR, farmYearOf } from '../sim/people/farm_year';
import { climateOfLand } from './climate';
import { CROP } from './field_season';

/**
 * What a field column carries, by the codes' order within a farming year: its course this year (settle.ts: CROP,
 * whose numbers the field kinds of settle.ts are) and in how many courses its land is tilled. Of three courses the
 * fallow, the spring corn and the winter corn; of two the fallow and the corn; the vines; corn without a rotation.
 */
const COMBOS: readonly (readonly [first: number, courses: number])[] = [
  [CROP.fallow, 3],
  [CROP.spring, 3],
  [CROP.winter, 3],
  [CROP.fallow, 2],
  [CROP.winter, 2],
  [CROP.vine, 1],
  [CROP.winter, 1],
];
/** codes there are, the 0 of no field counted */
export const SEASON_CODES = 1 + Object.keys(FARM_YEAR).length * COMBOS.length;
/** added to a code where the column shows its field's colour from afar (far_fields.ts), not its soil and sheaves */
export const FAR_LOOK = 128;
/** bytes to a column of a season map */
export const SEASON_BYTES = 4;
/**
 * A piece draws the fields whose lot's middle lies on its own columns (settle.ts `own`), and a field of ten columns
 * reaches five beyond its middle (settle.ts LOT_W), a vine a little more: so far beyond its own columns its season map
 * reaches, that the sheaves of such a field find their codes.
 */
const REACH = 6;
/** columns to a side of a season map */
export const SEASON_SIDE = FIELD_COLUMNS + 2 * REACH;
/** the columns of a season map of the columns `part` on a ground of `side` × `side`: its first, and those on the ground */
function mapped(part: Part, side: number) {
  const x0 = part.x0 - REACH,
    z0 = part.z0 - REACH;
  return {
    x0,
    z0,
    xs: [Math.max(0, x0), Math.min(side, x0 + SEASON_SIDE)],
    zs: [Math.max(0, z0), Math.min(side, z0 + SEASON_SIDE)],
  };
}

/** The code of a field column of the farming year `farmYear` (FARM_YEAR) that carries `kind` this year (CROP, the
 *  field kinds of settle.ts) and is tilled in `courses` courses. */
export function seasonCode(farmYear: number, kind: number, courses: number): number {
  // (a field of spring corn is one of three courses, of the fallow one of two or three; corn of no rotation is one of one)
  let combo = courses >= 3 ? 2 : courses === 2 ? 4 : 6;
  if (kind === CROP.vine) combo = 5;
  else if (kind === CROP.spring) combo = 1;
  else if (kind === CROP.fallow) combo = courses >= 3 ? 0 : 3;
  return 1 + farmYear * COMBOS.length + combo;
}

/** What a code (FAR_LOOK taken off) stands for: the farming year, the course in the year the pieces are built for,
 *  and the courses; null for 0. */
export function seasonOf(code: number): { farmYear: number; first: number; courses: number } | null {
  if (code < 1 || code >= SEASON_CODES) return null;
  const [first, courses] = COMBOS[(code - 1) % COMBOS.length];
  return { farmYear: Math.floor((code - 1) / COMBOS.length), first, courses };
}

/** A field's own number (0 … 255) by its lot of the finest step (settle.ts; far_fields.ts draws its lots with `salt`). */
export const sowingOf = (lx: number, lz: number, salt = 0) => Math.min(255, Math.floor(hash2(lx, lz, 71 + salt) * 256));

/** Writes a field column's code and number into a list of two bytes to a column. */
export function sow(into: Uint8Array, i: number, code: number, sowing: number) {
  into[i * 2] = code;
  into[i * 2 + 1] = sowing;
}

/**
 * The farming year at a point of the ground: by the region of the place nearest to it (`regionAt`, asked once for
 * every square of TILE columns) and the climate of the column's own land (`landAt`, climate.ts `Land`). OWN RULE: the
 * places of the gazetteer carry the region, the fields lie between them; the field follows its nearest place, as a
 * farm is built as the place nearest to it builds (world.ts `farm`).
 */
export function farmYearsAt(regionAt: (x: number, z: number) => string, landAt: (x: number, z: number) => number) {
  const TILE = 8,
    regions = new Map<number, string>();
  return (x: number, z: number): number => {
    const tx = Math.floor(x / TILE),
      tz = Math.floor(z / TILE),
      key = (tx + 1024) * 4096 + tz + 1024;
    let region = regions.get(key);
    if (region === undefined) {
      region = regionAt((tx + 0.5) * TILE, (tz + 0.5) * TILE);
      regions.set(key, region);
    }
    return farmYearOf(region, climateOfLand(landAt(x, z)));
  };
}

/** The farming year added to the codes of the field columns of the season map of `part` (settle.ts writes them of the
 *  north's year). */
export function withFarmYears(
  codes: Uint8Array,
  side: number,
  part: Part,
  farmYear: (x: number, z: number) => number,
): Uint8Array {
  const { xs, zs } = mapped(part, side);
  for (let z = zs[0]; z < zs[1]; z++)
    for (let x = xs[0]; x < xs[1]; x++) {
      const i = z * side + x,
        code = codes[i * 2];
      if (code) codes[i * 2] = code + farmYear(x + 0.5, z + 0.5) * COMBOS.length;
    }
  return codes;
}

/** The fields of a piece's columns as the stage reads them (see above): from `x0`, `z0` of its ground, SEASON_SIDE a side. */
export interface SeasonMap {
  x0: number;
  z0: number;
  /** SEASON_BYTES to a column, the column (x, z) at (z − z0) × SEASON_SIDE + x − x0 */
  cols: Uint8Array;
}

/**
 * The season map of the columns of `part` on a ground of `side` × `side`, and of those REACH beyond them: their codes
 * and numbers (two bytes to a column, `sow`) and the heights of their ground `h` (whole blocks: the sheaves stand on
 * them). Of a far piece only
 * where its cover `shown` still shows the field: a way or a stream took it off here and there (world.ts). None where
 * no field lies.
 */
export function seasonMap(
  codes: Uint8Array | undefined,
  h: ArrayLike<number>,
  side: number,
  part: Part,
  shown?: { has: ArrayLike<number>; crops?: ArrayLike<number> },
): SeasonMap | undefined {
  if (!codes) return undefined;
  const cols = new Uint8Array(SEASON_SIDE * SEASON_SIDE * SEASON_BYTES),
    { x0, z0, xs, zs } = mapped(part, side);
  let any = false;
  for (let z = zs[0]; z < zs[1]; z++)
    for (let x = xs[0]; x < xs[1]; x++) {
      const i = z * side + x,
        at = ((z - z0) * SEASON_SIDE + x - x0) * SEASON_BYTES,
        height = Math.max(0, Math.min(65535, Math.round(h[i]))),
        code = codes[i * 2];
      cols[at + 2] = height & 255;
      cols[at + 3] = height >> 8;
      if (!code || (shown && !(code >= FAR_LOOK ? shown.has[i] : shown.crops?.[i]))) continue;
      cols[at] = code;
      cols[at + 1] = codes[i * 2 + 1];
      any = true;
    }
  return any ? { x0, z0, cols } : undefined;
}
