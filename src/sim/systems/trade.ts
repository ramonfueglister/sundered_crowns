// Trade power: who takes the trade income of a market (spec points 47, 48, 54).
// Every month each market earns the margins of the goods it exports (its trade value). The realms with trade power
// there share it in proportion to their power: land in the market's area (development), the hub, harbours and market
// halls, merchants sent there, light ships in its waters and a chartered company. Trade effects of laws, values and
// modifiers raise a realm's power everywhere. A realm whose merchants steer the trade sends its share along the market
// routes to its home market instead (a fifth more arrives, less a little for every further market on the way), where
// the realms that collect there share it. An embargo between a realm and the hub's ruler shuts the realm out.
// Everything here is a pure function of the state; the tables are cached per simulated day or per command.
import type { GameState, Market, Nation } from '../types';
import type { World } from '../world';
import { DAY_EPOCH, EPOCH, clamp, hasTreaty, addIncome } from '../ctx';
import { B, BI, UNITS } from '../defs';
import { lawEffect } from './politics';
import { ownedLocs } from './war';

/** Power of the hub's ruler: half the base power of the market. */
export const HUB_SHARE = 0.5;
/** Each harbour level in the area and each level of a market hall. */
export const PORT_POWER = 10, MARKET_POWER = 6;
/** A merchant: a fifth of the market's base power, times the weight of the realm behind him. */
export const MERCHANT_SHARE = 0.2;
/** Development at which a realm's merchants weigh fully (small realms down to a twentieth); a merchant republic's
 *  merchants weigh half as much again of the full weight. */
export const MERCHANT_DEV = 600, MERCHANT_MIN_WEIGHT = 0.05, REPUBLIC_WEIGHT = 0.5;
/** All merchants in a market together weigh at most as much as its base power: beyond that each counts for less. */
export const MERCHANT_CROWD = 1;
/** A light ship in the market's waters: 2 % of its base power; all ships of a realm together at most 40 %. */
export const SHIP_SHARE = 0.02, SHIP_CAP = 0.4;
/** A chartered company: two merchants' worth in its market. */
export const COMPANY_SHARE = 0.4;
/** Merchants of a realm with a trade agreement with the hub's ruler weigh a quarter more. */
export const AGREEMENT_BONUS = 0.25;
/** Steered trade: a fifth more arrives at home, less 5 % for each market after the first on the way; at most 6 links. */
export const STEER_BONUS = 0.2, HOP_LOSS = 0.05, MAX_HOPS = 6;
/** A trade agreement halves the tariffs between the partners and lets a quarter more goods pass between their markets. */
export const AGREEMENT_TARIFF = 0.5, AGREEMENT_VOLUME = 1.25;

export const oceanOpen = (s: GameState) => !!(s.flags.ocean_open || s.flags.west_route_found);
export const homeMarket = (s: GameState, n: Nation | undefined) => (n && n.capital >= 0 ? s.loc.market[n.capital] ?? -1 : -1);

// ---------------- embargo and tariffs ----------------
// The embargoes live in s.flags as embargo_<a>_<b>; the index of them is rebuilt per command (only commands set them).
let EI: { s: GameState | null; e: number; set: Set<number> } = { s: null, e: -1, set: new Set() };
function embargoIndex(s: GameState): Set<number> {
  if (EI.s === s && EI.e === EPOCH.v) return EI.set;
  const set = new Set<number>();
  for (const k in s.flags) {
    if (k.charCodeAt(0) !== 101 || !k.startsWith('embargo_') || !s.flags[k]) continue;
    const [, a, b] = k.split('_'); set.add(+a * 65536 + +b);
  }
  EI = { s, e: EPOCH.v, set }; return set;
}
/** a has declared an embargo on b (the war track can read this as a cause for a trade war). */
export function embargoedBy(s: GameState, a: number, b: number): boolean { return a !== b && a >= 0 && b >= 0 && embargoIndex(s).has(a * 65536 + b); }
/** An embargo in either direction between a and b. */
export function embargoBetween(s: GameState, a: number, b: number): boolean { return embargoedBy(s, a, b) || embargoedBy(s, b, a); }
/** Drop the merchants, their steering and the embargoes of every realm `gone` says (by either party); the embargo index
 *  is rebuilt on its next use. */
