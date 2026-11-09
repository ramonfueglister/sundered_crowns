// The AI's trade policy, by the same commands and rules as the player: merchants where they pay most (collecting or
// steering home), tariffs that suit the realm, trade agreements with its partners and embargoes on rivals that depend
// on its markets (lifted again after a peace or when the rivalry ends); expeditions and company charters.
import type { GameState, Nation } from '../types';
import type { World } from '../world';
import { atWar, hasTreaty } from '../ctx';
import { chance, rand } from '../rng';
import { applyCommand } from '../commands';
import { lawEffect } from './politics';
import { tariffMax } from './economy';
import { europeanCrown, charterOptions } from './colonial';
import { OCEAN_TECH, harbours } from './explore';
import {
  tradeIncomeWith, merchantRefusal, merchantsFree, steerRoute, homeMarket, embargoedBy, embargoBetween, embargoStakes, routeCost, merchantReach,
} from './trade';

/** Quarterly, staggered by realm (called from the AI's monthly strategy). */
export function aiTrade(s: GameState, w: World, n: Nation) {
  if (n.capital < 0 || (Math.floor(s.day / 30) + n.id) % 3 !== 0) return;
  aiMerchants(s, w, n);
  aiTariff(s, w, n);
  aiEmbargo(s, w, n);
  aiAgreement(s, w, n);
  aiExpedition(s, w, n);
  aiCharter(s, w, n);
}

/** Markets worth a look: home, where we already trade (even where no more merchants may go: those still earn and can
 *  be moved away), and the richest markets within reach. */
function candidates(s: GameState, w: World, n: Nation): number[] {
  const home = homeMarket(s, n); if (home < 0) return [];
  const out = new Set<number>();
  const k = merchantReach(n);
  const reach = s.markets.filter((m) => routeCost(s, home, m.id) <= k && (m.tv ?? 0) > 0).sort((a, b) => (b.tv ?? 0) - (a.tv ?? 0) || a.id - b.id);
  for (const m of [s.markets[home], ...reach.slice(0, 8)]) if (!merchantRefusal(s, w, n, m.id)) out.add(m.id);
  for (const m of s.markets) if (m.merchants[n.id]) out.add(m.id);
  return [...out].sort((a, b) => a - b);
}
/** Our merchants in markets whose ruler and we keep an embargo earn nothing there: call them home. */
function recallShutOut(s: GameState, w: World, n: Nation) {
  for (const mk of s.markets) {
    if (!mk.merchants[n.id]) continue;
    const owner = s.loc.owner[mk.hub];
    if (owner >= 0 && owner !== n.id && embargoBetween(s, owner, n.id)) applyCommand(s, w, { t: 'merchant', n: n.id, market: mk.id, amount: 0 });
  }
}

/** What a change must bring a month to be worth a merchant's journey: a hundredth of the realm's income, at least 0.5. */
function worth(n: Nation): number {
  let inc = 0; for (const k in n.income) inc += Math.max(0, n.income[k]);
  return Math.max(0.5, inc * 0.01);
}

function aiMerchants(s: GameState, w: World, n: Nation) {
  recallShutOut(s, w, n);
  const cands = candidates(s, w, n); if (!cands.length) return;
  const now = tradeIncomeWith(s, w, n.id);
  const est = (m: number, k: number, st: boolean) => tradeIncomeWith(s, w, n.id, { m, merchants: k, steer: st }) - now;
  const min = worth(n);
  // 1. switch steering where the other way pays better
  for (const m of cands) {
    const mk = s.markets[m]; const have = mk.merchants[n.id] || 0; if (!have || !steerRoute(s, n.id, m)) continue;
    const st = !!mk.steer?.[n.id];
    if (est(m, have, !st) > Math.max(min, now * 0.02)) applyCommand(s, w, { t: 'merchant', n: n.id, market: m, amount: have, steer: !st });
  }
  // 2. the best place for one more merchant (collecting or steering)
  const now2 = tradeIncomeWith(s, w, n.id);
  let best = -1, bestSteer = false, bv = 0;
  for (const m of cands) {
    if (merchantRefusal(s, w, n, m)) continue; // (we keep the merchants there, but send no more)
    const mk = s.markets[m]; const have = mk.merchants[n.id] || 0; const st = !!mk.steer?.[n.id];
    const g1 = tradeIncomeWith(s, w, n.id, { m, merchants: have + 1, steer: st }) - now2;
    if (g1 > bv) { bv = g1; best = m; bestSteer = st; }
    if (!st && steerRoute(s, n.id, m)) { const g2 = tradeIncomeWith(s, w, n.id, { m, merchants: have + 1, steer: true }) - now2; if (g2 > bv) { bv = g2; best = m; bestSteer = true; } }
  }
  if (best < 0 || bv < min) return;
  if (merchantsFree(s, n) > 0) {
    applyCommand(s, w, { t: 'merchant', n: n.id, market: best, amount: (s.markets[best].merchants[n.id] || 0) + 1, steer: bestSteer });
    return;
  }
  // 3. all placed: move the least useful merchant when another market pays clearly more
  let worst = -1, wl = Infinity;
  for (const m of cands) {
    const mk = s.markets[m]; const have = mk.merchants[n.id] || 0; if (!have || m === best) continue;
    const st = !!mk.steer?.[n.id];
    const loss = now2 - tradeIncomeWith(s, w, n.id, { m, merchants: have - 1, steer: st && have > 1 });
    if (loss < wl) { wl = loss; worst = m; }
  }
  if (worst < 0 || bv < wl * 1.5 + min) return;
  applyCommand(s, w, { t: 'merchant', n: n.id, market: worst, amount: (s.markets[worst].merchants[n.id] || 0) - 1 });
  applyCommand(s, w, { t: 'merchant', n: n.id, market: best, amount: (s.markets[best].merchants[n.id] || 0) + 1, steer: bestSteer });
}

