// Fixes of the realm track: goals gated by a year never look done before it, the assembly's vote on taxes (class taxes
// weighted by what each class pays, the duties counted in the same level, bribes paid only for a yes), class taxes in
// the contentment of the Powers, the war vote put to the assembly, the own great-power rank, the diet lobbied member by
// member, situation actions that would do nothing refused, Bohemia's goals, and a human member asking the emperor for
// help.
import { describe, it, expect } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { advanceDay } from '../src/sim/engine';
import { DAY_EPOCH } from '../src/sim/ctx';
import { dateToDay } from '../src/sim/calendar';
import { goalConditions, goalsFor } from '../src/sim/systems/goals';
import { answer } from '../src/game/view';
import type { GameState, Nation } from '../src/sim/types';

const w = loadWorld();
const s: GameState = createGame(w, loadSetup(1356), loadHubs(), 4243, { player: [] });
for (let i = 0; i < 40; i++) advanceDay(s, w);
const nat = (k: string) => s.nations.find((n) => n.key === k)!;
const fresh = () => { DAY_EPOCH.v++; };
void fresh;

describe('goals gated by a year', () => {
  it('a condition that counts only from a year on is never shown as done before it', () => {
    const b = nat('bohemia');
    const g = goalsFor(b).find((x) => x.id === 'bohemia.chalice')!;
    const keep = b.concord;
    try {
      b.concord = 40; // more than the 20 asked: the count is met, the year is not
      const [c] = goalConditions(s, w, b, g);
      expect(c.ok).toBe(false);
      expect(c.cur).toBe(40); expect(c.max).toBe(20);
      expect(c.from).toBe(1480);
      expect(c.yearsLeft).toBe(1480 - 1356);
      expect(c.frac).toBeLessThan(0.01);
      expect(c.frac).toBe(c.timeFrac);
      const v = (answer(s, w, b.id, { q: 'goals', nation: b.id } as any) as any[]).find((x) => x.id === g.id);
      expect(v.progress).toBeLessThan(0.01);
      expect(v.conds[0].frac).toBe(c.frac);
      // halfway to the year the progress is half, and from the year the count alone decides
      const day0 = s.day;
      try {
        s.day = dateToDay(1418, 1, 1, s.startYear);
        const half = goalConditions(s, w, b, g)[0];
        expect(half.frac).toBeCloseTo((1418 - 1356) / (1480 - 1356), 6);
        s.day = dateToDay(1480, 1, 2, s.startYear);
        const after = goalConditions(s, w, b, g)[0];
        expect(after.ok).toBe(true); expect(after.frac).toBe(1); expect(after.from).toBeUndefined();
      } finally { s.day = day0; }
    } finally { b.concord = keep; }
  });
});
