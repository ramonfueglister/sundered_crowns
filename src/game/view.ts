// Worker-side: builds compact views of the game state for the UI and answers queries.
import type { GameState, Nation, I18n, PeaceTerm } from '../sim/types';
import type { World } from '../sim/world';
import type { NationLite, ArmyLite, PlayerView, TickView, MapMode, Legend, Query, LandmarkLite, TradeFlowLite, TradeHubLite } from './protocol';
import { landmarksOf, landmarkDef, landmarkPrice } from '../sim/systems/landmarks';
import { LANDMARK_MONTHS } from '../sim/content/landmarks';
import { C, CL, CLASSES, CLASS_NAME, B, BI, BUILDINGS, GOODS, G, GI, RECIPES, TERRAINS, UNITS } from '../sim/defs';
import { armyMen, findPath, travelDays, unitCost, availableUnits, mercenaryCostParts } from '../sim/systems/military';
import { nationDev, computeScore, scoreParts, casusBelliAll, evaluatePeace, termCost } from '../sim/systems/war';
import { opinionBreakdown, evaluateProposal, trust, DIPLO_ACTIONS, libertyParts, libertyTarget, diploSkill } from '../sim/systems/diplomacy';
import { ageOf, ESTATES, PRIVILEGES, OFFICES, OFFICE_COST, reformCost, councilBonus, officeCandidates, officeBonusOf, lawEffect, traditionOf, classExempt } from '../sim/systems/politics';
import { adminInfo, budgetForecast, methodBlock, methodCost, integrationShare } from '../sim/systems/administration';
import { DUTIES, dutyRate, dutyUnrest, dutyDiscontent, dutyEstates } from '../sim/systems/duties';
import { LAWS, VALUES } from '../sim/content/laws';
import { FAITHS, ALL_CULTURES, cultureLabel as cultureName, GROUP_OF, faithFamily } from '../sim/content/peoples';
import { BRANCHES, ERAS, techCost, techBase, researchRate, doctrineCost, doctrineSlots, RESEARCH_OFFICE } from '../sim/systems/progress';
import { DOCTRINES } from '../sim/content/doctrines';
import { INNOVATIONS } from '../sim/content/innovations';
import { decisionsFor, eventDef, interpolate } from '../sim/systems/events';
import { LOC_ECON, CROWN_SHARE, effectiveTax, integrationYield, overextension, tariffMax, loanRate } from '../sim/systems/economy';
import { goalsFor, goalConditions } from '../sim/systems/goals';
import { goalPlace } from '../sim/content/goals';
import { eventOptionFxCached } from './eventfx';
import { tradeMapColors, marketDetail, marketList, goodDetail, tradePolicy, tradeRelation, expeditionView, companiesView } from './tradeview';
import { worksView, scopeView, gainDetail, placesOf } from './worksview';
import { nationStats } from '../sim/systems/realm';
import { allies, hasTreaty, treatiesOf, atWar, subjectsOf } from '../sim/ctx';
import { buildCost, merchantCap } from '../sim/commands';
import { agentSlots, overextControl, integrationControl } from '../sim/systems/society';
import { colonySlots, canColonize, colonyCost, colonyProgress } from '../sim/systems/colonial';
import { METHODS } from '../sim/defs';
import { ownFaith } from '../sim/systems/faith';
import { SITUATIONS } from '../sim/content/situations';
import { declareView, armyView, battleView, battleList, warView, locWar, armySupplyColors } from './warview';
import { influenceFactors, influenceTargets, resentment, INFLUENCE_DRIFT, govMandateParts } from '../sim/systems/government';
import { realmAnswer } from './realmview';
import { aiLogText, aiLogSecret } from '../sim/systems/ai_log';
import { dynastyView } from '../sim/systems/dynasty';
import { availableCommanders, commanderSkill, commanderMorale, commanderParts, commandOf, generalCost } from '../sim/systems/commanders';
import { victoryView, historyView } from './endview';
import { EVENTS } from '../sim/content/events';

const sumObj = (o: Record<string, number>) => Object.values(o).reduce((p, v) => p + v, 0);

export function nationLites(s: GameState, w: World): NationLite[] {
  const locs = new Int32Array(s.nations.length);
  for (let i = 0; i < w.L; i++) { const o = s.loc.owner[i]; if (o >= 0) locs[o]++; }
  return s.nations.map((n) => ({
    id: n.id, key: n.key, alive: n.alive, name: n.name, short: n.short, adj: n.adj, color: n.color, capital: n.capital, rank: n.rank, gov: n.gov,
    score: n.score, overlord: n.overlord, faith: n.faith, culture: n.culture, coa: n.coa, ruler: s.chars[n.ruler]?.name ?? '—', difficulty: n.difficulty,
    summary: n.summary, dev: nationDev(s, n.id), locs: locs[n.id], personality: n.personality, player: s.playerNations.includes(n.id),
  }));
}

export function armyLites(s: GameState, w: World): ArmyLite[] {
  return s.armies.map((a) => ({
    id: a.id, owner: a.owner, loc: a.loc, x: w.x[a.loc], y: w.y[a.loc], men: armyMen(a), fleet: a.fleet, morale: a.morale, path: a.path.slice(0, 60),
    siege: a.siege, battle: a.battle, rebels: !!a.rebels, name: a.name, general: s.chars[a.general]?.name ?? '', embarked: !!a.embarkedOn, mercenary: !!a.mercenary,
    prog: a.path.length ? Math.min(1, a.progress / Math.max(1, w.distKm(a.loc, a.path[0]))) : 0,
  }));
}

export function playerView(s: GameState, n: Nation): PlayerView {
  const r = s.chars[n.ruler], h = s.chars[n.heir];
  return {
    id: n.id, treasury: n.treasury, income: sumObj(n.income), expense: sumObj(n.expense), manpower: n.manpower, maxManpower: n.maxManpower, sailors: n.sailors,
    concord: n.concord, mandate: n.mandate, authority: n.authority, prestige: n.prestige, warExhaustion: n.warExhaustion, inflation: n.inflation, corruption: n.corruption,
    dread: n.dread, envoys: n.envoys, envoysBusy: n.envoysBusy, insight: n.flags.doctrine_pts || 0, tech: [...n.tech], techProgress: [...n.techProgress], era: n.era,
    incomeBreak: { ...n.income }, expenseBreak: { ...n.expense }, ruler: r ? r.name : '—', rulerAge: r ? Math.floor(ageOf(s, r)) : 0,
    heir: h && h.alive ? h.name : '—', atWar: s.wars.some((x) => x.att.includes(n.id) || x.def.includes(n.id)), taxRate: [...n.taxRate],
    armyMaint: n.armyMaint, navyMaint: n.navyMaint, tariff: n.tariff, coinage: n.coinage, loans: n.loans.reduce((p, l) => p + l.amount, 0), debt: n.debt, stats: { ...n.stats },
    homeMarket: n.capital >= 0 ? s.loc.market[n.capital] ?? -1 : -1,
    merchants: { used: s.markets.reduce((p, m) => p + (m.merchants[n.id] || 0), 0), cap: merchantCap(n) },
    electionCloses: s.empire.election && s.empire.electors.includes(n.id) && s.empire.election.votes[n.id] === undefined ? s.empire.election.closes : 0,
    asks: (s.powers?.offers ?? []).filter((o) => o.to === n.id).length + s.leagues.reduce((p, l) => p + (l.calls ?? []).filter((c) => c.to === n.id).length, 0),
  };
}

export function warsView(s: GameState): TickView['wars'] {
  return s.wars.map((x) => ({ id: x.id, name: x.name, att: x.att, def: x.def, attLead: x.attLead, defLead: x.defLead, score: computeScore(s, x), parts: scoreParts(s, x),
    offers: x.offers.map((o, idx) => ({ from: o.from, to: o.to, terms: o.terms, concede: o.concede, idx })) }));
}

export function pendingView(s: GameState, w: World, player: number): TickView['pending'] {
  return s.pending.filter((p) => p.nation === player).map((p) => {
    const n = s.nations[player];
    if (p.event.startsWith('diplo_')) {
      const from = s.nations[p.ctx.from]; const act = p.event.slice(6);
      return { ...p, title: { en: 'A proposal', de: 'Ein Vorschlag' }, text: { en: `${from?.short.en} proposes: ${ACT_NAME[act]?.en ?? act}.`, de: `${from?.short.de} schlägt vor: ${ACT_NAME[act]?.de ?? act}.` },
        options: [{ label: { en: 'Accept', de: 'Annehmen' }, hint: proposalHint(act, from?.short ?? { en: '?', de: '?' }, n) }, { label: { en: 'Decline', de: 'Ablehnen' }, hint: { en: `${from?.short.en}'s opinion of us falls by 10 for a year.`, de: `Die Meinung von ${from?.short.de} über uns sinkt für ein Jahr um 10.` } }], art: 'court' };
    }
    const d = eventDef(p.event);
    if (!d) return { ...p, title: { en: p.event, de: p.event }, text: { en: '', de: '' }, options: [{ label: { en: 'OK', de: 'OK' } }] };
    return { ...p, title: interpolate(s, w, n, p.ctx, d.title), text: interpolate(s, w, n, p.ctx, d.text), options: d.options.map((o) => ({ label: interpolate(s, w, n, p.ctx, o.label), hint: o.hint })), art: d.art };
  });
}

