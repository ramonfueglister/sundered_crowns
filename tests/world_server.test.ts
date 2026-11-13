// The persistent world server in-process: players take up realms, the world runs, a snapshot plus the command log
// reproduces it, and a restart resumes where it stopped.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldCore, configFromEnv, type Conn } from '../server/world';
import type { ServerMsg } from '../src/net/protocol';
import { BIN_OWNERS } from '../src/net/protocol';

function conn() {
  const msgs: ServerMsg[] = [], bins: Uint8Array[] = [];
  const c: Conn = { send: (m) => msgs.push(m), sendBin: (b) => bins.push(b), close: () => {} };
  return { c, msgs, bins };
}

describe('world server', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scw-'));
  const cfg = { ...configFromEnv({}), dataDir: dir, id: 'test', snapshotEveryDays: 5, log: () => {} };

  it('welcomes a player with the realms and the map, lets them take a free realm and runs the days', () => {
    const core = new WorldCore(cfg).init();
    const a = conn();
    const sa = core.attach(a.c, { uid: 'dev-anna', name: 'Anna', admin: false });
    const welcome = a.msgs.find((m) => m.type === 'welcome') as Extract<ServerMsg, { type: 'welcome' }>;
    expect(welcome.me.realm).toBe(-1);
    expect(welcome.realms.length).toBeGreaterThan(300);
    expect(a.bins[0][0]).toBe(BIN_OWNERS);
    const fr = welcome.realms.find((r) => r.key === 'france')!;
    sa.handle({ type: 'claim', realm: fr.id });
    expect(core.s.ruler[fr.id]).toBe('dev-anna');
    expect((a.msgs.filter((m) => m.type === 'me').pop() as any).me.realm).toBe(fr.id);
    // a second player cannot take the same realm
    const b = conn(); const sb = core.attach(b.c, { uid: 'dev-ben', name: 'Ben', admin: false });
    sb.handle({ type: 'claim', realm: fr.id });
    expect(b.msgs.some((m) => m.type === 'error')).toBe(true);
    // unknown commands are refused with a reason
    sa.handle({ type: 'cmd', id: 7, cmd: { t: 'nonsense', realm: 0 } });
    for (let i = 0; i < 12; i++) core.step();
    expect(core.s.day).toBe(12);
    expect(a.msgs).toContainEqual({ type: 'result', id: 7, ok: false, err: 'unknown command' });
    expect(a.msgs.filter((m) => m.type === 'tick').length).toBe(12);
    sb.handle({ type: 'place', place: 0 });
    expect(b.msgs.some((m) => m.type === 'place')).toBe(true);
    // abdicating frees the realm on the next day
    sa.handle({ type: 'abdicate' }); core.step();
    expect(core.s.ruler[fr.id]).toBe('');
    sb.handle({ type: 'claim', realm: fr.id });
    expect(core.s.ruler[fr.id]).toBe('dev-ben');
    const v = core.verifyReplay();
    expect(v.hash).toBe(v.live);
    core.shutdown();
  });

  it('resumes from disk where it stopped', () => {
    const core = new WorldCore(cfg).init();
    expect(core.s.day).toBe(13);
    const fr = core.s.realmText.findIndex((r) => r.key === 'france');
    expect(core.s.ruler[fr]).toBe('dev-ben');
    expect(core.seats().map((x) => x.name)).toEqual(['Ben']);
    core.step();
    const v = core.verifyReplay(0);
    expect(v.hash).toBe(v.live);
    core.shutdown();
    rmSync(dir, { recursive: true, force: true });
  });
});
