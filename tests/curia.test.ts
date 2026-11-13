// The Curia (systems/curia.ts): the College of Cardinals, the conclave, red hats, gifts to the cardinals,
// indulgences and crusades, for the player and the AI alike, and the view the Curia panel reads.
import { describe, it, expect, beforeAll } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { advanceDay, serialize, deserialize } from '../src/sim/engine';
import { applyCommand } from '../src/sim/commands';
import { answer } from '../src/game/view';
import { casusBelliAll } from '../src/sim/systems/war';
import {
  COLLEGE, RED_HAT_FAVOUR, INDULGENCE_FAVOUR, CRUSADE_FAVOUR, CRUSADE_MORALE, hats, collegeSize, hatClaim, conclaveCandidates, cardinalScore,
  redHatGold, indulgenceGold, crusadeTargets, simonyCost,
} from '../src/sim/systems/curia';
import { refusal } from '../src/sim/refusals';
import type { GameState } from '../src/sim/types';

const w = loadWorld();
let BASE = '';
beforeAll(() => { BASE = serialize(createGame(w, loadSetup(1356), loadHubs(), 1356, { player: [] })); });
const fresh = (player?: string) => { const s = deserialize(BASE) as GameState; if (player) s.playerNations = [nat(s, player).id]; return s; };
const nat = (s: GameState, key: string) => s.nations.find((n) => n.key === key)!;
const sum = (r: [unknown, number][]) => r.reduce((p, x) => p + x[1], 0);
const days = (s: GameState, k: number) => { for (let i = 0; i < k; i++) advanceDay(s, w); };
const cmd = (s: GameState, n: number, action: string, target?: number) => applyCommand(s, w, { t: 'curia', n, action, target } as any);

describe('the College of Cardinals', () => {
  it('seats 24 cardinals in 1356, most of them French under a French pope at Avignon, none outside the Latin Church', () => {
    const s = fresh();
    expect(collegeSize(s)).toBe(COLLEGE);
    const fr = nat(s, 'france'), ps = nat(s, 'papal_states');
    expect(s.papacy.patron).toBe(fr.id);
    const most = Object.entries(s.papacy.cardinals!).sort((a, b) => b[1] - a[1])[0];
    expect(+most[0]).toBe(fr.id);
    expect(hats(s, ps.id)).toBeGreaterThan(0);
    for (const id of Object.keys(s.papacy.cardinals!)) expect(s.nations[+id].faith).toBe(fr.faith);
    expect(hatClaim(s, w, nat(s, 'byzantium'))).toEqual([]);
    expect(sum(hatClaim(s, w, fr))).toBeGreaterThan(sum(hatClaim(s, w, nat(s, 'navarre'))));
  });
  it('the yearly consistory fills the seats of the dead again', () => {
    const s = fresh();
    const C = s.papacy.cardinals!; const fr = nat(s, 'france').id;
    C[fr] -= 3;
    days(s, 366);
    expect(collegeSize(s)).toBe(COLLEGE);
  });
});

describe('the conclave', () => {
  it('opens when the ruler of the Holy See dies, takes the player\'s vote and elects a pope whose country gains standing', () => {
    const s = fresh('france');
    const fr = nat(s, 'france'), ps = nat(s, 'papal_states');
    ps.flags.ruler_changed = s.day + 1;
    days(s, 40);
    const cv = s.papacy.conclave!;
    expect(cv).toBeTruthy();
    expect(cv.candidates).toContain(ps.id);
    expect(cv.candidates).toContain(fr.id);
    // a realm without cardinals cannot vote, a non-candidate is refused
    expect(cmd(s, nat(s, 'byzantium').id, 'vote', fr.id).ok).toBe(false);
    expect(cmd(s, fr.id, 'vote', nat(s, 'byzantium').id).err).toBe('not a candidate');
    expect(cmd(s, fr.id, 'vote', fr.id).ok).toBe(true);
    expect(cv.votes[fr.id]).toBe(fr.id);
    // each bloc's leaning is explained by rows that sum to its choice
    const other = Object.keys(s.papacy.cardinals!).map(Number).find((id) => id !== fr.id)!;
    expect(cardinalScore(s, w, other, ps.id).length).toBeGreaterThan(2);
    days(s, 100);
    expect(s.papacy.conclave).toBeFalsy();
    const pope = s.papacy.patron!;
    expect(cv.candidates).toContain(pope);
    expect(s.chronicle.some((c) => c.kind === 'pope')).toBe(true);
    days(s, 35);
    expect(s.nations[pope].modifiers.some((m) => m.id === 'papal_patron')).toBe(true);
  });
  it('needs two thirds of the votes before the last round', () => {
    const s = fresh();
    const ps = nat(s, 'papal_states');
    // two equal blocs that each vote for their own realm: no two thirds in the first round
    const a = nat(s, 'france').id, b = nat(s, 'england').id;
    s.papacy.cardinals = { [a]: 12, [b]: 12 };
    ps.flags.ruler_changed = s.day + 1;
    days(s, 40);
    const cv = s.papacy.conclave!;
    expect(cv).toBeTruthy();
    days(s, 31);
    expect(s.papacy.conclave?.round ?? 0).toBeGreaterThanOrEqual(2);
    days(s, 70);
    expect(s.papacy.conclave).toBeFalsy();
  });
  it('gifts to a realm\'s cardinals need a candidacy, cost gold and count in their leaning', () => {
    const s = fresh('france');
    const fr = nat(s, 'france'); fr.treasury = 1e6;
    const cands = conclaveCandidates(s);
    expect(cands).toContain(fr.id);
    const target = Object.keys(s.papacy.cardinals!).map(Number).find((id) => id !== fr.id && id !== s.papacy.holder)!;
    const before = sum(cardinalScore(s, w, target, fr.id)); const gold = fr.treasury; const cost = simonyCost(fr);
    expect(cmd(s, fr.id, 'simony', target).ok).toBe(true);
    expect(fr.treasury).toBeCloseTo(gold - cost, 5);
    expect(sum(cardinalScore(s, w, target, fr.id))).toBeGreaterThan(before);
    // a realm that is no candidate cannot buy votes
    const small = s.nations.find((n) => n.faith === fr.faith && n.alive && !cands.includes(n.id))!;
    small.treasury = 1e6;
    expect(cmd(s, small.id, 'simony', target).err).toBe('not a candidate');
  });
});

