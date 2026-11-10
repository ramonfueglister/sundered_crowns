// fix-people track: the player-side test of the people, diplomacy and German text found that a marriage treaty and a
// three-person royal house handed England's crown to Castile within months, that AI answers came without reasons and
// with raw keys, that offers were spammed, that houses were shallow, traits mute and German text mixed with English.
// Each describe block covers one item and fails without its fix.
// Run: npx vitest run tests/fix_people.test.ts
import { describe, it, expect } from 'vitest';
import { newGame } from '../tools/sim/load';
import { characterDies, lineOfSuccession, ageOf, politics, syncRulerTraits, lawEffect, officeCandidates, officeBonusOf, OFFICES, ablestPlan } from '../src/sim/systems/politics';
import { applyCommand } from '../src/sim/commands';
import { localName, declineDe } from '../src/sim/content/names';
import { deName } from '../src/sim/content/names_de';
import { interpolate } from '../src/sim/systems/events';
import { aiLogText } from '../src/sim/systems/ai_log';
import { BRANCHES } from '../src/sim/systems/progress';
import { RULER_TRAIT_FX, TRAITS_DESCRIPTIVE, TRAITS_HEALTH } from '../src/sim/content/traits';
import { readFileSync, readdirSync } from 'node:fs';
import { dynastyView, successionClaims, marriagePreview, freshGivenName } from '../src/sim/systems/dynasty';
import { acceptProposal } from '../src/sim/systems/diplomacy';
import type { GameState } from '../src/sim/types';
import { diplomacy, sendEnvoy, refusedRecently, IMPROVE_CAP, spyCost, startSpy } from '../src/sim/systems/diplomacy';
import { answerEvent } from '../src/sim/systems/events';
import { answer } from '../src/game/view';
import { advanceDay } from '../src/sim/engine';
import { atWar, DAY_EPOCH } from '../src/sim/ctx';
import { nationDev } from '../src/sim/systems/war';
import { aiTradePartner } from '../src/sim/systems/tradeai';
import { aiMayFabricate } from '../src/sim/systems/ai';
import { arrivedPausing, mayResume, pausesWith } from '../src/ui/eventpause';

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

  it('Norway and Sweden share the house of Bjälbo: Haakon is the son of Magnus, Eric his brother with a claim (review fix)', () => {
    const { s, w } = newGame(1356);
    const N = nat(s, 'norway'), S = nat(s, 'sweden');
    const haakon = s.chars[N.ruler], magnus = s.chars[S.ruler], eric = s.chars[S.heir], blanche = s.chars[S.consort];
    expect(haakon.father).toBe(magnus.id); expect(haakon.mother).toBe(blanche.id);
    expect(magnus.children).toEqual(expect.arrayContaining([eric.id, haakon.id]));
    expect(eric.claims).toContain(N.id); expect(haakon.claims).toContain(S.id);
    const v = dynastyView(s, N)!;
    expect(v.members.map((m) => m.name)).toEqual(expect.arrayContaining(['Eric Magnusson', 'Magnus Eriksson', 'Blanche of Namur']));
    // nobody at the Norwegian court, but the house lives on in Sweden: the warning says so, and the crown would pass by blood
    expect(v.warn).toBe('none');
    expect(v.fallback).toMatchObject({ nation: S.id, name: 'Eric Magnusson', kin: true });
    expect(successionClaims(s, N)[0]).toMatchObject({ nation: S.id, char: eric.id, how: 'blood' });
    s.playerNations = [N.id]; s.day += 30; politics.monthly!({ s, w } as any);
    const warn = s.notices.find((x) => x.nation === N.id && x.kind === 'house_warning')!;
    expect(warn.text.de).toMatch(/^An unserem Hof lebt kein Erbe\. .*Erich Magnusson aus unserem Haus, der in Schweden lebt/);
    expect(warn.text.de).not.toContain('Niemand aus unserem Haus');
    // Haakon dies childless: Norway passes to the house in Sweden, in a personal union
    characterDies(s, w, N, haakon.id);
    expect(N.ruler === magnus.id || S.ruler === N.ruler).toBe(true);
    expect(N.overlord === S.id || S.overlord === N.id).toBe(true);
  });

  it('no couple of the start is a marriage of later years (John Stewart wed Annabella Drummond, then five, about 1367)', () => {
    const { s } = newGame(1356);
    // (royal brides of twelve, wed as children, are history: Jeanne of France married Charles of Navarre in 1352)
    const young = Object.values(s.chars).filter((c) => c.alive && c.spouse && s.chars[c.spouse]?.alive && ageOf(s, c) < 10).map((c) => c.name);
    expect(young).toEqual([]);
    expect(named(s, 'John Stewart').spouse).toBeUndefined();
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

  it('a declined offer is not repeated for years; subjects offer no alliance or marriage, small lordships no marriage', () => {
    const { s, w } = newGame(1356);
    const E = nat(s, 'england'); s.playerNations = [E.id];
    const seen = new Map<string, number>(); const repeats: string[] = []; const fromSubjects: string[] = []; const tooSmall: string[] = [];
    const cool: Record<string, number> = { alliance: 3, marriage: 10, access: 2, trade: 3, vassalize: 5, demand: 3 };
    for (let d = 0; d < 365 * 3; d++) {
      for (const p of s.pending.filter((x) => x.nation === E.id && x.event.startsWith('diplo_'))) {
        const key = `${p.ctx.from}_${p.event}`; const act = p.event.slice(6);
        if (seen.has(key) && s.day - seen.get(key)! < cool[act] * 365 - 1) repeats.push(`${key}@${s.day}`);
        if ((act === 'alliance' || act === 'marriage') && s.nations[p.ctx.from].overlord >= 0) fromSubjects.push(key);
        if (act === 'marriage' && nationDev(s, p.ctx.from) * 6 < nationDev(s, E.id)) tooSmall.push(key);
        seen.set(key, s.day);
        answerEvent(s, w, E.id, p.id, 1);
      }
      advanceDay(s, w);
    }
    expect(repeats).toEqual([]);
    expect(fromSubjects).toEqual([]);
    expect(tooSmall).toEqual([]);
  }, 600000);
});