/** What accepting a proposal does (systems/diplomacy.ts acceptProposal), for the hint on the answer. */
function proposalHint(act: string, from: I18n, n: Nation): I18n {
  switch (act) {
    case 'alliance': return { en: `An alliance with ${from.en}: when one of us goes to war, the other is asked to join.`, de: `Ein Bündnis mit ${from.de}: zieht einer von uns in den Krieg, wird der andere zur Hilfe gerufen.` };
    case 'marriage': return { en: `A royal marriage for 40 years: +15 opinion both ways for 20 years.`, de: `Eine königliche Heirat für 40 Jahre: +15 Meinung in beide Richtungen für 20 Jahre.` };
    case 'access': return { en: `${from.en}'s armies may march through our land for 10 years.`, de: `Die Heere von ${from.de} dürfen 10 Jahre lang durch unser Land ziehen.` };
    case 'trade': return { en: `A trade agreement with ${from.en} for 15 years: tariffs between us halved, a quarter more goods between our markets, our merchants weigh more in each other's markets.`, de: `Ein Handelsabkommen mit ${from.de} für 15 Jahre: Zölle zwischen uns halbiert, ein Viertel mehr Waren zwischen unseren Märkten, unsere Kaufleute wiegen in den Märkten des anderen mehr.` };
    case 'vassalize': return { en: `We become the vassal of ${from.en} and can no longer declare wars of our own.`, de: `Wir werden Vasall von ${from.de} und können keine eigenen Kriege mehr erklären.` };
    case 'demand': { const amt = Math.round(Math.max(20, (n.income.tax || 10) * 3)); return { en: `We pay ${amt} marks (three months of taxes).`, de: `Wir zahlen ${amt} Mark (drei Monatssteuern).` }; }
  }
  return { en: '', de: '' };
}

export const ACT_NAME: Record<string, I18n> = {
  alliance: { en: 'Alliance', de: 'Bündnis' }, marriage: { en: 'Royal marriage', de: 'Königliche Heirat' }, guarantee: { en: 'Guarantee independence', de: 'Unabhängigkeit garantieren' },
  access: { en: 'Military access', de: 'Durchmarschrecht' }, trade: { en: 'Trade agreement', de: 'Handelsabkommen' }, vassalize: { en: 'Offer vassalage', de: 'Vasallität anbieten' },
  gift: { en: 'Send a gift', de: 'Geschenk senden' }, insult: { en: 'Insult', de: 'Beleidigen' }, demand: { en: 'Demand tribute', de: 'Tribut fordern' }, break_alliance: { en: 'Break alliance', de: 'Bündnis lösen' },
  fabricate: { en: 'Fabricate a claim', de: 'Anspruch fabrizieren' }, rival: { en: 'Declare rival', de: 'Zum Rivalen erklären' }, unrival: { en: 'End rivalry', de: 'Rivalität beenden' },
  cancel_access: { en: 'Cancel access', de: 'Durchmarsch kündigen' }, improve: { en: 'Improve relations', de: 'Beziehungen verbessern' },
  excommunicate: { en: 'Ask the Curia to excommunicate', de: 'Bei der Kurie den Bann erwirken' },
  embargo: { en: 'Embargo', de: 'Handelssperre' }, lift_embargo: { en: 'Lift embargo', de: 'Handelssperre aufheben' },
};

export function landmarksView(s: GameState, w: World): LandmarkLite[] {
  return landmarksOf(s, w).map((x) => { const d = landmarkDef(x.id); return { id: x.id, loc: x.loc, name: d.name, kind: d.kind, tier: x.tier, max: d.max, holder: x.holder, work: x.work }; });
}
function landmarkDetail(s: GameState, w: World, l: number, player: number) {
  const x = landmarksOf(s, w).find((q) => q.loc === l); if (!x) return null;
  const d = landmarkDef(x.id); const n = s.nations[player];
  const fx = (tier: number) => Object.fromEntries(Object.entries(d.fx).map(([k, v]) => [k, v * tier]));
  return { id: x.id, name: d.name, desc: d.desc, kind: d.kind, tier: x.tier, max: d.max, work: x.work, prestige: d.prestige * x.tier, fx: fx(x.tier), next: x.tier < d.max ? fx(x.tier + 1) : null,
    cost: n && x.tier < d.max ? landmarkPrice(s, n, x.id, x.tier) : 0, months: LANDMARK_MONTHS };
}

// ---------------- map modes ----------------
function hexToRgb(h: string): [number, number, number] { const v = parseInt(h.replace('#', ''), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
function hashColor(k: number): [number, number, number] {
  let x = (k * 2654435761) >>> 0; const h = (x % 360) / 360; x = (x * 1103515245 + 12345) >>> 0;
  const sat = 0.45 + (x % 100) / 400, l = 0.5;
  const f = (n: number) => { const k2 = (n + h * 12) % 12; const a = sat * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k2 - 3, 9 - k2, 1)))); };
  return [f(0), f(8), f(4)];
}
function ramp(t: number, stops: [number, number, number][]): [number, number, number] {
  t = Math.max(0, Math.min(1, t)) * (stops.length - 1); const i = Math.min(stops.length - 2, Math.floor(t)), f = t - i;
  const a = stops[i], b = stops[i + 1]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f].map(Math.round) as any;
}
const HEAT_N: [number, number, number][] = [[40, 60, 120], [60, 140, 160], [120, 190, 100], [240, 210, 80], [220, 80, 50]];
const GOOD_N: [number, number, number][] = [[200, 60, 50], [230, 190, 70], [70, 170, 80]];
// colour-blind palette (settings): no red against green; a viridis-like ramp and a blue/orange scale (polish pass)
const HEAT_CVD: [number, number, number][] = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
const GOOD_CVD: [number, number, number][] = [[213, 94, 0], [240, 228, 66], [0, 114, 178]];
export type MapPalette = 'normal' | 'cvd';
const hex = (c: [number, number, number]) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
/** Diplomatic map colours: self, subjects, allies, enemies, rivals, truce, overlord, others. */
const DIPLO_N = { self: [60, 170, 70], sub: [120, 200, 120], ally: [70, 120, 210], enemy: [210, 50, 40], rival: [230, 140, 40], truce: [150, 150, 150], lord: [160, 120, 200], other: [205, 195, 175] } as const;
const DIPLO_CVD = { self: [0, 114, 178], sub: [86, 180, 233], ally: [0, 158, 115], enemy: [213, 94, 0], rival: [240, 228, 66], truce: [150, 150, 150], lord: [204, 121, 167], other: [215, 210, 200] } as const;

