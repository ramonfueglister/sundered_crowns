// The persons and families of the economy's tests of the households (economy feature 11, docs/ECONOMY_DESIGN.md):
// who works, who belongs to a family, and who is a woman without a husband.
import { expect } from 'vitest';
import { ALIVE, type WorldState } from '../../src/sim/state';
import { namedPersons } from '../../src/sim/systems/rulers';
import { ROLE, WORKING_AGE } from '../../src/sim/systems/work';
import { ageOn } from '../../src/sim/systems/people';

/** Whether a person works: as a worker, as the owner of a firm, or as a banker (src/sim/systems/work.ts). */
export const works = (x: WorldState, id: number) => {
  const r = x.person.cols.role[id];
  return r === ROLE.worker || r === ROLE.owner || r === ROLE.banker;
};
/** Whether a person is of working age. */
export const adult = (x: WorldState, id: number) => ageOn(x.person.cols.born[id], x.day) >= WORKING_AGE;
/** Equal to the six digits a stored amount has (the components are 32-bit numbers). */
export const near = (a: number, b: number) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(1e-6 * Math.max(Math.abs(a), Math.abs(b)));
/** The persons of each family of the cities (the rulers, src/sim/systems/rulers.ts, have no part in the economy). */
export function members(x: WorldState): number[][] {
  const out: number[][] = Array.from({ length: x.family.size }, () => []),
    named = namedPersons(x);
  for (let id = 0; id < x.person.size; id++)
    if (x.person.alive[id] && x.person.cols.died[id] === ALIVE && !named.has(id))
      out[x.person.cols.family[id]].push(id); // the living: the dead are no members (src/sim/systems/deaths.ts)
  return out;
}
/** A woman without a husband: at the head of a family without a man at its head, or on her own. */
export function withoutHusband(x: WorldState, m: number[][], id: number): boolean {
  const f = x.person.cols.family[id];
  return (
    x.person.cols.sex[id] === 0 && x.family.cols.man[f] < 0 && (x.family.cols.woman[f] === id || m[f].length === 1)
  );
}
