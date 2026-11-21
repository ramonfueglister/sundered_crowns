// Checks the day plan (people feature 12, src/sim/people/day_plan.ts) on a world of 1291 that runs with all systems:
//   npm run dayplan:check [-- years]
// Per year: the days a day labourer and a servant by the year are at work by their plans (a half day as half), also by
// the calendar of the firm, against
// the 175 to 200 days a day labourer needed before 1348 for the income of a year (Humphries & Weisdorf 2019, Unreal
// wages?, Economic Journal 129: a check, not a parameter, computed from wages and not counted); the hours at work of a
// worker of London by month; and whether every person has the same plan after a restart from the snapshot of the day.
import { loadSetup, loadWorld } from './load';
import { createWorldState } from '../../src/sim/setup';
import { tick } from '../../src/sim/schedule';
import { SYSTEMS } from '../../src/sim/systems';
import { decodeState, encodeState } from '../../src/sim/snapshot';
import { dayToDate } from '../../src/sim/calendar';
import { CALENDAR, DAY } from '../../src/sim/holy_days';
import { CHILDBED_DAYS, awayDays, sickness } from '../../src/sim/people/absence';
import { AWAY, DOING, type DayPlan, dayPlan } from '../../src/sim/people/day_plan';
import { FARM_YEAR } from '../../src/sim/people/farm_year';
import { planPerson } from '../../src/sim/people/plan_person';
import { presentPersons } from '../../src/sim/people/living';
import { CITIES } from '../../src/sim/systems/people';
import { ROLE } from '../../src/sim/systems/work';
import { ALIVE, type WorldState } from '../../src/sim/state';

const YEARS = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 3);
const w = loadWorld(),
  s = createWorldState(w, loadSetup(1291), 1291),
  london = CITIES.find((c) => c.name === 'London')!.place,
  /** the farming year of a place (src/sim/people/farm_year.ts) */
  farm = (place: number) => w.farmYear?.[place] ?? FARM_YEAR.north;

/** The share of a day the plan has the person at work: the hours at work over those of a working day of the same
 *  sunrise and sunset, so a half day counts as about half. */
const atWork = (p: DayPlan): number => (hoursAt(p, DOING.work) + hoursAt(p, DOING.market) > 0 ? WORKED[p.kind] : 0);
const WORKED = [1, 0.5, 0];
/** The hours of the day the plan has the person doing `doing`. */
function hoursAt(p: DayPlan, doing: number): number {
  let h = 0;
  p.slots.forEach(([from, what], k) => {
    if (what === doing) h += (p.slots[k + 1]?.[0] ?? 24) - from;
  });
  return h;
}

/** The runs of days away of every living person of 15 or more from `from` to `to`, by row (as src/sim/systems/
 *  workers.ts gives them to the economy). */
function awayRuns(st: WorldState, from: number, to: number): Map<number, number[]> {
  const P = st.person.cols,
    births = new Map<number, number[]>();
  for (let id = 0; id < st.person.size; id++) {
    const b = P.born[id];
    if (!st.person.alive[id] || P.mother[id] < 0 || b <= from - CHILDBED_DAYS || b > to) continue;
    births.set(P.mother[id], [...(births.get(P.mother[id]) ?? []), b]);
  }
  const out = new Map<number, number[]>();
  for (const id of presentPersons(st)) {
    if (P.died[id] !== ALIVE) continue;
    const runs = awayDays(
      sickness(st.seed >>> 0, P.uid[id], P.born[id], to + 1),
      births.get(P.uid[id]) ?? [],
      from,
      to,
    );
    if (runs.length) out.set(id, runs);
  }
  return out;
}
const awayFrom = (runs: number[] | undefined, day: number) => {
  for (let r = 0; runs && r < runs.length; r += 2) if (runs[r] <= day && day <= runs[r + 1]) return AWAY.sick;
  return AWAY.none;
};

for (let y = 1; y <= YEARS; y++) {
  const from = s.day + 1,
    to = from + 364;
  // the runs of days away are counted for the year at its start; the rows hold until the next first of January
  let runs = awayRuns(s, from, to);
  const byDay = { days: 0, worked: 0 },
    byYear = { days: 0, worked: 0 },
    // the day labourers by the calendar of their firm (src/sim/holy_days.ts CALENDAR)
    byCalendar = Array.from({ length: Object.keys(CALENDAR).length }, () => ({ days: 0, worked: 0 })),
    hours = Array.from({ length: 12 }, () => ({ days: 0, work: 0 }));
  for (let d = from; d <= to; d++) {
    tick(s, w, SYSTEMS);
    if (dayToDate(s.day, s.startYear).d === 1 && dayToDate(s.day, s.startYear).m === 0) runs = awayRuns(s, s.day, to);
    const P = s.person.cols,
      Fam = s.family.cols,
      m = dayToDate(s.day, s.startYear).m;
    for (const id of presentPersons(s)) {
      if (P.died[id] !== ALIVE || P.role[id] !== ROLE.worker || P.firm[id] < 0) continue;
      const f = P.family[id],
        place = Fam.place[f],
        plan = dayPlan(
          planPerson(s, id, -1, awayFrom(runs.get(id), s.day)),
          place,
          w.lat[place],
          s.day,
          s.startYear,
          farm(place),
        ),
        // a worker who heads a family works by the day, every other serves by the year (people feature 10)
        acc = Fam.man[f] === id || Fam.woman[f] === id ? byDay : byYear;
      acc.days++;
      acc.worked += atWork(plan);
      if (acc === byDay) {
        const c = byCalendar[planPerson(s, id, -1, AWAY.none).calendar];
        c.days++;
        c.worked += atWork(plan);
      }
      if (place === london && plan.kind === DAY.work) {
        hours[m].days++;
        hours[m].work += hoursAt(plan, DOING.work);
      }
    }
  }
  const perYear = (a: { days: number; worked: number }) => ((a.worked / a.days) * 365).toFixed(1);
  console.log(
    `year ${y} (to day ${s.day}): days at work a year, day labourers ${perYear(byDay)} (Humphries & Weisdorf: 175–200 needed), servants ${perYear(byYear)}`,
  );
  console.log(
    `  day labourers by the calendar of the firm: ${Object.entries(CALENDAR)
      .filter(([, c]) => byCalendar[c].days)
      .map(([name, c]) => `${name} ${perYear(byCalendar[c])} (${(byCalendar[c].days / 365).toFixed(0)})`)
      .join(', ')}`,
  );
  console.log(
    `  hours at work on a working day, London, by month: ${hours.map((h) => (h.work / Math.max(1, h.days)).toFixed(1)).join(' ')}`,
  );
}

// the same plan after a restart from the snapshot of the day
const back = decodeState(encodeState(s)),
  awayA = awayRuns(s, s.day, s.day),
  awayB = awayRuns(back, back.day, back.day);
let same = 0,
  differ = 0;
for (const id of presentPersons(s)) {
  const place = s.family.cols.place[s.person.cols.family[id]],
    a = JSON.stringify(
      dayPlan(planPerson(s, id, -1, awayFrom(awayA.get(id), s.day)), place, w.lat[place], s.day, 1291, farm(place)),
    ),
    b = JSON.stringify(
      dayPlan(
        planPerson(back, id, -1, awayFrom(awayB.get(id), back.day)),
        place,
        w.lat[place],
        back.day,
        1291,
        farm(place),
      ),
    );
  if (a === b) same++;
  else differ++;
}
console.log(`after a restart from the snapshot of day ${s.day}: ${same} plans the same, ${differ} differ`);
