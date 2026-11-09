// Diplomacy: opinion with reasons, trust, envoys that travel, actions with AI answers and reasons, subjects, espionage.
import { techBase } from './progress';
import type { GameState, Nation, Envoy } from '../types';
import type { World } from '../world';
import { type System, clamp, chronicle, notice, addOpinion, opinion, rel, hasTreaty, allies, atWar, subjectsOf, treatiesOf, addExpense } from '../ctx';
import { rand, chance } from '../rng';
import { GROUP_OF, ALL_CULTURES, FAITHS } from '../content/peoples';
import { nationDev, declareWar, hasCasusBelli, gatherClaim } from './war';
import { lawEffect, councilBonus } from './politics';
import { excommunicate, steppeFade } from './realm';

export const DIPLO_ACTIONS = ['alliance', 'marriage', 'guarantee', 'access', 'trade', 'vassalize', 'gift', 'insult', 'demand', 'break_alliance', 'fabricate', 'rival', 'unrival', 'cancel_access', 'improve', 'excommunicate'] as const;

/** Static opinion reasons computed on demand (plus stored timed modifiers). */
/** Diplomatic standing of a realm: diplomacy effects of laws, values and modifiers plus the chancellor's bonus. It
 *  speeds envoys, makes others think better of the realm and its proposals and deepens improved relations. */
export function diploSkill(s: GameState, n: Nation): number { return lawEffect(n, 'diplomacy') + councilBonus(s, n, 'chancellor'); }
export function opinionBreakdown(s: GameState, w: World, a: number, b: number): [string, number][] {
  const A = s.nations[a], Bn = s.nations[b];
  const out: [string, number][] = [];
  if (A.faith === Bn.faith) out.push(['same_faith', 15]);
  else if (FAITHS[A.faith]?.family === FAITHS[Bn.faith]?.family) out.push(['related_faith', 0]);
  else out.push(['different_faith', -20]);
  if (A.culture === Bn.culture) out.push(['same_culture', 10]);
  else if (GROUP_OF[ALL_CULTURES[A.culture]] === GROUP_OF[ALL_CULTURES[Bn.culture]]) out.push(['kindred_culture', 5]);
  if (A.rivals.includes(b)) out.push(['rival', -50]);
  if (Bn.rivals.includes(a)) out.push(['rivals_us', -30]);
  if (hasTreaty(s, a, b, 'alliance')) out.push(['allied', 40]);
  if (hasTreaty(s, a, b, 'marriage')) out.push(['royal_marriage', 20]);
  if (hasTreaty(s, a, b, 'trade')) out.push(['trade_agreement', 10]);
  if (A.overlord === b) out.push(['overlord', -10 + Math.round(-A.libertyDesire * 0.3)]);
  if (hasTreaty(s, b, a, 'claim') || (s.flags[`gather_${b}_${a}`] ?? 0) > s.day) out.push(['claims_on_us', -25]);
  // shared rival
  if (A.rivals.some((r) => Bn.rivals.includes(r))) out.push(['shared_rival', 25]);
  if (atWar(s, a, b)) out.push(['at_war', -100]);
  const d = Bn.dread; if (d > 10) out.push(['dread', -Math.round(Math.min(60, d))]);
  if (Bn.excommunicated && FAITHS[A.faith]?.id === 'latin') out.push(['excommunicated', -30]);
  const ds = Math.round(diploSkill(s, Bn) * 40); if (ds) out.push(['their_diplomacy', ds]);
  // the loose Bosnian Church has no outside protector: the great churches distrust it
  if (FAITHS[Bn.faith]?.id === 'bosnian_church' && (FAITHS[A.faith]?.id === 'latin' || FAITHS[A.faith]?.id === 'orthodox')) out.push(['heretic_church', -15]);
  const r = s.rel[`${a}>${b}`];
  if (r) for (const m of r.mods) out.push([m.id, Math.round(m.v)]);
  return out;
}
export function totalOpinion(s: GameState, w: World, a: number, b: number) { return opinionBreakdown(s, w, a, b).reduce((p, x) => p + x[1], 0); }
export function trust(s: GameState, a: number, b: number) { return s.rel[`${a}>${b}`]?.trust ?? 50; }

