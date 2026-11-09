// The Empire and the League of the Northern Towns (spec point 60).
// Imperial authority rises with peace among the members, defended members and reforms, and falls with wars between
// members, land lost to outsiders and calls the emperor ignores. It gives the emperor prestige, Authority, levies and
// standing, and lets the diet pass the imperial reforms. When the emperor dies the electors choose among the rulers of
// the members; votes follow opinion, gifts, alliances, faith and power, and a human elector casts its own vote. The
// league of the northern trade towns gives its members trade and defends them when they are attacked.
import type { GameState, Nation, War, WarGoal, I18n } from '../types';
import type { World } from '../world';
import { type System, clamp, chronicle, notice, addOpinion, atWar, hasTreaty, allies, opinion, addIncome, addExpense } from '../ctx';
import { nationDev, nationLocsRO, concludePeace, warHooks } from './war';
import { totalOpinion } from './diplomacy';
import { assemblyWarVeto, assemblyWarRefusal } from './government';
import { hash01, chance } from '../rng';

type Row = [string | I18n, number];
const T = (en: string, de: string): I18n => ({ en, de });
const isHuman = (s: GameState, id: number) => s.playerNations.includes(id) || !!s.nations[id]?.playerId;
const alive = (s: GameState, id: number | undefined) => (id !== undefined && id >= 0 && s.nations[id]?.alive ? s.nations[id] : undefined);

// ---------------------------------------------------------------- the reforms of the diet
export interface ImperialReform { id: string; name: I18n; desc: I18n; cost: number; interest: (s: GameState, n: Nation) => Row[] }
const isTown = (n: Nation) => n.rank === 'free_city' || n.gov === 'city_republic' || n.gov === 'merchant_republic';
const isChurch = (n: Nation) => n.gov === 'theocracy' || n.gov === 'military_order';
/** The reforms in the order the diet takes them up. Each needs imperial authority and a majority of the members. */
export const IMPERIAL_REFORMS: ImperialReform[] = [
  { id: 'common_court', cost: 30, name: T('A Common Court of the Empire', 'Ein Gemeines Reichsgericht'),
    desc: T('Disputes between members go before one court. Members suffer 1 less unrest, and members obey the emperor\'s orders to make peace more readily.', 'Streit zwischen Gliedern kommt vor ein Gericht. Die Glieder haben 1 Unruhe weniger und gehorchen den Friedensgeboten des Kaisers eher.'),
    interest: (s, n) => [[T('Towns and churches want law', 'Städte und Kirchen wollen Recht'), isTown(n) || isChurch(n) ? 15 : 0]] },
  { id: 'public_peace', cost: 35, name: T('The Perpetual Peace of the Land', 'Der Ewige Landfriede'),
    desc: T('Feuds between members are outlawed: a member can no longer declare a war of conquest on another member.', 'Fehden zwischen Gliedern sind verboten: Kein Glied kann einem anderen mehr einen Eroberungskrieg erklären.'),
    interest: (s, n) => [[T('Small members want protection', 'Kleine Glieder wollen Schutz'), nationDev(s, n.id) < 60 ? 15 : -10]] },
  { id: 'imperial_circles', cost: 40, name: T('The Circles of the Empire', 'Die Reichskreise'),
    desc: T('The members are grouped in circles: when an outsider attacks a member, its neighbours in the circle march to its defence. Members gain 5 % defence.', 'Die Glieder werden in Kreise geteilt: Greift ein Fremder ein Glied an, ziehen die Nachbarn im Kreis zu seiner Verteidigung. Glieder erhalten 5 % Verteidigung.'),
    interest: (s, n) => [[T('Defence against outsiders', 'Schutz vor Fremden'), 8]] },
  { id: 'imperial_levy', cost: 45, name: T('The Common Levy', 'Die Gemeine Heerfolge'),
    desc: T('Every member sends a quota of men to the emperor: the emperor gains 15 % manpower, members lose 3 %.', 'Jedes Glied stellt dem Kaiser ein Kontingent: Der Kaiser gewinnt 15 % Wehrkraft, die Glieder verlieren 3 %.'),
    interest: (s, n) => [[T('Our men serve the emperor', 'Unsere Männer dienen dem Kaiser'), -10 - Math.min(15, nationDev(s, n.id) / 40)]] },
  { id: 'common_penny', cost: 50, name: T('The Common Penny', 'Der Gemeine Pfennig'),
    desc: T('An imperial tax: every free member pays the emperor each month up to 3 % of its tax income, as much as imperial authority allows (3 % at 100). The emperor receives at most a quarter of his own tax income; beyond that the members pay less.', 'Eine Reichssteuer: Jedes freie Glied zahlt dem Kaiser jeden Monat bis zu 3 % seiner Steuereinnahmen, so viel die Reichsautorität erlaubt (3 % bei 100). Der Kaiser erhält höchstens ein Viertel seiner eigenen Steuereinnahmen; darüber zahlen die Glieder weniger.'),
    interest: (s, n) => [[T('Our gold goes to the emperor', 'Unser Gold geht an den Kaiser'), -15 - Math.min(15, nationDev(s, n.id) / 40)]] },
  { id: 'perpetual_diet', cost: 55, name: T('The Perpetual Diet', 'Der Immerwährende Reichstag'),
    desc: T('The diet sits without end: it can meet every year instead of every two, and every member is a little more willing to vote for reform (+10).', 'Der Reichstag tagt ohne Ende: Er kann jedes Jahr statt alle zwei Jahre zusammentreten, und jedes Glied stimmt Reformen etwas eher zu (+10).'),
    interest: (s, n) => [[T('A voice at court', 'Eine Stimme am Hof'), isTown(n) || isChurch(n) ? 10 : 0]] },
  { id: 'hereditary_crown', cost: 70, name: T('The Hereditary Imperial Crown', 'Die Erbliche Kaiserkrone'),
    desc: T('The imperial crown passes with the emperor\'s own crown: no more elections while his realm lasts. The electors lose their vote and resent it.', 'Die Kaiserkrone geht mit der Krone des Kaisers über: keine Wahlen mehr, solange sein Reich besteht. Die Kurfürsten verlieren ihre Stimme und grollen.'),
    interest: (s, n) => [[T('The electors lose their vote, the princes fear a hereditary master', 'Die Kurfürsten verlieren ihre Stimme, die Fürsten fürchten einen erblichen Herrn'), n.elector ? -60 : -20]] },
];
export const reformDef = (id: string) => IMPERIAL_REFORMS.find((r) => r.id === id);
export const hasReform = (s: GameState, id: string) => s.empire.reforms.includes(id);
export function nextReform(s: GameState): ImperialReform | undefined { return IMPERIAL_REFORMS.find((r) => !s.empire.reforms.includes(r.id)); }

