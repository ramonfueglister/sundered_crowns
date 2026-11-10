// Worker-side views of trade and exploration for the panels: a market's trade power and goods, one good's producers,
// consumers and price, the realm's trade policy, its relation in trade with another realm, expeditions and companies,
// and the colours of the map modes "prices", "production" and "markets".
import type { GameState, I18n, Nation } from '../sim/types';
import type { World } from '../sim/world';
import type { Legend } from './protocol';
import { GOODS, G, GI, UNITS, C } from '../sim/defs';
import {
  marketPowers, merchantGains, merchantRefusal, merchantsFree, merchantCap, merchantsUsed, merchantReach, routeCost, homeMarket, steerRoute,
  marketPath, embargoedBy, embargoStakes, tariffBetween, marketWaters, shipTable, MAX_HOPS, AGREEMENT_TARIFF, AGREEMENT_VOLUME, MERCHANT_CROWD,
  tradeEarnings, STEER_BONUS, HOP_LOSS,
} from '../sim/systems/trade';
import { tariffMax, LOC_ECON, locGoods, needWeights } from '../sim/systems/economy';
import { lawEffect } from '../sim/systems/politics';
import { hasTreaty, treatiesOf } from '../sim/ctx';
import { expeditionTargets, expeditionPlan, MAX_EXPEDITIONS, regionOf, harbours } from '../sim/systems/explore';
import { charterOptions, companySlots } from '../sim/systems/colonial';
import { ownedLocs } from '../sim/systems/war';
import { deName } from '../sim/content/names_de';

const placeI18n = (w: World, l: number): I18n => ({ en: w.names[l] ?? `#${l}`, de: w.namesDe[l] ?? w.names[l] ?? `#${l}` });
const known = (s: GameState, n: Nation | undefined, l: number) => { if (!n || s.flags.revealAll) return true; const e = s.explored[n.knows]; return !e || e[l] === 1; };
/** The viewer knows a realm once it has seen its capital or any place it holds (everything without a viewer). */
function knowsRealm(s: GameState, n: Nation | undefined, o: number): boolean {
  if (!n || s.flags.revealAll || o === n.id) return true;
  const N = s.nations[o]; if (!N) return false;
  if (N.capital >= 0 && known(s, n, N.capital)) return true;
  for (const l of ownedLocs(s, o)) if (known(s, n, l)) return true;
  return false;
}
/** The last `k` months of a good's price in a market, oldest first. */
function priceHist(s: GameState, m: number, g: number, k: number): number[] {
  const mk = s.markets[m]; const out: number[] = [];
  for (let j = 120 - k; j < 120; j++) out.push(mk.hist[g * 120 + ((mk.histPos + j) % 120)]);
  return out.filter((x) => x > 0);
}

