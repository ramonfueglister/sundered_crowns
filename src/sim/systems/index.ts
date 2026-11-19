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
import { archive } from '../people/archive';

// the archive first: on the first of January the dead whom nothing needs leave the table before the day reads it
export const SYSTEMS: readonly System[] = [archive, deaths, moves, families, cultivation, harvest, cityEconomies, borders, rulers];
