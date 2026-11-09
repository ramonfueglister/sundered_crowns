// Spec point 99 (plausible history without scripted outcomes): the rules that let a principality gather its people and
// let the steppe khanates decline. Run: npx vitest run tests/history.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { serialize, deserialize } from '../src/sim/engine';
import { mkCtx } from '../src/sim/ctx';
import { dateToDay } from '../src/sim/calendar';
import { war, casusBelliAll, declareWar } from '../src/sim/systems/war';
import { realm } from '../src/sim/systems/realm';
import { libertyParts, evaluateProposal } from '../src/sim/systems/diplomacy';
import type { GameState } from '../src/sim/types';

const w = loadWorld();
let BASE = '';
beforeAll(() => { BASE = serialize(createGame(w, loadSetup(1356), loadHubs(), 1356, { player: [] })); });
const fresh = () => deserialize(BASE) as GameState;
const nat = (s: GameState, key: string) => s.nations.find((n) => n.key === key)!;

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

  it('the steppe order fades from 1420: the horde weakens and its tributaries strain to be free', () => {
    const run = (year: number) => {
      const s = fresh(); s.day = dateToDay(year, 0, 1, s.startYear);
      realm.yearly!(mkCtx(s, w));
      const h = nat(s, 'golden_horde'), m = nat(s, 'moscow');
      expect(m.overlord).toBe(h.id);
      return { mod: h.modifiers.find((x) => x.id === 'steppe_fading'), liberty: libertyParts(s, w, m, h).find(([k]) => k === 'steppe_fading')![1] };
    };
    const early = run(1400), late = run(1470);
    expect(early.mod).toBeUndefined();
    expect(early.liberty).toBe(0);
    expect(late.mod!.effects.tax).toBeLessThan(0);
    expect(late.liberty).toBeGreaterThan(20);
  });

  it('a great horde at peace late in the age sheds its far lands as a khanate of their own', () => {
    const s = fresh(); s.day = dateToDay(1470, 0, 1, s.startYear);
    const h = nat(s, 'golden_horde');
    s.wars = s.wars.filter((x) => !x.att.includes(h.id) && !x.def.includes(h.id));
    const count = () => { let k = 0; for (let i = 0; i < w.L; i++) if (s.loc.owner[i] === h.id) k++; return k; };
    const n0 = s.nations.length, l0 = count();
    for (let k = 0; k < 60 && s.nations.length === n0; k++) realm.yearly!(mkCtx(s, w));
    const nn = s.nations.find((x) => x.flags.horde_successor && x.alive)!;
    expect(nn).toBeDefined();
    expect(nn.gov).toBe('nomadic_horde');
    expect(count()).toBeLessThanOrEqual(l0 - 15);
    expect(nn.rivals).toContain(h.id);
  });
});