// ---------------- one market ----------------
export function marketDetail(s: GameState, w: World, pid: number, mid: number) {
  const mk = s.markets[mid]; if (!mk) return null;
  const n = s.nations[pid];
  const mp = marketPowers(s, w)[mid];
  const paid = mk.paid ?? {}, steered = mk.steered ?? {};
  const rows = mp.rows.filter((r) => r.total > 0 || r.blocked).sort((a, b) => b.total - a.total || a.n - b.n).map((r) => ({
    n: r.n, total: r.total, share: mp.total > 0 ? r.total / mp.total : 0, paid: paid[r.n] ?? 0, steered: steered[r.n] ?? 0,
    steer: r.steer, blocked: r.blocked, merchantN: r.merchantN, shipN: r.shipN, crowd: r.crowd, mult: r.mult,
    parts: ([['tp_land', r.land], ['tp_hub', r.hub], ['tp_ports', r.ports], ['tp_halls', r.markets], ['tp_merchants', r.merchants], ['tp_agreement', r.agreement], ['tp_ships', r.ships], ['tp_company', r.company]] as [string, number][]).filter(([, v]) => v > 0),
  }));
  const home = homeMarket(s, n);
  const have = n ? mk.merchants[pid] || 0 : 0;
  const route = n ? steerRoute(s, pid, mid) : null;
  const our = n ? {
    have, steer: !!mk.steer?.[pid], used: merchantsUsed(s, pid), cap: merchantCap(n), free: merchantsFree(s, n),
    refusal: merchantRefusal(s, w, n, mid), home, homeName: home >= 0 ? s.markets[home].name : '',
    reach: merchantReach(n), cost: home >= 0 ? routeCost(s, home, mid) : Infinity,
    route: route ? { hops: route.hops, factor: route.factor, bonus: 1 + STEER_BONUS, loss: Math.pow(1 - HOP_LOSS, Math.max(0, route.hops - 1)), via: (marketPath(s, mid, route.dest) ?? []).map((x) => s.markets[x].name) } : null,
    gains: merchantGains(s, w, pid, mid), paid: paid[pid] ?? 0, steered: steered[pid] ?? 0,
    share: mp.total > 0 ? (mp.rows.find((r) => r.n === pid)?.total ?? 0) / mp.total : 0,
    // last month, exactly as paid (fix-econ): our share of this market's own trade, our share of the trade steered in
    // here by the market it came from, and what our merchants here steered home earned us where it arrived
    own: mk.own?.[pid] ?? paid[pid] ?? 0,
    fromIn: steeredInShares(s, pid, mid),
    homeRows: (tradeEarnings(s, pid).find((r) => r.m === mid)?.steered ?? []).map((x) => ({ to: x.to, name: s.markets[x.to]?.name ?? '?', v: x.v })),
  } : null;
  const wat = marketWaters(s, w).byMarket[mid] ?? [];
  const goods = GOODS.map((g, k) => ({ id: g.id, k, name: g.name, price: mk.price[k], supply: mk.supply[k], demand: mk.demand[k], base: g.base * s.priceLevel, net: mk.flowOut[k], hist: priceHist(s, mid, k, 24) }));
  return {
    id: mid, name: mk.name, hub: mk.hub, hubName: placeI18n(w, mk.hub), owner: mk.owner, priceIndex: mk.priceIndex,
    tv: mk.tv ?? 0, tin: mk.tin ?? 0, deter: mk.deter ?? 0, base: mp.base, total: mp.total, crowdCap: MERCHANT_CROWD,
    rows, our, goods, waters: wat.length, seaRoutes: mk.links.filter((l) => l.sea).length,
    links: mk.links.filter((l) => known(s, n, s.markets[l.to].hub)).map((l) => ({ to: l.to, name: s.markets[l.to].name, sea: l.sea, ocean: !!l.ocean })),
  };
}

/** Our share of the trade steered into market m last month, by the market it was steered from. */
function steeredInShares(s: GameState, pid: number, m: number): { from: number; name: string; v: number }[] {
  const mk = s.markets[m]; const paid = mk?.paid?.[pid] ?? 0, own = mk?.own?.[pid] ?? paid, tin = mk?.tin ?? 0;
  if (!mk || paid - own <= 1e-9 || tin <= 0) return [];
  return Object.entries(mk.tinFrom ?? {}).map(([src, v]) => ({ from: +src, name: s.markets[+src]?.name ?? '?', v: (paid - own) * v / tin })).sort((a, b) => b.v - a.v || a.from - b.from);
}

/** Every market we know: our share, income and merchants there (the market list of the trade panel); `earned` is what
 *  the market earned us last month with the trade our merchants steered home from it credited to it (tradeEarnings),
 *  so that the column adds up to our trade and company profits. */
