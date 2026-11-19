// People feature 3 (docs/PEOPLE_DESIGN.md): a household passes to an heir by the custom of the culture
// (src/sim/people/inheritance.ts), and nobody marries a brother or a sister.
import { describe, it, expect } from 'vitest';
import { newWorldState } from '../tools/sim/load';
import { CUSTOM, CUSTOMS, MUSLIM_CUSTOM, customOf, heirOf, type Child } from '../src/sim/people/inheritance';
import { ALL_CULTURES, FAITHS } from '../src/sim/content/peoples';
import { ageOn } from '../src/sim/systems/people';
import { deathsTo } from '../src/sim/systems/deaths';
import { birthsTo, weddingsOn, type Passed } from '../src/sim/systems/families';
import { GROOM_AGE_MIN } from '../src/sim/people/marriage';
import { ALIVE } from '../src/sim/state';

const culture = (c: string) => ALL_CULTURES.indexOf(c),
  faith = (f: string) => FAITHS.findIndex((x) => x.id === f);

describe('the customs of inheritance', () => {
  it('every line names cultures of the game, a grade and what was read for it; no culture has two customs', () => {
    const seen = new Set<string>();
    for (const r of CUSTOMS) {
      expect(r.source.length).toBeGreaterThan(40);
      expect([1, 2]).toContain(r.grade);
      expect(r.custom).not.toBe(CUSTOM.none);
      for (const c of r.cultures) {
        expect(culture(c)).toBeGreaterThanOrEqual(0);
        expect(seen.has(c)).toBe(false);
        seen.add(c);
      }
    }
  });
  it('a culture follows its custom, a Muslim the law of the faith, and a culture nothing was read for has none', () => {
    expect(customOf(culture('english'), faith('latin'))).toBe(CUSTOM.eldestSon);
    expect(customOf(culture('russian'), faith('orthodox'))).toBe(CUSTOM.youngestSon);
    expect(customOf(culture('lombard'), faith('latin'))).toBe(CUSTOM.sons);
    expect(customOf(culture('french'), faith('latin'))).toBe(CUSTOM.children);
    expect(customOf(culture('danish'), faith('latin'))).toBe(CUSTOM.sonsDouble);
    expect(MUSLIM_CUSTOM).toBe(CUSTOM.sonsDouble);
    for (const c of ['persian', 'maghrebi', 'andalusi', 'english'])
      for (const f of ['sunni', 'shia', 'ibadi']) expect(customOf(culture(c), faith(f))).toBe(CUSTOM.sonsDouble);
    for (const c of [
      'flemish',
      'hollandic',
      'greek',
      'portuguese',
      'neapolitan',
      'hungarian',
      'polish',
      'nubian',
      'lithuanian',
      'unknown',
    ])
      expect(customOf(culture(c), faith('latin'))).toBe(CUSTOM.none);
    expect(customOf(culture('persian'), faith('tengri'))).toBe(CUSTOM.none);
  });
});

describe('the heir of a house', () => {
  // the eldest first: son 1, daughter 2, son 3, daughter 4
  const kids = (free: boolean[]): Child[] => [
    { id: 1, son: true, free: free[0] },
    { id: 2, son: false, free: free[1] },
    { id: 3, son: true, free: free[2] },
    { id: 4, son: false, free: free[3] },
  ];
  const all = kids([true, true, true, true]),
    daughters: Child[] = [
      { id: 2, son: false, free: true },
      { id: 4, son: false, free: true },
    ];
  it('is the eldest son; the next son where he is not free; the eldest daughter only where no son lives', () => {
    expect(heirOf(CUSTOM.eldestSon, all, 0.5)).toBe(1);
    expect(heirOf(CUSTOM.eldestSon, kids([false, true, true, true]), 0.5)).toBe(3);
    expect(heirOf(CUSTOM.eldestSon, kids([false, true, false, true]), 0.5)).toBe(-1); // sons live: no daughter inherits
    expect(heirOf(CUSTOM.eldestSon, daughters, 0.5)).toBe(2);
  });
  it('is the youngest son where the house stays with him, and nobody of the house where no son lives', () => {
    expect(heirOf(CUSTOM.youngestSon, all, 0.5)).toBe(3);
    expect(heirOf(CUSTOM.youngestSon, kids([true, true, false, true]), 0.5)).toBe(1);
    expect(heirOf(CUSTOM.youngestSon, daughters, 0.5)).toBe(-1);
  });
  it('is one of the sons by lot where the sons share, and a daughter only where no son lives', () => {
    expect(heirOf(CUSTOM.sons, all, 0)).toBe(1);
    expect(heirOf(CUSTOM.sons, all, 0.49)).toBe(1);
    expect(heirOf(CUSTOM.sons, all, 0.5)).toBe(3);
    expect(heirOf(CUSTOM.sons, all, 0.999)).toBe(3);
    expect(heirOf(CUSTOM.sons, kids([false, true, false, true]), 0.5)).toBe(-1);
    expect(heirOf(CUSTOM.sons, daughters, 0.6)).toBe(4);
  });
  it('is one of the children by lot where all share, a son with twice the chance where his share is double', () => {
    expect([0.1, 0.3, 0.6, 0.9].map((u) => heirOf(CUSTOM.children, all, u))).toEqual([1, 2, 3, 4]);
    // weights 2, 1, 2, 1 of 6
    expect([0.3, 0.4, 0.6, 0.9].map((u) => heirOf(CUSTOM.sonsDouble, all, u))).toEqual([1, 2, 3, 4]);
    let sons = 0;
    const N = 6000;
    for (let k = 0; k < N; k++) if (heirOf(CUSTOM.sonsDouble, all, (k + 0.5) / N) % 2 === 1) sons++;
    expect(sons / N).toBeCloseTo(2 / 3, 2);
    expect(heirOf(CUSTOM.children, kids([false, false, false, false]), 0.5)).toBe(-1);
    expect(heirOf(CUSTOM.none, all, 0.5)).toBe(-1);
  });
});

