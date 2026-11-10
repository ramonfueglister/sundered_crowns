// Spec point 99 (plausible history without scripted outcomes): the rules that let a principality gather its people and
// let the steppe khanates decline. Run: npx vitest run tests/history.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { serialize, deserialize } from '../src/sim/engine';
import { mkCtx } from '../src/sim/ctx';
import { war, casusBelliAll, declareWar, evaluatePeace, concludePeace, nationLocs } from '../src/sim/systems/war';
import { politics } from '../src/sim/systems/politics';
import { military, newArmy } from '../src/sim/systems/military';
import { SITUATIONS } from '../src/sim/content/situations';
import { siegeTrain } from '../src/sim/systems/ai';
import { UNITS, B, BI } from '../src/sim/defs';
import { bump, DAY_EPOCH } from '../src/sim/ctx';
import { seedRng } from '../src/sim/rng';
import { realm } from '../src/sim/systems/realm';
import { libertyParts, evaluateProposal } from '../src/sim/systems/diplomacy';
import type { GameState } from '../src/sim/types';

const w = loadWorld();
let BASE = '';
beforeAll(() => { BASE = serialize(createGame(w, loadSetup(1356), loadHubs(), 1356, { player: [] })); });
const fresh = () => deserialize(BASE) as GameState;
const nat = (s: GameState, key: string) => s.nations.find((n) => n.key === key)!;
/** Caches of owners and law effects are kept per day: start a new "day" after changing the world by hand. */
const touch = () => { DAY_EPOCH.v++; bump(); };