export function marketList(s: GameState, w: World, pid: number) {
  const n = s.nations[pid]; const home = homeMarket(s, n); const mps = marketPowers(s, w);
  const earn = new Map(tradeEarnings(s, pid).map((r) => [r.m, r]));
  return s.markets.filter((m) => known(s, n, m.hub) || earn.has(m.id)).map((m) => {
    const r = mps[m.id].rows.find((x) => x.n === pid); const e = earn.get(m.id);
    return { id: m.id, name: m.name, home: m.id === home, tv: m.tv ?? 0, share: mps[m.id].total > 0 ? (r?.total ?? 0) / mps[m.id].total : 0, paid: m.paid?.[pid] ?? 0, merchants: m.merchants[pid] || 0, steer: !!m.steer?.[pid], owner: m.owner, reach: n && home >= 0 ? routeCost(s, home, m.id) <= merchantReach(n) : false,
      earned: e?.total ?? 0, own: e?.own ?? 0, company: !!e?.company, steeredHome: (e?.steered ?? []).map((x) => ({ to: x.to, name: s.markets[x.to]?.name ?? '?', v: x.v })) };
  }).sort((a, b) => b.tv - a.tv || a.id - b.id);
}

/** Our trade and company income of last month by market, for the ledger line (the economy panel): each market's own
 *  share, and the trade steered home credited to the market it came from. Adds up to income.trade + income.company. */
export function tradeIncomeBy(s: GameState, pid: number): { m: number; name: string; to: number; toName: string; steered: boolean; company: boolean; v: number }[] {
  const co = new Set((s.companies ?? []).filter((c) => c.nation === pid).map((c) => c.market));
  const out: { m: number; name: string; to: number; toName: string; steered: boolean; company: boolean; v: number }[] = [];
  const nm = (m: number) => s.markets[m]?.name ?? '?';
  for (const r of tradeEarnings(s, pid)) {
    if (r.own > 0) out.push({ m: r.m, name: nm(r.m), to: r.m, toName: nm(r.m), steered: false, company: co.has(r.m), v: r.own });
    for (const x of r.steered) out.push({ m: r.m, name: nm(r.m), to: x.to, toName: nm(x.to), steered: true, company: co.has(x.to), v: x.v });
  }
  return out.sort((a, b) => b.v - a.v || a.m - b.m);
}

// ---------------- one good in one market ----------------
export function goodDetail(s: GameState, w: World, pid: number, mid: number, g: number) {
  const mk = s.markets[mid]; if (!mk || g < 0 || g >= G) return null;
  const needs = needWeights(mk, s.priceLevel);
  const prod: { loc: number; q: number }[] = [], cons: { loc: number; q: number; people: number; crafts: number; house: number }[] = [];
  const byRealmP = new Map<number, number>(), byRealmC = new Map<number, number>();
  let made = 0, people = 0, crafts = 0, house = 0;
  const ready = !!LOC_ECON && LOC_ECON.grain.length === w.L;
  if (ready) for (let i = 0; i < w.L; i++) {
    if (s.loc.market[i] !== mid) continue;
    const lg = locGoods(s.loc, w, i, needs);
    const o = s.loc.owner[i];
    const q = lg.made.get(g) ?? 0;
    if (q > 0) { prod.push({ loc: i, q }); made += q; byRealmP.set(o, (byRealmP.get(o) ?? 0) + q); }
    const p = lg.people.get(g) ?? 0, c = lg.crafts.get(g) ?? 0, h = lg.house.get(g) ?? 0;
    if (p + c + h > 0) { cons.push({ loc: i, q: p + c + h, people: p, crafts: c, house: h }); people += p; crafts += c; house += h; byRealmC.set(o, (byRealmC.get(o) ?? 0) + p + c + h); }
  }
  prod.sort((a, b) => b.q - a.q || a.loc - b.loc); cons.sort((a, b) => b.q - a.q || a.loc - b.loc);
  const realms = (m: Map<number, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 8).map(([n, q]) => ({ n, q }));
  const ownerN = s.nations[mk.owner];
  const debase = ownerN ? 1 + ownerN.inflation : 1;
  const anchor = GOODS[g].base * s.priceLevel * debase;
  const S = mk.supply[g], D = mk.demand[g];
  const ratio = (D + 0.02 * anchor) / (S + 0.02 * anchor);
  const step = Math.min(1.22, Math.max(0.82, Math.pow(ratio, 0.3)));
  const viewer = s.nations[pid];
  const partners = (s.flows ?? []).filter((f) => f.good === g && (f.from === mid || f.to === mid) && known(s, viewer, s.markets[f.from === mid ? f.to : f.from].hub)).slice(0, 8)
    .map((f) => ({ market: f.from === mid ? f.to : f.from, name: s.markets[f.from === mid ? f.to : f.from].name, out: f.from === mid, qty: f.qty, value: f.value }));
  return {
    good: g, name: GOODS[g].name, market: mid, marketName: mk.name, price: mk.price[g], base: GOODS[g].base, priceLevel: s.priceLevel, debase, anchor,
    supply: S, demand: D, net: mk.flowOut[g], stock: mk.stock[g], ratio, step, ready,
    hist: priceHist(s, mid, g, 24),
    made, people, crafts, house,
    producers: prod.slice(0, 8).map((x) => ({ ...x, name: placeI18n(w, x.loc), owner: s.loc.owner[x.loc] })), producerRealms: realms(byRealmP),
    consumers: cons.slice(0, 8).map((x) => ({ ...x, name: placeI18n(w, x.loc), owner: s.loc.owner[x.loc] })), consumerRealms: realms(byRealmC),
    partners, ours: { made: byRealmP.get(pid) ?? 0, used: byRealmC.get(pid) ?? 0 },
  };
}

