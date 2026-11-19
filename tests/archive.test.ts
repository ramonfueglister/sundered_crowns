// People feature 7, step 2 (docs/PEOPLE_DESIGN.md): the archive of the dead. Every person has a uid that never
// changes; on the first of January the dead whom nothing needs leave the table, the rows close up, and the world goes
// on as it would have without the archive.
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newWorldState } from '../tools/sim/load';
import { livingHash } from '../tools/sim/living_hash';
import { tick } from '../src/sim/schedule';
import { SYSTEMS } from '../src/sim/systems';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { upgradeState } from '../src/sim/upgrade';
import { ALIVE, STATE_VERSION, type WorldState } from '../src/sim/state';
import type { World } from '../src/sim/world';
import type { Column } from '../src/sim/ecs';
import { archiveDead, decodeArchived, encodeArchived, indexIn, rowOf, rowsThatStay, takeArchived, yearsWith, type ArchivedPersons } from '../src/sim/people/archive';
import { personDetail, manyPlacesPeople } from '../src/net/people';
import { WorldFiles } from '../server/files';

const PEOPLE = new Set(['archive', 'deaths', 'moves', 'families']);
const withArchive = SYSTEMS.filter((x) => PEOPLE.has(x.id)), without = withArchive.filter((x) => x.id !== 'archive');
const copy = (s: WorldState) => decodeState(encodeState(s));
const run = (s: WorldState, w: World, days: number, systems = withArchive) => { for (let d = 0; d < days; d++) tick(s, w, systems); };

