// The simulated economy: population groups produce, earn, pay taxes and buy their needs in regional markets.
// Prices form from accumulated buy and sell orders; goods flow between markets along land and sea links
// when price differences exceed transport cost, tolls and risk.
import type { GameState, Market, Nation } from '../types';
import type { World } from '../world';
import { type Ctx, type System, addIncome, addExpense, clamp, mod, EPOCH } from '../ctx';
import { C, CL, G, GOODS, GI, NEEDS, CLASS_NEED_MULT, CLASS_MAX_TIER, RECIPES, METHODS, TERRAIN_DEF, TERRAINS, B, BI, RAW_FROM_MINE } from '../defs';
import { hash01 } from '../rng';
import { lawEffect } from './politics';

export const BUCKETS = 30;
export const CROWN_SHARE = 0.12;
const NEED_IDX = NEEDS.map(([g, q, t]) => [GI[g], q / 100, t] as [number, number, number]);
const TIER_W = [0.5, 0.25, 0.15, 0.1];
// relative transport weight per good (bulky goods cost more to move)
const WEIGHT = new Float64Array(G);
for (let g = 0; g < G; g++) { const b = GOODS[g].base; WEIGHT[g] = b < 2 ? 1 : b < 6 ? 0.6 : b < 15 ? 0.3 : 0.12; }
const SILVER = GI.silver, GOLD = GI.gold;

/** Per-location derived economy numbers from the last processed month (for tooltips & map modes). */
export interface LocEcon { grain: Float32Array; rgo: Float32Array; craft: Float32Array; tax: Float32Array; income: Float32Array }
export let LOC_ECON: LocEcon | null = null;
function locEcon(L: number) { if (!LOC_ECON || LOC_ECON.grain.length !== L) LOC_ECON = { grain: new Float32Array(L), rgo: new Float32Array(L), craft: new Float32Array(L), tax: new Float32Array(L), income: new Float32Array(L) }; return LOC_ECON; }

/** Per-tier price of the basket (per person) and how well the market can fill it; recomputed when prices change. */
const TC = new WeakMap<Market, { pos: number; cost: Float64Array; fill: Float64Array }>();
function tierCache(m: Market) {
  if (!m.tierAcc) m.tierAcc = new Float64Array(4);
  let c = TC.get(m);
  if (c && c.pos === m.histPos) return c;
  c = { pos: m.histPos, cost: new Float64Array(4), fill: new Float64Array(4) };
  const ws = new Float64Array(4);
  for (const [g, q, tier] of NEED_IDX) { const v = q * m.price[g]; c.cost[tier] += v; c.fill[tier] += marketFill(m, g) * v; ws[tier] += v; }
  for (let t = 0; t < 4; t++) c.fill[t] = ws[t] > 0 ? c.fill[t] / ws[t] : 1;
  TC.set(m, c); return c;
}
export function invalidateTierCache(m: Market) { TC.delete(m); }
export function marketFill(m: Market, g: number): number {
  const d = m.demand[g]; if (d <= 1e-9) return 1;
  return clamp(m.supply[g] / d, 0, 1);
}

/** Rate at which the crown taxes class c in location i (after control, privileges and law). */
const TAXC = new WeakMap<Nation, { e: number; rate: Float64Array; farm: boolean }>();
export function effectiveTax(s: GameState, n: Nation, i: number, c: number): number {
  let k = TAXC.get(n);
  if (!k || k.e !== EPOCH.v) {
    const rate = new Float64Array(C);
    const common = (1 - n.corruption) * (1 + mod(n, 'tax'));
    for (let q = 0; q < C; q++) rate[q] = (n.taxRate[q] ?? 0.05) * (1 - clamp(lawEffect(n, `exempt_${q}`), 0, 1)) * common;
    k = { e: EPOCH.v, rate, farm: lawEffect(n, 'tax_farming') > 0 };
    TAXC.set(n, k);
  }
  const ctrl = s.loc.control[i];
  return k.rate[c] * (k.farm ? 0.75 + 0.25 * ctrl : ctrl);
}

