// The cities whose persons the simulation founds (src/sim/systems/people.ts) and the figures show (src/figures), by the
// start year of the world.
// 1356: the 30 largest after Chandler (Reba, Reitsma & Seto 2016, CC BY 4.0), tools/people/build_cities.py.
// 1291: every town of the world graphic with people inside the world frame (tools/history/1291/towns.py): Chandler's
// value where he has one, else the gazetteer's pop1356 times the factor of the region; Chandler's towns come first.
import C1356 from './cities_1356.json';
import C1291 from './cities_1291.json';

export interface City {
  name: string;
  country: string;
  people: number;
  certainty: number;
  years: number[];
  place: number;
  placeName: string;
  lon: number;
  lat: number;
  site: number;
  /** where `people` comes from (1291): 'chandler' or 'factor' (pop1356 times the factor of the region) */
  source?: string;
}

const BY_YEAR: ReadonlyMap<number, readonly City[]> = new Map([
  [1356, C1356.cities as City[]],
  [1291, C1291.cities as City[]],
]);

/** Whether a start year has its own cities (and so persons). */
export const hasCities = (year: number): boolean => BY_YEAR.has(year);

/** The cities of a start year; none for a year without them. */
export const citiesOf = (year: number): readonly City[] => BY_YEAR.get(year) ?? [];
