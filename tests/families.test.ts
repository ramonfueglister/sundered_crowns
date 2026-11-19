// People feature 2, second part (docs/PEOPLE_DESIGN.md): the persons marry and are born, after La Poutré & Paping
// 2025. The rules and their numbers, a world that runs them for years, and the state.
import { describe, it, expect } from 'vitest';
import { newWorldState } from '../tools/sim/load';
import {
  BRIDES,
  BRIDE_AGE,
  BIRTH_INTERVAL,
  FERTILE_TO,
  PREGNANCY,
  brideAge,
  fertility,
  housewives,
  yearsToBirth,
} from '../src/sim/people/marriage';
import { ageOn, MOTHER_AGE } from '../src/sim/systems/people';
import { deathsTo } from '../src/sim/systems/deaths';
import { birthsTo, weddingsOn } from '../src/sim/systems/families';
import { namedPersons } from '../src/sim/systems/rulers';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { ALIVE } from '../src/sim/state';

describe('the rules of La Poutré & Paping 2025', () => {
  it('the brides have the ages of the curve of Coale and McNeil: none before 16, most between 18 and 26', () => {
    let mean = 0,
      young = 0;
    for (let a = 0; a < BRIDES.share.length; a++) {
      mean += (a + 0.5) * BRIDES.share[a];
      if (a >= 18 && a <= 26) young += BRIDES.share[a];
    }
    expect(BRIDES.share[15]).toBe(0);
    expect(Math.abs(mean - BRIDE_AGE.mean)).toBeLessThan(1); // the curve of the program, cut to whole years from 16
    expect(young).toBeGreaterThan(0.6);
    expect(BRIDES.share[20]).toBeCloseTo(0.095, 2);
    expect(BRIDES.share[30]).toBeCloseTo(0.025, 2); // read off the program
    expect(brideAge(0)).toBeGreaterThanOrEqual(16);
    expect(brideAge(0.999999)).toBeLessThan(61);
    let last = 0;
    for (let k = 0; k < 1000; k++) {
      const a = brideAge(k / 1000);
      expect(a).toBeGreaterThanOrEqual(last);
      last = a;
    }
  });
  it('a wife is less fertile as she nears 45, as the program has it', () => {
    expect(fertility(14.9)).toBe(0);
    expect(fertility(FERTILE_TO)).toBe(0);
    expect(fertility(15)).toBeCloseTo(0.99, 3);
    expect(fertility(25)).toBeCloseTo(0.953, 3);
    expect(fertility(30)).toBeCloseTo(0.9, 3);
    expect(fertility(35)).toBeCloseTo(0.784, 3);
    expect(fertility(40)).toBeCloseTo(0.535, 3);
  });
  it('a wife of 20 bears every 33 months, never within nine; a wife of 44 mostly no more', () => {
    const N = 20000,
      waits = Array.from({ length: N }, (_, k) => yearsToBirth(20, (k + 0.5) / N));
    for (const t of waits) expect(t).toBeGreaterThanOrEqual(PREGNANCY);
    const first = waits.filter((t) => t < 8); // (the few who wait longer run into the falling fertility)
    expect(first.length / N).toBeGreaterThan(0.9);
    const median = waits[N / 2];
    expect(median).toBeGreaterThan(2);
    expect(median).toBeLessThan(BIRTH_INTERVAL);
    // the rate over the first years is the program's: 1 / 2.75 a year times the fertility of the age
    const within3 = waits.filter((t) => t < 3).length / N;
    expect(within3).toBeGreaterThan(0.6);
    expect(within3).toBeLessThan(0.75);
    expect(
      Array.from({ length: 1000 }, (_, k) => yearsToBirth(44, (k + 0.5) / 1000)).filter(Number.isFinite).length,
    ).toBeLessThan(150);
    expect(yearsToBirth(45, 0.5)).toBe(Infinity);
  });
  it('three women in ten of 40 keep no household in a population that does not grow (the paper: about 30 %)', () => {
    const h = housewives();
    expect(h[15]).toBe(0);
    expect(1 - h[40]).toBeGreaterThan(0.27);
    expect(1 - h[40]).toBeLessThan(0.34);
    for (let a = 17; a <= 45; a++) expect(h[a]).toBeGreaterThanOrEqual(h[a - 1]);
  });
});