export function locationStep(s: GameState, w: World, i: number) {
  const lc = s.loc; const o = lc.owner[i];
  const m = s.markets[lc.market[i]];
  if (!m) return;
  const n = o >= 0 ? s.nations[o] : null;
  const base = i * C;
  const P = lc.pop;
  const pl = s.priceLevel;
  const terr = TERRAIN_DEF[TERRAINS[w.terrain[i]]];
  const farmLvl = lc.buildings[i * B + BI.farm];
  const mineLvl = lc.buildings[i * B + BI.mine];
  const wsLvl = lc.buildings[i * B + BI.workshop];
  const portLvl = lc.buildings[i * B + BI.port];
  const devast = lc.devast[i];
  const techA = n ? 1 + (n.tech[1] - 1) * 0.04 : 1;
  const arid = w.arid[i];
  const ec = locEcon(w.L);
  // ---- agriculture ----
  const peas = P[base + CL.peasants], lab = P[base + CL.labourers];
  const aridMult = arid > 0.85 ? 0.25 : arid > 0.6 ? 0.6 : 1;
  const serfdom = n ? lawEffect(n, 'serfdom') : 0; // 0 free .. 1 full serfdom
  const yieldMult = terr.yield * lc.harvest[i] * (1 + 0.12 * farmLvl) * (1 - 0.7 * devast) * techA * aridMult * (1 - 0.08 * serfdom);
  const grainQ = peas * 0.155 * yieldMult;
  m.sAcc[GI.grain] += grainQ;
  // ---- natural resource ----
  const r = w.resource[i];
  const rgoWorkers = lab * 0.55 + peas * 0.22;
  let rgoMult = (1 + 0.6 * mineLvl * (RAW_FROM_MINE.has(GOODS[r].id) ? 1 : 0)) * (1 - 0.6 * devast);
  if (GOODS[r].id === 'fish') rgoMult *= 1 + 0.25 * portLvl;
  if (r === GI.grain) rgoMult *= yieldMult;
  const rgoQ = rgoWorkers * 0.22 / GOODS[r].base * rgoMult * techA;
  if (r === SILVER || r === GOLD) {
    // precious metals become coin: money supply
    s.silverStock += rgoQ * GOODS[r].base * 2e-8;
  }
  m.sAcc[r] += rgoQ;
  const pGrain = m.price[GI.grain], pR = m.price[r];
  // ---- household production: firewood, homespun cloth, baking and brewing (most of what common folk use) ----
  let ptotH = 0; for (let c = 0; c < C; c++) ptotH += P[base + c];
  const hh = ptotH / 100 * (1 - 0.6 * devast);
  const woodQ = hh * 1.5 * clamp(0.25 + w.forest[i] * 1.4, 0.1, 1.4);
  const clothQ = hh * 0.7 * (arid > 0.85 ? 0.6 : 1);
  const breadQ = hh * 1.7, beerQ = hh * (arid > 0.6 ? 0.3 : 1.1);
  m.sAcc[GI.timber] += woodQ; m.sAcc[GI.clothing] += clothQ; m.sAcc[GI.bread] += breadQ; m.sAcc[GI.beer] += beerQ;
  m.dAcc[GI.grain] += breadQ * 0.8 + beerQ * 0.5; // baking and brewing use grain
  const hhValue = woodQ * m.price[GI.timber] + clothQ * m.price[GI.clothing] * 0.5 + (breadQ * (m.price[GI.bread] - pGrain * 0.8) + beerQ * (m.price[GI.beer] - pGrain * 0.5));
  const agriValue = grainQ * pGrain + rgoQ * pR;
  // ---- crafts ----
  let craftValue = 0, craftProfit = 0;
  const art = P[base + CL.artisans] + P[base + CL.wage_workers];
  const slots = [lc.workshop[i * 3], lc.workshop[i * 3 + 1], lc.workshop[i * 3 + 2]].filter((v) => v > 0);
  if (slots.length && art > 0) {
    const cap = (1 + wsLvl) * 1600 * (1 + lc.buildings[i * B + BI.manufactory]);
    const workers = Math.min(art, cap * slots.length);
    const per = workers / slots.length;
    const meth = METHODS[lc.method[i]]?.mult ?? 1;
    const prodMod = 1 + (n ? mod(n, 'production') + (n.tech[1] - 1) * 0.03 : 0);
    for (const sl of slots) {
      const rc = RECIPES[sl - 1];
      let scale = 1;
      for (const [gid, q] of rc.inputs) scale = Math.min(scale, 0.25 + 0.75 * marketFill(m, GI[gid]));
      const k = per / 100 * scale;
      let inCost = 0;
      for (const [gid, q] of rc.inputs) { const gi = GI[gid]; m.dAcc[gi] += q * k; inCost += q * k * m.price[gi]; }
      const outQ = rc.outQty * k * meth * prodMod;
      const og = GI[rc.out];
      m.sAcc[og] += outQ;
      const val = outQ * m.price[og];
      craftValue += val; craftProfit += val - inCost;
    }
  }
  // ---- incomes per class (marks per month, total for the class in this location) ----
  const rent = 0.12 + 0.2 * serfdom;      // dues to the nobility
  const tithe = 0.08;
  const inc = new Float64Array(C);
  inc[CL.peasants] = (grainQ * pGrain + rgoQ * pR * (peas * 0.22 / Math.max(1, rgoWorkers))) * (1 - rent - tithe) + Math.max(0, hhValue) * 0.65;
  const hhRest = Math.max(0, hhValue) * 0.35;
  inc[CL.labourers] = rgoQ * pR * (lab * 0.55 / Math.max(1, rgoWorkers)) * 0.8 + Math.max(0, craftProfit) * 0.1 + hhRest * 0.6 + grainQ * pGrain * 0.12;
  inc[CL.artisans] = hhRest * 0.4;
  inc[CL.artisans] += Math.max(0, craftProfit) * 0.6 + craftValue * 0.05;
  inc[CL.wage_workers] = 0;
  if (P[base + CL.wage_workers] > 0) { const ww = P[base + CL.wage_workers] / Math.max(1, art); inc[CL.wage_workers] = inc[CL.artisans] * ww * 0.6; inc[CL.artisans] *= 1 - ww * 0.6; }
  const marketBonus = 1 + 0.25 * lc.buildings[i * B + BI.market];
  inc[CL.burghers] = (Math.max(0, craftProfit) * 0.3 + (agriValue + craftValue) * 0.035 * marketBonus) * (1 + (n ? mod(n, 'trade') : 0));
  inc[CL.nobles] = agriValue * rent;
  inc[CL.clergy] = agriValue * tithe + rgoQ * 0;
  // ---- taxes ----
  let taxTotal = 0;
  if (n) {
    for (let c = 0; c < C; c++) {
      const t = inc[c] * effectiveTax(s, n, i, c);
      inc[c] -= t; taxTotal += t;
    }
    // most of what the people pay stays with lords, towns and collectors; the crown receives its share
    taxTotal *= CROWN_SHARE;
    if (lc.ctrl[i] === o) {
      addIncome(n, 'tax', taxTotal);
    } else if (lc.ctrl[i] >= 0) {
      // occupied: occupier collects a contribution
      addIncome(s.nations[lc.ctrl[i]], 'contributions', taxTotal * 0.5);
    }
  }
  lc.income[i] = taxTotal;
  ec.grain[i] = grainQ; ec.rgo[i] = rgoQ; ec.craft[i] = craftValue; ec.tax[i] = taxTotal; ec.income[i] = 0;
  // ---- consumption of needs ----
  let unrestSol = 0, popTot = 0;
  for (let c = 0; c < C; c++) {
    const pc = P[base + c];
    if (pc < 1) { lc.sol[base + c] = 0.5; continue; }
    const wealthPC = lc.wealth[base + c];
    let budget = inc[c] + wealthPC * pc * 0.08;
    ec.income[i] += inc[c];
    const mult = CLASS_NEED_MULT[c];
    const maxT = CLASS_MAX_TIER[c];
    let sol = 0, spent = 0;
    const tc = tierCache(m);
    for (let t = 0; t <= 3; t++) {
      if (t > maxT) break;
      const cost = tc.cost[t] * mult * pc;
      if (cost <= 0) continue;
      // poorer classes get basic food partly through subsistence (own harvest), not only purchases
      const subsidy = t === 0 && (c === CL.peasants) ? Math.min(cost * 0.6, grainQ * pGrain * 0.6) : 0;
      const f = clamp((budget + subsidy) / cost, 0, 1);
      m.tierAcc![t] += mult * pc * f; // demand units, distributed over the tier's goods at month end
      const ful = f * tc.fill[t];
      sol += TIER_W[t] * ful;
      const sp = Math.max(0, cost * f - subsidy);
      spent += sp; budget -= sp;
      if (f < 1) break;
    }
    // normalise: classes that cannot reach top tiers judge by what they expect
    let wmax = 0; for (let t = 0; t <= maxT; t++) wmax += TIER_W[t];
    sol = sol / wmax;
    lc.sol[base + c] = lc.sol[base + c] * 0.6 + sol * 0.4;
    // savings
    const saved = inc[c] - spent;
    lc.wealth[base + c] = Math.max(0, wealthPC * 0.995 + saved / pc);
    unrestSol += lc.sol[base + c] * pc; popTot += pc;
  }
  // ---- demography ----
  // food security: own harvest plus what the market supplies
  const grainNeed = Math.max(1, ptotH / 100 * 9);
  const food = clamp(0.55 * Math.min(1, grainQ / grainNeed) + 0.45 * marketFill(m, GI.grain) * Math.min(1, lc.harvest[i] + 0.2) + 0.1, 0, 1);
  const plague = lc.plague[i];
  const growthMod = terr.growth;
  for (let c = 0; c < C; c++) {
    const pc = P[base + c]; if (pc <= 0) continue;
    const fs = c === CL.peasants || c === CL.labourers ? food : Math.max(food, 0.8);
    const birth = 0.0034 * (0.7 + 0.3 * growthMod) * (0.85 + 0.3 * lc.sol[base + c]);
    const death = 0.0028 + Math.max(0, 0.6 - fs) * 0.035 + plague * 0.05 + devast * 0.003;
    P[base + c] = Math.max(0, pc * (1 + birth - death));
  }
  // social mobility: profitable crafts draw peasants into towns, failing crafts push artisans back
  const urbanPull = clamp((lc.sol[base + CL.artisans] - lc.sol[base + CL.peasants]) * 0.002, -0.002, 0.002);
  const capArt = (1 + wsLvl) * 1600 * Math.max(1, slots.length);
  if (urbanPull > 0 && P[base + CL.artisans] < capArt) { const mv = P[base + CL.peasants] * urbanPull; P[base + CL.peasants] -= mv; P[base + CL.artisans] += mv * 0.7; P[base + CL.burghers] += mv * 0.1; P[base + CL.labourers] += mv * 0.2; }
  else if (urbanPull < 0 && P[base + CL.artisans] > 50) { const mv = P[base + CL.artisans] * -urbanPull; P[base + CL.artisans] -= mv; P[base + CL.peasants] += mv; }
  // manufactories turn artisans into wage workers
  if (lc.buildings[i * B + BI.manufactory] > 0 && P[base + CL.artisans] > 100) { const mv = P[base + CL.artisans] * 0.01; P[base + CL.artisans] -= mv; P[base + CL.wage_workers] += mv; }
  // ---- unrest ----
  if (n) {
    const avgSol = popTot > 0 ? unrestSol / popTot : 0.5;
    let u = (0.55 - avgSol) * 40;
    const taxBurden = n.taxRate[CL.peasants] * 60;
    u += taxBurden;
    if (lc.faith[i] !== n.faith) u += 8 * (1 - (n ? lawEffect(n, 'tolerance') : 0));
    if (lc.culture[i] !== n.culture) u += 4;
    u += n.warExhaustion * 0.12 + devast * 12 + (1 - lc.control[i]) * 6 - n.concord * 0.08 - 2;
    u += mod(n, 'unrest');
    u += n.inflation * 20;
    if (s.loc.core[i] !== o) u += 6;
    lc.unrest[i] = clamp(lc.unrest[i] * 0.7 + u * 0.3, 0, 100);
  }
  // ---- development drifts toward what the population and buildings support ----
  let bsum = 0; for (let b = 0; b < B; b++) bsum += lc.buildings[i * B + b];
  let ptot = 0; for (let c = 0; c < C; c++) ptot += P[base + c];
  const target = Math.sqrt(ptot / 1000) * 2.2 * (1 + bsum * 0.04) * (0.8 + 0.4 * lc.control[i]);
  lc.dev[i] += (target - lc.dev[i]) * 0.02;
  lc.devast[i] = Math.max(0, devast - 0.01);
  // literacy grows with clergy/schools/universities
  const lit = 0.02 + lc.buildings[i * B + BI.church] * 0.02 + lc.buildings[i * B + BI.university] * 0.08 + (n ? (n.tech[0] - 1) * 0.01 : 0);
  lc.literacy[i] += (lit - lc.literacy[i]) * 0.01;
  void pl;
}