describe('the AI and the refusal memory (review fix)', () => {
  it('after a refusal the AI asks the next trade partner, not the same one again for three years', () => {
    const { s, w } = newGame(1356);
    for (let d = 0; d < 40; d++) advanceDay(s, w); // (trade flows between the markets)
    const n = s.nations.find((x) => x.alive && aiTradePartner(s, x) >= 0)!;
    const first = aiTradePartner(s, n);
    s.flags[`deny_${n.id}_${first}_trade`] = s.day + 3 * 365;
    expect(refusedRecently(s, n.id, first, 'trade')).toBe(true);
    expect(aiTradePartner(s, n)).not.toBe(first);
  }, 120000);

  it('the AI fabricates a claim only with a free agent and three times the price in the treasury', () => {
    const { s } = newGame(1356);
    const F = nat(s, 'france'), N = nat(s, 'navarre');
    const cost = spyCost(s, F.id, N.id, 'fabricate').cost;
    F.treasury = cost * 3; s.spies = s.spies.filter((x) => x.nation !== F.id);
    expect(aiMayFabricate(s, F, N.id)).toBe(true);
    F.treasury = cost * 3 - 1;
    expect(aiMayFabricate(s, F, N.id)).toBe(false);
    F.treasury = cost * 10;
    s.spies.push({ nation: F.id, target: N.id, action: 'slander', progress: 0, days: 120 }, { nation: F.id, target: N.id, action: 'steal_tech', progress: 0, days: 120 });
    expect(aiMayFabricate(s, F, N.id)).toBe(false); // both agents busy
  });
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

describe('houses that live', () => {
  // months of the people's lives without the rest of the game: politics.monthly runs every court's month
  const months = (s: GameState, w: any, k: number) => { for (let i = 0; i < k; i++) { s.day += 30; politics.monthly!({ s, w } as any); } };

  it('brothers, sisters and nephews age and die, not only rulers, heirs and officials', () => {
    const { s, w } = newGame(1356);
    const E = nat(s, 'england');
    const r = s.chars[E.ruler];
    const kin = [...r.children, ...r.children.flatMap((k) => s.chars[k].children)].map((id) => s.chars[id]).filter((c) => c.alive && c.role === 'courtier');
    expect(kin.length).toBeGreaterThanOrEqual(8);
    // the youngest son, made ninety years old: he no longer lives for ever as a courtier
    const old = kin.find((c) => c.name === 'Thomas of Woodstock')!; old.born = s.day - 90 * 365;
    months(s, w, 60);
    expect(old.alive).toBe(false);
  });

  it('mothers, widowed queens and the wives of princes age and die too; nobody lives past a hundred (review fix)', () => {
    const { s, w } = newGame(1356);
    const E = nat(s, 'england');
    // the queen mother (Isabella of France, born 1295), Lionel's wife (Elizabeth de Burgh, born 1332), the queen mother
    // of Hungary (Elizabeth of Poland): none of them rules, is heir, consort or official, and before none of them drew
    const isabella = named(s, 'Isabella of France'), eliz = named(s, 'Elizabeth de Burgh'), hu = named(s, 'Elizabeth of Poland');
    for (const c of [isabella, eliz, hu]) { expect(c.alive).toBe(true); expect(Object.values(E.council)).not.toContain(c.id); }
    // the king dies: Philippa is a widowed queen, no longer anyone's consort; made ninety, she does not outlive the year
    const philippa = s.chars[E.consort];
    characterDies(s, w, E, E.ruler);
    expect(E.consort).not.toBe(philippa.id);
    philippa.born = s.day - 90 * 365;
    months(s, w, 24);
    expect(philippa.alive).toBe(false);
    // seventy years on, the women of the start are dead at plausible ages, and nobody of any court is older than 100
    months(s, w, 12 * 70 - 24);
    for (const c of [isabella, eliz, hu]) { expect(c.alive).toBe(false); expect((c.died! - c.born) / 365.25).toBeLessThan(100); }
    const ancient = Object.values(s.chars).filter((c) => c.alive && ageOf(s, c) > 100 && !s.nations.some((n) => n.alive && (n.generals ?? []).includes(c.id)));
    expect(ancient.map((c) => c.name)).toEqual([]);
  }, 180000);

  it('a consort or heir who holds an office draws one death a month, not two', () => {
    const { s, w } = newGame(1356);
    const E = nat(s, 'england');
    const cons = s.chars[E.consort];
    E.council.chancellor = cons.id;
    cons.born = s.day - 60 * 365; cons.health = 1;
    s.day += 30; politics.monthly!({ s, w } as any);
    // one month of ageing past fifty takes 0.002 of health once
    expect(cons.health).toBeCloseTo(0.998, 9);
  });

  it('unwed heirs of age marry and have children, with names their brothers and sisters do not bear', () => {
    const { s, w } = newGame(1356);
    const heirs = () => s.nations.filter((n) => n.alive && n.heir && s.chars[n.heir]?.alive && s.chars[n.heir].nation === n.id && n.heir !== n.ruler);
    const single = heirs().filter((n) => { const h = s.chars[n.heir]; return !h.spouse && ageOf(s, h) > 18 && ageOf(s, h) < 35; }).map((n) => n.heir);
    expect(single.length).toBeGreaterThan(10);
    const day0 = s.day;
    months(s, w, 60);
    // (the dead are pruned from s.chars after a while)
    const living = single.filter((id) => s.chars[id]?.alive);
    const wed = living.filter((id) => s.chars[id].spouse && s.chars[s.chars[id].spouse!]?.spouse === id);
    expect(wed.length / living.length).toBeGreaterThan(0.5);
    const born = wed.flatMap((id) => s.chars[id].children.filter((k) => (s.chars[k]?.born ?? 0) > day0));
    expect(born.length).toBeGreaterThan(0);
    // a fresh given name: never that of a living brother or sister
    const r = s.chars[nat(s, 'england').ruler];
    const taken = new Set(r.children.map((k) => s.chars[k]).filter((c) => c.alive).map((c) => c.name.split(' ')[0]));
    for (let i = 0; i < 30; i++) expect(taken.has(freshGivenName(s, nat(s, 'england').culture, true, r))).toBe(false);
  });
});

describe('traits', () => {
  it('every trait a person can bear has a name in both languages and a rule (an effect, a health effect or none by design)', () => {
    const ids = new Set<string>();
    const walk = (o: any) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (k === 'traits' && Array.isArray(v)) v.forEach((x) => typeof x === 'string' && ids.add(x)); else walk(v); } };
    walk(JSON.parse(readFileSync('public/data/setup_1356.json', 'utf8')));
    for (const f of readdirSync('data/history/1356')) walk(JSON.parse(readFileSync(`data/history/1356/${f}`, 'utf8')));
    const files = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(`${d}/${e.name}`) : e.name.endsWith('.ts') ? [`${d}/${e.name}`] : []));
    for (const f of files('src/sim')) {
      if (f.endsWith('content/traits.ts')) continue;
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/TRAITS_\w+\s*=\s*\[([^\]]*)\]/g)) for (const x of m[1].matchAll(/'([a-z_]+)'/g)) ids.add(x[1]);
      for (const m of src.matchAll(/traits(?:\.includes|\.push)\('([a-z_]+)'\)/g)) ids.add(m[1]);
      for (const m of src.matchAll(/traits:\s*\[([^\]]*)\]/g)) for (const x of m[1].matchAll(/'([a-z_]+)'/g)) ids.add(x[1]);
    }
    expect(ids.size).toBeGreaterThan(100);
    const i18n = readFileSync('src/ui/i18n.ts', 'utf8');
    const COMMANDER = new Set(['tactician', 'veteran', 'wounded']);
    const untranslated = [...ids].filter((k) => !new RegExp(`['\\s{,]trait_${k.replace('-', '\\-')}'?: \\['[^']+', '[^']+'\\]`).test(i18n));
    const unruled = [...ids].filter((k) => !RULER_TRAIT_FX[k] && !TRAITS_DESCRIPTIVE.has(k) && !TRAITS_HEALTH[k] && !COMMANDER.has(k));
    expect(untranslated).toEqual([]);
    expect(unruled).toEqual([]);
  });

  it("the ruler's traits act on the realm, not under a regent, and pass with the crown", () => {
    const { s, w } = newGame(1356);
    const E = nat(s, 'england'); const r = s.chars[E.ruler];
    const fx = (k: string) => { DAY_EPOCH.v++; return lawEffect(E, k); }; // lawEffect keeps one table per day
    r.traits = []; syncRulerTraits(s, E);
    expect(E.modifiers.some((m) => m.id === 'ruler_traits')).toBe(false);
    const unrest0 = fx('unrest'), admin0 = fx('admin'), tax0 = fx('tax');
    r.traits = ['just', 'diligent']; syncRulerTraits(s, E);
    expect(fx('unrest')).toBeCloseTo(unrest0 - 1, 9);
    expect(fx('admin')).toBeCloseTo(admin0 + 0.05, 9);
    expect(fx('tax')).toBeCloseTo(tax0 + 0.02, 9);
    expect(E.modifiers.find((m) => m.id === 'ruler_traits')!.label.de).toBe('Eigenschaften des Herrschers');
    // a regent governs for a child: the child's traits wait
    E.regent = s.chars[E.heir].id; syncRulerTraits(s, E);
    expect(fx('unrest')).toBeCloseTo(unrest0, 9);
    E.regent = 0;
    // the Black Prince inherits: his traits, not his father's
    const bp = s.chars[E.heir]; bp.traits = ['greedy'];
    characterDies(s, w, E, r.id);
    expect(E.ruler).toBe(bp.id);
    expect(fx('unrest')).toBeCloseTo(unrest0 + 1, 9);
    expect(fx('tax')).toBeCloseTo(tax0 + 0.05, 9);
  });
});

