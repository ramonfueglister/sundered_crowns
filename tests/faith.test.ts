// Spec point 78: every faith has a mechanic of its own that works in the simulation. For each faith in FAITHS a realm
// of that faith (or holding its communities) is set up and the mechanic must change a value the simulation reads,
// against a control realm without it. Run: npx vitest run tests/faith.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { serialize, deserialize } from '../src/sim/engine';
import { applyCommand } from '../src/sim/commands';
import { mkCtx, mod, bump, DAY_EPOCH } from '../src/sim/ctx';
import { FAITHS, FAITH_INDEX as F } from '../src/sim/content/peoples';
import { LAW_INDEX, LAWS } from '../src/sim/content/laws';
import { B, BI, BUILDINGS } from '../src/sim/defs';
import { faith, locByName, patriarchProtector } from '../src/sim/systems/faith';
import { mandateParts, concordParts, sumParts, authorityGain } from '../src/sim/systems/politics';
import { takeDecision } from '../src/sim/systems/events';
import { sideStats, attritionMonth, newArmy, availableUnits, armyMen, khanFaith } from '../src/sim/systems/military';
import { agentsMonth, society } from '../src/sim/systems/society';
import { locationStep, effectiveTax, takeLoan } from '../src/sim/systems/economy';
import { researchRate } from '../src/sim/systems/progress';
import { opinionBreakdown, libertyParts } from '../src/sim/systems/diplomacy';
import { casusBelliAll, nationLocs, applyPeace } from '../src/sim/systems/war';
import type { GameState, Nation } from '../src/sim/types';

const w = loadWorld();
let BASE = '';
beforeAll(() => { BASE = serialize(createGame(w, loadSetup(1356), loadHubs(), 1356, { player: [] })); });
const fresh = () => deserialize(BASE) as GameState;
const nat = (s: GameState, key: string) => s.nations.find((n) => n.key === key)!;
/** Caches of law effects and taxes are kept per day: start a new "day" after changing a realm by hand. */
const touch = () => { DAY_EPOCH.v++; bump(); };
/** The monthly faith pass (refreshes every faith modifier). */
const faithMonth = (s: GameState) => { touch(); faith.monthly!(mkCtx(s, w)); touch(); };
const mandateTarget = (s: GameState, n: Nation) => sumParts(mandateParts(s, n));
const concordTarget = (s: GameState, n: Nation) => sumParts(concordParts(s, n));
const setFaith = (s: GameState, n: Nation, f: string) => { n.faith = F[f]; for (const l of nationLocs(s, n.id)) s.loc.faith[l] = F[f]; };
const setLaw = (n: Nation, law: string, opt: string) => { n.laws[law] = LAWS[LAW_INDEX[law]].options.findIndex((o) => o.id === opt); };
/** A location of the realm that is not its capital, preferably of a given faith. */
const homeLoc = (s: GameState, n: Nation, pred: (l: number) => boolean = () => true) => nationLocs(s, n.id).find((l) => l !== n.capital && pred(l)) ?? n.capital;
/** Battle stats of a 5000-man army of n standing at loc. */
function battleSide(s: GameState, n: Nation, loc: number) {
  const unit = availableUnits(s, n, false)[0];
  const a = newArmy(s, n.id, loc, [{ type: unit, men: 5000 }]);
  touch();
  return sideStats(s, w, [a], loc, false, []);
}