/** Market clearing, inter-market trade, price history. Called at the start of each month. */
export function clearMarkets(s: GameState, w: World) {
  const ms = s.markets;
  const flows: GameState['flows'] = [];
  // 0. turn per-tier demand units into demand for each good
  for (const m of ms) { if (!m.tierAcc) continue; for (const [g, q, tier] of NEED_IDX) m.dAcc[g] += q * m.tierAcc[tier]; m.tierAcc.fill(0); }
  // 1. inter-market trade on last month's prices
  for (const a of ms) a.flowOut.fill(0);
  for (const a of ms) {
    for (const lk of a.links) {
      if (lk.to < a.id) continue;
      const b = ms[lk.to];
      const blocked = tradeBlocked(s, a, b, lk.sea);
      if (blocked >= 1) continue;
      for (let g = 0; g < G; g++) {
        const pa = a.price[g], pb = b.price[g];
        const cost = lk.cost * WEIGHT[g] * GOODS[g].base * 0 + lk.cost * WEIGHT[g] * 4 + 0.03 * Math.min(pa, pb);
        const tariff = (s.nations[b.owner]?.tariff ?? 0) * 0.5;
        let from = a, to = b, diff = pb - pa * (1 + tariff) - cost;
        if (diff < 0) { from = b; to = a; diff = pa - pb * (1 + (s.nations[a.owner]?.tariff ?? 0) * 0.5) - cost; }
        if (diff <= 0) continue;
        const surplus = Math.max(0, from.sAcc[g] - from.dAcc[g] * 0.7);
        if (surplus <= 0) continue;
        const steer = 1 + (to.merchants[to.owner] || 0) * 0.02;
        const qty = Math.min(surplus * 0.35, surplus * clamp(diff / Math.max(0.01, from.price[g]), 0, 1) * 0.6 * steer) * (1 - blocked);
        if (qty <= 1e-6) continue;
        from.sAcc[g] -= qty; to.sAcc[g] += qty;
        from.flowOut[g] += qty; to.flowOut[g] -= qty;
        const value = qty * from.price[g];
        flows.push({ from: from.id, to: to.id, good: g, qty, value });
        // merchants of the exporting hub earn the margin; tolls go to the importing hub's ruler
        const fo = s.nations[from.owner]; const tn = s.nations[to.owner];
        if (fo && fo.alive) addIncome(fo, 'trade', qty * diff * 0.08 * (1 + mod(fo, 'trade')));
        if (tn && tn.alive) addIncome(tn, 'tariffs', value * (tn.tariff * 0.35));
      }
    }
  }
  flows.sort((p, q) => q.value - p.value);
  s.flows = flows.slice(0, 400);
  // 2. clearing and price formation
  const pl = s.priceLevel;
  for (const m of ms) {
    const ownerN = s.nations[m.owner];
    const debase = ownerN ? 1 + ownerN.inflation : 1;
    let idx = 0, wsum = 0;
    for (let g = 0; g < G; g++) {
      const S = m.sAcc[g] + m.stock[g] * 0.5;
      const D = m.dAcc[g];
      const anchor = GOODS[g].base * pl * debase;
      let p = m.price[g];
      if (S + D > 1e-6) {
        const ratio = (D + 0.02 * anchor) / (S + 0.02 * anchor);
        const step = clamp(Math.pow(ratio, 0.3), 0.82, 1.22);
        p = p * step;
      }
      // anchor drift (imports from outside the map, substitution) keeps prices in plausible historical ranges
      p = p * 0.96 + anchor * 0.04;
      p = clamp(p, anchor * 0.2, anchor * 6);
      m.price[g] = p;
      m.supply[g] = S; m.demand[g] = D;
      const traded = Math.min(S, D);
      m.stock[g] = Math.min((S - traded) * 0.85, D * 3 + 100);
      m.sAcc[g] = 0; m.dAcc[g] = 0;
      m.hist[g * 120 + m.histPos] = p;
      const wt = GOODS[g].tier === 0 ? 3 : 1;
      idx += (p / (GOODS[g].base * pl)) * wt; wsum += wt;
    }
    m.histPos = (m.histPos + 1) % 120;
    m.priceIndex = idx / wsum;
    m.owner = s.loc.owner[m.hub];
  }
}