describe('traits under a regency (review fix)', () => {
  it('a child ruler\'s traits do not act under a regent, and the nation view says so for the tooltip', () => {
    const { s, w } = newGame(1356);
    const N = nat(s, 'norway'); const r = s.chars[N.ruler];
    expect(N.regent).toBeGreaterThan(0);
    expect(r.traits.some((k) => RULER_TRAIT_FX[k])).toBe(true);
    expect(N.modifiers.some((m) => m.id === 'ruler_traits')).toBe(false);
    expect(answer(s, w, N.id, { q: 'nation', nation: N.id } as any).regency).toBe(true);
    expect(answer(s, w, N.id, { q: 'nation', nation: nat(s, 'england').id } as any).regency).toBe(false);
    expect(readFileSync('src/ui/panels/government.tsx', 'utf8')).toContain('<TraitChip k={x} ruler regency={!!me.regency} />');
  });
});

describe('the council', () => {
  it('a dead official is replaced at once by the ablest at court, and the player is told who', () => {
    const { s, w } = newGame(1356);
    const E = nat(s, 'england'); s.playerNations = [E.id]; s.day = 40;
    politics.monthly!({ s, w } as any); // candidates for office at court
    const cands = officeCandidates(s, E).filter((c) => c.id !== E.heir);
    expect(cands.length).toBeGreaterThan(0);
    const best = [...cands].sort((a, b) => officeBonusOf(b, 'chancellor') - officeBonusOf(a, 'chancellor') || a.id - b.id)[0];
    const dead = s.chars[E.council.chancellor];
    characterDies(s, w, E, dead.id);
    expect(E.council.chancellor).toBe(best.id);
    const n = s.notices.find((x) => x.nation === E.id && x.kind === 'council')!;
    expect(n.text.de).toContain(`${localName(dead.name, 'de')} ist gestorben.`);
    expect(n.text.de).toContain(`${localName(best.name, 'de', best.female)} übernimmt das Amt des Kanzlers als Fähigste`);
  });

  it('"appoint the ablest" names the best candidate for one office or for the whole council, at the usual cost', () => {
    const { s, w } = newGame(1356);
    const E = nat(s, 'england'); s.playerNations = [E.id]; s.day = 40;
    politics.monthly!({ s, w } as any);
    // a weak council: every holder has no skill, so an abler candidate beats each one
    for (const o of OFFICES) s.chars[E.council[o.id]].skills = [0, 0, 0];
    E.authority = 100;
    const pick = (off: string) => [...officeCandidates(s, E)].filter((c) => c.id !== E.heir).sort((a, b) => officeBonusOf(b, off) - officeBonusOf(a, off) || a.id - b.id)[0];
    const m = pick('marshal');
    expect(applyCommand(s, w, { t: 'office', n: E.id, office: 'marshal', char: -1 }).ok).toBe(true);
    expect(E.council.marshal).toBe(m.id);
    expect(E.authority).toBe(90);
    // again: nobody is abler now
    expect(applyCommand(s, w, { t: 'office', n: E.id, office: 'marshal', char: -1 }).ok).toBe(false);
    const before = OFFICES.map((o) => officeBonusOf(s.chars[E.council[o.id]], o.id));
    expect(applyCommand(s, w, { t: 'office', n: E.id, office: '*', char: -1 }).ok).toBe(true);
    const after = OFFICES.map((o) => officeBonusOf(s.chars[E.council[o.id]], o.id));
    expect(after.every((v, i) => v >= before[i])).toBe(true);
    expect(after.reduce((a, b) => a + b, 0)).toBeGreaterThan(before.reduce((a, b) => a + b, 0));
    expect(E.authority).toBe(90 - 10 * after.filter((v, i) => v > before[i]).length);
  });
});

