// Builds the initial GameState from the baked map and the researched historical setup.
import type { GameState, Nation, Character, LocState, Market, I18n } from './types';
import { World } from './world';
import { C, CL, B, BI, G, GOODS, GI, RECIPES, RI, TERRAINS, TERRAIN_DEF } from './defs';
import { ALL_CULTURES, FAITH_INDEX, GROUP_OF } from './content/peoples';
import { seedRng, hash01 } from './rng';
import { dateToDay } from './calendar';
import { systems } from './systems';
import { MinHeap } from './minheap';
import { DAY_EPOCH, bump } from './ctx';
import { upkeepCosts, fortPay, sizeStartingFleets } from './systems/military';
import { courtCost, refreshLimits, estimateTradeMonth, forgetWarmup } from './systems/economy';
import { treasurerGraft } from './systems/politics';
import { subjectTribute } from './systems/diplomacy';

export interface SetupState {
  year: number;
  states: any[]; wars: any[];
  owner: number[]; culture: (string | null)[]; faith: (string | null)[]; minority: ([string, string, number] | null)[];
  pop: number[]; density: number[];
}
export interface TradeHub { id: string; name: string; lat: number; lon: number; importance: number; active_from: number; sea: boolean }

export function cultureIndex(c: string | null | undefined): number {
  const i = ALL_CULTURES.indexOf(c || 'unknown');
  return i < 0 ? ALL_CULTURES.indexOf('unknown') : i;
}
export function faithIndex(f: string | null | undefined): number { return FAITH_INDEX[f || 'latin'] ?? 0; }

