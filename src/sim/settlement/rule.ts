// The ground of a town: feature 1 of the settlement (docs/SETTLEMENT_DESIGN.md, where every source is listed).
// How much ground a town of so many people takes, how large the parcel of a family is, and where the parcels lie.
// Only arithmetic here, no state: src/sim/systems/lots.ts writes the land register with it.
//
// The world is a diorama (src/sim/scale.ts): it has a hundredth of the people, and a house is as large as a real
// one. So a town takes a hundredth of the ground of the real town, and a family has as much ground as a real one.
import AREA from '../content/settled_area_1300.json';
import { SCALE } from '../scale';

/** The settled area of a town of N inhabitants around 1300 in hectares, A = a·N^β: the least-squares line through
 *  the 173 towns of Cesaretti et al. (2016), dataset S1, computed by tools/history/1291/settled_area.py (the paper's
 *  Table 1 gives the same pooled exponent, 0.714). The towns of the data have 1,000 to 200,000 inhabitants and lie in
 *  England, France, the Low Countries, northern Italy and Germany; the world applies the law to every town
 *  (assumption: no such data read for the towns outside western Europe). */
export const AREA_LAW = { a: AREA.law.a_ha as number, beta: AREA.law.beta as number } as const;

/** The towns the data measured, by their site: the inhabitants and the settled hectares the data gives. */
const MEASURED: ReadonlyMap<number, { people: number; hectares: number }> = new Map(
  (AREA.towns as { site: number; people: number; area_ha: number }[]).map((t) => [
    t.site,
    { people: t.people, hectares: t.area_ha },
  ]),
);
export const measuredTown = (site: number) => MEASURED.get(site);

/** The share of a town's ground that is parcels: Grenade-sur-Garonne, founded in 1290, was laid out with 3,000 house
 *  lots of 75.76 hectares on about 100 hectares with streets, square and church (Boerefijn 2000, note 37). The rest
 *  is streets here: square and church are not built yet. */
export const PARCEL_SHARE = 0.76;
/** A parcel is this many times as deep as it is wide at the street: the lots of Grenade are 5 by 15 brasses
 *  (Boerefijn 2000); the Hofstätte of Freiburg im Breisgau is 50 by 100 feet, half as slender (Löbbecke). */
export const DEPTH_PER_WIDTH = 3;
/** Parcels side by side in a row of a block. A block is two rows back to back, so with parcels three times as deep as
 *  wide it is square, as the blocks of Grenade are (55.05 m; six lots of 9.175 m). The streets of feature 3 are as
 *  wide as the streets round such a block (src/sim/settlement/streets.ts, streetWidth). */
export const PARCELS_PER_ROW = 6;
/** The narrowest parcel front the sources know, in metres: three quarters of the Edinburgh unit of 5.5 m (Stell &
 *  Tait 2016). Below it one parcel a family would no longer hold: no town of 1291 comes near it (the narrowest
 *  front is Cairo's, 5.5 m; tests/settlement.test.ts). */
export const NARROWEST_FRONT = 4.1;

/** The settled hectares of the real town with `people` inhabitants. A town the data measured keeps how far it lies
 *  above or below the law: its measured hectares, taken along the law's exponent from the inhabitants the data gives
 *  it to `people` (OWN RULE: the data and the world count some towns differently, Hamburg 8,000 and 20,300). */
export function settledHectares(people: number, site = -1): number {
  if (!(people > 0)) return 0;
  const m = MEASURED.get(site);
  return m ? m.hectares * Math.pow(people / m.people, AREA_LAW.beta) : AREA_LAW.a * Math.pow(people, AREA_LAW.beta);
}

/** The ground of a town of the world in square metres, for `persons` persons of the world who live in it: the
 *  settled area of the real town they were derived from, divided by SCALE (a hectare is 10,000 m²). */
export const townGround = (persons: number, site = -1): number =>
  (settledHectares(persons * SCALE, site) * 10000) / SCALE;

export interface ParcelSize {
  /** metres at the street */
  w: number;
  /** metres deep */
  d: number;
}

/** The parcel of each of `families` families on `ground` square metres of town: they share the parcels' part of the
 *  ground equally (OWN RULE: no source read on how unequal parcels were within a town). */
export function parcelSize(ground: number, families: number): ParcelSize {
  const w = Math.sqrt((PARCEL_SHARE * ground) / families / DEPTH_PER_WIDTH);
  return { w, d: DEPTH_PER_WIDTH * w };
}

/** The sides a parcel can front: the street lies to its north, east, south or west. */
export const FRONT = { north: 0, east: 1, south: 2, west: 3 } as const;

export interface Parcel {
  /** the middle of the parcel: metres east and south of the town's centre */
  x: number;
  z: number;
  front: number;
}

/** The ground a parcel covers, east-west (`w`) and north-south (`d`): its width runs along its street, so a parcel
 *  that fronts a street to its east or west lies the other way round. */
export const footprint = (p: { front: number }, size: ParcelSize): ParcelSize =>
  p.front === FRONT.north || p.front === FRONT.south ? size : { w: size.d, d: size.w };
