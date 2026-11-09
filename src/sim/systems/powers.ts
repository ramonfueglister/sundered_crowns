// The great powers (spec point 83). The eight strongest independent realms (realm.ts rankingMonth) gain weight in
// diplomacy and prestige, step into the wars of others when the balance is threatened (joining the weaker side or
// imposing a mediated peace), and take lesser realms under their protection. A realm that rises fast alarms its
// neighbours: its Dread grows, and with it the Common Front (war.ts dreadMonth).
import type { GameState, Nation, War, I18n } from '../types';
import type { World } from '../world';
import { type System, clamp, chronicle, notice, addOpinion, atWar, hasTreaty, opinion } from '../ctx';
import { nationDev, concludePeace, dreadGain } from './war';
import { nationStats } from './realm';
import { chance } from '../rng';

type Row = [string | I18n, number];
const T = (en: string, de: string): I18n => ({ en, de });
const isHuman = (s: GameState, id: number) => s.playerNations.includes(id) || !!s.nations[id]?.playerId;
const sumRows = (r: Row[]) => r.reduce((p, x) => p + x[1], 0);
export const GP_COUNT = 8;
export const greatPowers = (s: GameState) => s.ranking.slice(0, GP_COUNT);
export const isGreatPower = (s: GameState, id: number) => s.ranking.slice(0, GP_COUNT).includes(id);
export function powersState(s: GameState) { return (s.powers ??= { scores: {}, petitions: [], log: [] }); }
/** What standing among the great powers gives (a modifier renewed monthly). */
export const GP_EFFECTS: Record<string, number> = { diplomacy: 0.1, prestige: 0.05 };
/** Lesser realms think better of a great power (diplomacy.ts opinionBreakdown). */
export const GP_REGARD = 10;

/** The parts of a realm's score (the same sum as realm.ts rankingMonth). */
export function scoreParts(s: GameState, w: World, n: Nation, st = nationStats(s, w)): Row[] {
  const x = st[n.id];
  let sub = 0; for (const o of s.nations) if (o.alive && o.overlord === n.id) sub += st[o.id].dev * 0.5;
  return [['x_gp_dev', x.dev], ['x_gp_subjects', sub], ['x_gp_army', x.army / 4000], ['x_gp_navy', x.navy / 400], ['x_gp_prestige', Math.max(0, n.prestige) * 2], ['x_gp_treasury', Math.min(100, Math.max(0, n.treasury) / (500 * s.priceLevel))]];
}
/** Growth of the score over the last ten years (1 = unchanged), from the yearly record. */
export function growth(s: GameState, id: number): number {
  const r = powersState(s).scores[id]; if (!r || r.length < 2) return 1;
  return r[r.length - 1] / Math.max(1, r[0]);
}
export const RISING = 1.35;

// ---------------------------------------------------------------- intervention and mediation
const bloc = (s: GameState, ids: number[]) => ids.reduce((p, id) => p + (s.nations[id]?.alive ? nationDev(s, id) : 0), 0);
/** Whether a war threatens the balance: the attackers are far stronger and winning, and led by a great power or a
 *  realm about to become one. */