describe('filling the council with the ablest (review fix)', () => {
  it('the panel shows the plan the command carries out: nobody twice, no official moved, the cost of each step', () => {
    const { s, w } = newGame(1356);
    const E = nat(s, 'england'); s.playerNations = [E.id]; s.day = 40;
    politics.monthly!({ s, w } as any);
    // a weak council, as in the reviewer's game: one able candidate would be the ablest for several offices
    for (const o of OFFICES) s.chars[E.council[o.id]].skills = [0, 0, 0];
    const officials = new Set(Object.values(E.council));
    const plan = ablestPlan(s, E);
    expect(plan.length).toBeGreaterThan(1);
    expect(new Set(plan.map((p) => p.char)).size).toBe(plan.length);
    expect(new Set(plan.map((p) => p.office)).size).toBe(plan.length);
    for (const p of plan) { expect(officials.has(p.char)).toBe(false); expect(p.char).not.toBe(E.heir); expect(p.gain).toBeGreaterThan(0); }
    // the view hands the same plan to the panel
    const v = answer(s, w, E.id, { q: 'realm' } as any);
    expect(v.ablestPlan.map((p: any) => [p.office, p.char])).toEqual(plan.map((p) => [p.office, p.char]));
    // Authority for two steps only: exactly the first two are appointed, at 10 each, and nobody dismissed is re-seated
    E.authority = 25;
    expect(applyCommand(s, w, { t: 'office', n: E.id, office: '*', char: -1 }).ok).toBe(true);
    expect(E.authority).toBe(5);
    for (const p of plan.slice(0, 2)) expect(E.council[p.office]).toBe(p.char);
    for (const p of plan.slice(2)) expect(E.council[p.office]).not.toBe(p.char);
    for (const id of Object.values(E.council)) expect(officials.has(id) || plan.slice(0, 2).some((p) => p.char === id)).toBe(true);
    // the rest of the plan with more Authority: what is left is carried out as the panel now shows it
    E.authority = 100;
    const rest = ablestPlan(s, E);
    expect(rest.map((p) => p.office)).toEqual(plan.slice(2).map((p) => p.office));
    expect(applyCommand(s, w, { t: 'office', n: E.id, office: '*', char: -1 }).ok).toBe(true);
    expect(E.authority).toBe(100 - 10 * rest.length);
    for (const p of rest) expect(E.council[p.office]).toBe(p.char);
    expect(ablestPlan(s, E)).toEqual([]);
    expect(applyCommand(s, w, { t: 'office', n: E.id, office: '*', char: -1 }).ok).toBe(false);
  });
});