/** 0 = free, 1 = fully blocked trade between two markets (war, blockade, piracy, embargo). */
function tradeBlocked(s: GameState, a: Market, b: Market, sea: boolean): number {
  const oa = a.owner, ob = b.owner;
  if (oa < 0 || ob < 0) return 0;
  let blk = 0;
  for (const war of s.wars) {
    const aa = war.att.includes(oa), ad = war.def.includes(oa), ba = war.att.includes(ob), bd = war.def.includes(ob);
    if ((aa && bd) || (ad && ba)) blk = Math.max(blk, 0.85);
  }
  // occupation of a hub cuts its trade heavily
  if (s.loc.ctrl[a.hub] !== a.owner || s.loc.ctrl[b.hub] !== b.owner) blk = Math.max(blk, 0.6);
  if (sea) blk = Math.max(blk, (s.flags[`blockade_${a.id}`] || 0) > s.day ? 0.9 : 0, (s.flags[`blockade_${b.id}`] || 0) > s.day ? 0.9 : 0);
  if (s.flags[`embargo_${oa}_${ob}`] || s.flags[`embargo_${ob}_${oa}`]) blk = Math.max(blk, 0.95);
  return blk;
}

export function harvests(s: GameState, w: World, year: number) {
  // regional weather: large-scale correlated anomalies + local noise
  for (let i = 0; i < w.L; i++) {
    const rx = Math.floor(w.lon[i] / 8), ry = Math.floor(w.lat[i] / 6);
    const reg = hash01(rx * 131 + ry, year, 17);
    const loc = hash01(i, year, 3);
    let h = 1 + (reg - 0.5) * 0.45 + (loc - 0.5) * 0.15;
    if (reg < 0.06) h -= 0.35; // regional harvest failure
    if (s.flags[`harvest_fail_${year}`] && hash01(rx, ry, year) < 0.4) h -= 0.3;
    s.loc.harvest[i] = clamp(h, 0.3, 1.35);
  }
}