// ---------------------------------------------------------------- imperial authority
/** Change imperial authority and book the change under its cause (shown in the breakdown). */
export function moveAuth(s: GameState, key: string, v: number) {
  const E = s.empire; const before = E.authority;
  E.authority = clamp(E.authority + v, 0, 100);
  const log = (E.authLog ??= {}); log[key] = (log[key] ?? 0) + (E.authority - before);
}
/** The monthly drift of imperial authority by cause (systems/empire.ts empireMonth). */
export function authorityDrift(s: GameState): Row[] {
  const E = s.empire; const em = alive(s, E.emperor);
  const internal = internalWars(s).length;
  const rows: Row[] = [];
  rows.push(['x_emp_base', 0.25]);
  if (!internal) rows.push(['x_emp_peace', 0.1]);
  else rows.push(['x_emp_internal_wars', -Math.min(0.25, 0.03 * internal)]);
  // the old dignity of the crown: a fallen authority slowly recovers (the members still look to the emperor)
  if (E.authority < 30) rows.push(['x_emp_dignity', +((30 - E.authority) * 0.02).toFixed(3)]);
  // and the princes guard their liberties against a strong crown
  if (E.authority > 50) rows.push(['x_emp_jealousy', -+((E.authority - 50) * 0.03).toFixed(3)]);
  if (em) {
    let tot = 0; for (const id of E.members) if (s.nations[id]?.alive) tot += nationDev(s, id);
    const share = tot > 0 ? nationDev(s, em.id) / tot : 0;
    if (share >= 0.1) rows.push(['x_emp_strong', 0.1]); else if (share < 0.03) rows.push(['x_emp_weak', -0.1]);
    if (em.excommunicated) rows.push(['x_emp_banned', -0.2]);
  } else rows.push(['x_emp_vacant', -0.3]);
  if (E.reforms.length) rows.push(['x_emp_reforms', 0.03 * E.reforms.length]);
  return rows;
}
/** Wars with a member leading each side (the emperor's peace is broken). */
export function internalWars(s: GameState): War[] {
  const out: War[] = [];
  for (const war of s.wars) {
    const a = s.nations[war.attLead], d = s.nations[war.defLead];
    if (a?.isHRE && d?.isHRE && war.goal.type !== 'civil_war' && war.goal.type !== 'rebels') out.push(war);
  }
  return out;
}
/** What the imperial crown gives its wearer at the present authority (a modifier, renewed monthly). */
export function crownEffects(s: GameState): Record<string, number> {
  const k = s.empire.authority / 100;
  const fx: Record<string, number> = { prestige: +(0.15 + 0.35 * k).toFixed(3), authority: +(0.5 * k).toFixed(3), diplomacy: +(0.1 * k).toFixed(3), manpower: +(0.05 + 0.15 * k).toFixed(3) };
  if (hasReform(s, 'imperial_levy')) fx.manpower = +(fx.manpower + 0.15).toFixed(3);
  return fx;
}
/** What membership gives (and costs) under the reforms passed. */
export function memberEffects(s: GameState): Record<string, number> {
  const fx: Record<string, number> = {};
  if (hasReform(s, 'common_court')) fx.unrest = -1;
  if (hasReform(s, 'imperial_circles')) fx.defence = 0.05;
  if (hasReform(s, 'imperial_levy')) fx.manpower = -0.03;
  return fx;
}
/** The Common Penny: the rate at full imperial authority, and the most the emperor receives as a share of his own
 *  tax income (the members pay less in proportion when the cap holds). */
export const PENNY_RATE = 0.03, PENNY_CAP = 0.25;
/** The Common Penny this month: the rate at the present authority, the members' tax it is levied on, what that would
 *  raise, the cap, and what is paid (each member pays its tax x rate x factor). */
export function pennyParts(s: GameState): { rate: number; base: number; uncapped: number; cap: number; paid: number; factor: number; payers: number[] } {
  const E = s.empire; const em = alive(s, E.emperor);
  const rate = PENNY_RATE * clamp(E.authority, 0, 100) / 100;
  const payers: number[] = []; let base = 0;
  if (em) for (const id of E.members) {
    const n = s.nations[id]; if (id === em.id || !n?.alive || n.overlord >= 0 || (n.income.tax || 0) <= 0) continue;
    payers.push(id); base += n.income.tax;
  }
  const uncapped = base * rate, cap = em ? Math.max(0, em.income.tax || 0) * PENNY_CAP : 0;
  const paid = Math.min(uncapped, cap);
  return { rate, base, uncapped, cap, paid, factor: uncapped > 0 ? paid / uncapped : 0, payers };
}
function setMod(s: GameState, n: Nation, id: string, label: I18n, effects: Record<string, number>, days = 40) {
  n.modifiers = n.modifiers.filter((m) => m.id !== id);
  if (Object.keys(effects).length) n.modifiers.push({ id, until: s.day + days, label, effects });
}
const dropMod = (n: Nation, id: string) => { n.modifiers = n.modifiers.filter((m) => m.id !== id); };

// ---------------------------------------------------------------- defence of the members, peace among them
/** Before a war is declared: the Perpetual Peace forbids wars of conquest between members, and an assembly that must
 *  approve wars votes on it (systems/government.ts). Returns the refusal or null. */
export function warVeto(s: GameState, w: World, a: number, b: number, goal: WarGoal['type']): string | null {
  return peaceRefusal(s, a, b, goal) ?? assemblyWarVeto(s, w, s.nations[a], b, goal);
}
/** The same as warVeto without side effects (no assembly is held): the AI drops the targets it would be refused. */
export function warVetoCheck(s: GameState, w: World, a: number, b: number, goal: WarGoal['type']): string | null {
  return peaceRefusal(s, a, b, goal) ?? assemblyWarRefusal(s, s.nations[a], b, goal);
}
function peaceRefusal(s: GameState, a: number, b: number, goal: WarGoal['type']): string | null {
  const A = s.nations[a], Bn = s.nations[b];
  if (hasReform(s, 'public_peace') && A.isHRE && Bn.isHRE && s.empire.emperor !== a && (goal === 'conquest' || goal === 'reconquest' || goal === 'trade' || goal === 'subjugate')) return 'the Perpetual Peace forbids war between members';
  return null;
}
/** After a war was declared: the emperor is called to defend a member attacked by an outsider, a war between members
 *  costs authority, and the league defends its towns. */
