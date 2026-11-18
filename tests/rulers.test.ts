// The rulers (src/sim/systems/rulers.ts): a chronicle of a few realms, played day by day on a world of 1291. The
// chronicle here is a fixture for the rules; the real one is public/data/rulers_1291.json.
import { describe, it, expect } from 'vitest';
import { loadWorld, loadSetup } from '../tools/sim/load';
import { createWorldState } from '../src/sim/setup';
import { compileChronicle, dayOf, type ChronicleJson } from '../src/sim/content/chronicle';
import { playChronicle, foundRulers } from '../src/sim/systems/rulers';
import { ALIVE, BORN_UNKNOWN, STATE_VERSION, type WorldState } from '../src/sim/state';
import { upgradeState } from '../src/sim/upgrade';
import { hashState, encodeState, decodeState } from '../src/sim/snapshot';
import { personsIn } from '../src/sim/systems/people';
import { workforce } from '../src/sim/systems/work';
import { personHistory } from '../src/net/people';

const fixture: ChronicleJson = {
  year: 1291, until: '1848-12-31',
  persons: [
    { key: 'Q1', name: 'Edward I', house: 'Plantagenet', qid: 'Q1', sex: 1, born: '1239-06-17', died: '1307-07-07' },
    { key: 'Q2', name: 'Edward II', house: 'Plantagenet', qid: 'Q2', sex: 1, born: '1284-04-25', died: '1327-09-21' },
    { key: 'Q3', name: 'Philip IV', house: 'Capet', qid: 'Q3', sex: 1, born: '1268', died: '1314-11-29' },
    { key: 'X|bohemia#1', name: 'A ruler without a known birth', house: '', qid: '', sex: 0, born: null, died: null },
    { key: 'Q5', name: 'Died before the start', house: '', qid: 'Q5', sex: 1, born: '1200', died: '1250' },
  ],
  reigns: [
    { realm: 'england', person: 0, start: '1272-11-20', end: '1307-07-07', source: 'fixture' },
    { realm: 'england', person: 1, start: '1307-07-07', end: '1327-01-20', source: 'fixture' },
    { realm: 'france', person: 2, start: '1285-10-05', end: '1314-11-29', source: 'fixture' },
    { realm: 'brittany', person: 2, start: '1300-03', end: '1310', source: 'fixture' },
    { realm: 'bohemia', person: 3, start: '1291-01-01', end: '1320', source: 'fixture' },
    { realm: 'bohemia', person: 4, start: '1230', end: '1250', source: 'fixture' },
    { realm: 'atlantis', person: 4, start: '1230', end: '1250', source: 'fixture' },
  ],
};

const w = loadWorld();
w.chronicle = compileChronicle(fixture);
const fresh = () => createWorldState(w, loadSetup(1291), 1291);
const realm = (s: WorldState, key: string) => s.realmText.findIndex((t) => t.key === key);
const holderName = (s: WorldState, key: string) => {
  const h = s.realm.cols.holder[realm(s, key)];
  return h < 0 ? null : s.named.find((n) => n.person === h)!.name;
};
/** Plays the chronicle up to a date, as the daily system would. */
const until = (s: WorldState, date: string) => { const d = dayOf(date, 1291)!; playChronicle(s, w, s.day + 1, d); s.day = d; };

describe('the chronicle of rulers', () => {
  it('reads the dates of the sources: a date without a day is the middle of its month or year', () => {
    expect(dayOf('1291-01-01', 1291)).toBe(0);
    expect(dayOf('1291', 1291)).toBe(181);
    expect(dayOf('1291-02', 1291)).toBe(31 + 14);
    expect(dayOf(null, 1291)).toBeNull();
  });
});