export function balanceThreat(s: GameState, war: War): Row[] {
  const rows: Row[] = [];
  const a = bloc(s, war.att), d = bloc(s, war.def);
  rows.push(['x_gp_odds', Math.round(clamp((a / Math.max(1, d) - 1.5) * 20, -30, 40))]);
  rows.push(['x_gp_winning', Math.round(clamp(war.score, -50, 60) * 0.5)]);
  const lead = war.attLead;
  if (isGreatPower(s, lead)) rows.push(['x_gp_lead_power', 15]);
  if (growth(s, lead) >= RISING) rows.push(['x_gp_rising', 15]);
  rows.push(['x_gp_threshold', -40]);
  return rows;
}
const NO_BALANCE = ['civil_war', 'rebels', 'independence', 'coalition'];
/** Why a great power would step in on the defenders' side. */
export function interveneScore(s: GameState, w: World, gp: Nation, war: War): Row[] {
  const lead = s.nations[war.attLead], victim = s.nations[war.defLead];
  const rows: Row[] = [['x_gp_balance', Math.round(sumRows(balanceThreat(s, war)))]];
  rows.push(['r_opinion', Math.round((opinion(s, gp.id, victim.id) - opinion(s, gp.id, lead.id)) * 0.3)]);
  if (gp.rivals.includes(lead.id)) rows.push(['r_rival', 30]);
  const ratio = nationDev(s, gp.id) / Math.max(1, nationDev(s, lead.id));
  rows.push(['x_emp_strength', Math.round(clamp((ratio - 0.7) * 30, -40, 20))]);
  if (gp.warExhaustion > 5) rows.push(['r_war_exhaustion', -Math.round(gp.warExhaustion)]);
  if (s.wars.some((x) => x.att.includes(gp.id) || x.def.includes(gp.id))) rows.push(['x_emp_busy', -40]);
  if (gp.capital >= 0 && victim.capital >= 0 && w.distKm(gp.capital, victim.capital) > 1400) rows.push(['x_emp_far', -30]);
  return rows;
}
function canIntervene(s: GameState, gp: Nation, war: War): string | null {
  if (!isGreatPower(s, gp.id)) return 'only a great power can do this';
  if (NO_BALANCE.includes(war.goal.type)) return 'not a war between realms';
  if (war.att.includes(gp.id) || war.def.includes(gp.id)) return 'already in this war';
  if (war.att.some((x) => hasTreaty(s, gp.id, x, 'alliance')) || war.att.some((x) => s.nations[x]?.overlord === gp.id)) return 'allied with the attackers';
  if (war.att.some((x) => hasTreaty(s, gp.id, x, 'truce'))) return 'we have a truce with the attackers';
  return null;
}
/** A great power joins the defenders of a war. */
export function intervene(s: GameState, gp: Nation, war: War): string | null {
  const e = canIntervene(s, gp, war); if (e) return e;
  war.def.push(gp.id);
  for (const x of war.att) addOpinion(s, x, gp.id, 'intervened_against_us', -30, 365 * 10);
  for (const x of war.def) if (x !== gp.id) addOpinion(s, x, gp.id, 'came_to_our_aid', 30, 365 * 10);
  powersState(s).log.push({ day: s.day, gp: gp.id, war: war.id, kind: 'intervene', side: war.defLead });
  chronicle(s, gp.id, 'great_power', T(`${gp.short.en} intervened for ${s.nations[war.defLead].short.en} to keep the balance against ${s.nations[war.attLead].short.en}.`, `${gp.short.de} griff für ${s.nations[war.defLead].short.de} ein, um das Gleichgewicht gegen ${s.nations[war.attLead].short.de} zu wahren.`));
  for (const p of s.playerNations) if (war.att.includes(p) || war.def.includes(p)) notice(s, p, 'great_power', T(`${gp.short.en} has entered the war on the side of ${s.nations[war.defLead].short.en}.`, `${gp.short.de} ist auf der Seite von ${s.nations[war.defLead].short.de} in den Krieg eingetreten.`), { war: war.id });
  return null;
}
/** Why the attacker would accept a great power's mediation (white peace). */
export function mediationScore(s: GameState, gp: Nation, war: War): Row[] {
  const lead = s.nations[war.attLead];
  const rows: Row[] = [['x_gp_weight', Math.round(clamp((nationDev(s, gp.id) / Math.max(1, nationDev(s, lead.id)) - 0.5) * 40, -30, 40))]];
  rows.push(['r_opinion', Math.round(opinion(s, lead.id, gp.id) * 0.3)]);
  if (war.score > 0) rows.push(['x_emp_winning', -Math.round(war.score * 0.5)]);
  else rows.push(['x_gp_losing', Math.round(-war.score * 0.3)]);
  if (lead.warExhaustion > 10) rows.push(['r_war_exhaustion', Math.round(lead.warExhaustion * 0.5)]);
  if (lead.rivals.includes(gp.id)) rows.push(['r_rival', -30]);
  rows.push(['x_gp_threshold', -10]);
  return rows;
}
/** Days a human war leader has to answer an offer of mediation (unanswered, it counts as refused). */
export const OFFER_DAYS = 30;
/** What a spurned mediator thinks of the war leader who turned it down, for five years. */
export const SPURNED = -20;
/** A great power offers to mediate: if the attacker accepts, a white peace; refused, the power is spurned. An AI
 *  leader decides at once by mediationScore; a human leader is asked (powersCommand accept_mediation /
 *  refuse_mediation) and has OFFER_DAYS to answer. */
