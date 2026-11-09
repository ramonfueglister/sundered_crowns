// Planning at the scale of a realm: what one more level of a building would bring in a location (an estimate from the
// economy's own formulas and last month's production), where a realm can build, and where it raises its men.
// Read only: nothing here changes the state. Used by the building and levy overviews and by province and area orders.
import type { GameState, Nation, I18n } from '../types';
import type { World } from '../world';
import { B, BI, BUILDINGS, C, CL, CLASSES, CLASS_NAME, GI, GOODS, RAW_FROM_MINE } from '../defs';
import { LOC_ECON, CROWN_SHARE, effectiveTax } from './economy';
import { lawEffect } from './politics';
import { mod } from '../ctx';
import { buildCost, buildRefusal, buildQueue, type BuildQueue } from '../commands';
import { nationLocsRO } from './war';

/** A row of a breakdown: a key of the UI text table or a bilingual name, and a value. */
export type PlanRow = [string | I18n, number];
export interface Gain {
  /** extra crown income per month (gold) from one more level, estimated */
  gold: number;
  /** what makes up the gold: the extra income of each class times the crown's tax on it */
  parts: PlanRow[];
  /** what the building does besides gold (one line), when that is its main use */
  other: I18n | null;
}

const OTHER: Record<string, I18n> = {
  fort: { en: '+1000 garrison, harder sieges, controls nearby roads', de: '+1000 Besatzung, schwerere Belagerung, sperrt nahe Straßen' },
  road: { en: '+15 % march speed, cheaper transport, more control', de: '+15 % Marschtempo, billigerer Transport, mehr Kontrolle' },
  church: { en: '+2 % literacy target, faith stability', de: '+2 % Bildungsziel, Glaubensfestigkeit' },
  admin: { en: 'Control spreads from here like from a second capital', de: 'Kontrolle strahlt von hier aus wie von einer zweiten Hauptstadt' },
  university: { en: '+8 % literacy target, research, spreads new ideas', de: '+8 % Bildungsziel, Forschung, verbreitet neue Ideen' },
  canal: { en: 'Very cheap transport of goods', de: 'Sehr billiger Warentransport' },
  port: { en: 'Builds ships, more sailors', de: 'Baut Schiffe, mehr Seeleute' },
};
const FISH = GI.fish, GRAIN = GI.grain;
const INC = new Float64Array(C); // scratch, filled anew by every call

/**
 * Extra crown income per month from one more level of building b in location l (gold), from last month's harvest,
 * output and prices, as systems/economy.ts computes them: more grain or raw output raises the incomes of peasants,
 * labourers, lords, clergy and burghers; a market hall raises the burghers' share of trade; workshops and
 * manufactories only gain where artisans wait for room. The crown keeps its share of the taxes on that income.
 */
