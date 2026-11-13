// Trading ventures: a realm's merchant houses buy one good in one market and sell it in another, along the cheapest
// chain of market links. Each venture takes loads of the realm's cargo space (Frachtraum); a load is a cartload of bulk
// goods or a few bales of fine ones (the good's carriage weight, economy.ts WEIGHT). What it carries is bounded by its
// loads, by what the source market has to spare and by what the destination will take; it is bought at the source's
// price and sold at the destination's, less carriage along every link, handling and the destination ruler's tariff.
// The goods really move: they leave the source's supply and join the destination's before the month's prices form,
// so a venture narrows the price gap it lives on. The crown takes a tenth of the profit, the rest is the merchant
// houses' own. The local peddling between neighbouring markets (economy.ts tradeLink) goes on beneath it.
import type { GameState, Nation, Market, Venture, VentureBound } from '../types';
import type { World } from '../world';
import { addIncome, atWar } from '../ctx';
import { B, BI, G, GOODS, UNITS } from '../defs';
import { lawEffect } from './politics';
import { WEIGHT, tradeBlocked } from './economy';
import { merchantCap, merchantRefusal, marketPath, tariffBetween, embargoBetween, homeMarket, merchantWeight, landTable } from './trade';
import { ownedLocs } from './war';

/** Share of a venture's profit that reaches the treasury as the crown's stake and dues (the rest is the merchant
 *  houses' own living, as with the peddlers' margins). */
export const VENTURE_CROWN = 0.1;
/** Organised long-distance carriage is cheaper than the peddlers' (a factor on the links' carriage). */
export const VENTURE_CARRIAGE = 0.8;
/** Handling at both ends, as a share of the buying price. */
export const VENTURE_HANDLING = 0.04;
/** What a source market can spare: its supply less this share of its own demand. */
export const SOURCE_KEEP = 0.7;
/** At most this share of a market's spare supply leaves it in all ventures together in a month. */
export const SOURCE_SHARE = 0.6;
/** A destination takes its unmet demand and this share of its demand besides (goods from afar crowd out local ones). */
export const DEST_EXTRA = 0.3;
/** The longest venture in market links. */
export const MAX_VENTURE_HOPS = 8;
/** Cargo space: per merchant the realm may send (times the weight of its merchants, trade.ts merchantWeight: a petty
 *  lordship's merchant is a pedlar), per harbour and market hall level, per ship's cargo. */
export const LOADS_PER_MERCHANT = 120, LOADS_PER_PORT = 20, LOADS_PER_HALL = 12, CARGO_PER_LOAD = 25;
/** Months a venture may idle before the AI closes it. */
export const IDLE_CLOSE = 3;

const ventures = (s: GameState) => (s.ventures ??= []);
export const venturesOf = (s: GameState, nid: number) => (s.ventures ?? []).filter((v) => v.n === nid);
/** How many ventures a realm may run at once: one more than its merchants. */
export function ventureSlots(n: Nation): number { return merchantCap(n) + 1; }

/** A realm's cargo space in loads a month, with its parts (keys for the breakdown). */
export function cargoSpace(s: GameState, w: World, n: Nation): { total: number; parts: [string, number][]; mult: number } {
  let ports = 0, halls = 0;
  for (const l of ownedLocs(s, n.id)) {
    if (w.coastal[l]) ports += s.loc.buildings[l * B + BI.port];
    halls += s.loc.buildings[l * B + BI.market];
  }
  let cargo = 0;
  for (const a of s.armies) {
    if (a.owner !== n.id || !a.fleet || a.rebels) continue;
    for (const r of a.regs) { const sea = UNITS[r.type]?.sea; if (sea && !sea.galley && sea.cargo >= 300) cargo += r.men * sea.cargo; }
  }
  const parts: [string, number][] = [
    ['vx_merchants', LOADS_PER_MERCHANT * merchantCap(n) * merchantWeight(landTable(s, w).dev[n.id] ?? 0, n.gov === 'merchant_republic')],
    ['vx_ports', LOADS_PER_PORT * ports],
    ['vx_halls', LOADS_PER_HALL * halls],
    ['vx_ships', cargo / CARGO_PER_LOAD],
  ];
  const mult = Math.max(0.2, 1 + lawEffect(n, 'trade')) * (n.gov === 'merchant_republic' ? 1.5 : 1);
  const raw = parts.reduce((p, x) => p + x[1], 0);
  return { total: raw * mult, parts, mult };
}
export function loadsUsed(s: GameState, nid: number, except?: Venture): number {
  let k = 0; for (const v of s.ventures ?? []) if (v.n === nid && v !== except) k += v.loads; return k;
}