export function realmBodiesOnWar(s: GameState, w: World, war: War) {
  const E = s.empire; const victim = s.nations[war.goal.target], att = s.nations[war.attLead];
  if (!victim || !att || war.goal.type === 'independence' || war.goal.type === 'civil_war' || war.goal.type === 'rebels') { leagueOnWar(s, w, war); return; }
  const em = alive(s, E.emperor);
  if (em && victim.isHRE && !att.isHRE && em.id !== victim.id && em.id !== att.id && !war.att.includes(em.id) && !war.def.includes(em.id) && !atWar(s, em.id, victim.id)) {
    const call = { war: war.id, member: victim.id, attacker: att.id, until: s.day + 45, answer: 0 };
    (E.calls ??= []).push(call);
    if (isHuman(s, em.id)) notice(s, em.id, 'imperial_call', T(`${att.short.en} has attacked ${victim.short.en}, a member of the Empire. The members expect their emperor to defend it.`, `${att.short.de} hat ${victim.short.de} angegriffen, ein Glied des Reiches. Die Glieder erwarten, dass ihr Kaiser es verteidigt.`), { war: war.id, loc: victim.capital });
    else answerCall(s, w, call, defendScore(s, w, em, call).reduce((p, r) => p + r[1], 0) > 0);
    // the circles of the Empire: neighbouring members march to the defence
    if (hasReform(s, 'imperial_circles') && victim.capital >= 0) for (const id of E.members) {
      const m = s.nations[id];
      if (!m?.alive || m.id === victim.id || m.overlord >= 0 || isHuman(s, id) || war.att.includes(id) || war.def.includes(id) || m.capital < 0) continue;
      if (w.distKm(m.capital, victim.capital) > 600 || hasTreaty(s, id, att.id, 'alliance') || hasTreaty(s, id, att.id, 'truce') || m.warExhaustion > 40) continue;
      if (chance(s.rng, 0.5)) war.def.push(id);
    }
  }
  leagueOnWar(s, w, war);
}
/** Why the emperor would or would not defend a member: authority, opinion, strength, other wars, distance. */
export function defendScore(s: GameState, w: World, em: Nation, call: { war: number; member: number; attacker: number }): Row[] {
  const E = s.empire; const m = s.nations[call.member], a = s.nations[call.attacker];
  const bloc = (id: number) => nationDev(s, id) + allies(s, id).reduce((p, x) => p + nationDev(s, x) * 0.5, 0);
  const ratio = bloc(em.id) / Math.max(1, bloc(a.id));
  const rows: Row[] = [['x_emp_duty', (E.authority - 30) * 0.5], ['r_opinion', opinion(s, em.id, m.id) * 0.3], ['x_emp_strength', clamp((ratio - 0.8) * 30, -40, 30)]];
  if (em.rivals.includes(a.id)) rows.push(['r_rival', 30]);
  if (hasTreaty(s, em.id, a.id, 'alliance')) rows.push(['r_allied', -100]);
  if (s.wars.some((x) => x.att.includes(em.id) || x.def.includes(em.id))) rows.push(['x_emp_busy', -30]);
  if (em.warExhaustion > 10) rows.push(['r_war_exhaustion', -em.warExhaustion * 0.5]);
  if (em.capital >= 0 && m.capital >= 0 && w.distKm(em.capital, m.capital) > 1200) rows.push(['x_emp_far', -20]);
  return rows;
}
/** The emperor answers a call to defend a member. */
export function answerCall(s: GameState, w: World, call: { war: number; member: number; attacker: number; answer: number }, yes: boolean) {
  const E = s.empire; const em = s.nations[E.emperor]; const war = s.wars.find((x) => x.id === call.war);
  if (!war || !em?.alive) { call.answer = -1; return; }
  const m = s.nations[call.member], a = s.nations[call.attacker];
  if (yes) {
    call.answer = 1;
    if (!war.def.includes(em.id) && !war.att.includes(em.id)) war.def.push(em.id);
    moveAuth(s, 'x_emp_defended', 2); em.prestige = clamp(em.prestige + 5, -100, 100);
    addOpinion(s, m.id, em.id, 'imperial_defence', 25, 365 * 10);
    chronicle(s, em.id, 'empire', T(`The emperor took up arms for ${m.short.en} against ${a.short.en}.`, `Der Kaiser griff für ${m.short.de} gegen ${a.short.de} zu den Waffen.`));
    for (const p of s.playerNations) if (p === m.id || p === a.id) notice(s, p, 'empire', T(`The emperor has come to the defence of ${m.short.en}.`, `Der Kaiser ist ${m.short.de} zu Hilfe gekommen.`), { war: war.id });
  } else {
    call.answer = -1;
    // the members blame him less for a small or distant member left alone
    const far = em.capital >= 0 && m.capital >= 0 && w.distKm(em.capital, m.capital) > 1000;
    moveAuth(s, 'x_emp_ignored', far || nationDev(s, m.id) < 100 ? -1.5 : -3); em.prestige = clamp(em.prestige - 5, -100, 100);
    addOpinion(s, m.id, em.id, 'abandoned_by_emperor', -30, 365 * 10);
    for (const id of E.members) if (id !== m.id && id !== em.id && s.nations[id]?.alive) addOpinion(s, id, em.id, 'emperor_failed_member', -10, 365 * 5);
    chronicle(s, em.id, 'empire', T(`The emperor left ${m.short.en} to fight ${a.short.en} alone.`, `Der Kaiser ließ ${m.short.de} allein gegen ${a.short.de} kämpfen.`));
    if (isHuman(s, m.id)) notice(s, m.id, 'empire', T('The emperor will not come to our defence.', 'Der Kaiser kommt uns nicht zu Hilfe.'), { war: war.id });
  }
}
/** Why the aggressor in a war between members would obey or defy the emperor's order to make peace. */
export function obeyScore(s: GameState, war: War): Row[] {
  const E = s.empire; const em = s.nations[E.emperor]; const a = s.nations[war.attLead];
  const sc = war.score * (war.att.includes(a.id) ? 1 : -1);
  const rows: Row[] = [['x_emp_authority', E.authority * 0.6], ['x_emp_strength', 20 * Math.min(2, nationDev(s, em.id) / Math.max(1, nationDev(s, a.id)))], ['r_opinion', opinion(s, a.id, em.id) * 0.2]];
  if (sc > 0) rows.push(['x_emp_winning', -sc * 0.4]);
  if (a.rivals.includes(em.id)) rows.push(['r_rival', -30]);
  if (hasReform(s, 'common_court')) rows.push([reformDef('common_court')!.name, 15]);
  rows.push(['x_emp_threshold', -40]);
  return rows;
}
/** The emperor's order to make peace: what it costs him, what obedience and defiance do to imperial authority, and
 *  the ban on a realm that defies it (the Empire panel's hint is built from these). */