function power(s: GameState, n: number) { return nationDev(s, n) * (1 + s.nations[n].tech[2] * 0.05); }
function distance(s: GameState, w: World, a: number, b: number) { const ca = s.nations[a].capital, cb = s.nations[b].capital; return ca >= 0 && cb >= 0 ? w.distKm(ca, cb) : 3000; }

/** AI answer with reasons for a diplomatic proposal from a to b. */
export function evaluateProposal(s: GameState, w: World, a: number, b: number, action: string): { accept: boolean; reasons: [string, number][] } {
  const R: [string, number][] = [];
  const A = s.nations[a], Bn = s.nations[b];
  const op = totalOpinion(s, w, b, a); R.push(['opinion', Math.round(op * 0.6)]);
  const tr = trust(s, b, a); R.push(['trust', Math.round((tr - 50) * 0.4)]);
  const dist = distance(s, w, a, b);
  const pers = Bn.personality;
  if (action !== 'demand') { const ds = Math.round(diploSkill(s, A) * 40); if (ds) R.push(['envoy_skill', ds]); }
  if (action === 'alliance') {
    R.push(['base', -20]);
    if (dist > 1500) R.push(['too_far', -Math.round((dist - 1500) / 40)]);
    const pa = power(s, a), pb = power(s, b);
    R.push(['relative_strength', Math.round(clamp((pa / Math.max(1, pb) - 0.7) * 20, -30, 25))]);
    const shared = A.rivals.filter((r) => Bn.rivals.includes(r)).length; if (shared) R.push(['shared_rival', 25]);
    // common threat: both fear the same strong neighbour
    const threat = s.nations.find((t) => t.alive && t.id !== a && t.id !== b && t.dread > 20 && distance(s, w, t.id, b) < 1200 && distance(s, w, t.id, a) < 1500);
    if (threat) R.push(['common_threat', 20]);
    const nAll = allies(s, b).length; if (nAll >= 3) R.push(['enough_allies', -15 * (nAll - 2)]);
    if (atWar(s, a, a) || s.wars.some((x) => x.att.includes(a) || x.def.includes(a))) R.push(['you_are_at_war', -15]);
    if (pers === 'isolationist') R.push(['isolationist', -25]);
    if (pers === 'diplomat') R.push(['diplomat', 10]);
    if (A.faith !== Bn.faith) R.push(['heathen', -15]);
  } else if (action === 'marriage') {
    R.push(['base', 5]);
    if (A.faith !== Bn.faith) R.push(['different_faith', -40]);
    if (dist > 2000) R.push(['too_far', -15]);
    if (Bn.gov.includes('republic') || Bn.gov === 'theocracy' || Bn.gov === 'military_order') R.push(['no_dynasty', -1000]);
  } else if (action === 'access') {
    R.push(['base', 10]);
    if (A.rivals.includes(b)) R.push(['rival', -50]);
  } else if (action === 'trade') {
    R.push(['base', 5]);
    if (pers === 'trader') R.push(['trader', 20]);
  } else if (action === 'guarantee') {
    R.push(['base', 30]); // being guaranteed is welcome
  } else if (action === 'vassalize') {
    const pa = power(s, a), pb = power(s, b);
    R.push(['base', -40]);
    R.push(['relative_strength', Math.round(clamp((pa / Math.max(1, pb) - 5) * 4, -60, 40))]);
    if (allies(s, b).length) R.push(['has_allies', -30]);
    if (A.faith !== Bn.faith) R.push(['heathen', -30]);
    // the leading crown of our own people gathering the lands (see gatheringYear): submission keeps the house its seat
    if (gatherClaim(s, a, b)) R.push(['senior_prince', 30]);
    if (dist > 600) R.push(['too_far', -30]);
  } else if (action === 'demand') {
    const pa = power(s, a), pb = power(s, b);
    R.push(['relative_strength', Math.round(clamp((pa / Math.max(1, pb) - 3) * 8, -60, 40))]);
  }
  const sum = R.reduce((p, x) => p + x[1], 0);
  return { accept: sum > 0, reasons: R };
}

