// Moderation and fairness online (spec points 105, 106): the word filter from a config file, mute and block, reports
// for admins and bans, rate limits, and the catch-up summary a returning ruler receives.
import { describe, it, expect, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldCore, type WorldConfig, type Conn, type Session } from '../server/world';
import { WordFilter, parseWordList } from '../server/moderation';
import type { ServerMsg } from '../src/online/protocol';

vi.setConfig({ testTimeout: 180_000 });
const dir = mkdtempSync(join(tmpdir(), 'sc-mod-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('word filter', () => {
  it('reads its list from a file, matches whole words, prefixes and disguised letters', () => {
    expect(parseWordList('# comment\nFoo\n\n  bar* # trailing\n')).toEqual(['foo', 'bar*']);
    const f = new WordFilter(['knave', 'scoun*']);
    expect(f.clean('You KNAVE!').text).toBe('You *****!');
    expect(f.clean('a scoundrel and a scoundrelly man').hits).toBe(2);
    expect(f.clean('kn4ve').hits).toBe(1);           // 4 = a
    expect(f.clean('knavery is fine').hits).toBe(0); // whole words only, unless the entry ends in *
    const file = join(dir, 'words.txt');
    writeFileSync(file, '# list\nvillain\n');
    const g = new WordFilter([], file);
    expect(g.size).toBe(1);
    expect(g.clean('Villain!').text).toBe('*******!');
    writeFileSync(file, 'villain\nrogue\n');
    expect(g.reload(true)).toBe(true);
    expect(g.clean('rogue').hits).toBe(1);
  });
});

class Client {
  msgs: ServerMsg[] = []; session: Session | null = null; seq = 1;
  constructor(readonly uid: string, readonly name: string, readonly admin = false) {}
  conn: Conn = { send: (m) => { this.msgs.push(JSON.parse(JSON.stringify(m))); }, sendBin: () => {}, close: () => { this.session?.disconnect(); this.session = null; } };
  connect(core: WorldCore) { this.session = core.attach(this.conn, { uid: this.uid, name: this.name, admin: this.admin }); return this; }
  send(m: any) { this.session!.handle(m); }
  last<T extends ServerMsg['type']>(t: T): Extract<ServerMsg, { type: T }> | undefined { for (let i = this.msgs.length - 1; i >= 0; i--) if (this.msgs[i].type === t) return this.msgs[i] as any; return undefined; }
  lines() { return this.msgs.filter((m) => m.type === 'chat').flatMap((m: any) => m.msgs.map((x: any) => x.text)); }
}