describe('a world whose households pass on', () => {
  const { s } = newWorldState(1291, 1291),
    P = s.person.cols,
    F = s.family.cols;
  const YEARS = 30,
    tally: Passed = { passed: 0, sons: 0, daughters: 0 };
  let siblings = 0,
    heirs = 0,
    noCustomHeirs = 0;
  const sonsFirst = { sons: 0, daughters: 0 }; // where the eldest son, the youngest son or the sons inherit
  for (let y = 1; y <= YEARS; y++)
    for (let mo = 1; mo <= 12; mo++) {
      const day = Math.round((y - 1 + mo / 12) * 365.25);
      deathsTo(s, day);
      birthsTo(s, day);
      // the vacant households before the weddings, with the house the family lives in
      const vacant = new Map<number, number>(); // lot of the house (with the hamlet) -> family
      for (let f = 0; f < s.family.size; f++)
        if (F.seat[f] && F.woman[f] < 0) vacant.set(F.lot[f] * 4096 + F.hamlet[f], f);
      const before = s.family.size,
        age = (id: number) => ageOn(P.born[id], day);
      weddingsOn(s, day, tally);
      for (let nf = before; nf < s.family.size; nf++) {
        const man = F.man[nf],
          woman = F.woman[nf],
          f = vacant.get(F.lot[nf] * 4096 + F.hamlet[nf])!;
        if (
          (P.mother[man] >= 0 && P.mother[man] === P.mother[woman]) ||
          (P.father[man] >= 0 && P.father[man] === P.father[woman])
        )
          siblings++;
        const ofHouse = (id: number) =>
          (P.mother[id] >= 0 && P.family[P.mother[id]] === f) || (P.father[id] >= 0 && P.family[P.father[id]] === f);
        const heir = ofHouse(man) ? man : ofHouse(woman) ? woman : -1;
        if (heir < 0) continue;
        const of = P.father[heir] >= 0 ? P.father[heir] : P.mother[heir],
          custom = customOf(P.culture[of], P.faith[of]);
        if (custom === CUSTOM.none) {
          noCustomHeirs++;
          continue;
        } // by the chance of the town's weddings
        heirs++;
        if (heir === man) expect(age(man)).toBeGreaterThanOrEqual(GROOM_AGE_MIN);
        if (custom === CUSTOM.eldestSon || custom === CUSTOM.youngestSon || custom === CUSTOM.sons) {
          if (heir === man) sonsFirst.sons++;
          else sonsFirst.daughters++;
        }
      }
    }
  it('to an heir of the house in more than a third of the cases, sons before daughters', () => {
    expect(tally.passed).toBeGreaterThan(15000);
    expect((tally.sons + tally.daughters) / tally.passed).toBeGreaterThan(0.33);
    expect(tally.sons).toBeGreaterThan(1.5 * tally.daughters);
    expect(tally.daughters).toBeGreaterThan(500);
    expect(heirs).toBeGreaterThanOrEqual(tally.sons + tally.daughters);
    // a daughter only where no son lives (and now and then by the chance of the town's weddings)
    expect(sonsFirst.sons).toBeGreaterThan(4 * sonsFirst.daughters);
  });
  it('by chance only where the culture has no custom', () => {
    expect(noCustomHeirs).toBeLessThan(0.05 * tally.passed);
  });
  it('nobody marries a brother or a sister', () => {
    expect(siblings).toBe(0);
  });
  it('the households stay the households of the founding, and the people neither grow nor shrink', () => {
    let seats = 0,
      living = 0;
    for (let f = 0; f < s.family.size; f++) if (F.seat[f]) seats++;
    for (let id = 0; id < s.person.size; id++) if (P.died[id] === ALIVE && P.dies[id] !== ALIVE) living++;
    expect(seats).toBe(17702);
    expect(living).toBeGreaterThan(95000);
    expect(living).toBeLessThan(104000);
  });
}, 120_000);
