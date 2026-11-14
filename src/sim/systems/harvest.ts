// Grain harvest per place: feature 1 of the economy (docs/ECONOMY_DESIGN.md, where every source is listed).
//
//   Y_i = Z · (A_i · X_i)^α · L_i^(1−α)                               Ashraf and Galor (2011), equation 1
//
// A_i is the land productivity of the place (World.landYield), X_i its land in hectares, L_i the people who live
// from agriculture. Z is the one constant of the whole map. It is fixed by a single case, England in 1300–09, taken
// as one piece of land T_E = Σ A·X worked by L_E people who brought in Y_E:  Y_E = Z · T_E^α · L_E^(1−α).
// With Z replaced, a place's harvest is England's, scaled by its share of England's land and labour:
//
//   Y_i = Y_E · (A_i · X_i / T_E)^α · (L_i / L_E)^(1−α)
//
// Z does not change over time: Bouscasse, Nakamura and Steinsson (2025, p. 848) find no productivity growth in
// England before 1600.
import type { System } from '../schedule';
import type { WorldState } from '../state';
import type { World } from '../world';

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
const HECTARES_PER_KM2 = 100;

/** People of a place who live from agriculture (L). */
export const farmers = (people: number): number => FARM_SHARE * people;

/** The harvest of one year in kilocalories for land of `yieldPerHa` productivity over `hectares`, worked by `labour`
 *  people. `englandLand` is T_E (World.landEngland). */
export function harvestKcal(yieldPerHa: number, hectares: number, labour: number, englandLand: number, landShare = LAND_SHARE): number {
  if (!(yieldPerHa > 0) || !(hectares > 0) || !(labour > 0)) return 0; // also covers places without data (NaN)
  const yE = ENGLAND_1300.kcalPerHeadDay * ENGLAND_1300.people * DAYS_PER_YEAR;
  const land = (yieldPerHa * hectares) / englandLand;
  const work = labour / farmers(ENGLAND_1300.people);
  return yE * Math.pow(land, landShare) * Math.pow(work, 1 - landShare);
}

export const hectares = (w: World, i: number): number => w.area[i] * HECTARES_PER_KM2;

/** Kilocalories per head and day that a year's harvest gives the people of a place. */
export const kcalPerHeadDay = (kcal: number, people: number): number => (people > 0 ? kcal / people / DAYS_PER_YEAR : 0);

/** Brings in the harvest of every place from the people who live there now. */
export function bringInHarvest(s: WorldState, w: World): void {
  const h = s.place.harvest, pop = s.place.pop;
  for (let i = 0; i < h.length; i++) h[i] = harvestKcal(w.landYield[i], hectares(w, i), farmers(pop[i]), w.landEngland);
}

/** One harvest a year, on the first day of the year. */
export const harvest: System = {
  id: 'harvest',
  run(s, w, t) { if (t.newYear) bringInHarvest(s, w); },
};
