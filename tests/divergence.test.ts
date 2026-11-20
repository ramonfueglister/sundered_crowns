// How far a world has gone from history (src/sim/divergence.ts), and what history does where the world went another
// way (src/sim/systems/rulers.ts): a world that nothing has touched plays the chronicles of 1291 to 1848 without one
// difference; in a world where a king died early, his son and grandson are not born and the crown finds nobody.
import { describe, it, expect } from 'vitest';
import { loadChronicle, loadWorldFor, loadSetup } from '../tools/sim/load';
import { createWorldState } from '../src/sim/setup';
import { compileChronicle, dayOf, type ChronicleJson } from '../src/sim/content/chronicle';
import { playChronicle } from '../src/sim/systems/rulers';
import { playBorders } from '../src/sim/systems/borders';
import { divergence } from '../src/sim/divergence';
import { ALIVE, type WorldState } from '../src/sim/state';
import type { World } from '../src/sim/world';

const setup = loadSetup(1291);
const day = (date: string) => dayOf(date, 1291)!;
/** Plays the borders and the rulers day by day up to `date`, as the daily systems do. */
function until(s: WorldState, w: World, date: string, look?: (s: WorldState) => void): void {
  for (let d = s.day + 1; d <= day(date); d++) {
    playBorders(s, w, d, d);
    playChronicle(s, w, d, d);
    s.day = d;
    look?.(s);
  }
}

describe('a world of 1291 that nothing touches', () => {
  it('is history on every day from 1291 to 1848: the holder of every place and crown, who lives and who is born', () => {
    const w = loadWorldFor(1291);
    w.chronicle = loadChronicle(1291); // the tests below put their own in the same world
    const s = createWorldState(w, setup, 1291);
    const worst = { places: 0, realms: 0, persons: 0, unborn: 0, days: 0 };
    until(s, w, '1848-12-31', (t) => {
      if (t.day % 91) return;
      const x = divergence(t, w, setup);
      worst.places = Math.max(worst.places, x.places);
      worst.realms = Math.max(worst.realms, x.realms);
      worst.persons = Math.max(worst.persons, x.persons);
      worst.unborn = Math.max(worst.unborn, x.unborn);
      worst.days++;
    });
    expect(worst).toEqual({ places: 0, realms: 0, persons: 0, unborn: 0, days: Math.floor(day('1848-12-31') / 91) });
    expect(s.named.length).toBeGreaterThan(3000);
  }, 180_000);
});

// a chronicle of one line of English kings, and a duke of France whose death no source gives
const fixture: ChronicleJson = {
  year: 1291,
  until: '1848-12-31',
  persons: [
    { key: 'QA', name: 'King A', house: '', qid: 'QA', sex: 1, born: '1260-01-01', died: '1320-01-01' },
    { key: 'QB', name: 'Prince B', house: '', qid: 'QB', sex: 1, born: '1300-06-01', died: '1350-01-01', father: 'QA' },
    {
      key: 'QC',
      name: 'Grandson C',
      house: '',
      qid: 'QC',
      sex: 1,
      born: '1330-01-01',
      died: '1380-01-01',
      father: 'QB',
    },
    { key: 'QD', name: 'Duke D', house: '', qid: 'QD', sex: 1, born: '1250-01-01', died: null },
    { key: 'QE', name: 'Queen E', house: '', qid: 'QE', sex: 0, born: '1296-10-01', died: '1340-01-01' },
    { key: 'QF', name: 'Count F', house: '', qid: 'QF', sex: 1, born: '1270-01-01', died: '1330-01-01' },
  ],
  reigns: [
    { realm: 'england', person: 0, start: '1291-01-01', end: '1320-01-01', source: 'fixture' },
    { realm: 'england', person: 1, start: '1320-01-01', end: '1350-01-01', source: 'fixture' },
    { realm: 'england', person: 2, start: '1350-01-01', end: '1380-01-01', source: 'fixture' },
    { realm: 'france', person: 3, start: '1291-01-01', end: '1296-01-01', source: 'fixture' },
    // a year without a day is its middle, which lies before the queen's birth: she takes the crown on entering
    { realm: 'france', person: 4, start: '1296', end: '1340-01-01', source: 'fixture' },
    // begins and ends in one year: no day to reign
    { realm: 'castile', person: 5, start: '1300', end: '1300', source: 'fixture' },
  ],
};
const w = loadWorldFor(1291),
  chronicle = compileChronicle(fixture);
