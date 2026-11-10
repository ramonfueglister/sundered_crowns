// Worker-side view of the realm's production methods (the Works panel's methods tab): every town with workshops at
// work, what its workshops make, use and employ under each method, and whether it can switch now. The orders are
// the ordinary 'method' command, sent as one batch (src/sim/commands.ts).
import type { GameState } from '../sim/types';
import type { World } from '../sim/world';
import { METHODS, BUILDINGS, BI } from '../sim/defs';
import { methodBlock, methodCost } from '../sim/systems/administration';
import { craftOutcome } from '../sim/systems/economy';
import { nationLocsRO } from '../sim/systems/war';
import { placesOf } from './worksview';

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** Per method [jobs, places of work, value made, raw materials used, why it cannot switch now or null]. The price is
 *  the same for every town (administration.ts methodCost), so "not enough gold" is left to the order of the batch. */
export type MethodAlt = [number, number, number, number, string | null];

export function methodsView(s: GameState, w: World, player: number) {
  const n = s.nations[player]; if (!n) return null;
  const lc = s.loc;
  const locs = nationLocsRO(s, n.id).filter((l) => lc.workshop[l * 3] > 0 || lc.workshop[l * 3 + 1] > 0 || lc.workshop[l * 3 + 2] > 0);
  const towns = locs.map((l) => ({
    loc: l, method: lc.method[l],
    recipes: [0, 1, 2].map((k) => lc.workshop[l * 3 + k] - 1).filter((r) => r >= 0),
    alt: METHODS.map((_, k): MethodAlt => {
      const o = craftOutcome(s, w, l, k);
      const b = methodBlock(s, w, n, l, k);
      return [round(o.jobs, 0), round(o.cap, 0), round(o.out, 2), round(o.inp, 2), b === 'not enough gold' ? null : b];
    }),
  }));
  const methods = METHODS.map((d, k) => ({
    id: k, key: d.id, name: d.name, mult: d.mult, input: d.input, jobs: d.jobs, cost: round(methodCost(s, n, k), 1),
    commerce: d.commerce ?? 0, building: d.building ? BUILDINGS[BI[d.building]].name : null,
  }));
  return { treasury: n.treasury, commerce: n.tech[1], ...placesOf(w, locs), methods, towns };
}
