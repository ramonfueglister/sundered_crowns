// Government forms, the Powers of the Realm and their assembly (spec points 36, 39 and 95).
// Each form chooses its head its own way: monarchies inherit, an elective crown is given by the estates to one of
// several candidates, the republics hold elections every few years with term limits, theocracies are chosen by the
// prelates from the clergy, and tribes and hordes acclaim the ablest of the ruling kin or a war leader. Each form
// draws its Mandate from its own source. The influence of each Power follows the share its classes hold of the
// people and the wealth of the realm, its standing, the laws and its privileges. Influential Powers demand
// privileges and obstruct the crown when refused; where the law gives the assembly a say, it votes on tax rises
// above the level it granted and on wars, for the player as for the AI.
import type { GameState, Nation, WarGoal, I18n } from '../types';
import type { World } from '../world';
import { type System, clamp, chronicle, notice, addExpense } from '../ctx';
import { CL, CLASS_NEED_MULT } from '../defs';
import { ESTATES, PRIVILEGES, estate, lawEffect, newChar, ageOf, grantPrivilege, pickNewHeir } from './politics';
import { nationDev, hasCasusBelli } from './war';
import { chance, rand, hash01 } from '../rng';

type Row = [string | I18n, number];
const T = (en: string, de: string): I18n => ({ en, de });
const isHuman = (s: GameState, id: number) => s.playerNations.includes(id) || !!s.nations[id]?.playerId;
/** Only a player's realm or a large one fills the chronicle with its elections and estate quarrels. */
const notable = (s: GameState, n: Nation) => isHuman(s, n.id) || nationDev(s, n.id) > 150;
const sumRows = (r: Row[]) => r.reduce((p, x) => p + x[1], 0);
export const estateName = (id: string): I18n => ESTATES.find((e) => e.id === id)?.name ?? { en: id, de: id };

// ---------------------------------------------------------------- influence of the Powers
/** The classes each Power speaks for. */
export const ESTATE_CLASSES: Record<string, number[]> = {
  magnates: [CL.nobles], prelates: [CL.clergy], burghers: [CL.artisans, CL.burghers], commons: [CL.peasants, CL.labourers, CL.wage_workers],
};
/** How much weight a share of the people and their means carries for each Power (lords and prelates hold land,
 *  offices and the sacraments; the commons are many but rarely heard). */
const STANDING: Record<string, number> = { magnates: 4.2, prelates: 6.9, burghers: 1.1, commons: 0.22 };
const GOV_WEIGHT: Record<string, Record<string, number>> = {
  merchant_republic: { magnates: 0.6, burghers: 1.8 }, city_republic: { magnates: 0.6, burghers: 1.8 },
  theocracy: { prelates: 2, magnates: 0.8 }, military_order: { prelates: 2, magnates: 0.8 },
  nomadic_horde: { magnates: 1.6, burghers: 0.3, prelates: 0.5 }, tribal_federation: { magnates: 1.6, burghers: 0.3, prelates: 0.5 },
};
export interface ClassSums { pop: Float64Array; wealth: Float64Array; C: number }
/** The means of a class: its people, weighed by what its station costs to keep up (CLASS_NEED_MULT) and by its
 *  savings against the realm's average (counting at most double), so that the savings move influence without
 *  swinging it from year to year. */
