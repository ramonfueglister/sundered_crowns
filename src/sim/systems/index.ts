// System order matters: economy first (prices, incomes), then politics, armies, wars, diplomacy, society, knowledge, events, AI.
import type { System } from '../ctx';
import { economy } from './economy';
import { politics } from './politics';
import { military, releaseNation, newArmy, availableUnits, landFaith, khanFaith } from './military';
import { war, _setMilitary } from './war';
import { diplomacy } from './diplomacy';
import { society } from './society';
import { administration } from './administration';
import { progress } from './progress';
import { colonial } from './colonial';
import { realm } from './realm';
import { landmarks } from './landmarks';
import { situations } from './situations';
import { goals } from './goals';
import { events } from './events';
import { ai } from './ai';
import { faith } from './faith';
import { empire } from './empire';
import { government } from './government';
import { powers } from './powers';

_setMilitary({ releaseNation, newArmy, availableUnits, landFaith, khanFaith });

export const SYSTEMS: System[] = [politics, faith, progress, society, administration, economy, military, war, diplomacy, colonial, realm, empire, government, powers, landmarks, situations, goals, events, ai];