// ---------------- the realm's trade policy ----------------
export function tradePolicy(s: GameState, w: World, pid: number) {
  const n = s.nations[pid]; if (!n) return null;
  const law = lawEffect(n, 'tariff_max');
  let deter = 0, margin = 0; const ours: { id: number; name: string; deter: number }[] = [];
  const byGood = new Map<number, [number, number]>();
  for (const m of s.markets) if (m.owner === pid) {
    deter += m.deter ?? 0; ours.push({ id: m.id, name: m.name, deter: m.deter ?? 0 });
    for (const [g, [v, mg]] of Object.entries(m.deterBy ?? {})) { const e = byGood.get(+g) ?? [0, 0]; e[0] += v; e[1] += mg; byGood.set(+g, e); margin += mg; }
  }
  // per good: the value kept out and the margin it would have made (as a share of that value)
  const keptOut = [...byGood].sort((a, b) => b[1][0] - a[1][0] || a[0] - b[0]).slice(0, 8)
    .map(([g, [v, mg]]) => ({ g, name: GOODS[g].name, v, margin: v > 0 ? mg / v : 0 }));
  const partners = treatiesOf(s, pid, 'trade').map((o) => {
    const tr = s.treaties.find((x) => x.type === 'trade' && ((x.a === pid && x.b === o) || (x.a === o && x.b === pid)));
    return { n: o, until: tr?.until ?? 0, theirs: tariffBetween(s, o, pid), ours: tariffBetween(s, pid, o) };
  });
  const embargoes = s.nations.filter((o) => o.alive && o.id !== pid && (embargoedBy(s, pid, o.id) || embargoedBy(s, o.id, pid)))
    .map((o) => ({ n: o.id, ours: embargoedBy(s, pid, o.id), theirs: embargoedBy(s, o.id, pid), since: s.flags[`embargo_${pid}_${o.id}`] || s.flags[`embargo_${o.id}_${pid}`] || 0, stakes: embargoStakes(s, pid, o.id) }));
  const goodsWith = new Map<number, number>();
  for (const f of s.flows ?? []) {
    const a = s.loc.owner[s.markets[f.from].hub], b = s.loc.owner[s.markets[f.to].hub];
    if (a === pid && b >= 0 && b !== pid) goodsWith.set(b, (goodsWith.get(b) ?? 0) + f.value);
    else if (b === pid && a >= 0 && a !== pid) goodsWith.set(a, (goodsWith.get(a) ?? 0) + f.value);
  }
  const traders = [...goodsWith.entries()].filter(([o]) => knowsRealm(s, n, o)).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 8)
    .map(([o, v]) => ({ n: o, goods: v, agreement: hasTreaty(s, pid, o, 'trade'), embargo: embargoedBy(s, pid, o) || embargoedBy(s, o, pid), theirTariff: s.nations[o]?.tariff ?? 0 }));
  return {
    tariff: n.tariff, max: tariffMax(n), maxParts: [['x_base', 0.05], ['x_trade_law', law]] as [string, number][],
    earned: n.income.tariffs ?? 0, trade: n.income.trade ?? 0, company: n.income.company ?? 0, deter, markets: ours, keptOut, keptMargin: margin,
    agreementTariff: AGREEMENT_TARIFF, agreementVolume: AGREEMENT_VOLUME, partners, embargoes, traders,
  };
}

