// The workers of the economies as the world gives them to the engine (economy/src/workers.rs): who is away on which
// days, whether the family stands in, and who works by the day.
//
// A worker who is sick or in childbed is away (people feature 9, economy feature 22, src/sim/people/absence.ts). On a
// day on which a worker is away, an adult of the worker's family who does not work and is not away himself stands in
// for him (economy feature 24): sick tenants found "a family member or even a hired laborer" to take their place
// (Owen, Brown and Skinner 2025, Sick leave of customary tenants in late medieval England, Journal of British Studies
// 64, e92, p. 5). Where nobody of the family is there, the engine takes a worker without work (economy feature 23).
// A worker who heads a family works by the day, every other worker serves by the year (people feature 10).
import type { CityEconomies, WorldState } from '../state';
import { ALIVE } from '../state';
import type { CityAbsences } from '../economy/engine';
import { hash01 } from '../rng';
import { ROLE, WORKING_AGE, K } from './work';
import { ageOn } from './people';
import { citiesByPlace } from './household';
import { presentPersons } from '../people/living';
import { CHILDBED_DAYS, awayDays, sickness } from '../people/absence';

/** The workers of every city who are away on the days from the day after `e.day` to the day `to` (people feature 9,
 *  economy feature 22, src/sim/people/absence.ts): every living worker on the days of the worker's sickness, and a
 *  mother for 30 days from the birth of a child, of the children born and of the birth that is due. Absences are by
 *  the worker's place in the engine's list, which keeps the firm: a part that passes to another person keeps the days
 *  of the one before until the absences are given again.
 *
 *  Of every day away the absence says whether the family stands in (economy feature 24): an adult of the worker's
 *  family (15 or more, as a person who works: src/sim/systems/work.ts) who has no part as a worker, an owner or the
 *  owner of the bank, is alive and is not away himself that day, and does not stand in for another worker of the
 *  family that day. A run of days away is cut where that changes. OWN RULE: where several adults could, they stand in
 *  in the order of a draw of each (`K.standsIn`), so that the same world always gives the same stand-ins; the source
 *  names no order. */
export function absences(s: WorldState, e: CityEconomies, to: number): CityAbsences[] {
  const from = e.day + 1,
    P = s.person.cols,
    Fam = s.family.cols,
    t = s.person,
    seed = s.seed >>> 0;
  // the births whose childbed reaches the days, by the uid of the mother
  const births = new Map<number, number[]>();
  for (let id = 0; id < t.size; id++) {
    const b = P.born[id],
      mother = P.mother[id];
    if (!t.alive[id] || mother < 0 || b <= from - CHILDBED_DAYS || b > to) continue;
    const list = births.get(mother);
    if (list) list.push(b);
    else births.set(mother, [b]);
  }
  // the runs of days on which a person is away
  const away = (id: number): number[] => {
    const childbeds = [...(births.get(P.uid[id]) ?? [])];
    if (P.bears[id] !== ALIVE && P.bears[id] >= from && P.bears[id] <= to) childbeds.push(P.bears[id]);
    return awayDays(sickness(seed, P.uid[id], P.born[id], to + 1), childbeds, from, to);
  };
  // the adults of every family who do not work, in the order in which they stand in
  const home = new Map<number, number[]>();
  for (const id of presentPersons(s)) {
    const role = P.role[id];
    if ((role !== ROLE.none && role !== ROLE.idle) || P.died[id] !== ALIVE || ageOn(P.born[id], to) < WORKING_AGE)
      continue;
    const list = home.get(P.family[id]);
    if (list) list.push(id);
    else home.set(P.family[id], [id]);
  }
  const draw = (id: number) => hash01(seed, P.uid[id], K.standsIn);
  for (const list of home.values()) list.sort((a, b) => draw(a) - draw(b));
  const awayOf = new Map<number, number[]>(),
    busy = new Set<number>(); // a stand-in on a day: id * 32 + day − from (a month has at most 31 days)
  const standsIn = (id: number, d: number): boolean => {
    let days = awayOf.get(id);
    if (!days) {
      days = away(id);
      awayOf.set(id, days);
    }
    for (let r = 0; r < days.length; r += 2) if (days[r] <= d && d <= days[r + 1]) return false;
    return ageOn(P.born[id], d) >= WORKING_AGE && !busy.has(id * 32 + d - from);
  };
  const family = (worker: number, d: number): boolean => {
    for (const id of home.get(P.family[worker]) ?? [])
      if (standsIn(id, d)) {
        busy.add(id * 32 + d - from);
        return true;
      }
    return false;
  };
  const cityOf = citiesByPlace(s, e),
    runs: number[][][] = Array.from({ length: e.places.length }, () => [[], [], [], []]);
  for (const id of presentPersons(s)) {
    if (P.role[id] !== ROLE.worker || P.died[id] !== ALIVE) continue;
    const k = cityOf[Fam.place[P.family[id]]];
    if (k < 0) continue;
    const days = away(id),
      [worker, first, last, covered] = runs[k];
    const push = (a: number, b: number, f: boolean) => {
      worker.push(P.agent[id]);
      first.push(a - from);
      last.push(b - from);
      covered.push(f ? 1 : 0);
    };
    for (let r = 0; r < days.length; r += 2) {
      let start = days[r],
        f = family(id, start);
      for (let d = start + 1; d <= days[r + 1]; d++) {
        const g = family(id, d);
        if (g === f) continue;
        push(start, d - 1, f);
        start = d;
        f = g;
      }
      push(start, days[r + 1], f);
    }
  }
  return runs.map(([worker, first, last, covered]) => ({
    worker: Uint32Array.from(worker),
    first: Uint32Array.from(first),
    last: Uint32Array.from(last),
    family: Uint8Array.from(covered),
  }));
}

/** The workers of every city who work by the day (people feature 10, economy feature 23, economy/src/workers.rs), by
 *  their place in the engine's list: every living worker who heads a family, as its man or its woman. Every other
 *  worker, who lives in the family of another without a household of his own, serves by the year. Day labourers were
 *  often "smallholding tenants who used temporary employment to supplement the incomes" of their land, while the
 *  famuli were hired "most commonly for the whole agricultural year" (Claridge, Delabastita and Gibbs 2024, (In-kind)
 *  Wages and labour relations in the Middle Ages, working paper, p. 13); married women worked by the day, unmarried
 *  women in annual service (Humphries and Weisdorf 2015, The wages of women in England, 1260–1850, Journal of
 *  Economic History 75). In the world of 1291 this puts 54 % of the workers in service by the year, against about 40
 *  to 46 % in the sources (Humphries and Weisdorf 2019, Unreal wages?, Economic Journal 129); the gap is not tuned. A
 *  part that passes to another person keeps the contract of the one before until the contracts are given again. */
export function contracts(s: WorldState, e: CityEconomies): Uint32Array[] {
  const P = s.person.cols,
    Fam = s.family.cols,
    cityOf = citiesByPlace(s, e);
  const byTheDay: number[][] = Array.from(e.places, () => []);
  for (const id of presentPersons(s)) {
    if (P.role[id] !== ROLE.worker || P.died[id] !== ALIVE) continue;
    const f = P.family[id],
      k = cityOf[Fam.place[f]];
    if (k >= 0 && (Fam.man[f] === id || Fam.woman[f] === id)) byTheDay[k].push(P.agent[id]);
  }
  return byTheDay.map((c) => Uint32Array.from(c));
}
