// Where a crown goes when the world has gone another way than history and history's holder of the day is not there
// (unborn, or dead in the world before the day history lets them die). src/sim/systems/rulers.ts plays the chronicle
// and asks here at the end of every day for each realm the day touched.
//
// - A crown history leaves with nobody, or with a person the world never had a seat for, stays as history has it:
//   that is no difference between the world and history.
// - Else the crown goes back to history where it can: to a person history has reigning that day whom the world has
//   alive (the minimal-rewrite rule of Tetlock & Belkin 1996, Counterfactual Thought Experiments in World Politics,
//   ch. 1: change as little of history as the counterfactual needs).
// - Else, where the crown is in a dynastic union with another (Kokkonen & Sundell 2014, online appendix, Table B4,
//   the year a state leaves their sample for one), to the holder of that crown in the world: the union is that one
//   person holds both.
// - Else to the heir of the last holder by the realm's order of succession (src/sim/systems/heirs.ts, by realm and
//   year in the chronicle); a kin who never reigned comes into the world for it.
// - Else (an election, a realm whose order no source codes, or no heir by blood) to the next person history let
//   take the crown whom the world has alive, only earlier. OWN RULE: no model of an election or of an unknown order
//   was read; this keeps the choice of the electors and of history, and moves only the day (the minimal rewrite).
// - Else the crown stays with nobody until history's next holder takes it.
//
// How long a person of history lives who is not in the world (yet) is `lifeEnd`: the day of the sources, or a day of
// the life table where they give none, the same day the person dies on once in the world. In a free world
// (`World.rulerDeaths` 'drawn') every person with a known birth dies on a day of the life table, and a ruler can be
// murdered: Eisner (2011, Killing Kings: Patterns of Regicide in Europe, AD 600–1800, British Journal of Criminology
// 51(3), 556–577, abstract) counts "a homicide rate of about 1,000 per 100,000 ruler-years" among 1,513 monarchs of
// 45 monarchies, taken here as a constant hazard while the person holds a crown.
import type { WorldState } from '../state';
import { ALIVE, BORN_UNKNOWN } from '../state';
import type { World } from '../world';
import type { Chronicle, ChronicleLawDays } from '../content/chronicle';
import { heirOf } from './heirs';
import { ageAtDeath } from './deaths';

const DAYS_PER_YEAR = 365.25;
/** Murders of rulers per ruler-year (Eisner 2011, see above). */
const MURDER_PER_YEAR = 1000 / 100000;
/** The draws of a person of history used here (src/sim/systems/rulers.ts uses 10 to 21 and 100 on). */
export const DRAW = { life: 2, murder: 3 } as const;

/** What the rulers system knows of the persons of history in a state. */
export interface Persons {
  /** the row of the person `p` of the chronicle, undefined when not in the world */
  row(p: number): number | undefined;
  unborn(p: number): boolean;
  /** brings the person `p` of the chronicle into the world in the seat of `realm` on `day`: the row, or undefined
   *  when the realm has no place */
  enter(p: number, realm: number, day: number): number | undefined;
  /** the draw `k` of the person's own stream, in [0, 1) */
  draw(p: number, k: number): number;
}

/** The day the person `p` of the chronicle dies in this world once born into it, or null where nothing tells (no
 *  birth, and no death in the sources). In a free world only a death before the world's first day is history's. */
export function lifeEnd(w: World, c: Chronicle, p: number, u: number): number | null {
  const born = c.bornDay[p],
    died = c.diedDay[p];
  if (died !== null && (w.rulerDeaths === 'chronicle' || died < 0)) return died;
  if (born === null) return w.rulerDeaths === 'chronicle' ? null : died;
  // alive on the world's first day, and on the last day the sources show the person alive
  const from = Math.max(born, 0, w.rulerDeaths === 'chronicle' ? (c.seenUntil[p] ?? born) : born);
  return Math.max(from + 1, born + Math.ceil(ageAtDeath((from - born) / DAYS_PER_YEAR, u) * DAYS_PER_YEAR));
}

/** The day a ruler who takes a first crown on `day` is murdered while holding it, in a free world (Eisner 2011). */
export function murderDay(day: number, u: number): number {
  return day + Math.ceil((-Math.log(1 - u) / MURDER_PER_YEAR) * DAYS_PER_YEAR);
}

