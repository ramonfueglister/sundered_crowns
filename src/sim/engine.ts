// One step of the world: the systems in their order (src/sim/systems/index.ts).
import type { WorldState } from './state';
import type { World } from './world';
import { tick, type Tick } from './schedule';
import { SYSTEMS } from './systems';

export function advanceDay(s: WorldState, w: World): Tick { return tick(s, w, SYSTEMS); }