export const ORDER_COST = 20;
export const ORDER_OBEYED = 1, ORDER_DEFIED = -3;
export const BAN_EFFECTS = { concord: -10, mandate: -8 }, BAN_YEARS = 5;
/** The emperor orders the aggressor in a war between members to make peace (costs the emperor ORDER_COST Authority). */
export function orderPeace(s: GameState, w: World, em: Nation, warId: number): string | null {
  const E = s.empire; const war = s.wars.find((x) => x.id === warId);
  if (E.emperor !== em.id) return 'only the emperor can do this';
  if (!war || !internalWars(s).includes(war)) return 'not a war between members';
  if (war.att.includes(em.id) || war.def.includes(em.id)) return 'the emperor is a party to this war';
  if ((E.orders ?? []).some((o) => o.war === warId && o.answer === 0)) return 'already ordered';
  if (em.authority < ORDER_COST) return 'not enough Authority';
  em.authority -= ORDER_COST;
  const to = war.attLead;
  const order = { war: warId, to, until: s.day + 60, answer: 0 };
  (E.orders ??= []).push(order);
  if (isHuman(s, to)) { notice(s, to, 'imperial_order', T(`The emperor orders us to make peace with ${s.nations[war.defLead].short.en}.`, `Der Kaiser befiehlt uns, Frieden mit ${s.nations[war.defLead].short.de} zu schließen.`), { war: warId }); return null; }
  answerOrder(s, w, order, obeyScore(s, war).reduce((p, r) => p + r[1], 0) > 0);
  return null;
}
export function answerOrder(s: GameState, w: World, order: { war: number; to: number; answer: number }, obey: boolean) {
  const E = s.empire; const war = s.wars.find((x) => x.id === order.war); const a = s.nations[order.to], em = s.nations[E.emperor];
  if (!war || !a?.alive) { order.answer = -1; return; }
  if (obey) {
    order.answer = 1;
    const d = war.defLead;
    concludePeace(s, w, war, war.attLead, d, [{ type: 'white_peace' }]);
    moveAuth(s, 'x_emp_obeyed', ORDER_OBEYED);
    chronicle(s, a.id, 'empire', T(`At the emperor's command ${a.short.en} made peace with ${s.nations[d].short.en}.`, `Auf Befehl des Kaisers schloss ${a.short.de} Frieden mit ${s.nations[d].short.de}.`));
  } else {
    order.answer = -1;
    moveAuth(s, 'x_emp_defied', ORDER_DEFIED);
    a.modifiers = a.modifiers.filter((m) => m.id !== 'imperial_ban');
    a.modifiers.push({ id: 'imperial_ban', until: s.day + 365 * BAN_YEARS, label: T('Defied the emperor', 'Dem Kaiser getrotzt'), effects: { ...BAN_EFFECTS } });
    for (const id of E.members) if (id !== a.id && s.nations[id]?.alive) addOpinion(s, id, a.id, 'defied_emperor', -20, 365 * 5);
    if (em?.alive && !hasTreaty(s, em.id, a.id, 'claim')) s.treaties.push({ a: Math.min(em.id, a.id), b: Math.max(em.id, a.id), type: 'claim', since: s.day, until: s.day + 365 * BAN_YEARS });
    chronicle(s, a.id, 'empire', T(`${a.short.en} defied the emperor's order to make peace.`, `${a.short.de} trotzte dem Friedensgebot des Kaisers.`));
    if (em && isHuman(s, em.id)) notice(s, em.id, 'empire', T(`${a.short.en} defies our order to make peace.`, `${a.short.de} trotzt unserem Friedensgebot.`), { war: war.id });
  }
}

// ---------------------------------------------------------------- the election
/** The electors: the realms holding the seven seats. A seat whose realm is gone passes to whoever holds its seat
 *  town, if a member, otherwise to the greatest member without a seat. */
