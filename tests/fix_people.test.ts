// fix-people track: the player-side test of the people, diplomacy and German text found that a marriage treaty and a
// three-person royal house handed England's crown to Castile within months, that AI answers came without reasons and
// with raw keys, that offers were spammed, that houses were shallow, traits mute and German text mixed with English.
// Each describe block covers one item and fails without its fix.
// Run: npx vitest run tests/fix_people.test.ts
import { describe, it, expect } from 'vitest';
import { newGame } from '../tools/sim/load';
import { characterDies, lineOfSuccession, ageOf, politics } from '../src/sim/systems/politics';
import { dynastyView, successionClaims } from '../src/sim/systems/dynasty';
import type { GameState } from '../src/sim/types';

const nat = (s: GameState, key: string) => s.nations.find((n) => n.key === key)!;
const named = (s: GameState, name: string) => Object.values(s.chars).find((c) => c.name === name)!;

describe('royal houses of 1356 and the succession', () => {
  it('England starts with the historical house of Edward III', () => {
    const { s } = newGame(1356);
    const E = nat(s, 'england'); const r = s.chars[E.ruler];
    const kids = r.children.map((k) => s.chars[k].name);
    for (const n of ['Edward of Woodstock (the Black Prince)', 'Lionel of Antwerp', 'John of Gaunt', 'Edmund of Langley', 'Thomas of Woodstock', 'Isabella of England', 'Mary of Waltham', 'Margaret of Windsor']) expect(kids).toContain(n);
    const line = lineOfSuccession(s, E, r).map((id) => s.chars[id].name);
    expect(line.slice(0, 4)).toEqual(['Edward of Woodstock (the Black Prince)', 'Lionel of Antwerp', 'John of Gaunt', 'Edmund of Langley']);
    // Lionel's daughter comes after the men of the male line (male primogeniture), but she is in the line
    expect(line).toContain('Philippa of Clarence');
    expect(line.indexOf('Thomas of Woodstock')).toBeLessThan(line.indexOf('Philippa of Clarence'));
    // the house view lists them, and nothing warns: the line is long
    const v = dynastyView(s, E)!;
    expect(v.members.length).toBeGreaterThanOrEqual(10);
    expect(v.warn).toBeNull();
    // Castile names Pedro's eldest daughter as heir, Scotland the Steward as the king's nephew (not his son)
    const C = nat(s, 'castile');
    expect(s.chars[C.heir]?.name).toBe('Beatrice of Castile');
    const S = nat(s, 'scotland');
    expect(s.chars[S.ruler].children).not.toContain(S.heir);
    expect(lineOfSuccession(s, S, s.chars[S.ruler])[0]).toBe(S.heir);
  });

  it('a dead heir is followed by his brother; a dead son\'s children come before his younger brothers', () => {
    const { s, w } = newGame(1356);
    const E = nat(s, 'england');
    characterDies(s, w, E, E.heir);
    expect(s.chars[E.heir].name).toBe('Lionel of Antwerp');
    // Lionel dies leaving a son: the boy stands before John of Gaunt
    const lionel = s.chars[E.heir];
    const boy = named(s, 'Philippa of Clarence'); boy.female = false; boy.name = 'Roger of Clarence';
    characterDies(s, w, E, lionel.id);
    expect(s.chars[E.heir].name).toBe('Roger of Clarence');
  });

  it('a marriage treaty without blood does not take the crown; a native house does, and the partner gets a claim to press', () => {
    const { s, w } = newGame(1356);
    const E = nat(s, 'england'), C = nat(s, 'castile');
    s.playerNations = [E.id];
    s.treaties.push({ a: Math.min(E.id, C.id), b: Math.max(E.id, C.id), type: 'marriage', since: 0, until: 40 * 365 });
    // the whole house of Edward III dies but the king
    const r = s.chars[E.ruler];
    for (const c of Object.values(s.chars)) if (c.alive && c.id !== r.id && c.dynasty === 'Plantagenet') c.alive = false;
    E.heir = 0;
    expect(successionClaims(s, E).find((c) => c.nation === C.id)?.how).toBe('marriage');
    expect(dynastyView(s, E)!.warn).toBe('none');
    characterDies(s, w, E, r.id);
    expect(E.overlord).toBe(-1);
    expect(C.overlord).toBe(-1);
    expect(s.chars[E.ruler].nation).toBe(E.id);
    expect(s.chars[E.ruler].dynasty).not.toBe(s.chars[C.ruler].dynasty);
    expect(s.treaties.some((t) => t.type === 'claim' && t.a === C.id && t.b === E.id)).toBe(true);
    expect(s.notices.some((n) => n.nation === E.id && n.kind === 'house_extinct')).toBe(true);
  });

  it('the player is warned when the house is down to its last heir', () => {
    const { s, w } = newGame(1356);
    const E = nat(s, 'england'); s.playerNations = [E.id];
    const r = s.chars[E.ruler];
    for (const c of Object.values(s.chars)) if (c.alive && c.id !== r.id && c.id !== E.heir && c.dynasty === 'Plantagenet') c.alive = false;
    const v = dynastyView(s, E)!;
    expect(v.warn).toBe('last');
    // the monthly check (characterMonth) tells the player once
    politics.monthly!({ s, w } as any);
    politics.monthly!({ s, w } as any);
    expect(s.notices.filter((n) => n.nation === E.id && n.kind === 'house_warning').length).toBe(1);
  });

  it('people born before 1300 have their real age (the calendar counts back past 1300)', () => {
    const { s } = newGame(1356);
    const P = nat(s, 'portugal');
    expect(Math.floor(ageOf(s, s.chars[P.ruler]))).toBeGreaterThanOrEqual(64); // Afonso IV, born 1291
  });
});