export function monthlyLedger(s: GameState, w: World) {
  // per-nation monthly fixed items: court, interest, inflation & coinage, loans
  for (const n of s.nations) {
    if (!n.alive) continue;
    // court & administration upkeep scales with realm size
    let locs = 0; // computed in politics monthly; reuse history
    const last = n.history[n.history.length - 1];
    locs = last ? last.locs : 10;
    addExpense(n, 'court', 20 + locs * 4 * (1 + n.corruption));
    // interest
    let interest = 0; for (const l of n.loans) interest += l.amount * l.rate / 12;
    if (interest > 0) addExpense(n, 'interest', interest);
    // debasement: extra coin now, inflation later
    if (n.coinage > 0) {
      const extra = (n.income.tax || 0) * n.coinage;
      addIncome(n, 'minting', extra);
      n.inflation = clamp(n.inflation + n.coinage * 0.01, 0, 1.5);
    } else n.inflation = Math.max(0, n.inflation - 0.0015);
    // loans due
    for (const l of n.loans.slice()) {
      if (l.due <= s.day) {
        if (n.treasury >= l.amount) { addExpense(n, 'loan_repay', l.amount); n.loans.splice(n.loans.indexOf(l), 1); }
        else { l.due = s.day + 365; l.rate += 0.02; n.mandate -= 2; }
      }
    }
    n.debt = n.loans.reduce((a, l) => a + l.amount, 0);
    // bankruptcy when debt crushing and treasury negative
    if (n.treasury < 0) {
      const need = -n.treasury + 50;
      if (n.loans.length < 6 + (n.flags.bankrupt_until && n.flags.bankrupt_until > s.day ? -10 : 0)) {
        takeLoan(s, n, need);
      } else declareBankruptcy(s, n);
    }
    // roll ledger
    n.income = n.incomeAcc; n.expense = n.expenseAcc; n.incomeAcc = {}; n.expenseAcc = {};
  }
}