/** `viewer`: the realm whose explored map the trade modes respect (-1: everything known). `palette`: colour-blind ramps (settings). */
export function mapModeColors(s: GameState, w: World, mode: MapMode, focus: number, good = -1, viewer = -1, palette: MapPalette = 'normal'): { rgba: Uint8Array; legend: Legend } {
  if (mode === 'prices' || mode === 'production' || mode === 'markets') return tradeMapColors(s, w, mode, mode === 'markets' ? good : good < 0 ? GI.grain : good, viewer);
  const N = w.N, out = new Uint8Array(N * 4);
  const cvd = palette === 'cvd'; const HEAT = cvd ? HEAT_CVD : HEAT_N, GOOD = cvd ? GOOD_CVD : GOOD_N, DI = cvd ? DIPLO_CVD : DIPLO_N;
  const lo = hex(HEAT[0]), hi = hex(HEAT[HEAT.length - 1]), bad = hex(GOOD[0]), goodC = hex(GOOD[GOOD.length - 1]);
  const put = (i: number, c: [number, number, number], a = 255) => { out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = a; };
  const lc = s.loc;
  let legend: Legend = { title: { en: mode, de: mode }, items: [] };
  const pop = (i: number) => { let p = 0; for (let c = 0; c < C; c++) p += lc.pop[i * C + c]; return p; };
  switch (mode) {
    case 'development': for (let i = 0; i < w.L; i++) put(i, ramp(Math.log1p(lc.dev[i]) / Math.log(80), HEAT)); legend = { title: { en: 'Development', de: 'Entwicklung' }, items: [{ color: lo, label: { en: 'low', de: 'niedrig' } }, { color: hi, label: { en: 'high', de: 'hoch' } }] }; break;
    case 'population': for (let i = 0; i < w.L; i++) put(i, ramp(Math.log10(1 + pop(i) / Math.max(1, w.area[i])) / 2.6, HEAT)); legend = { title: { en: 'Population density', de: 'Bevölkerungsdichte' }, items: [{ color: lo, label: { en: 'sparse', de: 'dünn' } }, { color: hi, label: { en: 'dense', de: 'dicht' } }] }; break;
    case 'unrest': for (let i = 0; i < w.L; i++) if (lc.owner[i] >= 0) put(i, ramp(1 - lc.unrest[i] / 40, GOOD)); legend = { title: { en: 'Unrest', de: 'Unruhe' }, items: [{ color: goodC, label: { en: 'calm', de: 'ruhig' } }, { color: bad, label: { en: 'restless', de: 'unruhig' } }] }; break;
    case 'control': for (let i = 0; i < w.L; i++) if (lc.owner[i] >= 0) put(i, ramp(lc.control[i], GOOD)); legend = { title: { en: 'Control', de: 'Kontrolle' }, items: [{ color: bad, label: { en: 'weak', de: 'schwach' } }, { color: goodC, label: { en: 'firm', de: 'fest' } }] }; break;
    case 'culture': { const seen = new Map<number, number>(); for (let i = 0; i < w.L; i++) { const c = lc.culture[i]; put(i, hashColor(c * 7 + 3)); seen.set(c, (seen.get(c) || 0) + 1); }
      legend = { title: { en: 'Culture', de: 'Kultur' }, items: [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([c]) => { const k = hashColor(c * 7 + 3); return { color: `rgb(${k})`, label: cultureName(ALL_CULTURES[c] || 'unknown') }; }) }; break; }
    case 'faith': { const seen = new Set<number>(); for (let i = 0; i < w.L; i++) { const f = lc.faith[i]; put(i, hexToRgb(FAITHS[f]?.color ?? '#888888')); seen.add(f); }
      legend = { title: { en: 'Faith', de: 'Glaube' }, items: [...seen].map((f) => ({ color: FAITHS[f]?.color ?? '#888', label: FAITHS[f]?.name ?? '?' })) }; break; }
    case 'trade': for (let i = 0; i < w.L; i++) { const m = lc.market[i]; const k = hashColor(m * 13 + 1); put(i, k); }
      for (const m of s.markets) put(m.hub, [255, 240, 200]);
      { // the busiest markets (goods passing through last month), in their region's colour
        const through = new Map<number, number>();
        for (const f of s.flows ?? []) { through.set(f.from, (through.get(f.from) ?? 0) + f.value); through.set(f.to, (through.get(f.to) ?? 0) + f.value); }
        legend = { title: { en: 'Trade regions (busiest markets)', de: 'Handelsräume (lebhafteste Märkte)' }, items: s.markets.slice().sort((a, b) => (through.get(b.id) ?? 0) - (through.get(a.id) ?? 0)).slice(0, 10).map((m) => ({ color: `rgb(${hashColor(m.id * 13 + 1).join(',')})`, label: { en: w.names[m.hub] ?? m.name, de: w.namesDe[m.hub] ?? m.name } })) };
      }
      break;
    case 'goods': for (let i = 0; i < w.L; i++) put(i, hexToRgb(GOODS[w.resource[i]].color || '#888888'));
      legend = { title: { en: 'Local goods', de: 'Lokale Güter' }, items: GOODS.filter((g) => g.kind === 'raw').slice(0, 16).map((g) => ({ color: g.color, label: g.name })) }; break;
    case 'diplomatic': {
      const F = s.nations[focus];
      const al = new Set(F ? allies(s, focus) : []), en = new Set<number>(), sub = new Set(F ? subjectsOf(s, focus) : []);
      if (F) for (const war of s.wars) { if (war.att.includes(focus)) war.def.forEach((x) => en.add(x)); else if (war.def.includes(focus)) war.att.forEach((x) => en.add(x)); }
      const truce = new Set(F ? treatiesOf(s, focus, 'truce') : []), riv = new Set(F?.rivals ?? []);
      for (let i = 0; i < w.L; i++) {
        const o = lc.owner[i]; if (o < 0) continue;
        const c = o === focus ? DI.self : sub.has(o) || s.nations[o].overlord === focus ? DI.sub : al.has(o) ? DI.ally : en.has(o) ? DI.enemy : riv.has(o) ? DI.rival : truce.has(o) ? DI.truce : F && F.overlord === o ? DI.lord : DI.other;
        put(i, c as unknown as [number, number, number]);
      }
      const hx = (c: readonly number[]) => hex(c as [number, number, number]);
      legend = { title: { en: 'Diplomacy', de: 'Diplomatie' }, items: [
        { color: hx(DI.self), label: { en: 'Selected realm', de: 'Gewähltes Reich' } }, { color: hx(DI.sub), label: { en: 'Subjects', de: 'Untertanen' } }, { color: hx(DI.ally), label: { en: 'Allies', de: 'Verbündete' } },
        { color: hx(DI.enemy), label: { en: 'At war', de: 'Im Krieg' } }, { color: hx(DI.rival), label: { en: 'Rivals', de: 'Rivalen' } }, { color: hx(DI.truce), label: { en: 'Truce', de: 'Waffenstillstand' } }, { color: hx(DI.lord), label: { en: 'Overlord', de: 'Lehnsherr' } }] };
      break;
    }
    case 'army_supply': legend = armySupplyColors(s, w, focus, put, ramp); break;
    case 'terrain': case 'political': case 'explored': default: break;
  }
  return { rgba: out, legend };
}

// ---------------- queries ----------------
export function answer(s: GameState, w: World, player: number, q: Query): any {
  switch (q.q) {
    case 'loc': return locDetail(s, w, q.loc, player);
    case 'nation': return nationDetail(s, w, q.nation, player);
    case 'realm': return realmDetail(s, w, player);
    case 'ledger': return ledger(s, w, q.kind);
    case 'market': { const m = s.markets[q.market]; if (!m) return null; return { name: m.name, hub: m.hub, owner: m.owner, priceIndex: m.priceIndex, goods: GOODS.map((g, k) => ({ id: g.id, name: g.name, price: m.price[k], supply: m.supply[k], demand: m.demand[k], base: g.base * s.priceLevel, hist: Array.from({ length: 120 }, (_, j) => m.hist[k * 120 + ((m.histPos + j) % 120)]) })), merchants: m.merchants, links: m.links.map((l) => ({ to: s.markets[l.to].name, sea: l.sea })) }; }
    case 'diplo': return evaluateProposal(s, w, player, q.target, q.action);
    case 'tmarket': return marketDetail(s, w, player, q.market);
    case 'tmarkets': return marketList(s, w, player);
    case 'tgood': return goodDetail(s, w, player, q.market, q.good);
    case 'tpolicy': return tradePolicy(s, w, player);
    case 'trel': return tradeRelation(s, w, player, q.target);
    case 'expedition': return expeditionView(s, w, player, q.to, q.fleet);
    case 'companies': return companiesView(s, w, player);
    case 'peace': {
      const war = s.wars.find((x) => x.id === q.war); if (!war) return null;
      const terms = q.terms as any[];
      if (q.concede) { const costs = terms.map((t) => termCost(s, war, t, q.to, player)); return { accept: true, score: 0, reasons: [], cost: costs.reduce((p, x) => p + x, 0), costs }; }
      const ev = evaluatePeace(s, war, player, q.to, terms);
      const costs = terms.map((t) => termCost(s, war, t, player, q.to));
      const cost = costs.reduce((p, x) => p + x, 0);
      const warScore = computeScore(s, war) * (war.att.includes(player) ? 1 : -1);
      return { ...peaceAnswer(ev, terms, warScore, cost), cost, costs, warScore };
    }
    case 'path': { const a = s.armies.find((x) => x.id === q.army); if (!a) return null; const p = findPath(s, w, a, a.loc, q.to); return p ? { path: p, days: Math.ceil(travelDays(s, w, a, p)) } : null; }
    case 'chronicle': return s.chronicle.slice(q.from ?? 0);
    case 'timelapse': return s.timelapse.map((t) => ({ day: t.day, owners: t.owners }));
    case 'goals': { const n = s.nations[q.nation]; return n ? goalsView(s, w, n) : null; }
    case 'eventFx': return player >= 0 ? eventOptionFxCached(s, w, player, q.pending) : null;
    case 'works': return player >= 0 ? worksView(s, w, player) : null;
    case 'scope': return player >= 0 ? scopeView(s, w, player, q.loc, q.scope) : null;
    case 'gain': return player >= 0 ? gainDetail(s, w, player, q.loc, q.building) : null;
    case 'places': return Array.isArray(q.locs) ? placesOf(w, q.locs.slice(0, w.L)) : null;
    case 'declare': return player >= 0 ? declareView(s, w, player, q.target) : null;
    case 'army': return player >= 0 ? armyView(s, w, player, q.army) : null;
    case 'battle': return battleView(s, w, q.id);
    case 'battles': return battleList(s, q.war, player);
    case 'war': return warView(s, w, player, q.war);
    case 'empire': case 'powers': case 'assembly': case 'govern': case 'situation': return player >= 0 ? realmAnswer(s, w, player, q) : null;
    case 'commanders': return player >= 0 ? commandersView(s, player, q.army) : null;
    case 'victory': return victoryView(s, w, player);
    case 'devEvents': return s.flags.devtools ? { events: EVENTS.map((d) => ({ id: d.id, title: d.title, major: !!d.major })), aiDisabled: s.aiDisabled.slice() } : null;
    case 'history': return historyView(s, player, Array.isArray(q.nations) ? q.nations.slice(0, 8) : []);
    case 'endstats': return { ranking: [...s.nations].filter((n) => n.alive).sort((a, b) => b.score - a.score).slice(0, 20).map((n) => ({ id: n.id, score: n.score })), chronicle: s.chronicle.length, victory: s.victory };
  }
  return null;
}

/** The peace evaluation as the dialog shows it (systems/war.ts evaluatePeace): rows that add up exactly to the shown sum,
 *  and apart from them the condition that our war score must cover 80 % of the demands (not part of the sum). */
