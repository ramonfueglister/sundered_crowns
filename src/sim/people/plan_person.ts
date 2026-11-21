// What the day plan (src/sim/people/day_plan.ts, people feature 12) needs of a person, read from the world: the
// person's part, the calendar of the person's days of work, and whether the person is away today.
import type { WorldState } from '../state';
import { BORN_UNKNOWN } from '../state';
import { calendarOf } from '../holy_days';
import { AGRICULTURE } from '../systems/hamlets';
import { ROLE, WORKING_AGE } from '../systems/work';
import { ageOn } from '../systems/people';
import { CHILDBED_DAYS, sickness } from './absence';
import { AWAY, type PlanPerson, WHO } from './day_plan';

/** The sector of industry in the calibration table (data/economy/england_1356.json: agriculture, industry, services). */
const INDUSTRY = 1;

/** What the plan needs of the person in row `id` on the world's day; `heading`: for a ruler on the way, the place of
 *  the next stop (headingOf, src/sim/content/itineraries.ts), else −1; `away`: why the person is away (AWAY), where
 *  the caller knows it for many persons at once. */
export function planPerson(s: WorldState, id: number, heading = -1, away = awayOn(s, id, s.day)): PlanPerson {
  const P = s.person.cols,
    F = s.firm.cols,
    own = calendarOf(P.faith[id]);
  if (holdsCrown(s, id)) return { who: WHO.ruler, calendar: own, away, heading };
  const of = (who: number, calendar = own): PlanPerson => ({ who, calendar, away, heading: -1 });
  if (P.born[id] !== BORN_UNKNOWN && ageOn(P.born[id], s.day) < WORKING_AGE) return of(WHO.child);
  const role = P.role[id],
    firm = P.firm[id];
  if (role === ROLE.banker) return of(WHO.bank);
  if (role !== ROLE.worker && role !== ROLE.owner) return of(WHO.home);
  if (firm < 0) return of(WHO.seeking);
  const who = F.sector[firm] === AGRICULTURE ? WHO.farm : F.sector[firm] === INDUSTRY ? WHO.craft : WHO.trade;
  // a worker keeps the days of the firm's owner's faith (people feature 8), a firm without an owner works every day
  if (role === ROLE.owner) return of(who);
  const owner = F.owner[firm];
  return of(who, calendarOf(owner < 0 ? -1 : P.faith[owner]));
}

/** Whether the person in row `id` holds a crown. */
function holdsCrown(s: WorldState, id: number): boolean {
  for (let r = 0; r < s.realm.size; r++) if (s.realm.cols.holder[r] === id) return true;
  return false;
}

/** Why the person in row `id` is away on `day`, as the economy has it (src/sim/systems/workers.ts): sick by the
 *  person's own draws, or a mother in the 30 days from a birth. A person whose birth is unknown has no sickness: the
 *  draws count the age. */
export function awayOn(s: WorldState, id: number, day: number): number {
  const P = s.person.cols,
    born = P.born[id];
  if (born !== BORN_UNKNOWN) {
    const sick = sickness(s.seed >>> 0, P.uid[id], born, day + 1),
      n = sick.length;
    if (n && sick[n - 2] <= day && day <= sick[n - 1]) return AWAY.sick;
  }
  if (P.sex[id] !== 0) return AWAY.none;
  const uid = P.uid[id];
  for (let i = 0; i < s.person.size; i++)
    if (s.person.alive[i] && P.mother[i] === uid && P.born[i] <= day && P.born[i] > day - CHILDBED_DAYS)
      return AWAY.childbed;
  return AWAY.none;
}
