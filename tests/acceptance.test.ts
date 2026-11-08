// Acceptance tests from point 119 that the simulation can answer on its own (no browser, no deployment).
// Each test plays the game through the same commands a player would send. Run: npx vitest run tests/acceptance.test.ts
import { describe, it, expect } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { step, hashState, serialize, deserialize } from '../src/sim/engine';
import { applyCommand } from '../src/sim/commands';
import { hasCasusBelli, nationLocs } from '../src/sim/systems/war';
import { nationPower, neighboursCached } from '../src/sim/systems/ai';
import { findPath, seaNear, newArmy } from '../src/sim/systems/military';
import { allies, hasTreaty, atWar } from '../src/sim/ctx';
import { LAWS, VALUES } from '../src/sim/content/laws';
import { SITUATIONS } from '../src/sim/content/situations';
import { EVENTS } from '../src/sim/content/events';
import { GI, C, CL } from '../src/sim/defs';
import type { Command, GameState, Nation } from '../src/sim/types';

const w = loadWorld();
const game = (year = 1356, seed = 1356, player: number[] = []) => createGame(w, loadSetup(year), loadHubs(), seed, { player });
const nat = (s: GameState, key: string) => s.nations.find((n) => n.key === key)!;
const days = (s: GameState, k: number, cmds: () => Command[] = () => []) => { for (let d = 0; d < k; d++) step(s, w, cmds()); };
const clone = (s: GameState) => deserialize(serialize(s));