describe('the archive of the dead', () => {
  let w: World, s0: WorldState;
  beforeAll(() => { ({ s: s0, w } = newWorldState(1291, 1291)); }, 120_000);

  it('a new world numbers its persons in the order they came: the uid is the row, the parents are uids', () => {
    const P = s0.person.cols, n = s0.person.size;
    expect(s0.v).toBe(STATE_VERSION);
    expect(s0.nextUid).toBe(n);
    expect(s0.archive).toEqual([]);
    let mothers = 0;
    const borne = new Map<number, number>();
    for (let id = 0; id < n; id++) {
      expect(P.uid[id]).toBe(id);
      if (P.mother[id] >= 0) { mothers++; expect(rowOf(s0, P.mother[id])).toBe(P.mother[id]); borne.set(P.mother[id], (borne.get(P.mother[id]) ?? 0) + 1); }
    }
    expect(mothers).toBeGreaterThan(10_000);
    for (let id = 0; id < n; id++) expect(P.children[id]).toBe(borne.get(id) ?? 0);
    expect(rowOf(s0, n)).toBe(-1); expect(rowOf(s0, -1)).toBe(-1);
  });

  it('on the first of January the dead whom nothing needs go, the rows close up, and the world goes on the same', () => {
    const a = copy(s0), b = copy(s0);
    run(a, w, 364); run(b, w, 364, without); // to the last day of 1291 (day 0 is the first of January 1291)
    expect(a.person.size).toBe(b.person.size); // nothing went yet
    takeArchived(a);
    run(a, w, 1); run(b, w, 1, without); // 1 January 1292
    const [year] = takeArchived(a);
    expect(year).toBeDefined();
    expect(a.archive).toEqual([{ day: 365, persons: year.persons, first: year.cols.uid[0], last: year.cols.uid[year.persons - 1] }]);
    expect(a.person.size + year.persons).toBe(b.person.size);
    expect(year.persons).toBeGreaterThan(1000);
    // the rows lie in the order of the uids, and everything that names a row names a person who is there
    const P = a.person.cols, F = a.family.cols;
    for (let id = 1; id < a.person.size; id++) expect(P.uid[id]).toBeGreaterThan(P.uid[id - 1]);
    for (let k = 0; k < year.persons; k++) expect(rowOf(a, year.cols.uid[k])).toBe(-1);
    for (let k = 0; k < year.persons; k++) expect(year.cols.died[k]).not.toBe(ALIVE);
    for (let f = 0; f < a.family.size; f++) for (const id of [F.man[f], F.woman[f]]) if (id >= 0) expect(id).toBeLessThan(a.person.size);
    const heads = (s: WorldState) => { const out: number[] = []; for (let f = 0; f < s.family.size; f++) out.push(s.family.cols.man[f] < 0 ? -1 : s.person.cols.uid[s.family.cols.man[f]], s.family.cols.woman[f] < 0 ? -1 : s.person.cols.uid[s.family.cols.woman[f]]); return out; };
    expect(heads(a)).toEqual(heads(b));
    const owners = (s: WorldState) => Array.from(s.firm.cols.owner.subarray(0, s.firm.size), (o) => (o < 0 ? -1 : s.person.cols.uid[o]));
    expect(owners(a)).toEqual(owners(b));
    for (let f = 0; f < a.firm.size; f++) expect(P.role[a.firm.cols.owner[f]]).not.toBe(0);
    expect(a.named.map((x) => P.uid[x.person])).toEqual(b.named.map((x) => b.person.cols.uid[x.person]));
    expect(livingHash(a)).toBe(livingHash(b));
    // a year later the same: the second year goes too
    run(a, w, 366); run(b, w, 366, without);
    expect(livingHash(a)).toBe(livingHash(b));
    expect(a.archive.length).toBe(2);
    expect(takeArchived(a).length).toBe(1);
  }, 120_000);

  it('stay: the living, the estates, the persons of history and the dead parents of a household', () => {
    const a = copy(s0);
    run(a, w, 365, without);
    const keep = rowsThatStay(a), P = a.person.cols;
    for (let id = 0; id < a.person.size; id++) {
      if (P.died[id] === ALIVE || P.role[id] !== 0) expect(keep[id]).toBe(1);
    }
    for (const x of a.named) expect(keep[x.person]).toBe(1);
    // a living person whose parent belongs to a household finds both parents in the table after the first of January
    archiveDead(a);
    const Q = a.person.cols, G = a.family.cols;
    for (let id = 0; id < a.person.size; id++) {
      if (Q.died[id] !== ALIVE) continue;
      const m = rowOf(a, Q.mother[id]), f = rowOf(a, Q.father[id]);
      const seated = (r: number) => r >= 0 && G.seat[Q.family[r]] === 1;
      if (seated(m) || seated(f)) {
        if (Q.mother[id] >= 0) expect(m).toBeGreaterThanOrEqual(0);
        if (Q.father[id] >= 0) expect(f).toBeGreaterThanOrEqual(0);
      }
    }
  }, 120_000);

  it('a world loaded after the first of January goes on as the one that ran', () => {
    const a = copy(s0);
    run(a, w, 366);
    const b = copy(a);
    run(a, w, 40); run(b, w, 40);
    expect(hashState(b)).toBe(hashState(a));
  }, 120_000);

  it('the browser names a person by the uid: the living from the table, the dead of the archive from its year', () => {
    const a = copy(s0);
    run(a, w, 366);
    const [year] = takeArchived(a), culture = (i: number) => String(i);
    const bytes = encodeArchived(year), back = decodeArchived(bytes);
    expect(back.persons).toBe(year.persons);
    expect(Array.from(back.cols.genes)).toEqual(Array.from(year.cols.genes));
    const P = a.person.cols;
    // a living person whose row is no longer the uid
    let id = a.person.size - 1;
    while (P.died[id] !== ALIVE) id--;
    expect(P.uid[id]).toBeGreaterThan(id);
    const d = personDetail(a, P.uid[id], culture)!;
    expect(d.id).toBe(P.uid[id]); expect(d.alive).toBe(true); expect(d.mother).toBe(P.mother[id]);
    const place = a.family.cols.place[P.family[id]], list = manyPlacesPeople(a, [place])[0];
    expect(list.id).toContain(P.uid[id]);
    // a dead person of the archive
    const uid = back.cols.uid[7], find = (u: number): { year: ArchivedPersons; k: number } | null => {
      for (const y of yearsWith(a, u)) if (y.day === back.day) { const k = indexIn(back, u); if (k >= 0) return { year: back, k }; }
      return null;
    };
    expect(personDetail(a, uid, culture)).toBeNull();
    const dead = personDetail(a, uid, culture, find)!;
    expect(dead.id).toBe(uid); expect(dead.alive).toBe(false); expect(dead.archived).toBe(true);
    expect(dead.genes.length).toBe(100); expect(dead.economy).toBeNull();
    expect(personDetail(a, a.nextUid + 5, culture, find)).toBeNull();
  }, 120_000);

  it('a state of version 29 is given the uids of its rows and goes on as before', () => {
    const a = copy(s0), old = copy(s0) as WorldState & Record<string, unknown>;
    const cols = old.person.cols as unknown as Record<string, Column>;
    delete cols.uid; delete cols.children;
    delete (old as Partial<WorldState>).nextUid; delete (old as Partial<WorldState>).archive;
    old.v = 29;
    const up = upgradeState(old, w);
    expect(hashState(up)).toBe(hashState(a)); // byte for byte a world of now
  }, 120_000);

  it('the world server keeps a year of the archive on its disk', () => {
    const a = copy(s0);
    run(a, w, 366);
    const [year] = takeArchived(a), dir = mkdtempSync(join(tmpdir(), 'scw-archive-')), files = new WorldFiles(dir);
    files.putArchived(year);
    expect(files.hasArchived(year.day)).toBe(true);
    const back = files.readArchived(year.day)!;
    expect(back.persons).toBe(year.persons);
    expect(Array.from(back.cols.uid)).toEqual(Array.from(year.cols.uid));
    expect(files.readArchived(year.day + 1)).toBeNull();
    files.close(); rmSync(dir, { recursive: true, force: true });
  }, 120_000);
});