export function peaceAnswer(ev: { accept: boolean; score: number; reasons: [string, number][] }, terms: PeaceTerm[], warScore: number, cost: number) {
  const white = terms.length === 0 || terms.every((t) => t.type === 'white_peace');
  // (their war exhaustion gets its own key: 'war_exhaustion' alone reads as ours elsewhere, e.g. in unrest)
  const rows: [string, number][] = ev.reasons.filter(([k]) => k !== 'not_enough_war_score').map(([k, v]) => [k === 'war_exhaustion' ? 'their_war_exhaustion' : k, v]);
  // evaluatePeace adds +5 to the sum for a white peace without listing it
  if (white) { const at = rows.findIndex((r) => r[0] === 'fighting_for_freedom'); rows.splice(at < 0 ? rows.length : at, 0, ['white_peace', 5]); }
  // the rows are rounded: keep the shown sum on the same side of zero as the real one, so that Σ and the verdict agree
  let total = rows.reduce((p, r) => p + r[1], 0);
  const want = ev.score >= 0 ? Math.max(0, total) : Math.min(-1, total);
  const ws = rows.find((r) => r[0] === 'war_score');
  if (want !== total && ws) { ws[1] += want - total; total = want; }
  let cond: { ok: boolean; have: number; need: number } | null = null;
  if (!white) {
    const ok = !ev.reasons.some((r) => r[0] === 'not_enough_war_score');
    const have = Math.round(warScore); let need = Math.round(cost * 0.8);
    if (ok && have < need) need = have; else if (!ok && have >= need) need = have + 1;
    cond = { ok, have, need };
  }
  return { accept: ev.accept, score: total, reasons: rows, cond };
}

/** Company sizes offered in the location panel. */
const MERC_SIZES = [1000, 2000, 3000, 5000, 8000];

function locDetail(s: GameState, w: World, l: number, player: number) {
  if (l < 0 || l >= w.N) return null;
  const lc = s.loc;
  if (l >= w.L) {
    const fleets = s.armies.filter((a) => a.loc === l && a.fleet).map((a) => ({ id: a.id, owner: a.owner, ships: armyMen(a), name: a.name }));
    return { sea: true, id: l, name: w.names[l], fleets };
  }
  const prov = w.provinces[w.provOf[l]], area = prov ? w.areas.find((a) => a.provinces.includes(prov.id)) : null;
  const pops = CLASSES.map((c, k) => ({ cls: c, name: CLASS_NAME[c], pop: lc.pop[l * C + k], sol: lc.sol[l * C + k], wealth: lc.wealth[l * C + k] }));
  const o = lc.owner[l], n = o >= 0 ? s.nations[o] : null;
  const buildings = BUILDINGS.map((b, k) => ({ id: k, key: b.id, name: b.name, desc: b.desc, level: lc.buildings[l * B + k], max: b.max, cost: n ? buildCost(s, n, k, lc.buildings[l * B + k]) : 0, months: b.months,
    allowed: !(b.needsCoast && !w.coastal[l]) && (b.era ?? 0) <= (n?.era ?? 0), queued: s.constructions.filter((c) => c.loc === l && c.building === k).map((c) => c.left) }));
  const workshops = [0, 1, 2].map((k) => { const r = lc.workshop[l * 3 + k]; return r ? { recipe: r - 1, name: RECIPES[r - 1].name } : null; });
  // unrest drifts 30 % a month toward this target (systems/economy.ts stepLocations)
  const unrestWhy: [string | I18n, number][] = [];
  if (n) {
    const avgSol = pops.reduce((p, x) => p + x.sol * x.pop, 0) / Math.max(1, pops.reduce((p, x) => p + x.pop, 0));
    unrestWhy.push(['living_standard', (0.55 - avgSol) * 40], ['taxes', n.taxRate[CL.peasants] * 60]);
    if (!ownFaith(n, lc.faith[l])) unrestWhy.push(['foreign_faith', 8 * (1 - lawEffect(n, 'tolerance'))]);
    if (lc.culture[l] !== n.culture) unrestWhy.push(['foreign_culture', 4]);
    unrestWhy.push(['war_exhaustion', n.warExhaustion * 0.12], ['low_control', (1 - lc.control[l]) * 6], ['concord', -n.concord * 0.08], ['x_base', -2]);
    if (lc.devast[l] > 0) unrestWhy.push(['devastation', lc.devast[l] * 12]);
    if (n.inflation > 0) unrestWhy.push(['inflation', n.inflation * 20]);
    if (lc.core[l] !== o) unrestWhy.push(['not_integrated', 6]);
    unrestWhy.push(...effectSources(n, 'unrest'));
    for (const d of DUTIES) { const v = dutyRate(n, d.id) * d.unrest; if (v) unrestWhy.push([`x_${d.ledger}`, v]); }
    const ox = overextension(n); if (lc.integ[l] < 1 && ox > 0) unrestWhy.push(['x_overextension', Math.min(15, ox * 10)]);
  }
  const m = s.markets[lc.market[l]];
  const ec = LOC_ECON;
  return {
    sea: false, id: l, name: w.names[l], alt: w.altNames[l], province: prov?.name, area: area?.name, region: prov?.region, terrain: TERRAINS[w.terrain[l]], coastal: !!w.coastal[l],
    owner: o, ctrl: lc.ctrl[l], core: lc.core[l], culture: cultureName(ALL_CULTURES[lc.culture[l]] || 'unknown'), cultureGroup: GROUP_OF[ALL_CULTURES[lc.culture[l]]], faith: FAITHS[lc.faith[l]]?.name,
    minority: lc.minShare[l] > 0.02 ? { culture: cultureName(ALL_CULTURES[lc.minCulture[l]] || 'unknown'), faith: FAITHS[lc.minFaith[l]]?.name, share: lc.minShare[l] } : null,
    pops, buildings, workshops, dev: lc.dev[l], control: lc.control[l], integ: lc.integ[l], unrest: lc.unrest[l], unrestWhy, literacy: lc.literacy[l], devast: lc.devast[l], harvest: lc.harvest[l],
    plague: lc.plague[l], snow: lc.snow[l], garrison: lc.garrison[l], resource: GOODS[w.resource[l]].name, resourceId: w.resource[l], market: m ? { id: m.id, name: m.name, price: m.price[w.resource[l]] } : null,
    tax: lc.income[l], econ: ec ? { grain: ec.grain[l], rgo: ec.rgo[l], craft: ec.craft[l], income: ec.income[l] } : null, elev: w.elev[l], lat: w.lat[l], lon: w.lon[l],
    landmark: landmarkDetail(s, w, l, player), why: locExplain(s, w, l),
    method: lc.method[l], migration: lc.migr[l], employed: lc.employed ? lc.employed[l * C + CL.artisans] : 0,
    methods: n && player === o ? METHODS.map((m, k) => ({ id: k, key: m.id, name: m.name, mult: m.mult, input: m.input, jobs: m.jobs, cost: methodCost(s, n, k), block: methodBlock(s, w, n, l, k) })) : [],
    canColonize: o < 0 && player >= 0 ? canColonize(s, w, s.nations[player], l) : 'owned', colony: s.colonies.find((c) => c.loc === l) ?? null,
    agents: s.agents.filter((a) => a.loc === l), siege: s.sieges.find((x) => x.loc === l) ?? null, war: locWar(s, w, l, player),
    armies: s.armies.filter((a) => a.loc === l).map((a) => ({ id: a.id, owner: a.owner, men: armyMen(a), fleet: a.fleet, name: a.name, mercenary: !!a.mercenary, rebels: !!a.rebels })),
    mercenaries: n && player === o ? MERC_SIZES.map((men) => ({ men, ...mercenaryCostParts(s, n, men) })) : [],
    units: n && player === o ? availableUnits(s, n, false).concat(w.coastal[l] ? availableUnits(s, n, true) : []).map((u) => ({ id: u, name: UNITS[u].name, kind: UNITS[u].kind, cost1000: unitCost(s, n, u, UNITS[u].kind === 'ship' ? 1 : 1000) })) : [],
  };
}