function dropTrade(s: GameState, gone: (n: number) => boolean): void {
  for (const m of s.markets) {
    for (const k of Object.keys(m.merchants)) if (gone(+k)) delete m.merchants[k as any];
    if (m.steer) for (const k of Object.keys(m.steer)) if (gone(+k)) delete m.steer[k as any];
  }
  let changed = false;
  for (const k of Object.keys(s.flags)) {
    if (k.charCodeAt(0) !== 101 || !k.startsWith('embargo_')) continue;
    const [, a, b] = k.split('_');
    if (gone(+a) || gone(+b)) { delete s.flags[k]; changed = true; }
  }
  if (changed) EI.e = -1;
}
/** A realm that falls (or is brought back) keeps no merchants, steering or embargoes of before. */
export function forgetTrade(s: GameState, id: number): void { dropTrade(s, (n) => n === id); }
/** Monthly: clear what fallen realms left in the markets and their embargoes (so merchant slots and the embargo's
 *  opinion and cause for war do not outlive them). */
export function clearFallenTrade(s: GameState): void { dropTrade(s, (n) => !s.nations[n]?.alive); }
/** Tariff the importing market's ruler takes on goods from the exporting market's ruler: his tariff, halved for a
 *  partner of a trade agreement. */
export function tariffBetween(s: GameState, importer: number, exporter: number): number {
  const n = s.nations[importer]; if (!n) return 0;
  const t = n.tariff ?? 0;
  return importer !== exporter && exporter >= 0 && hasTreaty(s, importer, exporter, 'trade') ? t * AGREEMENT_TARIFF : t;
}

// ---------------- routes between markets ----------------
interface Routes { ocean: boolean; M: number; next: Int16Array; hops: Uint8Array; cost: Float32Array }
const ROUTES = new WeakMap<Market[], Routes>();
/** Cheapest market route between every pair (the next market on the way and the number of links); ocean links count
 *  once the far shore is reached. Depends only on the static links and that flag. */
export function routes(s: GameState): Routes {
  const ocean = oceanOpen(s), ms = s.markets, M = ms.length;
  const c = ROUTES.get(ms); if (c && c.ocean === ocean && c.M === M) return c;
  const next = new Int16Array(M * M).fill(-1), hops = new Uint8Array(M * M).fill(255), cost = new Float32Array(M * M).fill(Infinity);
  const dist = new Float64Array(M), first = new Int16Array(M), hp = new Uint8Array(M), done = new Uint8Array(M);
  for (let src = 0; src < M; src++) {
    dist.fill(Infinity); first.fill(-1); hp.fill(255); done.fill(0);
    dist[src] = 0; hp[src] = 0;
    for (;;) {
      let u = -1, bd = Infinity;
      for (let k = 0; k < M; k++) if (!done[k] && dist[k] < bd) { bd = dist[k]; u = k; }
      if (u < 0) break;
      done[u] = 1;
      for (const lk of ms[u].links) {
        if (lk.ocean && !ocean) continue;
        const v = lk.to, nd = bd + lk.cost + 0.01;
        if (nd < dist[v]) { dist[v] = nd; first[v] = u === src ? v : first[u]; hp[v] = Math.min(254, hp[u] + 1); }
      }
    }
    for (let d = 0; d < M; d++) { next[src * M + d] = first[d]; hops[src * M + d] = hp[d]; cost[src * M + d] = dist[d]; }
  }
  const r = { ocean, M, next, hops, cost }; ROUTES.set(ms, r); return r;
}
/** The markets on the way from a to b (without a, with b), or null when there is no route. */
export function marketPath(s: GameState, a: number, b: number): number[] | null {
  if (a === b) return [];
  const r = routes(s); const out: number[] = []; let c = a, g = 0;
  while (c !== b && g++ < 64) { const nx = r.next[c * r.M + b]; if (nx < 0) return null; out.push(nx); c = nx; }
  return c === b ? out : null;
}
/** Where a realm's steered trade from market m goes: its home market, the number of links and the factor that arrives. */
export function steerRoute(s: GameState, nid: number, m: number): { dest: number; hops: number; factor: number } | null {
  const home = homeMarket(s, s.nations[nid]); if (home < 0 || home === m) return null;
  const r = routes(s); const h = r.hops[m * r.M + home];
  if (h === 255 || h > MAX_HOPS) return null;
  return { dest: home, hops: h, factor: steerFactor(h) };
}
export const steerFactor = (hops: number) => (1 + STEER_BONUS) * Math.pow(1 - HOP_LOSS, Math.max(0, hops - 1));

