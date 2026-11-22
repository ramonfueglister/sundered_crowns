// Where a crown goes when the world has gone another way than history (src/sim/systems/succession.ts) and who is heir
// by the order of the realm (src/sim/systems/heirs.ts): a king of the fixture dies in 1295 instead of 1320, before
// the son history crowns is born.
import { describe, it, expect } from 'vitest';
import { loadWorldFor, loadSetup } from '../tools/sim/load';
import { createWorldState } from '../src/sim/setup';
import { compileChronicle, dayOf, type ChronicleJson, type SuccessionOrder } from '../src/sim/content/chronicle';
import { playChronicle } from '../src/sim/systems/rulers';
import { heirOf } from '../src/sim/systems/heirs';
import { divergence } from '../src/sim/divergence';
import { ALIVE, type WorldState } from '../src/sim/state';
import type { World } from '../src/sim/world';

const setup = loadSetup(1291);
const day = (date: string) => dayOf(date, 1291)!;
function until(s: WorldState, w: World, date: string): void {
  for (let d = s.day + 1; d <= day(date); d++) {
    playChronicle(s, w, d, d);
    s.day = d;
  }
}

/** G (dead before 1291) is the father of King A and of U; A is the father of K (never reigns) and of B, whom history
 *  crowns in 1320; C, of another house, reigns from 1350; D is K's son. */
function fixture(order: SuccessionOrder | null): ChronicleJson {
  return {
    year: 1291,
    until: '1848-12-31',
    persons: [
      { key: 'QA', name: 'King A', house: '', qid: 'QA', sex: 1, born: '1260-01-01', died: '1320-01-01', father: 'QG' },
      {
        key: 'QB',
        name: 'Prince B',
        house: '',
        qid: 'QB',
        sex: 1,
        born: '1300-06-01',
        died: '1350-01-01',
        father: 'QA',
      },
      { key: 'QC', name: 'King C', house: '', qid: 'QC', sex: 1, born: '1270-01-01', died: '1380-01-01' },
      { key: 'QG', name: 'Grandfather G', house: '', qid: 'QG', sex: 1, born: '1230-01-01', died: '1280-01-01' },
      {
        key: 'QU',
        name: 'Uncle U',
        house: '',
        qid: 'QU',
        sex: 1,
        born: '1265-01-01',
        died: '1330-01-01',
        father: 'QG',
      },
      { key: 'QK', name: 'Kin K', house: '', qid: 'QK', sex: 1, born: '1292-03-01', died: '1360-01-01', father: 'QA' },
      {
        key: 'QS',
        name: 'Sister S',
        house: '',
        qid: 'QS',
        sex: 0,
        born: '1290-01-01',
        died: '1370-01-01',
        father: 'QA',
      },
      { key: 'QD', name: 'Kin D', house: '', qid: 'QD', sex: 1, born: '1320-01-01', died: '1390-01-01', father: 'QK' },
    ],
    reigns: [
      { realm: 'england', person: 0, start: '1291-01-01', end: '1320-01-01', source: 'fixture' },
      { realm: 'england', person: 1, start: '1320-01-01', end: '1350-01-01', source: 'fixture' },
      { realm: 'england', person: 2, start: '1350-01-01', end: '1380-01-01', source: 'fixture' },
    ],
    ...(order ? { laws: { england: [{ from: null, order, source: 'fixture' }] } } : {}),
  };
}
const w = loadWorldFor(1291);
const realm = (s: WorldState) => s.realmText.findIndex((t) => t.key === 'england');
const row = (s: WorldState, key: string) => s.named.find((n) => n.key === key)?.person;
const holder = (s: WorldState) => {
  const h = s.realm.cols.holder[realm(s)];
  return h < 0 ? null : s.named.find((n) => n.person === h)!.key;
};
/** A world of the fixture whose King A dies on 1 January 1295. */
function early(order: SuccessionOrder | null): WorldState {
  w.chronicle = compileChronicle(fixture(order));
  w.rulerDeaths = 'chronicle';
  const s = createWorldState(w, setup, 1291);
  s.person.cols.dies[row(s, 'QA')!] = day('1295-01-01');
  return s;
}

describe('the heir by the order of the realm', () => {
  const c = compileChronicle(fixture(null));
  const n = (key: string) => c.persons.findIndex((p) => p.key === key);
  const all = () => true;
  it('is the eldest son by primogeniture, the line of a son before his younger brothers, the males first', () => {
    expect(c.persons[heirOf(c, n('QA'), 'primogeniture', all)!].key).toBe('QK');
    expect(c.persons[heirOf(c, n('QA'), 'primogeniture', (p) => p !== n('QK'))!].key).toBe('QD');
    const noMen = (p: number) => c.persons[p].sex === 0;
    expect(c.persons[heirOf(c, n('QA'), 'primogeniture', noMen)!].key).toBe('QS');
  });
  it('is the eldest male of the male line by agnatic seniority: the brother before the son', () => {
    expect(c.persons[heirOf(c, n('QA'), 'agnatic_seniority', all)!].key).toBe('QU');
    expect(c.persons[heirOf(c, n('QA'), 'agnatic_seniority', (p) => p !== n('QU'))!].key).toBe('QK');
  });
  it('is nobody in an election', () => {
    expect(heirOf(c, n('QA'), 'election', all)).toBeNull();
  });
});

describe('a crown history gives to a person not born into the world', () => {
  it('goes to the heir by primogeniture, who comes into the world for it and keeps it against history', () => {
    const s = early('primogeniture');
    until(s, w, '1295-01-02');
    expect(holder(s)).toBe('QK');
    expect(s.person.cols.born[row(s, 'QK')!]).toBe(day('1292-03-01'));
    until(s, w, '1351-01-01'); // B is not born; C's accession of history finds the crown with K and is left out
    expect(row(s, 'QB')).toBeUndefined();
    expect(holder(s)).toBe('QK');
    expect(divergence(s, w, setup).realms).toBe(1);
  }, 60_000);
  it('goes back to history when the heir dies and history has its holder of the day alive', () => {
    const s = early('primogeniture');
    until(s, w, '1360-01-02');
    expect(s.person.cols.died[row(s, 'QK')!]).toBe(day('1360-01-01'));
    expect(holder(s)).toBe('QC');
    expect(divergence(s, w, setup).realms).toBe(0);
  }, 60_000);
  it('goes to the eldest of the male line by agnatic seniority', () => {
    const s = early('agnatic_seniority');
    until(s, w, '1295-01-02');
    expect(holder(s)).toBe('QU');
  }, 60_000);
  it('goes to the next holder of history the world has alive, earlier, where the order is an election or unknown', () => {
    for (const order of ['election', null] as const) {
      const s = early(order);
      until(s, w, '1295-01-02');
      expect(holder(s)).toBe('QC');
      expect(row(s, 'QK')).toBeUndefined();
    }
  }, 60_000);
});

describe('a free world', () => {
  it('lets the persons of history die on days of their own, the same days for the same seed', () => {
    w.chronicle = compileChronicle(fixture('primogeniture'));
    w.rulerDeaths = 'drawn';
    const run = () => {
      const s = createWorldState(w, setup, 1291);
      until(s, w, '1400-01-01');
      return s.named.map((n) => [n.key, s.person.cols.died[n.person]]);
    };
    const a = run(),
      b = run();
    w.rulerDeaths = 'chronicle';
    expect(a).toEqual(b);
    const died = Object.fromEntries(a);
    expect(died.QA).not.toBe(ALIVE);
    expect(died.QA).not.toBe(day('1320-01-01'));
  }, 120_000);
});