function means(cs: ClassSums, n: number): number[] {
  const { pop, wealth, C } = cs; const o = n * C;
  let tp = 0, tw = 0; for (let c = 0; c < C; c++) { tp += pop[o + c]; tw += wealth[o + c]; }
  const avg = tp > 0 ? tw / tp : 0;
  const out: number[] = [];
  for (let c = 0; c < C; c++) { const p = pop[o + c]; const rel = p > 0 && avg > 0 ? wealth[o + c] / p / avg : 0; out.push(p * (CLASS_NEED_MULT[c] ?? 1) * (1 + 0.5 * Math.min(2, rel))); }
  return out;
}
/** People and wealth of every class in every realm (one pass over the map; not cached so that it never goes stale). */
export function classSums(s: GameState): ClassSums {
  const L = s.loc.owner.length; const C = Math.round(s.loc.pop.length / Math.max(1, L)); const N = s.nations.length;
  const pop = new Float64Array(N * C), wealth = new Float64Array(N * C);
  for (let l = 0; l < L; l++) {
    const o = s.loc.owner[l]; if (o < 0) continue;
    for (let c = 0; c < C; c++) { const p = s.loc.pop[l * C + c]; pop[o * C + c] += p; wealth[o * C + c] += p * s.loc.wealth[l * C + c]; }
  }
  return { pop, wealth, C };
}
/** The factors behind each Power's weight (multiplied; the first is its share of the people and the wealth). */
export function influenceFactors(s: GameState, n: Nation, cs: ClassSums = classSums(s)): Record<string, Row[]> {
  const { pop, C } = cs; const o = n.id * C;
  const mn = means(cs, n.id);
  let tp = 0, tw = 0; for (let c = 0; c < C; c++) { tp += pop[o + c]; tw += mn[c]; }
  const serf = clamp(lawEffect(n, 'serfdom'), 0, 1), trade = Math.max(0, lawEffect(n, 'trade')), tol = clamp(lawEffect(n, 'tolerance'), 0, 1);
  const parliament = (n.laws.diet ?? 1) >= 2;
  const out: Record<string, Row[]> = {};
  for (const e of n.estates) {
    let p = 0, wl = 0; for (const c of ESTATE_CLASSES[e.id] ?? []) { p += pop[o + c]; wl += mn[c]; }
    const ps = tp > 0 ? p / tp : 0.25, ws = tw > 0 ? wl / tw : 0.25;
    let law = 1;
    if (e.id === 'magnates') law *= 0.85 + 0.3 * serf;
    if (e.id === 'commons') law *= (1.3 - 0.6 * serf) * (parliament ? 1.1 : 1);
    if (e.id === 'burghers') law *= (1 + Math.min(0.5, trade)) * (parliament ? 1.15 : 1);
    if (e.id === 'prelates') law *= 1 - 0.2 * tol;
    out[e.id] = [
      [T(`Share of the people ${(ps * 100).toFixed(1)} % (x 0.3), of the means ${(ws * 100).toFixed(1)} % (x 0.7)`, `Anteil am Volk ${(ps * 100).toFixed(1).replace('.', ',')} % (x 0,3), an den Mitteln ${(ws * 100).toFixed(1).replace('.', ',')} % (x 0,7)`), +(30 * ps + 70 * ws).toFixed(2)],
      ['x_inf_standing', STANDING[e.id] ?? 1],
      ['x_inf_gov', GOV_WEIGHT[n.gov]?.[e.id] ?? 1],
      ['x_inf_laws', +law.toFixed(3)],
      ['x_inf_privileges', 1 + 0.12 * e.privileges.length],
    ];
  }
  return out;
}
/** Where each Power's influence is heading: its weight as a share of all weights (sums to 100). */
export function influenceTargets(s: GameState, n: Nation, cs?: ClassSums): Record<string, number> {
  const f = influenceFactors(s, n, cs);
  const wt: Record<string, number> = {}; let tot = 0;
  for (const id in f) { const v = f[id].reduce((p, r) => p * r[1], 1); wt[id] = v; tot += v; }
  for (const id in wt) wt[id] = tot > 0 ? (wt[id] / tot) * 100 : 25;
  return wt;
}
/** Monthly share of the gap the influence of a Power closes. */
export const INFLUENCE_DRIFT = 0.05;
/** What the other Powers' privileges cost a Power's contentment (each privilege names whom it offends). */
export function resentment(n: Nation, eid: string): number {
  let v = 0;
  for (const e of n.estates) if (e.id !== eid) for (const pid of e.privileges) v += (PRIVILEGES.find((p) => p.id === pid)?.resent?.[eid] ?? 0) * 0.3;
  return v;
}

// ---------------------------------------------------------------- demands of the Powers
const DEMAND_DAYS = 180;
function demandMonth(s: GameState, n: Nation) {
  if (n.demand) {
    if (s.day >= n.demand.until) answerDemand(s, n, false);
    return;
  }
  if (s.day - (n.flags.demand_last ?? -1e9) < 365 * 3) return;
  for (const e of n.estates) {
    if (e.influence < 35 || e.contentment > 60 || e.privileges.length >= 4) continue;
    const open = PRIVILEGES.filter((p) => p.estate === e.id && !e.privileges.includes(p.id));
    if (!open.length || !chance(s.rng, (e.influence - 30) / 100 * 0.08)) continue;
    const p = open[Math.floor(rand(s.rng) * open.length)];
    n.demand = { estate: e.id, privilege: p.id, until: s.day + DEMAND_DAYS };
    n.flags.demand_last = s.day;
    if (isHuman(s, n.id)) notice(s, n.id, 'estate_demand', T(`The ${estateName(e.id).en} demand a privilege: ${p.name.en}. Grant it or refuse them within half a year.`, `Die ${estateName(e.id).de} fordern ein Privileg: ${p.name.de}. Gewährt es oder weist sie binnen eines halben Jahres ab.`));
    else answerDemand(s, n, (e.influence > 50 || e.contentment < 35) && chance(s.rng, 0.8));
    return;
  }
}
/** Grant or refuse the privilege a Power demands. Refusing angers it, and an influential Power then obstructs the
 *  crown for a year (less Authority, less tax). */