function nationDetail(s: GameState, w: World, id: number, player: number) {
  const n = s.nations[id]; if (!n) return null;
  const r = s.chars[n.ruler], h = s.chars[n.heir];
  const men = s.armies.filter((a) => a.owner === id && !a.fleet).reduce((p, a) => p + armyMen(a), 0);
  const ships = s.armies.filter((a) => a.owner === id && a.fleet).reduce((p, a) => p + armyMen(a), 0);
  const rel = player >= 0 && player !== id ? {
    theirOpinion: opinionBreakdown(s, w, id, player), ourOpinion: opinionBreakdown(s, w, player, id), trust: trust(s, id, player),
    treaties: (['alliance', 'marriage', 'access', 'guarantee', 'trade', 'truce'] as const).filter((t) => hasTreaty(s, id, player, t)),
    atWar: atWar(s, id, player), rival: s.nations[player].rivals.includes(id),
    // justifications for war: ours against them, theirs against us, a claim being fabricated by our clerks
    cb: casusBelliAll(s, player, id), theirCb: casusBelliAll(s, id, player), sameFaith: s.nations[player].faith === n.faith,
    fabricating: s.spies.find((x) => x.nation === player && x.target === id && x.action === 'fabricate') ?? null,
    actions: DIPLO_ACTIONS.map((a) => ({ id: a, name: ACT_NAME[a] ?? { en: a, de: a } })),
    // Favour of the Curia: a Latin ruler can have another Latin ruler banned (realm.ts excommunicate)
    canExcommunicate: FAITHS[s.nations[player].faith]?.id === 'latin' && FAITHS[n.faith]?.id === 'latin' && !n.excommunicated && s.papacy.holder !== id, curiaFavour: s.papacy.curiaFavour[player] ?? 0,
  } : null;
  return {
    id, key: n.key, name: n.name, short: n.short, adj: n.adj, color: n.color, coa: n.coa, rank: n.rank, gov: n.gov, faith: FAITHS[n.faith]?.name, culture: cultureName(ALL_CULTURES[n.culture] || 'unknown'),
    // the faith's own mechanic and what it (and communities of other faiths in the realm) does for this realm now
    faithMechanic: { name: FAITHS[n.faith]?.mechanic, desc: FAITHS[n.faith]?.mechanicDesc, active: n.modifiers.filter((m) => m.id.startsWith('faith_')).map((m) => ({ id: m.id, label: m.label, effects: m.effects })) },
    capital: n.capital, capitalName: n.capital >= 0 ? w.names[n.capital] : '—', ruler: r ? { name: r.name, dynasty: r.dynasty, female: r.female, age: Math.floor(ageOf(s, r)), skills: r.skills, traits: r.traits } : null,
    heir: h && h.alive ? { name: h.name, female: h.female, age: Math.floor(ageOf(s, h)) } : null, dev: nationDev(s, id), score: n.score, prestige: n.prestige, concord: n.concord, mandate: n.mandate,
    men, ships, treasury: id === player ? n.treasury : null, tech: n.tech, era: n.era, allies: allies(s, id), rivals: n.rivals, overlord: n.overlord, subjects: subjectsOf(s, id),
    personality: n.personality, summary: n.summary, difficulty: n.difficulty, dread: n.dread, scoreParts: scorePartsAll(s, w)[id], front: (s as any).fronts?.[id] ?? [], rel, alive: n.alive,
    wars: s.wars.filter((x) => x.att.includes(id) || x.def.includes(id)).map((x) => x.id), isHRE: n.isHRE, elector: n.elector, emperor: s.empire.emperor === id,
    // what an AI realm did lately (systems/ai_log.ts), newest first; its secret work (agents abroad, forged claims) only
    // for the realm itself and an observer without a realm
    aiLog: !s.playerNations.includes(id) && !n.playerId ? (n.aiLog ?? []).filter((e) => player < 0 || player === id || !aiLogSecret(e)).reverse().map((e) => ({ day: e.d, text: aiLogText(s, w, e) })) : null,
    subject: n.overlord >= 0 && s.nations[n.overlord] ? {
      type: n.subjectType, since: n.subjectSince, libertyDesire: n.libertyDesire, target: libertyTarget(s, w, n, s.nations[n.overlord]),
      parts: libertyParts(s, w, n, s.nations[n.overlord]).filter(([, v]) => Math.abs(v) >= 0.5), integration: n.integration, integrating: !!n.flags.integrating,
    } : null,
  };
}

/** Name with house for the council lists; names that already carry a title ("Pedro, Infante of Portugal") stay as they are. */
const courtName = (c: { name: string; dynasty?: string }) => (c.dynasty && !/,| of | von /.test(c.name) && !c.name.includes(c.dynasty.slice(0, 5)) ? `${c.name} ${c.dynasty}` : c.name);

function realmDetail(s: GameState, w: World, player: number) {
  const n = s.nations[player]; if (!n) return null;
  const rr = researchRate(s, w, n);
  return {
    laws: LAWS.map((L) => ({ id: L.id, name: L.name, group: L.group, current: n.laws[L.id] ?? 0, options: L.options.map((o, k) => ({ id: o.id, name: o.name, desc: o.desc, effects: o.effects, estates: o.estates, cost: reformCost(n, L.id, k), locked: (o.minEra ?? 0) > n.era || (o.gov ? !o.gov.includes(n.gov) : false) })) })),
    reform: n.reform ?? null,
    estates: n.estates.map((e) => ({ ...e, name: ESTATES.find((x) => x.id === e.id)?.name, desc: ESTATES.find((x) => x.id === e.id)?.desc, privileges: PRIVILEGES.filter((p) => p.estate === e.id).map((p) => ({ id: p.id, name: p.name, effects: p.effects, granted: e.privileges.includes(p.id) })) })),
    council: OFFICES.map((o) => { const c = s.chars[n.council[o.id]]; return { id: o.id, name: o.name, skill: o.skill, effect: o.effect, char: c ? { id: c.id, name: courtName(c), skills: c.skills, loyalty: c.loyalty, corruption: c.corruption, age: Math.floor(ageOf(s, c)), traits: c.traits } : null, bonus: councilBonus(s, n, o.id) }; }),
    candidates: officeCandidates(s, n).map((c) => ({ id: c.id, name: courtName(c), skills: c.skills, loyalty: c.loyalty, corruption: c.corruption, age: Math.floor(ageOf(s, c)), traits: c.traits, female: c.female,
      kin: c.id === n.consort || (s.chars[n.ruler]?.children ?? []).includes(c.id), bonus: Object.fromEntries(OFFICES.map((o) => [o.id, officeBonusOf(c, o.id)])) })),
    officeCost: OFFICE_COST,
    dynasty: dynastyView(s, n),
    values: n.values,
    tech: BRANCHES.map((b, k) => ({ name: b.name, level: n.tech[k], progress: n.techProgress[k], cost: techCost(s, n, k), rate: rr[k] })), focus: n.flags.research_focus ?? -1,
    era: ERAS[n.era], eras: ERAS,
    doctrines: DOCTRINES.map((g) => ({ id: g.id, name: g.name, desc: g.desc, era: g.era, taken: n.doctrines[g.id] || 0, picks: g.picks })), insight: n.flags.doctrine_pts || 0, doctrineCost: doctrineCost(n), doctrineSlots: doctrineSlots(n),
    innovations: s.innovations.map((st) => ({ id: st.id, name: INNOVATIONS[st.id].name, desc: INNOVATIONS[st.id].desc, adopted: n.innovations.includes(st.id), reachedCapital: n.capital >= 0 && !!st.reached[n.capital] })),
    decisions: decisionsFor(s, w, n).map(({ d, why }) => ({ id: d.id, name: d.name, desc: d.desc, why })),
    agents: s.agents.filter((a) => a.nation === player).map((a) => ({ ...a, name: w.names[a.loc] })), agentSlots: agentSlots(n),
    colonies: s.colonies.filter((c) => c.nation === player).map((c) => ({ ...c, name: w.names[c.loc] })), colonySlots: colonySlots(n),
    colonyCost: colonyCost(s, n), colonyProgress: colonyProgress(n), colonise: effectSources(n, 'colonise'),
    admin: adminInfo(s, w, n), forecast: budgetForecast(s, n),
    duties: DUTIES.map((d) => ({
      id: d.id, ledger: d.ledger, rate: dutyRate(n, d.id), max: d.max, step: d.step, income: n.income[d.ledger] ?? 0, unrest: d.unrest,
      estates: Object.fromEntries(dutyEstates(d, (c) => classExempt(n, c))),
      // classes free of it by law (and the nobles' hearth privilege): they pay that share less, the crown forgoes it
      exempt: d.classes.map((c) => [c, d.id === 'hearth' && c === CL.nobles ? Math.max(classExempt(n, c), Math.min(1, Math.max(0, lawEffect(n, 'hearth_exempt_nobles')))) : classExempt(n, c)] as [number, number]).filter(([, v]) => v > 0),
    })),
    dutyUnrest: dutyUnrest(n), tariffMax: tariffMax(n), tariffMaxParts: [['x_base', 0.05], ...effectSources(n, 'tariff_max')] as BdRow[], loanRate: loanRate(s, n),
    diplomacy: { value: diploSkill(s, n), parts: [...effectSources(n, 'diplomacy'), ['x_chancellor', councilBonus(s, n, 'chancellor')]] as BdRow[] },
    tradition: traditionOf(n),
    loans: n.loans, history: n.history.slice(-240), modifiers: n.modifiers.filter((m) => m.until < 1e9 || m.id.startsWith('priv_')).map((m) => ({ id: m.id, label: m.label, until: m.until, effects: m.effects })),
    situations: s.situations.map((x) => { const d = SITUATIONS.find((y) => y.id === x.id); return { ...x, name: d?.name, desc: d?.desc, stageName: d?.stages?.[x.stage] }; }),
    constructions: s.constructions.filter((c) => c.nation === player).map((c) => ({ ...c, name: w.names[c.loc], building: BUILDINGS[c.building].name })),
    recruits: s.recruits.filter((r) => r.nation === player).map((r) => ({ ...r, name: w.names[r.loc], unit: UNITS[r.type].name })),
    spies: s.spies.filter((x) => x.nation === player), empire: { emperor: s.empire.emperor, authority: s.empire.authority, electors: s.empire.electors, election: !!s.empire.election, diet: !!s.empire.diet },
    papacy: { holder: s.papacy.holder, favour: s.papacy.curiaFavour[player] ?? 0, schism: s.papacy.schism }, goalsDone: n.goalsDone,
    priceLevel: s.priceLevel, markets: s.markets.map((m) => ({ id: m.id, name: m.name, mine: m.merchants[player] || 0 })),
    explain: explainRealm(s, w, n), goals: goalsView(s, w, n),
  };
}

