// The copy of the world in Supabase Storage (server/store.ts), against a bucket in memory: a snapshot larger than
// the 50 MB the Free plan takes per file goes in parts, the parts of the snapshot before go, and the copy comes back
// byte for byte; a copy in the format before (one snapshot.bin) still comes back.
import { describe, it, expect } from 'vitest';
import { SupabaseStore } from '../server/store';

function memBucket() {
  const files = new Map<string, Uint8Array>();
  const notFound = { message: 'Object not found', statusCode: '404', status: 400 };
  const bucket = {
    async upload(path: string, body: Uint8Array) {
      files.set(path, body.slice());
      return { data: { path }, error: null };
    },
    async download(path: string) {
      const b = files.get(path);
      return b ? { data: new Blob([new Uint8Array(b)]), error: null } : { data: null, error: notFound };
    },
    async list(prefix: string) {
      return {
        data: [...files.keys()]
          .filter((k) => k.startsWith(prefix + '/'))
          .map((k) => ({ name: k.slice(prefix.length + 1) })),
        error: null,
      };
    },
    async remove(paths: string[]) {
      for (const p of paths) files.delete(p);
      return { data: [], error: null };
    },
  };
  return { files, db: { storage: { from: () => bucket } } };
}

function store() {
  const s = new SupabaseStore('http://localhost:54321', 'service-key');
  const m = memBucket();
  (s as any).db = m.db;
  return { s, files: m.files };
}

describe('copy of the world in Supabase Storage', () => {
  it('splits a large snapshot into parts, drops the parts before and gives the copy back whole', async () => {
    const { s, files } = store();
    const big = new Uint8Array(SupabaseStore.PART * 2 + 12345);
    for (let i = 0; i < big.length; i += 4096) big[i] = (i / 4096) & 255;
    expect(await s.uploadSnapshot('w', 30, big, '{"seats":{}}', new Uint8Array([7]))).toBe(true);
    expect([...files.keys()].filter((k) => k.includes('snapshot-30-')).length).toBe(3);
    expect(await s.uploadLog('w', '{"d":30,"adv":1}\n')).toBe(true);
    const b = await s.downloadBackup('w');
    expect(b!.bin.length).toBe(big.length);
    expect(Buffer.from(b!.bin).equals(Buffer.from(big))).toBe(true);
    expect(b!.log).toBe('{"d":30,"adv":1}\n');
    expect(b!.meta).toBe('{"seats":{}}');
    expect([...b!.history!]).toEqual([7]);
    // the next snapshot replaces the parts of this one
    expect(await s.uploadSnapshot('w', 60, new Uint8Array([1, 2, 3]), '{}', null)).toBe(true);
    expect([...files.keys()].filter((k) => /snapshot-\d+-\d+\.bin$/.test(k))).toEqual([
      'w/persistent/snapshot-60-0.bin',
    ]);
    expect([...(await s.downloadBackup('w'))!.bin]).toEqual([1, 2, 3]);
  });

  it('has no copy of a world it never saw, and reads the format before', async () => {
    const { s, files } = store();
    expect(await s.downloadBackup('w')).toBeNull();
    files.set('w/persistent/snapshot.bin', new Uint8Array([9, 9]));
    files.set('w/persistent/snapshot.json', new TextEncoder().encode('{"day":300,"logFrom":270}'));
    expect([...(await s.downloadBackup('w'))!.bin]).toEqual([9, 9]);
  });
});
