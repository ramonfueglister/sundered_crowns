// Worker-side: builds compact views of the game state for the UI and answers queries.
import type { GameState, Nation, I18n } from '../sim/types';
import type { World } from '../sim/world';
import type { NationLite, ArmyLite, PlayerView, TickView, MapMode, Legend, Query, LandmarkLite } from './protocol';
import { landmarksOf, landmarkDef, landmarkPrice } from '../sim/systems/landmarks';
import { LANDMARK_MONTHS } from '../sim/content/landmarks';
import { C, CL, CLASSES, CLASS_NAME, B, BI, BUILDINGS, GOODS, G, RECIPES, TERRAINS, UNITS } from '../sim/defs';
import { armyMen, findPath, travelDays, unitCost, availableUnits, mercenaryCostParts } from '../sim/systems/military';
import { nationDev, computeScore, scoreParts, casusBelliAll, evaluatePeace, termCost } from '../sim/systems/war';
import { opinionBreakdown, evaluateProposal, trust, DIPLO_ACTIONS, libertyParts, libertyTarget } from '../sim/systems/diplomacy';
import { ageOf, ESTATES, PRIVILEGES, OFFICES, OFFICE_COST, reformCost, councilBonus, officeCandidates, officeBonusOf } from '../sim/systems/politics';
import { LAWS } from '../sim/content/laws';
import { FAITHS, ALL_CULTURES, cultureLabel as cultureName, GROUP_OF } from '../sim/content/peoples';
import { BRANCHES, ERAS, techCost, researchRate, doctrineCost, doctrineSlots } from '../sim/systems/progress';
import { DOCTRINES } from '../sim/content/doctrines';
import { INNOVATIONS } from '../sim/content/innovations';
import { decisionsFor, eventDef, interpolate } from '../sim/systems/events';
import { LOC_ECON } from '../sim/systems/economy';
import { allies, hasTreaty, treatiesOf, atWar, subjectsOf } from '../sim/ctx';
import { buildCost, merchantCap } from '../sim/commands';
import { agentSlots } from '../sim/systems/society';
import { colonySlots, canColonize } from '../sim/systems/colonial';
import { SITUATIONS } from '../sim/content/situations';

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
    incomeBreak: { ...n.income }, expenseBreak: { ...n.expense }, ruler: r ? `${r.name}${r.dynasty ? ' ' + r.dynasty : ''}` : '—', rulerAge: r ? Math.floor(ageOf(s, r)) : 0,
    heir: h && h.alive ? h.name : '—', atWar: s.wars.some((x) => x.att.includes(n.id) || x.def.includes(n.id)), taxRate: [...n.taxRate],
    armyMaint: n.armyMaint, navyMaint: n.navyMaint, tariff: n.tariff, coinage: n.coinage, loans: n.loans.reduce((p, l) => p + l.amount, 0), debt: n.debt, stats: { ...n.stats },
    homeMarket: n.capital >= 0 ? s.loc.market[n.capital] ?? -1 : -1,
    merchants: { used: s.markets.reduce((p, m) => p + (m.merchants[n.id] || 0), 0), cap: merchantCap(n) },
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
        options: [{ label: { en: 'Accept', de: 'Annehmen' } }, { label: { en: 'Decline', de: 'Ablehnen' } }], art: 'court' };
    }
    const d = eventDef(p.event);
    if (!d) return { ...p, title: { en: p.event, de: p.event }, text: { en: '', de: '' }, options: [{ label: { en: 'OK', de: 'OK' } }] };
    return { ...p, title: interpolate(s, w, n, p.ctx, d.title), text: interpolate(s, w, n, p.ctx, d.text), options: d.options.map((o) => ({ label: interpolate(s, w, n, p.ctx, o.label), hint: o.hint })), art: d.art };
  });
}

