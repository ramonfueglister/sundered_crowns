// The copy of the world in the store (Supabase Storage in production): every snapshot and, every day, the log since
// it go out; a world server that finds its disk empty takes the world back from that copy, on the same day and with
// the same hash, instead of founding a new world.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldCore, configFromEnv } from '../server/world';
import { MemStore } from './setup/mem_store';
import { hashState } from '../src/sim/snapshot';

describe('copy of the world in the store', () => {
  const base = { ...configFromEnv({}), id: 'test', snapshotEveryDays: 5, uploadEveryDays: 5, logUploadEveryDays: 1, uploadMinMinutes: 0, log: () => {} };

  it('sends the snapshots and the daily log, and a server with an empty disk resumes from them', async () => {
    const dirA = mkdtempSync(join(tmpdir(), 'scw-a-')), dirB = mkdtempSync(join(tmpdir(), 'scw-b-'));
    const store = new MemStore();
    const a = new WorldCore({ ...base, dataDir: dirA }, store);
    expect(await a.restoreIfEmpty()).toBe(false); // nothing in the store yet: a new world
    a.init(); await a.flushUploads();
    a.enqueue({ k: 'claim', uid: 'dev-anna', realm: a.s.realmText.findIndex((r) => r.key === 'france') });
    // a day lasts minutes on the server: the uploads of a day end before the next one
    for (let i = 0; i < 7; i++) { a.step(); await a.flushUploads(); }
    expect(store.snapshots).toEqual([0, 5]); // the genesis snapshot at once, then every snapshot
    expect(store.logs).toBe(6); // the log since the snapshot sent, on every other day (1–4, 6, 7)
    const day = a.s.day, hash = hashState(a.s);
    a.stop(); // the volume is lost: nothing more is written

    const b = new WorldCore({ ...base, dataDir: dirB }, store);
    expect(await b.restoreIfEmpty()).toBe(true);
    expect(existsSync(join(dirB, 'test', 'borders.ndjson'))).toBe(true); // the history of the borders comes back too
    b.init();
    expect(b.s.day).toBe(day);
    expect(hashState(b.s)).toBe(hash);
    expect(b.meta.seats).toEqual(a.meta.seats);
    // a disk that holds a world is left alone
    expect(await new WorldCore({ ...base, dataDir: dirB }, store).restoreIfEmpty()).toBe(false);
    b.shutdown();
    rmSync(dirA, { recursive: true, force: true }); rmSync(dirB, { recursive: true, force: true });
  }, 120_000);

  it('refuses to found a new world when the store cannot be read', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scw-c-'));
    const store = new MemStore();
    store.downloadBackup = async () => { throw new Error('network down'); };
    await expect(new WorldCore({ ...base, dataDir: dir }, store).restoreIfEmpty()).rejects.toThrow('network down');
    rmSync(dir, { recursive: true, force: true });
  });
});
