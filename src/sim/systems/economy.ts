// The simulated economy: population groups produce, earn, pay taxes and buy their needs in regional markets.
// Prices form from accumulated buy and sell orders; goods flow between markets along land and sea links
// when price differences exceed transport cost, tolls and risk.
import type { GameState, Market, Nation } from '../types';
import type { World } from '../world';
import { type Ctx, type System, addIncome, addExpense, clamp, EPOCH } from '../ctx';
import { C, CL, G, GOODS, GI, NEEDS, CLASS_NEED_MULT, CLASS_MAX_TIER, RECIPES, METHODS, TERRAIN_DEF, TERRAINS, B, BI, RAW_FROM_MINE } from '../defs';
import { hash01 } from '../rng';
import { lawEffect, officeBonusOf } from './politics';
import { dutyUnrest } from './duties';
import { secondFaith } from './faith';

export const BUCKETS = 30;
export const CROWN_SHARE = 0.08;
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
const TC = new WeakMap<Market, { pos: number; cost: Float64Array; fill: Float64Array; wq: Float64Array }>();
function tierCache(m: Market, pl: number) {
  if (!m.tierAcc) m.tierAcc = new Float64Array(4);
  let c = TC.get(m);
  if (c && c.pos === m.histPos) return c;
  c = { pos: m.histPos, cost: new Float64Array(4), fill: new Float64Array(4), wq: new Float64Array(NEED_IDX.length) };
  const ws = new Float64Array(4);
  // substitution inside a tier: dear goods lose part of their share to cheaper ones (same total quantity per tier)
  const qs = new Float64Array(4), qa = new Float64Array(4);
  NEED_IDX.forEach(([g, q, tier], k) => { const a = GOODS[g].base * pl; const rel = clamp(a / Math.max(1e-9, m.price[g]), 0.25, 4); c!.wq[k] = q * Math.pow(rel, 0.8); qs[tier] += q; qa[tier] += c!.wq[k]; });
  NEED_IDX.forEach(([, , tier], k) => { c!.wq[k] *= qa[tier] > 0 ? qs[tier] / qa[tier] : 1; });
  NEED_IDX.forEach(([g, , tier], k) => { const q = c!.wq[k]; const v = q * m.price[g]; c!.cost[tier] += v; c!.fill[tier] += marketFill(m, g) * v; ws[tier] += v; });
  for (let t = 0; t < 4; t++) c.fill[t] = ws[t] > 0 ? c.fill[t] / ws[t] : 1;
  TC.set(m, c); return c;
}
export function invalidateTierCache(m: Market) { TC.delete(m); }
export function marketFill(m: Market, g: number): number {
  const d = m.demand[g]; if (d <= 1e-9) return 1;
  return clamp(m.supply[g] / d, 0, 1);
}

/** Rate at which the crown taxes class c in location i (after control, integration, privileges, law and treasurer). */
const TAXC = new WeakMap<Nation, { e: number; rate: Float64Array; farm: boolean }>();
const EXEMPT_KEYS = Array.from({ length: C }, (_, q) => `exempt_${q}`);
/** Characters of the state of the current pass (the treasurer's skill is read from them). */
let CHARS: GameState['chars'] = {};
function taxTable(n: Nation, chars: GameState['chars']) {
  let k = TAXC.get(n);
  if (!k || k.e !== EPOCH.v) {
    const rate = new Float64Array(C);
    const common = taxCommon(n, chars);
    for (let q = 0; q < C; q++) rate[q] = (n.taxRate[q] ?? 0.05) * (1 - clamp(lawEffect(n, EXEMPT_KEYS[q]), 0, 1)) * common;
    k = { e: EPOCH.v, rate, farm: lawEffect(n, 'tax_farming') > 0 };
    TAXC.set(n, k);
  }
  return k;
}
/** Factor on every class tax: honest collection, tax effects of laws, values, tradition and modifiers, and the treasurer. */
export function taxCommon(n: Nation, chars: GameState['chars']): number {
  const tr = chars[n.council.treasurer];
  return Math.max(0, (1 - n.corruption) * (1 + lawEffect(n, 'tax')) * (1 + (tr && tr.alive ? officeBonusOf(tr, 'treasurer') : 0)));
}
/** Share of its taxes, levies and manpower a location yields while it is still being integrated (1 when integrated). */
export function integrationYield(integ: number): number { return 0.3 + 0.7 * clamp(integ, 0, 1); }
export function effectiveTax(s: GameState, n: Nation, i: number, c: number): number {
  const k = taxTable(n, s.chars);
  const ctrl = s.loc.control[i];
  return k.rate[c] * (k.farm ? 0.75 + 0.25 * ctrl : ctrl) * integrationYield(s.loc.integ[i]);
}

/** Output per hundred artisans and month, relative to a recipe's listed quantity (tuned so towns can meet
 *  the demand of the realm for finished goods; household production covers the basics). */
const CRAFT_PROD = 6;
/** resource -> [processed good, output per unit of raw, share of the raw that villages process themselves] */
const RURAL: Record<number, [number, number, number]> = {
  [GI.grapes]: [GI.wine, 0.8, 0.6], [GI.olives]: [GI.olive_oil, 0.9, 0.6], [GI.flax]: [GI.linen, 0.7, 0.5],
  [GI.wool]: [GI.cloth, 0.6, 0.3], [GI.livestock]: [GI.leather, 0.25, 0.25], [GI.sugarcane]: [GI.sugar, 0.4, 0.3],
};