function keepElectors(s: GameState) {
  const E = s.empire;
  const seats: number[] = [];
  for (const id of E.electors) {
    const n = s.nations[id];
    if (n?.alive && n.isHRE) { seats.push(id); continue; }
    const holder = n && n.capital >= 0 ? s.loc.owner[n.capital] : -1;
    const h = alive(s, holder);
    let next = h && h.isHRE && !seats.includes(h.id) && !E.electors.includes(h.id) ? h.id : -1;
    if (next < 0) {
      const c = s.nations.filter((x) => x.alive && x.isHRE && x.overlord < 0 && !seats.includes(x.id) && !E.electors.includes(x.id)).sort((x, y) => nationDev(s, y.id) - nationDev(s, x.id) || x.id - y.id)[0];
      next = c ? c.id : -1;
    }
    if (n) n.elector = false;
    if (next >= 0) {
      seats.push(next); s.nations[next].elector = true;
      chronicle(s, next, 'empire', T(`${s.nations[next].short.en} took up an electoral seat of the Empire.`, `${s.nations[next].short.de} erhielt eine Kurwürde des Reiches.`));
    }
  }
  E.electors = seats;
}
/** The candidates: the late emperor's realm and the greatest independent members (and a human member). */
export function electionCandidates(s: GameState): number[] {
  const E = s.empire;
  const out: number[] = [];
  const ok = (n: Nation | undefined) => !!n && n.alive && n.isHRE && n.overlord < 0;
  if (ok(s.nations[E.emperor])) out.push(E.emperor);
  for (const n of s.nations.filter((x) => ok(x) && !out.includes(x.id)).sort((a, b) => b.score - a.score || a.id - b.id)) { if (out.length >= 5) break; out.push(n.id); }
  for (const p of s.playerNations) if (ok(s.nations[p]) && !out.includes(p)) out.push(p);
  return out;
}
/** Why an elector leans toward a candidate (the elector votes for the highest sum). */
export function voteScore(s: GameState, w: World, el: number, cand: number): Row[] {
  const E = s.empire; const e = s.nations[el], c = s.nations[cand];
  const rows: Row[] = [];
  if (el === cand) rows.push(['x_el_own', 40]);
  rows.push(['r_opinion', Math.round(totalOpinion(s, w, el, cand) * 0.4)]);
  const fav = E.favour?.[`${cand}>${el}`] ?? 0; if (fav) rows.push(['x_el_gifts', fav]);
  if (hasTreaty(s, el, cand, 'alliance')) rows.push(['r_allied', 25]);
  if (hasTreaty(s, el, cand, 'marriage')) rows.push(['r_royal_marriage', 10]);
  rows.push(e.faith === c.faith ? ['x_el_faith', 10] : ['x_el_other_faith', -40]);
  rows.push(['x_el_power', Math.round(Math.min(30, c.score * 0.05))]);
  if (cand === (E.election?.late ?? E.emperor)) rows.push(['x_el_continuity', 15]);
  if (e.rivals.includes(cand)) rows.push(['r_rival', -50]);
  if (atWar(s, el, cand)) rows.push(['r_at_war', -100]);
  if (c.excommunicated) rows.push(['r_excommunicated', -30]);
  rows.push(['x_el_whim', Math.round(hash01(el, cand, E.election?.opened ?? E.lastElection) * 8)]);
  return rows;
}
const sumRows = (r: Row[]) => r.reduce((p, x) => p + x[1], 0);
/** The candidate an elector would choose now (a human elector's own vote if cast, else none). */
export function electorChoice(s: GameState, w: World, el: number): number {
  const E = s.empire; const ve = E.election?.votes ?? {};
  if (isHuman(s, el)) return ve[el] ?? -1;
  let best = -1, bv = -Infinity;
  for (const c of E.election?.candidates ?? electionCandidates(s)) { const v = sumRows(voteScore(s, w, el, c)); if (v > bv || (v === bv && c < best)) { bv = v; best = c; } }
  return best;
}
/** Votes per candidate if the electors voted now. */
export function tally(s: GameState, w: World): Record<number, number> {
  const out: Record<number, number> = {};
  for (const el of s.empire.electors) { const c = electorChoice(s, w, el); if (c >= 0) out[c] = (out[c] ?? 0) + 1; }
  return out;
}
function openElection(s: GameState, w: World) {
  const E = s.empire;
  keepElectors(s);
  E.election = { opened: s.day, closes: s.day + 45, candidates: electionCandidates(s), votes: {}, late: E.emperor };
  const em = s.nations[E.emperor];
  for (const p of s.playerNations) if (s.nations[p]?.isHRE) notice(s, p, 'imperial_election', E.electors.includes(p)
    ? T('The emperor is dead. As an elector we must cast our vote for his successor.', 'Der Kaiser ist tot. Als Kurfürst müssen wir unsere Stimme für seinen Nachfolger abgeben.')
    : T(`The electors gather to choose the successor of the emperor${em ? ` of ${em.short.en}` : ''}.`, `Die Kurfürsten versammeln sich, um den Nachfolger des Kaisers${em ? ` aus ${em.short.de}` : ''} zu wählen.`));
}
function closeElection(s: GameState, w: World) {
  const E = s.empire; const el = E.election!;
  const t = tally(s, w);
  const cands = el.candidates.filter((c) => s.nations[c]?.alive);
  let winner = -1, best = -1;
  for (const c of cands) { const v = t[c] ?? 0; if (v > best || (v === best && winner >= 0 && s.nations[c].score > s.nations[winner].score)) { best = v; winner = c; } }
  if (winner < 0) winner = cands[0] ?? E.emperor;
  const prev = E.emperor;
  E.election = null; E.lastElection = s.day; E.favour = {};
  if (!alive(s, winner)) return;
  if (prev !== winner) {
    const old = s.nations[prev]; if (old) dropMod(old, 'imperial_crown');
    moveAuth(s, 'x_emp_new_house', -5);
  }
  if (best === E.electors.length && best > 0) moveAuth(s, 'x_emp_unanimous', 3);
  E.emperor = winner;
  const wn = s.nations[winner];
  chronicle(s, winner, 'emperor', T(`The electors chose the ruler of ${wn.short.en} as emperor (${best} of ${E.electors.length} votes).`, `Die Kurfürsten wählten den Herrscher von ${wn.short.de} zum Kaiser (${best} von ${E.electors.length} Stimmen).`));
  for (const p of s.playerNations) if (s.nations[p]?.isHRE) notice(s, p, 'emperor', p === winner ? T('We have been elected emperor!', 'Wir wurden zum Kaiser gewählt!') : T(`The ruler of ${wn.short.en} is the new emperor.`, `Der Herrscher von ${wn.short.de} ist der neue Kaiser.`));
}
/** Gold a realm spends to win an elector's or a diet member's favour. */
export function campaignCost(s: GameState, n: Nation): number { return Math.max(20, (n.income.tax || 10) * 2); }
/** Campaign with an elector (for our own candidacy) or, as emperor during a diet, lobby a member. */
export function campaign(s: GameState, n: Nation, target: number): string | null {
  const E = s.empire; const t = s.nations[target];
  if (!t?.alive || target === n.id) return 'invalid target';
  if (!n.isHRE || n.overlord >= 0) return 'not a member of the Empire';
  const lobby = !!E.diet && E.emperor === n.id && t.isHRE;
  if (!lobby && !E.electors.includes(target)) return 'not an elector';
  if (!lobby && hasReform(s, 'hereditary_crown') && alive(s, E.emperor)) return 'the crown is hereditary';
  const cost = campaignCost(s, n);
  if (n.treasury < cost) return 'not enough gold';
  const k = `${n.id}>${target}`; const fav = (E.favour ??= {});
  if ((fav[k] ?? 0) >= 60) return 'they cannot be swayed further';
  addExpense(n, 'gifts', cost); t.treasury += cost;
  fav[k] = Math.min(60, (fav[k] ?? 0) + 15);
  addOpinion(s, target, n.id, 'gift', 10, 365 * 2, true);
  return null;
}
export function castVote(s: GameState, n: Nation, cand: number): string | null {
  const E = s.empire;
  if (!E.election) return 'no election is under way';
  if (!E.electors.includes(n.id)) return 'not an elector';
  if (!E.election.candidates.includes(cand) || !s.nations[cand]?.alive) return 'not a candidate';
  E.election.votes[n.id] = cand;
  return null;
}