// ---------------- static geography: the waters of each market ----------------
interface Waters { seas: number[][]; byMarket: number[][] }
const WATERS = new WeakMap<Uint8Array, Waters>();
/** Sea zones bordering the coast of each market's area (and for each sea zone the markets it borders). */
export function marketWaters(s: GameState, w: World): Waters {
  const key = s.loc.market; const c = WATERS.get(key); if (c) return c;
  const seas: number[][] = Array.from({ length: w.S }, () => []), byMarket: number[][] = s.markets.map(() => []);
  for (let j = w.L; j < w.N; j++) {
    const set = new Set<number>();
    for (let e = w.adjStart[j]; e < w.adjStart[j + 1]; e++) { const v = w.adj[e]; if (v < w.L) set.add(s.loc.market[v]); }
    const list = [...set].sort((a, b) => a - b); seas[j - w.L] = list;
    for (const m of list) byMarket[m]?.push(j);
  }
  const r = { seas, byMarket }; WATERS.set(key, r); return r;
}
/** How much a ship counts for protecting trade: light warships fully, heavy ones half, transports not at all. */
export function patrolWeight(type: number): number {
  const u = UNITS[type]; if (!u || u.kind !== 'ship' || !u.sea) return 0;
  if (u.id === 'transport' || u.sea.cannons === 0 && u.sea.cargo >= 1000) return 0;
  return u.sea.cannons <= 12 ? 1 : 0.5;
}

// ---------------- land: development, harbours and market halls in each market's area ----------------
export interface LandRow { land: number; ports: number; markets: number }
interface LandTab { by: Map<number, LandRow>[]; base: Float64Array; dev: Float64Array }
let LT: { s: GameState | null; e: number; t: LandTab | null } = { s: null, e: -1, t: null };
export function landTable(s: GameState, w: World): LandTab {
  if (LT.s === s && LT.e === DAY_EPOCH.v && LT.t) return LT.t;
  const M = s.markets.length;
  const by: Map<number, LandRow>[] = Array.from({ length: M }, () => new Map());
  const base = new Float64Array(M), dev = new Float64Array(s.nations.length);
  const lc = s.loc;
  for (let i = 0; i < w.L; i++) {
    const o = lc.owner[i]; if (o < 0) continue;
    const m = lc.market[i]; const map = by[m]; if (!map) continue;
    let r = map.get(o); if (!r) map.set(o, (r = { land: 0, ports: 0, markets: 0 }));
    const d = lc.dev[i];
    r.land += d; dev[o] += d;
    if (w.coastal[i]) r.ports += lc.buildings[i * B + BI.port] * PORT_POWER;
    r.markets += lc.buildings[i * B + BI.market] * MARKET_POWER;
  }
  for (let m = 0; m < M; m++) for (const r of by[m].values()) base[m] += r.land + r.ports + r.markets;
  const t = { by, base, dev }; LT = { s, e: DAY_EPOCH.v, t }; return t;
}
/** Weighted light ships of each realm in each market's waters (fleets at sea or lying in one of its harbours). */
let ST: { s: GameState | null; e: number; t: Map<number, number>[] | null } = { s: null, e: -1, t: null };
export function shipTable(s: GameState, w: World): Map<number, number>[] {
  if (ST.s === s && ST.e === DAY_EPOCH.v && ST.t) return ST.t;
  const wat = marketWaters(s, w);
  const t: Map<number, number>[] = s.markets.map(() => new Map());
  for (const a of s.armies) {
    if (!a.fleet || a.rebels || a.owner < 0) continue;
    let k = 0; for (const r of a.regs) k += r.men * patrolWeight(r.type);
    if (k <= 0) continue;
    const ms = a.loc >= w.L ? wat.seas[a.loc - w.L] : [s.loc.market[a.loc]];
    for (const m of ms ?? []) { const mp = t[m]; if (mp) mp.set(a.owner, (mp.get(a.owner) ?? 0) + k); }
  }
  ST = { s, e: DAY_EPOCH.v, t }; return t;
}

// ---------------- trade power ----------------
export interface PowerRow {
  n: number; land: number; hub: number; ports: number; markets: number;
  merchantN: number; merchants: number; agreement: number; ships: number; shipN: number; company: number;
  /** factor on merchants and agreement when the market is crowded with merchants (1: not crowded) */
  crowd: number;
  /** 1 + trade effects (laws, values, tradition, modifiers) */
  mult: number; total: number; steer: boolean; blocked: boolean;
}
export interface MarketPower { m: number; base: number; total: number; rows: PowerRow[]; owner: number }
/** The weight of a realm's merchants: its development against MERCHANT_DEV (between a twentieth and one), more for a
 *  merchant republic. */
