// All event content. Each file exports an array of EventDef; add new files here.
import type { EventDef } from '../../systems/events';
import { COURT_EVENTS } from './court';
import { PLAGUE_AND_HARVEST_EVENTS } from './plague_and_harvest';
import { CHURCH_EVENTS } from './church';
import { ECONOMY_EVENTS } from './economy';
import { WAR_AND_SOCIETY_EVENTS } from './war_and_society';
import { DISCOVERY_EVENTS } from './discovery';
import { HISTORICAL_EVENTS } from './historical';
export const EVENTS: EventDef[] = [
  ...COURT_EVENTS, ...PLAGUE_AND_HARVEST_EVENTS, ...CHURCH_EVENTS, ...ECONOMY_EVENTS,
  ...WAR_AND_SOCIETY_EVENTS, ...DISCOVERY_EVENTS, ...HISTORICAL_EVENTS,
];
