// Culture and faith of every person (step 4 of the world of towns, Ramon, 16 November 2026: only what the
// simulation computes is in the world; a town has the culture of its persons, with its minorities).
//
// A person of a town is founded with the culture and faith the setup gives the town's place: for 1291 the rules of
// data/history/1291/peoples.json with their sources, elsewhere the classification of 1356. A ruler has the culture
// and faith of the realm the ruler enters the world in. Nobody changes culture or faith yet.
//
// Minorities come into the world only where a source counts them for that one town (src/sim/content/
// communities_<year>.json): no share is drawn. A counted community of `people` becomes round(people / 100) persons at 1:100
// (src/sim/scale.ts), or `families` whole families where the source counts households, as whole families of its
// town, taken in a fixed order (a hash of the world's seed and the family) until the community has its persons; a
// family that would make it larger than counted is passed over. Rulers' families are never taken.
//
// The culture and faith of a place are those of its persons, counted (`placeCultures`): nothing is stored for a place.
import type { WorldState } from '../state';
import { ALIVE } from '../state';
import type { SetupState } from '../setup';
import { ALL_CULTURES, FAITH_INDEX } from '../content/peoples';
import { citiesOf } from '../content/cities';
import { SCALE } from '../scale';
import { hash01 } from '../rng';
import C1291 from '../content/communities_1291.json';

export interface Community { town: string; culture: string; faith: string; people?: number; families?: number; count: string; year: number; source: string }

const COMMUNITIES: ReadonlyMap<number, readonly Community[]> = new Map([[1291, C1291.communities as Community[]]]);

/** The index of a culture (unknown: 'unknown') and of a faith (unknown: 'latin'), as the setup reads them
 *  (src/sim/setup.ts). */
export function cultureIndex(c: string | null | undefined): number {
  const i = ALL_CULTURES.indexOf(c || 'unknown');
  return i < 0 ? ALL_CULTURES.indexOf('unknown') : i;
}
export const faithIndex = (f: string | null | undefined): number => FAITH_INDEX[f || 'latin'] ?? 0;

/** The counted communities of a start year; none for a year without them. */
export const communitiesOf = (year: number): readonly Community[] => COMMUNITIES.get(year) ?? [];

/** Gives every person of the towns the culture and faith of the setup for its place, every ruler those of the realm
 *  of the ruler's seat, then sets the counted communities. Done when the world is founded (after the persons, before
 *  the borders and the rulers, who take theirs from the realm they enter in) and by the upgrade to state 19. */
export function foundCultures(s: WorldState, setup: SetupState): void {
  const P = s.person.cols, F = s.family.cols, R = s.realm.cols;
  const ruler = new Set(s.named.map((n) => n.person)), holds = new Map<number, number>();
  for (let r = s.realm.size - 1; r >= 0; r--) if (R.holder[r] >= 0) holds.set(R.holder[r], r); // the first realm a ruler holds
  for (let id = 0; id < s.person.size; id++) {
    if (!s.person.alive[id]) continue;
    const place = F.place[P.family[id]];
    if (ruler.has(id)) { setRulerCulture(s, id, holds.get(id) ?? s.place.owner[place]); continue; }
    P.culture[id] = cultureIndex(setup.culture[place]); P.faith[id] = faithIndex(setup.faith[place]);
  }
  setCommunities(s);
}

/** A ruler takes the culture and faith of the realm `realm` (none known: those of the setup's unknown). */
export function setRulerCulture(s: WorldState, id: number, realm: number): void {
  const P = s.person.cols, R = s.realm.cols;
  if (realm >= 0 && realm < s.realm.size) { P.culture[id] = R.culture[realm]; P.faith[id] = R.faith[realm]; }
  else { P.culture[id] = cultureIndex(null); P.faith[id] = faithIndex(null); }
}

/** The counted communities of the world's start year, as whole families of their towns. */
export function setCommunities(s: WorldState): void {
  const P = s.person.cols, F = s.family.cols;
  const ruler = new Set(s.named.map((n) => n.person));
  for (const c of communitiesOf(s.startYear)) {
    const city = citiesOf(s.startYear).find((x) => x.name === c.town);
    if (!city) continue; // a world without that town (none of the start year has it unless the list is cut)
    const members = new Map<number, number[]>();
    for (let id = 0; id < s.person.size; id++) {
      if (!s.person.alive[id] || P.died[id] !== ALIVE) continue;
      const f = P.family[id];
      if (F.place[f] !== city.place) continue;
      const m = members.get(f) ?? []; m.push(id); members.set(f, m);
    }
    for (const [f, m] of members) if (m.some((id) => ruler.has(id))) members.delete(f);
    const order = [...members.keys()].sort((a, b) => hash01(s.seed >>> 0, a, 7001) - hash01(s.seed >>> 0, b, 7001) || a - b);
    const culture = cultureIndex(c.culture), faith = faithIndex(c.faith);
    const take = (f: number) => { for (const id of members.get(f)!) { P.culture[id] = culture; P.faith[id] = faith; } };
    if (c.families !== undefined) { order.slice(0, c.families).forEach(take); continue; }
    let left = Math.round((c.people ?? 0) / SCALE);
    for (const f of order) {
      if (left <= 0) break;
      const n = members.get(f)!.length;
      if (n <= left) { take(f); left -= n; }
    }
  }
}

/** The living persons of every place by culture and by faith: index of the culture or faith → persons. */
export function placeCultures(s: WorldState, place: number): { culture: Map<number, number>; faith: Map<number, number>; persons: number } {
  const P = s.person.cols, F = s.family.cols, culture = new Map<number, number>(), faith = new Map<number, number>();
  let persons = 0;
  for (let id = 0; id < s.person.size; id++) {
    if (!s.person.alive[id] || P.died[id] !== ALIVE || F.place[P.family[id]] !== place) continue;
    persons++;
    culture.set(P.culture[id], (culture.get(P.culture[id]) ?? 0) + 1);
    faith.set(P.faith[id], (faith.get(P.faith[id]) ?? 0) + 1);
  }
  return { culture, faith, persons };
}

/** The key with the most persons (the lowest index on a tie), −1 for none. */
export function majority(m: Map<number, number>): number {
  let best = -1, most = 0;
  for (const [k, n] of m) if (n > most || (n === most && k < best)) { best = k; most = n; }
  return best;
}