export function merchantWeight(dev: number, republic = false): number { return clamp(dev / MERCHANT_DEV, MERCHANT_MIN_WEIGHT, 1) + (republic ? REPUBLIC_WEIGHT : 0); }

/** Power rows of one market; `extra` changes our merchants there (count and steering) for an estimate. */
export function marketPower(s: GameState, w: World, m: number, extra?: { n: number; merchants: number; steer: boolean }): MarketPower {
  const lt = landTable(s, w), ships = shipTable(s, w)[m];
  const mk = s.markets[m];
  const owner = s.loc.owner[mk.hub];
  const base = lt.base[m];
  const land = lt.by[m];
  const ids = new Set<number>(land.keys());
  for (const k in mk.merchants) if (mk.merchants[k as any] > 0) ids.add(+k);
  for (const k of ships?.keys() ?? []) ids.add(k);
  if (owner >= 0) ids.add(owner);
  for (const c of s.companies ?? []) if (c.market === m) ids.add(c.nation);
  if (extra) ids.add(extra.n);
  const coHere = new Set<number>(); for (const c of s.companies ?? []) if (c.market === m) coHere.add(c.nation);
  const embargoes = owner >= 0 && embargoIndex(s).size > 0;
  const rows: PowerRow[] = [];
  let total = 0, crowdSum = 0;
  const bs = Math.max(base, 10); // a merchant in an empty market still counts for something
  for (const n of [...ids].sort((a, b) => a - b)) {
    const N = s.nations[n]; if (!N?.alive) continue;
    const lr = land.get(n);
    let merchantN = mk.merchants[n] || 0, steer = !!mk.steer?.[n];
    if (extra && extra.n === n) { merchantN = extra.merchants; steer = extra.steer; }
    if (!merchantN) steer = false;
    const merchants = merchantN * MERCHANT_SHARE * bs * merchantWeight(lt.dev[n], N.gov === 'merchant_republic');
    const agreement = owner >= 0 && owner !== n && merchants > 0 && hasTreaty(s, n, owner, 'trade') ? merchants * AGREEMENT_BONUS : 0;
    const shipN = ships?.get(n) ?? 0;
    const shipP = Math.min(SHIP_CAP * bs, shipN * SHIP_SHARE * bs);
    const company = coHere.has(n) ? COMPANY_SHARE * bs : 0;
    const row: PowerRow = {
      n, land: lr?.land ?? 0, hub: n === owner ? HUB_SHARE * base : 0, ports: lr?.ports ?? 0, markets: lr?.markets ?? 0,
      merchantN, merchants, agreement, ships: shipP, shipN, company, crowd: 1, mult: Math.max(0.1, 1 + lawEffect(N, 'trade')), total: 0, steer,
      blocked: embargoes && owner !== n && embargoBetween(s, owner, n),
    };
    const raw = row.land + row.hub + row.ports + row.markets + row.merchants + row.agreement + row.ships + row.company;
    if (raw <= 0) continue;
    if (!row.blocked) crowdSum += row.merchants + row.agreement;
    // steering needs a route home; without one the merchants collect here
    if (row.steer && !steerRoute(s, n, m)) row.steer = false;
    rows.push(row);
  }
  const crowd = crowdSum > MERCHANT_CROWD * bs ? MERCHANT_CROWD * bs / crowdSum : 1;
  for (const row of rows) {
    if (crowd < 1 && row.merchants > 0) { row.crowd = crowd; row.merchants *= crowd; row.agreement *= crowd; }
    const raw = row.land + row.hub + row.ports + row.markets + row.merchants + row.agreement + row.ships + row.company;
    row.total = row.blocked ? 0 : raw * row.mult;
    total += row.total;
  }
  return { m, base, total, rows, owner };
}
/** Fingerprints of everything a command can change in trade power within a day: per market the merchants and their
 *  steering; for all markets embargoes, trade agreements, companies and who lives. Land, harbours, ships and laws are
 *  taken once a day. */
function mix(h: number, x: number) { return (Math.imul(h, 31) + (x | 0)) | 0; }
function marketSig(mk: Market): number {
  let h = 7;
  for (const k in mk.merchants) { h = mix(mix(h, +k), mk.merchants[k as any]); }
  if (mk.steer) for (const k in mk.steer) h = mix(h, -1 - +k);
  return h;
}
function globalSig(s: GameState): number {
  let h = 17;
  for (const e of embargoIndex(s)) h = mix(h, e);
  for (const tr of s.treaties) if (tr.type === 'trade') { h = mix(mix(h, tr.a), tr.b); }
  for (const c of s.companies ?? []) { h = mix(mix(h, c.nation), c.market); }
  for (const n of s.nations) if (!n.alive) h = mix(h, n.id);
  return mix(h, s.markets.length);
}
let MP: { s: GameState | null; d: number; e: number; g: number; sigs: Int32Array; t: MarketPower[] | null } = { s: null, d: -1, e: -1, g: 0, sigs: new Int32Array(0), t: null };
/** Power rows of every market (cached per simulated day; a market is computed again when its merchants change, all
 *  of them when embargoes, agreements or companies change). */