export function answerDemand(s: GameState, n: Nation, grant: boolean): string | null {
  const d = n.demand; if (!d) return 'no demand is pending';
  n.demand = null;
  const e = estate(n, d.estate); const nm = estateName(d.estate);
  if (grant) {
    const err = grantPrivilege(s, n, d.privilege);
    if (!err) e.contentment = clamp(e.contentment + 5, 0, 100);
    if (notable(s, n)) chronicle(s, n.id, 'estates', T(`In ${n.short.en} the ${nm.en} won a privilege from the crown.`, `In ${n.short.de} errangen die ${nm.de} ein Privileg von der Krone.`));
    return null;
  }
  e.contentment = clamp(e.contentment - 15, 0, 100);
  n.flags[`snub_${d.estate}`] = s.day + 730;
  if (e.influence > 50) {
    n.modifiers = n.modifiers.filter((m) => m.id !== `obstruct_${d.estate}`);
    n.modifiers.push({ id: `obstruct_${d.estate}`, until: s.day + 365, label: T(`The ${nm.en} obstruct the crown`, `Die ${nm.de} behindern die Krone`), effects: { authority_gain: -0.2, tax: -0.05 } });
    if (isHuman(s, n.id)) notice(s, n.id, 'estate_demand', T(`Refused, the ${nm.en} obstruct the crown for a year.`, `Abgewiesen behindern die ${nm.de} die Krone ein Jahr lang.`));
  }
  return null;
}

// ---------------------------------------------------------------- the assembly
export type AssemblyAsk = { kind: 'tax'; level: number; rates?: number[] } | { kind: 'war'; target: number; goal: WarGoal['type'] };
/** The tax level the assembly weighs: the mean rate over all classes. */
export const taxLevel = (rates: number[]) => rates.reduce((p, x) => p + x, 0) / Math.max(1, rates.length);
/** The rates a request to the assembly would set: one class's rate, or (cls -1) every class moved alike so that the
 *  mean is the rate asked. */
