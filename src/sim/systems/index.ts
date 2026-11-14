// The systems of the world in the order they run each day. Each one is a feature of the economy that was designed
// and agreed on its own (docs/ECONOMY_DESIGN.md).
import type { System } from '../schedule';
import { harvest } from './harvest';

export const SYSTEMS: readonly System[] = [harvest];