export function marketPowers(s: GameState, w: World): MarketPower[] {
  if (MP.s === s && MP.d === DAY_EPOCH.v && MP.e === EPOCH.v && MP.t) return MP.t;
  const g = globalSig(s), M = s.markets.length;
  const sigs = new Int32Array(M); for (let m = 0; m < M; m++) sigs[m] = marketSig(s.markets[m]);
  let t: MarketPower[];
  if (MP.s === s && MP.d === DAY_EPOCH.v && MP.g === g && MP.t && MP.t.length === M) {
    let changed = false;
    for (let m = 0; m < M; m++) if (sigs[m] !== MP.sigs[m]) { changed = true; break; }
    t = changed ? MP.t.map((p, m) => (sigs[m] !== MP.sigs[m] ? marketPower(s, w, m) : p)) : MP.t;
  } else t = s.markets.map((_, m) => marketPower(s, w, m));
  MP = { s, d: DAY_EPOCH.v, e: EPOCH.v, g, sigs, t }; return t;
}

// ---------------- distribution ----------------
export interface TradeSplit {
  /** per market: what each realm takes there (its own share plus its share of the trade steered in) */
  paid: Map<number, number>[];
  /** per market: trade steered in from other markets */
  tin: Float64Array;
  /** per market: trade steered away, by realm */
  out: Map<number, number>[];
  /** per market: what each collecting realm takes of the market's own trade value (paid less its share of tin) */
  own: Map<number, number>[];
  /** per market: the trade steered in, by the market it was steered from (what arrived, after the route's factor) */
  tinFrom: Map<number, number>[];
}
/** Share out trade values tv (one per market) by trade power: steered shares move to the realm's home market. */
export function splitTrade(s: GameState, mp: MarketPower[], tv: ArrayLike<number>): TradeSplit {
  const M = mp.length;
  const paid: Map<number, number>[] = Array.from({ length: M }, () => new Map()), out: Map<number, number>[] = Array.from({ length: M }, () => new Map());
  const tin = new Float64Array(M);
  const own: Map<number, number>[] = Array.from({ length: M }, () => new Map()), tinFrom: Map<number, number>[] = Array.from({ length: M }, () => new Map());
  for (let m = 0; m < M; m++) {
    const p = mp[m], v = tv[m] || 0; if (v <= 0 || p.total <= 0) continue;
    for (const r of p.rows) {
      if (r.total <= 0) continue;
      const amt = v * r.total / p.total;
      if (r.steer) { const rt = steerRoute(s, r.n, m); if (rt) { tin[rt.dest] += amt * rt.factor; tinFrom[rt.dest].set(m, (tinFrom[rt.dest].get(m) ?? 0) + amt * rt.factor); out[m].set(r.n, amt); continue; } }
      paid[m].set(r.n, (paid[m].get(r.n) ?? 0) + amt);
      own[m].set(r.n, (own[m].get(r.n) ?? 0) + amt);
    }
  }
  for (let m = 0; m < M; m++) {
    if (tin[m] <= 0) continue;
    const p = mp[m]; let col = 0;
    for (const r of p.rows) if (!r.steer && r.total > 0) col += r.total;
    if (col <= 0) continue;
    for (const r of p.rows) if (!r.steer && r.total > 0) paid[m].set(r.n, (paid[m].get(r.n) ?? 0) + tin[m] * r.total / col);
  }
  return { paid, tin, out, own, tinFrom };
}
/** The month's trade: share out the trade values, pay the realms (a company's market books as company profit) and keep
 *  what each market earned and paid for the panels. */
