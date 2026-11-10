// fix-people track: the player-side test of the people, diplomacy and German text found that a marriage treaty and a
// three-person royal house handed England's crown to Castile within months, that AI answers came without reasons and
// with raw keys, that offers were spammed, that houses were shallow, traits mute and German text mixed with English.
// Each describe block covers one item and fails without its fix.
// Run: npx vitest run tests/fix_people.test.ts
import { describe, it, expect } from 'vitest';
import { newGame } from '../tools/sim/load';
import { characterDies, lineOfSuccession, ageOf, politics } from '../src/sim/systems/politics';
import { dynastyView, successionClaims, marriagePreview } from '../src/sim/systems/dynasty';
import { acceptProposal } from '../src/sim/systems/diplomacy';
import type { GameState } from '../src/sim/types';
import { diplomacy, sendEnvoy, refusedRecently, IMPROVE_CAP } from '../src/sim/systems/diplomacy';
import { answerEvent } from '../src/sim/systems/events';
import { answer } from '../src/game/view';
import { advanceDay } from '../src/sim/engine';
import { atWar } from '../src/sim/ctx';

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

describe('diplomatic answers', () => {
  const sendable = (s: GameState, _w: any, a: number, b: number) => !atWar(s, a, b) && s.nations[b].overlord < 0;
  const arrive = (s: GameState, w: any) => { for (const e of s.envoys) e.arrive = s.day; diplomacy.daily!({ s, w } as any); };

  it('improving relations is never refused: the query shows the gain the envoy brings, and it stops at +100', () => {
    const { s, w } = newGame(1356);
    const E = nat(s, 'england'), F = nat(s, 'france'); s.playerNations = [E.id];
    const q = answer(s, w, E.id, { q: 'diplo', target: F.id, action: 'improve' } as any);
    expect(q.accept).toBe(true);
    expect(q.gain).toBeGreaterThan(0);
    // the parts add up to the gain shown
    expect(q.reasons.reduce((a: number, x: [string, number]) => a + x[1], 0)).toBeCloseTo(q.gain, 6);
    expect(sendEnvoy(s, w, E.id, F.id, 'improve')).toBeNull(); arrive(s, w);
    const mod = () => s.rel[`${F.id}>${E.id}`].mods.find((m) => m.id === 'improved_relations')!.v;
    expect(mod()).toBeCloseTo(q.gain, 6);
    expect(s.notices.some((n) => n.nation === E.id && n.kind === 'diplo_accept' && /Gesandter/.test(n.text.de))).toBe(true);
    for (let i = 0; i < 6; i++) { E.envoysBusy = 0; sendEnvoy(s, w, E.id, F.id, 'improve'); arrive(s, w); }
    expect(mod()).toBe(IMPROVE_CAP);
    expect(answer(s, w, E.id, { q: 'diplo', target: F.id, action: 'improve' } as any).gain).toBe(0);
  });

  it('a refusal names the proposal in words and carries the reasons, and is remembered', () => {
    const { s, w } = newGame(1356);
    const E = nat(s, 'england'); s.playerNations = [E.id];
    // the first realm at peace with England that would refuse an alliance (France is at war with England in 1356)
    const F = s.nations.find((o) => o.alive && o.id !== E.id && !o.short.de.startsWith('Die ') && sendable(s, w, E.id, o.id) && !answer(s, w, E.id, { q: 'diplo', target: o.id, action: 'alliance' } as any).accept)!;
    expect(sendEnvoy(s, w, E.id, F.id, 'alliance')).toBeNull(); arrive(s, w);
    const n = s.notices.find((x) => x.nation === E.id && x.kind === 'diplo_refuse')!;
    expect(n.text.de).toMatch(new RegExp(`^${F.short.de} hat unseren Bündnisvorschlag abgelehnt \\(−\\d+\\)\\.$`));
    expect(n.text.en).not.toMatch(/alliance proposal/);
    expect(n.reasons!.length).toBeGreaterThan(1);
    const sum = Math.round(n.reasons!.reduce((a, x) => a + x[1], 0));
    expect(n.text.de).toContain(`(−${Math.abs(sum)})`);
    expect(refusedRecently(s, E.id, F.id, 'alliance')).toBe(true);
    // the diplomacy row says so
    expect(answer(s, w, E.id, { q: 'diplo', target: F.id, action: 'alliance' } as any).again).toBeGreaterThan(s.day);
  });

  it('a declined offer is not repeated for years, and subjects do not offer alliances', () => {
    const { s, w } = newGame(1356);
    const E = nat(s, 'england'); s.playerNations = [E.id];
    const seen = new Map<string, number>(); const repeats: string[] = []; const fromSubjects: string[] = [];
    const cool: Record<string, number> = { alliance: 3, marriage: 10, access: 2, trade: 3, vassalize: 5, demand: 3 };
    for (let d = 0; d < 365 * 3; d++) {
      for (const p of s.pending.filter((x) => x.nation === E.id && x.event.startsWith('diplo_'))) {
        const key = `${p.ctx.from}_${p.event}`; const act = p.event.slice(6);
        if (seen.has(key) && s.day - seen.get(key)! < cool[act] * 365 - 1) repeats.push(`${key}@${s.day}`);
        if (act === 'alliance' && s.nations[p.ctx.from].overlord >= 0) fromSubjects.push(key);
        seen.set(key, s.day);
        answerEvent(s, w, E.id, p.id, 1);
      }
      advanceDay(s, w);
    }
    expect(repeats).toEqual([]);
    expect(fromSubjects).toEqual([]);
  }, 600000);
});

describe('marriage preview', () => {
  it('the diplomacy row names who would wed whom, and the treaty weds exactly them', () => {
    const { s, w } = newGame(1356);
    const E = nat(s, 'england'), A = nat(s, 'austria'); s.playerNations = [E.id];
    const q = answer(s, w, E.id, { q: 'diplo', target: A.id, action: 'marriage' } as any);
    const m = q.preview.match;
    expect(m).not.toBeNull();
    // Austria's unwed heir Rudolf takes a daughter of Edward III; the panel also lists the Austrian house
    expect(m.realm).toBe(A.id); expect(m.person.id).toBe(A.heir);
    expect(m.spouse.name).toBe('Isabella of England');
    expect(q.preview.members.length).toBeGreaterThan(0);
    acceptProposal(s, w, E.id, A.id, 'marriage');
    expect(s.chars[A.heir].spouse).toBe(m.spouse.id);
    // once wed, nobody is left to match on either side for a second treaty
    expect(marriagePreview(s, E.id, A.id).match?.spouse?.id).not.toBe(m.spouse.id);
  });
});