/** Days an envoy travels: couriers on horseback ~45 km/day, faster with a skilled chancery. */
export function envoyDays(s: GameState, w: World, A: Nation, b: number): number {
  return Math.max(3, Math.round(distance(s, w, A.id, b) / 45 / Math.max(0.5, 1 + diploSkill(s, A))));
}
/** Send an envoy. The answer arrives after travel time. */
export function sendEnvoy(s: GameState, w: World, a: number, b: number, action: string, payload?: any): string | null {
  const A = s.nations[a];
  if (!s.nations[b]?.alive || a === b) return 'invalid target';
  if (['gift', 'insult', 'break_alliance', 'rival', 'unrival', 'cancel_access', 'fabricate', 'excommunicate'].includes(action)) return immediateAction(s, w, a, b, action, payload);
  if (A.envoysBusy >= A.envoys) return 'all envoys are busy';
  if (action === 'alliance' && hasTreaty(s, a, b, 'alliance')) return 'already allied';
  if (action === 'marriage' && hasTreaty(s, a, b, 'marriage')) return 'already married';
  if (atWar(s, a, b) && action !== 'improve') return 'at war';
  const days = envoyDays(s, w, A, b);
  A.envoysBusy++;
  s.envoys.push({ from: a, to: b, action, arrive: s.day + days, payload });
  return null;
}

function immediateAction(s: GameState, w: World, a: number, b: number, action: string, payload?: any): string | null {
  const A = s.nations[a], Bn = s.nations[b];
  switch (action) {
    case 'gift': {
      const amt = payload?.amount ?? Math.max(20, (A.income.tax || 10) * 2);
      if (A.treasury < amt) return 'not enough gold';
      A.treasury -= amt; Bn.treasury += amt; addOpinion(s, b, a, 'gift', 10 + Math.min(40, amt / Math.max(1, (Bn.income.tax || 10)) * 5), 365 * 2, true);
      rel(s, b, a).trust = clamp(rel(s, b, a).trust + 3, 0, 100);
      return null;
    }
    case 'insult': addOpinion(s, b, a, 'insulted', -50, 365 * 5); A.prestige += 2; return null;
    case 'break_alliance': s.treaties = s.treaties.filter((t) => !(t.type === 'alliance' && ((t.a === a && t.b === b) || (t.a === b && t.b === a)))); addOpinion(s, b, a, 'broke_alliance', -40, 365 * 5); rel(s, b, a).trust = clamp(rel(s, b, a).trust - 25, 0, 100); return null;
    case 'cancel_access': s.treaties = s.treaties.filter((t) => !(t.type === 'access' && ((t.a === a && t.b === b) || (t.a === b && t.b === a)))); return null;
    case 'rival': if (A.rivals.length >= 3) return 'at most three rivals'; if (!A.rivals.includes(b)) A.rivals.push(b); addOpinion(s, b, a, 'rivalry', -30, 365 * 50); return null;
    case 'unrival': A.rivals = A.rivals.filter((x) => x !== b); return null;
    case 'excommunicate': {
      // Favour of the Curia (Latin faith): a ruler in good standing asks the pope to ban another Latin ruler
      if (FAITHS[A.faith]?.id !== 'latin') return 'not of the Latin church';
      if (Bn.excommunicated) return 'already excommunicated';
      if (s.papacy.holder === b) return 'the pope cannot be excommunicated';
      if (A.excommunicated) return 'we are excommunicated ourselves';
      return excommunicate(s, a, b);
    }
    case 'fabricate': {
      // fabricating a justification takes time and can be discovered
      if (s.spies.some((x) => x.nation === a && x.target === b && x.action === 'fabricate')) return 'already fabricating';
      s.spies.push({ nation: a, target: b, action: 'fabricate', progress: 0, days: 180 + Math.floor(rand(s.rng) * 180) });
      return null;
    }
  }
  return 'unknown action';
}