export function takeLoan(s: GameState, n: Nation, amount: number) {
  const base = 0.05 + n.loans.length * 0.012 + (n.flags.bankrupt_until && n.flags.bankrupt_until > s.day - 3650 ? 0.06 : 0) - mod(n, 'interest');
  const lenders = ['Bardi', 'Peruzzi', 'Medici', 'Fugger', 'Welser', 'Grimaldi', 'Lombard bankers', 'Hanseatic merchants', 'Jewish moneylenders', 'Genoese Casa di San Giorgio'];
  const year = s.startYear + Math.floor(s.day / 365);
  const avail = lenders.filter((l, k) => year >= [1300, 1300, 1397, 1480, 1490, 1300, 1300, 1300, 1300, 1407][k] && year <= [1345, 1343, 1494, 1650, 1650, 1815, 1815, 1815, 1815, 1805][k]);
  n.loans.push({ amount, rate: Math.max(0.03, base), due: s.day + 365 * 5, lender: avail[(s.day + n.id) % Math.max(1, avail.length)] || 'Lombard bankers' });
  n.treasury += amount;
}

export function declareBankruptcy(s: GameState, n: Nation) {
  n.loans = []; n.debt = 0; n.treasury = 0;
  n.concord = clamp(n.concord - 40, -100, 100); n.mandate = clamp(n.mandate - 20, 0, 100); n.prestige -= 25;
  n.flags.bankrupt_until = s.day + 365 * 5;
  n.modifiers.push({ id: 'bankruptcy', until: s.day + 365 * 5, label: { en: 'State bankruptcy', de: 'Staatsbankrott' }, effects: { tax: -0.25, unrest: 8, interest: 0.05 } });
  // unpaid soldiers desert
  for (const a of s.armies) if (a.owner === n.id && !a.fleet) for (const r of a.regs) r.men *= 0.6;
  s.chronicle.push({ day: s.day, nation: n.id, kind: 'bankruptcy', text: { en: `${n.short.en} declared bankruptcy; its creditors were ruined and its soldiers went unpaid.`, de: `${n.short.de} erklärte den Staatsbankrott; die Gläubiger waren ruiniert, die Söldner blieben unbezahlt.` } });
}

export function updateMoney(s: GameState) {
  // price level follows money in circulation relative to real output
  const target = Math.pow(Math.max(0.2, s.silverStock), 0.55);
  s.priceLevel += (target - s.priceLevel) * 0.01;
}

export const economy: System = {
  id: 'economy',
  init(s, w) {
    harvests(s, w, s.startYear);
    // warm up: two full passes to settle prices and incomes
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < w.L; i++) if (s.loc.owner[i] >= 0 || s.loc.pop[i * C] > 0) locationStep(s, w, i);
      clearMarkets(s, w);
      for (const n of s.nations) { n.treasury = 0; n.income = n.incomeAcc; n.incomeAcc = {}; n.expenseAcc = {}; }
    }
    // starting treasuries: ~ 4 months of tax income
    for (const n of s.nations) n.treasury = Math.max(50, (n.income.tax || 0) * 4);
  },
  daily({ s, w }) {
    const b = s.day % BUCKETS;
    for (let i = b; i < w.L; i += BUCKETS) locationStep(s, w, i);
  },
  monthly({ s, w }) {
    clearMarkets(s, w);
    updateMoney(s);
    monthlyLedger(s, w);
  },
  yearly({ s, w, date }) {
    harvests(s, w, date.y);
  },
};
