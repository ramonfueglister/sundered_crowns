// The AI's statecraft: what an AI realm does with the court, the estates, the mint, its preachers and officials, its
// spies and its laws. Every step goes through the same commands a player gives (applyCommand, via aiApply so that it
// is counted and logged), chosen by the realm's situation and flavoured by its personality. Called monthly from
// systems/ai.ts strategic(). Merchants, tariffs and embargoes (trade track) and assaults (war track) are not here.
import type { GameState, Nation, Character } from '../types';
import type { World } from '../world';
import { enemiesOf, hasTreaty } from '../ctx';
import { chance } from '../rng';
import { aiApply } from './ai_log';
import { OFFICES, OFFICE_COST, PRIVILEGES, officeCandidates, officeBonusOf, lawEffect, reformCost } from './politics';
import { agentSlots } from './society';
import { overextension } from './economy';
import { nationLocsRO, hasCasusBelli } from './war';
import { LAWS } from '../content/laws';
import { faithFamily, GROUP_OF, ALL_CULTURES, FAITH_INDEX } from '../content/peoples';

const YEAR = 365;
const P = (n: Nation, k: string) => n.personality === k;
const flag = (n: Nation, k: string) => n.flags[k] ?? 0;

/** What the realm's situation looks like this month (computed once, shared by all choices). */
export interface Situation {
  gross: number; tax: number; expense: number; loans: number; deficit: boolean; atWar: boolean;
  locs: number; foreignFaith: number; foreignCulture: number; kinCulture: number; tradeShare: number;
  unrest: number; overext: number; coast: number; behind: boolean;
}
export function situation(s: GameState, w: World, n: Nation, atWar: boolean): Situation {
  let gross = 0; for (const k in n.income) gross += Math.max(0, n.income[k]);
  let expense = 0; for (const k in n.expense) expense += Math.max(0, n.expense[k]);
  const locs = nationLocsRO(s, n.id);
  let dev = 0, ff = 0, fc = 0, kc = 0, un = 0, coast = 0;
  const grp = GROUP_OF[ALL_CULTURES[n.culture]];
  for (const i of locs) {
    if (i >= w.L) continue;
    const d = Math.max(1, s.loc.dev[i]); dev += d;
    if (s.loc.faith[i] !== n.faith) ff += d;
    if (s.loc.culture[i] !== n.culture) { fc += d; if (GROUP_OF[ALL_CULTURES[s.loc.culture[i]]] === grp) kc += d; }
    un += s.loc.unrest[i] * d;
    if (w.coastal[i]) coast++;
  }
  dev = Math.max(1, dev);
  // behind in learning: a realm within reach is two levels ahead in some branch
  let behind = false;
  if (n.capital >= 0) for (const o of s.nations) {
    if (!o.alive || o.id === n.id || o.capital < 0 || w.distKm(n.capital, o.capital) > 1200) continue;
    if (o.tech.some((t, k) => t >= n.tech[k] + 2)) { behind = true; break; }
  }
  return {
    gross, tax: n.income.tax || 0, expense, loans: n.loans.length, deficit: expense > gross * 1.02, atWar,
    locs: locs.length, foreignFaith: ff / dev, foreignCulture: fc / dev, kinCulture: kc / dev,
    tradeShare: gross > 0 ? ((n.income.trade || 0) + (n.income.tariffs || 0)) / gross : 0,
    unrest: un / dev, overext: overextension(n), coast, behind,
  };
}

/** One month of statecraft for an AI realm. */
export function statecraft(s: GameState, w: World, n: Nation, atWar: boolean) {
  if (n.capital < 0) return;
  const sit = situation(s, w, n, atWar);
  offices(s, w, n);
  estates(s, w, n, sit);
  coinage(s, w, n, sit);
  agents(s, w, n, sit);
  espionage(s, w, n, sit);
}

// ---------------- the council ----------------
/** Fill a vacant office, or put the ablest person at court in an office held by a much weaker or disloyal one.
 *  At most one appointment a month, and only while Authority is not needed for a reform. (The AI keeps to the
 *  custom of the age and appoints men; a player may appoint anyone.) */