export function askRates(rates: number[], cls: number, rate: number): number[] {
  const out = rates.slice(); const r = clamp(rate, 0, 0.5);
  if (cls >= 0 && cls < out.length) out[cls] = r;
  else if (cls === -1) { const d = r - taxLevel(rates); for (let i = 0; i < out.length; i++) out[i] = +clamp(out[i] + d, 0, 0.5).toFixed(4); }
  return out;
}
/** The highest tax level the assembly has granted (new realms: 10 %, or what they already levy). */
export const taxCeiling = (n: Nation) => n.flags.tax_grant ?? Math.max(0.1, taxLevel(n.taxRate));
export const needsTaxVote = (n: Nation, level: number) => lawEffect(n, 'tax_vote') > 0 && level > taxCeiling(n) + 1e-6;
const NO_VOTE_GOALS = ['independence', 'civil_war', 'coalition', 'rebels'];
export const needsWarVote = (s: GameState, n: Nation, target: number, goal: string) => lawEffect(n, 'war_vote') > 0 && !NO_VOTE_GOALS.includes(goal) && !((n.flags[`war_ok_${target}`] ?? 0) > s.day);
/** Gold it takes to buy one Power's vote. */
export const bribeCost = (n: Nation) => Math.round(Math.max(25, (n.income.tax || 10) * 2));
/** The privilege a Power would take as the price of its vote (the first it lacks). */
export const concessionFor = (n: Nation, eid: string) => PRIVILEGES.find((p) => p.estate === eid && !estate(n, eid).privileges.includes(p.id))?.id;
/** Why a Power votes for or against what is asked of the assembly. */
export function assemblyStance(s: GameState, n: Nation, eid: string, ask: AssemblyAsk, bribe: string[] = [], concede?: string): Row[] {
  const e = estate(n, eid); const rows: Row[] = [['x_asm_base', 10], ['x_asm_content', Math.round((e.contentment - 50) * 0.5)]];
  if (ask.kind === 'tax') {
    const rates = ask.rates ?? n.taxRate.map(() => ask.level);
    const cls = ESTATE_CLASSES[eid] ?? []; const own = cls.length ? cls.reduce((p, c) => p + (rates[c] ?? 0), 0) / cls.length : ask.level;
    rows.push(['x_asm_burden', -Math.round(Math.max(0, own - 0.06) * 200)]);
    const inc = Object.values(n.income).reduce((p, v) => p + v, 0), exp = Object.values(n.expense).reduce((p, v) => p + v, 0);
    if (exp > inc || n.treasury < 0) rows.push(['x_asm_need', 10]);
    if (s.wars.some((x) => x.def.includes(n.id))) rows.push(['x_asm_war_need', 15]);
  } else {
    const t = s.nations[ask.target];
    rows.push(['x_asm_cause', hasCasusBelli(s, n.id, ask.target) ? 10 : -30]);
    if (ask.goal === 'faith' || (ask.goal === 'reconquest' && t && t.faith !== n.faith)) rows.push(['x_asm_holy', eid === 'prelates' ? 25 : 5]);
    if (ask.goal === 'trade' && eid === 'burghers') rows.push(['x_asm_trade', 20]);
    if ((ask.goal === 'conquest' || ask.goal === 'reconquest' || ask.goal === 'subjugate') && eid === 'magnates') rows.push(['x_asm_land', 15]);
    if (eid === 'commons') rows.push(['x_asm_levies', -8]);
    if (n.warExhaustion > 0) rows.push(['x_asm_weariness', -Math.round(n.warExhaustion * 0.6)]);
    if (t) rows.push(['x_asm_odds', Math.round(clamp((nationDev(s, n.id) / Math.max(1, nationDev(s, t.id)) - 1) * 15, -25, 15))]);
    if (t && n.rivals.includes(t.id)) rows.push(['r_rival', 15]);
    if (n.treasury < 0 || n.loans.length >= 3) rows.push(['x_asm_debt', -15]);
  }
  if (bribe.includes(eid)) rows.push(['x_asm_bribe', 25]);
  if (concede && PRIVILEGES.find((p) => p.id === concede)?.estate === eid) rows.push(['x_asm_concession', 40]);
  if ((n.flags[`snub_${eid}`] ?? 0) > s.day) rows.push(['x_asm_snubbed', -20]);
  return rows;
}
export interface AssemblyResult { passes: boolean; yes: number; no: number; cost: number; estates: { id: string; name: I18n; influence: number; yes: boolean; sum: number; rows: Row[]; concession?: string }[] }
/** How the assembly would vote: each Power votes by its stance, weighed by its influence; a majority of the
 *  influence decides. */
export function assemblyVote(s: GameState, n: Nation, ask: AssemblyAsk, bribe: string[] = [], concede?: string): AssemblyResult {
  let yes = 0, no = 0;
  const estates = n.estates.map((e) => {
    const rows = assemblyStance(s, n, e.id, ask, bribe, concede); const sum = sumRows(rows); const y = sum > 0;
    if (y) yes += e.influence; else no += e.influence;
    return { id: e.id, name: estateName(e.id), influence: e.influence, yes: y, sum, rows, concession: concessionFor(n, e.id) };
  });
  const bribes = n.estates.filter((e) => bribe.includes(e.id)).length;
  return { passes: yes > no, yes, no, cost: bribes * bribeCost(n), estates };
}
/** Put a question to the assembly, paying the bribes and granting the concession offered. On a yes, a tax level is
 *  granted (with a little room) or the war is approved for 90 days. */