const PROPOSAL: Record<string, { en: string; de: string }> = {
  alliance: { en: 'an alliance', de: 'ein Bündnis' }, marriage: { en: 'a royal marriage', de: 'eine königliche Heirat' },
  access: { en: 'military access', de: 'Durchmarschrecht' }, trade: { en: 'a trade agreement', de: 'ein Handelsabkommen' },
  vassalize: { en: 'that we become their vassal', de: 'dass wir ihr Vasall werden' }, demand: { en: 'a demand for tribute', de: 'eine Tributforderung' },
};
function envoyArrives(s: GameState, w: World, e: Envoy) {
  const A = s.nations[e.from], Bn = s.nations[e.to];
  A.envoysBusy = Math.max(0, A.envoysBusy - 1);
  if (!A.alive || !Bn.alive) return;
  const human = s.playerNations.includes(e.to);
  if (human && !A.ai === false) { /* player-to-player offers are handled online */ }
  if (human && ['alliance', 'marriage', 'access', 'trade', 'vassalize', 'demand'].includes(e.action)) {
    // humans answer offers through a pending diplomatic event (one per proposer and kind, at most six waiting)
    const waiting = s.pending.filter((p) => p.nation === e.to && p.event.startsWith('diplo_'));
    if (waiting.some((p) => p.ctx.from === e.from && p.event === `diplo_${e.action}`) || waiting.length >= 6) return;
    s.pending.push({ id: s.nextId++, event: `diplo_${e.action}`, nation: e.to, day: s.day, expires: s.day + 60, ctx: { from: e.from } });
    const what = PROPOSAL[e.action] ?? { en: e.action, de: e.action };
    notice(s, e.to, 'diplo_offer', { en: `${A.short.en} proposes ${what.en}.`, de: `${A.short.de} schlägt ${what.de} vor.` });
    return;
  }
  if (e.action === 'improve') { addOpinion(s, e.to, e.from, 'improved_relations', 25 * Math.max(0.5, 1 + diploSkill(s, A)), 365 * 3, true); rel(s, e.to, e.from).trust = clamp(rel(s, e.to, e.from).trust + 5, 0, 100); return; }
  const ev = evaluateProposal(s, w, e.from, e.to, e.action);
  (s as any).lastAnswer = (s as any).lastAnswer || {};
  (s as any).lastAnswer[e.from] = { to: e.to, action: e.action, accept: ev.accept, reasons: ev.reasons, day: s.day };
  if (ev.accept) acceptProposal(s, w, e.from, e.to, e.action, e.payload);
  else addOpinion(s, e.from, e.to, 'refused_us', -10, 365, false);
  if (s.playerNations.includes(e.from)) notice(s, e.from, ev.accept ? 'diplo_accept' : 'diplo_refuse', { en: `${Bn.short.en} ${ev.accept ? 'accepted' : 'refused'} our ${e.action} proposal.`, de: `${Bn.short.de} hat unseren Vorschlag (${e.action}) ${ev.accept ? 'angenommen' : 'abgelehnt'}.` });
}

export function acceptProposal(s: GameState, w: World, a: number, b: number, action: string, payload?: any) {
  const A = s.nations[a], Bn = s.nations[b];
  const lo = Math.min(a, b), hi = Math.max(a, b);
  switch (action) {
    case 'alliance': s.treaties.push({ a: lo, b: hi, type: 'alliance', since: s.day, until: 1e9 }); chronicle(s, a, 'alliance', { en: `${A.short.en} and ${Bn.short.en} concluded an alliance.`, de: `${A.short.de} und ${Bn.short.de} schlossen ein Bündnis.` }); break;
    case 'marriage': {
      s.treaties.push({ a: lo, b: hi, type: 'marriage', since: s.day, until: s.day + 365 * 40 });
      addOpinion(s, b, a, 'royal_marriage_bond', 15, 365 * 20); addOpinion(s, a, b, 'royal_marriage_bond', 15, 365 * 20);
      chronicle(s, a, 'marriage', { en: `A royal marriage joined the houses of ${A.short.en} and ${Bn.short.en}.`, de: `Eine königliche Heirat verband die Häuser von ${A.short.de} und ${Bn.short.de}.` });
      break;
    }
    case 'access': s.treaties.push({ a, b, type: 'access', since: s.day, until: s.day + 365 * 10 }); break;
    case 'trade': s.treaties.push({ a: lo, b: hi, type: 'trade', since: s.day, until: s.day + 365 * 15 }); break;
    case 'guarantee': s.treaties.push({ a, b, type: 'guarantee', since: s.day, until: 1e9 }); break;
    case 'vassalize': Bn.overlord = a; Bn.subjectType = 'vassal'; Bn.subjectSince = s.day; Bn.libertyDesire = 20; chronicle(s, a, 'vassal', { en: `${Bn.short.en} became a vassal of ${A.short.en}.`, de: `${Bn.short.de} wurde Vasall von ${A.short.de}.` }); break;
    case 'demand': { const amt = Math.max(20, (Bn.income.tax || 10) * 3); Bn.treasury -= amt; A.treasury += amt; addOpinion(s, b, a, 'extorted', -30, 365 * 5); break; }
  }
}

