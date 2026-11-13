// Market access: how well a place reaches the hub of its market. Each place belongs to one market, but a village
// three weeks' cart ride from the hub does not sell or buy there as the hub's own streets do. Access falls with the
// cost of the way to the nearest hub (land by its length, sea at about a third, a river or road crossing cheaper with
// roads and canals at either end) and is between MIN_ACCESS and 1. In the economy (economy.ts stepLoop) it scales
// what the place's goods fetch (FARMGATE: the carter takes his share), how much of them reaches the market, and what
// the people pay for what they buy there (REMOTE_MARKUP).
import type { GameState } from '../types';
import type { World } from '../world';
import { B, BI } from '../defs';
import { MinHeap } from '../minheap';

/** Way cost (km on land, a third of that at sea) at which access has fallen to MIN_ACCESS. */
export const ACCESS_RANGE = 1400;
export const MIN_ACCESS = 0.35;
/** Each level of roads at either end of a land step makes it this much cheaper; a canal this much more. */
export const ROAD_CUT = 0.12, CANAL_CUT = 0.25;
/** Share of a sale's price that stays with a place at access a: FARMGATE_BASE + (1 − FARMGATE_BASE) · a. */
export const FARMGATE_BASE = 0.7;
/** Share of a place's goods that reaches the market at access a: SUPPLY_BASE + (1 − SUPPLY_BASE) · a (the rest is
 *  eaten on the way or used where it was made). */
export const SUPPLY_BASE = 0.75;
/** What the people of a place pay above the market price for its goods at access a: REMOTE_MARKUP · (1 − a). */
export const REMOTE_MARKUP = 0.4;

export const farmgate = (a: number) => FARMGATE_BASE + (1 - FARMGATE_BASE) * a;
export const reaching = (a: number) => SUPPLY_BASE + (1 - SUPPLY_BASE) * a;
export const markup = (a: number) => 1 + REMOTE_MARKUP * (1 - a);
export const accessOf = (cost: number) => Math.max(MIN_ACCESS, 1 - (1 - MIN_ACCESS) * Math.min(1, cost / ACCESS_RANGE));

interface Cache { sig: number; M: number; L: number; cost: Float32Array; access: Float32Array }
const CACHE = new WeakMap<GameState['loc'], Cache>();
function roadSig(s: GameState, L: number): number {
  let h = 7; const b = s.loc.buildings;
  for (let i = 0; i < L; i++) { const r = b[i * B + BI.road], c = b[i * B + BI.canal]; if (r || c) h = (Math.imul(h, 31) + i * 8 + r * 2 + c) | 0; }
  return h;
}
/** Way cost from every place to the nearest market hub and its access (recomputed when roads or canals change). */
export function marketAccess(s: GameState, w: World): { cost: Float32Array; access: Float32Array } {
  const L = w.L, M = s.markets.length;
  const sig = roadSig(s, L);
  const c = CACHE.get(s.loc);
  if (c && c.sig === sig && c.M === M && c.L === L) return c;
  const N = w.N, best = new Float64Array(N).fill(Infinity), heap = new MinHeap();
  for (const m of s.markets) { if (m.hub >= 0 && m.hub < N) { best[m.hub] = 0; heap.push(0, m.hub); } }
  const b = s.loc.buildings;
  const cut = (i: number) => (i < L ? b[i * B + BI.road] * ROAD_CUT + b[i * B + BI.canal] * CANAL_CUT : 0);
  while (heap.size) {
    const [d, u] = heap.pop();
    if (d > best[u]) continue;
    for (let e = w.adjStart[u]; e < w.adjStart[u + 1]; e++) {
      const v = w.adj[e];
      const sea = u >= L || v >= L;
      const k = sea ? 0.35 : Math.max(0.3, 1 - 0.5 * (cut(u) + cut(v)));
      const nd = d + w.adjKm[e] * k;
      if (nd < best[v]) { best[v] = nd; heap.push(nd, v); }
    }
  }
  const cost = new Float32Array(L), access = new Float32Array(L);
  for (let i = 0; i < L; i++) { cost[i] = isFinite(best[i]) ? best[i] : ACCESS_RANGE * 2; access[i] = accessOf(cost[i]); }
  const r = { sig, M, L, cost, access }; CACHE.set(s.loc, r); return r;
}