export function holdAssembly(s: GameState, n: Nation, ask: AssemblyAsk, bribe: string[] = [], concede?: string): string | null {
  bribe = [...new Set(bribe)].filter((b) => n.estates.some((e) => e.id === b));
  if (concede && !PRIVILEGES.some((p) => p.id === concede && !estate(n, p.estate).privileges.includes(p.id))) return 'unknown privilege';
  const r = assemblyVote(s, n, ask, bribe, concede);
  if (n.treasury < r.cost) return 'not enough gold';
  if (r.cost) addExpense(n, 'gifts', r.cost);
  if (!r.passes) return ask.kind === 'tax' ? 'the assembly refused the new taxes' : 'the assembly refused to fund the war';
  if (concede) grantPrivilege(s, n, concede);
  if (ask.kind === 'tax') n.flags.tax_grant = +(ask.level + 0.02).toFixed(4);
  else n.flags[`war_ok_${ask.target}`] = s.day + 90;
  if (isHuman(s, n.id)) notice(s, n.id, 'assembly', ask.kind === 'tax'
    ? T(`The assembly granted taxes up to ${Math.round(n.flags.tax_grant * 100)} % on average.`, `Die Versammlung bewilligte Steuern bis durchschnittlich ${Math.round(n.flags.tax_grant * 100)} %.`)
    : T(`The assembly approved the war against ${s.nations[ask.target]?.short.en}.`, `Die Versammlung billigte den Krieg gegen ${s.nations[ask.target]?.short.de}.`));
  return null;
}
/** The AI buys the votes it lacks when it can afford them: the cheapest Powers whose vote is closest to a yes. */
function aiBribes(s: GameState, n: Nation, ask: AssemblyAsk): string[] | null {
  const r = assemblyVote(s, n, ask);
  if (r.passes) return [];
  const cost = bribeCost(n); const bribe: string[] = [];
  for (const e of [...r.estates].filter((x) => !x.yes && x.sum > -25).sort((a, b) => b.influence - a.influence)) {
    if (n.treasury < cost * (bribe.length + 1) * 3) break;
    bribe.push(e.id);
    if (assemblyVote(s, n, ask, bribe).passes) return bribe;
  }
  return null;
}
/** Whether the assembly would refuse a war, without holding it (the AI weighs its targets with it): the player's
 *  assembly by its vote, an AI's by whether it can buy the missing votes. */
export function assemblyWarRefusal(s: GameState, A: Nation, b: number, goal: WarGoal['type']): string | null {
  if (!needsWarVote(s, A, b, goal)) return null;
  const ask: AssemblyAsk = { kind: 'war', target: b, goal };
  if (isHuman(s, A.id)) return assemblyVote(s, A, ask).passes ? null : 'the assembly refused to fund the war';
  return aiBribes(s, A, ask) ? null : 'the assembly refused to fund the war';
}
/** Before a war is declared (systems/empire.ts warVeto): an assembly that must approve wars votes on it. The AI buys
 *  missing votes when rich; the player is refused and may ask again with bribes or a concession. */
export function assemblyWarVeto(s: GameState, _w: World, A: Nation, b: number, goal: WarGoal['type']): string | null {
  if (!needsWarVote(s, A, b, goal)) return null;
  const ask: AssemblyAsk = { kind: 'war', target: b, goal };
  if (isHuman(s, A.id)) return assemblyVote(s, A, ask).passes ? null : 'the assembly refused to fund the war';
  const bribe = aiBribes(s, A, ask);
  if (!bribe) return 'the assembly refused to fund the war';
  if (bribe.length) holdAssembly(s, A, ask, bribe);
  return null;
}
/** The tax command of the player: rates above the granted level need the assembly. */
export function setTaxRate(s: GameState, n: Nation, cls: number, rate: number): string | null {
  const rates = n.taxRate.slice(); rates[cls] = clamp(rate, 0, 0.5);
  const level = taxLevel(rates);
  if (needsTaxVote(n, level)) {
    const e = holdAssembly(s, n, { kind: 'tax', level, rates }); if (e) return e;
  }
  n.taxRate = rates;
  return null;
}
/** An AI realm that raised taxes beyond the granted level asks the assembly; refused, it lowers them again. */
function aiTaxMonth(s: GameState, n: Nation) {
  const level = taxLevel(n.taxRate);
  if (n.flags.tax_grant === undefined) n.flags.tax_grant = +Math.max(0.1, level).toFixed(4);
  if (!needsTaxVote(n, level)) return;
  const ask: AssemblyAsk = { kind: 'tax', level, rates: n.taxRate };
  if (!((n.flags.tax_refused ?? 0) > s.day)) {
    const bribe = aiBribes(s, n, ask);
    if (bribe && !holdAssembly(s, n, ask, bribe)) return;
    n.flags.tax_refused = s.day + 365;
  }
  const k = taxCeiling(n) / level;
  n.taxRate = n.taxRate.map((t) => +(t * k).toFixed(4));
}