/** Tariffs: trading realms keep them low, protectionist ones high, the rest in between; a step a quarter. */
function aiTariff(s: GameState, w: World, n: Nation) {
  const max = tariffMax(n);
  const trader = n.personality === 'trader' || n.gov === 'merchant_republic';
  const protect = lawEffect(n, 'tariff_max') >= 0.25;
  const target = max * (trader ? 0.25 : protect ? 0.6 : 0.4);
  const d = target - n.tariff;
  if (Math.abs(d) < 0.005) return;
  applyCommand(s, w, { t: 'budget', n: n.id, key: 'tariff', value: n.tariff + Math.sign(d) * Math.min(0.01, Math.abs(d)) });
}

/** Embargo a rival that earns well in our markets and gives us less in its own; lift it after a peace, when the
 *  rivalry is over or when we have become allies. */
function aiEmbargo(s: GameState, w: World, n: Nation) {
  for (const o of s.nations) {
    if (!o.alive || !embargoedBy(s, n.id, o.id)) continue;
    if (!n.rivals.includes(o.id) || hasTreaty(s, n.id, o.id, 'truce') || hasTreaty(s, n.id, o.id, 'alliance')) applyCommand(s, w, { t: 'diplo', n: n.id, action: 'lift_embargo', target: o.id });
  }
  if (n.personality === 'diplomat' || !chance(s.rng, 0.5)) return;
  for (const r of [...n.rivals].sort((a, b) => a - b)) {
    const R = s.nations[r]; if (!R?.alive || embargoedBy(s, n.id, r) || atWar(s, n.id, r) || hasTreaty(s, n.id, r, 'truce')) continue;
    const st = embargoStakes(s, n.id, r);
    const theirIncome = Object.values(R.income).reduce((p, v) => p + Math.max(0, v), 0);
    if (st.theirs > theirIncome * 0.03 && st.theirs > st.ours * 1.5 + 1) { applyCommand(s, w, { t: 'diplo', n: n.id, action: 'embargo', target: r }); return; }
  }
}

/** Propose a trade agreement to the ruler whose markets exchange the most goods with ours. */
function aiAgreement(s: GameState, w: World, n: Nation) {
  if (n.envoysBusy >= n.envoys || !chance(s.rng, n.personality === 'trader' || n.gov === 'merchant_republic' ? 0.4 : 0.15)) return;
  const by = new Map<number, number>();
  for (const f of s.flows ?? []) {
    const a = s.loc.owner[s.markets[f.from].hub], b = s.loc.owner[s.markets[f.to].hub];
    if (a < 0 || b < 0 || a === b) continue;
    if (a === n.id) by.set(b, (by.get(b) ?? 0) + f.value); else if (b === n.id) by.set(a, (by.get(a) ?? 0) + f.value);
  }
  const best = [...by.entries()].filter(([o]) => s.nations[o]?.alive && !hasTreaty(s, n.id, o, 'trade') && !atWar(s, n.id, o) && !n.rivals.includes(o) && !embargoedBy(s, n.id, o) && !embargoedBy(s, o, n.id))
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  if (best) applyCommand(s, w, { t: 'diplo', n: n.id, action: 'trade', target: best[0] });
}

const incomeOf = (n: Nation) => { let v = 0; for (const k in n.income) v += n.income[k]; return v; };

/** Atlantic crowns send expeditions west once their navigators are able: an unknown sea zone in the Atlantic, a voyage
 *  of a few weeks, with an idle fleet of theirs or a squadron fitted out for it. */
function aiExpedition(s: GameState, w: World, n: Nation) {
  if (n.tech[1] < OCEAN_TECH || n.overlord >= 0 || !europeanCrown(w, n) || !n.flags.atlantic) return;
  if (s.explorers.some((x) => x.nation === n.id) || !chance(s.rng, 0.35)) return;
  if (n.treasury < Math.max(150 * s.priceLevel, incomeOf(n) * 2)) return;
  const f = s.armies.find((a) => a.owner === n.id && a.fleet && !a.battle && !a.path.length && !a.carrying.length && !s.explorers.some((x) => x.id === a.id));
  let from = f?.loc ?? -1;
  if (from < 0) { let west = Infinity; for (const p of harbours(s, w, n)) if (w.lon[p] < west) { west = w.lon[p]; from = p; } }
  if (from < 0) return;
  const e = s.explored[n.knows];
  let tgt = -1, bd = Infinity;
  for (let i = w.L; i < w.N; i++) {
    if (e && e[i]) continue;
    if (w.lon[i] > -5) continue;
    const d = w.distKm(from, i);
    if (d > 6000) continue;
    const v = w.lon[i] * 40 + Math.abs(d - 2500) * 0.4 + rand(s.rng) * 600;
    if (v < bd) { bd = v; tgt = i; }
  }
  if (tgt >= 0) applyCommand(s, w, { t: 'explore', n: n.id, fleet: f?.id ?? 0, to: tgt });
}

/** About once a year a rich crown with Commerce 12 charters a company for an overseas market where it holds a harbour. */
function aiCharter(s: GameState, w: World, n: Nation) {
  if (n.tech[1] < 12 || !europeanCrown(w, n) || (Math.floor(s.day / 90) + n.id) % 4 !== 0) return;
  if (n.treasury < Math.max(1200 * s.priceLevel, incomeOf(n) * 3)) return;
  const have = new Set((s.companies ?? []).filter((c) => c.nation === n.id).map((c) => c.market));
  const opt = charterOptions(s, w, n).find((m) => !have.has(m));
  if (opt !== undefined) applyCommand(s, w, { t: 'charter', n: n.id, market: opt });
}