export function mediate(s: GameState, w: World, gp: Nation, war: War): string | I18n | null {
  const e = canIntervene(s, gp, war); if (e) return e;
  if ((gp.flags[`mediated_${war.id}`] ?? 0) > s.day) return 'we offered mediation recently';
  gp.flags[`mediated_${war.id}`] = s.day + 365;
  const lead = s.nations[war.attLead], def = s.nations[war.defLead];
  const P = powersState(s);
  if (isHuman(s, lead.id)) {
    (P.offers ??= []).push({ gp: gp.id, war: war.id, to: lead.id, until: s.day + OFFER_DAYS });
    P.log.push({ day: s.day, gp: gp.id, war: war.id, kind: 'mediation_offered', side: war.defLead });
    notice(s, lead.id, 'great_power', T(`${gp.short.en} offers to mediate a white peace with ${def.short.en}. Accept or refuse within ${OFFER_DAYS} days (great powers); refusing angers them.`, `${gp.short.de} bietet an, einen weißen Frieden mit ${def.short.de} zu vermitteln. Annehmen oder ablehnen binnen ${OFFER_DAYS} Tagen (Großmächte); eine Ablehnung verärgert sie.`));
    if (isHuman(s, gp.id)) notice(s, gp.id, 'great_power', T(`We offered ${lead.short.en} our mediation; they have ${OFFER_DAYS} days to answer.`, `Wir boten ${lead.short.de} unsere Vermittlung an; sie haben ${OFFER_DAYS} Tage für die Antwort.`));
    return null;
  }
  if (sumRows(mediationScore(s, gp, war)) > 0) { mediatedPeace(s, w, gp, war); return null; }
  spurned(s, gp, war);
  return isHuman(s, gp.id) ? T(`${lead.short.en} rejected our mediation.`, `${lead.short.de} wies unsere Vermittlung zurück.`) : null;
}
function mediatedPeace(s: GameState, w: World, gp: Nation, war: War) {
  const lead = s.nations[war.attLead], def = s.nations[war.defLead];
  powersState(s).log.push({ day: s.day, gp: gp.id, war: war.id, kind: 'mediated', side: war.defLead });
  concludePeace(s, w, war, war.attLead, war.defLead, [{ type: 'white_peace' }]);
  gp.prestige = clamp(gp.prestige + 5, -100, 100);
  addOpinion(s, def.id, gp.id, 'mediated_peace', 15, 365 * 10);
  addOpinion(s, lead.id, gp.id, 'mediated_peace', 5, 365 * 5);
  chronicle(s, gp.id, 'great_power', T(`Through the mediation of ${gp.short.en}, ${lead.short.en} and ${def.short.en} made peace.`, `Durch Vermittlung von ${gp.short.de} schlossen ${lead.short.de} und ${def.short.de} Frieden.`));
}
/** The war leader turned the mediation down (by answer, by silence, or by the AI's weighing): the power remembers. */
function spurned(s: GameState, gp: Nation, war: War) {
  const lead = s.nations[war.attLead];
  powersState(s).log.push({ day: s.day, gp: gp.id, war: war.id, kind: 'mediation_refused', side: war.defLead });
  addOpinion(s, gp.id, lead.id, 'spurned_mediation', SPURNED, 365 * 5);
}
/** A human war leader answers an offer of mediation. */
export function answerMediation(s: GameState, w: World, n: Nation, warId: number, yes: boolean): string | null {
  const P = powersState(s); const offers = P.offers ?? [];
  const k = offers.findIndex((o) => o.war === warId && o.to === n.id);
  if (k < 0) return 'no mediation is offered';
  const o = offers[k]; offers.splice(k, 1);
  const war = s.wars.find((x) => x.id === warId); const gp = s.nations[o.gp];
  if (!war || war.attLead !== n.id) return 'the war is over';
  if (!gp?.alive) return 'no mediation is offered';
  if (yes) mediatedPeace(s, w, gp, war); else spurned(s, gp, war);
  if (isHuman(s, gp.id)) notice(s, gp.id, 'great_power', yes
    ? T(`${n.short.en} accepted our mediation and made peace.`, `${n.short.de} nahm unsere Vermittlung an und schloss Frieden.`)
    : T(`${n.short.en} rejected our mediation.`, `${n.short.de} wies unsere Vermittlung zurück.`));
  return null;
}
/** Offers whose time ran out count as refused; offers for wars that ended lapse. */
function expireOffers(s: GameState) {
  const P = powersState(s); if (!P.offers?.length) return;
  const keep: NonNullable<typeof P.offers> = [];
  for (const o of P.offers) {
    const war = s.wars.find((x) => x.id === o.war); const gp = s.nations[o.gp];
    if (!war || war.attLead !== o.to || !gp?.alive) continue;
    if (s.day >= o.until) { spurned(s, gp, war); notice(s, o.to, 'great_power', T(`We left the mediation of ${gp.short.en} unanswered; they take it as a refusal.`, `Wir ließen die Vermittlung von ${gp.short.de} unbeantwortet; sie werten es als Ablehnung.`)); continue; }
    keep.push(o);
  }
  P.offers = keep;
}