// ---------------------------------------------------------------- how each form chooses its head
export type Process = 'heredity' | 'elective' | 'republic' | 'clergy' | 'acclaim';
export function govProcess(n: Nation): Process {
  if (n.gov === 'merchant_republic' || n.gov === 'city_republic') return 'republic';
  if (n.gov === 'theocracy' || n.gov === 'military_order') return 'clergy';
  if (n.gov === 'nomadic_horde' || n.gov === 'tribal_federation') return 'acclaim';
  if ((n.laws.succession ?? 0) === 2) return 'elective';
  return 'heredity';
}
/** Years between elections in a republic, and how many terms one head may serve. */
export const termYears = (n: Nation) => (n.gov === 'city_republic' ? 6 : 4);
export const TERM_LIMIT = 2;
/** The party each candidate stands for, by form ('crown': the ruling house, 'incumbent': the sitting head). */
const SLOTS: Record<Process, string[]> = {
  heredity: [], elective: ['crown', 'magnates', 'prelates'], republic: ['incumbent', 'burghers', 'magnates', 'commons'],
  clergy: ['prelates', 'prelates', 'magnates'], acclaim: ['crown', 'crown', 'magnates'],
};
/** Who chooses, and how much each Power's influence counts in the choice. */
const ELECTORS: Record<Process, Record<string, number>> = {
  heredity: {}, elective: { magnates: 2, prelates: 1.5, burghers: 0.5, commons: 0 }, republic: { burghers: 2, magnates: 1, prelates: 0.5, commons: 0.5 },
  clergy: { prelates: 3, magnates: 1, burghers: 0.3, commons: 0.3 }, acclaim: { magnates: 2, commons: 1, prelates: 0.3, burghers: 0.3 },
};
export const partiesOf = (n: Nation) => SLOTS[govProcess(n)];
function validCand(s: GameState, n: Nation, id: number, minAge = 25) {
  const c = s.chars[id]; if (!c || !c.alive || c.nation !== n.id || id === n.ruler) return false;
  const a = ageOf(s, c); return a >= minAge && a <= 75;
}
function houseName(s: GameState, w: World, n: Nation): string {
  const own: number[] = []; for (let l = 0; l < s.loc.owner.length && own.length < 40; l++) if (s.loc.owner[l] === n.id) own.push(l);
  const l = own.length ? own[Math.floor(rand(s.rng) * own.length)] : n.capital;
  return w.names[l] ?? n.dynasty;
}
/** Fill the candidate list of a realm whose head is chosen (vacant places get a new candidate from the court). */
export function ensureCandidates(s: GameState, w: World, n: Nation): number[] {
  const proc = govProcess(n); const slots = SLOTS[proc];
  const cur = n.electCands ?? [];
  const out: number[] = [];
  for (let i = 0; i < slots.length; i++) {
    const p = slots[i]; let id = cur[i] ?? 0;
    if (p === 'incumbent') { out.push((n.flags.term ?? 1) < TERM_LIMIT && s.chars[n.ruler]?.alive ? n.ruler : 0); continue; }
    if (id && validCand(s, n, id) && !out.includes(id)) { out.push(id); continue; }
    if (p === 'crown' && i === 0 && n.heir && validCand(s, n, n.heir, 16) && !out.includes(n.heir)) { out.push(n.heir); continue; }
    const kin = p === 'crown';
    const c = newChar(s, n, {
      born: s.day - Math.floor((30 + rand(s.rng) * 25) * 365), female: proc === 'clergy' || proc === 'acclaim' ? false : chance(s.rng, 0.1),
      role: proc === 'clergy' ? 'clergy' : 'courtier', dynasty: kin ? n.dynasty : houseName(s, w, n),
      skills: [Math.floor(rand(s.rng) * 6), Math.floor(rand(s.rng) * 6), Math.floor(rand(s.rng) * 6)] as [number, number, number],
    });
    out.push(c.id);
  }
  n.electCands = out;
  if (n.backed && !out.includes(n.backed)) n.backed = undefined;
  return out;
}
/** Why a Power favours a candidate. */
export function candidateStance(s: GameState, n: Nation, cid: number, party: string, eid: string): Row[] {
  const c = s.chars[cid]; if (!c) return [];
  const proc = govProcess(n);
  const rows: Row[] = [[proc === 'acclaim' ? 'x_gov_prowess' : 'x_gov_ability', proc === 'acclaim' ? c.skills[2] * 6 : (c.skills[0] + c.skills[1] + c.skills[2]) * 3]];
  if (party === eid) rows.push(['x_gov_own_party', 25]);
  if (party === 'crown' && cid === n.heir) rows.push(['x_gov_continuity', eid === 'prelates' ? 15 : 8]);
  if (party === 'incumbent') rows.push(['x_gov_incumbent', 8]);
  if (party === 'crown' && eid === 'magnates' && proc === 'elective') rows.push(['x_gov_strong_crown', -10]);
  if (ageOf(s, c) > 65) rows.push(['x_gov_old', -10]);
  if (n.backed === cid) rows.push(['x_gov_backed', 30]);
  rows.push(['x_el_whim', Math.round(hash01(cid, eid.length, n.id) * 6)]);
  return rows;
}
export interface ElectionView { process: Process; cands: { id: number; party: string; votes: number; by: { estate: string; weight: number; rows: Row[] }[] }[]; total: number; winner: number }
/** How the Powers would choose today: each gives its weight (influence times its say under this form) to the
 *  candidate it favours most. */