// ---------------- subjects ----------------
/** What a subject's liberty desire drifts toward, by cause (relative strength, opinion, overlord's weakness, subject type). */
export function libertyParts(s: GameState, w: World, n: Nation, ov: Nation): [string, number][] {
  const rs = nationDev(s, n.id) / Math.max(1, nationDev(s, ov.id));
  return [
    ['subject_strength', rs * 120], ['opinion_of_overlord', -totalOpinion(s, w, n.id, ov.id) * 0.3], ['overlord_concord', ov.concord < 0 ? 15 : 0],
    ['overlord_war_exhaustion', ov.warExhaustion > 40 ? 10 : 0], ['tributary', n.subjectType === 'tributary' ? 10 : 0],
    // a banned overlord frees his vassals' consciences (Latin faith: excommunication)
    ['overlord_excommunicated', ov.excommunicated && n.faith === ov.faith ? 20 : 0],
    // a crown of another people does not merge easily into the senior crown of a personal union
    ['foreign_crown', n.subjectType === 'personal_union' && n.culture !== ov.culture ? 20 : 0],
    // the tributaries of a horde whose steppe order is fading (see steppeFade)
    ['steppe_fading', Math.round(25 * steppeFade(ov))],
    // colonial realms drift apart from the crown over generations
    ['colonial_distance', n.subjectType === 'colonial' ? 5 + Math.min(45, (s.day - n.subjectSince) / 365 * 0.35) : 0],
  ];
}
export function libertyTarget(s: GameState, w: World, n: Nation, ov: Nation): number {
  let t = 0; for (const [, v] of libertyParts(s, w, n, ov)) t += v;
  return clamp(t, 0, 100);
}
function subjectsMonth(s: GameState, w: World) {
  for (const n of s.nations) {
    if (!n.alive || n.overlord < 0) continue;
    const ov = s.nations[n.overlord];
    if (!ov?.alive) { n.overlord = -1; n.subjectType = null; continue; }
    const target = libertyTarget(s, w, n, ov);
    n.libertyDesire += (target - n.libertyDesire) * 0.05;
    // tribute
    if (n.subjectType === 'tributary' || n.subjectType === 'vassal' || n.subjectType === 'colonial') {
      const t = (n.subjectType === 'colonial' ? (n.income.tax || 0) * 0.25 + (n.income.trade || 0) * 0.25 : (n.income.tax || 0) * (n.subjectType === 'tributary' ? 0.15 : 0.1));
      if (t > 0) { n.treasury -= t; n.expenseAcc.tribute = (n.expenseAcc.tribute || 0) + t; ov.treasury += t; ov.incomeAcc.tribute = (ov.incomeAcc.tribute || 0) + t; }
    }
    // integration in progress
    if (n.flags.integrating) {
      n.integration += 100 / 120 * (1 + lawEffect(ov, 'admin'));
      if (n.libertyDesire > 50) n.integration = Math.max(0, n.integration - 2);
      if (n.integration >= 100) integrateSubject(s, w, ov, n);
    }
    // independence war when strong & discontent
    if (n.libertyDesire > 75 && !s.wars.some((x) => x.att.includes(n.id) || x.def.includes(n.id)) && chance(s.rng, 0.04) && !s.playerNations.includes(n.id)) {
      declareWar(s, w, n.id, ov.id, 'independence');
      notice(s, ov.id, 'independence_war', { en: `${n.short.en} has risen to throw off our overlordship!`, de: `${n.short.de} hat sich gegen unsere Oberherrschaft erhoben!` });
    }
  }
}
export function integrateSubject(s: GameState, w: World, ov: Nation, n: Nation) {
  const { transferLoc } = require_war();
  for (let i = 0; i < s.loc.owner.length; i++) if (s.loc.owner[i] === n.id) { transferLoc(s, w, i, ov.id, 0, { conquest: false }); s.loc.integ[i] = 0.5; }
  n.alive = false;
  chronicle(s, ov.id, 'integration', { en: `${ov.short.en} absorbed ${n.short.en} into the realm.`, de: `${ov.short.de} gliederte ${n.short.de} in das Reich ein.` });
}
import * as warmod from './war';
function require_war() { return warmod; }