// ---------------------------------------------------------------- protection of lesser realms
const PROTECT_YEARS = 20;
/** A great power takes at most this many realms under its protection. */
export const PROTECT_MAX = 3;
/** Why a great power would take a lesser realm under its protection (a guarantee: war.ts declareWar calls it in). */
export function protectScore(s: GameState, w: World, gp: Nation, small: Nation): Row[] {
  const rows: Row[] = [['x_gp_base', -10], ['r_opinion', Math.round(opinion(s, gp.id, small.id) * 0.5)]];
  const held = s.treaties.filter((t) => t.type === 'guarantee' && t.a === gp.id && t.until > s.day).length;
  if (held >= PROTECT_MAX) rows.push(['x_gp_enough', -100]);
  const ratio = nationDev(s, small.id) / Math.max(1, nationDev(s, gp.id));
  rows.push(['x_gp_small', ratio < 0.25 ? 15 : ratio < 0.5 ? 0 : -40]);
  if (gp.capital >= 0 && small.capital >= 0) { const d = w.distKm(gp.capital, small.capital); if (d > 900) rows.push(['x_emp_far', -60]); else if (d < 500) rows.push(['x_gp_near', 10]); }
  if (gp.rivals.includes(small.id) || small.rivals.includes(gp.id)) rows.push(['r_rival', -60]);
  const foes = s.nations.filter((o) => o.alive && o.id !== gp.id && o.id !== small.id && (small.rivals.includes(o.id) || atWar(s, small.id, o.id)));
  if (foes.some((o) => gp.rivals.includes(o.id))) rows.push(['r_shared_rival', 20]);
  if (foes.some((o) => hasTreaty(s, gp.id, o.id, 'alliance'))) rows.push(['r_allied', -50]);
  if (s.wars.some((x) => x.def.includes(small.id) || x.att.includes(small.id))) rows.push(['r_at_war', -40]);
  if (gp.faith === small.faith) rows.push(['x_el_faith', 10]);
  return rows;
}
function guarantee(s: GameState, gp: number, small: number) {
  s.treaties = s.treaties.filter((t) => !(t.type === 'guarantee' && t.a === gp && t.b === small));
  s.treaties.push({ a: gp, b: small, type: 'guarantee', since: s.day, until: s.day + 365 * PROTECT_YEARS });
  addOpinion(s, small, gp, 'protector', 25, 365 * PROTECT_YEARS);
  chronicle(s, gp, 'great_power', T(`${s.nations[gp].short.en} took ${s.nations[small].short.en} under its protection.`, `${s.nations[gp].short.de} nahm ${s.nations[small].short.de} unter seinen Schutz.`));
}
/** A lesser realm asks a great power for protection. AI powers decide by protectScore; a human power is asked. */
export function seekProtection(s: GameState, w: World, n: Nation, gpId: number): string | null {
  const gp = s.nations[gpId];
  if (!gp?.alive || !isGreatPower(s, gpId)) return 'not a great power';
  if (gpId === n.id || isGreatPower(s, n.id)) return 'great powers protect themselves';
  if (n.overlord >= 0) return 'subjects cannot do this';
  if (hasTreaty(s, gpId, n.id, 'guarantee')) return 'already under their protection';
  const P = powersState(s);
  if (P.petitions.some((p) => p.from === n.id && p.to === gpId)) return 'already asked';
  if ((n.flags[`petition_${gpId}`] ?? 0) > s.day) return 'we asked them recently';
  n.flags[`petition_${gpId}`] = s.day + 365 * 2;
  if (isHuman(s, gpId)) {
    P.petitions.push({ from: n.id, to: gpId, until: s.day + 90 });
    notice(s, gpId, 'great_power', T(`${n.short.en} asks to be taken under our protection.`, `${n.short.de} bittet, unter unseren Schutz gestellt zu werden.`));
    return null;
  }
  if (sumRows(protectScore(s, w, gp, n)) <= 0) return 'they declined to protect us';
  guarantee(s, gpId, n.id);
  if (isHuman(s, n.id)) notice(s, n.id, 'great_power', T(`${gp.short.en} has taken us under its protection.`, `${gp.short.de} hat uns unter seinen Schutz genommen.`));
  return null;
}
/** A human great power answers a petition. */
export function answerPetition(s: GameState, gp: Nation, from: number, yes: boolean): string | null {
  const P = powersState(s); const k = P.petitions.findIndex((p) => p.from === from && p.to === gp.id);
  if (k < 0) return 'no such request';
  P.petitions.splice(k, 1);
  const n = s.nations[from]; if (!n?.alive) return null;
  if (yes) { guarantee(s, gp.id, from); gp.prestige = clamp(gp.prestige + 3, -100, 100); }
  else addOpinion(s, from, gp.id, 'refused_protection', -20, 365 * 5);
  return null;
}