export function offices(s: GameState, w: World, n: Nation) {
  if (n.authority < OFFICE_COST + 30) return;
  const cands = officeCandidates(s, n).filter((c) => !c.female && !s.armies.some((a) => a.general === c.id));
  if (!cands.length) return;
  let best: { office: string; c: Character; gain: number; why: string } | null = null;
  for (const off of OFFICES) {
    const cur = s.chars[n.council[off.id]];
    const vacant = !cur || !cur.alive;
    const curV = vacant ? 0 : officeBonusOf(cur, off.id);
    const disloyal = !vacant && (cur.loyalty ?? 50) < 20;
    for (const c of cands) {
      const gain = officeBonusOf(c, off.id) - curV;
      if (gain <= 0) continue;
      if (!vacant && !disloyal && gain < 0.03) continue; // not worth offending the holder (about two skill points)
      const v = gain + (vacant ? 1 : 0) + (disloyal ? 0.05 : 0);
      if (!best || v > best.gain || (v === best.gain && c.id < best.c.id)) best = { office: off.id, c, gain: v, why: vacant ? 'vacant' : 'ablest' };
    }
  }
  if (!best) return;
  aiApply(s, w, { t: 'office', n: n.id, office: best.office, char: best.c.id }, best.why);
}

// ---------------- the estates ----------------
const PRIV_NEED: Record<string, string> = { authority: 'need_authority', treasury_months: 'need_gold', concord: 'need_concord', mandate: 'need_mandate' };
/** The estates: gifts for a restless estate, the assembly summoned when the crown needs Authority, a privilege granted
 *  to a weak estate for what the realm lacks, and one revoked from an over-mighty estate. At most one step a month. */
export function estates(s: GameState, w: World, n: Nation, sit: Situation) {
  if (!n.estates?.length) return;
  const appeaseCost = Math.max(20, (n.income.tax || 10) * 1.5);
  // gifts and favours for a restless estate that is strong enough to matter
  for (const e of [...n.estates].sort((a, b) => a.contentment - b.contentment)) {
    if (e.contentment >= 35 || e.influence < 25 || flag(n, `appease_${e.id}`) > s.day) continue;
    if (n.treasury < appeaseCost * (sit.atWar ? 3 : 2)) break;
    if (aiApply(s, w, { t: 'estate', n: n.id, estate: e.id, action: 'appease' }, 'estate_restless').ok) return;
  }
  // an over-mighty estate loses its oldest privilege (in peace, with Authority to spare, and only if it stays calm)
  if (!sit.atWar && n.authority >= 80 && flag(n, 'ai_revoke') <= s.day) {
    const e = n.estates.filter((x) => x.influence > 58 && x.privileges.length && x.contentment >= 62).sort((a, b) => b.influence - a.influence)[0];
    if (e && aiApply(s, w, { t: 'estate', n: n.id, estate: e.id, action: 'revoke', privilege: e.privileges[0] }, 'estate_overmighty').ok) { n.flags.ai_revoke = s.day + 5 * YEAR; return; }
  }
  // what the realm lacks
  const need: Record<string, number> = {
    authority: n.authority < 15 && !n.reform && flag(n, 'ai_reform') <= s.day ? 1 + (15 - n.authority) / 15 : 0,
    treasury_months: n.treasury < 0 && sit.loans >= 3 ? 1 + sit.loans / 4 : 0,
    concord: n.concord < -30 ? 1 + (-30 - n.concord) / 50 : 0,
    mandate: n.mandate < 20 ? 1 + (20 - n.mandate) / 20 : 0,
  };
  // summon the assembly when Authority is short and an estate is content enough to bear it
  if (n.authority < 30 && flag(n, 'assembly') <= s.day && (n.laws.diet ?? 1) > 0) {
    const e = n.estates.filter((x) => x.contentment >= 58 && x.influence < 55).sort((a, b) => b.influence - a.influence)[0];
    if (e && aiApply(s, w, { t: 'estate', n: n.id, estate: e.id, action: 'summon' }, 'need_authority').ok) return;
  }
  // a privilege for a weak estate, chosen for what the realm lacks (at most one every eight years; builders and
  // diplomats bargain more readily than conquerors, who bargain only with the magnates)
  if (flag(n, 'ai_grant') > s.day) return;
  let best: { pid: string; estate: string; v: number; why: string } | null = null;
  for (const p of PRIVILEGES) {
    const e = n.estates.find((x) => x.id === p.estate); if (!e || e.privileges.includes(p.id)) continue;
    if (e.influence + 8 > 48 || e.privileges.length >= 2) continue;
    if (P(n, 'conqueror') && p.estate !== 'magnates') continue;
    let v = 0, why = '';
    for (const k in p.grant) { const nv = need[k] ?? 0; if (nv > v) { v = nv; why = PRIV_NEED[k]; } }
    // village charters calm a restless countryside; a restless estate is won over by a privilege
    if (p.id === 'commons_charters' && sit.unrest > 30) { const u = 1 + (sit.unrest - 30) / 25; if (u > v) { v = u; why = 'unrest'; } }
    if (e.contentment < 25 && e.influence >= 25 && n.treasury < appeaseCost) { const r = 1 + (25 - e.contentment) / 25; if (r > v) { v = r; why = 'estate_restless'; } }
    if (v <= 0) continue;
    // the lasting cost of the privilege: a smaller tax take hurts an indebted crown most
    v -= Math.max(0, -(p.effects.tax ?? 0)) * (sit.loans >= 3 ? 4 : 2) + Math.max(0, -(p.effects.authority_gain ?? 0));
    if (P(n, 'builder') || P(n, 'diplomat')) v += 0.2;
    if (!best || v > best.v || (v === best.v && p.id < best.pid)) best = { pid: p.id, estate: p.estate, v, why };
  }
  if (best && best.v >= 1 && aiApply(s, w, { t: 'estate', n: n.id, estate: best.estate, action: 'grant', privilege: best.pid }, best.why).ok) n.flags.ai_grant = s.day + 8 * YEAR;
}

