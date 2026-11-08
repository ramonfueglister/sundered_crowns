// System order matters: economy first (prices, incomes), then politics, armies, wars, diplomacy, society, knowledge, events, AI.
import type { System } from '../ctx';
import { economy } from './economy';
import { politics } from './politics';
import { military, releaseNation, newArmy, availableUnits } from './military';
import { war, _setMilitary } from './war';
import { diplomacy } from './diplomacy';
import { society } from './society';
import { progress } from './progress';
import { colonial } from './colonial';
import { realm } from './realm';
import { situations } from './situations';
import { goals } from './goals';
import { events } from './events';
import { ai } from './ai';

_setMilitary({ releaseNation, newArmy, availableUnits });

export const SYSTEMS: System[] = [politics, progress, society, economy, military, war, diplomacy, colonial, realm, situations, goals, events, ai];