describe('moderation on the world server', () => {
  const words = join(dir, 'filter.txt'); writeFileSync(words, 'knave\n');
  const cfg: WorldConfig = {
    id: 'mod-test', name: 'Moderation test', dataDir: dir, secondsPerDay: 0, snapshotEveryDays: 50, uploadEveryDays: 300, seed: 77, startYear: 1356, maxPlayers: 10,
    protectionDays: 30, inactiveReleaseMs: 7 * 86400_000, offerExpiryHours: 48, cmdsPerDay: 60, admins: ['Warden'], devAuth: true, log: () => {},
    wordFilterFile: words, catchUpMinDays: 5,
  };
  const core = new WorldCore(cfg).init();
  const alice = new Client('dev-alice', 'Alice').connect(core), bert = new Client('dev-bert', 'Bert').connect(core), cleo = new Client('dev-cleo', 'Cleo').connect(core);
  const free = alice.last('free')!.nations;
  const A = free.find((n) => n.key === 'portugal')!.id, B = free.find((n) => n.key === 'scotland')!.id, C = free.find((n) => n.key === 'denmark')!.id;
  alice.send({ type: 'join', nation: A }); bert.send({ type: 'join', nation: B }); cleo.send({ type: 'join', nation: C });

  it('filters words in chat and refuses copies and floods', () => {
    bert.send({ type: 'chat', text: 'Hail, you knave' });
    expect(alice.lines()).toContain('Hail, you *****');
    bert.send({ type: 'chat', text: 'Hail, you knave' });
    expect(bert.last('error')?.code).toBe('chat_repeat');
    for (let i = 0; i < 8; i++) bert.send({ type: 'chat', text: `line ${i}` });
    expect(bert.msgs.some((m) => m.type === 'error' && m.code === 'chat_rate')).toBe(true);
  });

  it('a mute hides public lines, a block hides direct lines and offers too', () => {
    alice.send({ type: 'mute', uid: 'dev-bert', on: true });
    expect(alice.last('moderation')?.mutes.map((x) => x.uid)).toEqual(['dev-bert']);
    alice.msgs = [];
    (bert.session as any).recent = []; (core as any).chatBuckets.clear();
    bert.send({ type: 'chat', text: 'public words' });
    bert.send({ type: 'chat', text: 'just for you', to: A });
    expect(alice.lines()).not.toContain('public words');
    expect(alice.lines()).toContain('just for you');
    expect(cleo.lines()).toContain('public words');
    alice.send({ type: 'block', uid: 'dev-bert', on: true });
    alice.msgs = []; (core as any).chatBuckets.clear();
    bert.send({ type: 'chat', text: 'still there?', to: A });
    expect(alice.lines()).not.toContain('still there?');
    bert.send({ type: 'offer', to: A, action: 'alliance' });
    expect(bert.last('error')?.message).toMatch(/does not accept offers/);
    // undo
    alice.send({ type: 'block', uid: 'dev-bert', on: false }); alice.send({ type: 'mute', uid: 'dev-bert', on: false });
    expect(alice.last('moderation')).toEqual({ type: 'moderation', mutes: [], blocks: [] });
  });

  it('reports reach the admins, who can ban; a banned player cannot come back', () => {
    const line = core.meta.chat.find((c) => c.from === 'dev-bert')!;
    alice.send({ type: 'report', uid: 'dev-bert', msg: line.id, reason: 'insults' });
    expect(alice.last('reported')).toBeTruthy();
    expect(core.reports()[0]).toMatchObject({ by: 'dev-alice', uid: 'dev-bert', reason: 'insults', status: 'open', text: line.text });
    const warden = new Client('dev-warden', 'Warden').connect(core);
    warden.send({ type: 'admin', action: 'reports' });
    expect(warden.last('reports')?.reports.length).toBe(1);
    // a player is not an admin
    alice.send({ type: 'admin', action: 'ban', uid: 'dev-cleo' });
    expect(alice.last('error')?.code).toBe('forbidden');
    warden.send({ type: 'admin', action: 'ban', uid: 'dev-bert', text: 'insults', hours: 24 });
    expect(bert.last('kicked')?.reason).toMatch(/banned/);
    expect(core.reports()).toHaveLength(0); // actioned
    const again = new Client('dev-bert', 'Bert').connect(core);
    expect(again.last('error')?.code).toBe('banned');
    expect(again.last('welcome')).toBeUndefined();
    warden.send({ type: 'admin', action: 'unban', uid: 'dev-bert' });
    expect(new Client('dev-bert', 'Bert').connect(core).last('welcome')).toBeTruthy();
    // too many reports in a row are refused
    for (let i = 0; i < 4; i++) cleo.send({ type: 'report', uid: 'dev-alice', reason: `r${i}` });
    expect(cleo.last('error')?.code).toBe('report_rate');
  });

  it('mute, block and report take only known players, a few at a time, and write meta.json lazily', () => {
    const before = JSON.stringify(core.meta.mod);
    cleo.send({ type: 'mute', uid: 'x'.repeat(50_000), on: true });
    expect(cleo.last('error')?.code).toBe('mute');
    cleo.send({ type: 'block', uid: 'dev-nobody', on: true });
    expect(cleo.last('error')?.code).toBe('block');
    (core as any).reportBuckets.clear();
    cleo.send({ type: 'report', uid: 'dev-nobody', reason: 'x' });
    expect(cleo.last('error')?.code).toBe('report');
    expect(JSON.stringify(core.meta.mod)).toBe(before);
    // a known player: listed at once, written to disk within a few seconds (or by the day's save)
    const disk = () => JSON.parse(readFileSync(join(dir, cfg.id, 'meta.json'), 'utf8')).mod.mutes['dev-cleo'] ?? [];
    cleo.send({ type: 'mute', uid: 'dev-alice', on: true });
    expect(cleo.last('moderation')?.mutes.map((x) => x.uid)).toEqual(['dev-alice']);
    expect(disk()).toEqual([]);
    expect((core as any).metaTimer).not.toBeNull();
    (core as any).saveMeta();
    expect(disk()).toEqual(['dev-alice']);
    // toggling in a loop is slowed down
    (core as any).markBuckets.clear(); cleo.msgs = [];
    for (let i = 0; i < 14; i++) cleo.send({ type: 'mute', uid: 'dev-alice', on: i % 2 === 1 });
    expect(cleo.msgs.some((m) => m.type === 'error' && m.code === 'mod_rate')).toBe(true);
    cleo.send({ type: 'mute', uid: 'dev-alice', on: false }); (core as any).markBuckets.clear();
    cleo.send({ type: 'mute', uid: 'dev-alice', on: false });
    expect(core.meta.mod.mutes['dev-cleo']).toBeUndefined();
  });

  it('the fog holds per session: no realm sees no armies, and an admin cannot lift it for everyone', () => {
    const dora = new Client('dev-dora', 'Dora').connect(core);
    const q = (c: Client, query: any) => {
      (core as any).buckets.clear(); // the general request limit is not under test here
      const id = c.seq++; c.send({ type: 'query', id, q: query });
      const r = c.msgs.find((m) => m.type === 'reply' && (m as any).id === id) as any; expect(r, `reply to ${query.q}`).toBeTruthy(); return r.data;
    };
    // places with foreign hosts on them: a viewer without a realm learns nothing about them
    const withArmies = [...new Set(core.s.armies.filter((a) => !a.fleet).map((a) => a.loc))].slice(0, 30);
    expect(withArmies.length).toBeGreaterThan(5);
    for (const l of withArmies) { const d = q(dora, { q: 'loc', loc: l }); expect(d.armies, `place ${l}`).toEqual([]); expect(d.siege ?? null).toBeNull(); expect(d.agents ?? []).toEqual([]); }
    const far = core.s.armies.find((a) => a.owner !== A)!;
    expect(q(dora, { q: 'path', army: far.id, to: core.s.nations[A].capital })).toBeNull();
    // an admin's world-wide "reveal" and "observer" are refused
    const warden = new Client('dev-warden', 'Warden').connect(core);
    for (const action of ['reveal', 'observer']) {
      warden.send({ type: 'admin', action: 'dev', cmd: { t: 'dev', n: A, action } });
      expect(warden.last('error')?.code).toBe('dev');
    }
    expect(core.s.flags.revealAll).toBeUndefined(); expect(core.s.observer).toBeFalsy();
    // and if such a flag is set all the same (an old log), a player still sees only what the realm sees
    const seen = (c: Client) => { let n = 0; for (const l of withArmies) n += (q(c, { q: 'loc', loc: l })?.armies ?? []).length; return n; };
    const plain = seen(alice);
    expect(plain).toBeLessThan(core.s.armies.filter((a) => withArmies.includes(a.loc)).length);
    core.s.flags.revealAll = 1; core.s.observer = true; (core as any).poolDirty = true;
    expect(seen(alice)).toBe(plain);
    const o = new Uint16Array(core.w.L); for (let i = 0; i < core.w.L; i++) o[i] = core.s.loc.owner[i] + 1;
    core.s.timelapse.push({ day: core.s.day, owners: o });
    const tl = q(alice, { q: 'timelapse' }) as { owners: number[] }[];
    const known = core.s.explored[core.s.nations[A].knows]; let hidden = 0;
    expect(tl.length).toBeGreaterThan(0);
    for (const f of tl) for (let i = 0; i < core.w.L; i++) if (!known[i]) { expect(f.owners[i]).toBe(0); hidden++; }
    expect(hidden).toBeGreaterThan(1000);
    core.s.timelapse.pop();
    delete core.s.flags.revealAll; core.s.observer = false;
    dora.conn.close(1000, ''); warden.conn.close(1000, '');
  });

  it('a ruler who comes back after days gets a catch-up summary', () => {
    alice.conn.close(1000, '');
    expect(core.meta.seats['dev-alice'].away?.day).toBe(core.s.day);
    const from = core.s.day;
    for (let i = 0; i < 8; i++) core.step();
    const back = new Client('dev-alice', 'Alice').connect(core);
    const c = back.last('catchup')!.summary;
    expect(c.nation).toBe(A);
    expect(c.fromDay).toBe(from);
    expect(c.daysAway).toBe(8);
    expect(core.meta.seats['dev-alice'].away).toBeUndefined();
    // a short absence gets none
    back.conn.close(1000, ''); core.step();
    expect(new Client('dev-alice', 'Alice').connect(core).last('catchup')).toBeUndefined();
    core.stop();
  });
});
