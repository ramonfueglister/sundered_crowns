// Grain harvest per place: feature 1 of the economy (docs/ECONOMY_DESIGN.md, where every source is listed).
//
//   Y_i = Z · (A_i · X_i)^α · L_i^(1−α)                               Ashraf and Galor (2011), equation 1
//
// X_i is the arable of the place (feature 2, src/sim/systems/cultivation.ts) and A_i the productivity of that land,
// so A_i · X_i is the sum of yield × area over the cultivated land, best soil first ("soil" below). L_i are the people
// who live from agriculture. Z is the one constant of the whole map. It is fixed by a single case, England in
// 1300–09: L_E people brought in Y_E. Written with England's land T_E, Y_E = Z · T_E^α · L_E^(1−α), and a place's
// harvest is England's, scaled by its share of England's land and labour:
//
//   Y_i = Y_E · (A_i · X_i / T_E)^α · (L_i / L_E)^(1−α)
//
// T_E (World.landEngland) is set so that England's places, with the people of 1300–09 and the arable they cultivate,
// together bring in Y_E (tools/sim/calibrate_cultivation.ts).
//
// Z does not change over time: Bouscasse, Nakamura and Steinsson (2025, p. 848) find no productivity growth in
// England before 1600.
import type { System } from '../schedule';
import type { WorldState } from '../state';
import type { World } from '../world';
import { soilOf } from './cultivation';
import { ofTime, toHeads } from '../scale';

/** α, the share of land: Bouscasse, Nakamura, Steinsson (2025), Quarterly Journal of Economics 140(2), p. 847. */
export const LAND_SHARE = 0.70;

/** Share of the people who live from agriculture: Allen (2000), England 74 % around 1500, as cited by Crafts and
 *  Harley (2002), p. 2. While the share is the same everywhere it cancels out of L_i / L_E. */
export const FARM_SHARE = 0.74;

/** The calibration case: Broadberry, Campbell, Klein, Overton, van Leeuwen (2010), table 19, row 1300/09. */
export const ENGLAND_1300 = {
  people: 4.72e6,
  /** kilocalories per head and day from arable farming, net of seed, fodder and the losses of storage and processing */
  kcalPerHeadDay: 1242,
} as const;

const DAYS_PER_YEAR = 365;

/** People of a place who live from agriculture (L). */
export const farmers = (people: number): number => FARM_SHARE * people;

/** England's harvest of 1300–09 in kilocalories per year (Y_E). */
export const ENGLAND_HARVEST = ENGLAND_1300.kcalPerHeadDay * ENGLAND_1300.people * DAYS_PER_YEAR;

/** The harvest of one year in kilocalories from `soil` (Σ yield × hectares of the cultivated land), worked by
 *  `labour` people. `englandLand` is T_E (World.landEngland). */
export function harvestKcal(soil: number, labour: number, englandLand: number, landShare = LAND_SHARE): number {
  if (!(soil > 0) || !(labour > 0)) return 0; // also covers places without data (NaN)
  return ENGLAND_HARVEST * Math.pow(soil / englandLand, landShare) * Math.pow(labour / farmers(ENGLAND_1300.people), 1 - landShare);
}

/** Kilocalories per head and day that a year's harvest gives the people of a place. */
export const kcalPerHeadDay = (kcal: number, people: number): number => (people > 0 ? kcal / people / DAYS_PER_YEAR : 0);

/** Brings in the harvest of every place from its arable and the people who live there now. The rule is fitted in
 *  people of the time; the harvest is counted for the heads of the simulation (src/sim/scale.ts), so a head gets as
 *  many kilocalories a day as a person of the time. */
export function bringInHarvest(s: WorldState, w: World): void {
  const h = s.place.harvest, pop = s.place.pop, arable = s.place.arable;
  for (let i = 0; i < h.length; i++) h[i] = toHeads(harvestKcal(soilOf(w, i, arable[i]), farmers(ofTime(pop[i])), w.landEngland));
}

/** One harvest a year, on the first day of the year. */
export const harvest: System = {
  id: 'harvest',
  run(s, w, t) { if (t.newYear) bringInHarvest(s, w); },
};