// ---------------- the mint ----------------
/** Debase the coin when the debts or a war cannot be paid otherwise; restore it once the treasury has recovered or
 *  prices run away. */
export function coinage(s: GameState, w: World, n: Nation, sit: Situation) {
  const deep = sit.loans >= 4 || (n.treasury < 0 && sit.loans >= 3);
  const warChest = sit.atWar && n.treasury < sit.gross * 0.5 && sit.loans >= 3;
  if (n.coinage < 0.149 && (deep || warChest) && n.mandate > 35 && n.inflation < 0.2 && flag(n, 'ai_coin') <= s.day) {
    const v = Math.round(Math.min(0.15, n.coinage + 0.1) * 100) / 100;
    if (aiApply(s, w, { t: 'budget', n: n.id, key: 'coinage', value: v }, deep ? 'debt' : 'war_chest').ok) n.flags.ai_coin = s.day + YEAR;
    return;
  }
  if (n.coinage > 0) {
    const recovered = !sit.atWar && sit.loans <= 1 && n.treasury > sit.gross * 4;
    if (recovered || n.inflation > 0.3) aiApply(s, w, { t: 'budget', n: n.id, key: 'coinage', value: 0 }, n.inflation > 0.3 ? 'inflation' : 'restore_coin');
  }
}

// ---------------- preachers and officials ----------------
/** Preachers for land of another faith (a zealous or intolerant crown; a tolerant one leaves its subjects their
 *  faith), officials to spread the ruling tongue in land of a kindred people (builders and diplomats, or a realm of
 *  many peoples). Only in quiet, well-held land, and only with gold to spare. */