export function buildingGain(s: GameState, w: World, n: Nation, l: number, b: number): Gain {
  const def = BUILDINGS[b]; const other = OTHER[def.id] ?? null;
  const ec = LOC_ECON;
  if (!ec || ec.grain.length !== w.L || l < 0 || l >= w.L) return { gold: 0, parts: [], other };
  const m = s.markets[s.loc.market[l]]; if (!m) return { gold: 0, parts: [], other };
  const lc = s.loc; const P = lc.pop, base = l * C;
  const lvl = (k: number) => lc.buildings[l * B + k];
  const r = w.resource[l];
  const pG = m.price[GRAIN], pR = m.price[r];
  const grainQ = ec.grain[l], rgoQ = ec.rgo[l], craft = ec.craft[l];
  const peas = P[base + CL.peasants], lab = P[base + CL.labourers];
  const rgoW = Math.max(1, lab * 0.55 + peas * 0.22);
  const serf = lawEffect(n, 'serfdom');
  const rent = 0.12 + 0.2 * serf, tithe = 0.08;
  const mb = 1 + 0.25 * lvl(BI.market), trade = 1 + mod(n, 'trade');
  const inc = INC; inc.fill(0);
  const agri = (dGrain: number, dRgo: number) => {
    const v = dGrain * pG + dRgo * pR;
    inc[CL.peasants] += (dGrain * pG + dRgo * pR * (peas * 0.22 / rgoW)) * (1 - rent - tithe);
    inc[CL.labourers] += dRgo * pR * (lab * 0.55 / rgoW) * 0.8 + dGrain * pG * 0.12;
    inc[CL.burghers] += v * 0.035 * mb * trade;
    inc[CL.nobles] += v * rent; inc[CL.clergy] += v * tithe;
  };
  // crafts: value grows with the artisans who find room; profit taken as a third of the value
  const crafts = (capNow: number, capNext: number) => {
    const art = P[base + CL.artisans] + P[base + CL.wage_workers];
    let slots = 0; for (let k = 0; k < 3; k++) if (lc.workshop[l * 3 + k] > 0) slots++;
    if (!slots || craft <= 0) return;
    const now = Math.min(art, capNow * slots), next = Math.min(art, capNext * slots);
    if (now <= 0 || next <= now) return;
    const dv = craft * (next / now - 1), dp = dv / 3;
    inc[CL.artisans] += dp * 0.6 + dv * 0.05; inc[CL.labourers] += dp * 0.1; inc[CL.burghers] += dp * 0.3 + dv * 0.035 * mb * trade;
  };
  switch (def.id) {
    case 'farm': { const f = 0.12 / (1 + 0.12 * lvl(BI.farm)); agri(grainQ * f, r === GRAIN ? rgoQ * f : 0); break; }
    case 'mine': if (RAW_FROM_MINE.has(GOODS[r].id)) agri(0, rgoQ * 0.6 / (1 + 0.6 * lvl(BI.mine))); break;
    case 'port': if (r === FISH) agri(0, rgoQ * 0.25 / (1 + 0.25 * lvl(BI.port))); break;
    case 'market': inc[CL.burghers] += (grainQ * pG + rgoQ * pR + craft) * 0.035 * 0.25 * trade; break;
    case 'workshop': { const man = 1 + lvl(BI.manufactory), ws = lvl(BI.workshop); crafts((1 + ws) * 1600 * man, (2 + ws) * 1600 * man); break; }
    case 'manufactory': { const ws = lvl(BI.workshop), man = lvl(BI.manufactory); crafts((1 + ws) * 1600 * (1 + man), (1 + ws) * 1600 * (2 + man)); break; }
  }
  const parts: PlanRow[] = [];
  let gold = 0;
  for (let c = 0; c < C; c++) {
    if (inc[c] <= 0) continue;
    const g = inc[c] * effectiveTax(s, n, l, c) * CROWN_SHARE;
    if (g <= 0) continue;
    gold += g; parts.push([CLASS_NAME[CLASSES[c]] ?? `${c}`, g]);
  }
  return { gold, parts, other: gold > 0 && def.id !== 'port' ? null : other };
}

/** Where a realm can start building b now (gold aside), with the price and the estimated gain of each place. */
export interface BuildSpot { loc: number; level: number; cost: number; gain: number }
export function buildSpots(s: GameState, w: World, n: Nation, b: number, locs: readonly number[] = nationLocsRO(s, n.id), q: BuildQueue = buildQueue(s)): BuildSpot[] {
  const out: BuildSpot[] = [];
  for (const l of locs) {
    if (buildRefusal(s, w, n.id, l, b, q)) continue;
    const level = s.loc.buildings[l * B + b] + (q.same.get(l * B + b) ?? 0);
    out.push({ loc: l, level, cost: buildCost(s, n, b, level), gain: buildingGain(s, w, n, l, b).gold });
  }
  return out;
}

/** Men a location adds to the realm's manpower limit (systems/military.ts: peasants and labourers × 1.2 % × (0.4 + 0.6 × control)); a realm refills a 120th of its limit each month. */
export function manpowerOf(s: GameState, l: number): number {
  const base = l * C; const people = s.loc.pop[base + CL.peasants] + s.loc.pop[base + CL.labourers];
  return people * 0.012 * (0.4 + 0.6 * s.loc.control[l]);
}