describe('a world whose persons marry and are born', () => {
  const { s } = newWorldState();
  const P = s.person.cols,
    F = s.family.cols,
    named = namedPersons(s);
  const living = (id: number) => s.person.alive[id] === 1 && P.died[id] === ALIVE;
  const count = () => {
    let n = 0;
    for (let id = 0; id < s.person.size; id++) if (living(id) && !named.has(id)) n++;
    return n;
  };
  const seats = () => {
    let n = 0;
    for (let f = 0; f < s.family.size; f++) n += F.seat[f];
    return n;
  };
  const N0 = count(),
    seats0 = seats(),
    size0 = s.person.size;
  let deaths = 0,
    births = 0,
    weddings = 0;
  const YEARS = 40;
  for (let m = 1; m <= 12 * YEARS; m++) {
    const day = Math.round((m / 12) * 365.25);
    deaths += deathsTo(s, day);
    births += birthsTo(s, day);
    weddings += weddingsOn(s, day);
  }
  const day = Math.round(YEARS * 365.25);

  it('keeps its households: a wedding fills a vacant one or takes its seat', () => {
    expect(seats()).toBe(seats0);
    expect(weddings).toBeGreaterThan(seats0 / 2);
    let vacant = 0;
    for (let f = 0; f < s.family.size; f++) {
      if (F.man[f] >= 0) {
        expect(living(F.man[f])).toBe(true);
        expect(P.family[F.man[f]]).toBe(f);
        expect(P.sex[F.man[f]]).toBe(1);
      }
      if (F.woman[f] >= 0) {
        expect(living(F.woman[f])).toBe(true);
        expect(P.family[F.woman[f]]).toBe(f);
        expect(P.sex[F.woman[f]]).toBe(0);
        expect(F.seat[f]).toBe(1);
      } else if (F.seat[f]) vacant++;
    }
    expect(vacant / seats0).toBeLessThan(0.03); // a vacant household is filled within months where the town has a bride
  });
  it('neither grows nor shrinks: about as many are born as die', () => {
    expect(births).toBe(s.person.size - size0);
    expect(Math.abs(births - deaths) / deaths).toBeLessThan(0.1);
    expect(Math.abs(count() - N0) / N0).toBeLessThan(0.1);
  });
  it('a child is born to a wife of 15 to 45 and her husband, into their family and town, and gets its day of death', () => {
    for (let id = size0; id < s.person.size; id++) {
      const m = P.mother[id],
        fa = P.father[id];
      expect(P.sex[m]).toBe(0);
      expect(P.sex[fa]).toBe(1);
      const at = ageOn(P.born[m], P.born[id]);
      expect(at).toBeGreaterThanOrEqual(MOTHER_AGE[0]);
      expect(at).toBeLessThan(MOTHER_AGE[1] + 0.01);
      expect(P.born[id]).toBeGreaterThan(0);
      expect(P.dies[id]).toBeGreaterThan(P.born[id]);
      expect(P.dies[id]).toBeLessThan(ALIVE);
      expect(P.culture[id]).toBe(P.culture[m]);
      expect(P.faith[id]).toBe(P.faith[m]);
      expect(F.place[P.family[id]]).toBe(F.place[P.family[m]]);
      expect(P.died[fa] === ALIVE || P.died[fa] >= P.born[id]).toBe(true); // (a father may die on the day)
    }
  });
  it('the births of a woman lie at least nine months apart', () => {
    const last = new Map<number, number>();
    for (let id = size0; id < s.person.size; id++) {
      const m = P.mother[id],
        before = last.get(m);
      if (before !== undefined) expect(P.born[id] - before).toBeGreaterThanOrEqual(Math.round(PREGNANCY * 365.25) - 1);
      last.set(m, P.born[id]);
    }
  });
  it('about three women in ten of 40 keep no household, and one housewife in seven is a widow', () => {
    let w40 = 0,
      single = 0,
      wives = 0,
      widows = 0;
    for (let id = 0; id < s.person.size; id++) {
      if (!living(id) || named.has(id) || P.sex[id] !== 0) continue;
      const a = ageOn(P.born[id], day);
      if (a >= 38 && a < 48) {
        w40++;
        if (F.woman[P.family[id]] !== id) single++;
      }
    }
    for (let f = 0; f < s.family.size; f++)
      if (F.seat[f] && F.woman[f] >= 0) {
        wives++;
        if (F.man[f] < 0) widows++;
      }
    expect(single / w40).toBeGreaterThan(0.2);
    expect(single / w40).toBeLessThan(0.4);
    expect(widows / wives).toBeGreaterThan(0.08);
    expect(widows / wives).toBeLessThan(0.22);
  });
  it('a saved world goes on as the one that ran: the lists of events are built anew from the state', () => {
    const copy = decodeState(encodeState(s));
    for (let m = 1; m <= 24; m++) {
      const d = day + Math.round((m / 12) * 365.25);
      for (const x of [s, copy]) {
        deathsTo(x, d);
        birthsTo(x, d);
        weddingsOn(x, d);
      }
    }
    expect(hashState(copy)).toBe(hashState(s));
  });
});