function hexRgb(h: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
  if (!m) return [128, 128, 128];
  const v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function newLocState(L: number): LocState {
  return {
    owner: new Int16Array(L).fill(-1), ctrl: new Int16Array(L).fill(-1), core: new Int16Array(L).fill(-1),
    culture: new Uint8Array(L), faith: new Uint8Array(L), minCulture: new Uint8Array(L), minFaith: new Uint8Array(L), minShare: new Float32Array(L),
    pop: new Float32Array(L * C), wealth: new Float32Array(L * C), sol: new Float32Array(L * C).fill(0.5), employed: new Float32Array(L * C).fill(1),
    literacy: new Float32Array(L), dev: new Float32Array(L), control: new Float32Array(L), integ: new Float32Array(L), unrest: new Float32Array(L),
    devast: new Float32Array(L), harvest: new Float32Array(L).fill(1), buildings: new Uint8Array(L * B), workshop: new Uint8Array(L * 3), method: new Uint8Array(L),
    garrison: new Float32Array(L), occTimer: new Float32Array(L), plague: new Float32Array(L), market: new Uint8Array(L),
    fortZone: new Int16Array(L).fill(-1), income: new Float32Array(L), snow: new Float32Array(L), colonist: new Int16Array(L).fill(-1),
    migr: new Float32Array(L), migrBal: new Float32Array(L),
  };
}

export function createGame(w: World, setup: SetupState, hubs: TradeHub[], seed = 1356, opts: { player?: number[] } = {}): GameState {
  const L = w.L;
  const startYear = setup.year;
  const s: GameState = {
    v: 1, seed, startYear, day: 0, rng: seedRng(seed), nextId: 1,
    loc: newLocState(L), nations: [], chars: {}, armies: [], battles: [], battleReports: [], sieges: [], wars: [], rel: {}, treaties: [], envoys: [],
    markets: [], flows: [], constructions: [], recruits: [], agents: [], colonies: [], explorers: [], spies: [], explored: {},
    empire: { emperor: -1, electors: [], authority: 30, reforms: [], diet: null, lastElection: 0, members: [] },
    papacy: { holder: -1, seat: -1, antipope: -1, curiaFavour: {}, schism: false, reformPressure: 0, corruption: 30 },
    leagues: [], situations: [], innovations: [], pending: [], chronicle: [], notices: [], ranking: [],
    priceLevel: 1, silverStock: 1, ended: false, flags: {}, playerNations: opts.player ?? [], observer: false, aiDisabled: [], difficulty: 2, timelapse: [],
    victoryKinds: ['score'], victoryHold: {}, autoEvents: [], // polish pass (the save migration gives older saves the same)
  };
  const id = () => s.nextId++;
  // ---------- nations & characters ----------
  const keyIndex: Record<string, number> = {};
  setup.states.forEach((st, i) => { keyIndex[st.id] = i; });
  const mkChar = (c: any, nation: number, role: Character['role']): number => {
    if (!c || !c.name) return 0;
    const cid = id();
    const born = typeof c.born === 'number' ? c.born : startYear - 40;
    const sk = Array.isArray(c.skills) && c.skills.length === 3 ? c.skills.map((v: number) => Math.max(0, Math.min(6, v | 0))) : [2, 2, 2];
    s.chars[cid] = {
      id: cid, name: c.name, dynasty: c.dynasty || '', female: !!c.female, born: dateToDay(born, Math.floor(hash01(cid, 7) * 12), 1 + Math.floor(hash01(cid, 8) * 27), startYear),
      skills: sk as [number, number, number], traits: (c.traits || []).slice(0, 4), nation, alive: true, children: [], health: 1, role,
    };
    return cid;
  };
  setup.states.forEach((st, i) => {
    const capLoc = st.capital_loc > 0 ? st.capital_loc - 1 : -1;
    const n: Nation = {
      id: i, key: st.id, alive: true,
      name: st.name, short: st.short || st.name, adj: st.adjective || st.short || st.name,
      color: hexRgb(st.color), color2: hexRgb(st.color).map((v) => Math.max(0, v - 60)) as any,
      rank: st.rank || 'duchy', gov: st.government || 'feudal_monarchy', culture: cultureIndex(st.culture), faith: faithIndex(st.faith),
      capital: capLoc, coa: st.coa || null,
      ruler: 0, heir: 0, consort: 0, regent: 0, dynasty: st.ruler?.dynasty || '',
      treasury: 0, debt: 0, loans: [], manpower: 0, maxManpower: 0, sailors: 0,
      concord: 20, mandate: 60, authority: 30, prestige: 0, warExhaustion: 0, inflation: 0, corruption: 0.05, adminCapacity: 1, adminLoad: 0, duties: { land: 0, hearth: 0, excise: 0 },
      taxRate: [0.06, 0.06, 0.08, 0.08, 0.02, 0.02, 0.08], tariff: 0.05, coinage: 0,
      income: {}, expense: {}, incomeAcc: {}, expenseAcc: {}, history: [], armyMaint: 1, navyMaint: 1,
      laws: {}, values: [], estates: [], council: {}, generals: [], aiLog: [],
      overlord: -1, subjectType: null, subjectSince: 0, libertyDesire: 0, integration: 0,
      envoys: 2, envoysBusy: 0, rivals: [], dread: 0,
      personality: st.personality || 'opportunist', difficulty: st.difficulty || 3, summary: st.summary || { en: '', de: '' },
      ai: true, tech: [1, 1, 1], techProgress: [0, 0, 0], doctrines: {}, innovations: [], era: 0, goalsDone: [],
      isHRE: !!st.empire_member, elector: !!st.elector, leagueMember: [], excommunicated: false, knows: 0, flags: {}, modifiers: [], score: 0,
      stats: { battlesWon: 0, battlesLost: 0, locsGained: 0, locsLost: 0, warsWon: 0 },
    };
    s.nations.push(n);
    n.ruler = mkChar(st.ruler, i, 'ruler');
    n.heir = mkChar(st.heir, i, 'heir');
    n.consort = mkChar(st.consort, i, 'consort');
    // (an heir who is the ruler's brother or nephew is placed in the house by addFamily below)
    if (n.heir && n.ruler && (!st.heir_rel || st.heir_rel === 'child')) { s.chars[n.heir].father = s.chars[n.ruler].female ? undefined : n.ruler; s.chars[n.ruler].children.push(n.heir); }
    if (n.consort && n.ruler) { s.chars[n.consort].spouse = n.ruler; s.chars[n.ruler].spouse = n.consort; }
    if (!n.ruler) n.ruler = mkChar({ name: n.short.en + ' Council', dynasty: '', skills: [3, 3, 2], born: startYear - 45 }, i, 'ruler');
  });
  // the historical members of the great houses (parents, brothers and sisters, children, grandchildren), after every
  // realm's ruler, heir and consort so that those keep their numbers
  setup.states.forEach((st, i) => { if (Array.isArray(st.family) || st.heir_spouse) addFamily(s, st, i, keyIndex, mkChar); });
  setup.states.forEach((st, i) => {
    const n = s.nations[i];
    if (st.overlord && keyIndex[st.overlord] !== undefined) { n.overlord = keyIndex[st.overlord]; n.subjectType = st.subject_type || 'vassal'; n.subjectSince = -3650; n.integration = 0; }
    n.rivals = (st.rivals || []).map((k: string) => keyIndex[k]).filter((v: number | undefined) => v !== undefined).slice(0, 3);
  });
  // treaties: alliances, claims
  const pairSeen = new Set<string>();
  setup.states.forEach((st, i) => {
    for (const a of st.allies || []) {
      const j = keyIndex[a]; if (j === undefined || j === i) continue;
      const k = i < j ? `${i},${j}` : `${j},${i}`;
      if (pairSeen.has(k)) continue; pairSeen.add(k);
      if (s.nations[i].overlord === j || s.nations[j].overlord === i) continue;
      s.treaties.push({ a: Math.min(i, j), b: Math.max(i, j), type: 'alliance', since: -365, until: 1e9 });
    }
    for (const c of st.claims_on || []) {
      const j = keyIndex[c]; if (j === undefined || j === i) continue;
      s.treaties.push({ a: i, b: j, type: 'claim', since: -365, until: 1e9 });
    }
  });
  // ---------- locations ----------
  const lc = s.loc;
  for (let i = 0; i < L; i++) {
    const o = setup.owner[i];
    lc.owner[i] = o; lc.ctrl[i] = o; lc.core[i] = o;
    lc.culture[i] = cultureIndex(setup.culture[i]);
    lc.faith[i] = faithIndex(setup.faith[i]);
    const m = setup.minority[i];
    if (m) { lc.minCulture[i] = cultureIndex(m[0]); lc.minFaith[i] = faithIndex(m[1]); lc.minShare[i] = Math.min(0.5, m[2]); }
    else { lc.minCulture[i] = lc.culture[i]; lc.minFaith[i] = lc.faith[i]; lc.minShare[i] = 0; }
    // population by class
    const P = Math.max(50, setup.pop[i]);
    const town = w.townSize[i];
    const urban = [0.02, 0.06, 0.12, 0.22, 0.4, 0.6][Math.min(5, town)];
    const shares = new Float64Array(C);
    shares[CL.peasants] = (1 - urban) * 0.86;
    shares[CL.labourers] = (1 - urban) * 0.08 + urban * 0.3;
    shares[CL.artisans] = urban * 0.38 + 0.012;
    shares[CL.burghers] = urban * 0.18 + 0.004;
    shares[CL.clergy] = 0.012 + urban * 0.04;
    shares[CL.nobles] = 0.009 + urban * 0.02;
    shares[CL.wage_workers] = 0;
    let sum = 0; for (let c = 0; c < C; c++) sum += shares[c];
    for (let c = 0; c < C; c++) {
      lc.pop[i * C + c] = P * shares[c] / sum;
      lc.wealth[i * C + c] = [0.3, 0.2, 1.5, 6, 3, 30, 0.5][c];
    }
    lc.literacy[i] = 0.02 + urban * 0.15;
    const terr = TERRAINS[w.terrain[i]];
    lc.dev[i] = Math.max(1, Math.min(40, Math.sqrt(P / 1000) * 2.2 * (terr === 'farmland' ? 1.15 : 1)));
    lc.control[i] = 0.6; lc.integ[i] = o >= 0 ? 1 : 0;
    // buildings
    const isCap = s.nations[o]?.capital === i;
    const bset = (b: string, lv: number) => { lc.buildings[i * B + BI[b]] = Math.max(lc.buildings[i * B + BI[b]], lv); };
    if (town >= 4 || isCap) bset('fort', town >= 5 || isCap ? 2 : 1);
    else if (town >= 3 && hash01(i, 11) < 0.5) bset('fort', 1);
    else if (w.terrain[i] === TERRAINS.indexOf('mountains') && hash01(i, 12) < 0.15 && o >= 0) bset('fort', 1);
    if (town >= 3) bset('market', town >= 5 ? 2 : 1);
    if (town >= 2) bset('workshop', Math.min(4, town - 1));
    if (town >= 3 && w.coastal[i]) bset('port', town >= 4 ? 2 : 1);
    if (town >= 3) bset('church', 1);
    if (isCap) bset('admin', 1);
    if (['silver', 'gold', 'copper', 'iron_ore', 'salt', 'tin'].includes(GOODS[w.resource[i]].id) && hash01(i, 13) < 0.5) bset('mine', 1);
    // workshops: pick sensible recipes by local inputs
    if (town >= 2) {
      const opts = workshopOptions(w, i);
      for (let k = 0; k < Math.min(3, town); k++) lc.workshop[i * 3 + k] = opts[k % opts.length] + 1;
    }
    lc.garrison[i] = lc.buildings[i * B + BI.fort] * 1000;
  }
  // university seats in 1356 (real ones): Paris, Oxford, Cambridge, Bologna, Padua, Salamanca, Montpellier, Toulouse, Prague, Coimbra/Lisbon, Naples, Siena, Perugia, Pisa, Orléans, Valladolid
  for (const nm of ['Paris', 'Oxford', 'Cambridge', 'Bologna', 'Padua', 'Salamanca', 'Montpellier', 'Toulouse', 'Prague', 'Coimbra', 'Naples', 'Siena', 'Perugia', 'Pisa', 'Orléans', 'Valladolid', 'Cairo', 'Fez']) {
    const li = w.names.indexOf(nm);
    if (li >= 0 && li < L) lc.buildings[li * B + BI.university] = 1;
  }
  // ---------- markets ----------
  buildMarkets(s, w, hubs);
  // ---------- explored map ----------
  initKnowledge(s, w);
  // ---------- wars at start ----------
  for (const war of setup.wars) {
    const att = (war.attackers as string[]).map((k) => keyIndex[k]).filter((v) => v !== undefined);
    const def = (war.defenders as string[]).map((k) => keyIndex[k]).filter((v) => v !== undefined);
    if (!att.length || !def.length) continue;
    s.wars.push({
      id: id(), name: war.name || { en: 'War', de: 'Krieg' }, att, def, attLead: att[0], defLead: def[0],
      goal: { type: war.goal === 'throne_claim' ? 'throne' : 'conquest', target: def[0], locs: [] },
      start: dateToDay(Math.max(startYear - 30, war.since || startYear), 0, 1, startYear), score: 0, battleScore: 0, tickScore: 0, battles: 0, lossesA: 0, lossesD: 0, offers: [],
    });
  }
  for (const sys of systems()) sys.init?.(s, w);
  // the inits added laws and modifiers within one simulated day: effect tables cached before them are rebuilt now
  DAY_EPOCH.v++; bump();
  refreshLimits(s, w); // the manpower limit and envoys from the formulas the top bar's breakdowns show, not a seed value
  estimateFirstMonth(s, w);
  return s;
}

/** The first month's recurring costs, estimated at the start with the formulas the month itself will use: tribute to
 *  an overlord, the court, armies, fleets, fortresses and the treasurer's graft. So the ledger, the treasury tooltip
 *  and the forecast show them from the first day; the realm is marked as showing an estimate until its books first
 *  close (systems/economy.ts closeLedger), and the starting treasury is where those books start. */
function estimateFirstMonth(s: GameState, w: World) {
  const live = s.nations.filter((n) => n.alive);
  // trade, company profits and tariffs as the first month's clearing will pay them (the warm-up's fall far short);
  // merchant republics' fleets are sized to that revenue, and as their ships carried part of their trade power, the
  // trade is estimated again with the fleets they keep, until no fleet is cut any more (twice or three times)
  for (let k = 0; k < 4; k++) {
    estimateTradeMonth(s, w);
    if (k === 3 || !sizeStartingFleets(s, w)) break;
    DAY_EPOCH.v++; bump(); // (the day's trade powers were taken with the fleets before)
  }
  forgetWarmup(s);
  for (const n of live) n.expense = {};
  // tribute first: it is part of the overlord's revenue, which the court's cost follows
  for (const n of live) {
    const ov = n.overlord >= 0 ? s.nations[n.overlord] : undefined; const t = subjectTribute(n);
    if (ov?.alive && t > 0.005) { n.expense.tribute = t; ov.income.tribute = (ov.income.tribute || 0) + t; }
  }
  const { army, navy } = upkeepCosts(s, w);
  for (const n of live) {
    const e = n.expense;
    const put = (k: string, v: number) => { if (v > 0.005) e[k] = (e[k] || 0) + v; };
    put('court', courtCost(n));
    put('army', army[n.id]); put('navy', navy[n.id]);
    put('fortresses', fortPay(s, n).pay);
    const tr = s.chars[n.council.treasurer]; if (tr?.alive) put('graft', treasurerGraft(tr, n.income.tax || 0));
    n.flags.ledger_estimate = 1; n.flags.ledger_t = n.treasury; n.flags.ledger_day = s.day;
    // the history's first point (realm.init) shows the same month as the ledger
    const h = n.history[n.history.length - 1];
    if (h && h.day === s.day) { h.income = Object.values(n.income).reduce((a, b) => a + b, 0); h.expense = Object.values(e).reduce((a, b) => a + b, 0); }
  }
}

export function workshopOptions(w: World, i: number): number[] {
  const res = GOODS[w.resource[i]].id;
  const pref: string[] = [];
  const add = (r: string) => { if (!pref.includes(r)) pref.push(r); };
  const byRes: Record<string, string[]> = {
    wool: ['weavery', 'tailor'], flax: ['linen_weavery', 'papermill'], grapes: ['winery'], olives: ['oil_press'], iron_ore: ['smelter', 'smithy', 'armoury'],
    timber: ['joinery', 'shipwright'], livestock: ['tannery'], grain: ['mill', 'brewery', 'bakery'], silk: ['silk_weavery'], cotton: ['cotton_weavery'],
    copper: ['foundry'], silver: ['goldsmith'], gold: ['goldsmith'], sugarcane: ['sugar_mill'], saltpeter: ['powder_mill'], stone: ['glassworks'],
    dyes: ['fine_weavery'], fish: ['shipwright'],
  };
  for (const r of byRes[res] || []) add(r);
  add('mill'); add('bakery'); add('tailor'); add('smithy'); add('brewery'); add('weavery'); add('tannery');
  if (w.coastal[i]) add('shipwright');
  return pref.map((r) => RI[r]);
}

function buildMarkets(s: GameState, w: World, hubs: TradeHub[]) {
  const L = w.L;
  const yr = s.startYear;
  let list = hubs.filter((h) => (h.active_from ?? 0) <= yr + 0);
  if (!list.length) {
    // fallback: largest towns
    const towns = [...Array(L).keys()].filter((i) => w.townSize[i] >= 5);
    list = towns.map((i) => ({ id: w.names[i], name: w.names[i], lat: w.lat[i], lon: w.lon[i], importance: 4, active_from: 0, sea: !!w.coastal[i] }));
  }
  // map hub to nearest location
  const hubLoc = list.map((h) => nearestLoc(w, h.lon, h.lat));
  const uniq: number[] = []; const names: string[] = [];
  hubLoc.forEach((l, k) => { if (l >= 0 && !uniq.includes(l)) { uniq.push(l); names.push(list[k].name); } });
  // multi-source Dijkstra over land + coast/sea edges (sea cheaper)
  const N = w.N;
  const best = new Float64Array(N).fill(Infinity); const mk = new Int16Array(N).fill(-1);
  const heap = new MinHeap();
  uniq.forEach((l, k) => { best[l] = 0; mk[l] = k; heap.push(0, l); });
  while (heap.size) {
    const [d, u] = heap.pop();
    if (d > best[u]) continue;
    for (let e = w.adjStart[u]; e < w.adjStart[u + 1]; e++) {
      const v = w.adj[e];
      const sea = u >= L || v >= L;
      const cost = w.adjKm[e] * (sea ? 0.35 : 1.0);
      const nd = d + cost;
      if (nd < best[v]) { best[v] = nd; mk[v] = mk[u]; heap.push(nd, v); }
    }
  }
  for (let i = 0; i < L; i++) s.loc.market[i] = Math.max(0, mk[i]);
  // markets
  s.markets = uniq.map((hub, k) => {
    const m: Market = {
      id: k, name: names[k], hub, price: new Float64Array(G), supply: new Float64Array(G), demand: new Float64Array(G), stock: new Float64Array(G),
      sAcc: new Float64Array(G), dAcc: new Float64Array(G), hist: new Float32Array(G * 120), histPos: 0, owner: s.loc.owner[hub],
      links: [], flowOut: new Float64Array(G), merchants: {}, priceIndex: 1,
    };
    for (let g = 0; g < G; g++) { m.price[g] = GOODS[g].base; m.stock[g] = 0; }
    return m;
  });
  // links: catchments adjacent over land, or by sea between coastal catchments
  const linkCost = new Map<string, { cost: number; sea: boolean }>();
  for (let u = 0; u < L; u++) {
    for (let e = w.adjStart[u]; e < w.adjStart[u + 1]; e++) {
      const v = w.adj[e];
      let a = s.loc.market[u], b = -1, sea = false;
      if (v < L) b = s.loc.market[v]; else { b = mk[v]; sea = true; }
      if (b < 0 || a === b) continue;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const dist = w.distKm(s.markets[a].hub, s.markets[b].hub);
      const cost = dist * (sea ? 0.0006 : 0.0035);
      const prev = linkCost.get(key);
      if (!prev || prev.cost > cost) linkCost.set(key, { cost, sea });
    }
  }
  // extra sea lanes: coastal hubs within 1800 km sea distance through sea zones
  const coastalHubs = s.markets.filter((m) => w.coastal[m.hub]);
  for (let i1 = 0; i1 < coastalHubs.length; i1++) for (let j1 = i1 + 1; j1 < coastalHubs.length; j1++) {
    const a = coastalHubs[i1], b = coastalHubs[j1];
    const d = w.distKm(a.hub, b.hub);
    if (d > 1600) continue;
    const key = `${Math.min(a.id, b.id)},${Math.max(a.id, b.id)}`;
    const cost = d * 1.25 * 0.0006;
    const prev = linkCost.get(key);
    if (!prev || prev.cost > cost) linkCost.set(key, { cost, sea: true });
  }
  // the two shores of the Atlantic: no regular traffic until someone has made the crossing
  const side = (m: Market) => (w.lon[m.hub] < -30 ? 1 : 0);
  for (const [k, v] of linkCost) {
    const [a, b] = k.split(',').map(Number);
    const ocean = v.sea && side(s.markets[a]) !== side(s.markets[b]);
    s.markets[a].links.push({ to: b, cost: v.cost, sea: v.sea, ...(ocean ? { ocean: true } : {}) });
    s.markets[b].links.push({ to: a, cost: v.cost, sea: v.sea, ...(ocean ? { ocean: true } : {}) });
  }
}

export function nearestLoc(w: World, lon: number, lat: number, landOnly = true): number {
  let best = -1, bd = Infinity;
  const n = landOnly ? w.L : w.N;
  for (let i = 0; i < n; i++) {
    const dx = (w.lon[i] - lon) * Math.cos(lat * Math.PI / 180), dy = w.lat[i] - lat;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** Knowledge groups: which parts of the world a culture sphere knew in 1356. */
export const KNOWLEDGE_GROUPS = ['latin_europe', 'orthodox_east', 'islamic', 'steppe', 'sub_saharan', 'americas'];
function initKnowledge(s: GameState, w: World) {
  const N = w.N;
  for (let gi = 0; gi < KNOWLEDGE_GROUPS.length; gi++) s.explored[gi] = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const lon = w.lon[i], lat = w.lat[i];
    const europe = lon > -28 && lon < 62 && lat > 33 && lat < 72;
    const med = lon > -18 && lon < 60 && lat > 24 && lat < 46;
    const mena = lon > -18 && lon < 70 && lat > 10 && lat < 45;
    const steppe = lon > 20 && lon < 70 && lat > 35 && lat < 62;
    const sahel = lon > -18 && lon < 52 && lat > -12 && lat < 32;
    const americas = lon < -30;
    const atlanticIsl = lon < -13 && lon > -32 && lat > 27 && lat < 40; // Azores/Madeira/Canaries partly known
    if (europe || med || (lon > -18 && lon < -5 && lat > 27 && lat < 36)) s.explored[0][i] = 1;
    if (europe && lon > 5 || mena && lat > 28 || steppe) s.explored[1][i] = 1;
    if (mena || med || (sahel && lat > 8) || (lon > 30 && lat > -12 && lon < 70)) s.explored[2][i] = 1;
    if (steppe || (lon > 15 && lat > 40 && lat < 66) || (mena && lon > 30)) s.explored[3][i] = 1;
    if (sahel || (lat < 15 && lat > -38 && lon > -20)) s.explored[4][i] = 1;
    if (americas && lon < -30) s.explored[5][i] = 1;
    if (atlanticIsl && lat < 30) s.explored[0][i] = 1;
  }
  // local knowledge for American peoples is regional: limit to ~2500 km of their capital (handled by nation.knows=5 → full Americas; acceptable)
  for (const n of s.nations) {
    const fam = n.faith;
    const cap = n.capital >= 0 ? n.capital : 0;
    const lon = w.lon[cap], lat = w.lat[cap];
    if (lon < -30) n.knows = 5;
    else if (lat < 16 && lon > -20) n.knows = 4;
    else if (GROUP_OF[ALL_CULTURES[n.culture]] === 'turkic' && lon > 40 || GROUP_OF[ALL_CULTURES[n.culture]] === 'mongolic') n.knows = 3;
    else if (n.faith === FAITH_INDEX.sunni || n.faith === FAITH_INDEX.shia || n.faith === FAITH_INDEX.ibadi) n.knows = 2;
    else if (n.faith === FAITH_INDEX.orthodox || n.faith === FAITH_INDEX.armenian_apostolic) n.knows = 1;
    else n.knows = 0;
    void fam;
  }
}

export { MinHeap };
export { TERRAIN_DEF };
export type { I18n };

/** The house of a realm as researched for the start (data/history/<year>/*.json "family"): the late or living parents
 *  of the ruler, brothers and sisters, children (by the consort or an earlier wife) and grandchildren, nephews and
 *  nieces, with their husbands and wives. An heir who is a brother ("heir_rel": "sibling") or a nephew is placed as
 *  such; a member married abroad ("at") lives at that court with a claim on this throne. */
function addFamily(s: GameState, st: any, i: number, keyIndex: Record<string, number>, mkChar: (c: any, nation: number, role: Character['role']) => number) {
  const n = s.nations[i];
  const r = s.chars[n.ruler]; if (!r) return;
  const byName = new Map<string, Character>();
  const year = (y: number, cid: number) => dateToDay(y, Math.floor(hash01(cid, 9) * 12), 1 + Math.floor(hash01(cid, 10) * 27), s.startYear);
  const make = (e: any, nation: number): Character => {
    const skills = Array.isArray(e.skills) ? e.skills : undefined;
    const c = s.chars[mkChar({ ...e, skills }, nation, 'courtier')];
    if (!skills) c.skills = [0, 1, 2].map((k) => 1 + Math.floor(hash01(c.id, 20 + k) * 4)) as [number, number, number];
    if (typeof e.died === 'number') { c.alive = false; c.died = Math.min(-1, year(e.died, c.id)); }
    return c;
  };
  const link = (child: Character, a: Character | undefined, b?: Character) => {
    for (const p of [a, b]) {
      if (!p) continue;
      if (p.female) child.mother = p.id; else child.father = p.id;
      if (!p.children.includes(child.id)) p.children.push(child.id);
    }
  };
  const wed = (a: Character, b: Character) => { a.spouse = b.id; b.spouse = a.id; };
  // a person who already rules, is heir or consort of a realm ("ref": "sweden.ruler"): Haakon VI of Norway is the son
  // of Magnus Eriksson, king of Sweden, and the brother of Sweden's heir
  const refChar = (ref: unknown): Character | undefined => {
    if (typeof ref !== 'string') return undefined;
    const [k, role] = ref.split('.'); const X = s.nations[keyIndex[k] ?? -1];
    return X && (role === 'ruler' || role === 'heir' || role === 'consort') ? s.chars[X[role]] : undefined;
  };
  const fam: any[] = Array.isArray(st.family) ? st.family : [];
  // parents first: the ruler (and an heir who is a brother) are their children
  const parents = fam.filter((e) => e.rel === 'parent').map((e) => refChar(e.ref) ?? make(e, i)).filter((c) => { if (c) byName.set(c.name, c); return !!c; });
  const father = parents.find((p) => !p.female), mother = parents.find((p) => p.female);
  if (father && mother) wed(father, mother);
  link(r, father, mother);
  const h = s.chars[n.heir];
  if (h) byName.set('heir', h);
  if (h && st.heir_rel === 'sibling') link(h, father, mother);
  if (h && st.heir_spouse) wed(h, make(st.heir_spouse, i));
  for (const e of fam) {
    if (e.rel === 'parent') continue;
    const known = refChar(e.ref);
    if (e.ref && !known) continue;
    const at = known ? known.nation : typeof e.at === 'string' && keyIndex[e.at] !== undefined ? keyIndex[e.at] : i;
    const c = known ?? make(e, at);
    byName.set(c.name, c);
    if (at !== i) c.claims = [...new Set([...(c.claims ?? []), i])]; // living at another court: a claim on this throne
    if (e.rel === 'sibling') link(c, father, e.of_consort === false ? undefined : mother); // (a half-brother or -sister by the father)
    else if (e.rel === 'child') link(c, r, e.of_consort === false ? undefined : s.chars[n.consort]);
    else {
      const p = byName.get(e.parent ?? '') ?? (e.parent === 'heir' ? h : undefined);
      if (p) link(c, p, p.spouse ? s.chars[p.spouse] : undefined);
    }
    if (e.spouse) wed(c, make(e.spouse, at));
  }
  // an heir who is a nephew: the child of a brother or sister named in the family
  if (h && st.heir_rel === 'nephew' && st.heir_parent) { const p = byName.get(st.heir_parent); if (p) link(h, p, p.spouse ? s.chars[p.spouse] : undefined); }
}