// ---------------------------------------------------------------- the diet
/** Why a member would vote for or against the reform before the diet. */
export function dietStance(s: GameState, n: Nation, reform: ImperialReform): Row[] {
  const E = s.empire; const em = s.nations[E.emperor];
  const rows: Row[] = [['x_emp_authority', (E.authority - 50) * 0.4]];
  if (em?.alive) {
    if (n.id === em.id) rows.push(['x_diet_emperor', 100]);
    else {
      rows.push(['x_diet_opinion_emperor', opinion(s, n.id, em.id) * 0.3]);
      if (n.rivals.includes(em.id)) rows.push(['r_rival', -40]);
      if (atWar(s, n.id, em.id)) rows.push(['r_at_war', -100]);
      if (n.faith !== em.faith) rows.push(['x_el_other_faith', -25]);
      const fav = E.favour?.[`${em.id}>${n.id}`] ?? 0; if (fav) rows.push(['x_el_gifts', fav]);
    }
  }
  rows.push(['x_diet_size', -Math.min(20, nationDev(s, n.id) / 40)]);
  for (const r of reform.interest(s, n)) rows.push(r);
  if (hasReform(s, 'perpetual_diet')) rows.push([reformDef('perpetual_diet')!.name, 10]);
  rows.push(['x_diet_base', 5]);
  return rows;
}
export const dietWeight = (n: Nation) => (n.elector ? 3 : 1);
/** The voters of the diet: the independent members. */
export const dietVoters = (s: GameState) => s.empire.members.filter((id) => { const n = s.nations[id]; return n?.alive && n.isHRE && n.overlord < 0; });
/** How the diet would decide now: the weight for and against (a human member counts only once it has voted). */
export function dietTally(s: GameState): { yes: number; no: number; total: number; votes: Record<number, number> } {
  const E = s.empire; const r = reformDef(E.diet?.proposal ?? nextReform(s)?.id ?? '');
  let yes = 0, no = 0, total = 0; const votes: Record<number, number> = {};
  if (!r) return { yes, no, total, votes };
  for (const id of dietVoters(s)) {
    const n = s.nations[id]; const wgt = dietWeight(n); total += wgt;
    let v = 0;
    if (isHuman(s, id)) v = E.diet?.votesFor.includes(id) ? 1 : E.diet?.votesAgainst.includes(id) ? -1 : 0;
    else v = sumRows(dietStance(s, n, r)) > 0 ? 1 : -1;
    votes[id] = v; if (v > 0) yes += wgt; else if (v < 0) no += wgt;
  }
  return { yes, no, total, votes };
}
/** Whether the diet passes a proposal: more weight for than against and at least two fifths of all votes for. */
export const dietPasses = (t: { yes: number; no: number; total: number }) => t.yes > t.no && t.yes >= t.total * 0.4;
export function dietCooldown(s: GameState) { return (hasReform(s, 'perpetual_diet') ? 1 : 2) * 365; }
export function summonDiet(s: GameState, n: Nation): string | null {
  const E = s.empire; const r = nextReform(s);
  if (E.emperor !== n.id) return 'only the emperor can do this';
  if (E.diet) return 'the diet is already in session';
  if (!r) return 'every reform has passed';
  if (s.day - (E.lastDiet ?? -1e9) < dietCooldown(s)) return 'the diet met recently';
  if (E.authority < r.cost) return 'not enough imperial authority';
  E.diet = { proposal: r.id, votesFor: [], votesAgainst: [], ends: s.day + 60, by: n.id };
  for (const p of s.playerNations) if (s.nations[p]?.isHRE && p !== n.id) notice(s, p, 'imperial_diet', T(`The diet meets to decide on: ${r.name.en}. Our vote is awaited.`, `Der Reichstag tritt zusammen und berät über: ${r.name.de}. Unsere Stimme wird erwartet.`));
  return null;
}
export function dietVote(s: GameState, n: Nation, yes: boolean): string | null {
  const E = s.empire;
  if (!E.diet) return 'the diet is not in session';
  if (!dietVoters(s).includes(n.id)) return 'not a member of the Empire';
  E.diet.votesFor = E.diet.votesFor.filter((x) => x !== n.id); E.diet.votesAgainst = E.diet.votesAgainst.filter((x) => x !== n.id);
  (yes ? E.diet.votesFor : E.diet.votesAgainst).push(n.id);
  return null;
}
function closeDiet(s: GameState) {
  const E = s.empire; const r = reformDef(E.diet!.proposal)!;
  const t = dietTally(s);
  E.diet = null; E.lastDiet = s.day;
  const em = s.nations[E.emperor];
  if (dietPasses(t) && E.authority >= r.cost) {
    E.reforms.push(r.id);
    moveAuth(s, 'x_emp_reform_cost', -r.cost / 2);
    moveAuth(s, 'x_emp_reform_passed', 5);
    if (r.id === 'hereditary_crown') {
      moveAuth(s, 'x_emp_reform_passed', 10);
      if (em) for (const id of E.electors) if (id !== em.id && s.nations[id]?.alive) addOpinion(s, id, em.id, 'lost_vote', -30, 365 * 30);
    }
    chronicle(s, em?.id ?? -1, 'empire', T(`The diet of the Empire passed a reform: ${r.name.en} (${t.yes} for, ${t.no} against).`, `Der Reichstag beschloss eine Reform: ${r.name.de} (${t.yes} dafür, ${t.no} dagegen).`));
    for (const p of s.playerNations) if (s.nations[p]?.isHRE) notice(s, p, 'imperial_diet', T(`The diet passed: ${r.name.en}.`, `Der Reichstag beschloss: ${r.name.de}.`));
  } else {
    moveAuth(s, 'x_emp_diet_failed', -3);
    chronicle(s, em?.id ?? -1, 'empire', T(`The diet of the Empire rejected the reform: ${r.name.en} (${t.yes} for, ${t.no} against).`, `Der Reichstag lehnte die Reform ab: ${r.name.de} (${t.yes} dafür, ${t.no} dagegen).`));
    for (const p of s.playerNations) if (s.nations[p]?.isHRE) notice(s, p, 'imperial_diet', T(`The diet rejected: ${r.name.en}.`, `Der Reichstag lehnte ab: ${r.name.de}.`));
  }
}

// ---------------------------------------------------------------- the League of the Northern Towns
export const LEAGUE = 'northern_towns';
export const LEAGUE_NAME = T('League of the Northern Towns', 'Bund der Nordstädte');
/** A town may join: a free city or town republic of the North Sea and Baltic coasts (or close behind them). */
export function leagueEligible(s: GameState, w: World, n: Nation): boolean {
  if (!n.alive || n.capital < 0 || !isTown(n)) return false;
  const lat = w.lat[n.capital], lon = w.lon[n.capital];
  return lat >= 50.9 && lat < 66 && lon >= -6 && lon <= 25;
}
export function league(s: GameState) { return s.leagues.find((l) => l.id === LEAGUE); }
function foundLeague(s: GameState, w: World) {
  const members = s.nations.filter((n) => leagueEligible(s, w, n) && n.overlord < 0).map((n) => n.id);
  s.leagues.push({ id: LEAGUE, name: LEAGUE_NAME, members, leader: members[0] ?? -1, strength: 0, markets: [] });
  for (const id of members) if (!s.nations[id].leagueMember.includes(LEAGUE)) s.nations[id].leagueMember.push(LEAGUE);
}
/** What membership gives: trade grows with the number of towns, the leading town gains prestige. */
export function leagueEffects(s: GameState, n: Nation): Record<string, number> {
  const lg = league(s); if (!lg) return {};
  const k = Math.min(1, lg.members.length / 10);
  const fx: Record<string, number> = { trade: +(0.05 + 0.05 * k).toFixed(3), naval: 0.05 };
  if (lg.leader === n.id) fx.prestige = 0.1;
  return fx;
}
export function joinLeague(s: GameState, w: World, n: Nation): string | null {
  const lg = league(s); if (!lg) return 'no such league';
  if (lg.members.includes(n.id)) return 'already a member';
  if (!leagueEligible(s, w, n)) return 'only free towns of the northern coasts may join';
  if (n.overlord >= 0) return 'subjects cannot join';
  if (lg.members.some((m) => atWar(s, m, n.id))) return 'at war with a member';
  lg.members.push(n.id); if (!n.leagueMember.includes(LEAGUE)) n.leagueMember.push(LEAGUE);
  for (const m of lg.members) if (m !== n.id) addOpinion(s, m, n.id, 'league_brother', 15, 365 * 20);
  chronicle(s, n.id, 'league', T(`${n.short.en} joined the ${LEAGUE_NAME.en}.`, `${n.short.de} trat dem ${LEAGUE_NAME.de} bei.`));
  return null;
}
export function leaveLeague(s: GameState, n: Nation): string | null {
  const lg = league(s); if (!lg || !lg.members.includes(n.id)) return 'not a member';
  lg.members = lg.members.filter((x) => x !== n.id); n.leagueMember = n.leagueMember.filter((x) => x !== LEAGUE);
  if (lg.calls) lg.calls = lg.calls.filter((c) => c.to !== n.id);
  dropMod(n, 'league');
  for (const m of lg.members) addOpinion(s, m, n.id, 'left_league', -20, 365 * 10);
  chronicle(s, n.id, 'league', T(`${n.short.en} left the ${LEAGUE_NAME.en}.`, `${n.short.de} verließ den ${LEAGUE_NAME.de}.`));
  return null;
}
/** Members worn out by war are not called to the league's defence. */
export const LEAGUE_CALL_EXHAUSTION = 40;
/** Days a human member has to answer the league's call to arms (unanswered, it stays out). */
export const LEAGUE_CALL_DAYS = 30;
/** What staying out of a member town's defence costs: that town thinks less of us (AI and human members alike). */
export const LEAGUE_STAYED_OUT = -15;
/** When a member town is attacked, the other members within reach are called to its defence. AI members join with a
 *  chance of 70 %; a human member is asked and answers within LEAGUE_CALL_DAYS (league command answer_call). Members
 *  allied to or at truce with the attacker, too far away, or worn out by war (exhaustion LEAGUE_CALL_EXHAUSTION or
 *  more) are not called. */