export function agents(s: GameState, w: World, n: Nation, sit: Situation) {
  const busy = s.agents.filter((a) => a.nation === n.id).length;
  if (busy >= agentSlots(n) || n.treasury < sit.gross * 3 || sit.deficit || sit.atWar) return;
  const tol = lawEffect(n, 'tolerance');
  const zeal = P(n, 'zealot');
  const convert = sit.foreignFaith > 0.03 && (zeal || tol < 0.5) && chance(s.rng, zeal ? 0.4 : 0.15);
  const unite = !convert && sit.foreignCulture > 0.05 && (P(n, 'builder') || P(n, 'diplomat') || sit.foreignCulture > 0.3) && chance(s.rng, 0.08);
  if (!convert && !unite) return;
  const kind: 'faith' | 'culture' = convert ? 'faith' : 'culture';
  const grp = GROUP_OF[ALL_CULTURES[n.culture]];
  let best = -1, bv = 0;
  for (const i of nationLocsRO(s, n.id)) {
    if (i >= w.L || s.loc.ctrl[i] !== n.id || s.loc.control[i] < 0.5 || s.loc.unrest[i] > (kind === 'faith' ? 25 : 20)) continue;
    if (s.agents.some((a) => a.loc === i && a.kind === kind)) continue;
    let v: number;
    if (kind === 'faith') {
      const f = s.loc.faith[i]; if (f === n.faith || f === FAITH_INDEX.jewish) continue;
      v = (faithFamily(f) === faithFamily(n.faith) ? 1.2 : 0.7);
    } else {
      const c = s.loc.culture[i]; if (c === n.culture) continue;
      v = GROUP_OF[ALL_CULTURES[c]] === grp ? 1.6 : sit.foreignCulture > 0.3 ? 0.6 : 0; if (!v) continue;
    }
    // worth: the development won per month of work, in well-controlled land
    const d = s.loc.dev[i];
    v *= s.loc.control[i] * d / (18 + d * 0.4) / (1 + d / 20);
    if (v > bv || (v === bv && best >= 0 && i < best)) { bv = v; best = i; }
  }
  if (best < 0) return;
  aiApply(s, w, { t: 'agent', n: n.id, loc: best, kind }, kind === 'faith' ? 'zeal' : 'unity');
}

// ---------------- spies ----------------
/** Spies: stir up rebels in the land of the enemy we lead a war against, steal the learning of a neighbour far
 *  ahead, slander a rival, and forge a claim before a war a scheming crown is planning. A chance each month that
 *  depends on the personality; each target at most every few years. */
export function espionage(s: GameState, w: World, n: Nation, sit: Situation) {
  const cost = 30 * s.priceLevel;
  if (n.treasury < cost * 5 || flag(n, 'ai_spy') > s.day || s.spies.filter((x) => x.nation === n.id).length >= 2) return;
  const p = P(n, 'opportunist') ? 0.15 : P(n, 'conqueror') ? 0.1 : P(n, 'zealot') ? 0.06 : P(n, 'trader') ? 0.06 : P(n, 'diplomat') ? 0.05 : P(n, 'builder') ? 0.04 : 0.02;
  if (!chance(s.rng, sit.atWar ? Math.min(0.3, p * 2) : p)) return;
  const busy = (t: number, a: string) => s.spies.some((x) => x.nation === n.id && x.target === t && x.action === a);
  const ok = (t: number, a: string) => s.nations[t]?.alive && t !== n.id && !busy(t, a) && flag(n, `spy_${a}_${t}`) <= s.day;
  const go = (t: number, a: string, why: string, cool: number) => {
    const r = aiApply(s, w, { t: 'spy', n: n.id, target: t, action: a }, why);
    if (r.ok) { n.flags[`spy_${a}_${t}`] = s.day + cool * YEAR; n.flags.ai_spy = s.day + YEAR; }
    return r.ok;
  };
  // the enemy whose war we lead
  if (sit.atWar) {
    for (const war of s.wars) {
      const lead = war.attLead === n.id ? war.defLead : war.defLead === n.id ? war.attLead : -1;
      if (lead >= 0 && ok(lead, 'support_rebels') && go(lead, 'support_rebels', 'enemy', 5)) return;
    }
  }
  // learning from a realm within reach that is far ahead
  if (sit.behind && n.capital >= 0) {
    let best = -1, bd = Infinity;
    for (const o of s.nations) {
      if (!o.alive || o.id === n.id || o.capital < 0 || !o.tech.some((t, k) => t >= n.tech[k] + 2)) continue;
      const d = w.distKm(n.capital, o.capital); if (d > 1200 || !ok(o.id, 'steal_tech')) continue;
      if (d < bd) { bd = d; best = o.id; }
    }
    if (best >= 0 && go(best, 'steal_tech', 'behind', 5)) return;
  }
  // slander a rival
  for (const r of n.rivals) if (ok(r, 'slander') && !enemiesOf(s, n.id).has(r) && go(r, 'slander', 'rival', 5)) return;
  // a claim forged before a war a scheming or conquering crown is planning (a rival without a cause for war)
  if (!sit.atWar && (P(n, 'opportunist') || P(n, 'conqueror'))) {
    for (const r of n.rivals) {
      if (!s.nations[r]?.alive || hasTreaty(s, n.id, r, 'alliance') || !ok(r, 'fabricate')) continue;
      const cb = hasCasusBelli(s, n.id, r);
      if (cb && cb !== 'rivalry') continue;
      if (go(r, 'fabricate', 'before_war', 6)) return;
    }
  }
}