describe('acceptance (point 119)', () => {
  it('depth targets: 10,000+ locations, 300+ states, 30+ laws, 8+ value axes, international bodies, 6+ situations, 100+ events', () => {
    const s = game();
    expect(w.L).toBeGreaterThanOrEqual(10000);
    expect(s.nations.filter((n) => n.alive).length).toBeGreaterThanOrEqual(300);
    const lawOptions = LAWS.length;
    expect(lawOptions).toBeGreaterThanOrEqual(30);
    expect(VALUES.length).toBeGreaterThanOrEqual(8);
    expect(s.empire.members.length).toBeGreaterThan(20);
    expect(s.papacy.holder).toBeGreaterThanOrEqual(0);
    expect(SITUATIONS.length).toBeGreaterThanOrEqual(6);
    expect(EVENTS.length).toBeGreaterThanOrEqual(100);
  });

  it('a small state of the Empire wins a war and gains land by treaty within five years', () => {
    // pick a duchy of the Empire with a weaker, unallied neighbour
    const probe = game();
    let pick: { p: number; t: number } | null = null;
    for (const id of probe.empire.members) {
      const p = probe.nations[id]; if (!p.alive || p.overlord >= 0 || p.rank !== 'duchy') continue;
      for (const t of neighboursCached(probe, w, id)) {
        const tn = probe.nations[t];
        if (!tn.alive || tn.overlord >= 0 || allies(probe, t).length || hasTreaty(probe, id, t, 'alliance') || hasTreaty(probe, id, t, 'truce')) continue;
        if (nationPower(probe, id) > nationPower(probe, t) * 1.6 && nationLocs(probe, t).length >= 2) { pick = { p: id, t }; break; }
      }
      if (pick) break;
    }
    expect(pick).not.toBeNull();
    const s = game(1356, 1356, [pick!.p]);
    const P = s.nations[pick!.p], T = s.nations[pick!.t];
    const before = nationLocs(s, P.id).length;
    // justify the war, then fight it the way a player would: march on the nearest enemy towns, then demand them
    if (!hasCasusBelli(s, P.id, T.id)) applyCommand(s, w, { t: 'diplo', n: P.id, action: 'fabricate', target: T.id });
    let gained = false, day = 0;
    for (; day < 365 * 5 && !gained; day++) {
      const cmds: Command[] = [];
      const war = s.wars.find((x) => x.att.includes(P.id) && x.def.includes(T.id));
      if (!war && !hasCasusBelli(s, P.id, T.id) && day % 30 === 0 && !s.spies.some((x) => x.nation === P.id && x.action === 'fabricate')) applyCommand(s, w, { t: 'diplo', n: P.id, action: 'fabricate', target: T.id });
      if (!war && hasCasusBelli(s, P.id, T.id) && !atWar(s, P.id, T.id)) cmds.push({ t: 'declare', n: P.id, target: T.id, goal: 'conquest', locs: nationLocs(s, T.id).slice(0, 3) });
      if (war) {
        const targets = nationLocs(s, T.id).filter((l) => s.loc.ctrl[l] !== P.id);
        for (const a of s.armies) if (a.owner === P.id && !a.fleet && !a.path.length && !a.battle && s.loc.owner[a.loc] !== T.id && targets.length) {
          const to = targets.sort((x, y) => w.distKm(a.loc, x) - w.distKm(a.loc, y))[0];
          if (findPath(s, w, a, a.loc, to, 20000)) cmds.push({ t: 'move', n: P.id, army: a.id, to });
        }
        const occ = nationLocs(s, T.id).filter((l) => s.loc.ctrl[l] === P.id);
        if (occ.length && day % 30 === 0) cmds.push({ t: 'peace', n: P.id, war: war.id, to: war.defLead, terms: [{ type: 'cede', locs: occ.slice(0, 1), to: P.id }] });
      }
      // answer our own events with the first choice, decline foreign proposals
      for (const pe of s.pending.filter((x) => x.nation === P.id)) cmds.push({ t: 'event', n: P.id, pending: pe.id, choice: pe.event.startsWith('diplo_') ? 1 : 0 });
      step(s, w, cmds);
      gained = P.stats.locsGained > 0 && nationLocs(s, P.id).length > before - 1;
    }
    const info = `${P.short.en} vs ${T.short.en}: cb ${hasCasusBelli(s, P.id, T.id)}, wars ${s.wars.filter((x) => x.att.includes(P.id) || x.def.includes(P.id)).map((x) => `${x.name.en} score ${x.score.toFixed(0)}`).join('; ')}, overlord ${P.overlord}, armies ${s.armies.filter((a) => a.owner === P.id).length}`;
    expect(gained, info).toBe(true);
    expect(day).toBeLessThan(365 * 5); // at the fastest speed (1000 days/s) or 20 days/s this is well inside 30 minutes
  }, 300_000);

  it('aggressive expansion makes a Common Front form and declare war', () => {
    const s = game();
    const agg = nat(s, 'hungary');
    agg.dread = 90;
    let declared = false;
    for (let m = 0; m < 36 && !declared; m++) { days(s, 30); agg.dread = Math.max(agg.dread, 80); declared = s.wars.some((x) => x.goal.type === 'coalition' && x.goal.target === agg.id); }
    expect((agg.flags.front ?? 0)).toBeGreaterThanOrEqual(3);
    expect(declared).toBe(true);
  }, 300_000);

  it('a ruler dies, the heir takes over, and a disputed succession can lead to a civil war', () => {
    const s = game();
    const n = nat(s, 'france');
    const old = n.ruler, heir = n.heir;
    s.chars[old].health = 0; s.chars[old].born = s.day - 95 * 365; // very old and frail
    let d = 0; while (n.ruler === old && d++ < 3650) step(s, w, []);
    expect(n.ruler).not.toBe(old);
    if (heir && s.chars[heir]?.alive) expect(n.ruler).toBe(heir);
    // a disputed succession: the pending civil war breaks out a month later
    const civil = clone(s); const cn = nat(civil, 'france');
    civil.flags[`civil_war_pending_${cn.id}`] = civil.day + 1;
    days(civil, 40);
    const cw = civil.wars.find((x) => x.goal.type === 'civil_war' && x.goal.target === cn.id);
    expect(cw).toBeDefined();
    expect(civil.nations[cw!.attLead].flags.pretender_of).toBe(cn.id);
  }, 300_000);

  it('events fire with choices that change the game state', () => {
    const s = game(1356, 77, [nat(game(), 'england').id]);
    const pid = s.playerNations[0];
    let d = 0; while (!s.pending.some((p) => p.nation === pid && !p.event.startsWith('diplo_')) && d++ < 3650) step(s, w, []);
    const pe = s.pending.find((p) => p.nation === pid && !p.event.startsWith('diplo_'));
    expect(pe).toBeDefined();
    const a = clone(s), b = clone(s);
    const ra = applyCommand(a, w, { t: 'event', n: pid, pending: pe!.id, choice: 0 });
    const ev = EVENTS.find((e) => e.id === pe!.event)!;
    const rb = applyCommand(b, w, { t: 'event', n: pid, pending: pe!.id, choice: ev.options.length > 1 ? 1 : 0 });
    expect(ra.ok).toBe(true); expect(rb.ok).toBe(true);
    // the choice changes the state compared with not answering, and different choices lead to different states
    expect(hashState(a)).not.toBe(hashState(clone(s)));
    if (ev.options.length > 1) expect(hashState(a)).not.toBe(hashState(b));
  }, 300_000);

  it('a harvest failure raises prices, lowers living standards, spreads to trade partners and stirs unrest', () => {
    const s = game(); days(s, 200);
    // the market of Paris and its trade partners
    const paris = w.names.indexOf('Paris');
    const m = s.loc.market[paris];
    const base = clone(s);
    const locsOf = (st: GameState) => { const r: number[] = []; for (let i = 0; i < w.L; i++) if (st.loc.market[i] === m) r.push(i); return r; };
    const fail = (st: GameState) => { for (const i of locsOf(st)) st.loc.harvest[i] = 0.3; };
    const ref = clone(base);
    for (let k = 0; k < 200; k++) { fail(base); step(base, w, []); step(ref, w, []); }
    const g = GI.grain;
    expect(base.markets[m].price[g]).toBeGreaterThan(ref.markets[m].price[g] * 1.05);
    const avg = (st: GameState, f: (i: number) => number) => { const ls = locsOf(st); return ls.reduce((p, i) => p + f(i), 0) / ls.length; };
    expect(avg(base, (i) => base.loc.sol[i * C + CL.peasants])).toBeLessThan(avg(ref, (i) => ref.loc.sol[i * C + CL.peasants]));
    expect(avg(base, (i) => base.loc.unrest[i])).toBeGreaterThan(avg(ref, (i) => ref.loc.unrest[i]));
    // a neighbouring market through trade
    const partners = new Set<number>();
    for (const l of base.markets[m].links) if (!l.ocean) partners.add(l.to);
    const spread = [...partners].some((p) => base.markets[p] && base.markets[p].price[g] > ref.markets[p].price[g] * 1.01);
    expect(spread).toBe(true);
  }, 300_000);

  it('the player can reach the Americas by sea and found a colony that grows', () => {
    const s = game(1492, 1492);
    const P = nat(s, 'portugal'); s.playerNations = [P.id];
    P.treasury += 2000; P.tech[1] = Math.max(P.tech[1], 12);
    const f = newArmy(s, P.id, seaNear(w, P.capital), [{ type: 13, men: 4 }], true);
    // sail west toward the Caribbean
    let tgt = -1, bd = Infinity; for (let i = w.L; i < w.N; i++) { const d = Math.abs(w.lon[i] + 62) + Math.abs(w.lat[i] - 17); if (d < bd) { bd = d; tgt = i; } }
    expect(applyCommand(s, w, { t: 'explore', n: P.id, fleet: f.id, to: tgt }).ok).toBe(true);
    let d = 0; while (f.path.length && d++ < 400) step(s, w, []);
    expect(w.lon[f.loc]).toBeLessThan(-40);
    // pick an empty coastal place in the Americas within reach and send settlers
    let colonised = -1;
    for (let i = 0; i < w.L && colonised < 0; i++) if (w.lon[i] < -55 && w.coastal[i] && s.loc.owner[i] < 0 && applyCommand(s, w, { t: 'colonize', n: P.id, loc: i }).ok) colonised = i;
    expect(colonised).toBeGreaterThanOrEqual(0);
    const pop = (i: number) => { let p = 0; for (let c = 0; c < C; c++) p += s.loc.pop[i * C + c]; return p; };
    let dd = 0; while (s.loc.owner[colonised] !== P.id && dd++ < 365 * 15) step(s, w, []);
    expect(s.loc.owner[colonised]).toBe(P.id);
    const p0 = pop(colonised); days(s, 365 * 3);
    expect(pop(colonised)).toBeGreaterThan(p0);
  }, 300_000);

  it('same seed and same commands give an identical state hash (10 years here; 50 in the slow suite)', () => {
    const years = +(process.env.ACCEPT_YEARS ?? 10);
    const run = () => { const s = game(1356, 99, [nat(game(), 'bohemia').id]); const pid = s.playerNations[0];
      for (let d = 0; d < 365 * years; d++) step(s, w, d % 97 === 0 ? [{ t: 'tax', n: pid, cls: 0, rate: 0.08 } as any] : []); return hashState(s); };
    expect(run()).toBe(run());
  }, 900_000);

  it('a modified client cannot act for another realm or send impossible commands', () => {
    const s = game(1356, 1356, [nat(game(), 'bohemia').id]);
    const pid = s.playerNations[0], other = nat(s, 'france').id;
    const foreignArmy = s.armies.find((a) => a.owner === other)!;
    const bad: Command[] = [
      { t: 'recruit', n: pid, loc: nat(s, 'france').capital, unit: 0, men: 1000 },
      { t: 'move', n: pid, army: foreignArmy.id, to: nat(s, 'bohemia').capital },
      { t: 'build', n: pid, loc: nat(s, 'france').capital, building: 0 } as any,
      { t: 'peace', n: pid, war: 999999, to: other, terms: [] },
    ];
    for (const c of bad) expect(applyCommand(s, w, c).ok).toBe(false);
  });
});

void ({} as Nation);