// lookups resolved once for the per-location step
const TERR_AT = TERRAINS.map((x) => TERRAIN_DEF[x]);
const FROM_MINE = Uint8Array.from(GOODS, (g) => (RAW_FROM_MINE.has(g.id) ? 1 : 0));
const FISH = GI.fish;
const REC_IN: Int32Array[] = RECIPES.map((rc) => Int32Array.from(rc.inputs, ([gid]) => GI[gid]));
const REC_Q: Float64Array[] = RECIPES.map((rc) => Float64Array.from(rc.inputs, ([, q]) => q));
const REC_OUT = Int32Array.from(RECIPES, (rc) => GI[rc.out]);
const G_GRAIN = GI.grain, G_TIMBER = GI.timber, G_CLOTHING = GI.clothing, G_BREAD = GI.bread, G_BEER = GI.beer, G_LINEN = GI.linen, G_LEATHER = GI.leather;
const INC = new Float64Array(C);
const LANDLORDS = [CL.nobles, CL.clergy], SELLERS = [CL.artisans, CL.burghers, CL.labourers, CL.wage_workers];
const SLOTS = new Int32Array(3);
// Per-nation numbers read by locationStep, gathered once per pass over the locations (economy.daily / init).
// Reading them from one typed table keeps locationStep away from the many shapes nation objects take on,
// which otherwise keep throwing its optimised code away. Values are exactly what the step read before.
const NX = 14 + C;
const NSF = NX + 9 + C; // a Tengri realm's second faith
const NK = NSF + 1; // techA, serfdom, prodX, trade, taxP, tolerance, warEx, concord, inflation, unrest, lit0, culture, faith, farm, rate[C], then (NX) growth, literacy, quality, over-extension, land, hearth, excise, duty unrest, nobles' hearth exemption, exemption[C], then (NSF) second faith
let NS = new Float64Array(0), NST = new Int32Array(0), PASS = 0;
function nationRow(n: Nation): number {
  const o = n.id;
  if (o >= NST.length) { const ns = new Float64Array((o + 64) * NK); ns.set(NS); NS = ns; const st = new Int32Array(o + 64); st.set(NST); NST = st; }
  const r = o * NK;
  if (NST[o] === PASS) return r;
  NST[o] = PASS;
  const t1 = n.tech[1] - 1;
  NS[r] = 1 + t1 * 0.04;
  NS[r + 1] = lawEffect(n, 'serfdom');
  NS[r + 2] = lawEffect(n, 'production') + t1 * 0.03;
  NS[r + 3] = lawEffect(n, 'trade');
  NS[r + 4] = n.taxRate[CL.peasants];
  NS[r + 5] = lawEffect(n, 'tolerance');
  NS[r + 6] = n.warExhaustion; NS[r + 7] = n.concord; NS[r + 8] = n.inflation;
  NS[r + 9] = lawEffect(n, 'unrest');
  NS[r + 10] = (n.tech[0] - 1) * 0.01;
  NS[r + 11] = n.culture; NS[r + 12] = n.faith;
  const tt = taxTable(n, CHARS); NS[r + 13] = tt.farm ? 1 : 0;
  for (let c = 0; c < C; c++) NS[r + 14 + c] = tt.rate[c];
  NS[r + NX] = lawEffect(n, 'growth'); NS[r + NX + 1] = lawEffect(n, 'literacy'); NS[r + NX + 2] = lawEffect(n, 'quality');
  NS[r + NX + 3] = overextension(n);
  NS[r + NX + 4] = n.duties?.land ?? 0; NS[r + NX + 5] = n.duties?.hearth ?? 0; NS[r + NX + 6] = n.duties?.excise ?? 0;
  NS[r + NX + 7] = dutyUnrest(n);
  NS[r + NX + 8] = clamp(lawEffect(n, 'hearth_exempt_nobles'), 0, 1);
  for (let c = 0; c < C; c++) NS[r + NX + 9 + c] = clamp(lawEffect(n, EXEMPT_KEYS[c]), 0, 1);
  NS[r + NSF] = secondFaith(n); // a Tengri realm's second faith is not foreign (-1: none)
  return r;
}

/** What the tax instruments took last call: [land, hearth, excise] in total, and per class (DUTY_BY[d * C + c]). */
export const DUTY_PAID = new Float64Array(3), DUTY_BY = new Float64Array(3 * C);
/** The tax instruments in one location (systems/duties.ts), taken from the class incomes inc (changed in place).
 *  ex[eo] is the nobles' exemption from the hearth tax and ex[eo + 1 + c] the legal exemption of class c (0..1): an
 *  exempt class pays that share less of every duty.
 *  - land tax: a share of the value of harvests and raw goods; lords and church pay first, up to half their income,
 *    the peasants the rest (up to half of theirs). What exempt lords do not pay falls on the peasants.
 *  - hearth tax: a flat sum per hundred people, never more than a third of a class's income; the crown forgoes the
 *    share of exempt classes
 *  - excise: a share of the value of crafts and raw goods brought to market, paid by those who make and sell them;
 *    the crown forgoes the share of exempt classes */
export function collectDuties(inc: Float64Array, P: Float32Array, base: number, ex: Float64Array, eo: number, landR: number, hearthR: number, exciseR: number, agriValue: number, marketValue: number, tf: number, pl: number): number {
  DUTY_PAID.fill(0); DUTY_BY.fill(0);
  if (landR > 0) {
    let due = agriValue * landR * tf;
    for (const c of LANDLORDS) { const t = Math.min(due, inc[c] * 0.5) * (1 - ex[eo + 1 + c]); inc[c] -= t; due -= t; DUTY_BY[c] = t; DUTY_PAID[0] += t; }
    const c = CL.peasants, t = Math.min(due, inc[c] * 0.5) * (1 - ex[eo + 1 + c]); inc[c] -= t; DUTY_BY[c] += t; DUTY_PAID[0] += t;
  }
  if (hearthR > 0) {
    for (let c = 0; c < C; c++) {
      const free = c === CL.nobles ? Math.max(ex[eo + 1 + c], ex[eo]) : ex[eo + 1 + c];
      const t = Math.min(P[base + c] / 100 * hearthR * pl * tf, inc[c] / 3) * (1 - free);
      inc[c] -= t; DUTY_BY[C + c] = t; DUTY_PAID[1] += t;
    }
  }
  if (exciseR > 0) {
    const due = marketValue * exciseR * tf;
    const pay3 = inc[CL.artisans] + inc[CL.burghers] + inc[CL.labourers] + inc[CL.wage_workers];
    if (pay3 > 0) for (const c of SELLERS) { const t = Math.min(inc[c] * 0.5, due * inc[c] / pay3) * (1 - ex[eo + 1 + c]); inc[c] -= t; DUTY_BY[2 * C + c] = t; DUTY_PAID[2] += t; }
  }
  return DUTY_PAID[0] + DUTY_PAID[1] + DUTY_PAID[2];
}