describe('the rulers of a world of 1291', () => {
  const s = fresh();
  it('gives every realm of the chronicle its holder of 1 January 1291 and nobody to the others', () => {
    expect(s.v).toBe(STATE_VERSION);
    expect(holderName(s, 'england')).toBe('Edward I');
    expect(holderName(s, 'france')).toBe('Philip IV');
    expect(holderName(s, 'bohemia')).toBe('A ruler without a known birth');
    expect(holderName(s, 'brittany')).toBeNull();
    expect(s.realm.cols.holder[realm(s, 'castile')]).toBe(-1);
  });
  it('brings into the world who lives on the first day, and nobody who died before it', () => {
    expect(s.named.map((n) => n.name).sort()).toEqual(['A ruler without a known birth', 'Edward I', 'Edward II', 'Philip IV']);
    const P = s.person.cols, e1 = s.named.find((n) => n.name === 'Edward I')!.person;
    expect(P.born[e1]).toBe(dayOf('1239-06-17', 1291));
    expect(P.died[e1]).toBe(ALIVE);
    expect(P.born[s.named.find((n) => n.key === 'X|bohemia#1')!.person]).toBe(BORN_UNKNOWN);
    expect(P.sex[s.named.find((n) => n.key === 'X|bohemia#1')!.person]).toBe(0);
  });
  it('lets a ruler live in the capital of the realm, outside the economy', () => {
    const e1 = s.named.find((n) => n.name === 'Edward I')!.person, london = s.realm.cols.capital[realm(s, 'england')];
    expect(s.family.cols.place[s.person.cols.family[e1]]).toBe(london);
    expect(personsIn(s, london)).toContain(e1);
    expect(s.person.cols.role[e1]).toBe(0);
    const places = s.economy.cities ? Array.from(s.economy.cities.places) : [london];
    const working = workforce(s, places, { men: 1, women: 1 }).flatMap((f) => f.working);
    for (const n of s.named) expect(working).not.toContain(n.person);
  });
  it('passes a crown on the real day, ends a reign without a death, and lets the dead leave the places', () => {
    until(s, '1307-07-06');
    expect(holderName(s, 'england')).toBe('Edward I');
    until(s, '1307-07-07');
    expect(holderName(s, 'england')).toBe('Edward II');
    const e1 = s.named.find((n) => n.name === 'Edward I')!.person;
    expect(s.person.cols.died[e1]).toBe(dayOf('1307-07-07', 1291));
    expect(personsIn(s, s.realm.cols.capital[realm(s, 'england')])).not.toContain(e1);
    until(s, '1327-01-21');
    expect(holderName(s, 'england')).toBeNull(); // deposed; the fixture names no successor
    const e2 = s.named.find((n) => n.name === 'Edward II')!.person;
    expect(s.person.cols.died[e2]).toBe(ALIVE);
    until(s, '1327-09-21');
    expect(s.person.cols.died[e2]).toBe(dayOf('1327-09-21', 1291));
  });
  it('lets one person hold several crowns, as the real holder of a title', () => {
    const t = fresh();
    until(t, '1305-01-01');
    const p = s.named.find((n) => n.name === 'Philip IV')!.key, id = t.named.find((n) => n.key === p)!.person;
    expect(personHistory(t, id)!.crowns.map((c) => c.key).sort()).toEqual(['brittany', 'france']);
    until(t, '1315-01-01');
    expect(personHistory(t, id)!.crowns).toEqual([]);
    expect(personHistory(t, id)!.died).toBe(dayOf('1314-11-29', 1291));
  }, 60_000); // a world of 1291 founds its 550 economies twice (economy feature 12)
  it('is the same world from the same seed, and survives a snapshot', () => {
    expect(hashState(fresh())).toBe(hashState(fresh()));
    const t = decodeState(encodeState(s));
    expect(t.named).toEqual(s.named);
    expect(Array.from(t.realm.cols.holder)).toEqual(Array.from(s.realm.cols.holder));
  }, 60_000);
});

describe('a world of 1291 saved before the rulers', () => {
  it('gets the rulers of the day it has reached, as a world that had them from the first day', () => {
    const s = fresh();
    until(s, '1310-01-01');
    // the world as the build before saved it: no holders, nobody's death, no persons of history
    const old = decodeState(encodeState(fresh()));
    old.day = s.day; old.v = 15;
    const R = old.realm.cols as Record<string, unknown>, P = old.person.cols as Record<string, unknown>;
    delete R.holder; delete P.died; delete (old as Partial<WorldState>).named;
    // rows of the persons of history out again: the build before had only the persons of the cities
    const cities = old.named === undefined ? s.person.size - s.named.length : 0;
    old.person.size = cities; old.family.size = s.family.size - s.named.length;
    const up = upgradeState(old, w, () => loadSetup(1291));
    expect(up.v).toBe(STATE_VERSION);
    expect(holderName(up, 'england')).toBe('Edward II');
    expect(holderName(up, 'france')).toBe('Philip IV');
    expect(up.named.map((n) => n.name).sort()).toEqual(s.named.map((n) => n.name).sort());
  }, 60_000);
});
