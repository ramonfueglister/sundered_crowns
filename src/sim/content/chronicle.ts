// The chronicle of rulers: who held the crown of every realm from the start year to 1848, with the real days of
// birth, accession and death (public/data/rulers_<year>.json, written by tools/history/rulers/build.ts from the
// sourced lists in data/history/rulers/lists/). Static data: the world plays it day by day
// (src/sim/systems/rulers.ts). Ramon, 16 November 2026: "für den moment würde ich die herrscher strikt nach
// historischen jahreszahlen sterben und geboren werden"; a realm follows the real holder of its title.
import { dateToDay } from '../calendar';

export interface ChroniclePerson {
  /** stable key: the Wikidata id where known, else the realm and the order in its list */
  key: string;
  name: string;
  house: string;
  qid: string;
  /** 0 female, 1 male */
  sex: 0 | 1;
  /** dates as the source gives them: YYYY-MM-DD, YYYY-MM or YYYY; null when no source gives one */
  born: string | null;
  died: string | null;
}
export interface ChronicleReign {
  /** the key of the realm (the id of the setup) */
  realm: string;
  /** index into `persons` */
  person: number;
  start: string | null;
  /** null: the reign lasts past the end of the chronicle */
  end: string | null;
  /** the source of the row (a Wikipedia revision or a Wikidata statement) */
  source: string;
}
export interface ChronicleJson {
  year: number;
  /** the last day the chronicle covers (YYYY-MM-DD) */
  until: string;
  persons: ChroniclePerson[];
  reigns: ChronicleReign[];
}

/** What happens on a day: a person comes into the world (born, or alive on the first day), a reign ends, a person
 *  dies, a person takes a crown. On one day they happen in this order, so a successor takes the crown after the
 *  predecessor has left it. */
export enum Happening {
  Enter = 0,
  End = 1,
  Die = 2,
  Accede = 3,
}
interface ChronicleEvent {
  day: number;
  what: Happening;
  person: number;
  realm: string;
}
interface ChronicleReignDays {
  person: number;
  start: number;
  end: number | null;
  /** the dates of the source (null: none given) and the source of the row */
  from: string | null;
  to: string | null;
  source: string;
}

export interface Chronicle {
  year: number;
  persons: readonly ChroniclePerson[];
  /** per person: the day of birth (null: unknown), and the day of death (null: unknown, or after the chronicle) */
  bornDay: readonly (number | null)[];
  diedDay: readonly (number | null)[];
  /** the realm of each person's first reign: the person lives in its capital */
  home: readonly string[];
  /** sorted by day, then by what happens, then by person */
  events: readonly ChronicleEvent[];
  /** the reigns of each realm as days (end null: past the chronicle), for co-rulers: when one of them leaves, the
   *  crown stays with another who still reigns; with the dates and the source as the chronicle gives them (for the
   *  readable copy of the rulers, server/rulers_copy.ts) */
  reignsOf: ReadonlyMap<string, readonly ChronicleReignDays[]>;
}

/** A date of the source as a day of the world. A date without a day is taken as the middle of its month, one without
 *  a month as the middle of its year (1 July): the error is then at most half the period the source leaves open. */
export function dayOf(date: string | null, startYear: number): number | null {
  if (!date) return null;
  const m = /^(-?\d{1,4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(date.trim());
  if (!m) throw new Error(`not a date: ${date}`);
  const y = Number(m[1]);
  if (m[3]) return dateToDay(y, Number(m[2]) - 1, Number(m[3]), startYear);
  if (m[2]) return dateToDay(y, Number(m[2]) - 1, 15, startYear);
  return dateToDay(y, 6, 1, startYear);
}

/** Turns the chronicle into the days on which something happens.
 *  - A person comes into the world on the day of birth, or on the first day when born before it and alive then; a
 *    person whose birth no source gives comes on the day of the first reign (or the first day).
 *  - A person dies on the day of death. A person whose death no source gives leaves the world when the last reign
 *    ends; whose last reign has no end either, stays.
 *  - Nobody who died before the first day comes into the world. */
export function compileChronicle(j: ChronicleJson): Chronicle {
  const Y = j.year,
    n = j.persons.length;
  const bornDay = j.persons.map((p) => dayOf(p.born, Y)),
    diedDay = j.persons.map((p) => dayOf(p.died, Y));
  const reigns = j.reigns.map((r) => ({ ...r, s: dayOf(r.start, Y), e: dayOf(r.end, Y) }));
  const first = new Array<number | null>(n).fill(null),
    last = new Array<number | null>(n).fill(null),
    home = new Array<string>(n).fill('');
  const open = new Array<boolean>(n).fill(false);
  for (const r of [...reigns].sort((a, b) => (a.s ?? 0) - (b.s ?? 0))) {
    const p = r.person;
    if (first[p] === null || (r.s ?? 0) < first[p]!) {
      first[p] = r.s ?? 0;
      home[p] = r.realm;
    }
    if (r.e === null) open[p] = true;
    else if (last[p] === null || r.e > last[p]!) last[p] = r.e;
  }
  const events: ChronicleEvent[] = [];
  for (let p = 0; p < n; p++) {
    if (!home[p]) continue; // a person without a reign is no ruler
    const died = diedDay[p] ?? (open[p] ? null : last[p]);
    if (died !== null && died < 0) continue;
    const enter = Math.max(0, bornDay[p] ?? first[p] ?? 0);
    events.push({ day: enter, what: Happening.Enter, person: p, realm: home[p] });
    if (died !== null) events.push({ day: Math.max(died, enter), what: Happening.Die, person: p, realm: '' });
  }
  for (const r of reigns) {
    if (r.e !== null && r.e < 0) continue;
    const died = diedDay[r.person];
    if (died !== null && died < 0) continue;
    events.push({ day: Math.max(0, r.s ?? 0), what: Happening.Accede, person: r.person, realm: r.realm });
    if (r.e !== null) events.push({ day: r.e, what: Happening.End, person: r.person, realm: r.realm });
  }
  events.sort(
    (a, b) =>
      a.day - b.day || a.what - b.what || a.person - b.person || (a.realm < b.realm ? -1 : a.realm > b.realm ? 1 : 0),
  );
  const reignsOf = new Map<string, ChronicleReignDays[]>();
  for (const r of reigns) {
    const l = reignsOf.get(r.realm) ?? [];
    reignsOf.set(r.realm, l);
    l.push({ person: r.person, start: r.s ?? 0, end: r.e, from: r.start, to: r.end, source: r.source });
  }
  return { year: Y, persons: j.persons, bornDay, diedDay, home, events, reignsOf };
}

/** The index of the first event on or after `day` (binary search). */
export function firstEventOn(c: Chronicle, day: number): number {
  let lo = 0,
    hi = c.events.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (c.events[m].day < day) lo = m + 1;
    else hi = m;
  }
  return lo;
}