// ---------------- laws ----------------
/** How much the realm values one unit of each effect a law gives, by its situation and personality. */
export function lawWeights(n: Nation, sit: Situation): Record<string, number> {
  const war = sit.atWar ? 1 : 0, debt = sit.loans >= 3 || n.treasury < 0 ? 1 : 0;
  const big = sit.locs > 40 ? 1 : 0;
  const zeal = P(n, 'zealot') ? 1 : 0, conq = P(n, 'conqueror') ? 1 : 0, trader = P(n, 'trader') ? 1 : 0, builder = P(n, 'builder') ? 1 : 0;
  const coastal = sit.coast >= 6 ? 1 : 0;
  const latin = n.faith === FAITH_INDEX.latin ? 1 : 0;
  return {
    tax: 1 + debt + (sit.deficit ? 0.5 : 0) + war * 0.3,
    trade: 0.4 + sit.tradeShare * 2 + trader * 0.6,
    tariff_max: sit.tradeShare * 0.5,
    production: 0.6 + builder * 0.3,
    growth: 1.5,
    admin: 0.4 + Math.min(1, sit.overext) + big * 0.3 + builder * 0.2,
    control: 0.8 + big * 0.5 + Math.min(1, sit.overext) * 0.5,
    manpower: 0.35 + war * 0.5 + conq * 0.5,
    discipline: 0.8 + conq * 0.6 + war * 0.4,
    morale: 0.6 + conq * 0.4 + war * 0.3,
    shock: 0.5 + conq * 0.3,
    cavalry: 0.2,
    quality: 0.2,
    defence: 0.25 + (P(n, 'isolationist') ? 0.3 : 0),
    army_cost: -(0.3 + debt * 0.4),
    mercenary_cost: -0.1,
    unrest: -(0.04 + sit.unrest / 400),
    tolerance: sit.foreignFaith * 2 + trader * 0.2 - zeal * 1.2 - 0.2,
    conversion: sit.foreignFaith * 1.5 + zeal * 1,
    research: 0.6 + builder * 0.3 + (sit.behind ? 0.4 : 0),
    literacy: 3 + builder,
    corruption: -2,
    interest: -(5 + sit.loans * 2),
    inflation_resist: 0.15 + n.inflation + n.coinage,
    mandate_gain: 0.5,
    concord_gain: 0.5,
    authority: 0.08,
    estate_power: -0.6,
    succession_strife: -0.4,
    naval: coastal * (0.3 + trader * 0.3),
    naval_cost: -coastal * 0.1,
    sailors: coastal * 0.1,
    trade_raid: coastal * 0.1,
    colonise: coastal * (0.1 + trader * 0.2),
    speed: 0.3,
    fort_strength: 0.2 + (P(n, 'isolationist') ? 0.3 : 0),
    fort_cost: -0.1,
    diplomacy: 0.2 + (P(n, 'diplomat') ? 0.4 : 0),
    foreign_claims: 0.1,
    prestige: 0.2,
    reform_pressure: -0.2 * latin,
    innovation_block: -0.3,
    curia: 0.01 * latin,
    exempt_5: -0.15, exempt_4: -0.1, exempt_3: -0.08,
    war_vote: -0.2,
  };
}
/** The driver a reform is chosen for (a key of ai_log WHY). */
const DRIVER: Record<string, string> = {
  tax: 'rf:tax', trade: 'rf:trade', tariff_max: 'rf:trade', control: 'rf:hold', admin: 'rf:hold', manpower: 'rf:army', discipline: 'rf:army', morale: 'rf:army',
  shock: 'rf:army', army_cost: 'rf:army', mercenary_cost: 'rf:army', cavalry: 'rf:army', quality: 'rf:army', defence: 'rf:army', unrest: 'rf:order', tolerance: 'rf:faiths',
  conversion: 'rf:faith', research: 'rf:learning', literacy: 'rf:learning', production: 'rf:prosperity', growth: 'rf:prosperity', corruption: 'rf:honest',
  interest: 'rf:credit', inflation_resist: 'rf:credit', mandate_gain: 'rf:crown', authority: 'rf:crown', succession_strife: 'rf:crown', estate_power: 'rf:crown',
  concord_gain: 'rf:crown', prestige: 'rf:crown', diplomacy: 'rf:crown', naval: 'rf:fleet', naval_cost: 'rf:fleet', sailors: 'rf:fleet', colonise: 'rf:fleet', trade_raid: 'rf:fleet',
};
/** Laws the AI leaves as they are (the succession and the regency are matters of the house, not of policy). */
const AI_KEEPS = new Set(['succession', 'regency']);
/** Score of changing law to option: the gain in valued effects, less the estates' displeasure and the Authority. */
export function reformScore(n: Nation, law: string, option: number, wts: Record<string, number>): { v: number; driver: string } {
  const L = LAWS.find((x) => x.id === law); if (!L) return { v: -1, driver: '' };
  const cur = L.options[n.laws[law] ?? 0], nxt = L.options[option]; if (!cur || !nxt) return { v: -1, driver: '' };
  let v = 0, top = 0, driver = 'rf:realm';
  const keys = new Set([...Object.keys(cur.effects), ...Object.keys(nxt.effects)]);
  for (const k of keys) {
    const d = (nxt.effects[k] ?? 0) - (cur.effects[k] ?? 0);
    const c = d * (wts[k] ?? 0);
    v += c;
    if (c > top) { top = c; driver = DRIVER[k] ?? 'rf:realm'; }
  }
  for (const [eid, dv] of Object.entries(nxt.estates)) {
    const e = n.estates.find((x) => x.id === eid); if (!e || dv >= 0) continue;
    v += dv * (e.influence / 100) * 0.02 * (e.contentment < 45 ? 2 : 1);
  }
  v -= reformCost(n, law, option) / 800;
  return { v, driver };
}
/** Choose and begin the most valuable reform for the realm's situation (with Authority to spare, at most one every
 *  three years; a law changed recently is left alone for 25 years). Returns true when a reform began. */