export function payTrade(s: GameState, w: World, tv: Float64Array, mp0?: MarketPower[]) {
  const mp = mp0 ?? s.markets.map((_, m) => marketPower(s, w, m)); // fresh: merchants, ships and land as they are now
  clearFallenTrade(s); // (fallen realms have no power rows: the powers above stay as they are)
  const sp = splitTrade(s, mp, tv);
  for (let m = 0; m < s.markets.length; m++) {
    const mk = s.markets[m];
    mk.tv = tv[m]; mk.tin = sp.tin[m];
    const paid: Record<number, number> = {};
    for (const [n, v] of [...sp.paid[m].entries()].sort((a, b) => a[0] - b[0])) {
      const N = s.nations[n]; if (!N?.alive || v <= 0) continue;
      const co = (s.companies ?? []).find((c) => c.nation === n && c.market === m);
      addIncome(N, co ? 'company' : 'trade', v);
      if (co) co.income = v;
      paid[n] = v;
    }
    mk.paid = paid;
    const steered: Record<number, number> = {};
    for (const [n, v] of sp.out[m]) steered[n] = v;
    mk.steered = steered;
    // (fix-econ) what of it was each realm's share of the market's own trade, and where the trade steered in came from
    const own: Record<number, number> = {};
    for (const [n, v] of sp.own[m]) if (paid[n] !== undefined) own[n] = v;
    mk.own = own;
    const from: Record<number, number> = {};
    for (const [src, v] of [...sp.tinFrom[m].entries()].sort((a, b) => a[0] - b[0])) from[src] = v;
    mk.tinFrom = from;
  }
}

/** What each market earned a realm last month, the trade steered home credited to the market it came from: its own
 *  share of the market's trade (collected there), and for every market its merchants steered from, its share of what
 *  arrived at the markets it was steered to. Company markets book as company profit. The rows add up to the realm's
 *  trade and company income of the month (payTrade). */
export function tradeEarnings(s: GameState, nid: number): { m: number; own: number; steered: { to: number; v: number }[]; total: number; company: boolean }[] {
  const by = new Map<number, { m: number; own: number; steered: { to: number; v: number }[]; total: number; company: boolean }>();
  const row = (m: number) => { let r = by.get(m); if (!r) by.set(m, (r = { m, own: 0, steered: [], total: 0, company: false })); return r; };
  for (const mk of s.markets) {
    const paid = mk.paid?.[nid]; if (!paid) continue;
    const own = mk.own?.[nid] ?? paid; // (a save from before this ledger: all of it counts as the market's own)
    if (own > 0) { const r = row(mk.id); r.own += own; r.total += own; }
    const fromIn = paid - own, tin = mk.tin ?? 0;
    if (fromIn > 1e-9 && tin > 0) for (const [src, v] of Object.entries(mk.tinFrom ?? {})) { const x = fromIn * v / tin; const r = row(+src); r.steered.push({ to: mk.id, v: x }); r.total += x; }
  }
  for (const c of s.companies ?? []) if (c.nation === nid && by.has(c.market)) by.get(c.market)!.company = true;
  return [...by.values()].sort((a, b) => b.total - a.total || a.m - b.m);
}

/** Last month's trade shared out by the powers as they stand now (cached per command): the base of every estimate. */
interface TradeBase { mp: MarketPower[]; tv: Float64Array; sp: TradeSplit; col: Float64Array }
let TB: TradeBase | null = null;
function tradeBase(s: GameState, w: World): TradeBase {
  const mp = marketPowers(s, w), M = mp.length;
  if (TB && TB.mp === mp) { let same = true; for (let m = 0; m < M; m++) if (TB.tv[m] !== (s.markets[m].tv ?? 0)) { same = false; break; } if (same) return TB; }
  const tv = new Float64Array(M); for (let m = 0; m < M; m++) tv[m] = s.markets[m].tv ?? 0;
  const sp = splitTrade(s, mp, tv);
  const col = new Float64Array(M);
  for (let m = 0; m < M; m++) for (const r of mp[m].rows) if (!r.steer && r.total > 0) col[m] += r.total;
  TB = { mp, tv, sp, col }; return TB;
}
/** Share of the trade steered into market p that a collecting realm takes there. */
function collectShare(p: MarketPower, nid: number): number {
  let col = 0, our = 0;
  for (const r of p.rows) if (!r.steer && r.total > 0) { col += r.total; if (r.n === nid) our += r.total; }
  return col > 0 ? our / col : 0;
}
/** How a realm's monthly trade income changes when market m's power rows become p2 (everything else as in the base):
 *  its own share there, its share of the trade steered into m, and its share of what m's steering realms send on. */
