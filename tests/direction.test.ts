// Player direction and scale: event option effects from a dry run (state and rng untouched), batch orders that cost
// exactly what the single orders cost, cancelling with refunds, claiming goals, the building and levy overviews, and
// German text for every refusal the simulation can give.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { advanceDay, serialize, deserialize, hashState } from '../src/sim/engine';
import { applyCommand, buildCost, BATCH_MAX } from '../src/sim/commands';
import { fireEvent } from '../src/sim/systems/events';
import { EVENTS } from '../src/sim/content/events';
import { eventOptionFx, eventOptionFxCached } from '../src/game/eventfx';
import { buildSpots, buildingGain } from '../src/sim/systems/planning';
import { claimGoal, goalsFor } from '../src/sim/systems/goals';
import { worksView, scopeView } from '../src/game/worksview';
import { answer } from '../src/game/view';
import { hasRefusalText, refusal } from '../src/sim/refusals';
import { BI, B, UNITS } from '../src/sim/defs';
import type { Command, GameState } from '../src/sim/types';

vi.setConfig({ testTimeout: 120_000 });
const w = loadWorld();
const setup = loadSetup(1356), hubs = loadHubs();
const newGame = () => createGame(w, setup, hubs, 4242, { player: [] });
const days = (s: GameState, n: number) => { for (let i = 0; i < n; i++) advanceDay(s, w); };
const copy = (s: GameState) => deserialize(serialize(s));
const nid = (s: GameState, key: string) => s.nations.find((n) => n.key === key)!.id;

describe('event option effects (dry run)', () => {
  const s = newGame(); days(s, 40);
  it('leaves state and rng untouched and describes nearly every option', () => {
    const keys = ['france', 'castile', 'ottomans', 'england'];
    let opts = 0, empty = 0, fired = 0;
    for (const d of EVENTS) {
      for (const key of keys) {
        const n = s.nations.find((x) => x.key === key); if (!n) continue;
        s.playerNations = [n.id];
        let ok = false; try { ok = fireEvent(s, w, n, d, {}); } catch { ok = false; }
        if (!ok) continue;
        const p = s.pending[s.pending.length - 1];
        const h = hashState(s), rng = JSON.stringify(s.rng);
        const fx = eventOptionFx(s, w, n.id, p.id)!;
        expect(hashState(s)).toBe(h);
        expect(JSON.stringify(s.rng)).toBe(rng);
        expect(fx.length).toBe(d.options.length);
        for (const o of fx) { opts++; if (!o.lines.length) empty++; }
        // cached per pending event and day: the same answer without another dry run
        expect(eventOptionFxCached(s, w, n.id, p.id)).toBe(eventOptionFxCached(s, w, n.id, p.id));
        s.pending.pop(); fired++;
        break;
      }
    }
    expect(fired).toBeGreaterThan(EVENTS.length * 0.8);
    expect(empty).toBeLessThanOrEqual(opts * 0.05);
  }, 120_000);
});

