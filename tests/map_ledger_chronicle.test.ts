// Map, ledger and chronicle (fix-map track): the chronicle names every realm an entry concerns and the player's own
// entries survive a busy world; the ledger, the chronicle and the map legends speak only of what the player knows.
import { describe, it, expect, vi } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { advanceDay } from '../src/sim/engine';
import { answer } from '../src/game/view';
import { fogAnswer, sightOf, metRealms, fogChronicle, fogTick } from '../src/game/fog';
import { declareWar, applyPeace } from '../src/sim/systems/war';
import { chronicle as addEntry, chronInvolves } from '../src/sim/ctx';
import { chronicle, ownChronicle, addChronicle, setChronicle } from '../src/game/client';
import type { GameState, ChronEntry } from '../src/sim/types';

vi.setConfig({ testTimeout: 180_000 });
const w = loadWorld();
const nid = (s: GameState, key: string) => s.nations.find((n) => n.key === key)!.id;

describe('chronicle: every realm an entry concerns', () => {
  const s = createGame(w, loadSetup(1356), loadHubs(), 4242, { player: [] });
  const P = nid(s, 'portugal'), C = nid(s, 'castile'), G = nid(s, 'granada');

  it('a declaration names every attacker and defender, a peace both sides', () => {
    const before = s.chronicle.length;
    expect(declareWar(s, w, G, P, 'conquest')).toBeNull();
    const war = s.wars.find((x) => x.attLead === G && x.defLead === P)!;
    expect(war).toBeTruthy();
    const decl = s.chronicle.slice(before).find((e) => e.kind === 'war')!;
    expect(decl.nation).toBe(G);
    // the defender (the player's realm, attacked) finds the declaration among its own entries
    expect(chronInvolves(decl, P)).toBe(true);
    for (const x of [...war.att, ...war.def]) expect(chronInvolves(decl, x)).toBe(true);
    const mid = s.chronicle.length;
    applyPeace(s, w, war, G, P, [{ type: 'white_peace' } as any]);
    const peace = s.chronicle.slice(mid).find((e) => e.kind === 'peace')!;
    expect(peace.nation).toBe(G);
    expect(chronInvolves(peace, P)).toBe(true);
    expect(chronInvolves(peace, C)).toBe(war.att.includes(C) || war.def.includes(C));
  });

  it('the helper keeps the list short: no duplicates, not the realm itself, no empty list', () => {
    addEntry(s, P, 'alliance', { en: 'x', de: 'x' }, undefined, [P, C, C, -1]);
    expect(s.chronicle[s.chronicle.length - 1].also).toEqual([C]);
    addEntry(s, P, 'reform', { en: 'y', de: 'y' }, undefined, [P]);
    expect('also' in s.chronicle[s.chronicle.length - 1]).toBe(false);
    s.chronicle.splice(-2, 2);
  });

  it('the client keeps the player\'s entries apart from the world-wide cap', () => {
    const me = 7;
    setChronicle([], me);
    const mine: ChronEntry = { day: 1, nation: 3, kind: 'war', text: { en: 'War on us', de: 'Krieg gegen uns' }, also: [me] };
    addChronicle([mine], me);
    // a busy world: 2000 entries of other realms
    for (let k = 0; k < 20; k++) addChronicle(Array.from({ length: 100 }, (_, i) => ({ day: 2 + k, nation: 100 + i, kind: 'event', text: { en: 'e', de: 'e' } })), me);
    expect(chronicle.value.length).toBe(600);
    expect(chronicle.value.includes(mine)).toBe(false);
    expect(ownChronicle.value).toEqual([mine]);
    // a whole chronicle (a loaded game) is split the same way
    setChronicle([mine, { day: 3, nation: me, kind: 'reform', text: { en: 'r', de: 'r' } }, { day: 4, nation: 2, kind: 'reform', text: { en: 'o', de: 'o' } }], me);
    expect(ownChronicle.value.map((e) => e.day)).toEqual([1, 3]);
    expect(chronicle.value.length).toBe(3);
  });
});

