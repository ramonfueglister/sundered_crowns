// The lines of a person's day on the card a figure shows (hover_lines.ts): what kind of day it is, and what the person
// does at the world's hour (people feature 12, src/sim/people/day_plan.ts). Text only, so it can be tested without a
// page.
import type { PersonPlan } from '../net/plan';
import { DAY } from '../sim/holy_days';
import { DOING, type DayPlan, WHO, doingAt } from '../sim/people/day_plan';
import { TASK, inBarn } from '../sim/people/farm_year';

/** The works of the farming year (src/sim/people/farm_year.ts), in German. */
const TASKS: Record<number, string> = {
  [TASK.thresh]: 'Dreschen',
  [TASK.spring]: 'Frühjahrssaat und Mist',
  [TASK.fallow]: 'Brache pflügen',
  [TASK.hay]: 'Heuernte',
  [TASK.weed]: 'Jäten, Brache pflügen',
  [TASK.harvest]: 'Getreideernte',
  [TASK.winter]: 'Wintersaat',
  [TASK.prune]: 'Reben schneiden und setzen',
  [TASK.garden]: 'Pflanzen und säen',
  [TASK.floor]: 'Dreschen',
  [TASK.summer]: 'Ernte der Sommerfrüchte',
};

/** Where the work of the farming year is done, in German. */
const workPlace = (task: number): string =>
  inBarn(task)
    ? 'in der Scheune'
    : task === TASK.floor
      ? 'auf der Tenne'
      : task === TASK.garden
        ? 'im Garten'
        : 'auf dem Feld';

/** What kind of day it is for the person. */
export function dayText(p: DayPlan): string {
  const kind =
    p.kind === DAY.rest
      ? p.feast
        ? 'Feiertag'
        : p.weekday === 0
          ? 'Sonntag'
          : 'Sabbat'
      : p.kind === DAY.half
        ? p.weekday === 6
          ? 'Samstag, halber Werktag'
          : 'Vorabend eines Festes, halber Werktag'
        : 'Werktag';
  const more = [p.market ? 'Markttag' : '', p.task >= 0 && p.kind !== DAY.rest ? TASKS[p.task] : ''].filter(Boolean);
  return [kind, ...more].join(', ');
}

/** What the person does at the hour `hour` of the day, and until when. */
export function nowText(p: PersonPlan, hour: number): string {
  const doing = doingAt(p, hour),
    next = p.slots.find(([h]) => h > hour),
    until = next ? ` (bis ${clock(next[0])})` : '';
  return `${doingText(p, doing)}${until}`;
}

/** An hour of local solar time as the clock shows it. */
const clock = (h: number) => {
  const min = Math.round(h * 60);
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')} Uhr`;
};

function doingText(p: PersonPlan, doing: number): string {
  switch (doing) {
    case DOING.sleep:
      return 'schläft';
    case DOING.home:
      return 'zu Hause';
    case DOING.work:
      return workText(p);
    case DOING.meal:
      return 'beim Mittagessen';
    case DOING.market:
      return 'auf dem Markt';
    case DOING.church:
      return 'in der Kirche';
    case DOING.hiring:
      return 'sucht Arbeit auf dem Markt';
    case DOING.sick:
      return 'krank zu Hause';
    case DOING.childbed:
      return 'im Wochenbett';
    case DOING.court:
      return 'hält Hof';
    case DOING.travel:
      return p.to ? `unterwegs nach ${p.to}` : 'unterwegs';
    default:
      return '';
  }
}

function workText(p: PersonPlan): string {
  if (p.who === WHO.farm) return `${workPlace(p.task)}: ${TASKS[p.task]}`;
  if (p.who === WHO.craft) return 'in der Werkstatt';
  if (p.who === WHO.bank) return 'in der Bank';
  return 'bei der Arbeit';
}