function leagueOnWar(s: GameState, w: World, war: War) {
  const lg = league(s); if (!lg) return;
  const victim = s.nations[war.goal.target]; const att = war.attLead;
  if (!victim || !lg.members.includes(victim.id) || lg.members.includes(att) || victim.capital < 0) return;
  if (war.goal.type === 'independence' || war.goal.type === 'civil_war' || war.goal.type === 'rebels') return;
  for (const id of lg.members) {
    const m = s.nations[id];
    if (!m?.alive || !leagueCallable(s, w, war, id, victim.id, att) || m.warExhaustion >= LEAGUE_CALL_EXHAUSTION) continue;
    if (isHuman(s, id)) {
      (lg.calls ??= []).push({ war: war.id, member: victim.id, attacker: att, to: id, until: s.day + LEAGUE_CALL_DAYS });
      notice(s, id, 'league', T(`${s.nations[att].short.en} has attacked ${victim.short.en}: the league calls us to its defence. Join or stay out within ${LEAGUE_CALL_DAYS} days (Empire panel).`, `${s.nations[att].short.de} hat ${victim.short.de} angegriffen: Der Bund ruft uns zu seiner Verteidigung. Beitreten oder fernbleiben binnen ${LEAGUE_CALL_DAYS} Tagen (Reich).`));
      continue;
    }
    if (chance(s.rng, 0.7)) war.def.push(id);
    else stayedOut(s, id, victim.id);
  }
}
function leagueCallable(s: GameState, w: World, war: War, id: number, victim: number, att: number): boolean {
  const m = s.nations[id], v = s.nations[victim];
  if (!m?.alive || !v?.alive || id === victim || war.att.includes(id) || war.def.includes(id) || m.capital < 0 || v.capital < 0) return false;
  return !hasTreaty(s, id, att, 'alliance') && !hasTreaty(s, id, att, 'truce') && w.distKm(m.capital, v.capital) <= 1200;
}
function stayedOut(s: GameState, id: number, victim: number) { addOpinion(s, victim, id, 'league_stayed_out', LEAGUE_STAYED_OUT, 365 * 5); }
/** A human member answers the league's call to arms. */
export function answerLeagueCall(s: GameState, w: World, n: Nation, warId: number, yes: boolean): string | null {
  const lg = league(s); const calls = lg?.calls ?? [];
  const k = calls.findIndex((c) => c.war === warId && c.to === n.id);
  if (!lg || k < 0) return 'no call of the league is pending';
  const c = calls[k];
  if (yes && n.warExhaustion >= LEAGUE_CALL_EXHAUSTION) return 'too exhausted by war';
  calls.splice(k, 1);
  const war = s.wars.find((x) => x.id === warId);
  if (!war) return 'the war is over';
  if (!lg.members.includes(n.id) || !leagueCallable(s, w, war, n.id, c.member, c.attacker)) return 'no call of the league is pending';
  if (!yes) { stayedOut(s, n.id, c.member); return null; }
  war.def.push(n.id);
  chronicle(s, n.id, 'league', T(`${n.short.en} answered the league's call and took up arms for ${s.nations[c.member].short.en}.`, `${n.short.de} folgte dem Ruf des Bundes und griff für ${s.nations[c.member].short.de} zu den Waffen.`));
  return null;
}
/** Calls left unanswered: the member stays out. Calls for wars that ended lapse. */
function leagueCallsMonth(s: GameState, w: World) {
  const lg = league(s); if (!lg?.calls?.length) return;
  const keep: NonNullable<typeof lg.calls> = [];
  for (const c of lg.calls) {
    const war = s.wars.find((x) => x.id === c.war);
    if (!war || !lg.members.includes(c.to) || !leagueCallable(s, w, war, c.to, c.member, c.attacker)) continue;
    if (s.day >= c.until) { stayedOut(s, c.to, c.member); notice(s, c.to, 'league', T(`We did not answer the league's call for ${s.nations[c.member].short.en}; it counts us as staying out.`, `Wir antworteten nicht auf den Ruf des Bundes für ${s.nations[c.member].short.de}; er wertet es als Fernbleiben.`)); continue; }
    keep.push(c);
  }
  lg.calls = keep;
}
function leagueYear(s: GameState, w: World) {
  const lg = league(s); if (!lg) return;
  lg.members = lg.members.filter((id) => s.nations[id]?.alive && s.nations[id].overlord < 0);
  for (const n of s.nations) if (n.leagueMember.includes(LEAGUE) && !lg.members.includes(n.id)) { n.leagueMember = n.leagueMember.filter((x) => x !== LEAGUE); dropMod(n, 'league'); }
  // eligible towns join over time (AI): trade draws them in
  for (const n of s.nations) if (!lg.members.includes(n.id) && n.overlord < 0 && !isHuman(s, n.id) && leagueEligible(s, w, n) && chance(s.rng, 0.3)) joinLeague(s, w, n);
  let best = -1, bd = -1, tot = 0;
  for (const id of lg.members) { const d = nationDev(s, id); tot += d; if (d > bd || (d === bd && id < best)) { bd = d; best = id; } }
  lg.leader = best; lg.strength = Math.round(tot);
}

