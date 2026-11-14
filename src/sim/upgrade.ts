// Brings the state of a world that was saved by an older build up to this build's STATE_VERSION. The world runs
// without end, so every change to the shape of the state needs its step here.
import type { WorldState } from './state';
import { STATE_VERSION } from './state';
import type { World } from './world';
import { cultivate } from './systems/cultivation';
import { bringInHarvest } from './systems/harvest';

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
  if (s.v !== STATE_VERSION) throw new Error(`state version ${s.v} cannot be upgraded to ${STATE_VERSION}`);
  return s;
}
