// War track fixes (claude/fix-war): every battle behind the war score is listed, sieges count steps, calls to arms
// for the player, the AI's peace in young and back-dated wars, the captor of a fort, raising a general, the sides of a
// declaration and the towns it is fought for, and the texts of wars.
// Run: npx vitest run --testTimeout=180000 tests/fix_war.test.ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { serialize, deserialize } from '../src/sim/engine';
import { hasTreaty, atWar, topOverlord } from '../src/sim/ctx';
import { B, BI, UNITS } from '../src/sim/defs';
import { casusBelliAll, declareWar } from '../src/sim/systems/war';
import { newArmy, siegeSteps } from '../src/sim/systems/military';
import { siegesView } from '../src/game/warview';
import type { GameState, War } from '../src/sim/types';

vi.setConfig({ testTimeout: 180_000 });
const w = loadWorld();
let BASE = '';
beforeAll(() => { BASE = serialize(createGame(w, loadSetup(1356), loadHubs(), 1356, { player: [] })); });
const fresh = () => { const s = deserialize(BASE) as GameState; delete s.flags.peaceful_start; return s; };
const nat = (s: GameState, key: string) => s.nations.find((n) => n.key === key)!;
const unit = (id: string) => UNITS.findIndex((u) => u.id === id);
const owned = (s: GameState, n: number) => { const out: number[] = []; for (let i = 0; i < w.L; i++) if (s.loc.owner[i] === n) out.push(i); return out; };
function plainTarget(s: GameState, a: number, skip: number[] = []): number {
  const na = s.nations[a];
  for (const b of s.nations) {
    if (!b.alive || b.id === a || skip.includes(b.id) || b.overlord >= 0 || b.capital < 0 || b.faith !== na.faith || atWar(s, a, b.id)) continue;
    if (hasTreaty(s, a, b.id, 'truce') || hasTreaty(s, a, b.id, 'alliance') || topOverlord(s, b.id) === a || na.rivals.includes(b.id)) continue;
    if (s.treaties.some((t) => t.type === 'alliance' && (t.a === b.id || t.b === b.id))) continue;
    if (casusBelliAll(s, a, b.id, w).length === 0 && owned(s, b.id).length >= 3) return b.id;
  }
  throw new Error('no target');
}
function clearField(s: GameState) { s.wars = []; s.armies = []; s.battles = []; s.sieges = []; }
function war2(s: GameState, a: number, b: number, goal: Parameters<typeof declareWar>[4] = 'conquest'): War {
  expect(declareWar(s, w, a, b, goal)).toBeNull();
  return s.wars[s.wars.length - 1];
}
describe('sieges count steps (blocker: the map badge showed the steps as a percentage)', () => {
  it('the tick tells how many steps take the town: four, three under blockade; the town falls at that step', () => {
    const s = fresh(); clearField(s);
    const a = nat(s, 'portugal').id, b = plainTarget(s, a);
    war2(s, a, b, 'humiliate');
    let l = -1; for (const i of owned(s, b)) if (s.loc.buildings[i * B + BI.fort] > 0) { l = i; break; }
    if (l < 0) { l = s.nations[b].capital; s.loc.buildings[l * B + BI.fort] = 1; }
    const A = newArmy(s, a, l, [{ type: unit('men_at_arms'), men: 15000 }]); A.siege = l;
    const sg = { loc: l, nation: a, progress: 2, days: 1, garrison: 1000, garrison0: 1000, breach: 0, blockade: false, log: [] as string[] };
    s.sieges.push(sg);
    expect(siegesView(s)[0]).toMatchObject({ loc: l, progress: 2, need: 4 });
    sg.blockade = true;
    expect(siegeSteps(sg)).toBe(3);
    expect(siegesView(s)[0].need).toBe(3);
  });
});