describe('fog of war: ledger, chronicle and ranking speak only of realms met', () => {
  const s = createGame(w, loadSetup(1356), loadHubs(), 777, { player: [] });
  const P = nid(s, 'portugal');
  s.playerNations = [P];
  for (let i = 0; i < 3; i++) advanceDay(s, w);
  const sight = sightOf(s, w, P);
  const met = metRealms(s, sight);
  const far = ['mali', 'ethiopia', 'mayapan', 'tupinamba', 'benin'].map((k) => nid(s, k));

  it('Portugal in 1356 has met Castile and France, not Mali, Ethiopia or the realms across the ocean', () => {
    expect(met[P]).toBe(1); expect(met[nid(s, 'castile')]).toBe(1); expect(met[nid(s, 'france')]).toBe(1);
    for (const f of far) expect(met[f], s.nations[f].key).toBe(0);
  });

  it('the ledger lists only realms met, markets whose hub is known, wars of realms met', () => {
    const q = { q: 'ledger' as const, kind: 'nations' as const };
    const all = answer(s, w, P, q); const shown = fogAnswer(s, w, P, q, all);
    expect(shown.length).toBeGreaterThan(5);
    expect(shown.length).toBeLessThan(all.length);
    for (const r of shown) expect(met[r.id]).toBe(1);
    for (const f of far) expect(shown.some((r: any) => r.id === f)).toBe(false);
    const qm = { q: 'ledger' as const, kind: 'markets' as const };
    const mk = fogAnswer(s, w, P, qm, answer(s, w, P, qm));
    expect(mk.length).toBeGreaterThan(0);
    for (const r of mk) expect(sight.known![s.markets[r.id].hub]).toBe(1);
    expect(mk.length).toBeLessThan(s.markets.length);
    const qw = { q: 'ledger' as const, kind: 'wars' as const };
    for (const r of fogAnswer(s, w, P, qw, answer(s, w, P, qw))) expect([...r.att, ...r.def].some((x: number) => met[x] === 1)).toBe(true);
    // the observer still sees the whole world
    expect(fogAnswer(s, w, -1, q, all)).toBe(all);
  });

  it('the chronicle shows world news and realms met; a far realm\'s news only once it names a realm met', () => {
    const mali = nid(s, 'mali'), C = nid(s, 'castile');
    const list: ChronEntry[] = [
      { day: 1, nation: -1, kind: 'situation', text: { en: 'world', de: 'Welt' } },
      { day: 1, nation: mali, kind: 'reform', text: { en: 'far', de: 'fern' } },
      { day: 1, nation: mali, kind: 'alliance', text: { en: 'far with Castile', de: 'fern mit Kastilien' }, also: [C] },
      { day: 1, nation: C, kind: 'reform', text: { en: 'near', de: 'nah' } },
    ];
    expect(fogChronicle(list, met, sight.known).map((e) => e.text.en)).toEqual(['world', 'far with Castile', 'near']);
    // the query (chronicle export) and the tick (new entries) under the same rule
    s.chronicle.push(...list);
    const q = { q: 'chronicle' as const, from: s.chronicle.length - 4 };
    expect(fogAnswer(s, w, P, q, answer(s, w, P, q)).map((e: ChronEntry) => e.text.en)).toEqual(['world', 'far with Castile', 'near']);
    const tick = fogTick(s, { armies: [], battles: [], sieges: [], chronicle: list.slice() }, sight);
    expect(tick.chronicle!.map((e) => e.text.en)).toEqual(['world', 'far with Castile', 'near']);
    s.chronicle.splice(-4, 4);
  });

  it('the great-power ranking leaves out realms not met', () => {
    const q = { q: 'powers' as const };
    const all = answer(s, w, P, q as any);
    const shown = fogAnswer(s, w, P, q, all);
    for (const r of shown.ranking) expect(met[r.id]).toBe(1);
    expect(shown.ranking.length).toBeLessThanOrEqual(all.ranking.length);
  });
});

describe('fog of war online: the day\'s chronicle goes to each session under its own fog', () => {
  it('a seated player does not hear of a far realm, a connection without a realm hears of all', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { WorldCore } = await import('../server/world');
    const dir = mkdtempSync(join(tmpdir(), 'sc-fogchron-'));
    try {
      const core = new WorldCore({ id: 'fogchron', name: 'Fog chronicle', dataDir: dir, secondsPerDay: 0, snapshotEveryDays: 1000, uploadEveryDays: 1000, seed: 99, startYear: 1356, maxPlayers: 4,
        protectionDays: 0, inactiveReleaseMs: 86400_000, offerExpiryHours: 48, cmdsPerDay: 60, admins: [], devAuth: true, log: () => {} }).init();
      const got = (msgs: any[]) => msgs.filter((m) => m.type === 'tick').flatMap((m) => m.view.chronicle ?? []).map((e: ChronEntry) => e.text.en);
      const mk = (uid: string) => { const msgs: any[] = []; const conn = { send: (m: any) => msgs.push(JSON.parse(JSON.stringify(m))), sendBin: () => {}, sendJson: (j: string) => msgs.push(JSON.parse(j)), close: () => {} };
        return { msgs, session: core.attach(conn as any, { uid, name: uid, admin: false }) }; };
      const alice = mk('dev-alice'), guest = mk('dev-guest');
      const P = core.s.nations.find((n) => n.key === 'portugal')!.id, mali = core.s.nations.find((n) => n.key === 'mali')!.id;
      alice.session.handle({ type: 'join', nation: P } as any);
      let injected = false;
      await new Promise<void>((res) => {
        core.onDay = [(d) => {
          if (!injected) { injected = true; core.s.chronicle.push({ day: core.s.day, nation: mali, kind: 'reform', text: { en: 'far news', de: 'ferne Kunde' } }, { day: core.s.day, nation: P, kind: 'reform', text: { en: 'our news', de: 'unsere Kunde' } }); return; }
          if (d >= 3) { core.stop(); res(); }
        }];
        core.start();
      });
      expect(got(alice.msgs)).toContain('our news');
      expect(got(alice.msgs)).not.toContain('far news');
      expect(got(guest.msgs)).toContain('far news');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