function ledger(s: GameState, w: World, kind: string) {
  if (kind === 'nations') {
    const pop = new Float64Array(s.nations.length), locs = new Int32Array(s.nations.length);
    for (let i = 0; i < w.L; i++) { const o = s.loc.owner[i]; if (o < 0) continue; locs[o]++; for (let c = 0; c < C; c++) pop[o] += s.loc.pop[i * C + c]; }
    const army = new Float64Array(s.nations.length), navy = new Float64Array(s.nations.length);
    for (const a of s.armies) if (!a.rebels) (a.fleet ? navy : army)[a.owner] += armyMen(a);
    const parts = scorePartsAll(s, w);
    return s.nations.filter((n) => n.alive).map((n) => ({ id: n.id, name: n.short, score: n.score, scoreParts: parts[n.id], techs: n.tech, incomeTop: Object.entries(n.income).filter(([, v]) => v > 0.05).sort((a, b) => b[1] - a[1]).slice(0, 4), dev: nationDev(s, n.id), locs: locs[n.id], pop: pop[n.id], army: army[n.id], navy: navy[n.id], income: sumObj(n.income), tech: n.tech.reduce((p, x) => p + x, 0), prestige: n.prestige }));
  }
  if (kind === 'markets') return s.markets.map((m) => ({ id: m.id, name: m.name, owner: m.owner, priceIndex: m.priceIndex, top: Array.from({ length: G }, (_, k) => k).sort((a, b) => m.supply[b] * m.price[b] - m.supply[a] * m.price[a]).slice(0, 4).map((k) => GOODS[k].name) }));
  if (kind === 'wars') return warsView(s);
  return null;
}

// ---------------- breakdowns: where every number comes from (spec point 52) ----------------
// These mirror the formulas of the simulation term by term; tests/explain.test.ts checks the totals against the
// simulation's own functions where it exports them. Rows are [key of the UI text table, or bilingual name, value].
type BdRow = [string | I18n, number];
const lawLabel = (law: { name: I18n }, opt: { name: I18n }): I18n => ({ en: `${law.name.en}: ${opt.name.en}`, de: `${law.name.de}: ${opt.name.de}` });
/** Every source of an effect, as lawEffect(n, key) sums them (systems/politics.ts): law options, value axes, the
 *  tradition of the realm's culture group and every timed or permanent modifier. Their sum is lawEffect(n, key). */
export function effectSources(n: Nation, key: string): BdRow[] {
  const out: BdRow[] = [];
  for (const L of LAWS) {
    const cur = n.laws[L.id]; if (cur === undefined) continue;
    const o = L.options[cur]; const v = o?.effects[key];
    if (v) out.push([lawLabel(L, o), v]);
  }
  VALUES.forEach((a, k) => {
    const val = n.values[k] || 0; if (!val) return;
    const v = (val < 0 ? a.effectsLow : a.effectsHigh)[key];
    if (v) out.push([val < 0 ? a.low : a.high, v * Math.abs(val) / 100]);
  });
  const tr = traditionOf(n); const tv = tr.effects[key];
  if (tv) out.push([tr.name, tv]);
  for (const m of n.modifiers) { const v = m.effects[key]; if (v) out.push([m.label, v]); }
  return out;
}
const scaleRows = (rows: BdRow[], f: number): BdRow[] => rows.map(([k, v]) => [k, v * f]);
const sumRows = (rows: BdRow[]) => rows.reduce((p, r) => p + r[1], 0);
/** Rows with the same label merged (a modifier read twice by the simulation shows once, with its full weight). */
function mergeRows(rows: BdRow[]): BdRow[] {
  const m = new Map<string, BdRow>();
  for (const r of rows) { const k = typeof r[0] === 'string' ? r[0] : r[0].en; const x = m.get(k); if (x) x[1] += r[1]; else m.set(k, [r[0], r[1]]); }
  return [...m.values()];
}
const estName = (id: string): I18n => ESTATES.find((e) => e.id === id)?.name ?? { en: id, de: id };