/** One location's month of production, income, consumption and growth (see stepLocations). */
export function locationStep(s: GameState, w: World, i: number) { PASS++; stepLocations(s, w, i, i + 1, 1, false); } // a pass of its own: no per-nation row from an earlier pass (or another game) is reused
/** The step for locations from, from + stride, ... below to (only settled ones if settled is set). The loop lives
 *  inside the function so V8 can re-optimise it mid-loop (on-stack replacement) after a deoptimisation, instead of
 *  running it unoptimised for thousands of separate calls. */
// Tax and contribution payments of a pass, paid out in the same order after the loop (nothing in the loop reads
// treasuries or income ledgers), so the loop does not touch the differently shaped ledger objects.
let PAY_N = new Int32Array(1024), PAY_V = new Float64Array(1024), PAY_K = new Uint8Array(1024), NPAY = 0;
function pay(nation: number, kind: number, v: number) {
  if (NPAY === PAY_N.length) {
    const n2 = new Int32Array(NPAY * 2); n2.set(PAY_N); PAY_N = n2;
    const v2 = new Float64Array(NPAY * 2); v2.set(PAY_V); PAY_V = v2;
    const k2 = new Uint8Array(NPAY * 2); k2.set(PAY_K); PAY_K = k2;
  }
  PAY_N[NPAY] = nation; PAY_K[NPAY] = kind; PAY_V[NPAY] = v; NPAY++;
}
const PAY_KEYS = ['tax', 'contributions', 'land_tax', 'hearth_tax', 'excise'];
function flushPayments(s: GameState) {
  for (let k = 0; k < NPAY; k++) addIncome(s.nations[PAY_N[k]], PAY_KEYS[PAY_K[k]], PAY_V[k]);
  NPAY = 0;
}
/** Over-extension of a realm: how far the land still to be integrated exceeds what its administration can handle. */
export function overextension(n: Nation): number { return Math.max(0, (n.adminLoad ?? 0) / Math.max(1, n.adminCapacity) - 1); }
function stepLocations(s: GameState, w: World, from: number, to: number, stride: number, settled: boolean) {
  NPAY = 0; CHARS = s.chars;
  s.silverStock = stepLoop(s.loc, s.markets, s.nations, s.priceLevel, s.silverStock, w, from, to, stride, settled);
  flushPayments(s);
}
// The state's own fields are read once by the caller and passed in (the state object changes shape as a game
// goes on, which would otherwise throw the optimised loop away); silver is threaded through and written back.
function stepLoop(lc: GameState['loc'], markets: Market[], nations: Nation[], pl: number, silverIn: number, w: World, from: number, to: number, stride: number, settled: boolean): number {
  let silver = silverIn;
  for (let i = from; i < to; i += stride) {
    if (settled && !(lc.owner[i] >= 0 || lc.pop[i * C] > 0)) continue;
    const o = lc.owner[i];
    const m = markets[lc.market[i]];
    if (!m) continue;
    const n = o >= 0 ? nations[o] : null;
    const base = i * C;
    const P = lc.pop;
    const terr = TERR_AT[w.terrain[i]];
    const farmLvl = lc.buildings[i * B + BI.farm];
    const mineLvl = lc.buildings[i * B + BI.mine];
    const wsLvl = lc.buildings[i * B + BI.workshop];
    const portLvl = lc.buildings[i * B + BI.port];
    const devast = lc.devast[i];
    const nr = n ? nationRow(n) : -1, ns = NS;
    const techA = n ? ns[nr] : 1;
    const arid = w.arid[i];
    const ec = locEcon(w.L);
    // ---- agriculture ----
    const peas = P[base + CL.peasants], lab = P[base + CL.labourers];
    const aridMult = arid > 0.85 ? 0.25 : arid > 0.6 ? 0.6 : 1;
    const serfdom = n ? ns[nr + 1] : 0; // 0 free .. 1 full serfdom
    const yieldMult = terr.yield * lc.harvest[i] * (1 + 0.12 * farmLvl) * (1 - 0.7 * devast) * techA * aridMult * (1 - 0.08 * serfdom);
    const grainQ = peas * 0.155 * yieldMult;
    m.sAcc[G_GRAIN] += grainQ;
    // ---- natural resource ----
    const r = w.resource[i];
    const rgoWorkers = lab * 0.55 + peas * 0.22;
    let rgoMult = (1 + 0.6 * mineLvl * FROM_MINE[r]) * (1 - 0.6 * devast);
    if (r === FISH) rgoMult *= 1 + 0.25 * portLvl;
    if (r === G_GRAIN) rgoMult *= yieldMult;
    const rgoQ = rgoWorkers * 0.22 / GOODS[r].base * rgoMult * techA;
    if (r === SILVER || r === GOLD) {
      // precious metals become coin: money supply
      silver += rgoQ * GOODS[r].base * 2e-8;
    }
    // rural processing: villages press their own grapes and olives, ret their flax, card their wool
    const rp = RURAL[r];
    let ruralValue = 0;
    if (rp) {
      const raw = rgoQ * rp[2], out = raw * rp[1];
      m.sAcc[r] += rgoQ - raw; m.sAcc[rp[0]] += out;
      ruralValue = out * m.price[rp[0]] - raw * m.price[r];
    } else m.sAcc[r] += rgoQ;
    const pGrain = m.price[G_GRAIN], pR = m.price[r];
    // ---- household production: firewood, homespun cloth, baking and brewing (most of what common folk use) ----
    let ptotH = 0; for (let c = 0; c < C; c++) ptotH += P[base + c];
    const hh = ptotH / 100 * (1 - 0.6 * devast);
    const woodQ = hh * 1.5 * clamp(0.25 + w.forest[i] * 1.4, 0.1, 1.4);
    const clothQ = hh * 0.7 * (arid > 0.85 ? 0.6 : 1);
    const breadQ = hh * 1.7, beerQ = hh * (arid > 0.6 ? 0.3 : 1.1);
    const linenQ = hh * (arid > 0.6 ? 0.05 : 0.15), leatherQ = hh * 0.1; // a flax patch and the hides of the household's own beasts
    m.sAcc[G_TIMBER] += woodQ; m.sAcc[G_CLOTHING] += clothQ; m.sAcc[G_BREAD] += breadQ; m.sAcc[G_BEER] += beerQ;
    m.sAcc[G_LINEN] += linenQ; m.sAcc[G_LEATHER] += leatherQ;
    m.dAcc[G_GRAIN] += breadQ * 0.8 + beerQ * 0.5; // baking and brewing use grain
    const hhValue = woodQ * m.price[G_TIMBER] + clothQ * m.price[G_CLOTHING] * 0.5 + (breadQ * (m.price[G_BREAD] - pGrain * 0.8) + beerQ * (m.price[G_BEER] - pGrain * 0.5))
      + (linenQ * m.price[G_LINEN] + leatherQ * m.price[G_LEATHER]) * 0.5 + Math.max(0, ruralValue);
    const agriValue = grainQ * pGrain + rgoQ * pR;
    // ---- crafts ----
    let craftValue = 0, craftProfit = 0;
    const art = P[base + CL.artisans] + P[base + CL.wage_workers];
    let nSlots = 0;
    for (let k = 0; k < 3; k++) { const v = lc.workshop[i * 3 + k]; if (v > 0) SLOTS[nSlots++] = v; }
    const md = METHODS[lc.method[i]] ?? METHODS[0];
    let workers = 0;
    if (nSlots && art > 0) {
      const cap = (1 + wsLvl) * 1600 * (1 + lc.buildings[i * B + BI.manufactory]) * md.jobs;
      workers = Math.min(art, cap * nSlots);
      const per = workers / nSlots;
      const meth = md.mult, inNeed = md.mult * md.input;
      const prodMod = 1 + (n ? ns[nr + 2] : 0);
      const quality = 1 + (n ? ns[nr + NX + 2] : 0); // guild-made goods fetch better prices
      for (let si = 0; si < nSlots; si++) {
        const sl = SLOTS[si];
        const rc = RECIPES[sl - 1], ins = REC_IN[sl - 1], qs = REC_Q[sl - 1];
        let scale = 1;
        for (let j = 0; j < ins.length; j++) scale = Math.min(scale, 0.25 + 0.75 * marketFill(m, ins[j]));
        const k = per / 100 * CRAFT_PROD * scale;
        let inCost = 0;
        for (let j = 0; j < ins.length; j++) { const gi = ins[j], q = qs[j] * inNeed; m.dAcc[gi] += q * k; inCost += q * k * m.price[gi]; }
        const outQ = rc.outQty * k * meth * prodMod;
        const og = REC_OUT[sl - 1];
        m.sAcc[og] += outQ;
        const val = outQ * m.price[og] * quality;
        craftValue += val; craftProfit += val - inCost;
      }
    }
    lc.employed[base + CL.artisans] = art > 0 ? (nSlots ? workers / art : 0) : 1;
    // ---- incomes per class (marks per month, total for the class in this location) ----
    const rent = 0.12 + 0.2 * serfdom;      // dues to the nobility
    const tithe = 0.08;
    const inc = INC; inc.fill(0);
    inc[CL.peasants] = (grainQ * pGrain + rgoQ * pR * (peas * 0.22 / Math.max(1, rgoWorkers))) * (1 - rent - tithe) + Math.max(0, hhValue) * 0.65;
    const hhRest = Math.max(0, hhValue) * 0.35;
    inc[CL.labourers] = rgoQ * pR * (lab * 0.55 / Math.max(1, rgoWorkers)) * 0.8 + Math.max(0, craftProfit) * 0.1 + hhRest * 0.6 + grainQ * pGrain * 0.12;
    inc[CL.artisans] = hhRest * 0.4;
    inc[CL.artisans] += Math.max(0, craftProfit) * 0.6 + craftValue * 0.05;
    inc[CL.wage_workers] = 0;
    if (P[base + CL.wage_workers] > 0) { const ww = P[base + CL.wage_workers] / Math.max(1, art); inc[CL.wage_workers] = inc[CL.artisans] * ww * 0.6; inc[CL.artisans] *= 1 - ww * 0.6; }
    const marketBonus = 1 + 0.25 * lc.buildings[i * B + BI.market];
    inc[CL.burghers] = (Math.max(0, craftProfit) * 0.3 + (agriValue + craftValue) * 0.035 * marketBonus) * (1 + (n ? ns[nr + 3] : 0));
    inc[CL.nobles] = agriValue * rent;
    inc[CL.clergy] = agriValue * tithe + rgoQ * 0;
    // ---- taxes ----
    let taxTotal = 0, dutyTotal = 0;
    if (n) {
      // land still being integrated yields only part of its taxes (integrationYield)
      const ctl = lc.control[i], tf = (ns[nr + 13] ? 0.75 + 0.25 * ctl : ctl) * (0.3 + 0.7 * lc.integ[i]);
      for (let c = 0; c < C; c++) {
        const t = inc[c] * (ns[nr + 14 + c] * tf);
        inc[c] -= t; taxTotal += t;
      }
      // tax instruments (systems/duties.ts): land tax, hearth tax, excise
      const landR = ns[nr + NX + 4], hearthR = ns[nr + NX + 5], exciseR = ns[nr + NX + 6];
      let land = 0, hearth = 0, excise = 0;
      if (landR > 0 || hearthR > 0 || exciseR > 0) {
        collectDuties(inc, P, base, ns, nr + NX + 8, landR, hearthR, exciseR, agriValue, craftValue + rgoQ * pR, tf, pl);
        land = DUTY_PAID[0]; hearth = DUTY_PAID[1]; excise = DUTY_PAID[2];
      }
      // most of what the people pay stays with lords, towns and collectors; the crown receives its share
      taxTotal *= CROWN_SHARE; land *= CROWN_SHARE; hearth *= CROWN_SHARE; excise *= CROWN_SHARE;
      dutyTotal = land + hearth + excise;
      if (lc.ctrl[i] === o) {
        pay(o, 0, taxTotal);
        if (land > 0) pay(o, 2, land);
        if (hearth > 0) pay(o, 3, hearth);
        if (excise > 0) pay(o, 4, excise);
      } else if (lc.ctrl[i] >= 0) {
        // occupied: occupier collects a contribution
        pay(lc.ctrl[i], 1, (taxTotal + dutyTotal) * 0.5);
      }
    }
    taxTotal += dutyTotal;
    lc.income[i] = taxTotal;
    ec.grain[i] = grainQ; ec.rgo[i] = rgoQ; ec.craft[i] = craftValue; ec.tax[i] = taxTotal; ec.income[i] = 0;
    // ---- consumption of needs ----
    let unrestSol = 0, popTot = 0;
    let tc: ReturnType<typeof tierCache> | null = null;
    for (let c = 0; c < C; c++) {
      const pc = P[base + c];
      if (pc < 1) { lc.sol[base + c] = 0.5; continue; }
      const wealthPC = lc.wealth[base + c];
      let budget = inc[c] + wealthPC * pc * 0.08;
      ec.income[i] += inc[c];
      const mult = CLASS_NEED_MULT[c];
      const maxT = CLASS_MAX_TIER[c];
      let sol = 0, spent = 0;
      if (!tc) tc = tierCache(m, pl);
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
    const food = clamp(0.55 * Math.min(1, grainQ / grainNeed) + 0.45 * marketFill(m, G_GRAIN) * Math.min(1, lc.harvest[i] + 0.2) + 0.1, 0, 1);
    const plague = Math.max(0, lc.plague[i]); // below 0 only marks the survivors' resistance after an outbreak (society.ts)
    const growthMod = terr.growth;
    const growthFx = Math.max(0, 1 + (n ? ns[nr + NX] : 0));
    for (let c = 0; c < C; c++) {
      const pc = P[base + c]; if (pc <= 0) continue;
      const fs = c === CL.peasants || c === CL.labourers ? food : Math.max(food, 0.8);
      const birth = 0.0034 * (0.7 + 0.3 * growthMod) * (0.85 + 0.3 * lc.sol[base + c]);
      const death = 0.0028 + Math.max(0, 0.6 - fs) * 0.035 + plague * 0.035 + devast * 0.003;
      // growth effects (laws, values, innovations) speed the natural increase by their share, as the tooltip says;
      // they do not soften famine or plague
      const net = birth - death;
      P[base + c] = Math.max(0, pc * (1 + (net > 0 ? net * growthFx : net)));
    }
    // social mobility: profitable crafts draw peasants into towns, failing crafts push artisans back
    const urbanPull = clamp((lc.sol[base + CL.artisans] - lc.sol[base + CL.peasants]) * 0.002, -0.002, 0.002);
    const capArt = (1 + wsLvl) * 1600 * Math.max(1, nSlots);
    if (urbanPull > 0 && P[base + CL.artisans] < capArt) { const mv = P[base + CL.peasants] * urbanPull; P[base + CL.peasants] -= mv; P[base + CL.artisans] += mv * 0.7; P[base + CL.burghers] += mv * 0.1; P[base + CL.labourers] += mv * 0.2; }
    else if (urbanPull < 0 && P[base + CL.artisans] > 50) { const mv = P[base + CL.artisans] * -urbanPull; P[base + CL.artisans] -= mv; P[base + CL.peasants] += mv; }
    // manufactories turn artisans into wage workers
    if (lc.buildings[i * B + BI.manufactory] > 0 && P[base + CL.artisans] > 100) { const mv = P[base + CL.artisans] * 0.01; P[base + CL.artisans] -= mv; P[base + CL.wage_workers] += mv; }
    // ---- unrest ----
    if (n) {
      const avgSol = popTot > 0 ? unrestSol / popTot : 0.5;
      let u = (0.55 - avgSol) * 40;
      const taxBurden = ns[nr + 4] * 60;
      u += taxBurden;
      if (lc.faith[i] !== ns[nr + 12] && lc.faith[i] !== ns[nr + NSF]) u += 8 * (1 - ns[nr + 5]);
      if (lc.culture[i] !== ns[nr + 11]) u += 4;
      u += ns[nr + 6] * 0.12 + devast * 12 + (1 - lc.control[i]) * 6 - ns[nr + 7] * 0.08 - 2;
      u += ns[nr + 9];
      u += ns[nr + 8] * 20;
      u += ns[nr + NX + 7]; // tax instruments
      if (lc.core[i] !== o) u += 6;
      // an over-extended administration cannot hold newly won land
      if (lc.integ[i] < 1 && ns[nr + NX + 3] > 0) u += Math.min(15, ns[nr + NX + 3] * 10);
      lc.unrest[i] = clamp(lc.unrest[i] * 0.7 + u * 0.3, 0, 100);
    }
    // ---- development drifts toward what the population and buildings support ----
    let bsum = 0; for (let b = 0; b < B; b++) bsum += lc.buildings[i * B + b];
    let ptot = 0; for (let c = 0; c < C; c++) ptot += P[base + c];
    const target = Math.sqrt(ptot / 1000) * 2.2 * (1 + bsum * 0.04) * (0.8 + 0.4 * lc.control[i]);
    lc.dev[i] += (target - lc.dev[i]) * 0.02;
    lc.devast[i] = Math.max(0, devast - 0.01);
    // literacy grows with clergy/schools/universities
    const lit = 0.02 + lc.buildings[i * B + BI.church] * 0.02 + lc.buildings[i * B + BI.university] * 0.08 + (n ? ns[nr + 10] + ns[nr + NX + 1] : 0);
    lc.literacy[i] += (lit - lc.literacy[i]) * 0.01;
  }
  return silver;
}

/** Market clearing, inter-market trade, price history. Called at the start of each month. */
/** Who lives off a market: realms by their development inside its area (recomputed at each clearing). */
const SHARES = new WeakMap<Market, [number, number][]>();
function computeShares(s: GameState, w: World) {
  const acc: Map<number, number>[] = s.markets.map(() => new Map());
  for (let i = 0; i < w.L; i++) { const o = s.loc.owner[i]; if (o < 0) continue; const mm = acc[s.loc.market[i]]; if (mm) mm.set(o, (mm.get(o) || 0) + s.loc.dev[i]); }
  s.markets.forEach((m, k) => { const tot = [...acc[k].values()].reduce((a, b) => a + b, 0); SHARES.set(m, tot > 0 ? [...acc[k].entries()].sort((a, b) => a[0] - b[0]).map(([o, v]) => [o, v / tot]) : []); });
}
/** Trade margins and tolls of a market: the hub's ruler takes a third, the rest goes to the realms of the area by their weight in it. */
function shareOut(s: GameState, m: Market, kind: 'trade' | 'tariffs', amount: number) {
  if (amount <= 0) return;
  const hub = s.nations[m.owner];
  if (hub?.alive) addIncome(hub, kind, amount * 0.34 * (1 + (kind === 'trade' ? lawEffect(hub, 'trade') : 0)));
  for (const [o, sh] of SHARES.get(m) || []) { const n = s.nations[o]; if (n?.alive && sh > 0.002) addIncome(n, kind, amount * 0.66 * sh * (1 + (kind === 'trade' ? lawEffect(n, 'trade') : 0))); }
}

/** Arbitrage between two linked markets for every good (one direction per good), with margins and tolls. */
function tradeLink(s: GameState, a: Market, b: Market, cost: number, sea: boolean, flows: GameState['flows'], company: Nation | null) {
  const blocked = tradeBlocked(s, a, b, sea);
  if (blocked >= 1) return;
  for (let g = 0; g < G; g++) {
    const pa = a.price[g], pb = b.price[g];
    // carriage per unit: bulk goods pay by weight but move in barges and hulls, fine goods pay for risk and handling
    const tc = cost * WEIGHT[g] * (0.5 + 3.5 * (1 - WEIGHT[g])) + 0.03 * Math.min(pa, pb);
    const tariff = (s.nations[b.owner]?.tariff ?? 0) * 0.5;
    let from = a, to = b, diff = pb - pa * (1 + tariff) - tc;
    if (diff < 0) { from = b; to = a; diff = pa - pb * (1 + (s.nations[a.owner]?.tariff ?? 0) * 0.5) - tc; }
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
    // merchants of the exporting hub earn the margin (a company keeps most of it on its own route);
    // tolls go to the importing hub's ruler
    if (company) { addIncome(company, 'company', qty * diff * 0.03 * (1 + lawEffect(company, 'trade'))); shareOut(s, from, 'trade', qty * diff * 0.015); }
    else shareOut(s, from, 'trade', qty * diff * 0.04);
    const tr = s.nations[to.owner]?.tariff ?? 0;
    if (tr > 0) shareOut(s, to, 'tariffs', value * tr * 0.35);
  }
}

export function clearMarkets(s: GameState, w: World) {
  const ms = s.markets;
  computeShares(s, w);
  const flows: GameState['flows'] = [];
  // 0. turn per-tier demand units into demand for each good
  for (const m of ms) { if (!m.tierAcc) continue; const wq = tierCache(m, s.priceLevel).wq; NEED_IDX.forEach(([g, , tier], k) => { m.dAcc[g] += wq[k] * m.tierAcc![tier]; }); m.tierAcc.fill(0); }
  // 1. inter-market trade on last month's prices
  for (const a of ms) a.flowOut.fill(0);
  const oceanOpen = !!(s.flags.ocean_open || s.flags.west_route_found);
  for (const a of ms) {
    for (const lk of a.links) {
      if (lk.to < a.id || (lk.ocean && !oceanOpen)) continue;
      tradeLink(s, a, ms[lk.to], lk.cost, lk.sea, flows, null);
    }
  }
  // chartered companies: a direct, cheap sea route between an overseas market and the home market
  for (const co of s.companies ?? []) {
    const n = s.nations[co.nation]; const a = ms[co.market], b = ms[co.home];
    if (!n?.alive || !a || !b || a === b) continue;
    tradeLink(s, a, b, 1.5, true, flows, n);
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
      if (D > 1e-6 && S < D * 0.01) {
        // nobody offers the good here: there is no market price to bid up, only what bringing it in would cost
        p += (importPrice(ms, m, g, anchor) - p) * 0.3;
      } else if (S + D > 1e-6) {
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

/** What a good costs where no one offers it: the cheapest linked market where it is on offer, plus carriage (a quarter
 *  more by land, a sixth by sea), between half and three times its anchor; two and a half times the anchor where no
 *  neighbour has it either. */
export function importPrice(ms: Market[], m: Market, g: number, anchor: number): number {
  let best = Infinity;
  for (const lk of m.links) {
    const o = ms[lk.to]; if (!o || o.supply[g] <= o.demand[g] * 0.01) continue;
    const v = o.price[g] * (lk.sea ? 1.17 : 1.25); if (v < best) best = v;
  }
  return best < Infinity ? clamp(best, anchor * 0.5, anchor * 3) : anchor * 2.5;
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
    const tmax = tariffMax(n); if (n.tariff > tmax) n.tariff = tmax; // a new trade law lowers the ceiling
    // court & administration upkeep scales with realm size
    let locs = 0; // computed in politics monthly; reuse history
    const last = n.history[n.history.length - 1];
    locs = last ? last.locs : 10;
    // a court costs what the realm can bear: a small base, its seats, and a share of last month's revenue
    const gross = Object.values(n.income).reduce((a, b) => a + Math.max(0, b), 0);
    // (a petty lordship keeps a petty court: the fixed part never takes more than about half of what it earns)
    addExpense(n, 'court', (Math.min(4 + locs * 1.2, gross * 0.45) + gross * 0.12) * (1 + n.corruption));
    // a chest beyond a year's revenue draws courtiers, feasts and building at court: it melts away, but the realm is admired
    const hoard = n.treasury - gross * 12;
    if (hoard > 0 && gross > 0) { addExpense(n, 'splendour', hoard * 0.03); n.prestige = Math.min(100, n.prestige + Math.min(0.5, hoard / (gross * 200))); }
    // interest
    let interest = 0; for (const l of n.loans) interest += l.amount * l.rate / 12;
    if (interest > 0) addExpense(n, 'interest', interest);
    // debasement: extra coin now, inflation later
    // (a sound royal mint, inflation_resist, lets less of the debasement through and recovers faster)
    const resist = clamp(lawEffect(n, 'inflation_resist'), 0, 0.9);
    if (n.coinage > 0) {
      const extra = (n.income.tax || 0) * n.coinage;
      addIncome(n, 'minting', extra);
      n.inflation = clamp(n.inflation + n.coinage * 0.01 * (1 - resist), 0, 1.5);
    } else n.inflation = Math.max(0, n.inflation - 0.0015 * (1 + resist));
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
      if (n.flags.bankrupt_until && n.flags.bankrupt_until > s.day) {
        // no lender will deal with a bankrupt crown: wages go unpaid, soldiers drift away, the deficit is written off
        n.treasury = 0; n.armyMaint = 0.5;
        for (const a of s.armies) if (a.owner === n.id && !a.fleet) for (const r of a.regs) r.men *= a.mercenary ? 0.8 : 0.95;
      } else if (n.loans.length < 6) takeLoan(s, n, -n.treasury + 50);
      else declareBankruptcy(s, n);
    }
    // roll ledger
    n.income = n.incomeAcc; n.expense = n.expenseAcc; n.incomeAcc = {}; n.expenseAcc = {};
  }
}

export function takeLoan(s: GameState, n: Nation, amount: number) {
  const base = loanRate(s, n);
  const lenders = ['Bardi', 'Peruzzi', 'Medici', 'Fugger', 'Welser', 'Grimaldi', 'Lombard bankers', 'Hanseatic merchants', 'Jewish moneylenders', 'Genoese Casa di San Giorgio'];
  const year = s.startYear + Math.floor(s.day / 365);
  const avail = lenders.filter((l, k) => year >= [1300, 1300, 1397, 1480, 1490, 1300, 1300, 1300, 1300, 1407][k] && year <= [1345, 1343, 1494, 1650, 1650, 1815, 1815, 1815, 1815, 1805][k]);
  n.loans.push({ amount, rate: Math.max(0.03, base), due: s.day + 365 * 5, lender: avail[(s.day + n.id) % Math.max(1, avail.length)] || 'Lombard bankers' });
  n.treasury += amount;
}

/** Highest tariff the trade law allows: 5 % plus the law's tariff_max (open ports 10 %, staple rights 20 %,
 *  protected trades 35 %). */
export function tariffMax(n: Nation): number { return clamp(0.05 + lawEffect(n, 'tariff_max'), 0, 0.5); }
/** Interest a lender asks: base, more for every loan already owed and after a bankruptcy, plus interest effects
 *  (positive = dearer credit: a bankruptcy; negative = cheaper: banking houses, a public bank, Jewish lenders). */
export function loanRate(s: GameState, n: Nation): number {
  return Math.max(0.01, 0.05 + n.loans.length * 0.012 + (n.flags.bankrupt_until && n.flags.bankrupt_until > s.day - 3650 ? 0.06 : 0) + lawEffect(n, 'interest'));
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

/** Artisans move their workshops to whatever the market lacks and pays for. Per market, the unmet demand of each
 *  good is shared out among the towns, so one dear good does not pull a whole region into the same trade.
 *  `full` re-plans every slot (game start); otherwise about half the towns change at most one slot a year, and
 *  only for a clearly better trade. Slots the player set by hand (flag wsl_<loc>) are left alone. */
export function retoolWorkshops(s: GameState, w: World, full = false) {
  const lc = s.loc;
  const byMarket: number[][] = s.markets.map(() => []);
  for (let i = 0; i < w.L; i++) {
    if (lc.owner[i] < 0 || s.flags['wsl_' + i]) continue;
    if (lc.pop[i * C + CL.artisans] + lc.pop[i * C + CL.wage_workers] < 150) continue;
    const mk = lc.market[i]; if (byMarket[mk]) byMarket[mk].push(i);
  }
  const margin = new Float64Array(RECIPES.length);
  const rem = new Float64Array(G);
  for (let mk = 0; mk < s.markets.length; mk++) {
    const m = s.markets[mk]; const cand = byMarket[mk]; if (!cand.length) continue;
    for (let r = 0; r < RECIPES.length; r++) {
      // prices bounded to half..double their anchor, so a starved market does not make one trade look infinitely good
      const pr = (gi: number) => { const a = GOODS[gi].base * s.priceLevel; return clamp(m.price[gi], a * 0.5, a * 2); };
      const rc = RECIPES[r]; let cost = 0, avail = 1;
      for (const [gid, q] of rc.inputs) { const gi = GI[gid]; cost += q * pr(gi); avail = Math.min(avail, 0.25 + 0.75 * marketFill(m, gi)); }
      margin[r] = (rc.outQty * pr(GI[rc.out]) - cost) * avail;
    }
    for (let g = 0; g < G; g++) rem[g] = m.demand[g] - m.supply[g];
    // derived demand: an unmet need for tools is also a need for iron (one step up the chain is enough)
    const derived = new Float64Array(G);
    for (const rc of RECIPES) { const gap = rem[GI[rc.out]]; if (gap > 0) for (const [gid, q] of rc.inputs) derived[GI[gid]] += gap / rc.outQty * q * 0.5; }
    for (let g = 0; g < G; g++) rem[g] += derived[g];
    const est = (i: number, r: number) => {
      const ws = lc.buildings[i * B + BI.workshop], nS = Math.min(3, 1 + ws);
      const art = lc.pop[i * C + CL.artisans] + lc.pop[i * C + CL.wage_workers];
      const md = METHODS[lc.method[i]] ?? METHODS[0];
      const cap = (1 + ws) * 1600 * (1 + lc.buildings[i * B + BI.manufactory]) * md.jobs;
      return RECIPES[r].outQty * Math.min(art / nS, cap) / 100 * CRAFT_PROD * md.mult;
    };
    const value = (i: number, r: number, own: number) => {
      const rc = RECIPES[r]; if ((rc.minEra ?? 0) > (s.nations[lc.owner[i]]?.era ?? 0) || margin[r] <= 0) return -Infinity;
      const e = Math.max(1e-6, est(i, r));
      const fill = clamp((rem[GI[rc.out]] + own) / e, 0.02, 1);
      const local = rc.inputs.some(([gid]) => GI[gid] === w.resource[i]) ? 1.3 : 1;
      return margin[r] * fill * local;
    };
    // the biggest towns choose first
    cand.sort((a, b) => lc.pop[b * C + CL.artisans] - lc.pop[a * C + CL.artisans]);
    if (full) for (const i of cand) for (let k = 0; k < 3; k++) { const r = lc.workshop[i * 3 + k] - 1; if (r >= 0) { rem[GI[RECIPES[r].out]] += est(i, r); lc.workshop[i * 3 + k] = 0; } }
    for (const i of cand) {
      const nS = Math.min(3, 1 + lc.buildings[i * B + BI.workshop]);
      if (full) {
        for (let k = 0; k < nS; k++) {
          let best = -1, bv = 0;
          for (let r = 0; r < RECIPES.length; r++) { if (lc.workshop[i * 3] === r + 1 || lc.workshop[i * 3 + 1] === r + 1) continue; const v = value(i, r, 0); if (v > bv) { bv = v; best = r; } }
          if (best < 0) break;
          lc.workshop[i * 3 + k] = best + 1; rem[GI[RECIPES[best].out]] -= est(i, best);
        }
        continue;
      }
      if (((i * 2654435761 + s.day) >>> 0) % 100 >= 50) continue;
      let wk = -1, wv = Infinity;
      for (let k = 0; k < nS; k++) { const r = lc.workshop[i * 3 + k] - 1; const v = r < 0 ? -Infinity : value(i, r, est(i, r)); if (v < wv) { wv = v; wk = k; } }
      let best = -1, bv = 0;
      for (let r = 0; r < RECIPES.length; r++) {
        if (lc.workshop[i * 3] === r + 1 || lc.workshop[i * 3 + 1] === r + 1 || lc.workshop[i * 3 + 2] === r + 1) continue;
        const v = value(i, r, 0); if (v > bv) { bv = v; best = r; }
      }
      if (best < 0 || wk < 0 || !(wv === -Infinity || bv > wv * 1.3)) continue;
      const old = lc.workshop[i * 3 + wk] - 1; if (old >= 0) rem[GI[RECIPES[old].out]] += est(i, old);
      lc.workshop[i * 3 + wk] = best + 1; rem[GI[RECIPES[best].out]] -= est(i, best);
    }
  }
}

export const economy: System = {
  id: 'economy',
  init(s, w) {
    harvests(s, w, s.startYear);
    // warm up: two full passes to settle prices and incomes
    for (let k = 0; k < 2; k++) {
      PASS++;
      stepLocations(s, w, 0, w.L, 1, true);
      clearMarkets(s, w);
      for (const n of s.nations) { n.treasury = 0; n.income = n.incomeAcc; n.incomeAcc = {}; n.expenseAcc = {}; }
      if (k === 0) retoolWorkshops(s, w, true);
    }
    // starting treasuries: ~ 4 months of tax income
    for (const n of s.nations) n.treasury = Math.max(50, (n.income.tax || 0) * 4);
  },
  daily({ s, w }) {
    const b = s.day % BUCKETS;
    PASS++;
    stepLocations(s, w, b, w.L, BUCKETS, false);
  },
  monthly({ s, w }) {
    clearMarkets(s, w);
    updateMoney(s);
    monthlyLedger(s, w);
  },
  yearly({ s, w, date }) {
    harvests(s, w, date.y);
    retoolWorkshops(s, w);
  },
};