// ---------------- espionage ----------------
export const SPY_ACTIONS = ['fabricate', 'slander', 'support_rebels', 'steal_tech'];
export function startSpy(s: GameState, a: number, b: number, action: string): string | null {
  if (!SPY_ACTIONS.includes(action)) return 'unknown action';
  if (s.spies.filter((x) => x.nation === a).length >= 2) return 'all agents are busy';
  const cost = 30 * s.priceLevel;
  const A = s.nations[a]; if (A.treasury < cost) return 'not enough gold';
  A.treasury -= cost;
  s.spies.push({ nation: a, target: b, action, progress: 0, days: action === 'fabricate' ? 240 : 120 });
  return null;
}
function spiesDay(s: GameState, w: World) {
  for (const sp of s.spies.slice()) {
    sp.progress++;
    const A = s.nations[sp.nation], Bn = s.nations[sp.target];
    // discovery chance each month
    if (sp.progress % 30 === 0 && chance(s.rng, 0.04 + (Bn ? councilBonus(s, Bn, 'spymaster') : 0) - councilBonus(s, A, 'spymaster'))) {
      s.spies.splice(s.spies.indexOf(sp), 1);
      addOpinion(s, sp.target, sp.nation, 'caught_spying', -40, 365 * 5);
      rel(s, sp.target, sp.nation).trust = clamp(rel(s, sp.target, sp.nation).trust - 20, 0, 100);
      A.prestige -= 5;
      notice(s, sp.nation, 'spy_caught', { en: `Our agents in ${Bn.short.en} were discovered!`, de: `Unsere Agenten in ${Bn.short.de} wurden entdeckt!` });
      notice(s, sp.target, 'spy_caught', { en: `We uncovered ${A.short.en}'s agents plotting against us.`, de: `Wir haben Agenten von ${A.short.de} entlarvt.` });
      continue;
    }
    if (sp.progress < sp.days) continue;
    s.spies.splice(s.spies.indexOf(sp), 1);
    if (!Bn?.alive) continue;
    switch (sp.action) {
      case 'fabricate': s.flags[`cb_${sp.nation}_${sp.target}`] = s.day + 365 * 3; notice(s, sp.nation, 'cb', { en: `Our clerks have “found” a claim against ${Bn.short.en}.`, de: `Unsere Schreiber haben einen Anspruch gegen ${Bn.short.de} „gefunden“.` }); break;
      case 'slander': Bn.prestige -= 10; for (const o of s.nations) if (o.alive && o.id !== sp.target) addOpinion(s, o.id, sp.target, 'slandered', -10, 365 * 2); break;
      case 'support_rebels': for (let i = 0; i < s.loc.owner.length; i++) if (s.loc.owner[i] === sp.target) s.loc.unrest[i] = Math.min(100, s.loc.unrest[i] + 15); break;
      case 'steal_tech': { const br = A.tech.findIndex((t, k) => Bn.tech[k] > t); if (br >= 0) A.techProgress[br] += techBase(A, br) * 0.3; break; }
    }
  }
}

export const diplomacy: System = {
  id: 'diplomacy',
  daily({ s, w }) {
    for (const e of s.envoys.slice()) if (e.arrive <= s.day) { s.envoys.splice(s.envoys.indexOf(e), 1); envoyArrives(s, w, e); }
    spiesDay(s, w);
  },
  monthly({ s, w }) {
    subjectsMonth(s, w);
    // trust drifts toward 50 + alliance years; timed opinion modifiers expire
    for (const k in s.rel) { const r = s.rel[k]; r.mods = r.mods.filter((m) => m.until > s.day); r.trust += (50 - r.trust) * 0.01; if (!r.mods.length && Math.abs(r.trust - 50) < 1) delete s.rel[k]; }
    for (const t of s.treaties) if (t.type === 'alliance') { const r = rel(s, t.a, t.b); r.trust = Math.min(100, r.trust + 0.1); const r2 = rel(s, t.b, t.a); r2.trust = Math.min(100, r2.trust + 0.1); }
    s.treaties = s.treaties.filter((t) => t.until > s.day && s.nations[t.a]?.alive && s.nations[t.b]?.alive);
    // envoys: number by statecraft
    for (const n of s.nations) if (n.alive) { const r = s.chars[n.ruler]; n.envoys = 2 + (r ? Math.floor(r.skills[1] / 3) : 0) + (n.council.chancellor ? 1 : 0); }
  },
};