describe('history mechanics (point 99)', () => {
  it('only a leading crown gathers its people, and the claim runs one way', () => {
    const s = fresh(); const ctx = mkCtx(s, w);
    for (let k = 0; k < 25; k++) war.yearly!(ctx);
    const claims = Object.keys(s.flags).filter((k) => k.startsWith('gather_') && s.flags[k] > s.day).map((k) => k.split('_').slice(1).map(Number));
    expect(claims.length).toBeGreaterThan(0);
    for (const [a, b] of claims) {
      const A = s.nations[a], Bn = s.nations[b];
      expect(A.gov.includes('republic') || A.gov === 'theocracy' || A.gov === 'nomadic_horde', A.key).toBe(false);
      expect(A.culture).toBe(Bn.culture);
      expect(casusBelliAll(s, a, b)).toContain('gathering');
      expect(casusBelliAll(s, b, a)).not.toContain('gathering');
      // the small neighbour is more willing to submit to the gathering crown
      expect(evaluateProposal(s, w, a, b, 'vassalize').reasons.some(([k]) => k === 'senior_prince')).toBe(true);
    }
    expect(claims.some(([a]) => s.nations[a].key === 'novgorod')).toBe(false); // a city republic does not gather
    expect(claims.some(([a, b]) => s.nations[a].key === 'castile' && s.nations[b].key === 'portugal')).toBe(false); // another people
    expect(claims.some(([a]) => s.nations[a].key === 'moscow')).toBe(true);
  });

  it('the khan keeps the peace among his tributaries, except for the crown gathering its kin', () => {
    const s = fresh();
    const h = nat(s, 'golden_horde'), m = nat(s, 'moscow'), nov = nat(s, 'novgorod'), tv = nat(s, 'tver');
    expect(nov.overlord).toBe(h.id); expect(tv.overlord).toBe(h.id);
    s.wars = []; s.treaties = s.treaties.filter((t) => t.type !== 'truce');
    expect(declareWar(s, w, nov.id, m.id, 'conquest')).toBe('the overlord forbids war among his tributaries');
    expect(declareWar(s, w, tv.id, m.id, 'conquest')).toBe('the overlord forbids war among his tributaries');
    s.flags[`gather_${m.id}_${tv.id}`] = s.day + 365;
    expect(declareWar(s, w, m.id, tv.id, 'conquest')).toBe(null);
  });

  it('a host before the walls of the town it went to war for refuses a white peace; a worn-out ally stays home', () => {
    const s = fresh();
    const o = nat(s, 'ottoman'), b = nat(s, 'byzantium'), x = nat(s, 'karaman');
    const city = w.names.indexOf('Constantinople');
    s.wars = []; s.treaties = s.treaties.filter((t) => t.type !== 'truce' && !(t.type === 'alliance' && (t.a === x.id || t.b === x.id)));
    s.treaties.push({ a: Math.min(o.id, x.id), b: Math.max(o.id, x.id), type: 'alliance', since: s.day, until: s.day + 365 * 20 });
    x.warExhaustion = 80;
    expect(declareWar(s, w, o.id, b.id, 'conquest', [city])).toBe(null);
    const wr = s.wars[s.wars.length - 1];
    expect(wr.att).not.toContain(x.id); // the exhausted ally does not answer the call
    o.warExhaustion = 20;
    const before = evaluatePeace(s, wr, b.id, o.id, []);
    expect(before.veto).not.toBe('siege_under_way');
    s.sieges.push({ loc: city, nation: o.id, progress: 1, days: 60, garrison: 1000, breach: 0, blockade: false, log: [] });
    const during = evaluatePeace(s, wr, b.id, o.id, []);
    expect(during.veto).toBe('siege_under_way');
    expect(during.accept).toBe(false);
    // worn out, the sultan takes the white peace after all
    o.warExhaustion = 70;
    expect(evaluatePeace(s, wr, b.id, o.id, []).veto).not.toBe('siege_under_way');
  });

  it('the steppe order fades as the settled neighbours cast great guns: the horde weakens, its tributaries strain', () => {
    const s = fresh(); const ctx = mkCtx(s, w);
    const h = nat(s, 'golden_horde'), m = nat(s, 'moscow');
    const look = () => ({ mod: h.modifiers.find((x) => x.id === 'steppe_fading'), liberty: libertyParts(s, w, m, h).find(([k]) => k === 'steppe_fading')![1] });
    realm.yearly!(ctx);
    const early = look();
    expect(early.mod).toBeUndefined();
    expect(early.liberty).toBe(0);
    // every settled realm casts great guns now (its warfare has advanced far enough): the horde's riders are outmatched
    for (const n of s.nations) if (n.gov !== 'nomadic_horde') n.tech[2] = 7;
    realm.yearly!(ctx);
    const late = look();
    expect(m.overlord).toBe(h.id);
    expect(late.mod!.effects.tax).toBeLessThan(0);
    expect(late.liberty).toBeGreaterThan(20);
    expect(h.flags.steppe_fade).toBeCloseTo(1, 5);
  });

  it('a great horde whose order has faded sheds its far lands as a khanate when they are restless, not when quiet', () => {
    const run = (unrest: number, years: number) => {
      const s = fresh(); const ctx = mkCtx(s, w);
      const h = nat(s, 'golden_horde');
      s.wars = s.wars.filter((x) => !x.att.includes(h.id) && !x.def.includes(h.id));
      for (const n of s.nations) if (n.gov !== 'nomadic_horde') n.tech[2] = 7;
      const count = () => { let k = 0; for (let i = 0; i < w.L; i++) if (s.loc.owner[i] === h.id) k++; return k; };
      const n0 = s.nations.length, l0 = count();
      for (let k = 0; k < years && s.nations.length === n0; k++) {
        for (let i = 0; i < w.L; i++) if (s.loc.owner[i] === h.id) s.loc.unrest[i] = unrest;
        realm.yearly!(ctx);
      }
      return { s, h, nn: s.nations.find((x) => x.flags.horde_successor && x.alive), lost: l0 - count() };
    };
    const quiet = run(5, 30);
    expect(quiet.nn).toBeUndefined();
    const restless = run(40, 60);
    expect(restless.nn).toBeDefined();
    expect(restless.nn!.gov).toBe('nomadic_horde');
    expect(restless.lost).toBeGreaterThanOrEqual(15);
    expect(restless.nn!.rivals).toContain(restless.h.id);
  });

  it('a war goal must fit its cause; the short truce follows the land fought for, not the name of the war', () => {
    const s = fresh();
    const c = nat(s, 'castile'), a = nat(s, 'aragon'), gr = nat(s, 'granada');
    const clear = () => { s.wars = []; s.treaties = s.treaties.filter((t) => t.type !== 'truce' && t.type !== 'alliance'); };
    clear();
    for (const l of nationLocs(s, a.id)) expect(s.loc.core[l]).not.toBe(c.id);
    expect(declareWar(s, w, c.id, a.id, 'reconquest')).toBe('no land of ours to win back');
    expect(declareWar(s, w, c.id, a.id, 'faith')).toBe('they share our faith');
    expect(declareWar(s, w, c.id, a.id, 'reconquest', [nationLocs(s, a.id)[0]])).toBe('no land of ours to win back');
    // one of Aragon's towns is Castilian land: a war of reconquest for it is allowed, and the town is its goal
    const town = nationLocs(s, a.id).find((l) => l !== a.capital)!;
    s.loc.core[town] = c.id;
    expect(declareWar(s, w, c.id, a.id, 'reconquest')).toBe(null);
    let wr = s.wars[s.wars.length - 1];
    expect(wr.goal.locs).toEqual([town]);
    concludePeace(s, w, wr, a.id, c.id, []);
    const truce = (x: number, y: number) => s.treaties.find((t) => t.type === 'truce' && t.a === Math.min(x, y) && t.b === Math.max(x, y))!;
    expect(Math.round((truce(c.id, a.id).until - s.day) / 365)).toBe(2);
    // a holy war against the emirate is allowed (another faith), but its truce is the usual five years
    clear();
    // (fix-war: named towns must lie in the land the goal covers; the capital of the emirate is no holy land of ours)
    expect(declareWar(s, w, c.id, gr.id, 'faith', [gr.capital])).toBe('a town beyond what this war is fought for');
    expect(declareWar(s, w, c.id, gr.id, 'faith')).toBe(null);
    wr = s.wars[s.wars.length - 1];
    concludePeace(s, w, wr, gr.id, c.id, []);
    expect(Math.round((truce(c.id, gr.id).until - s.day) / 365)).toBe(5);
  });

  it('an ally tires slowly in a long war without battles, and recovers only in peace', () => {
    const s = fresh(); const ctx = mkCtx(s, w);
    const o = nat(s, 'ottoman'), b = nat(s, 'byzantium'), x = nat(s, 'karaman');
    s.wars = []; s.treaties = s.treaties.filter((t) => t.type !== 'truce');
    expect(declareWar(s, w, o.id, b.id, 'conquest')).toBe(null);
    const wr = s.wars[s.wars.length - 1];
    if (!wr.att.includes(x.id)) wr.att.push(x.id);
    wr.def = wr.def.filter((y) => y !== x.id);
    s.armies = s.armies.filter((a) => a.owner !== o.id && a.owner !== b.id && a.owner !== x.id);
    o.warExhaustion = 30; x.warExhaustion = 30;
    const calm = nat(s, 'portugal'); s.wars = s.wars.filter((y) => y === wr || (!y.att.includes(calm.id) && !y.def.includes(calm.id))); calm.warExhaustion = 30;
    for (let k = 0; k < 24; k++) { war.monthly!(ctx); politics.monthly!(ctx); }
    expect(s.wars).toContain(wr);
    expect(x.warExhaustion).toBeGreaterThan(30); // the ally, called in, tires more slowly than the leader ...
    expect(x.warExhaustion).toBeLessThan(o.warExhaustion); // ... but it does tire
    expect(calm.warExhaustion).toBeLessThan(30); // a realm at peace recovers
  });

  it('the war for Granada leaves the emirate\'s treaties alone; its far allies refuse only the call to that war', () => {
    const s = fresh();
    const c = nat(s, 'castile'), mar = nat(s, 'marinid');
    const city = w.names.indexOf('Granada');
    s.loc.owner[city] = mar.id; s.loc.ctrl[city] = mar.id; touch();
    s.wars = []; s.treaties = s.treaties.filter((t) => t.type !== 'truce');
    for (const e of c.estates) e.contentment = 80;
    c.warExhaustion = 0;
    const far = ['mali', 'hafsid_tunis', 'aragon', 'mamluk'].map((k) => nat(s, k).id);
    for (const f of far) if (!s.treaties.some((t) => t.type === 'alliance' && ((t.a === f && t.b === mar.id) || (t.b === f && t.a === mar.id)))) s.treaties.push({ a: Math.min(f, mar.id), b: Math.max(f, mar.id), type: 'alliance', since: s.day, until: s.day + 365 * 20 });
    const sit = s.situations.find((x) => x.id === 'reconquista')!;
    const def = SITUATIONS.find((d) => d.id === 'reconquista')!;
    sit.stage = 1;
    def.monthly(s, w, sit, 1445, 5);
    expect(sit.data.err).toBeUndefined();
    expect(sit.data.g).toBe(mar.id);
    for (const f of far) expect(s.treaties.some((t) => t.type === 'alliance' && ((t.a === f && t.b === mar.id) || (t.b === f && t.a === mar.id))), s.nations[f].key).toBe(true);
    const wr = s.wars.find((x) => x.attLead === sit.data.champion && x.defLead === mar.id)!;
    expect(wr).toBeDefined();
    expect(wr.goal.type).toBe('faith');
    expect(wr.goal.locs).toContain(city);
    for (const f of far) expect(wr.def).not.toContain(f);
    // the champion's host is called to the walls of the city while the war for it lasts, and released after
    const champ = s.nations[sit.data.champion];
    def.monthly(s, w, sit, 1445, 6);
    expect(champ.flags.siege_focus).toBe(city);
    s.wars = s.wars.filter((x) => x !== wr);
    def.monthly(s, w, sit, 1445, 7);
    expect(champ.flags.siege_focus).toBeUndefined();
    // the situation runs out: no call to the walls is left behind
    s.wars.push(wr); def.monthly(s, w, sit, 1445, 8);
    expect(champ.flags.siege_focus).toBe(city);
    def.monthly(s, w, sit, 1520, 5);
    expect(sit.active).toBe(false);
    expect(champ.flags.siege_focus).toBeUndefined();
    expect(champ.modifiers.some((x) => x.id === 'war_for_granada')).toBe(false);
  });

  it('a realm that leads a war for fortified towns raises a siege train', () => {
    const s = fresh();
    const o = nat(s, 'ottoman'), b = nat(s, 'byzantium');
    const city = w.names.indexOf('Constantinople');
    s.wars = []; s.treaties = s.treaties.filter((t) => t.type !== 'truce');
    const guns = () => s.recruits.filter((r) => r.nation === o.id && UNITS[r.type].kind === 'art').reduce((p, r) => p + r.men, 0);
    o.treasury = 20000; o.manpower = 20000;
    siegeTrain(s, w, o);
    expect(guns()).toBe(0); // no war, no guns
    expect(declareWar(s, w, o.id, b.id, 'conquest', [city])).toBe(null);
    siegeTrain(s, w, o);
    expect(guns()).toBeGreaterThanOrEqual(250 * s.loc.buildings[city * B + BI.fort]);
    const before = guns(); siegeTrain(s, w, o);
    expect(guns()).toBe(before); // enough guns for those walls: no more
  });

  it('great guns breach the walls of any fort, but only with artillery in the camp and without bastions', () => {
    const run = (guns: boolean, art: number, bastion: boolean, seed: number) => {
      const s = fresh(); s.rng = seedRng(seed); const ctx = mkCtx(s, w);
      const a = nat(s, 'castile'), b = nat(s, 'aragon');
      s.wars = []; s.treaties = s.treaties.filter((t) => t.type !== 'truce' && t.type !== 'alliance');
      expect(declareWar(s, w, a.id, b.id, 'conquest')).toBe(null);
      const loc = b.capital;
      expect(s.loc.buildings[loc * B + BI.fort]).toBeGreaterThan(0);
      s.armies = s.armies.filter((x) => x.loc !== loc && x.owner !== b.id);
      a.tech[2] = guns ? 7 : 1; a.modifiers = a.modifiers.filter((m) => m.id !== 'inv_bombards');
      if (bastion) b.modifiers.push({ id: 'inv_trace_italienne', until: 1e9, label: { en: '', de: '' }, effects: {} });
      const inf = UNITS.findIndex((u) => u.id === 'levy'), gun = UNITS.findIndex((u) => u.id === 'bombards');
      newArmy(s, a.id, loc, art ? [{ type: inf, men: 12000 }, { type: gun, men: art }] : [{ type: inf, men: 12000 }]);
      touch();
      for (let d = 0; d < 31; d++) military.daily!(ctx);
      const sg = s.sieges.find((x) => x.loc === loc);
      expect(sg).toBeDefined();
      return sg!.breach;
    };
    // a lucky siege roll may open a breach in any camp; great guns open one every time (eight random sequences)
    const breached = (guns: boolean, art: number, bastion: boolean) => [1, 2, 3, 4, 5, 6, 7, 8].filter((k) => run(guns, art, bastion, k) >= 1).length;
    expect(breached(true, 1500, false)).toBe(8);
    expect(breached(false, 1500, false)).toBeLessThan(8);
    expect(breached(true, 0, false)).toBeLessThan(8);
    expect(breached(true, 1500, true)).toBeLessThan(8);
  }, 60000);
});