function incomeDelta(s: GameState, b: TradeBase, nid: number, m: number, p2: MarketPower): number {
  const p1 = b.mp[m], v = b.tv[m];
  let d = 0;
  const dTin = new Map<number, number>();
  const take = (p: MarketPower, sign: number) => {
    if (v <= 0 || p.total <= 0) return;
    for (const r of p.rows) {
      if (r.total <= 0) continue;
      const amt = v * r.total / p.total;
      if (r.steer) { const rt = steerRoute(s, r.n, m); if (rt) { dTin.set(rt.dest, (dTin.get(rt.dest) ?? 0) + sign * amt * rt.factor); continue; } }
      if (r.n === nid) d += sign * amt;
    }
  };
  take(p1, -1); take(p2, 1);
  const tinM = b.sp.tin[m];
  if (tinM > 0) d += tinM * (collectShare(p2, nid) - collectShare(p1, nid));
  for (const [dest, x] of dTin) {
    const c = b.col[dest]; if (c <= 0 || dest === m) continue;
    for (const r of b.mp[dest].rows) if (r.n === nid && !r.steer && r.total > 0) d += x * r.total / c;
  }
  return d;
}
/** A realm's trade income from all markets if its merchants in market m were changed (an estimate on last month's
 *  trade values: the gains shown before sending a merchant and used by the AI). */
export function tradeIncomeWith(s: GameState, w: World, nid: number, change?: { m: number; merchants: number; steer: boolean }): number {
  const b = tradeBase(s, w);
  let v = 0; for (const p of b.sp.paid) v += p.get(nid) ?? 0;
  if (!change || !s.markets[change.m]) return v;
  return v + incomeDelta(s, b, nid, change.m, marketPower(s, w, change.m, { n: nid, merchants: change.merchants, steer: change.steer }));
}
export interface MerchantGains { now: number; add: number | null; addCollect: number | null; addSteer: number | null; recall: number | null; toggle: number | null }
/** What one more merchant, one merchant fewer or switching the mode would change in our monthly trade income (null: not
 *  possible). Steering is one setting for all our merchants in a market: `add` keeps it as it is, `addCollect` sends
 *  one more and lets all of them collect here, `addSteer` (only while they collect) lets all of them steer home. */
export function merchantGains(s: GameState, w: World, nid: number, m: number): MerchantGains {
  const n = s.nations[nid]; const mk = s.markets[m];
  const now = tradeIncomeWith(s, w, nid);
  const have = mk?.merchants[nid] || 0, steer = !!mk?.steer?.[nid];
  const free = merchantsFree(s, n);
  const canSteer = !!steerRoute(s, nid, m);
  const ok = !merchantRefusal(s, w, n, m);
  const est = (k: number, st: boolean) => tradeIncomeWith(s, w, nid, { m, merchants: k, steer: st }) - now;
  return {
    now,
    add: ok && free > 0 ? est(have + 1, steer && canSteer) : null,
    addCollect: ok && free > 0 ? est(have + 1, false) : null,
    addSteer: ok && free > 0 && canSteer && !steer ? est(have + 1, true) : null,
    recall: have > 0 ? est(have - 1, steer && have > 1) : null,
    toggle: have > 0 && canSteer ? est(have, !steer) : null,
  };
}

// ---------------- merchants ----------------
/** How far a realm's merchants travel from home, in route cost (a sea crossing within Europe is about 0.5, a long land
 *  road 1.5): 1, 0.08 more for every level of Commerce & Learning, 0.8 more for a merchant republic. */
export const MERCHANT_RANGE = 1, RANGE_PER_LEVEL = 0.08, REPUBLIC_RANGE = 0.8;
export function merchantReach(n: { tech: number[]; gov: string }): number { return MERCHANT_RANGE + RANGE_PER_LEVEL * n.tech[1] + (n.gov === 'merchant_republic' ? REPUBLIC_RANGE : 0); }
/** Route cost from a realm's home market to market m (Infinity without a route). */
export function routeCost(s: GameState, from: number, to: number): number { const r = routes(s); return from < 0 || to < 0 ? Infinity : r.cost[from * r.M + to]; }
/** How many merchants a realm can place in markets. */
export function merchantCap(n: { tech: number[]; gov: string }): number { return 2 + Math.floor(n.tech[0] / 4) + (n.gov === 'merchant_republic' ? 2 : 0); }
export function merchantsUsed(s: GameState, nid: number): number { let k = 0; for (const m of s.markets) k += m.merchants[nid] || 0; return k; }
export function merchantsFree(s: GameState, n: Nation): number { return merchantCap(n) - merchantsUsed(s, n.id); }
const knowsLoc = (s: GameState, n: Nation, l: number) => { if (s.flags.revealAll) return true; const e = s.explored[n.knows]; return !e || e[l] === 1; };
/** Our people know realm o once they have seen its capital or any place it holds (the same rule as the trade views). */
export function knowsRealm(s: GameState, n: Nation, o: number): boolean {
  if (s.flags.revealAll || o === n.id) return true;
  const N = s.nations[o]; if (!N) return false;
  if (N.capital >= 0 && knowsLoc(s, n, N.capital)) return true;
  for (let l = 0; l < s.loc.owner.length; l++) if (s.loc.owner[l] === o && knowsLoc(s, n, l)) return true;
  return false;
}
/** Why realm a cannot make a trade agreement with, or lay an embargo on, realm b (null: it can): it must know b. An
 *  embargo already laid can always be lifted, and a treaty already made always ended. */
