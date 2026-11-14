// Cultivated land per place: feature 2 of the economy (docs/ECONOMY_DESIGN.md, where every source is listed).
//
//   X_i = min(c · P_i, s · F_i, F⁺_i)        best soil first
//
// A place cultivates as much arable as its people can work (c hectares per head), but never more than the land
// limit (the share s of its land F_i) and only land with a yield above zero (F⁺_i). This is how the published
// land-use reconstructions compute cropland, applied to a single place: cropland per capita × population (Klein
// Goldewijk et al. 2017, HYDE 3.2, section 2.3.1; Pongratz et al. 2008, paragraphs 12 and 14) up to a maximum area
// (HYDE 3.2, equation 1), and "the highest quality land for crops is cleared first" (Kaplan et al. 2009).
//
// c and s are fixed by one case at two dates, England in 1300 and in 1380 (Broadberry et al. 2010, tables 1 and 19):
// with the people of that time, England's places together cultivate the arable acreage of the source. The
// calibration is done by tools/sim/calibrate_cultivation.ts and stored in public/data/cultivation.json.
import type { System } from '../schedule';
import type { WorldState } from '../state';
import type { World } from '../world';

const HECTARES_PER_KM2 = 100;
/** One statute acre in hectares. */
export const HECTARES_PER_ACRE = 0.40468564224;

/** The calibration cases: Broadberry, Campbell, Klein, Overton, van Leeuwen (2010), table 1 (total arable, million
 *  acres, years 1300 and 1380) and table 19 (people, decades 1300/09 and 1380/89). */
export const ENGLAND_ARABLE = {
  y1300: { people: 4.72e6, acres: 11.52e6 },
  y1380: { people: 2.36e6, acres: 8.73e6 },
} as const;

/** Land of a place in hectares (F). */
export const hectares = (w: World, i: number): number => w.area[i] * HECTARES_PER_KM2;

/** The most a place can cultivate: the land limit s · F, and only land with a yield above zero. */
export function landLimitHa(w: World, i: number, landLimit = w.landLimit): number {
  return Math.min(landLimit, w.landFertile[i]) * hectares(w, i);
}

/** Arable of a place with `people` in hectares (X). */
export function arableHa(w: World, i: number, people: number, arablePerHead = w.arablePerHead, landLimit = w.landLimit): number {
  if (!(people > 0)) return 0;
  return Math.min(arablePerHead * people, landLimitHa(w, i, landLimit));
}

/** Σ A · x over the best `ha` hectares of a place: the soil the harvest counts with. */
export function soilOf(w: World, i: number, ha: number): number {
  const F = hectares(w, i), fertile = w.landFertile[i];
  let left = Math.min(ha, fertile * F), lo = 0, soil = 0;
  for (let k = w.landStepStart[i], e = 0; k < w.landStepStart[i + 1] && left > 0; k++, e++) {
    const hi = Math.min(w.landEdges[e], fertile);
    const take = Math.min(left, (hi - lo) * F);
    soil += take * w.landSteps[k]; left -= take; lo = hi;
  }
  return soil;
}

/** Sets the arable of every place from the people who live there now. */
export function cultivate(s: WorldState, w: World): void {
  const a = s.place.arable, pop = s.place.pop;
  for (let i = 0; i < a.length; i++) a[i] = arableHa(w, i, pop[i]);
}

/** The arable follows the people once a year, on the first day of the year, before the harvest is brought in. */
export const cultivation: System = {
  id: 'cultivation',
  run(s, w, t) { if (t.newYear) cultivate(s, w); },
};