/** The fixed terms of carrying good g from market a to b for realm nid: the way, carriage and handling per unit at
 *  the given prices, the destination's tariff rate and how much of the trade war, blockade and embargo let through. */
export interface VentureTerms { path: number[]; carriage: number; handling: number; tariff: number; blocked: number; sea: boolean }
/** The terms of a route that do not depend on the good: the way, the summed cost of its links, the tariff rate and
 *  what war, blockade and embargo let through. */
export interface RouteTerms { path: number[]; cost: number; tariff: number; blocked: number; sea: boolean }
export function routeTerms(s: GameState, nid: number, a: number, b: number): RouteTerms | null {
  const ms = s.markets; if (a === b || !ms[a] || !ms[b]) return null;
  const path = marketPath(s, a, b); if (!path || !path.length || path.length > MAX_VENTURE_HOPS) return null;
  let cost = 0, blocked = 0, sea = false, prev = ms[a];
  for (const m of path) {
    const next = ms[m]; const lk = prev.links.find((x) => x.to === m); if (!lk) return null;
    cost += lk.cost;
    if (lk.sea) sea = true;
    blocked = Math.max(blocked, tradeBlocked(s, prev, next, lk.sea));
    prev = next;
  }
  const fo = ms[a].owner, to = ms[b].owner;
  for (const o of [fo, to]) if (o >= 0 && o !== nid && (atWar(s, nid, o) || embargoBetween(s, nid, o))) blocked = 1;
  const tariff = to >= 0 && to !== nid ? tariffBetween(s, to, nid) : 0;
  return { path, cost, tariff, blocked, sea };
}
/** Carriage of one unit of good g over links of this summed cost (the peddlers' rate of tradeLink, cheaper). */
export function carriageOf(cost: number, g: number): number { const W = WEIGHT[g]; return cost * W * (0.5 + 3.5 * (1 - W)) * VENTURE_CARRIAGE; }
export function ventureTerms(s: GameState, nid: number, a: number, b: number, g: number, pa: number, rt: RouteTerms | null = routeTerms(s, nid, a, b)): VentureTerms | null {
  if (!rt) return null;
  return { path: rt.path, carriage: carriageOf(rt.cost, g), handling: VENTURE_HANDLING * pa, tariff: rt.tariff, blocked: rt.blocked, sea: rt.sea };
}

/** Why a realm cannot run this venture (null: it can). Both markets must be open to its merchants (merchantRefusal). */
export function ventureRefusal(s: GameState, w: World, n: Nation, a: number, b: number, g: number): string | null {
  if (!Number.isInteger(g) || g < 0 || g >= G) return 'unknown good';
  if (!s.markets[a] || !s.markets[b]) return 'no such market';
  if (a === b) return 'the same market';
  const ra = merchantRefusal(s, w, n, a); if (ra) return ra;
  const rb = merchantRefusal(s, w, n, b); if (rb) return rb;
  const path = marketPath(s, a, b);
  if (!path) return 'no trade route';
  if (path.length > MAX_VENTURE_HOPS) return 'the route is too long';
  return null;
}

export interface VentureEstimate {
  qty: number; buy: number; sell: number; carriage: number; handling: number; tariff: number; margin: number;
  profit: number; crown: number; tolls: number; bound: VentureBound; loadsNeeded: number; hops: number; sea: boolean;
}
/** What a venture with these loads would carry and earn a month, on last month's prices, supply and demand (the others
 *  of our ventures on the same good and market taken as they ran). The figures the panel and the AI decide by. */