// ---------------------------------------------------------------- the system
function empireMonth(s: GameState, w: World) {
  const E = s.empire;
  E.members = s.nations.filter((n) => n.alive && n.isHRE).map((n) => n.id);
  // land lost to outsiders
  const L = w.L; const land = E.land && E.land.length === L ? E.land : null;
  let lost = 0;
  const own = s.loc.owner;
  const next = new Uint8Array(L);
  for (let i = 0; i < L; i++) {
    const o = own[i]; const m = o >= 0 && s.nations[o].isHRE ? 1 : 0; next[i] = m;
    if (land && land[i] && !m && o >= 0) lost++;
  }
  E.land = next;
  if (lost) moveAuth(s, 'x_emp_land_lost', -Math.min(2, lost * 0.2));
  for (const [k, v] of authorityDrift(s)) if (v) moveAuth(s, k as string, v);
  // the emperor's crown and the members' duties
  const em = alive(s, E.emperor);
  if (em) setMod(s, em, 'imperial_crown', T('Imperial crown', 'Kaiserkrone'), crownEffects(s));
  const mfx = memberEffects(s);
  for (const id of E.members) { const n = s.nations[id]; if (id !== E.emperor) setMod(s, n, 'imperial_member', T('Member of the Empire', 'Glied des Reiches'), mfx); }
  if (em && hasReform(s, 'common_penny')) {
    const pp = pennyParts(s);
    if (pp.paid > 0) for (const id of pp.payers) {
      const n = s.nations[id]; const t = n.income.tax * pp.rate * pp.factor; if (t <= 0) continue;
      addExpense(n, 'imperial_tax', t); addIncome(em, 'imperial_tax', t);
    }
  }
  // calls and orders: open ones lapse at their deadline (a human emperor who says nothing has refused)
  for (const c of E.calls ?? []) {
    if (c.answer === 0 && (s.day >= c.until || !s.wars.some((x) => x.id === c.war))) answerCall(s, w, c, false);
    if (c.answer === 1 && !s.wars.some((x) => x.id === c.war)) { c.answer = 2; if (s.nations[c.member]?.alive) moveAuth(s, 'x_emp_defence_won', 1); }
  }
  E.calls = (E.calls ?? []).filter((c) => c.answer === 0 || c.answer === 1 || s.day - c.until < 365);
  for (const o of E.orders ?? []) if (o.answer === 0 && (s.day >= o.until || !s.wars.some((x) => x.id === o.war))) answerOrder(s, w, o, false);
  E.orders = (E.orders ?? []).filter((o) => o.answer === 0 || s.day - o.until < 365);
  // an AI emperor orders the aggressor in a war between members to stop
  if (em && !isHuman(s, em.id) && em.authority >= ORDER_COST + 20 && E.authority >= 25) {
    for (const war of internalWars(s)) {
      if (war.att.includes(em.id) || war.def.includes(em.id) || (E.orders ?? []).some((o) => o.war === war.id) || s.day - war.start < 90) continue;
      if (chance(s.rng, 0.08)) { orderPeace(s, w, em, war.id); break; }
    }
  }
  // the election
  if (E.election) {
    // AI candidates woo the electors whose vote is closest to theirs
    for (const c of E.election.candidates) {
      const n = s.nations[c]; if (!n?.alive || isHuman(s, c) || n.treasury < campaignCost(s, n) * 3 || !chance(s.rng, 0.4)) continue;
      let best = -1, gap = Infinity;
      for (const el of E.electors) {
        if (isHuman(s, el) || el === c) continue;
        const ch = electorChoice(s, w, el); if (ch === c) continue;
        const d = sumRows(voteScore(s, w, el, ch)) - sumRows(voteScore(s, w, el, c));
        if (d < gap && d < 45 && (E.favour?.[`${c}>${el}`] ?? 0) < 60) { gap = d; best = el; }
      }
      if (best >= 0) campaign(s, n, best);
    }
    if (s.day >= E.election.closes) closeElection(s, w);
  } else {
    const changed = em && em.flags.ruler_changed && em.flags.ruler_changed > E.lastElection;
    if (!em || !em.isHRE || em.overlord >= 0) openElection(s, w);
    else if (changed) {
      if (hasReform(s, 'hereditary_crown')) { E.lastElection = s.day; chronicle(s, em.id, 'emperor', T(`The imperial crown passed by inheritance to the new ruler of ${em.short.en}.`, `Die Kaiserkrone ging durch Erbfolge an den neuen Herrscher von ${em.short.de}.`)); }
      else openElection(s, w);
    }
  }
  // the diet
  if (E.diet) {
    if (em && !isHuman(s, em.id) && chance(s.rng, 0.5)) {
      // the AI emperor lobbies the member nearest to changing its vote
      const r = reformDef(E.diet.proposal);
      if (r && em.treasury > campaignCost(s, em) * 3) {
        let best = -1, gap = Infinity;
        for (const id of dietVoters(s)) { if (id === em.id || isHuman(s, id)) continue; const v = sumRows(dietStance(s, s.nations[id], r)); if (v <= 0 && -v < gap && (E.favour?.[`${em.id}>${id}`] ?? 0) < 60) { gap = -v; best = id; } }
        if (best >= 0 && gap < 30) campaign(s, em, best);
      }
    }
    if (s.day >= E.diet.ends) closeDiet(s);
  } else if (em && !isHuman(s, em.id)) {
    const r = nextReform(s);
    if (r && E.authority >= r.cost + 5 && s.day - (E.lastDiet ?? -1e9) >= dietCooldown(s) && chance(s.rng, 0.1)) {
      E.diet = { proposal: r.id, votesFor: [], votesAgainst: [], ends: s.day + 60, by: em.id };
      // a diet whose outcome is hopeless is not summoned
      const t = dietTally(s);
      if (!dietPasses({ yes: t.yes + t.total * 0.1, no: t.no, total: t.total })) { E.diet = null; E.lastDiet = s.day - dietCooldown(s) + 365; }
      else for (const p of s.playerNations) if (s.nations[p]?.isHRE) notice(s, p, 'imperial_diet', T(`The diet meets to decide on: ${r.name.en}. Our vote is awaited.`, `Der Reichstag tritt zusammen und berät über: ${r.name.de}. Unsere Stimme wird erwartet.`));
    }
  }
  // the league
  const lg = league(s);
  if (!lg) foundLeague(s, w);
  else for (const id of lg.members) { const n = s.nations[id]; if (n?.alive) setMod(s, n, 'league', LEAGUE_NAME, leagueEffects(s, n)); }
  leagueCallsMonth(s, w);
}
function empireYear(s: GameState, w: World) {
  const E = s.empire;
  E.authLast = E.authLog ?? {}; E.authLog = {};
  keepElectors(s);
  // members think of the emperor as his authority deserves
  const em = alive(s, E.emperor);
  if (em) for (const id of E.members) if (id !== em.id && s.nations[id]?.alive) addOpinion(s, id, em.id, 'imperial_authority', Math.round((E.authority - 40) / 3), 400);
  if (E.favour) for (const k in E.favour) { E.favour[k] = Math.floor(E.favour[k] * 0.8); if (E.favour[k] <= 0) delete E.favour[k]; }
  leagueYear(s, w);
}

warHooks.veto = warVeto;
warHooks.check = warVetoCheck;
warHooks.declared = realmBodiesOnWar;

export const empire: System = {
  id: 'empire',
  // a realm of many princes and a crown of modest means (Golden Bull of the age): authority starts at 35
  init(s) { if (!s.empire.authority) s.empire.authority = 35; },
  monthly({ s, w }) { empireMonth(s, w); },
  yearly({ s, w }) { empireYear(s, w); },
};