/** The order of succession of the realm `key` on `day`, undefined where no source codes one. */
function lawOf(c: Chronicle, key: string, day: number): ChronicleLawDays | undefined {
  let law: ChronicleLawDays | undefined;
  for (const l of c.lawsOf.get(key) ?? []) if (l.from <= day) law = l;
  return law?.order ? law : undefined;
}

/** Settles the crowns of the realms `touched` (each with the person who left it, or -1) at the end of `day`; a crown
 *  in union with another after the others, so that it finds the other's holder of the day. */
export function settleAll(
  s: WorldState,
  w: World,
  c: Chronicle,
  persons: Persons,
  touched: ReadonlyMap<number, number>,
  day: number,
  take: (r: number, id: number) => void,
): void {
  const union = (r: number) => lawOf(c, s.realmText[r].key, day)?.order === 'union';
  for (const late of [false, true])
    for (const [r, left] of touched) if (union(r) === late) settle(s, w, c, persons, r, day, left, take);
}

/** Gives the crown of `r`, if nobody holds it at the end of `day` though history has it with a person the world
 *  lacks, to whom the rules above name; `left` is the person of the chronicle who left it that day, or -1. `take`
 *  gives the crown. */
function settle(
  s: WorldState,
  w: World,
  c: Chronicle,
  persons: Persons,
  r: number,
  day: number,
  left: number,
  take: (r: number, id: number) => void,
): void {
  if (s.realm.cols.holder[r] >= 0) return;
  const id = successor(s, w, c, persons, r, day, left);
  if (id !== undefined) take(r, id);
}

/** The row of the person the rules above give the empty crown of `r` on `day`, entering a kin who inherits; undefined
 *  for nobody. */
function successor(
  s: WorldState,
  w: World,
  c: Chronicle,
  persons: Persons,
  r: number,
  day: number,
  left: number,
): number | undefined {
  const P = s.person.cols,
    key = s.realmText[r].key,
    reigns = c.reignsOf.get(key) ?? [];
  // history's holders of the day: reigning, and alive in history (a reign the sources let outlast the death is over)
  const now = reigns.filter((g) => {
    const died = c.diedDay[g.person];
    return g.start <= day && (g.end === null || g.end > day) && (died === null || died > day);
  });
  if (!now.some((g) => persons.row(g.person) !== undefined || persons.unborn(g.person))) return undefined;
  const alive = (p: number): boolean => {
    const id = persons.row(p);
    if (id !== undefined) return P.died[id] === ALIVE && (P.born[id] === BORN_UNKNOWN || P.born[id] <= day);
    const born = c.bornDay[p];
    if (born === null || born > day || persons.unborn(p)) return false;
    const end = lifeEnd(w, c, p, persons.draw(p, DRAW.life));
    return end !== null && end > day;
  };
  for (const g of now) {
    const id = persons.row(g.person);
    if (id !== undefined && alive(g.person)) return id;
  }
  const law = lawOf(c, key, day),
    last = left >= 0 ? left : predecessor(reigns, now, day);
  if (law?.order === 'union' && law.with) {
    // the holder of the other crown in the world, as history's union has the holder of both
    const h = s.realm.cols.holder[s.realmText.findIndex((t) => t.key === law.with)] ?? -1;
    if (h >= 0 && P.died[h] === ALIVE) return h;
  }
  const heir = law?.order && last !== null ? heirOf(c, last, law.order, alive) : null;
  if (heir !== null) {
    const id = persons.row(heir) ?? persons.enter(heir, r, day);
    if (id !== undefined) return id;
  }
  for (const g of [...reigns].sort((a, b) => a.start - b.start)) {
    const id = persons.row(g.person);
    if (g.start > day && id !== undefined && alive(g.person)) return id;
  }
  return undefined;
}

/** History's holder before the day, other than those of the day: whose heir the crown seeks when nobody left it on
 *  the day itself (a crown history gave to a person not born into the world). */
function predecessor(
  reigns: readonly { person: number; start: number }[],
  now: readonly { person: number }[],
  day: number,
): number | null {
  let best: { person: number; start: number } | null = null;
  for (const g of reigns)
    if (g.start < day && !now.some((x) => x.person === g.person) && (!best || g.start >= best.start)) best = g;
  return best ? best.person : null;
}
