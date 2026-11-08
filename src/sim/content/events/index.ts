// All event content. Each file exports an array of EventDef; add new files here.
import type { EventDef } from '../../systems/events';
import { COURT_EVENTS } from './court';
export const EVENTS: EventDef[] = [...COURT_EVENTS];
