// A person's plan of the day as the world server tells it (GET /person/<uid>, server/routes.ts; people feature 12,
// src/sim/people/day_plan.ts). The browser picks the part of the day by the world's hour.
import type { WorldState } from '../sim/state';
import type { World } from '../sim/world';
import { type DayPlan, dayPlan } from '../sim/people/day_plan';
import { planPerson } from '../sim/people/plan_person';

/** The plan of a person's day, the part of the person it was chosen by (WHO), and for a ruler on the way the German
 *  name of the place of the next stop. */
export interface PersonPlan extends DayPlan {
  who: number;
  to: string | null;
}

/** The plan of the person in row `id` today, at the place `at` the person is in (home, or where a ruler stays);
 *  `heading`: for a ruler on the way, the place of the next stop, else −1. */
export function personPlan(
  s: WorldState,
  w: Pick<World, 'lat' | 'namesDe'>,
  id: number,
  at: number,
  heading: number,
): PersonPlan {
  const p = planPerson(s, id, heading);
  return { ...dayPlan(p, at, w.lat[at], s.day, s.startYear), who: p.who, to: heading >= 0 ? w.namesDe[heading] : null };
}
