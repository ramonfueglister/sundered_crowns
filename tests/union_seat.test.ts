// The seat of a personal union is the greater crown (spec point 38): when a kingdom's house dies out and a small realm's
// ruler inherits it by a claim, the kingdom becomes the seat and the small realm its junior partner, even when that
// small realm holds vassals (they follow it into the union). Seed 1356 once had Franche-Comté hold France as its junior.
// Run: npx vitest run tests/union_seat.test.ts
import { describe, it, expect } from 'vitest';
import { newGame } from '../tools/sim/load';
import { characterDies } from '../src/sim/systems/politics';
import type { GameState } from '../src/sim/types';

const nat = (s: GameState, key: string) => s.nations.find((n) => n.key === key)!;

describe('the seat of a personal union', () => {
  it('a county with a vassal that inherits France joins France as the junior partner', () => {
    const { s, w } = newGame(1356);
    const K = nat(s, 'county_burgundy'), F = nat(s, 'france');
    K.overlord = -1; K.subjectType = null; // the county on its own (in 1356 it serves an overlord)
    const V = s.nations.find((x) => x.alive && x.id !== K.id && x.id !== F.id && x.overlord < 0 && s.nations.every((y) => y.overlord !== x.id) && x.faith === K.faith)!;
    V.overlord = K.id; V.subjectType = 'vassal'; V.subjectSince = s.day;
    const kr = s.chars[K.ruler], fr = s.chars[F.ruler];
    // France's house dies out with its king; the count carries a claim by blood on its throne
    fr.children = []; F.heir = 0; F.laws.succession = 0; fr.father = undefined; fr.mother = undefined;
    for (const c of Object.values(s.chars)) if (c.alive && c.nation === F.id && c.id !== fr.id && c.dynasty === fr.dynasty) c.alive = false;
    kr.claims = [F.id];
    characterDies(s, w, F, F.ruler);
    expect(F.ruler).toBe(kr.id);
    expect(F.overlord).toBe(-1);
    expect(K.overlord).toBe(F.id);
    expect(K.subjectType).toBe('personal_union');
    // the county's vassal now serves the seat of the union
    expect(V.overlord).toBe(F.id);
  });
});