describe('espionage', () => {
  it('an operation costs by what is asked, our income and the size of the target, and the parts add up', () => {
    const { s, w } = newGame(1356);
    const E = nat(s, 'england'), F = nat(s, 'france'), N = nat(s, 'navarre');
    const big = spyCost(s, E.id, F.id, 'fabricate'), small = spyCost(s, E.id, N.id, 'fabricate');
    expect(big.cost).toBeGreaterThan(small.cost);
    expect(spyCost(s, E.id, F.id, 'steal_tech').cost).toBeGreaterThan(spyCost(s, E.id, F.id, 'slander').cost);
    expect(small.cost).toBeGreaterThan(30);
    for (const c of [big, small]) expect(Math.round(c.parts.reduce((a, x) => a + x[1], 0))).toBe(c.cost);
    const before = E.treasury;
    expect(startSpy(s, E.id, N.id, 'slander')).toBeNull();
    expect(before - E.treasury).toBe(spyCost(s, E.id, N.id, 'slander').cost);
    // the view the nation panel shows is the same number
    expect(answer(s, w, E.id, { q: 'nation', nation: F.id } as any).rel.spyCosts.fabricate.cost).toBe(big.cost);
  });

  it('fabricating a claim from the diplomacy list is the same agent operation (one path, one cost, one limit)', () => {
    const { s, w } = newGame(1356);
    const E = nat(s, 'england'), N = nat(s, 'navarre'); s.playerNations = [E.id];
    const cost = spyCost(s, E.id, N.id, 'fabricate').cost, before = E.treasury;
    expect(applyCommand(s, w, { t: 'diplo', n: E.id, action: 'fabricate', target: N.id }).ok).toBe(true);
    expect(before - E.treasury).toBe(cost);
    expect(s.spies.filter((x) => x.nation === E.id && x.action === 'fabricate').map((x) => x.days)).toEqual([240]);
    expect(applyCommand(s, w, { t: 'spy', n: E.id, action: 'fabricate', target: N.id }).ok).toBe(false);
  });
});

