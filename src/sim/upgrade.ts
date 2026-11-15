// Brings the state of a world that was saved by an older build up to this build's STATE_VERSION. The world runs
// without end, so every change to the shape of the state needs its step here.
import type { WorldState } from './state';
import { STATE_VERSION } from './state';
import type { World } from './world';
import { cultivate } from './systems/cultivation';
import { bringInHarvest } from './systems/harvest';
import { foundEconomy, computeYear } from './systems/economy';
import { dayToDate } from './calendar';

export function upgradeState(s: WorldState, w: World): WorldState {
  if (s.v === 1) { // 1 → 2: the harvest of each place (filled by the next step)
    s.place.harvest = new Float64Array(w.L);
    s.v = 2;
  }
  if (s.v === 2) { // 2 → 3: the arable of each place; the harvest counts with it from now on
    s.place.arable = new Float64Array(w.L);
    cultivate(s, w); bringInHarvest(s, w);
    s.v = 3;
  }
  if (s.v === 3) { // 3 → 4: England's economy, with the years the world has already seen (it depends on nothing else
    // in the state, so the result is the economy of a world that had it from its first day)
    foundEconomy(s, w);
    const now = dayToDate(s.day, s.startYear).y;
    for (let y = s.startYear + 1; y <= now; y++) computeYear(s, w, y);
    s.v = 4;
  }
  if (s.v !== STATE_VERSION) throw new Error(`state version ${s.v} cannot be upgraded to ${STATE_VERSION}`);
  return s;
}