/** What all ventures took from each market and brought to it last month, per market and good (key market * G + good). */
export interface VentureIndex { took: Map<number, number>; brought: Map<number, number> }
export function ventureIndex(s: GameState): VentureIndex {
  const took = new Map<number, number>(), brought = new Map<number, number>();
  for (const v of s.ventures ?? []) {
    const q = v.qty ?? 0; if (q <= 0) continue;
    took.set(v.from * G + v.good, (took.get(v.from * G + v.good) ?? 0) + q);
    brought.set(v.to * G + v.good, (brought.get(v.to * G + v.good) ?? 0) + q);
  }
  return { took, brought };
}
export function ventureEstimate(s: GameState, n: Nation, a: number, b: number, g: number, loads: number, self?: Venture, idx: VentureIndex = ventureIndex(s), rt?: RouteTerms | null): VentureEstimate | null {
  const A = s.markets[a], Bm = s.markets[b]; if (!A || !Bm) return null;
  const pa = A.price[g], pb = Bm.price[g];
  const tm = ventureTerms(s, n.id, a, b, g, pa, rt === undefined ? routeTerms(s, n.id, a, b) : rt); if (!tm) return null;
  const W = WEIGHT[g];
  // what others' ventures already took from the source and brought to the destination last month
  const own = self && self.good === g ? self.qty ?? 0 : 0;
  const took = (idx.took.get(a * G + g) ?? 0) - (self?.from === a ? own : 0), brought = (idx.brought.get(b * G + g) ?? 0) - (self?.to === b ? own : 0);
  const spare = Math.max(0, (A.supply[g] - A.demand[g] * SOURCE_KEEP) * SOURCE_SHARE - took);
  const absorb = Math.max(0, Math.max(0, Bm.demand[g] - Bm.supply[g]) + Bm.demand[g] * DEST_EXTRA - brought);
  const tariffPU = pa * tm.tariff;
  const margin = pb - pa - tm.carriage - tm.handling - tariffPU;
  const cap = loads / W;
  let qty = Math.min(cap, spare, absorb) * (1 - tm.blocked);
  let bound: VentureBound = tm.blocked >= 1 ? 'blocked' : cap <= spare && cap <= absorb ? 'loads' : spare <= absorb ? 'supply' : 'demand';
  if (margin <= 0) { qty = 0; bound = 'margin'; }
  const profit = Math.max(0, qty * margin);
  return {
    qty, buy: pa, sell: pb, carriage: tm.carriage, handling: tm.handling, tariff: tariffPU, margin, profit, crown: profit * VENTURE_CROWN,
    tolls: qty * tariffPU, bound, loadsNeeded: Math.min(spare, absorb) * W, hops: tm.path.length, sea: tm.sea,
  };
}

/** Open, resize or close (loads 0) a venture. */
export function setVenture(s: GameState, w: World, n: Nation, a: number, b: number, g: number, loads: number): string | null {
  const vs = ventures(s);
  const cur = vs.find((v) => v.n === n.id && v.from === a && v.to === b && v.good === g);
  const k = Math.max(0, Math.round(Number(loads) || 0));
  if (!k) { if (!cur) return 'no such venture'; vs.splice(vs.indexOf(cur), 1); return null; }
  const why = ventureRefusal(s, w, n, a, b, g); if (why) return why;
  if (!cur && venturesOf(s, n.id).length >= ventureSlots(n)) return 'no free venture';
  if (k > cargoSpace(s, w, n).total - loadsUsed(s, n.id, cur) + 1e-6) return 'not enough cargo space';
  if (cur) cur.loads = k;
  else vs.push({ n: n.id, good: g, from: a, to: b, loads: k, since: s.day });
  return null;
}

/** A realm's ventures lost with it, and those its merchants may no longer run (a market lost, an embargo, an expulsion). */
export function pruneVentures(s: GameState, w: World) {
  const vs = s.ventures; if (!vs?.length) return;
  s.ventures = vs.filter((v) => { const n = s.nations[v.n]; return !!n?.alive && !ventureRefusal(s, w, n, v.from, v.to, v.good); });
}

/** The month's ventures, run inside the clearing of the markets (economy.ts clearMarkets) on this month's goods and
 *  last month's prices: goods leave the source and reach the destination, profits and tolls are paid. */