export function aiReforms(s: GameState, w: World, n: Nation, atWar: boolean, sit?: Situation): boolean {
  if (n.reform || n.authority < 90 || flag(n, 'ai_reform') > s.day) return false;
  const st = sit ?? situation(s, w, n, atWar);
  const wts = lawWeights(n, st);
  const opts: { law: string; o: number; v: number; driver: string }[] = [];
  for (const L of LAWS) {
    if (AI_KEEPS.has(L.id) || flag(n, `law_${L.id}`) > s.day) continue;
    const cur = n.laws[L.id] ?? 0;
    for (let o = 0; o < L.options.length; o++) {
      if (o === cur) continue;
      const opt = L.options[o];
      if ((opt.minEra ?? 0) > n.era || (opt.gov && !opt.gov.includes(n.gov))) continue;
      if (n.authority < reformCost(n, L.id, o) + 20) continue;
      // the estates would block it in the assembly
      if (Object.entries(opt.estates).some(([eid, dv]) => { const e = n.estates.find((x) => x.id === eid); return e && dv < -5 && e.influence > 55 && e.contentment < 45; })) continue;
      const r = reformScore(n, L.id, o, wts);
      if (r.v > 0.1) opts.push({ law: L.id, o, v: r.v, driver: r.driver });
    }
  }
  opts.sort((a, b) => b.v - a.v || (a.law < b.law ? -1 : a.law > b.law ? 1 : a.o - b.o));
  for (const x of opts.slice(0, 3)) {
    if (aiApply(s, w, { t: 'law', n: n.id, law: x.law, option: x.o }, x.driver).ok) { n.flags[`law_${x.law}`] = s.day + 25 * YEAR; n.flags.ai_reform = s.day + 3 * YEAR; return true; }
  }
  return false;
}
