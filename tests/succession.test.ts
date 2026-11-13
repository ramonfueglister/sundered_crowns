// A ruler who dies outside the monthly ageing (for instance leading a host that loses a battle) is succeeded like
// any other: the heir takes the crown, and the dead ruler no longer commands an army.
// Run: npx vitest run tests/succession.test.ts
import { describe, it, expect } from 'vitest';
import { newGame } from '../tools/sim/load';
import { characterDies } from '../src/sim/systems/politics';
import { advanceDay } from '../src/sim/engine';

describe('succession after a death outside old age', () => {
  it('a ruler killed (e.g. in battle) is succeeded by the heir at once', () => {
    const { s, w } = newGame(1356);
    const fr = s.nations.find((n) => n.short.en === 'France')!;
    const king = fr.ruler, heir = fr.heir;
    expect(s.chars[king].alive).toBe(true);
    characterDies(s, w, fr, king);
    expect(s.chars[king].alive).toBe(false);
    expect(fr.ruler).not.toBe(king);
    expect(s.chars[fr.ruler]?.alive).toBe(true);
    if (heir) expect(fr.ruler).toBe(heir);
  });

  it('a host whose general died gets a new commander', () => {
    const { s, w } = newGame(1356);
    const a = s.armies.find((x) => !x.fleet && !x.rebels && s.nations[x.owner]?.alive && x.regs.reduce((m, r) => m + r.men, 0) > 3000);
    expect(a).toBeTruthy();
    // a general who died of other causes
    if (a!.general && s.chars[a!.general]) { s.chars[a!.general].alive = false; }
    else a!.general = 0;
    for (let d = 0; d < 40; d++) advanceDay(s, w);
    expect(a!.general).toBeTruthy();
    expect(s.chars[a!.general].alive).toBe(true);
  });
});