/** One case per faith: mech is a value with the mechanic, ctrl the same value without it. */
const CASES: Record<string, () => { mech: number; ctrl: number; higher: boolean }> = {
  latin: () => {
    // Curia favour raises the Mandate; excommunication frees vassals and gives fellow Latins a cause for war
    const s = fresh(); const a = nat(s, 'aragon'), c = nat(s, 'castile'), nav = nat(s, 'navarre');
    s.papacy.curiaFavour[a.id] = 0; faithMonth(s); const ctrl = mandateTarget(s, a);
    s.papacy.curiaFavour[a.id] = 90; faithMonth(s); const mech = mandateTarget(s, a);
    s.papacy.curiaFavour[c.id] = 80;
    nav.overlord = a.id; nav.subjectType = 'vassal';
    const before = libertyParts(s, w, nav, a).find((x) => x[0] === 'overlord_excommunicated')![1];
    expect(applyCommand(s, w, { t: 'diplo', n: c.id, action: 'excommunicate', target: a.id }).ok).toBe(true);
    expect(a.excommunicated).toBe(true);
    expect(casusBelliAll(s, c.id, a.id)).toContain('excommunicated');
    expect(libertyParts(s, w, nav, a).find((x) => x[0] === 'overlord_excommunicated')![1]).toBeGreaterThan(before);
    return { mech, ctrl, higher: true };
  },
  orthodox: () => {
    // the protector of Constantinople gains Mandate; when infidels take it, another Orthodox realm becomes protector
    const s = fresh(); const byz = nat(s, 'byzantium'), ott = nat(s, 'ottoman');
    faithMonth(s);
    expect(s.flags.patriarch).toBe(byz.id);
    const mech = mandateTarget(s, byz);
    s.loc.owner[locByName(w, 'Constantinople')] = ott.id; touch();
    faithMonth(s);
    const heir = patriarchProtector(s, w);
    expect(heir).not.toBe(byz.id);
    expect(s.nations[heir].faith).toBe(F.orthodox);
    expect(s.nations[heir].modifiers.some((m) => m.id === 'faith_orthodox')).toBe(true);
    return { mech, ctrl: mandateTarget(s, byz), higher: true };
  },
  sunni: () => {
    // the Sunni protector of the holy cities gains Mandate; pilgrim caravans give Concord
    const s = fresh(); const m = nat(s, 'mamluk');
    // at the start the Sharif of Mecca is a Mamluk vassal: the Mamluk sultan is the protector
    for (const c of ['Mecca', 'Medina']) s.loc.owner[locByName(w, c)] = m.id;
    faithMonth(s); const mech = mandateTarget(s, m);
    const s2 = fresh(); const m2 = nat(s2, 'mamluk'); const o2 = nat(s2, 'ottoman');
    for (const c of ['Mecca', 'Medina']) s2.loc.owner[locByName(w, c)] = o2.id;
    faithMonth(s2); const ctrl = mandateTarget(s2, m2);
    m.treasury = 1e6; const c0 = concordTarget(s, m);
    expect(takeDecision(s, w, m, 'pilgrim_caravan')).toBe(null);
    expect(concordTarget(s, m)).toBeGreaterThan(c0);
    return { mech, ctrl, higher: true };
  },
  shia: () => {
    const s = fresh(); const j = nat(s, 'jalayirid');
    faithMonth(s); const ctrl = concordTarget(s, j);
    j.faith = F.shia; faithMonth(s);
    expect(mod(j, 'conversion')).toBeGreaterThan(0);
    return { mech: concordTarget(s, j), ctrl, higher: true };
  },
  ibadi: () => {
    // a ruler without Mandate is replaced by an elected imam (control: the same realm as Sunni keeps its ruler)
    const s = fresh(); const o = nat(s, 'nabhani_oman');
    const s2 = fresh(); const o2 = nat(s2, 'nabhani_oman'); o2.faith = F.sunni;
    o.mandate = 10; o2.mandate = 10; const r = o.ruler;
    faithMonth(s); faithMonth(s2);
    expect(o.ruler).not.toBe(r);
    return { mech: o.mandate, ctrl: o2.mandate, higher: true };
  },
  jewish: () => {
    // tolerated Jewish communities make credit cheaper; persecution drives them to tolerant neighbours
    const s = fresh(); const a = nat(s, 'aragon');
    const ls = nationLocs(s, a.id).slice(0, 6);
    const s2 = fresh(); const a2 = nat(s2, 'aragon');
    for (const l of ls) { s.loc.minFaith[l] = F.jewish; s.loc.minShare[l] = 0.1; }
    for (const l of nationLocs(s2, a2.id)) if (s2.loc.minFaith[l] === F.jewish) s2.loc.minShare[l] = 0;
    faithMonth(s); faithMonth(s2);
    takeLoan(s, a, 100); takeLoan(s2, a2, 100);
    expect(mod(a, 'trade')).toBeGreaterThan(mod(a2, 'trade'));
    // persecution: the communities leave
    setLaw(a, 'tolerance', 'enforced'); touch();
    const share0 = ls.reduce((p, l) => p + s.loc.minShare[l], 0);
    faith.yearly!(mkCtx(s, w));
    expect(ls.reduce((p, l) => p + s.loc.minShare[l], 0)).toBeLessThan(share0);
    return { mech: a.loans[a.loans.length - 1].rate, ctrl: a2.loans[a2.loans.length - 1].rate, higher: false };
  },
  tengri: () => {
    // a second faith embraced by decision: its land causes no faith unrest
    const make = (embrace: boolean) => {
      const s = fresh(); const h = nat(s, 'golden_horde'); h.faith = F.tengri; h.authority = 100;
      if (embrace) { expect(takeDecision(s, w, h, 'embrace_second_faith')).toBe(null); expect(h.flags.second_faith - 1).toBe(F.sunni); }
      const l = homeLoc(s, h, (x) => s.loc.faith[x] === F.sunni);
      s.loc.unrest[l] = 0; touch(); locationStep(s, w, l);
      return s.loc.unrest[l];
    };
    return { mech: make(true), ctrl: make(false), higher: false };
  },
  baltic_old: () => {
    // sacred groves: defence on home ground (control: the same realm after baptism)
    const s = fresh(); const lt = nat(s, 'lithuania'); faithMonth(s);
    const s2 = fresh(); const lt2 = nat(s2, 'lithuania'); lt2.faith = F.latin; faithMonth(s2);
    const l = homeLoc(s, lt);
    return { mech: battleSide(s, lt, l).terrainDef, ctrl: battleSide(s2, lt2, l).terrainDef, higher: true };
  },
  finnic_old: () => attritionCase('great_perm', 'finnic_old'),
  sami_old: () => attritionCase('great_perm', 'sami_old'),
  coptic: () => {
    // Coptic scribes raise the tax of the realm they live in; Coptic land converts slowly
    const s = fresh(); const m = nat(s, 'mamluk');
    const s2 = fresh(); const m2 = nat(s2, 'mamluk');
    for (const l of nationLocs(s2, m2.id)) { if (s2.loc.faith[l] === F.coptic) s2.loc.faith[l] = F.sunni; if (s2.loc.minFaith[l] === F.coptic) s2.loc.minShare[l] = 0; }
    faithMonth(s); faithMonth(s2);
    const l = homeLoc(s, m);
    expect(effectiveTax(s, m, l, 0)).toBeGreaterThan(effectiveTax(s2, m2, l, 0));
    // conversion of the same place by the same preachers: Coptic against Orthodox
    const conv = (f: string) => {
      const q = fresh(); const mm = nat(q, 'mamluk'); const x = homeLoc(q, mm); q.loc.faith[x] = F[f];
      q.agents = [{ nation: mm.id, loc: x, kind: 'faith', progress: 0 }]; touch(); agentsMonth(q, w);
      return q.agents[0]?.progress ?? 100;
    };
    return { mech: conv('coptic'), ctrl: conv('orthodox'), higher: false };
  },
  ethiopian: () => {
    // Solomonic kingship: the old line gains Mandate, a new dynasty loses it
    const s = fresh(); const e = nat(s, 'ethiopia'); faithMonth(s); const mech = mandateTarget(s, e);
    e.dynasty = 'Zagwe'; faithMonth(s);
    return { mech, ctrl: mandateTarget(s, e), higher: true };
  },
  church_of_east: () => tradeCase('jalayirid', 'church_of_east'),
  armenian_apostolic: () => tradeCase('armenia_cilicia', 'armenian_apostolic'),
  african_traditional: () => {
    // ancestor veneration: an established dynasty has a stronger Mandate than a new one
    const s = fresh(); const b = nat(s, 'benin'); faithMonth(s); const mech = mandateTarget(s, b);
    b.dynasty = 'Ogiso'; faithMonth(s);
    return { mech, ctrl: mandateTarget(s, b), higher: true };
  },
  american_traditional: () => homeCase('haudenosaunee_ancestral', 'american_traditional', 'terrainDef'),
  mesoamerican: () => {
    // wars of capture: battles won raise the Mandate
    const run = (f: string) => { const s = fresh(); const t = nat(s, 'tenochtitlan'); t.faith = F[f]; faithMonth(s); t.mandate = 40; t.stats.battlesWon += 2; faithMonth(s); return t.mandate; };
    return { mech: run('mesoamerican'), ctrl: run('andean'), higher: true };
  },
  andean: () => {
    // labour duty: buildings are finished faster
    const run = (f: string) => {
      const s = fresh(); const c = nat(s, 'cusco'); c.faith = F[f]; c.treasury = 1e6; faithMonth(s);
      const l = homeLoc(s, c); const b = BUILDINGS.findIndex((x) => x.id === 'farm');
      s.loc.buildings[l * B + b] = 0;
      expect(applyCommand(s, w, { t: 'build', n: c.id, loc: l, building: b }).ok).toBe(true);
      return s.constructions[s.constructions.length - 1].left;
    };
    return { mech: run('andean'), ctrl: run('mesoamerican'), higher: false };
  },
  bosnian_church: () => {
    // tolerant: little unrest from land of other faiths; distrusted by the Latin and Orthodox churches
    const run = (f: string) => {
      const s = fresh(); const b = nat(s, 'bosnia'); b.faith = F[f]; faithMonth(s);
      const l = homeLoc(s, b); s.loc.faith[l] = F.orthodox; s.loc.unrest[l] = 0; touch(); locationStep(s, w, l);
      if (f === 'bosnian_church') expect(opinionBreakdown(s, w, nat(s, 'hungary').id, b.id).some((x) => x[0] === 'heretic_church')).toBe(true);
      return s.loc.unrest[l];
    };
    return { mech: run('bosnian_church'), ctrl: run('latin'), higher: false };
  },
  syriac_orthodox: () => {
    // Syriac scholars raise research in the realm they live in
    const s = fresh(); const a = nat(s, 'artuqid_mardin'); faithMonth(s);
    const s2 = fresh(); const a2 = nat(s2, 'artuqid_mardin');
    for (const l of nationLocs(s2, a2.id)) { if (s2.loc.faith[l] === F.syriac_orthodox) s2.loc.faith[l] = F.sunni; if (s2.loc.minFaith[l] === F.syriac_orthodox) s2.loc.minShare[l] = 0; }
    faithMonth(s2);
    return { mech: researchRate(s, w, a)[0], ctrl: researchRate(s2, w, a2)[0], higher: true };
  },
  hindu: () => {
    // temple patronage: every temple raises Mandate and Concord
    const run = (temples: number) => {
      const s = fresh(); const a = nat(s, 'aragon'); setFaith(s, a, 'hindu');
      for (const l of nationLocs(s, a.id)) s.loc.buildings[l * B + BI.church] = 0;
      for (const l of nationLocs(s, a.id).slice(0, temples)) s.loc.buildings[l * B + BI.church] = 1;
      faithMonth(s); return mandateTarget(s, a);
    };
    return { mech: run(6), ctrl: run(0), higher: true };
  },
  hussite: () => homeCase('bohemia', 'hussite', 'homeMorale'),
  evangelical: () => {
    // secularised church lands: gold and Authority for the prince
    const run = (f: string) => {
      const s = fresh(); const b = nat(s, 'brandenburg'); b.faith = F[f]; faithMonth(s);
      const g0 = b.treasury; takeDecision(s, w, b, 'secularise_church_lands'); return b.treasury - g0;
    };
    return { mech: run('evangelical'), ctrl: run('reformed'), higher: true };
  },
  reformed: () => {
    const run = (f: string) => { const s = fresh(); const b = nat(s, 'brandenburg'); b.faith = F[f]; faithMonth(s); return mod(b, 'trade') + mod(b, 'production'); };
    return { mech: run('reformed'), ctrl: run('evangelical'), higher: true };
  },
  anglican_type: () => {
    // the crown heads the church: Mandate and Authority
    const run = (f: string) => { const s = fresh(); const e = nat(s, 'england'); e.faith = F[f]; s.papacy.curiaFavour[e.id] = 0; faithMonth(s); return mandateTarget(s, e) + authorityGain(s, e); };
    return { mech: run('anglican_type'), ctrl: run('latin'), higher: true };
  },
};
/** Spirits of the land: an army at home loses fewer men to attrition. */
function attritionCase(key: string, f: string) {
  const run = (ff: string) => {
    const s = fresh(); const n = nat(s, key); n.faith = F[ff]; faithMonth(s);
    s.armies = s.armies.filter((a) => a.owner !== n.id);
    const a = newArmy(s, n.id, homeLoc(s, n), [{ type: availableUnits(s, n, false)[0], men: 20000 }]);
    touch(); attritionMonth(s, w); return 20000 - armyMen(a);
  };
  return { mech: run(f), ctrl: run('latin'), higher: false };
}
/** Communities of a trading faith raise the trade of the realm they live in. */
function tradeCase(key: string, f: string) {
  const s = fresh(); const n = nat(s, key); faithMonth(s);
  const s2 = fresh(); const n2 = nat(s2, key);
  for (const l of nationLocs(s2, n2.id)) { if (s2.loc.faith[l] === F[f]) s2.loc.faith[l] = F.sunni; if (s2.loc.minFaith[l] === F[f]) s2.loc.minShare[l] = 0; }
  faithMonth(s2);
  return { mech: mod(n, 'trade'), ctrl: mod(n2, 'trade'), higher: true };
}
/** Defenders of their homeland fight better on their own ground. */
function homeCase(key: string, f: string, stat: 'terrainDef' | 'homeMorale') {
  const run = (ff: string) => { const s = fresh(); const n = nat(s, key); n.faith = F[ff]; faithMonth(s); return battleSide(s, n, homeLoc(s, n))[stat]; };
  return { mech: run(f), ctrl: run('latin'), higher: true };
}

