// Runs the world server core in-process in fast mode with scripted clients for ~60 in-game days, then checks that
// snapshot + command log replay reproduces hashState exactly, that a restarted server resumes the same state,
// and that the server enforces the online rules (own nation only, admin-only dev commands, offline standing orders,
// protection, player offers → simulation treaties, rate limiting).
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldCore, type WorldConfig, type Conn, type Session } from '../server/world';
import { applyArmies, applyNations, type ServerMsg } from '../src/online/protocol';
import type { ArmyLite, NationLite } from '../src/game/protocol';
import { armyLites, nationLites } from '../src/game/view';
import type { Command } from '../src/sim/types';
import { hasTreaty } from '../src/sim/ctx';

const dir = mkdtempSync(join(tmpdir(), 'sc-world-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const cfg: WorldConfig = {
  id: 'replay-test', name: 'Replay test', dataDir: dir, secondsPerDay: 0, snapshotEveryDays: 20, uploadEveryDays: 300, seed: 4242, startYear: 1356, maxPlayers: 10,
  protectionDays: 30, inactiveReleaseMs: 7 * 86400_000, offerExpiryHours: 48, cmdsPerDay: 60, admins: ['Warden'], devAuth: true, log: () => {},
};

class Client {
  msgs: ServerMsg[] = []; session: Session | null = null; seq = 1; armies = new Map<number, ArmyLite>(); nations: NationLite[] = [];
  constructor(readonly uid: string, readonly name: string) {}
  conn: Conn = {
    send: (m) => { const c = JSON.parse(JSON.stringify(m)); if (c.type === 'welcome') this.nations = c.nations; if (c.type === 'tick') { c.view.armies = applyArmies(this.armies, c.view); this.nations = applyNations(this.nations, c.view) ?? this.nations; } this.msgs.push(c); }, // round-trip like the wire; armies merged like the browser does
    sendBin: () => {},
    close: () => { this.session?.disconnect(); this.session = null; },
  };
  connect(core: WorldCore) { this.session = core.attach(this.conn, { uid: this.uid, name: this.name, admin: false }); return this; }
  send(m: any) { this.session!.handle(m); }
  cmd(c: Command) { const id = this.seq++; this.send({ type: 'cmd', id, cmd: c }); return id; }
  result(id: number) { return (this.msgs.find((m) => m.type === 'cmdResult' && m.id === id) as any)?.res; }
  last<T extends ServerMsg['type']>(t: T): Extract<ServerMsg, { type: T }> | undefined { for (let i = this.msgs.length - 1; i >= 0; i--) if (this.msgs[i].type === t) return this.msgs[i] as any; return undefined; }
  all<T extends ServerMsg['type']>(t: T): Extract<ServerMsg, { type: T }>[] { return this.msgs.filter((m) => m.type === t) as any; }
}

function runDays(core: WorldCore, until: number, script: (day: number) => void): Promise<void> {
  return new Promise((res, rej) => {
    core.onDay = [(d) => { try { script(d); } catch (e) { core.stop(); rej(e); return; } if (d >= until) { core.stop(); res(); } }];
    core.start();
  });
}

describe('world server core', () => {
  const core = new WorldCore(cfg).init();
  const alice = new Client('dev-alice', 'Alice'), bertram = new Client('dev-bertram', 'Bertram'), warden = new Client('dev-watcher', 'Watcher');
  let A = -1, B = -1;
  let liveHash = '';

  it('runs 60 days with scripted clients, then replays to the same hash', async () => {
    alice.connect(core); bertram.connect(core); warden.connect(core);
    const free = alice.last('free')!.nations;
    expect(free.length).toBeGreaterThan(100);
    A = free.find((n) => n.key === 'portugal')!.id; B = free.find((n) => n.key === 'scotland')!.id;
    alice.send({ type: 'join', nation: A });
    bertram.send({ type: 'join', nation: A }); // taken
    expect(bertram.last('error')?.code).toBe('taken');
    bertram.send({ type: 'join', nation: B });
    expect(alice.last('seat')?.seat?.nation).toBe(A);
    expect(bertram.last('seat')?.seat?.nation).toBe(B);
    expect(core.s.nations[A].playerId).toBe('dev-alice');
    expect(core.s.nations[A].flags.protected_until).toBe(core.s.day + 30);
    expect(alice.last('achievements')?.fresh).toContain('first_crown');

    const ids: Record<string, number> = {};
    await runDays(core, 60, (day) => {
      const capA = core.s.nations[A].capital, capB = core.s.nations[B].capital;
      if (day === 1) {
        ids.tax = alice.cmd({ t: 'tax', n: A, cls: 0, rate: 0.12 });
        ids.build = alice.cmd({ t: 'build', n: A, loc: capA, building: 0 });
        ids.orders = bertram.cmd({ t: 'orders', n: B, orders: { defendOnly: true, balanceBudget: true, acceptPeaceBelow: 40, autoBuild: true, autoRecruit: false } });
        ids.maint = bertram.cmd({ t: 'budget', n: B, key: 'army', value: 0.75 });
        ids.foreign = bertram.cmd({ t: 'tax', n: A, cls: 0, rate: 0.5 }); // not his realm
        ids.dev = alice.cmd({ t: 'dev', n: A, action: 'gold', payload: { amount: 1e6 } }); // not an admin
        alice.send({ type: 'query', id: 900, q: { q: 'realm' } });
        bertram.send({ type: 'query', id: 901, q: { q: 'nation', nation: A } });
      }
      if (day === 2) {
        expect(bertram.result(ids.foreign)).toEqual({ ok: false, err: 'not your realm' });
        expect(alice.result(ids.dev)?.ok).toBe(false);
        expect(alice.result(ids.tax)).toEqual({ ok: true });
        expect(bertram.result(ids.maint)).toEqual({ ok: true });
        expect(core.s.nations[B].armyMaint).toBe(0.75);
        expect((alice.msgs.find((m) => m.type === 'reply' && m.id === 900) as any)?.data?.laws?.length).toBeGreaterThan(0);
        // an alliance offer between two players goes through the async offer system and ends as a simulation treaty
        alice.cmd({ t: 'diplo', n: A, action: 'alliance', target: B });
        const offer = bertram.last('offers')!.offers.find((o) => o.from === A && o.to === B)!;
        expect(offer.action).toBe('alliance');
        bertram.send({ type: 'offer_answer', offer: offer.id, accept: true });
        expect(hasTreaty(core.s, A, B, 'alliance')).toBe(true);
        alice.send({ type: 'chat', text: 'Long live the alliance!' });
        expect(bertram.last('chat')?.msgs[0].text).toBe('Long live the alliance!');
      }
      if (day === 3) {
        const army = alice.last('tick')!.view.armies!.find((a) => a.owner === A && !a.fleet);
        if (army) alice.cmd({ t: 'move', n: A, army: army.id, to: capA });
        bertram.cmd({ t: 'recruit', n: B, loc: capB, unit: 0, men: 1000 });
        alice.cmd({ t: 'tech', n: A, branch: 1 });
        // protection: nobody may declare war on a freshly seated player
        ids.declare = bertram.cmd({ t: 'declare', n: B, target: A, goal: 'conquest' });
      }
      if (day === 4) expect(bertram.result(ids.declare)).toEqual({ ok: false, err: 'that realm is under protection' });
      if (day === 5) { bertram.conn.close(1000, 'bye'); }
      if (day === 6) {
        expect(core.s.flags[`offline_${B}`]).toBe(1);
        expect(core.s.playerNations).not.toContain(B);
        expect(core.s.nations[B].playerId).toBe('dev-bertram');
      }
      if (day === 20) { warden.send({ type: 'admin', action: 'broadcast', text: 'no rights' }); expect(warden.last('error')?.code).toBe('forbidden'); }
      if (day === 25) {
        // a flood of requests is cut off by the rate limiter
        for (let i = 0; i < 80; i++) alice.send({ type: 'query', id: 1000 + i, q: { q: 'ledger', kind: 'wars' } });
        expect(alice.all('error').some((e) => e.code === 'rate_limited')).toBe(true);
      }
      if (day === 40) {
        bertram.msgs = []; bertram.connect(core);
        expect(bertram.last('welcome')?.seat?.nation).toBe(B);
        expect(core.s.flags[`offline_${B}`]).toBeUndefined();
        // the standing orders ran the budget while he was away
        expect(core.s.nations[B].armyMaint).not.toBe(0.75);
        expect(bertram.last('tick')?.view.player?.id).toBe(B);
      }
      if (day === 45) {
        // an admin (by config) may run developer commands for any realm; they are logged and replayed too
        const admin = new Client('dev-warden2', 'Warden'); admin.connect(core);
        const before = core.s.nations[A].treasury;
        admin.send({ type: 'admin', action: 'dev', cmd: { t: 'dev', n: A, action: 'gold', payload: { amount: 500 } } });
        expect(core.s.nations[A].treasury).toBeCloseTo(before + 500, 5);
        admin.conn.close(1000, '');
      }
    });
    expect(core.s.day).toBe(60);
    const tick = alice.last('tick')!;
    expect(tick.view.day).toBe(60);
    expect(tick.view.player?.id).toBe(A);
    // the client's copy built from daily changes equals the server's whole lists (realms as of the last month start)
    expect(JSON.parse(JSON.stringify(tick.view.armies))).toEqual(JSON.parse(JSON.stringify(armyLites(core.s, core.w))));
    expect(alice.nations.length).toBe(core.s.nations.length);
    expect(alice.nations.map((n) => n.name)).toEqual(nationLites(core.s, core.w).map((n) => n.name));
    expect(core.snapshotDays()).toEqual([0, 20, 40, 60]);

    liveHash = core.hash();
    const fromLatest = core.verifyReplay();
    expect(fromLatest.from).toBe(60);
    expect(fromLatest.hash).toBe(liveHash);
    const fromMiddle = core.verifyReplay(20);
    expect(fromMiddle.lines).toBeGreaterThan(40);
    expect(fromMiddle.hash).toBe(liveHash);
    const fromGenesis = core.verifyReplay(0);
    expect(fromGenesis.lines).toBeGreaterThan(60);
    expect(fromGenesis.hash).toBe(liveHash);
  }, 180_000);

  it('a crashed server resumes from snapshot + log to the same state', async () => {
    // a few more days after the last snapshot, then everybody leaves and the process "dies" without a clean shutdown
    await runDays(core, 67, (day) => { if (day === 63) alice.cmd({ t: 'tax', n: A, cls: 0, rate: 0.1 }); });
    alice.conn.close(1000, ''); bertram.conn.close(1000, ''); warden.conn.close(1000, '');
    const hash = core.hash();
    core.stop();
    const again = new WorldCore(cfg).init();
    expect(again.s.day).toBe(67);
    expect(again.hash()).toBe(hash);
    expect(again.seats().map((x) => x.uid).sort()).toEqual(['dev-alice', 'dev-bertram']);
    expect(again.s.flags[`offline_${A}`]).toBe(1);
    again.stop();
  }, 120_000);
});