describe('batch orders', () => {
  const base = newGame(); days(base, 35);
  const pid = nid(base, 'castile');

  it('cost exactly what the single orders cost', () => {
    const a = copy(base), b = copy(base);
    for (const s of [a, b]) s.nations[pid].treasury = 4000;
    const spots = buildSpots(a, w, a.nations[pid], BI.farm).slice(0, 6);
    const more = buildSpots(a, w, a.nations[pid], BI.market).slice(0, 4);
    expect(spots.length).toBeGreaterThan(2);
    const cmds: Command[] = [...spots.map((x) => ({ t: 'build', n: pid, loc: x.loc, building: BI.farm }) as Command), ...more.map((x) => ({ t: 'build', n: pid, loc: x.loc, building: BI.market }) as Command)];
    // the same place twice: the second level costs more, and the two-works limit holds inside a batch too
    cmds.push({ t: 'build', n: pid, loc: spots[0].loc, building: BI.farm }, { t: 'build', n: pid, loc: spots[0].loc, building: BI.farm });
    const before = a.constructions.length;
    const single = cmds.map((c) => applyCommand(a, w, c));
    const r = applyCommand(b, w, { t: 'batch', n: pid, cmds });
    expect(r.ok).toBe(true);
    expect(r.done).toBe(single.filter((x) => x.ok).length);
    expect(b.nations[pid].treasury).toBeCloseTo(a.nations[pid].treasury, 9);
    expect(b.constructions).toEqual(a.constructions);
    expect(hashState(b)).toBe(hashState(a));
    // the price each place paid is the price buildSpots showed
    for (const x of spots) {
      const c = b.constructions.slice(before).find((k) => k.loc === x.loc && k.building === BI.farm)!;
      expect(c.cost).toBeCloseTo(x.cost, 9);
    }
  });

  it('stop paying when the gold runs out and name the refusal', () => {
    const s = copy(base); const n = s.nations[pid];
    const spots = buildSpots(s, w, n, BI.farm);
    n.treasury = spots[0].cost + 0.5;
    const r = applyCommand(s, w, { t: 'batch', n: pid, cmds: spots.slice(0, 5).map((x) => ({ t: 'build', n: pid, loc: x.loc, building: BI.farm }) as Command) });
    expect(r.ok).toBe(true); expect(r.done).toBe(1); expect(r.err).toBe('not enough gold');
    expect(n.treasury).toBeCloseTo(0.5, 9);
  });

  it('are validated like single orders', () => {
    const s = copy(base); const other = nid(s, 'france');
    const h = hashState(s);
    expect(applyCommand(s, w, { t: 'batch', n: pid, cmds: [] })).toEqual({ ok: false, err: 'nothing to do' });
    expect(applyCommand(s, w, { t: 'batch', n: pid, cmds: Array.from({ length: BATCH_MAX + 1 }, () => ({ t: 'build', n: pid, loc: 0, building: 0 }) as Command) })).toEqual({ ok: false, err: 'too many orders at once' });
    expect(applyCommand(s, w, { t: 'batch', n: pid, cmds: [{ t: 'batch', n: pid, cmds: [] } as Command] })).toEqual({ ok: false, err: 'not this kind of order' });
    expect(applyCommand(s, w, { t: 'batch', n: pid, cmds: [{ t: 'speed', n: pid } as any] }).ok).toBe(false);
    // orders for another realm's land are refused: the batch's realm is forced on every order
    const theirs = s.nations[other].capital;
    expect(applyCommand(s, w, { t: 'batch', n: pid, cmds: [{ t: 'build', n: other, loc: theirs, building: BI.farm }] })).toEqual({ ok: false, err: 'not your location' });
    expect(hashState(s)).toBe(h);
  });

  it('cancel with refunds: half of the unbuilt part, half the levy price and the men', () => {
    const s = copy(base); const n = s.nations[pid];
    n.treasury = 5000;
    const sp = buildSpots(s, w, n, BI.workshop)[0] ?? buildSpots(s, w, n, BI.farm)[0];
    const b = s.constructions.length;
    const kind = buildSpots(s, w, n, BI.workshop)[0] ? BI.workshop : BI.farm;
    expect(applyCommand(s, w, { t: 'build', n: pid, loc: sp.loc, building: kind }).ok).toBe(true);
    const t0 = n.treasury;
    expect(applyCommand(s, w, { t: 'cancel', n: pid, kind: 'build', loc: sp.loc, item: kind }).ok).toBe(true);
    expect(s.constructions.length).toBe(b);
    expect(n.treasury - t0).toBeCloseTo(sp.cost * 0.5, 6);
    expect(applyCommand(s, w, { t: 'cancel', n: pid, kind: 'build', loc: sp.loc, item: kind })).toEqual({ ok: false, err: 'nothing under way' });

    const unit = UNITS.findIndex((u) => u.kind !== 'ship');
    n.manpower = 5000;
    const r = applyCommand(s, w, { t: 'recruit', n: pid, loc: n.capital, unit, men: 1000 });
    expect(r.ok).toBe(true);
    const t1 = n.treasury, m1 = n.manpower;
    expect(applyCommand(s, w, { t: 'cancel', n: pid, kind: 'recruit', loc: n.capital, item: unit }).ok).toBe(true);
    expect(n.treasury).toBeGreaterThan(t1);
    expect(n.manpower).toBe(Math.min(n.maxManpower, m1 + 1000));
  });

  it('replay the same with batch, recruit and cancel orders after a save', () => {
    const a = copy(base), b = copy(base);
    const run = (s: GameState) => {
      const n = s.nations[pid]; n.treasury = 3000; n.manpower = 9000; s.playerNations = [pid];
      const locs = buildSpots(s, w, n, BI.farm).slice(0, 4).map((x) => x.loc);
      applyCommand(s, w, { t: 'batch', n: pid, cmds: locs.map((loc) => ({ t: 'build', n: pid, loc, building: BI.farm }) as Command) });
      applyCommand(s, w, { t: 'batch', n: pid, cmds: [{ t: 'recruit', n: pid, loc: n.capital, unit: 0, men: 1000 }, { t: 'recruit', n: pid, loc: n.capital, unit: 0, men: 1000 }] });
      days(s, 10);
      applyCommand(s, w, { t: 'cancel', n: pid, kind: 'build', loc: locs[0], item: BI.farm });
      days(s, 20);
    };
    run(a); const mid = copy(b); run(mid); run(b);
    expect(hashState(a)).toBe(hashState(b));
    expect(hashState(mid)).toBe(hashState(b));
  });
});

