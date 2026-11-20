// The calibration of cultivated land and harvest on England (docs/ECONOMY_DESIGN.md, feature 2).
//
// One case at two dates, because two numbers are to be fixed: with the people of 1300–09 England's places together
// cultivate the arable of 1300, with the people of 1380–89 the arable of 1380 (Broadberry et al. 2010, tables 1
// and 19). That gives the land limit s and the arable per head c. The harvest is then fixed as before by England in
// 1300–09: England's places together bring in Y_E, which gives T_E.
//
// The people of a decade are spread over England's places as on the map at its start in 1356: every place is scaled
// by the same factor. There is no source for how they were spread in 1300 or 1380.
import { arableHa, soilOf, ENGLAND_ARABLE, HECTARES_PER_ACRE } from '../../src/sim/systems/cultivation';
import { harvestKcal, kcalPerHeadDay, farmers, LAND_SHARE, ENGLAND_1300 } from '../../src/sim/systems/harvest';
import type { World, CultivationJson } from '../../src/sim/world';

interface EnglandAt {
  people: number;
  arableHa: number;
  arableAcres: number;
  kcal: number;
  perHeadDay: number;
  atLimit: number;
}

/** England's places with `people` in all, spread as `pop` is, under the given calibration. */
export function englandAt(
  w: World,
  places: readonly number[],
  pop: ArrayLike<number>,
  people: number,
  c: CultivationJson = { landLimit: w.landLimit, arablePerHead: w.arablePerHead, englandLand: w.landEngland },
  landShare = LAND_SHARE,
): EnglandAt {
  let start = 0;
  for (const i of places) start += pop[i];
  const f = people / start;
  let ha = 0,
    kcal = 0,
    atLimit = 0;
  for (const i of places) {
    const p = pop[i] * f,
      x = arableHa(w, i, p, c.arablePerHead, c.landLimit);
    ha += x;
    kcal += harvestKcal(soilOf(w, i, x), farmers(p), c.englandLand, landShare);
    if (p > 0 && c.arablePerHead * p > x) atLimit++;
  }
  return {
    people,
    arableHa: ha,
    arableAcres: ha / HECTARES_PER_ACRE,
    kcal,
    perHeadDay: kcalPerHeadDay(kcal, people),
    atLimit,
  };
}

/** The root of an increasing function between lo and hi. */
function root(f: (x: number) => number, lo: number, hi: number): number {
  if (!(f(lo) < 0 && f(hi) > 0)) throw new Error(`no root between ${lo} and ${hi}`);
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function calibrate(w: World, places: readonly number[], pop: ArrayLike<number>): CultivationJson {
  const a = ENGLAND_ARABLE;
  const arable = (people: number, landLimit: number, arablePerHead: number) =>
    englandAt(w, places, pop, people, { landLimit, arablePerHead, englandLand: 1 }).arableHa;
  // s for a given c: the arable of 1300; then c: the arable of 1380
  const limitFor = (c: number) =>
    root((s) => arable(a.y1300.people, s, c) - a.y1300.acres * HECTARES_PER_ACRE, 0.05, 1);
  const arablePerHead = root((c) => arable(a.y1380.people, limitFor(c), c) - a.y1380.acres * HECTARES_PER_ACRE, 1.2, 4);
  const landLimit = limitFor(arablePerHead);
  // T_E: with T_E = 1 the places bring in Y_E · T_E^α too much or too little
  const y = englandAt(w, places, pop, ENGLAND_1300.people, { landLimit, arablePerHead, englandLand: 1 });
  const englandLand = Math.pow(y.perHeadDay / ENGLAND_1300.kcalPerHeadDay, 1 / LAND_SHARE);
  return { landLimit, arablePerHead, englandLand };
}