/** Commands of the 'powers' kind. */
export function powersCommand(s: GameState, w: World, n: Nation, action: string, target?: number, warId?: number): string | I18n | null {
  const war = s.wars.find((x) => x.id === warId);
  switch (action) {
    case 'intervene': return war ? intervene(s, n, war) : 'no such war';
    case 'mediate': return war ? mediate(s, w, n, war) : 'no such war';
    case 'seek_protection': return seekProtection(s, w, n, target ?? -1);
    case 'protect': return answerPetition(s, n, target ?? -1, true);
    case 'decline': return answerPetition(s, n, target ?? -1, false);
    case 'accept_mediation': return answerMediation(s, w, n, warId ?? -1, true);
    case 'refuse_mediation': return answerMediation(s, w, n, warId ?? -1, false);
  }
  return 'unknown action';
}

// ---------------------------------------------------------------- the system
function powersMonth(s: GameState, w: World) {
  const P = powersState(s);
  const gps = greatPowers(s);
  for (const n of s.nations) {
    if (!n.alive) continue;
    const has = n.modifiers.some((m) => m.id === 'great_power');
    if (gps.includes(n.id)) { if (!has) n.modifiers.push({ id: 'great_power', until: 1e9, label: T('Great power', 'Großmacht'), effects: GP_EFFECTS }); }
    else if (has) n.modifiers = n.modifiers.filter((m) => m.id !== 'great_power');
  }
  P.petitions = P.petitions.filter((p) => p.until > s.day && s.nations[p.from]?.alive && s.nations[p.to]?.alive);
  expireOffers(s);
  if (P.log.length > 60) P.log.splice(0, P.log.length - 60);
  // AI great powers step into wars that upset the balance (at most one move a month)
  // (only wars that matter to the balance: a sizeable aggressor, and a victim within the power's reach)
  for (const war of s.wars) {
    if (NO_BALANCE.includes(war.goal.type) || s.day - war.start < 120) continue;
    if (nationDev(s, war.attLead) < 200 && !isGreatPower(s, war.attLead)) continue;
    if (sumRows(balanceThreat(s, war)) <= 0) continue;
    const vc = s.nations[war.defLead]?.capital ?? -1;
    for (const id of gps) {
      const gp = s.nations[id]; if (!gp?.alive || isHuman(s, id) || canIntervene(s, gp, war)) continue;
      if (vc < 0 || gp.capital < 0 || w.distKm(gp.capital, vc) > 1200) continue;
      if ((gp.flags[`mediated_${war.id}`] ?? 0) > s.day) continue;
      const v = sumRows(interveneScore(s, w, gp, war)); if (v <= 0 || !chance(s.rng, 0.1)) continue;
      // a power that would rather not fight offers to mediate first
      if (v < 25 || nationDev(s, gp.id) < nationDev(s, war.attLead)) mediate(s, w, gp, war);
      else intervene(s, gp, war);
      return;
    }
  }
}
function powersYear(s: GameState, w: World) {
  const P = powersState(s);
  // the record of scores (ten years back) for the rising-power alarm
  for (const n of s.nations) {
    if (!n.alive || n.overlord >= 0) { delete P.scores[n.id]; continue; }
    const r = (P.scores[n.id] ??= []); r.push(Math.round(n.score)); if (r.length > 11) r.splice(0, r.length - 11);
  }
  // a great power rising fast alarms its neighbours: Dread, and with it the Common Front
  for (const id of greatPowers(s)) {
    const n = s.nations[id]; if (!n?.alive) continue;
    if ((P.scores[id]?.length ?? 0) >= 6 && growth(s, id) >= RISING) {
      n.dread += 3 * dreadGain(n); n.flags.gp_alarm = s.day;
      if (isHuman(s, id)) notice(s, id, 'great_power', T('Our swift rise alarms the other realms: our Dread grows.', 'Unser rascher Aufstieg beunruhigt die anderen Reiche: Unsere Furcht wächst.'));
    }
  }
  // lesser realms in danger seek a protector
  const gps = greatPowers(s);
  for (const n of s.nations) {
    if (!n.alive || n.overlord >= 0 || gps.includes(n.id) || isHuman(s, n.id) || n.capital < 0) continue;
    if (s.treaties.some((t) => t.type === 'guarantee' && t.b === n.id && t.until > s.day)) continue;
    const dev = nationDev(s, n.id);
    const threat = s.nations.some((o) => o.alive && o.id !== n.id && (n.rivals.includes(o.id) || o.rivals.includes(n.id) || hasTreaty(s, o.id, n.id, 'claim')) && nationDev(s, o.id) > dev * 2 + 20);
    if (!threat || !chance(s.rng, 0.25)) continue;
    let best = -1, bv = 0;
    for (const id of gps) { const gp = s.nations[id]; if (!gp?.alive) continue; const v = sumRows(protectScore(s, w, gp, n)); if (v > bv) { bv = v; best = id; } }
    if (best >= 0) seekProtection(s, w, n, best);
  }
}

export const powers: System = {
  id: 'powers',
  monthly({ s, w }) { powersMonth(s, w); },
  yearly({ s, w }) { powersYear(s, w); },
};