export function tradeDiploRefusal(s: GameState, a: number, b: number, action: string): string | null {
  if (action !== 'trade' && action !== 'embargo') return null;
  const A = s.nations[a]; if (!A) return 'invalid target';
  return knowsRealm(s, A, b) ? null : 'we know nothing of this realm';
}

/** Why our merchants cannot go to this market (null: they can): we must know it and reach it from home (merchantReach
 *  market links), unless we hold land there or have a company there; never under an embargo with its ruler. */
export function merchantRefusal(s: GameState, w: World, n: Nation, m: number): string | null {
  const mk = s.markets[m]; if (!mk) return 'no such market';
  if (!knowsLoc(s, n, mk.hub)) return 'we do not know this market';
  const owner = s.loc.owner[mk.hub];
  if (owner >= 0 && owner !== n.id && embargoBetween(s, owner, n.id)) return 'an embargo shuts our merchants out';
  // a lost trade war expels our merchants from the victor's markets for ten years (systems/war.ts expel_merchants)
  if (owner >= 0 && owner !== n.id && (s.flags[`nomerch_${n.id}_${owner}`] ?? 0) > s.day) return 'our merchants were expelled from this market';
  const home = homeMarket(s, n);
  if (home === m) return null;
  // (read from the state itself, not from a table of the day: commands between days see the state as it is)
  if (holdsLandIn(s, n.id, m) || (s.companies ?? []).some((c) => c.nation === n.id && c.market === m)) return null;
  if (home < 0) return 'too far from our home market';
  if (!(routeCost(s, home, m) <= merchantReach(n))) return 'too far from our home market';
  return null;
}
/** The realm holds land in the market's area. */
export function holdsLandIn(s: GameState, nid: number, m: number): boolean {
  for (const l of ownedLocs(s, nid)) if (s.loc.market[l] === m) return true;
  return false;
}
/** Place or recall merchants (amount = how many we keep there) and set whether they steer the trade home. */
export function setMerchants(s: GameState, w: World, n: Nation, m: number, amount: number, steer?: boolean): string | null {
  const mk = s.markets[m]; if (!mk) return 'no such market';
  const have = mk.merchants[n.id] || 0;
  const v = Math.max(0, Math.round(amount));
  if (v > have) {
    const why = merchantRefusal(s, w, n, m); if (why) return why;
    if (v - have > merchantsFree(s, n)) return 'no merchants left';
  }
  if (steer && v > 0) {
    if (homeMarket(s, n) === m) return 'our merchants collect at home';
    if (!steerRoute(s, n.id, m)) return 'no trade route home';
  }
  if (v) mk.merchants[n.id] = v; else delete mk.merchants[n.id];
  const st = steer ?? !!mk.steer?.[n.id];
  if (v && st) (mk.steer ??= {})[n.id] = 1;
  else if (mk.steer) delete mk.steer[n.id];
  return null;
}

// ---------------- embargo ----------------
/** What an embargo of a on b would cost both sides a month (from last month's trade): b's trade income in markets whose
 *  hub a holds, a's in markets whose hub b holds, and the value of goods that went between their markets. */
export function embargoStakes(s: GameState, a: number, b: number): { theirs: number; ours: number; goods: number } {
  let theirs = 0, ours = 0, goods = 0;
  for (const mk of s.markets) {
    const o = s.loc.owner[mk.hub];
    if (o === a) theirs += mk.paid?.[b] ?? 0;
    if (o === b) ours += mk.paid?.[a] ?? 0;
  }
  for (const f of s.flows ?? []) {
    const oa = s.loc.owner[s.markets[f.from]?.hub ?? -1], ob = s.loc.owner[s.markets[f.to]?.hub ?? -1];
    if ((oa === a && ob === b) || (oa === b && ob === a)) goods += f.value;
  }
  return { theirs, ours, goods };
}