export const ACT_NAME: Record<string, I18n> = {
  alliance: { en: 'Alliance', de: 'Bündnis' }, marriage: { en: 'Royal marriage', de: 'Königliche Heirat' }, guarantee: { en: 'Guarantee independence', de: 'Unabhängigkeit garantieren' },
  access: { en: 'Military access', de: 'Durchmarschrecht' }, trade: { en: 'Trade agreement', de: 'Handelsabkommen' }, vassalize: { en: 'Offer vassalage', de: 'Vasallität anbieten' },
  gift: { en: 'Send a gift', de: 'Geschenk senden' }, insult: { en: 'Insult', de: 'Beleidigen' }, demand: { en: 'Demand tribute', de: 'Tribut fordern' }, break_alliance: { en: 'Break alliance', de: 'Bündnis lösen' },
  fabricate: { en: 'Fabricate a claim', de: 'Anspruch fabrizieren' }, rival: { en: 'Declare rival', de: 'Zum Rivalen erklären' }, unrival: { en: 'End rivalry', de: 'Rivalität beenden' },
  cancel_access: { en: 'Cancel access', de: 'Durchmarsch kündigen' }, improve: { en: 'Improve relations', de: 'Beziehungen verbessern' },
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
const HEAT: [number, number, number][] = [[40, 60, 120], [60, 140, 160], [120, 190, 100], [240, 210, 80], [220, 80, 50]];
const GOOD: [number, number, number][] = [[200, 60, 50], [230, 190, 70], [70, 170, 80]];

export function mapModeColors(s: GameState, w: World, mode: MapMode, focus: number): { rgba: Uint8Array; legend: Legend } {
  const N = w.N, out = new Uint8Array(N * 4);
  const put = (i: number, c: [number, number, number], a = 255) => { out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = a; };
  const lc = s.loc;
  let legend: Legend = { title: { en: mode, de: mode }, items: [] };
  const pop = (i: number) => { let p = 0; for (let c = 0; c < C; c++) p += lc.pop[i * C + c]; return p; };
  switch (mode) {
    case 'development': for (let i = 0; i < w.L; i++) put(i, ramp(Math.log1p(lc.dev[i]) / Math.log(80), HEAT)); legend = { title: { en: 'Development', de: 'Entwicklung' }, items: [{ color: '#283c78', label: { en: 'low', de: 'niedrig' } }, { color: '#dc5032', label: { en: 'high', de: 'hoch' } }] }; break;
    case 'population': for (let i = 0; i < w.L; i++) put(i, ramp(Math.log10(1 + pop(i) / Math.max(1, w.area[i])) / 2.6, HEAT)); legend = { title: { en: 'Population density', de: 'Bevölkerungsdichte' }, items: [{ color: '#283c78', label: { en: 'sparse', de: 'dünn' } }, { color: '#dc5032', label: { en: 'dense', de: 'dicht' } }] }; break;
    case 'unrest': for (let i = 0; i < w.L; i++) if (lc.owner[i] >= 0) put(i, ramp(1 - lc.unrest[i] / 40, GOOD)); legend = { title: { en: 'Unrest', de: 'Unruhe' }, items: [{ color: '#46aa50', label: { en: 'calm', de: 'ruhig' } }, { color: '#c83c32', label: { en: 'restless', de: 'unruhig' } }] }; break;
    case 'control': for (let i = 0; i < w.L; i++) if (lc.owner[i] >= 0) put(i, ramp(lc.control[i], GOOD)); legend = { title: { en: 'Control', de: 'Kontrolle' }, items: [{ color: '#c83c32', label: { en: 'weak', de: 'schwach' } }, { color: '#46aa50', label: { en: 'firm', de: 'fest' } }] }; break;
    case 'culture': { const seen = new Map<number, number>(); for (let i = 0; i < w.L; i++) { const c = lc.culture[i]; put(i, hashColor(c * 7 + 3)); seen.set(c, (seen.get(c) || 0) + 1); }
      legend = { title: { en: 'Culture', de: 'Kultur' }, items: [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([c]) => { const k = hashColor(c * 7 + 3); return { color: `rgb(${k})`, label: cultureName(ALL_CULTURES[c] || 'unknown') }; }) }; break; }
    case 'faith': { const seen = new Set<number>(); for (let i = 0; i < w.L; i++) { const f = lc.faith[i]; put(i, hexToRgb(FAITHS[f]?.color ?? '#888888')); seen.add(f); }
      legend = { title: { en: 'Faith', de: 'Glaube' }, items: [...seen].map((f) => ({ color: FAITHS[f]?.color ?? '#888', label: FAITHS[f]?.name ?? '?' })) }; break; }
    case 'trade': for (let i = 0; i < w.L; i++) { const m = lc.market[i]; const k = hashColor(m * 13 + 1); put(i, k); }
      for (const m of s.markets) put(m.hub, [255, 240, 200]);
      legend = { title: { en: 'Trade regions', de: 'Handelsräume' }, items: s.markets.slice().sort((a, b) => b.priceIndex - a.priceIndex).slice(0, 0).map((m) => ({ color: '#fff', label: m.name })) }; break;
    case 'goods': for (let i = 0; i < w.L; i++) put(i, hexToRgb(GOODS[w.resource[i]].color || '#888888'));
      legend = { title: { en: 'Local goods', de: 'Lokale Güter' }, items: GOODS.filter((g) => g.kind === 'raw').slice(0, 16).map((g) => ({ color: g.color, label: g.name })) }; break;
    case 'diplomatic': {
      const F = s.nations[focus];
      const al = new Set(F ? allies(s, focus) : []), en = new Set<number>(), sub = new Set(F ? subjectsOf(s, focus) : []);
      if (F) for (const war of s.wars) { if (war.att.includes(focus)) war.def.forEach((x) => en.add(x)); else if (war.def.includes(focus)) war.att.forEach((x) => en.add(x)); }
      const truce = new Set(F ? treatiesOf(s, focus, 'truce') : []), riv = new Set(F?.rivals ?? []);
      for (let i = 0; i < w.L; i++) {
        const o = lc.owner[i]; if (o < 0) continue;
        const c: [number, number, number] = o === focus ? [60, 170, 70] : sub.has(o) || s.nations[o].overlord === focus ? [120, 200, 120] : al.has(o) ? [70, 120, 210] : en.has(o) ? [210, 50, 40] : riv.has(o) ? [230, 140, 40] : truce.has(o) ? [150, 150, 150] : F && F.overlord === o ? [160, 120, 200] : [205, 195, 175];
        put(i, c);
      }
      legend = { title: { en: 'Diplomacy', de: 'Diplomatie' }, items: [
        { color: '#3caa46', label: { en: 'Selected realm', de: 'Gewähltes Reich' } }, { color: '#78c878', label: { en: 'Subjects', de: 'Untertanen' } }, { color: '#4678d2', label: { en: 'Allies', de: 'Verbündete' } },
        { color: '#d23228', label: { en: 'At war', de: 'Im Krieg' } }, { color: '#e68c28', label: { en: 'Rivals', de: 'Rivalen' } }, { color: '#969696', label: { en: 'Truce', de: 'Waffenstillstand' } }] };
      break;
    }
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
    case 'peace': {
      const war = s.wars.find((x) => x.id === q.war); if (!war) return null;
      const terms = q.terms as any[];
      if (q.concede) return { accept: true, score: 0, reasons: [], cost: terms.reduce((p, t) => p + termCost(s, war, t, q.to, player), 0) };
      const ev = evaluatePeace(s, war, player, q.to, terms);
      return { ...ev, cost: terms.reduce((p, t) => p + termCost(s, war, t, player, q.to), 0), warScore: computeScore(s, war) * (war.att.includes(player) ? 1 : -1) };
    }
    case 'path': { const a = s.armies.find((x) => x.id === q.army); if (!a) return null; const p = findPath(s, w, a, a.loc, q.to); return p ? { path: p, days: Math.ceil(travelDays(s, w, a, p)) } : null; }
    case 'chronicle': return s.chronicle.slice(q.from ?? 0);
    case 'timelapse': return s.timelapse.map((t) => ({ day: t.day, owners: t.owners }));
    case 'endstats': return { ranking: [...s.nations].filter((n) => n.alive).sort((a, b) => b.score - a.score).slice(0, 20).map((n) => ({ id: n.id, score: n.score })), chronicle: s.chronicle.length, victory: s.victory };
  }
  return null;
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
  const unrestWhy: [string, number][] = [];
  if (n) {
    const avgSol = pops.reduce((p, x) => p + x.sol * x.pop, 0) / Math.max(1, pops.reduce((p, x) => p + x.pop, 0));
    unrestWhy.push(['living_standard', Math.round((0.55 - avgSol) * 40)], ['taxes', Math.round(n.taxRate[CL.peasants] * 60)]);
    if (lc.faith[l] !== n.faith) unrestWhy.push(['foreign_faith', 8]);
    if (lc.culture[l] !== n.culture) unrestWhy.push(['foreign_culture', 4]);
    unrestWhy.push(['war_exhaustion', Math.round(n.warExhaustion * 0.12)], ['low_control', Math.round((1 - lc.control[l]) * 6)], ['concord', Math.round(-n.concord * 0.08)]);
    if (lc.devast[l] > 0.05) unrestWhy.push(['devastation', Math.round(lc.devast[l] * 12)]);
    if (n.inflation > 0.02) unrestWhy.push(['inflation', Math.round(n.inflation * 20)]);
    if (lc.core[l] !== o) unrestWhy.push(['not_integrated', 6]);
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
    landmark: landmarkDetail(s, w, l, player),
    canColonize: o < 0 && player >= 0 ? canColonize(s, w, s.nations[player], l) : 'owned', colony: s.colonies.find((c) => c.loc === l) ?? null,
    agents: s.agents.filter((a) => a.loc === l), siege: s.sieges.find((x) => x.loc === l) ?? null,
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
    cb: casusBelliAll(s, player, id), theirCb: casusBelliAll(s, id, player),
    fabricating: s.spies.find((x) => x.nation === player && x.target === id && x.action === 'fabricate') ?? null,
    actions: DIPLO_ACTIONS.map((a) => ({ id: a, name: ACT_NAME[a] ?? { en: a, de: a } })),
  } : null;
  return {
    id, key: n.key, name: n.name, short: n.short, adj: n.adj, color: n.color, coa: n.coa, rank: n.rank, gov: n.gov, faith: FAITHS[n.faith]?.name, culture: cultureName(ALL_CULTURES[n.culture] || 'unknown'),
    capital: n.capital, capitalName: n.capital >= 0 ? w.names[n.capital] : '—', ruler: r ? { name: r.name, dynasty: r.dynasty, age: Math.floor(ageOf(s, r)), skills: r.skills, traits: r.traits } : null,
    heir: h && h.alive ? { name: h.name, age: Math.floor(ageOf(s, h)) } : null, dev: nationDev(s, id), score: n.score, prestige: n.prestige, concord: n.concord, mandate: n.mandate,
    men, ships, treasury: id === player ? n.treasury : null, tech: n.tech, era: n.era, allies: allies(s, id), rivals: n.rivals, overlord: n.overlord, subjects: subjectsOf(s, id),
    personality: n.personality, summary: n.summary, difficulty: n.difficulty, dread: n.dread, front: (s as any).fronts?.[id] ?? [], rel, alive: n.alive,
    wars: s.wars.filter((x) => x.att.includes(id) || x.def.includes(id)).map((x) => x.id), isHRE: n.isHRE, elector: n.elector, emperor: s.empire.emperor === id,
    subject: n.overlord >= 0 && s.nations[n.overlord] ? {
      type: n.subjectType, since: n.subjectSince, libertyDesire: n.libertyDesire, target: libertyTarget(s, w, n, s.nations[n.overlord]),
      parts: libertyParts(s, w, n, s.nations[n.overlord]).filter(([, v]) => Math.abs(v) >= 0.5), integration: n.integration, integrating: !!n.flags.integrating,
    } : null,
  };
}

/** Name with house for the council lists; names that already carry a title ("Pedro, Infante of Portugal") stay as they are. */
const courtName = (c: { name: string; dynasty?: string }) => (c.dynasty && !/,| of | von /.test(c.name) ? `${c.name} ${c.dynasty}` : c.name);

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
    values: n.values,
    tech: BRANCHES.map((b, k) => ({ name: b.name, level: n.tech[k], progress: n.techProgress[k], cost: techCost(s, n, k), rate: rr[k] })), focus: n.flags.research_focus ?? -1,
    era: ERAS[n.era], eras: ERAS,
    doctrines: DOCTRINES.map((g) => ({ id: g.id, name: g.name, desc: g.desc, era: g.era, taken: n.doctrines[g.id] || 0, picks: g.picks })), insight: n.flags.doctrine_pts || 0, doctrineCost: doctrineCost(n), doctrineSlots: doctrineSlots(n),
    innovations: s.innovations.map((st) => ({ id: st.id, name: INNOVATIONS[st.id].name, desc: INNOVATIONS[st.id].desc, adopted: n.innovations.includes(st.id), reachedCapital: n.capital >= 0 && !!st.reached[n.capital] })),
    decisions: decisionsFor(s, w, n).map(({ d, why }) => ({ id: d.id, name: d.name, desc: d.desc, why })),
    agents: s.agents.filter((a) => a.nation === player).map((a) => ({ ...a, name: w.names[a.loc] })), agentSlots: agentSlots(n),
    colonies: s.colonies.filter((c) => c.nation === player).map((c) => ({ ...c, name: w.names[c.loc] })), colonySlots: colonySlots(n),
    loans: n.loans, history: n.history.slice(-240), modifiers: n.modifiers.filter((m) => m.until < 1e9 || m.id.startsWith('priv_')).map((m) => ({ id: m.id, label: m.label, until: m.until, effects: m.effects })),
    situations: s.situations.map((x) => { const d = SITUATIONS.find((y) => y.id === x.id); return { ...x, name: d?.name, desc: d?.desc, stageName: d?.stages?.[x.stage] }; }),
    constructions: s.constructions.filter((c) => c.nation === player).map((c) => ({ ...c, name: w.names[c.loc], building: BUILDINGS[c.building].name })),
    recruits: s.recruits.filter((r) => r.nation === player).map((r) => ({ ...r, name: w.names[r.loc], unit: UNITS[r.type].name })),
    spies: s.spies.filter((x) => x.nation === player), empire: { emperor: s.empire.emperor, authority: s.empire.authority, electors: s.empire.electors },
    papacy: { holder: s.papacy.holder, favour: s.papacy.curiaFavour[player] ?? 0, schism: s.papacy.schism }, goalsDone: n.goalsDone,
    priceLevel: s.priceLevel, markets: s.markets.map((m) => ({ id: m.id, name: m.name, mine: m.merchants[player] || 0 })),
  };
}

