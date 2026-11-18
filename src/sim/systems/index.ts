// The systems of the world in the order they run each day. Each one is a feature of the economy that was designed
// and agreed on its own (docs/ECONOMY_DESIGN.md).
import type { System } from '../schedule';
import { cultivation } from './cultivation';
import { harvest } from './harvest';
import { cityEconomies } from './economy';
import { rulers } from './rulers';
import { borders } from './borders';
import { deaths } from './deaths';
import { families } from './families';
import { moves } from './moves';

export const SYSTEMS: readonly System[] = [deaths, moves, families, cultivation, harvest, cityEconomies, borders, rulers];