export function electionTally(s: GameState, n: Nation): ElectionView {
  const proc = govProcess(n); const slots = SLOTS[proc]; const ids = n.electCands ?? [];
  const cands = ids.map((id, i) => ({ id, party: slots[i] ?? 'crown', votes: 0, by: [] as { estate: string; weight: number; rows: Row[] }[] })).filter((c) => c.id && s.chars[c.id]?.alive);
  let total = 0;
  for (const e of n.estates) {
    const wgt = e.influence * (ELECTORS[proc][e.id] ?? 0); if (wgt <= 0 || !cands.length) continue;
    total += wgt;
    let best = cands[0], bv = -Infinity, brows: Row[] = [];
    for (const c of cands) { const rows = candidateStance(s, n, c.id, c.party, e.id); const v = sumRows(rows); if (v > bv) { bv = v; best = c; brows = rows; } }
    best.votes += wgt; best.by.push({ estate: e.id, weight: wgt, rows: brows });
  }
  let winner = 0, wv = -1; for (const c of cands) if (c.votes > wv) { wv = c.votes; winner = c.id; }
  return { process: proc, cands, total, winner };
}
/** The Powers choose. Returns the chosen character and records the margin the Mandate draws on. */
function choose(s: GameState, w: World, n: Nation): number {
  ensureCandidates(s, w, n);
  const t = electionTally(s, n);
  if (!t.winner) return 0;
  const win = t.cands.find((c) => c.id === t.winner)!;
  n.flags.elect_margin = Math.round(t.total > 0 ? (win.votes / t.total) * 100 : 50);
  n.flags.elected = s.day;
  if (n.flags.elect_margin < 40) n.flags.elect_contested = s.day; else delete n.flags.elect_contested;
  n.backed = undefined;
  n.electCands = (n.electCands ?? []).map((x) => (x === t.winner ? 0 : x));
  return t.winner;
}
/** Called on the ruler's death (politics.ts succession): the Powers choose the successor under every form but the
 *  hereditary one. 0 leaves it to the law of succession. */