export function runVentures(s: GameState, w: World, flows: GameState['flows'], shareTolls: (m: Market, v: number) => void) {
  const vs = s.ventures; if (!vs?.length) return;
  const ms = s.markets;
  const took = new Map<number, number>(), brought = new Map<number, number>(); // key market * G + good
  // in order of realm and age, so that no realm is first by chance
  const order = vs.map((v, k) => k).sort((x, y) => vs[x].n - vs[y].n || vs[x].since - vs[y].since || x - y);
  for (const k of order) {
    const v = vs[k], n = s.nations[v.n];
    v.qty = 0; v.profit = 0; v.crown = 0; v.tolls = 0;
    const A = ms[v.from], Bm = ms[v.to];
    if (!n?.alive || !A || !Bm) { v.bound = 'blocked'; v.idle = (v.idle ?? 0) + 1; continue; }
    const g = v.good, pa = A.price[g], pb = Bm.price[g], W = WEIGHT[g];
    const tm = ventureTerms(s, v.n, v.from, v.to, g, pa);
    if (!tm) { v.bound = 'blocked'; v.idle = (v.idle ?? 0) + 1; continue; }
    const tariffPU = pa * tm.tariff;
    const margin = pb - pa - tm.carriage - tm.handling - tariffPU;
    v.margin = margin;
    const ka = v.from * G + g, kb = v.to * G + g;
    const spare = Math.max(0, (A.sAcc[g] - A.dAcc[g] * SOURCE_KEEP) * SOURCE_SHARE - (took.get(ka) ?? 0));
    const absorb = Math.max(0, Math.max(0, Bm.dAcc[g] - Bm.sAcc[g]) + Bm.dAcc[g] * DEST_EXTRA - (brought.get(kb) ?? 0));
    const cap = v.loads / W;
    let qty = Math.min(cap, spare, absorb) * (1 - tm.blocked);
    v.bound = tm.blocked >= 1 ? 'blocked' : cap <= spare && cap <= absorb ? 'loads' : spare <= absorb ? 'supply' : 'demand';
    if (margin <= 0) { qty = 0; v.bound = 'margin'; }
    if (qty <= 1e-6) { v.idle = (v.idle ?? 0) + 1; continue; }
    v.idle = 0;
    took.set(ka, (took.get(ka) ?? 0) + qty); brought.set(kb, (brought.get(kb) ?? 0) + qty);
    A.sAcc[g] -= qty; Bm.sAcc[g] += qty;
    A.flowOut[g] += qty; Bm.flowOut[g] -= qty;
    flows.push({ from: v.from, to: v.to, good: g, qty, value: qty * pa, venture: v.n });
    const profit = qty * margin, crown = profit * VENTURE_CROWN;
    v.qty = qty; v.profit = profit; v.crown = crown; v.tolls = qty * tariffPU;
    addIncome(n, 'ventures', crown);
    if (v.tolls > 0) shareTolls(Bm, v.tolls);
  }
}

/** The best ventures a realm could open, by estimated profit for the given loads (default: all its free cargo space,
 *  at least one merchant's worth): source and destination among the given markets (default: every market open to its
 *  merchants). Each pair of markets and good once; at most `limit`. */
export function ventureOptions(s: GameState, w: World, n: Nation, opts: { loads?: number; markets?: number[]; limit?: number; goods?: number[] } = {}): ({ from: number; to: number; good: number; loads: number } & VentureEstimate)[] {
  const free = Math.max(0, cargoSpace(s, w, n).total - loadsUsed(s, n.id));
  const loads = opts.loads ?? Math.max(free, LOADS_PER_MERCHANT);
  const mk = (opts.markets ?? s.markets.map((m) => m.id)).filter((m) => !merchantRefusal(s, w, n, m));
  const have = new Set(venturesOf(s, n.id).map((v) => `${v.from},${v.to},${v.good}`));
  const goods = opts.goods ?? GOODS.map((_, g) => g);
  const idx = ventureIndex(s);
  const out: ({ from: number; to: number; good: number; loads: number } & VentureEstimate)[] = [];
  for (const a of mk) for (const b of mk) {
    if (a === b) continue;
    const A = s.markets[a], Bm = s.markets[b];
    let rt: RouteTerms | null | undefined;
    for (const g of goods) {
      // a quick look before the route: the gap must be there and the source must have some to spare
      if (Bm.price[g] <= A.price[g] * (1 + VENTURE_HANDLING) || A.supply[g] <= A.demand[g] * SOURCE_KEEP) continue;
      if (have.has(`${a},${b},${g}`)) continue;
      if (rt === undefined) rt = routeTerms(s, n.id, a, b);
      if (!rt || rt.blocked >= 1) break;
      // the margin before anything else: carriage, handling and tariff must leave something
      if (Bm.price[g] - A.price[g] * (1 + VENTURE_HANDLING + rt.tariff) - carriageOf(rt.cost, g) <= 0) continue;
      const e = ventureEstimate(s, n, a, b, g, loads, undefined, idx, rt);
      if (!e || e.profit <= 0) continue;
      // no more loads than the markets bear
      out.push({ ...e, from: a, to: b, good: g, loads: Math.max(1, Math.ceil(Math.min(loads, e.loadsNeeded))) });
    }
  }
  out.sort((x, y) => y.profit - x.profit || x.from - y.from || x.to - y.to || x.good - y.good);
  return out.slice(0, opts.limit ?? 12);
}

/** The home market and the markets the AI looks at for ventures: home, where it holds land, and where its merchants are. */
export function ventureMarkets(s: GameState, w: World, n: Nation, extra: number[] = []): number[] {
  const set = new Set<number>(extra);
  const home = homeMarket(s, n); if (home >= 0) set.add(home);
  for (const l of ownedLocs(s, n.id)) set.add(s.loc.market[l]);
  for (const m of s.markets) if (m.merchants[n.id]) set.add(m.id);
  return [...set].filter((m) => m >= 0).sort((a, b) => a - b);
}

