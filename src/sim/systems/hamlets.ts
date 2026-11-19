// Who lives where: the families who live from agriculture live in hamlets outside the walls of their town, and a
// place has the people who live there, its persons (step 3 of the world of towns, Ramon, 16 November 2026: only the
// persons of the simulation are in the world; the farmers of a town live in hamlets outside its walls, and the
// harvest and the arable come from them).
//
// A family lives from agriculture when one of its members works for a firm of agriculture or owns one (the firms and
// their sectors are those of the economy of the town, src/sim/systems/economy.ts). It stays in its place: the hamlets
// lie in the place of their town, outside the walls. Where in the place a hamlet lies is for the world graphic.
//
// The people of a place (place.pop) are its living persons, counted; the people who live from agriculture (L of the
// harvest, src/sim/systems/harvest.ts) are the living persons of its hamlets. Both are counted once a year, before the
// arable and the harvest.
import type { WorldState } from '../state';
import { ALIVE } from '../state';
import { ROLE } from './work';
import { presentPersons } from '../people/living';

/** The sector of agriculture: its number in the calibration table of the economies (data/economy/england_1356.json). */
export const AGRICULTURE = 0;

/** Settles every family: in a hamlet when a member works for a firm of agriculture or owns one, else in the town.
 *  Done when the persons and the economies are founded; the families stay where they were settled. */
export function settleHamlets(s: WorldState): void {
  const P = s.person.cols, hamlet = s.family.cols.hamlet, sector = s.firm.cols.sector;
  hamlet.fill(0);
  for (const i of presentPersons(s)) {
    if (P.died[i] !== ALIVE) continue;
    if (P.role[i] !== ROLE.worker && P.role[i] !== ROLE.owner) continue;
    const f = P.firm[i];
    if (f >= 0 && sector[f] === AGRICULTURE) hamlet[P.family[i]] = 1;
  }
}

/** The living persons of every place and those of them who live in hamlets (the people who live from agriculture). */
export function residents(s: WorldState): { people: Float64Array; farmers: Float64Array } {
  const L = s.place.pop.length, people = new Float64Array(L), farmers = new Float64Array(L);
  const P = s.person.cols, F = s.family.cols;
  for (const i of presentPersons(s)) {
    if (P.died[i] !== ALIVE) continue;
    const f = P.family[i], p = F.place[f];
    if (p < 0 || p >= L) continue;
    people[p]++;
    if (F.hamlet[f]) farmers[p]++;
  }
  return { people, farmers };
}

/** The living persons of the hamlets of one place. */
export function farmersOf(s: WorldState, place: number): number {
  const P = s.person.cols, F = s.family.cols;
  let n = 0;
  for (const i of presentPersons(s)) {
    if (P.died[i] !== ALIVE) continue;
    const f = P.family[i];
    if (F.place[f] === place && F.hamlet[f]) n++;
  }
  return n;
}

/** Sets the people of every place to its living persons. */
export function countPeople(s: WorldState): void {
  s.place.pop.set(residents(s).people);
}
