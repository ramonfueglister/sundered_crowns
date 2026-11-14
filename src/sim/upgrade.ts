// Brings the state of a world that was saved by an older build up to this build's STATE_VERSION. The world runs
// without end, so every change to the shape of the state needs its step here.
import type { WorldState } from './state';
import { STATE_VERSION } from './state';
import type { World } from './world';
import { bringInHarvest } from './systems/harvest';

export function upgradeState(s: WorldState, w: World): WorldState {
  if (s.v === 1) { // 1 → 2: the harvest of each place
    s.place.harvest = new Float64Array(w.L);
    bringInHarvest(s, w);
    s.v = 2;
  }
  if (s.v !== STATE_VERSION) throw new Error(`state version ${s.v} cannot be upgraded to ${STATE_VERSION}`);
  return s;
}