describe('German text', () => {
  it('seas, gulfs and the holdings of Venice and Genoa have German names', () => {
    expect(deName('Atlantic Ocean (North) 3')).toBe('Atlantischer Ozean (Nord) 3');
    expect(deName('Gulf of Bothnia (North-East) 2')).toBe('Bottnischer Meerbusen (Nordost) 2');
    expect(deName('Eclipse Sound')).toBe('Eclipse-Sund');
    expect(deName('Venetian Crete')).toBe('Venezianisches Kreta');
    expect(deName('Genoese Corsica – Bonifacio')).toBe('Genuesisches Korsika – Bonifacio');
    expect(deName('Despotate of the Morea')).toBe('Despotat Morea');
  });

  it('an event text declines the ruler\'s epithet after a verb or preposition', () => {
    const { s, w } = newGame(1356);
    const C = nat(s, 'castile');
    const x = (de: string) => interpolate(s, w, C, {}, { en: 'x', de }).de;
    expect(x('Der Befehlshaber fragt {ruler}, ob')).toBe('Der Befehlshaber fragt Peter I. den Grausamen, ob');
    expect(x('Ein Gelehrter ist zu {ruler} gekommen.')).toBe('Ein Gelehrter ist zu Peter I. dem Grausamen gekommen.');
    expect(x('Solange {ruler} lebt')).toBe('Solange Peter I. der Grausame lebt');
    expect(x('Granada hat {ruler_dat} die Schlüssel')).toBe('Granada hat Peter I. dem Grausamen die Schlüssel');
    expect(declineDe('Eduard von Woodstock (der Schwarze Prinz)', false, 'acc')).toBe('Eduard von Woodstock (den Schwarzen Prinzen)');
    expect(declineDe('Margarete die Große', true, 'dat')).toBe('Margarete der Großen');
    expect(declineDe('Karl, Dauphin und Herzog der Normandie', false, 'dat')).toBe('Karl, Dauphin und Herzog der Normandie');
    // review fixes: "trugen" asks the accusative, "das … Geld geliehen hat" the dative, and a council is not a name
    expect(x('Die Jäger trugen {ruler_acc} auf einer Trage')).toBe('Die Jäger trugen Peter I. den Grausamen auf einer Trage');
    expect(x('Die Jäger trugen {ruler} zurück')).toBe('Die Jäger trugen Peter I. der Grausame zurück'); // (no rule by the word: the text says which case)
    const ev = (file: string, re: RegExp) => readFileSync(`src/sim/content/events/${file}`, 'utf8').match(re)?.[0];
    expect(ev('court.ts', /Die Jäger trugen \{ruler_acc\}/)).toBeTruthy();
    expect(ev('economy.ts', /das \{ruler_dat\} Geld geliehen hat/)).toBeTruthy();
    expect(x('Das große Bankhaus, das {ruler_dat} Geld geliehen hat')).toBe('Das große Bankhaus, das Peter I. dem Grausamen Geld geliehen hat');
    expect(declineDe('Rat der Sachems', false, 'acc')).toBe('Rat der Sachems');
    expect(declineDe('Rat der Sachems', false, 'dat')).toBe('Rat der Sachems');
    expect(declineDe('Häuptling der Cocom', false, 'dat')).toBe('Häuptling der Cocom');
  });

  it('rulers, heirs and consorts of 1356 show German names: no English given name, no English council (review fix)', () => {
    const { s } = newGame(1356);
    const EN = /\b(of|the|The|and|Council|Diet|under|John|Henry|William|Charles|Edward|Frederick|Louis|Philip|James|Mary|Margaret|Joan|Elizabeth|Catherine|Eleanor|Blanche|Stephen|Andrew|Nicholas|Hugh|Jean|Pierre|Juan|Pedro|Enrique|Guillaume|Henri)\b/;
    const hits: string[] = [];
    for (const n of s.nations) if (n.alive) for (const id of [n.ruler, n.heir, n.consort]) {
      const c = s.chars[id]; if (!c) continue;
      const de = localName(c.name, 'de', c.female, true);
      // (an English given name stays with a family name of the British Isles, as German writes them; a bishop's own name stays)
      if (EN.test(de) && !/\b(de Mohun|de Burgh|Darcy|Burghersh|Stewart|Butler)\b|Bischof/.test(de)) hits.push(`${n.key}: ${de}`);
    }
    expect(hits).toEqual([]);
    expect(readFileSync('src/sim/content/landmarks.ts', 'utf8')).toContain('den König Peter im maurischen Stil');
  });

  it('the AI log names every command it shows, and Governance is one German word', () => {
    const { s, w } = newGame(1356);
    expect(aiLogText(s, w, { d: 0, c: { t: 'assault' } } as any).de).toBe('Sturmangriff auf eine belagerte Stadt');
    expect(BRANCHES.find((b) => b.id === 'governance')!.name.de).toBe('Verwaltung');
  });
});