describe('faith mechanics (point 78)', () => {
  it('every faith has a case here', () => {
    for (const f of FAITHS) expect(CASES[f.id], f.id).toBeTypeOf('function');
  });
  for (const f of FAITHS) {
    it(`${f.id}: ${f.mechanic.en}`, () => {
      const r = CASES[f.id]();
      expect(Number.isFinite(r.mech) && Number.isFinite(r.ctrl), `${f.id} values ${r.mech} / ${r.ctrl}`).toBe(true);
      if (r.higher) expect(r.mech, `${f.id}: ${r.mech} vs control ${r.ctrl}`).toBeGreaterThan(r.ctrl);
      else expect(r.mech, `${f.id}: ${r.mech} vs control ${r.ctrl}`).toBeLessThan(r.ctrl);
    });
  }
});

// The faith mechanics must be able to fire in a game, not only when a test sets a realm's faith by hand.
describe('faiths in play (point 78)', () => {
  it('Bosnia starts in the Bosnian Church, and its mechanic is at work from the first month', () => {
    const s = fresh(); const b = nat(s, 'bosnia');
    expect(b.faith).toBe(F.bosnian_church);
    faithMonth(s);
    expect(b.modifiers.some((m) => m.id === 'faith_bosnian_church')).toBe(true);
  });

  it('tolerated Jewish communities keep their faith for generations; other minorities fade', () => {
    const s = fresh(); const ctx = mkCtx(s, w);
    faithMonth(s);
    const count = () => s.nations.filter((n) => n.alive && n.modifiers.some((m) => m.id === 'faith_jewish')).length;
    const before = count();
    expect(before).toBeGreaterThan(5);
    const jew = [...Array(w.L).keys()].find((l) => s.loc.owner[l] >= 0 && s.loc.minFaith[l] === F.jewish && s.loc.minShare[l] > 0.02)!;
    const other = [...Array(w.L).keys()].find((l) => s.loc.owner[l] >= 0 && s.loc.minFaith[l] !== F.jewish && s.loc.minShare[l] > 0.1)!;
    const j0 = s.loc.minShare[jew], o0 = s.loc.minShare[other];
    for (let k = 0; k < 10; k++) society.yearly!(ctx);
    expect(s.loc.minShare[jew]).toBeCloseTo(j0, 6);
    expect(s.loc.minShare[other]).toBeLessThan(o0);
    faithMonth(s);
    expect(count()).toBe(before);
  });

  it('a people set free keeps its own faith; a khan over the forest peoples returns to the steppe faith', () => {
    // Norway releases its Sámi land in a peace: the new realm follows the Sámi faith
    const s = fresh(); const no = nat(s, 'norway'), sw = nat(s, 'sweden');
    const sami = nationLocs(s, no.id).filter((l) => s.loc.faith[l] === F.sami_old).slice(0, 8);
    expect(sami.length).toBe(8);
    s.wars = []; s.treaties = s.treaties.filter((t) => t.type !== 'truce' && t.type !== 'alliance');
    expect(applyCommand(s, w, { t: 'declare', n: sw.id, target: no.id, goal: 'conquest' }).ok).toBe(true);
    const wr = s.wars[s.wars.length - 1];
    const n0 = s.nations.length;
    applyPeace(s, w, wr, sw.id, no.id, [{ type: 'release', locs: sami }]);
    const freed = s.nations.find((n) => n.alive && n.id !== no.id && s.loc.owner[sami[0]] === n.id)!;
    expect(s.nations.length).toBeGreaterThanOrEqual(n0);
    expect(freed.faith).toBe(F.sami_old);
    // a khanate breaking from the (Sunni) Horde over Finnic and Chuvash land takes the Tengri faith; over Muslim land not
    const h = nat(s, 'golden_horde');
    const forest = nationLocs(s, h.id).filter((l) => FAITHS[s.loc.faith[l]].family === 'traditional').slice(0, 20);
    const steppe = nationLocs(s, h.id).filter((l) => s.loc.faith[l] === F.sunni).slice(0, 20);
    expect(khanFaith(s, h, forest)).toBe(F.tengri);
    expect(khanFaith(s, h, steppe)).toBe(F.sunni);
  });
});