export function govSuccessor(s: GameState, w: World, n: Nation): number {
  const proc = govProcess(n);
  if (proc === 'heredity') return 0;
  const id = choose(s, w, n);
  if (!id) return 0;
  if (proc === 'republic') { n.flags.term = 1; n.flags.next_election = s.day + termYears(n) * 365; }
  for (const off in n.council) if (n.council[off] === id) delete n.council[off];
  const nm = s.chars[id]?.name ?? '?';
  if (isHuman(s, n.id)) notice(s, n.id, 'election', T(`The ${proc === 'clergy' ? 'prelates' : 'Powers of the Realm'} chose ${nm} (${n.flags.elect_margin} % of the votes).`, `Die ${proc === 'clergy' ? 'Prälaten' : 'Mächte des Reiches'} wählten ${nm} (${n.flags.elect_margin} % der Stimmen).`));
  return id;
}
/** A republic's election at the end of a term: the head may be confirmed (up to the term limit) or replaced. */
function termElection(s: GameState, w: World, n: Nation) {
  const old = n.ruler; const oc = s.chars[old];
  const id = choose(s, w, n);
  n.flags.next_election = s.day + termYears(n) * 365;
  if (!id) return;
  if (id === old) { n.flags.term = (n.flags.term ?? 1) + 1; if (notable(s, n)) chronicle(s, n.id, 'election', T(`${oc?.name} was confirmed as head of ${n.short.en} (${n.flags.elect_margin} %).`, `${oc?.name} wurde als Haupt von ${n.short.de} bestätigt (${n.flags.elect_margin} %).`)); return; }
  if (oc) oc.role = 'courtier';
  const c = s.chars[id]; c.role = 'ruler';
  n.ruler = id; n.flags.term = 1; n.flags.ruler_changed = s.day; n.regent = 0;
  for (const off in n.council) if (n.council[off] === id) delete n.council[off];
  if (n.heir === id) n.heir = 0;
  pickNewHeir(s, n);
  n.mandate = clamp(n.mandate * 0.5 + 25 + c.skills[1] * 4, 0, 100);
  if (notable(s, n)) chronicle(s, n.id, 'election', T(`${c.name} was elected head of ${n.short.en} (${n.flags.elect_margin} % of the votes), succeeding ${oc?.name ?? '?'}.`, `${c.name} wurde zum Haupt von ${n.short.de} gewählt (${n.flags.elect_margin} % der Stimmen) und folgt ${oc?.name ?? '?'}.`));
  if (isHuman(s, n.id)) notice(s, n.id, 'election', T(`${c.name} has been elected to lead the republic.`, `${c.name} wurde zum Haupt der Republik gewählt.`), { loc: n.capital });
}
/** Back a candidate for the next choice of the realm's head (costs 25 Authority): every Power weighs it. */
export function backCandidate(s: GameState, w: World, n: Nation, cid: number): string | null {
  if (govProcess(n) === 'heredity') return 'the crown passes by inheritance';
  const ids = ensureCandidates(s, w, n);
  if (!ids.includes(cid)) return 'not a candidate';
  if (n.backed === cid) return 'already backed';
  if (n.authority < 25) return 'not enough Authority';
  n.authority -= 25; n.backed = cid;
  return null;
}
/** Where the Mandate of the head comes from under each form (added to politics.ts mandateParts and its breakdown). */
export function govMandateParts(s: GameState, n: Nation): Row[] {
  const proc = govProcess(n);
  const yrs = (d: number | undefined) => (d === undefined ? 99 : (s.day - d) / 365);
  if (proc === 'heredity') return [n.heir && s.chars[n.heir]?.alive ? ['x_mand_heir', 5] : ['x_mand_no_heir', -8]];
  if (proc === 'elective' || proc === 'republic' || proc === 'clergy') {
    const rows: Row[] = [];
    const m = n.flags.elect_margin;
    if (m !== undefined) rows.push(['x_mand_election', Math.round((m - 50) * 0.3 * Math.max(0, 1 - yrs(n.flags.elected) / 20))]);
    if (proc === 'republic') { const ne = n.flags.next_election; const f = ne === undefined ? 0.5 : clamp(1 - (ne - s.day) / (termYears(n) * 365), 0, 1); rows.push(['x_mand_term', Math.round(8 * (1 - 2 * f))]); }
    if (proc === 'clergy') rows.push(['x_mand_piety', Math.round((estate(n, 'prelates').contentment - 50) * 0.3)]);
    return rows;
  }
  // acclaim: the khan or chief must lead his warriors
  const atWarNow = s.wars.some((x) => x.att.includes(n.id) || x.def.includes(n.id));
  if (atWarNow) return [['x_mand_glory', 8]];
  return [['x_mand_idle', -Math.round(clamp(yrs(n.flags.gov_war ?? 0) - 10, 0, 10))]];
}

// ---------------------------------------------------------------- the system
function governmentMonth(s: GameState, w: World) {
  for (const n of s.nations) {
    if (!n.alive) continue;
    if (s.wars.some((x) => x.att.includes(n.id) || x.def.includes(n.id))) n.flags.gov_war = s.day;
    demandMonth(s, n);
    const human = isHuman(s, n.id);
    if (!human) aiTaxMonth(s, n);
    else if (n.flags.tax_grant === undefined) n.flags.tax_grant = +Math.max(0.1, taxLevel(n.taxRate)).toFixed(4);
    const proc = govProcess(n);
    if (proc === 'republic') {
      if (n.flags.next_election === undefined) n.flags.next_election = s.day + Math.floor((0.25 + hash01(n.id, 77) * 0.75) * termYears(n) * 365);
      if (human && s.day + 60 >= n.flags.next_election && !(n.flags.election_warned >= n.flags.next_election)) {
        n.flags.election_warned = n.flags.next_election;
        notice(s, n.id, 'election', T('Elections are due within two months: back a candidate in the government panel.', 'In zwei Monaten wird gewählt: Unterstützt einen Kandidaten in der Regierungsansicht.'));
      }
      if (s.day >= n.flags.next_election) termElection(s, w, n);
    }
    if (human && proc !== 'heredity') ensureCandidates(s, w, n);
  }
}

export const government: System = {
  id: 'government',
  monthly({ s, w }) { governmentMonth(s, w); },
};