/** Breakdowns for the player's realm: top bar values and the derived numbers of the panels. */
export function explainRealm(s: GameState, w: World, n: Nation) {
  const r = s.chars[n.ruler];
  const atWarCount = s.wars.filter((x) => x.att.includes(n.id) || x.def.includes(n.id)).length;
  // ---- Concord drifts 4 % a month toward its target (systems/politics.ts nationPoliticsMonth)
  let infl = 0; for (const e of n.estates) infl += e.influence;
  const concordParts: BdRow[] = [];
  const ep = 1 + lawEffect(n, 'estate_power'); // a strong assembly makes the Powers' mood weigh more
  if (infl > 0) for (const e of n.estates) concordParts.push([estName(e.id), (e.contentment - 50) * 1.2 * ep * e.influence / infl]);
  concordParts.push(['x_war_exhaustion', -n.warExhaustion * 0.3]);
  concordParts.push(...scaleRows(effectSources(n, 'concord_gain'), 50));
  if (n.excommunicated) concordParts.push(['x_excommunicated', -20]);
  concordParts.push(...effectSources(n, 'concord'));
  const concordTarget = sumRows(concordParts);
  // ---- Mandate drifts 3 % a month toward its target
  const mandateParts: BdRow[] = [['x_base', 45], ['x_ruler_dip', r ? r.skills[1] * 5 : 10], ['x_prestige', n.prestige * 0.1]];
  mandateParts.push(...scaleRows(effectSources(n, 'mandate_gain'), 100));
  if (n.regent) mandateParts.push(['x_regency', -15]);
  if (n.excommunicated) mandateParts.push(['x_excommunicated', -25]);
  mandateParts.push(...effectSources(n, 'mandate'));
  mandateParts.push(...govMandateParts(s, n));
  const mandateTarget = sumRows(mandateParts);
  // ---- Authority: (1 + skills·0.4 + Mandate/50) × (1 + authority_gain) + authority (authorityGain)
  const sk = r ? r.skills[0] + r.skills[1] * 0.5 : 2;
  const aBase = 1 + sk * 0.4 + n.mandate / 50;
  const authorityParts: BdRow[] = [['x_base', 1], ['x_ruler_skills', sk * 0.4], ['x_mandate', n.mandate / 50],
    ...scaleRows(effectSources(n, 'authority_gain'), aBase), ...effectSources(n, 'authority')];
  // ---- Prestige: decays by 0.5 % a month; landmarks and a full chest add to it
  const gross = Object.values(n.income).reduce((a, b) => a + Math.max(0, b), 0);
  const prestigeParts: BdRow[] = [['x_decay', -n.prestige * 0.005], ...effectSources(n, 'prestige')];
  for (const x of landmarksOf(s, w)) if (x.tier > 0 && s.loc.owner[x.loc] === n.id) { const d = landmarkDef(x.id); if (d.prestige) prestigeParts.push([d.name, d.prestige * x.tier]); }
  const hoard = n.treasury - gross * 12;
  if (hoard > 0 && gross > 0) prestigeParts.push(['x_splendour', Math.min(0.5, hoard / (gross * 200))]);
  // ---- Insight for doctrines (systems/progress.ts monthly)
  const rr = researchRate(s, w, n);
  const insightParts: BdRow[] = [['x_base', 1.5], ['x_learning', (rr[0] + rr[1] + rr[2]) * 0.13], ['x_ruler_skills', r ? (r.skills[0] + r.skills[1]) * 0.15 : 0], ['x_prestige', Math.max(0, n.prestige) * 0.01]];
  // ---- Envoys (systems/diplomacy.ts)
  const envoyParts: BdRow[] = [['x_base', 2], ['x_ruler_dip', r ? Math.floor(r.skills[1] / 3) : 0], ['x_chancellor', n.council.chancellor ? 1 : 0]];
  // ---- Manpower and sailors (systems/military.ts monthly)
  let pl = 0, mp0 = 0, mp = 0, sail = 0, occupied = 0;
  const lc = s.loc;
  for (let i = 0; i < w.L; i++) {
    if (lc.owner[i] !== n.id) continue;
    if (lc.ctrl[i] !== n.id) { occupied++; continue; }
    const base = i * C; const people = lc.pop[base + CL.peasants] + lc.pop[base + CL.labourers];
    const c = people * 0.012 * (0.4 + 0.6 * lc.control[i]);
    pl += people * 0.012; mp0 += c; mp += c * integrationYield(lc.integ[i]);
    if (w.coastal[i]) sail += lc.pop[base + CL.labourers] * 0.02 * (1 + lc.buildings[i * B + BI.port]);
  }
  const mpSources = effectSources(n, 'manpower');
  const mpMult = Math.max(0.1, 1 + sumRows(mpSources));
  const manpowerParts: BdRow[] = [['x_peasants_labourers', pl], ['x_weak_control', mp0 - pl], ['x_unintegrated', mp - mp0], ...scaleRows(mpSources, mp)];
  const sailSources = effectSources(n, 'sailors');
  const sailMult = Math.max(0.1, 1 + sumRows(sailSources));
  // ---- War exhaustion, inflation, corruption, dread: their monthly change
  const weParts: BdRow[] = atWarCount ? [['x_wars', 0.35 * atWarCount]] : [['x_peace_recovery', -Math.min(1.5, n.warExhaustion)]];
  const inflParts: BdRow[] = n.coinage > 0 ? [['x_coinage', n.coinage * 0.01]] : [['x_recovery', -Math.min(0.0015, n.inflation)]];
  const corrParts: BdRow[] = [['x_base', -0.0005], ...scaleRows(effectSources(n, 'corruption'), 0.01)];
  const dreadParts: BdRow[] = [['x_decay', -(n.dread * 0.008 + 0.05)], ...scaleRows(effectSources(n, 'dread_decay'), -0.1)];
  // ---- capacities
  const merchantParts: BdRow[] = [['x_base', 2], ['x_governance', Math.floor(n.tech[0] / 4)], ['x_merchant_republic', n.gov === 'merchant_republic' ? 2 : 0]];
  const agentSrc = effectSources(n, 'agents');
  const agentParts: BdRow[] = [['x_base', 1], ['x_governance', Math.floor(n.tech[0] / 8)], ...agentSrc];
  const colSrc = effectSources(n, 'colonists');
  const colonyParts: BdRow[] = n.tech[1] >= 9 ? [['x_base', 1], ['x_commerce', Math.floor((n.tech[1] - 9) / 5)], ...colSrc] : [['x_needs_commerce9', 0]];
  const docTaken = Object.values(n.doctrines).reduce((p, x) => p + x, 0);
  // ---- research per branch: factors (systems/progress.ts researchRate)
  let pop = 0, lit = 0, dev = 0, uni = 0, burg = 0, nob = 0, cler = 0;
  for (let i = 0; i < w.L; i++) {
    if (lc.owner[i] !== n.id) continue;
    const base = i * C; let p = 0; for (let c = 0; c < C; c++) p += lc.pop[base + c];
    pop += p; lit += lc.literacy[i] * p; dev += lc.dev[i]; uni += lc.buildings[i * B + BI.university];
    burg += lc.pop[base + CL.burghers]; nob += lc.pop[base + CL.nobles]; cler += lc.pop[base + CL.clergy];
  }
  const litAvg = pop > 0 ? lit / pop : 0;
  const resSources = effectSources(n, 'research');
  const common: BdRow[] = [['x_realm_size', 1.2 + Math.pow(Math.max(1, dev), 0.3) * 0.9], ['x_literacy', 0.5 + litAvg * 3], ['x_universities', 1 + uni * 0.12], ['x_research_mods', Math.max(0.1, 1 + sumRows(resSources))]];
  const officeF = (k: number): BdRow[] => { const id = RESEARCH_OFFICE[k]; const b = councilBonus(s, n, id); return b ? [[OFFICES.find((o) => o.id === id)!.name, 1 + 2 * b]] : []; };
  const focus = n.flags.research_focus ?? -1;
  const focusF = (k: number): BdRow[] => (focus >= 0 && focus < 3 ? [[focus === k ? 'x_focus' : 'x_other_focus', focus === k ? 1.35 : 0.85]] : []);
  const research = [
    [...common, ['x_ruler_gov', 1 + (r ? r.skills[0] * 0.04 : 0)], ...officeF(0), ...focusF(0)],
    [...common, ['x_burghers', 1 + (pop > 0 ? burg / pop : 0) * 6 + (n.gov === 'merchant_republic' ? 0.2 : 0)], ['x_clergy', 1 + (cler / Math.max(1, pop)) * 3], ...officeF(1), ...focusF(1)],
    [...common, ['x_nobles_ruler_mil', 1 + (r ? r.skills[2] * 0.04 : 0) + (nob / Math.max(1, pop)) * 10], ...officeF(2), ...focusF(2)],
  ] as BdRow[][];
  // ---- cost of the next level: base × pace of the age × neighbours' knowledge (techCost)
  const year = s.startYear + s.day / 365.25, expected = (year - 1342) / 14.5;
  const techCostF = n.tech.map((lvl, k) => {
    const ahead = lvl - expected; const pace = ahead > 0 ? Math.pow(3, ahead) : Math.max(0.5, 1 + ahead * 0.15);
    const nb = (s as any)._techSpread?.[n.id]?.[k] ?? 0;
    return [['x_tech_base', techBase(n, k)], [ahead > 0 ? 'x_ahead_of_age' : 'x_pace_of_age', pace], ['x_neighbours', 1 - Math.min(0.3, nb)]] as BdRow[];
  });
  // ---- taxes per class: nominal × (1 − exemption) × (1 − corruption) × (1 + tax modifiers) (systems/economy.ts taxTable)
  const taxMods = effectSources(n, 'tax');
  const trB = councilBonus(s, n, 'treasurer');
  const taxCommon: BdRow[] = [['x_corruption', 1 - n.corruption], ['x_tax_mods', 1 + sumRows(taxMods)], ['x_treasurer', 1 + trB]];
  const tax = CLASSES.map((_, c) => {
    const exParts = effectSources(n, `exempt_${c}`);
    const ex = Math.max(0, Math.min(1, sumRows(exParts)));
    return { nominal: n.taxRate[c] ?? 0.05, exempt: ex, exemptParts: exParts, effective: (n.taxRate[c] ?? 0.05) * (1 - ex) * Math.max(0, (1 - n.corruption) * (1 + sumRows(taxMods)) * (1 + trB)) };
  });
  // ---- estates: contentment drifts 3 % a month toward 50 + 6 per privilege
  // influence drifts 5 % a month toward the Power's share of all weights (systems/government.ts influenceFactors)
  const inflF = influenceFactors(s, n); const inflT = influenceTargets(s, n);
  const estates = n.estates.map((e) => { const duty = dutyDiscontent(n, e.id, (c) => classExempt(n, c)); const resent = resentment(n, e.id); const tgt = 50 + e.privileges.length * 6 - duty + resent; return { id: e.id, contentTarget: tgt, contentMonthly: (tgt - e.contentment) * 0.03, privileges: e.privileges.length, duties: duty, resent, appeaseUntil: n.flags[`appease_${e.id}`] || 0,
    influence: { value: e.influence, target: inflT[e.id] ?? e.influence, monthly: ((inflT[e.id] ?? e.influence) - e.influence) * INFLUENCE_DRIFT, factors: inflF[e.id] ?? [], weight: (inflF[e.id] ?? []).reduce((p, r) => p * r[1], 1) } }; });
  return {
    concord: { value: n.concord, target: concordTarget, monthly: (concordTarget - n.concord) * 0.04, parts: concordParts },
    mandate: { value: n.mandate, target: mandateTarget, monthly: (mandateTarget - n.mandate) * 0.03, parts: mandateParts },
    authority: { value: n.authority, monthly: sumRows(authorityParts), parts: authorityParts },
    prestige: { value: n.prestige, monthly: sumRows(prestigeParts), parts: prestigeParts },
    insight: { value: n.flags.doctrine_pts || 0, monthly: sumRows(insightParts), parts: insightParts },
    envoys: { value: n.envoys, parts: envoyParts },
    manpower: { max: mp * mpMult, parts: manpowerParts, monthly: mp * mpMult / 120, occupied },
    sailors: { max: sail * sailMult * 4, monthly: sail * sailMult / 10, mods: sailSources },
    warExhaustion: { value: n.warExhaustion, monthly: sumRows(weParts), parts: weParts, wars: atWarCount },
    inflation: { value: n.inflation, monthly: sumRows(inflParts), parts: inflParts },
    corruption: { value: n.corruption, monthly: sumRows(corrParts), parts: corrParts, graft: n.expense.graft ?? 0 },
    dread: { value: n.dread, monthly: sumRows(dreadParts), parts: dreadParts },
    merchants: { parts: merchantParts }, agents: { parts: agentParts }, colonies: { parts: colonyParts },
    doctrineCost: { parts: [['x_base', 100], ['x_doctrines_taken', docTaken * 15]] as BdRow[] },
    doctrineSlots: { parts: [['x_base', 1], ['x_era', n.era], ['x_governance12', n.tech[0] >= 12 ? 1 : 0], ['x_governance24', n.tech[0] >= 24 ? 1 : 0]] as BdRow[] },
    research, researchMods: resSources, techCost: techCostF,
    investUntil: [0, 1, 2].map((k) => n.flags[`invest_${k}`] || 0), investCost: Math.max(25, (n.income.tax || 10) * 2),
    tax, taxCommon, taxMods,
    estates, assemblyUntil: n.flags.assembly || 0, appeaseCost: Math.max(20, (n.income.tax || 10) * 1.5),
    armyCost: mergeRows(effectSources(n, 'army_cost')), mercCost: effectSources(n, 'mercenary_cost'),
  };
}

/** The goals of a realm's tree with their state: done, open (prerequisites met) or locked. */
/**
 * The realm's goal tree: every goal with its state (done, open = earlier goals done, ready = open and every condition
 * holds now), each condition with live progress and the places it names, the rewards, which goals it unlocks and its
 * depth in the tree (0 = no earlier goals).
 */
