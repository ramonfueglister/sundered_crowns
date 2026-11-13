// System order matters: economy first (prices, incomes), then politics, armies, wars, diplomacy, society, knowledge, events, AI;
// the ledger last, so that the month's books close after every system has booked its income and costs.
import type { System } from '../ctx';
import { economy, ledger } from './economy';
import { politics } from './politics';
import { military } from './military';
import { war } from './war';
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
import { curia } from './curia';
import { government } from './government';
import { powers } from './powers';
import { commanders } from './commanders';
import { victory } from './victory';

let LIST: System[] | null = null;
/** The systems in the order they run. Built on first use, not while the modules load: the sim's modules import one
 *  another in cycles, and a system still loading when the list was built would leave a hole in it. */
export function systems(): System[] {
  return LIST ??= [politics, faith, progress, society, administration, economy, military, commanders, war, diplomacy, colonial, realm, empire, curia, government, powers, landmarks, situations, goals, events, ai, victory, ledger];
}