describe('commanders', () => {
  it('a great host whose commander dies takes the ablest free one at once, and the player is told who leads it', () => {
    const { s, w } = newGame(1356);
    const a = s.armies.find((x) => !x.fleet && !x.rebels && s.nations[x.owner]?.alive && s.chars[x.general]?.alive && x.regs.reduce((m, r) => m + r.men, 0) > 3000)!;
    const n = s.nations[a.owner];
    s.playerNations = [n.id];
    const old = s.chars[a.general];
    expect(n.generals).toContain(old.id);
    old.born = s.day - 45 * 365; old.health = -200; // (so that he surely dies at the next monthly ageing)
    for (let d = 0; d < 40 && old.alive; d++) advanceDay(s, w);
    expect(old.alive).toBe(false);
    // the same day, not a month later
    expect(a.general).toBeTruthy();
    expect(a.general).not.toBe(old.id);
    expect(s.chars[a.general].alive).toBe(true);
    const nt = s.notices.find((x) => x.nation === n.id && x.kind === 'general_death')!;
    expect(nt.text.de).toContain('übernimmt den Befehl über das Heer');
    expect(nt.text.de).toContain(localName(s.chars[a.general].name, 'de'));
  });
});

describe('event windows and the clock (review fixes)', () => {
  it('an event that arrives behind an open offer window stops the clock; answering resumes only when no such window is left', () => {
    const pauses = pausesWith({ pauseOnEvents: true, pauseOnOffers: false });
    const offer = { id: 1, event: 'diplo_trade' }, feast = { id: 2, event: 'court_feast' };
    // the offer alone: the game runs on
    const known = new Set<number>();
    expect(arrivedPausing(known, [offer], pauses)).toEqual([]);
    known.add(offer.id);
    // the event arrives behind it: it stops the clock although the offer stays in front
    expect(arrivedPausing(known, [offer, feast], pauses).map((e) => e.id)).toEqual([2]);
    known.add(feast.id);
    expect(arrivedPausing(known, [offer, feast], pauses)).toEqual([]);
    // answering the offer leaves the event: no resume; answering the event: resume
    expect(mayResume([offer, feast], offer.id, pauses)).toBe(false);
    expect(mayResume([feast], feast.id, pauses)).toBe(true);
    // a player who asked to pause on offers too
    expect(arrivedPausing(null, [offer], pausesWith({ pauseOnEvents: true, pauseOnOffers: true })).length).toBe(1);
  });
});