export function goalsView(s: GameState, w: World, n: Nation) {
  const done = new Set(n.goalsDone ?? []);
  const tree = goalsFor(n);
  const looked = n.flags.goals_init !== undefined;
  // goals already true at the first look were inherited without reward (systems/goals.ts firstLook)
  const inherited = new Set((n.goalsDone ?? []).slice(0, n.flags.goals_inherited ?? 0));
  const depth = new Map<string, number>();
  const depthOf = (id: string, guard = 0): number => {
    const k = depth.get(id); if (k !== undefined) return k;
    const g = tree.find((x) => x.id === id); const v = !g || guard > 20 || !g.req?.length ? 0 : 1 + Math.max(...g.req.map((r) => depthOf(r, guard + 1)));
    depth.set(id, v); return v;
  };
  return tree.map((g) => {
    const isDone = done.has(g.id), open = !isDone && (g.req ?? []).every((x) => done.has(x));
    // conditions are evaluated for open goals and the next ones (done goals keep their texts only)
    const conds = isDone ? g.conds.map((c) => ({ t: c.t, ok: true, places: c.places })) : goalConditions(s, w, n, g);
    // frac: the share of a condition done (systems/goals.ts goalConditions; a year gate holds it below full until then)
    const condsOut = conds.map((c: any) => ({ t: c.t, ok: c.ok, cur: c.cur, max: c.max, frac: c.ok ? 1 : clamp01(c.frac ?? 0), from: c.from, yearsLeft: c.yearsLeft, timeFrac: c.timeFrac,
      places: c.places?.map((nm: string) => { const l = goalPlace(w, nm); return { name: nm, loc: l, owner: l >= 0 ? s.loc.owner[l] : -1 }; }) }));
    const frac = condsOut.length ? condsOut.reduce((p: number, c: any) => p + c.frac, 0) / condsOut.length : 0;
    // ready only after the realm's first look (src/sim/systems/goals.ts firstLook): before it a claim would inherit the goal without reward
    return { id: g.id, name: g.name, desc: g.desc, flav: g.flav ?? null, req: g.req ?? [], done: isDone, inherited: inherited.has(g.id), open, ready: open && looked && conds.every((c) => c.ok),
      conds: condsOut, rews: g.rews, unlocks: tree.filter((x) => x.req?.includes(g.id)).map((x) => x.id), depth: depthOf(g.id), progress: isDone ? 1 : frac };
  });
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Location numbers: targets the values drift toward and the factors behind them (systems/economy.ts, society.ts). */
function locExplain(s: GameState, w: World, l: number) {
  const lc = s.loc; const o = lc.owner[l]; const n = o >= 0 ? s.nations[o] : null;
  let ptot = 0; for (let c = 0; c < C; c++) ptot += lc.pop[l * C + c];
  let bsum = 0; for (let b = 0; b < B; b++) bsum += lc.buildings[l * B + b];
  const devF: BdRow[] = [['x_population', Math.sqrt(ptot / 1000) * 2.2], ['x_buildings', 1 + bsum * 0.04], ['x_control', 0.8 + 0.4 * lc.control[l]]];
  const litParts: BdRow[] = [['x_base', 0.02], ['x_churches', lc.buildings[l * B + BI.church] * 0.02], ['x_universities', lc.buildings[l * B + BI.university] * 0.08], ['x_governance', n ? (n.tech[0] - 1) * 0.01 : 0]];
  let integ: BdRow[] = [];
  let reach: BdRow[] = [];
  let taxes: { cls: number; rate: number }[] = [];
  if (n) {
    const sameC = lc.culture[l] === n.culture ? 1.5 : GROUP_OF[ALL_CULTURES[lc.culture[l]]] === GROUP_OF[ALL_CULTURES[n.culture]] ? 1.15 : 0.8;
    const sameF = lc.faith[l] === n.faith ? 1 : faithFamily(lc.faith[l]) === faithFamily(n.faith) ? 0.75 : 0.5;
    integ = [['x_base_rate', 100 / 120], [overextControl(n) > 0 ? 'x_control_unstrained' : 'x_control', integrationControl(s, n, l)], ['x_culture', sameC], ['x_faith', sameF], ['x_integration_mods', Math.max(0, 1 + lawEffect(n, 'integration'))], ['x_admin_capacity', integrationShare(n)]];
    reach = [['x_base_km', 520], ['x_admin', 520 * lawEffect(n, 'admin')], ['x_control_mods', 520 * lawEffect(n, 'control')], ['x_governance', 520 * n.tech[0] * 0.015]];
    taxes = CLASSES.map((_, c) => ({ cls: c, rate: effectiveTax(s, n, l, c) }));
  }
  return { devTarget: devF.reduce((p, r) => p * r[1], 1), devF, litTarget: sumRows(litParts), litParts, integ, integMonthly: integ.reduce((p, r) => p * r[1], 1) / 100, reach, occupied: n ? lc.ctrl[l] !== o : false, taxes, crownShare: CROWN_SHARE, integYield: integrationYield(lc.integ[l]) };
}

/** Score of every realm in parts (systems/realm.ts rankingMonth): development, half of the subjects' development,
 *  army and navy strength, prestige and a chest of up to 100. Recomputed now, so it can differ a little from the
 *  monthly ranking value. */
export function scorePartsAll(s: GameState, w: World): BdRow[][] {
  const st = nationStats(s, w);
  const subDev = new Float64Array(s.nations.length);
  for (const o of s.nations) if (o.alive && o.overlord >= 0 && subDev.length > o.overlord) subDev[o.overlord] += st[o.id].dev * 0.5;
  return s.nations.map((n) => {
    if (!n.alive) return [];
    const x = st[n.id];
    return [['x_development', x.dev], ['subjects', subDev[n.id]], ['army', x.army / 4000], ['fleet', x.navy / 400], ['x_prestige', Math.max(0, n.prestige) * 2], ['x_wealth', Math.min(100, Math.max(0, n.treasury) / (500 * s.priceLevel))]];
  });
}

/** road level per location (0..3), for the map */
export function roadLevels(s: GameState): Uint8Array {
  const bld = s.loc.buildings, L = bld.length / B, out = new Uint8Array(L);
  for (let i = 0; i < L; i++) out[i] = bld[i * B + BI.road];
  return out;
}

/** the largest trade routes of last month, between market hubs (a route sums its goods in each direction), and
 *  the markets with the value of the goods that passed through them */
export function tradeView(s: GameState, w: World, max = 140): { flows: TradeFlowLite[]; hubs: TradeHubLite[] } {
  const through = new Map<number, number>();
  for (const f of s.flows ?? []) { through.set(f.from, (through.get(f.from) ?? 0) + f.value); through.set(f.to, (through.get(f.to) ?? 0) + f.value); }
  const hubs = s.markets.map((m) => ({ hub: m.hub, name: { en: w.names[m.hub] ?? m.name, de: w.namesDe[m.hub] ?? m.name }, value: Math.round(through.get(m.id) ?? 0) }));
  return { flows: tradeFlows(s, max), hubs };
}
function tradeFlows(s: GameState, max: number): TradeFlowLite[] {
  const byPair = new Map<number, { a: number; b: number; value: number; best: number; good: number }>();
  for (const f of s.flows ?? []) {
    const ma = s.markets[f.from], mb = s.markets[f.to];
    if (!ma || !mb || ma.hub === mb.hub) continue;
    const key = f.from * 4096 + f.to;
    let e = byPair.get(key);
    if (!e) byPair.set(key, (e = { a: ma.hub, b: mb.hub, value: 0, best: -1, good: f.good }));
    e.value += f.value;
    if (f.value > e.best) { e.best = f.value; e.good = f.good; }
  }
  return [...byPair.values()].sort((p, q) => q.value - p.value).slice(0, max).map((e) => ({ a: e.a, b: e.b, value: Math.round(e.value), good: e.good }));
}

/** Who could lead an army of ours: generalship with its parts, morale from traits, who already commands which host,
 *  and the price of raising a new general (systems/commanders.ts). */
export function commandersView(s: GameState, player: number, army: number) {
  const n = s.nations[player]; const a = s.armies.find((x) => x.id === army && x.owner === player); if (!n || !a) return null;
  const r = s.chars[n.ruler];
  const rel = (id: number) => (id === n.ruler ? 'ruler' : id === n.heir ? 'heir' : r?.children.includes(id) ? 'child' : (n.generals ?? []).includes(id) ? 'general' : (n.candidates ?? []).includes(id) ? 'court' : 'kin');
  const list = availableCommanders(s, n).map((c) => {
    const busy = commandOf(s, c.id);
    return { id: c.id, name: c.name, dynasty: c.dynasty, female: c.female, age: Math.floor(ageOf(s, c)), skills: c.skills, traits: c.traits, xp: c.xp ?? 0, rel: rel(c.id),
      skill: commanderSkill(c), morale: commanderMorale(c), parts: commanderParts(c), busy: busy ? { id: busy.id, name: busy.name, here: busy.id === a.id } : null };
  }).sort((x, y) => y.skill - x.skill || x.id - y.id);
  const cur = s.chars[a.general];
  return { army: a.id, fleet: a.fleet, current: cur ? { id: cur.id, name: cur.name, female: cur.female, skill: commanderSkill(cur), parts: commanderParts(cur), morale: commanderMorale(cur), traits: cur.traits, xp: cur.xp ?? 0, age: Math.floor(ageOf(s, cur)) } : null,
    list, cost: generalCost(s, n), treasury: n.treasury,
    // the price: two months of taxes, at least 25 marks at the prices of the day
    costParts: (n.income.tax || 10) * 2 >= 25 * s.priceLevel ? [['x_gen_cost_taxes', (n.income.tax || 10) * 2]] : [['x_gen_cost_min', 25 * s.priceLevel]] };
}