const fresh = () => {
  w.chronicle = chronicle;
  return createWorldState(w, setup, 1291);
};
const realm = (s: WorldState, key: string) => s.realmText.findIndex((t) => t.key === key);
const row = (s: WorldState, key: string) => s.named.find((n) => n.key === key)?.person;
const holder = (s: WorldState, key: string) => {
  const h = s.realm.cols.holder[realm(s, key)];
  return h < 0 ? null : s.named.find((n) => n.person === h)!.key;
};

describe('the rulers of a chronicle where nothing goes another way', () => {
  it('are born, take the crown and die on the days of the sources, and the world is history', () => {
    const s = fresh();
    until(s, w, '1381-01-01', (t) => {
      if (t.day % 30) return;
      const x = divergence(t, w, setup);
      expect([x.places, x.realms, x.persons, x.unborn]).toEqual([0, 0, 0, 0]);
    });
    expect(s.person.cols.died[row(s, 'QA')!]).toBe(day('1320-01-01'));
    expect(s.person.cols.born[row(s, 'QC')!]).toBe(day('1330-01-01'));
  }, 120_000);
  it('give a crown dated before the birth to the person on entering, and none for a reign without a day', () => {
    const t = fresh();
    until(t, w, '1296-09-30');
    expect(holder(t, 'france')).toBeNull();
    until(t, w, '1296-10-01');
    expect(holder(t, 'france')).toBe('QE');
    until(t, w, '1301-01-01');
    expect(holder(t, 'castile')).toBeNull();
  }, 60_000);
  it('let a person whose death no source gives live on after the last reign, until the day the life table draws', () => {
    const t = fresh(),
      d = row(t, 'QD')!,
      P = t.person.cols;
    until(t, w, '1296-01-01');
    expect(P.died[d]).toBe(ALIVE);
    expect(P.dies[d]).toBeGreaterThan(day('1296-01-01'));
    const drawn = P.dies[d];
    until(t, w, '1371-01-01'); // nobody lives past 120 (src/sim/systems/deaths.ts)
    expect(P.died[d]).toBe(drawn);
    expect(divergence(t, w, setup).persons).toBe(0); // history knows no day of death to differ from
  }, 60_000);
});

describe('the rulers of a chronicle where a king died early', () => {
  it('leave his son and grandson unborn, the crown with nobody, and count where the world differs', () => {
    const s = fresh(),
      a = row(s, 'QA')!;
    until(s, w, '1295-01-01');
    // what a death on this day would do: the person dies, the crown is left
    s.person.cols.died[a] = s.day;
    s.realm.cols.holder[realm(s, 'england')] = -1;
    until(s, w, '1310-01-01');
    expect(row(s, 'QB')).toBeUndefined();
    let x = divergence(s, w, setup);
    expect(x).toMatchObject({ persons: 1, unborn: 1, realms: 1 });
    expect(x.examples).toMatchObject({ persons: ['QA'], unborn: ['QB'], realms: ['england'] });
    until(s, w, '1331-01-01');
    expect(row(s, 'QC')).toBeUndefined();
    expect(holder(s, 'england')).toBeNull();
    x = divergence(s, w, setup);
    expect(x).toMatchObject({ persons: 0, unborn: 2, realms: 1 }); // A is dead in history too by now
  }, 60_000);
});