describe('what a realm can ask of Rome', () => {
  it('a red hat costs favour and gold, and only once in five years', () => {
    const s = fresh('england');
    const en = nat(s, 'england');
    s.papacy.curiaFavour[en.id] = 10; en.treasury = 1e6;
    expect(cmd(s, en.id, 'red_hat').err).toBe('not enough favour with the Curia');
    s.papacy.curiaFavour[en.id] = 60;
    const h = hats(s, en.id), g = redHatGold(en), t = en.treasury;
    expect(cmd(s, en.id, 'red_hat').ok).toBe(true);
    expect(hats(s, en.id)).toBe(h + 1);
    expect(s.papacy.curiaFavour[en.id]).toBe(60 - RED_HAT_FAVOUR);
    expect(en.treasury).toBeCloseTo(t - g, 5);
    expect(cmd(s, en.id, 'red_hat').err).toBe('too soon');
  });
  it('indulgences bring gold now and feed the corruption of the Curia and the pressure for reform at home', () => {
    const s = fresh('castile');
    const ca = nat(s, 'castile');
    s.papacy.curiaFavour[ca.id] = 40;
    const t = ca.treasury, g = indulgenceGold(ca), corr = s.papacy.corruption;
    expect(cmd(s, ca.id, 'indulgence').ok).toBe(true);
    expect(ca.treasury).toBeCloseTo(t + g, 5);
    expect(s.papacy.curiaFavour[ca.id]).toBe(40 - INDULGENCE_FAVOUR);
    expect(s.papacy.corruption).toBeGreaterThan(corr);
    expect(ca.modifiers.find((m) => m.id === 'indulgences')?.effects.reform_pressure).toBeGreaterThan(0);
    expect(cmd(s, ca.id, 'indulgence').err).toBe('too soon');
  });
  it('a crusade gives every realm of the Latin Church a holy war against its target, and its warriors more heart', () => {
    const s = fresh('castile');
    const ca = nat(s, 'castile'), gr = nat(s, 'marinid'), en = nat(s, 'england');
    expect(crusadeTargets(s, w)).toContain(gr.id);
    expect(cmd(s, ca.id, 'crusade', gr.id).err).toBe('not enough favour with the Curia');
    s.papacy.curiaFavour[ca.id] = 100;
    expect(cmd(s, ca.id, 'crusade', nat(s, 'england').id).err).toBe('not of another faith');
    expect(casusBelliAll(s, en.id, gr.id, w)).not.toContain('holy_war');
    expect(cmd(s, ca.id, 'crusade', gr.id).ok).toBe(true);
    expect(s.papacy.curiaFavour[ca.id]).toBe(100 - CRUSADE_FAVOUR);
    expect(casusBelliAll(s, en.id, gr.id, w)).toContain('holy_war');
    expect(cmd(s, en.id, 'crusade', gr.id).err).toBe('a crusade is already under way');
    // Castile at war with the Marinids marches with more heart
    const r = applyCommand(s, w, { t: 'declare', n: ca.id, target: gr.id, goal: 'faith' } as any);
    if (r.ok) { days(s, 35); expect(ca.modifiers.find((m) => m.id === 'crusader')?.effects.morale).toBe(CRUSADE_MORALE); }
  });
  it('the refusals of the Curia read in German', () => {
    for (const e of ['the College is full', 'we have no cardinals', 'no conclave is sitting', 'a crusade is already under way', 'not of another faith', 'no realm of our church borders them', 'we are excommunicated', 'they have no cardinals'])
      expect(refusal(e).de).not.toBe(e);
  });
});

describe('the Curia panel', () => {
  it('shows the pope, our favour with its yearly gain, the College with each bloc\'s leaning, and our options', () => {
    const s = fresh('france');
    const fr = nat(s, 'france');
    const v = answer(s, w, fr.id, { q: 'curia' });
    expect(v.latin).toBe(true);
    expect(v.patron).toBe(fr.id);
    expect(v.college.size).toBe(COLLEGE);
    expect(v.blocs.reduce((p: number, b: any) => p + b.hats, 0)).toBe(COLLEGE);
    expect(v.blocs.every((b: any) => b.human || b.rows.length > 0)).toBe(true);
    expect(v.gain.length).toBeGreaterThan(1);
    expect(v.crusade.targets.length).toBeGreaterThan(0);
    const by = answer(s, w, nat(s, 'byzantium').id, { q: 'curia' });
    expect(by.latin).toBe(false);
  });
});