function ledger(s: GameState, w: World, kind: string) {
  if (kind === 'nations') {
    const pop = new Float64Array(s.nations.length), locs = new Int32Array(s.nations.length);
    for (let i = 0; i < w.L; i++) { const o = s.loc.owner[i]; if (o < 0) continue; locs[o]++; for (let c = 0; c < C; c++) pop[o] += s.loc.pop[i * C + c]; }
    const army = new Float64Array(s.nations.length), navy = new Float64Array(s.nations.length);
    for (const a of s.armies) if (!a.rebels) (a.fleet ? navy : army)[a.owner] += armyMen(a);
    return s.nations.filter((n) => n.alive).map((n) => ({ id: n.id, name: n.short, score: n.score, dev: nationDev(s, n.id), locs: locs[n.id], pop: pop[n.id], army: army[n.id], navy: navy[n.id], income: sumObj(n.income), tech: n.tech.reduce((p, x) => p + x, 0), prestige: n.prestige }));
  }
  if (kind === 'markets') return s.markets.map((m) => ({ id: m.id, name: m.name, owner: m.owner, priceIndex: m.priceIndex, top: Array.from({ length: G }, (_, k) => k).sort((a, b) => m.supply[b] * m.price[b] - m.supply[a] * m.price[a]).slice(0, 4).map((k) => GOODS[k].name) }));
  if (kind === 'wars') return warsView(s);
  return null;
}

/** road level per location (0..3), for the map */
export function roadLevels(s: GameState): Uint8Array {
  const bld = s.loc.buildings, L = bld.length / B, out = new Uint8Array(L);
  for (let i = 0; i < L; i++) out[i] = bld[i * B + BI.road];
  return out;
}
