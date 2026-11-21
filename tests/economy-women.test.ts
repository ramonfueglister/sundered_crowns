// Economy feature 11 (docs/ECONOMY_DESIGN.md): a woman without a husband works, and the women who work stay at the
// table's share (src/sim/systems/work.ts).
import { namedPersons } from '../src/sim/systems/rulers';
import { describe, it, expect } from 'vitest';
import { newWorldState } from '../tools/sim/load';
import { rateOfOtherWomen, workforce } from '../src/sim/systems/work';
import { hash01 } from '../src/sim/rng';
import { encodeState, decodeState } from '../src/sim/snapshot';
import type { WorldState } from '../src/sim/state';
import { adult, members, withoutHusband, works } from './setup/households';

const { s, w } = newWorldState();
const start = decodeState(encodeState(s)); // the world on the day it is founded
const rate = w.cityEconomies.table.inputs.participation.value;
/** Per city the women of working age, those of them without a husband, and those who work. */
function women(x: WorldState): { all: number; alone: number; working: number }[] {
  const c = x.economy.cities!,
    at = new Map<number, number>(Array.from(c.places, (p, k) => [p, k])),
    m = members(x);
  const out = Array.from(c.places, () => ({ all: 0, alone: 0, working: 0 })),
    named = namedPersons(x);
  for (let id = 0; id < x.person.size; id++) {
    if (x.person.cols.sex[id] !== 0 || !adult(x, id) || named.has(id)) continue;
    const o = out[at.get(x.family.cols.place[x.person.cols.family[id]])!];
    o.all++;
    if (withoutHusband(x, m, id)) o.alone++;
    if (works(x, id)) o.working++;
  }
  return out;
}

describe('a woman without a husband', () => {
  for (const [name, x] of [
    ['1356', start],
    ['1291', newWorldState(1291, 1291).s],
  ] as const) {
    it(`works, in every city of the world of ${name}`, () => {
      const m = members(x),
        named = namedPersons(x);
      let alone = 0;
      for (let id = 0; id < x.person.size; id++) {
        if (named.has(id) || !adult(x, id) || !withoutHusband(x, m, id)) continue;
        alone++;
        expect(works(x, id)).toBe(true);
      }
      expect(alone).toBeGreaterThan(700); // the widows who keep a household and the women who live on their own
    });
    it(`leaves the share of the women who work at the table's 43 %, in every city of the world of ${name}`, () => {
      const by = women(x);
      let all = 0,
        working = 0;
      for (const c of by) {
        all += c.all;
        working += c.working;
        const p = rateOfOtherWomen(rate.women, c.all, c.alone);
        expect(p).toBeLessThanOrEqual(rate.women + 1e-12); // a town without such a woman: 0.43 up to rounding
        if (p === 0) {
          // more than 43 % of the women of the town have no husband (15 small towns of 1291, 17 to 67 women): they all
          // work, nobody else, and the town is above the table's share
          expect(c.alone).toBeGreaterThanOrEqual(rate.women * c.all);
          expect(c.working).toBe(c.alone);
          continue;
        }
        // the women without a husband, and of the others as many as are expected, within four standard deviations
        // (550 towns in 1291: at three, one or two would be outside by chance)
        expect(Math.abs(c.working - rate.women * c.all)).toBeLessThan(
          4 * Math.sqrt((c.all - c.alone) * p * (1 - p)) + 0.5,
        );
      }
      expect(Math.abs(working / all - rate.women)).toBeLessThan(0.01);
    });
    it(`leaves few families without a person who works in the world of ${name}`, () => {
      const m = members(x);
      let none = 0,
        families = 0,
        lone = 0;
      for (const ids of m) {
        if (!ids.length) continue;
        families++;
        if (ids.some((id) => works(x, id))) continue;
        none++;
        if (ids.length === 1 && x.person.cols.sex[ids[0]] === 0 && adult(x, ids[0])) lone++;
      }
      expect(families).toBeGreaterThan(4500);
      expect(none / families).toBeLessThan(0.015); // it was every ninth family; 1.06 % in the 558 towns of 1291
      expect(lone).toBe(0); // no woman on her own is among them
    });
  }
  it('leaves the men as they were drawn: 97.1 % of them, each by his own draw', () => {
    const at = new Set(start.economy.cities!.places);
    let men = 0;
    for (let id = 0; id < start.person.size; id++) {
      if (
        start.person.cols.sex[id] !== 1 ||
        !adult(start, id) ||
        !at.has(start.family.cols.place[start.person.cols.family[id]])
      )
        continue;
      men++;
      expect(works(start, id)).toBe(hash01(start.seed >>> 0, id, 30) < rate.men);
    }
    expect(men).toBeGreaterThan(7000);
  });
  it("sets the rate of the other women so that the table's share of all is expected to work", () => {
    expect(rateOfOtherWomen(0.43, 100, 10)).toBeCloseTo(33 / 90, 12);
    expect(10 + rateOfOtherWomen(0.43, 100, 10) * 90).toBeCloseTo(43, 12);
    expect(rateOfOtherWomen(0.43, 100, 0)).toBe(0.43);
    expect(rateOfOtherWomen(0.43, 100, 43)).toBe(0); // the women without a husband are the share already
    expect(rateOfOtherWomen(0.43, 100, 60)).toBe(0); // more of them than the share: nobody else is drawn
    expect(rateOfOtherWomen(0.43, 5, 5)).toBe(0);
  });
  it('is the same draw for the same seed', () => {
    const cities = Array.from(start.economy.cities!.places);
    expect(workforce(start, cities, rate)).toEqual(workforce(decodeState(encodeState(start)), cities, rate));
    expect(Array.from(newWorldState().s.person.cols.role)).toEqual(Array.from(start.person.cols.role));
  });
});