/** Trade between us and another realm: goods exchanged, tariffs both ways, what an agreement would change and what an
 *  embargo would cost each side. */
export function tradeRelation(s: GameState, w: World, pid: number, o: number) {
  const n = s.nations[pid], N = s.nations[o]; if (!n || !N || pid === o) return null;
  // a realm we have never seen: nothing to trade with (unless it keeps an embargo or a treaty with us)
  if (!knowsRealm(s, n, o) && !embargoedBy(s, pid, o) && !embargoedBy(s, o, pid) && !hasTreaty(s, pid, o, 'trade')) return null;
  let goods = 0; const items = new Map<number, number>();
  for (const f of s.flows ?? []) {
    const a = s.loc.owner[s.markets[f.from].hub], b = s.loc.owner[s.markets[f.to].hub];
    if ((a === pid && b === o) || (a === o && b === pid)) { goods += f.value; items.set(f.good, (items.get(f.good) ?? 0) + f.value); }
  }
  const agreement = hasTreaty(s, pid, o, 'trade');
  return {
    goods, items: [...items.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g, v]) => ({ name: GOODS[g].name, value: v })),
    agreement, ourTariff: tariffBetween(s, pid, o), theirTariff: tariffBetween(s, o, pid), ourBase: n.tariff, theirBase: N.tariff,
    halved: AGREEMENT_TARIFF, volume: AGREEMENT_VOLUME,
    ours: embargoedBy(s, pid, o), theirs: embargoedBy(s, o, pid), stakes: embargoStakes(s, pid, o),
    allied: hasTreaty(s, pid, o, 'alliance'), within: N.overlord === pid || n.overlord === o, rival: n.rivals.includes(o),
  };
}

// ---------------- expeditions and companies ----------------
export function expeditionView(s: GameState, w: World, pid: number, to?: number, fleet?: number) {
  const n = s.nations[pid]; if (!n) return null;
  const targets = expeditionTargets(s, w, n).slice(0, 40).map((x) => ({ id: x.region.id, name: x.region.name, to: x.to, unknown: x.unknown, zones: x.region.zones.length, km: x.km }));
  const tgt = to ?? targets[0]?.to ?? -1;
  const plan = tgt >= 0 ? expeditionPlan(s, w, n, tgt, fleet ?? 0) : null;
  const fleets = s.armies.filter((a) => a.owner === pid && a.fleet && !a.battle).map((a) => ({ id: a.id, name: a.name, ships: a.regs.reduce((p, r) => p + r.men, 0), loc: a.loc, busy: s.explorers.some((x) => x.id === a.id) || a.path.length > 0 }));
  const atSea = s.explorers.filter((x) => x.nation === pid && x.since !== undefined).map((x) => {
    const f = s.armies.find((a) => a.id === x.id);
    return { id: x.id, to: x.to ?? -1, region: x.to !== undefined ? regionOf(w, x.to)?.name ?? null : null, days: s.day - (x.since ?? s.day), left: f?.path.length ?? 0, found: x.found ?? 0, lands: x.lands ?? 0, met: x.met ?? [], goods: (x.goods ?? []).map((g) => GOODS[g]?.name).filter(Boolean), ships: f ? f.regs.reduce((p, r) => p + r.men, 0) : 0 };
  });
  return {
    targets, to: tgt, fleets, atSea, max: MAX_EXPEDITIONS, harbours: harbours(s, w, n).length,
    plan: plan && { ...plan, path: plan.path.length, portName: plan.port >= 0 ? placeI18n(w, plan.port) : null, unitName: plan.unit >= 0 ? UNITS[plan.unit].name : null, priceLevel: s.priceLevel },
  };
}