describe('building and levy overview', () => {
  const s = newGame(); days(s, 70);
  const pid = nid(s, 'france'); s.playerNations = [pid];
  const n = s.nations[pid];

  it('lists every building type with its places, prices and an estimated yield', () => {
    const h = hashState(s);
    const v = worksView(s, w, pid)!;
    expect(hashState(s)).toBe(h);
    expect(v.types.length).toBeGreaterThan(8);
    const farm = v.types.find((x) => x.key === 'farm')!;
    expect(farm.spots.length).toBeGreaterThan(0);
    for (const [loc, level, cost] of farm.spots.slice(0, 10)) expect(cost).toBeCloseTo(buildCost(s, n, BI.farm, level), 0);
    // farms and markets bring in gold where land is worked; forts and roads have another use
    expect(v.types.some((x) => x.spots.some((sp) => sp[3] > 0))).toBe(true);
    expect(v.types.find((x) => x.key === 'fort')!.other).not.toBeNull();
    expect(v.levy.length).toBeGreaterThan(5);
    expect(v.levy[0][1]).toBeGreaterThanOrEqual(v.levy[v.levy.length - 1][1]);
    expect(v.units.length).toBeGreaterThan(0);
    // the estimate is made of the crown's share of each class's extra income
    const best = farm.spots.reduce((p, x) => (x[3] > p[3] ? x : p));
    const g = buildingGain(s, w, n, best[0], BI.farm);
    expect(g.parts.reduce((p, [, x]) => p + x, 0)).toBeCloseTo(g.gold, 9);
    expect(answer(s, w, pid, { q: 'gain', loc: best[0], building: BI.farm }).cost).toBeGreaterThan(0);
    // provinces and areas of any places (the grouped peace demands); bad ids are skipped
    const pl = answer(s, w, pid, { q: 'places', locs: [n.capital, -5, w.L + 3] });
    expect(pl.rows).toEqual([[n.capital, w.provOf[n.capital], expect.any(Number)]]);
    expect(typeof pl.provs[w.provOf[n.capital]]).toBe('string');
  });

  it('gives the orders for a province and an area', () => {
    const p = scopeView(s, w, pid, n.capital, 'province')!, a = scopeView(s, w, pid, n.capital, 'area')!;
    expect(p.mine).toBeGreaterThan(0);
    expect(a.total).toBeGreaterThanOrEqual(p.total);
    for (const x of p.types) for (const [loc] of x.spots) expect(s.loc.owner[loc]).toBe(pid);
    expect(a.agents.map((x) => x.kind)).toEqual(['faith', 'culture']);
    // a province order built as one batch costs the sum of the prices shown
    const c = copy(s); c.nations[pid].treasury = 1e6;
    const x = p.types[0];
    const t0 = c.nations[pid].treasury;
    const r = applyCommand(c, w, { t: 'batch', n: pid, cmds: x.spots.map(([loc]) => ({ t: 'build', n: pid, loc, building: x.id }) as Command) });
    expect(r.done).toBe(x.spots.length);
    expect(t0 - c.nations[pid].treasury).toBeCloseTo(x.spots.reduce((q, sp) => q + sp[2], 0), -1);
    expect(c.constructions.filter((k) => k.nation === pid && k.building === x.id).length).toBeGreaterThanOrEqual(x.spots.length);
    void B;
  });
});

describe('goals', () => {
  const s = newGame(); days(s, 100);
  const pid = nid(s, 'france'); const n = s.nations[pid];
  it('are claimed only when open and met', () => {
    expect(claimGoal(s, w, n, 'nonsense')).toBe('no such goal');
    const gs = goalsFor(n);
    const later = gs.find((g) => g.req?.length && g.req.some((r) => !(n.goalsDone ?? []).includes(r)));
    if (later) expect(claimGoal(s, w, n, later.id)).toBe('earlier goals come first');
    const done = (n.goalsDone ?? [])[0];
    if (done) expect(claimGoal(s, w, n, done)).toBe('already achieved');
    const h = hashState(s);
    const open = gs.find((g) => !(n.goalsDone ?? []).includes(g.id) && !(g.req ?? []).some((r) => !(n.goalsDone ?? []).includes(r)));
    if (open) {
      const why = claimGoal(s, w, n, open.id);
      if (why) { expect(why).toBe('the conditions are not met'); expect(hashState(s)).toBe(h); }
      else expect(n.goalsDone).toContain(open.id);
    }
    const view = answer(s, w, pid, { q: 'goals', nation: pid });
    expect(view.length).toBe(gs.length);
    expect(view.some((g: any) => g.conds.some((c: any) => c.max !== undefined))).toBe(true);
  });
});

describe('refusals', () => {
  it('every refusal the simulation gives has German text', () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p); } };
    walk('src/sim');
    const found = new Map<string, string>();
    for (const f of files) {
      const t = readFileSync(f, 'utf8');
      for (const m of t.matchAll(/err\('([^']+)'\)/g)) found.set(m[1], f);
    }
    for (const f of ['src/sim/commands.ts', 'src/sim/systems/military.ts', 'src/sim/systems/society.ts', 'src/sim/systems/goals.ts', 'src/sim/content/decisions.ts']) {
      const t = readFileSync(f, 'utf8');
      for (const m of t.matchAll(/return '([^']+ [^']+)'/g)) found.set(m[1], f);
    }
    // and the world server's
    for (const m of readFileSync('server/world.ts', 'utf8').matchAll(/res: \{ ok: false, err: '([^']+)' \}/g)) found.set(m[1], 'server/world.ts');
    const missing = [...found].filter(([k]) => !hasRefusalText(k));
    expect(missing).toEqual([]);
    expect(refusal('not enough gold').de).toBe('Nicht genug Gold');
    expect(refusal('need 20 Authority').de).toMatch(/20/);
  });
});
