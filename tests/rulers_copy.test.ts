// The readable copy of the rulers (server/rulers_copy.ts, tables world_persons and world_reigns): on the first day of
// 1291 every person of history is a row with the row of the person table, every crown's holder reigns on, and a death
// sends only the rows it changes. A world server with a store sends the copy as it starts.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWorldFor, loadSetup } from '../tools/sim/load';
import { createWorldState } from '../src/sim/setup';
import { ALIVE } from '../src/sim/state';
import { rulerRows, RulerCopy } from '../server/rulers_copy';
import { configFromEnv } from '../server/config';
import { WorldCore } from '../server/world';
import { MemStore } from './setup/mem_store';

describe('readable copy of the rulers', () => {
  const w = loadWorldFor(1291);
  const s = createWorldState(w, loadSetup(1291), 1291);

  it('has a row for every person of history and the reigns of the first day', () => {
    const { persons, reigns } = rulerRows('w', s, w);
    expect(persons.length).toBe(s.named.length);
    expect(persons.length).toBeGreaterThan(200);
    const anna = persons[0];
    expect(s.named.find((n) => n.person === anna.person)?.key).toBe(anna.key);
    expect(persons.every((p) => p.died_day === null && p.died === null)).toBe(true);
    expect(reigns.every((r) => r.start_day === null || r.start_day <= 0)).toBe(true);
    // every crown of the day is held by a person whose reign goes on
    const H = s.realm.cols.holder;
    for (let r = 0; r < s.realm.size; r++) {
      if (!s.realm.alive[r] || H[r] < 0) continue;
      expect(reigns.some((g) => g.realm === s.realmText[r].key && g.person === H[r] && g.end_day === null), s.realmText[r].key).toBe(true);
    }
    // France on 1 January 1291: Philip IV
    const fr = s.realmText.findIndex((t) => t.key === 'france');
    expect(persons.find((p) => p.person === H[fr])?.name).toMatch(/Philip IV/);
  }, 60_000);

  it('sends only what changed', () => {
    const copy = new RulerCopy('w');
    const first = copy.changes(s, w);
    expect(first.persons.length).toBe(s.named.length);
    copy.sentOk(first.keys);
    expect(copy.changes(s, w).keys).toEqual([]);
    // a holder dies: their person row and the reigns they held change, nothing else
    const fr = s.realmText.findIndex((t) => t.key === 'france'), king = s.realm.cols.holder[fr];
    s.person.cols.died[king] = 0;
    try {
      const ch = copy.changes(s, w);
      expect(ch.persons.map((p) => p.person)).toEqual([king]);
      expect(ch.persons[0].died_day).toBe(0);
      expect(ch.reigns.length).toBeGreaterThan(0);
      expect(ch.reigns.every((g) => g.person === king && g.end_day === 0)).toBe(true);
    } finally { s.person.cols.died[king] = ALIVE; }
  });

  it('goes out when a world server with a store starts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scw-r-'));
    const store = new MemStore();
    const core = new WorldCore({ ...configFromEnv({}), dataDir: dir, id: 'test', startYear: 1291, seed: 1291, uploadMinMinutes: 0, log: () => {} }, store).init();
    await core.flushUploads();
    expect(store.persons.size).toBe(core.s.named.length);
    expect(store.reigns.size).toBeGreaterThan(200);
    core.shutdown();
    rmSync(dir, { recursive: true, force: true });
  }, 180_000);
});