export function companiesView(s: GameState, w: World, pid: number) {
  const n = s.nations[pid]; if (!n) return null;
  const mps = marketPowers(s, w), ships = shipTable(s, w);
  const mine = (s.companies ?? []).filter((c) => c.nation === pid).map((c) => {
    const mk = s.markets[c.market]; const p = mps[c.market]; const r = p?.rows.find((x) => x.n === pid);
    let holdings = 0, dev = 0; for (const l of ownedLocs(s, pid)) if (s.loc.market[l] === c.market) { holdings++; dev += s.loc.dev[l]; }
    let withHome = 0; for (const f of s.flows ?? []) if ((f.from === c.market && f.to === c.home) || (f.from === c.home && f.to === c.market)) withHome += f.value;
    return {
      name: c.name, market: c.market, marketName: mk?.name ?? '?', home: c.home, homeName: s.markets[c.home]?.name ?? '?', since: c.since,
      income: c.income ?? 0, holdings, dev, ships: ships[c.market]?.get(pid) ?? 0, share: p && p.total > 0 ? (r?.total ?? 0) / p.total : 0,
      power: r?.total ?? 0, parts: r ? ([['tp_land', r.land], ['tp_hub', r.hub], ['tp_ports', r.ports], ['tp_halls', r.markets], ['tp_merchants', r.merchants], ['tp_ships', r.ships], ['tp_company', r.company]] as [string, number][]).filter(([, v]) => v > 0) : [],
      mult: r?.mult ?? 1, withHome, tv: mk?.tv ?? 0,
    };
  });
  const have = new Set(mine.map((c) => c.market));
  const options = charterOptions(s, w, n).filter((m) => !have.has(m)).map((m) => ({ market: m, name: s.markets[m].name, tv: s.markets[m].tv ?? 0 }));
  // the Commerce & Learning level that brings the next charter (colonial.ts companySlots: one at 12, one more every six)
  const slots = companySlots(n);
  return { mine, options, slots, nextAt: 12 + 6 * slots, commerce: n.tech[1], need: 12, cost: 600 * s.priceLevel, treasury: n.treasury };
}

// ---------------- map modes ----------------
type RGB = [number, number, number];
function ramp(t: number, stops: RGB[]): RGB {
  t = Math.max(0, Math.min(1, t)) * (stops.length - 1); const i = Math.min(stops.length - 2, Math.floor(t)), f = t - i;
  const a = stops[i], b = stops[i + 1]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f].map(Math.round) as RGB;
}
const CHEAP_DEAR: RGB[] = [[46, 125, 70], [130, 185, 95], [235, 225, 160], [235, 150, 70], [190, 50, 40]];
const VOLUME: RGB[] = [[235, 230, 205], [215, 190, 110], [190, 120, 50], [130, 60, 30]];
const hex = (c: RGB) => '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');

/** The goods a map mode can show (all of them; grain first). */
export const MAP_GOODS = GOODS.map((g, k) => ({ k, name: g.name }));

/** A whole number with the language's thousands separator, for legend labels. */
const fmt = (v: number, lang: 'en' | 'de') => Math.round(v).toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB');
/** Colours and legend of a trade map mode as `viewer` sees it: places, markets and realms it has not discovered stay
 *  blank and out of the legend (viewer -1: everything, as in observer mode). */
export function tradeMapColors(s: GameState, w: World, mode: 'prices' | 'production' | 'markets', good: number, viewer = -1): { rgba: Uint8Array; legend: Legend } {
  const out = new Uint8Array(w.N * 4);
  const V = viewer >= 0 ? s.nations[viewer] : undefined;
  const seen = (l: number) => known(s, V, l);
  const seenM = s.markets.map((m) => seen(m.hub));
  const realmSeen = new Map<number, boolean>();
  const seenR = (o: number) => { let v = realmSeen.get(o); if (v === undefined) { v = knowsRealm(s, V, o); realmSeen.set(o, v); } return v; };
  const put = (i: number, c: RGB) => { if (!seen(i)) return; out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255; };
  const g = good >= 0 && good < G ? good : GI.grain;
  const gname = GOODS[g].name;
  const lc = s.loc;
  if (mode === 'prices') {
    // price against the good's base price in each place's market: cheap green, dear red (log scale, ×1/3 to ×3)
    const rel = s.markets.map((m) => m.price[g] / Math.max(1e-9, GOODS[g].base * s.priceLevel));
    for (let i = 0; i < w.L; i++) { const r = rel[lc.market[i]]; if (r > 0) put(i, ramp(0.5 + Math.log(r) / Math.log(9), CHEAP_DEAR)); }
    const order = s.markets.map((m, k) => ({ m, r: rel[k] })).filter((x) => x.r > 0 && seenM[x.m.id]).sort((a, b) => a.r - b.r || a.m.id - b.m.id);
    const pct = (r: number) => `${r >= 1 ? '+' : ''}${Math.round((r - 1) * 100)} %`;
    const items: Legend['items'] = [
      { color: hex(ramp(0, CHEAP_DEAR)), label: { en: 'cheap (a third of the base price)', de: 'billig (ein Drittel des Grundpreises)' } },
      { color: hex(ramp(0.5, CHEAP_DEAR)), label: { en: 'base price', de: 'Grundpreis' } },
      { color: hex(ramp(1, CHEAP_DEAR)), label: { en: 'dear (three times the base price)', de: 'teuer (dreifacher Grundpreis)' } },
    ];
    for (const x of order.slice(0, 2)) items.push({ color: hex(ramp(0.5 + Math.log(x.r) / Math.log(9), CHEAP_DEAR)), label: { en: `cheapest: ${x.m.name} ${pct(x.r)}`, de: `am billigsten: ${deName(x.m.name)} ${pct(x.r)}` } });
    for (const x of order.slice(-2).reverse()) items.push({ color: hex(ramp(0.5 + Math.log(x.r) / Math.log(9), CHEAP_DEAR)), label: { en: `dearest: ${x.m.name} ${pct(x.r)}`, de: `am teuersten: ${deName(x.m.name)} ${pct(x.r)}` } });
    return { rgba: out, legend: { title: { en: `Prices: ${gname.en}`, de: `Preise: ${gname.de}` }, items, good: g } };
  }
  if (mode === 'production') {
    // how much of the good each place made last month (square-root scale against the largest producer)
    const q = new Float64Array(w.L); let max = 0;
    const realms = new Map<number, number>();
    if (LOC_ECON && LOC_ECON.grain.length === w.L) for (let i = 0; i < w.L; i++) {
      if (!seen(i)) continue;
      const v = locGoods(lc, w, i, null).made.get(g) ?? 0; q[i] = v; if (v > max) max = v;
      if (v > 0 && lc.owner[i] >= 0) realms.set(lc.owner[i], (realms.get(lc.owner[i]) ?? 0) + v);
    }
    for (let i = 0; i < w.L; i++) if (q[i] > 0 && max > 0) put(i, ramp(Math.sqrt(q[i] / max), VOLUME)); else if (lc.owner[i] >= 0 || lc.pop[i * C] > 0) put(i, [225, 222, 210]);
    const items: Legend['items'] = [
      { color: hex(VOLUME[0]), label: { en: 'a little', de: 'wenig' } }, { color: hex(ramp(0.5, VOLUME)), label: { en: `a quarter of the largest place (${fmt(max / 4, 'en')})`, de: `ein Viertel des größten Orts (${fmt(max / 4, 'de')})` } },
      { color: hex(VOLUME[3]), label: { en: `much (${fmt(max, 'en')} a month in the largest place)`, de: `viel (${fmt(max, 'de')} im Monat am größten Ort)` } },
      { color: '#e1ded2', label: { en: 'none', de: 'nichts' } },
    ];
    for (const [o, v] of [...realms.entries()].filter(([o]) => seenR(o)).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4)) { const N = s.nations[o]; if (N) items.push({ color: `rgb(${N.color.join(',')})`, label: { en: `made in ${N.short.en}: ${fmt(v, 'en')}`, de: `erzeugt in ${N.short.de}: ${fmt(v, 'de')}` } }); }
    return { rgba: out, legend: { title: { en: `Production: ${gname.en} (a month)`, de: `Erzeugung: ${gname.de} (im Monat)` }, items, good: g } };
  }
  // markets: each market area in the colour of the realm with the most trade power there, lighter where little trade
  // is earned; the hubs bright; with a good chosen, its net exports (green) and imports (red) instead
  const mps = marketPowers(s, w);
  const items: Legend['items'] = [];
  if (good >= 0) {
    const net = s.markets.map((m) => m.flowOut[g]); const mx = Math.max(1e-6, ...net.filter((_, k) => seenM[k]).map(Math.abs));
    for (let i = 0; i < w.L; i++) { const v = net[lc.market[i]] / mx; put(i, ramp(0.5 + 0.5 * Math.sign(v) * Math.sqrt(Math.abs(v)), [[190, 50, 40], [235, 225, 160], [46, 125, 70]])); }
    for (const m of s.markets) put(m.hub, [255, 245, 215]);
    items.push({ color: '#2e7d46', label: { en: 'exports', de: 'führt aus' } }, { color: '#ebe1a0', label: { en: 'balanced', de: 'ausgeglichen' } }, { color: '#be3228', label: { en: 'imports', de: 'führt ein' } });
    return { rgba: out, legend: { title: { en: `Markets: trade in ${gname.en}`, de: `Märkte: Handel mit ${gname.de}` }, items, good: g, goodOptional: true } };
  }
  const lead = mps.map((p) => { let best = -1, bv = 0; for (const r of p.rows) if (r.total > bv) { bv = r.total; best = r.n; } return { n: best, share: p.total > 0 ? bv / p.total : 0 }; });
  const tvMax = Math.max(1, ...s.markets.filter((m) => seenM[m.id]).map((m) => m.tv ?? 0));
  const count = new Map<number, number>();
  for (const [k, l] of lead.entries()) if (l.n >= 0 && seenM[k]) count.set(l.n, (count.get(l.n) ?? 0) + (s.markets[k].tv ?? 0));
  for (let i = 0; i < w.L; i++) {
    const m = lc.market[i]; const l = lead[m]; const N = s.nations[l.n]; if (!N) continue;
    const f = 0.35 + 0.65 * Math.sqrt((s.markets[m].tv ?? 0) / tvMax);
    put(i, N.color.map((c) => Math.round(235 + (c - 235) * f)) as RGB);
  }
  for (const m of s.markets) put(m.hub, [255, 245, 215]);
  for (const [o, v] of [...count.entries()].filter(([o]) => seenR(o)).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 8)) { const N = s.nations[o]; if (N) items.push({ color: `rgb(${N.color.join(',')})`, label: { en: `${N.short.en}: leads trade worth ${fmt(v, 'en')}`, de: `${N.short.de}: führt Handel im Wert von ${fmt(v, 'de')}` } }); }
  items.push({ color: '#fff5d7', label: { en: 'market hub', de: 'Marktort' } });
  return { rgba: out, legend: { title: { en: 'Markets: leading trade power (paler: less trade)', de: 'Märkte: stärkste Handelsmacht (blasser: weniger Handel)' }, items, good: -1, goodOptional: true } };
}
void MAX_HOPS;
