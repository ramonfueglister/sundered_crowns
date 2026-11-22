// The rulers: every realm has a holder, a historical person who is born, takes the crown and dies on the real days of
// the chronicle (src/sim/content/chronicle.ts). Ramon, 16 November 2026: rulers strictly by the historical dates for
// now; a ruler is one person (1:1), the rest of the nobility will come at 1:100; a realm follows the real holder of
// its title (after the realm's end the title goes on with whoever really held it, so one person may hold several
// crowns). The borders do not move here.
//
// Where the world has gone another way than history, history holds only as far as the world still agrees with it
// (Ramon, 20 November 2026: "wenn könig früher stirbt bevor er königin geheiratet hat gibt es keine erben mit dem
// historischen erbe"):
// - A person of history is born only if the father lived at the conception and the mother at the birth, wherever
//   history has them alive then (`unborn`): a child conceived by other parents, or at another time, is another
//   person (Parfit 1984, Reasons and Persons, ch. 16). The happenings of a person not born find nobody, and a crown
//   of theirs stays with nobody until the next holder of history takes it.
// - A ruler dies on the day of death the sources give. Where they give the birth but not the death, the life table
//   decides as for every person of the towns (src/sim/systems/deaths.ts, `drawDeath`), given that the person lived to
//   the last day the sources show them alive (`Chronicle.seenUntil`). Where they give neither, the world knows no age
//   to draw from, and the person leaves it when the last reign ends (OWN RULE: no age, no life table).
// Nothing in the world moves a ruler's mortality yet, so the draw of the life table that gives the historical day of
// death (Pearl 2009, Causality, ch. 7: abduction) would give that same day; it becomes a draw of its own here when
// something does. A free world (`World.rulerDeaths` 'drawn', to measure how far a world goes from history) draws it.
// - An accession of history takes the crown where the crown is history's: nobody holds it, or a person history has
//   reigning there. A crown the world has given to a person of its own (src/sim/systems/succession.ts) stays with
//   them: history's accession had history's holder before it, and the world has another.
// - Where a crown is left with nobody though history has it with a person the world lacks, src/sim/systems/
//   succession.ts names the holder at the end of the day: history's where it can, else the heir by the realm's order.
//
// A ruler is a person of the person table like everybody else: the genes, the IQ and the Big Five are drawn as for
// the founders of the cities, from the gene pool of the ruler's culture. The ruler lives in the capital of
// the realm of the first reign, in a family of their own, and has no part in the economy (role 0). Who the person is
// in the sources stands beside the table (`WorldState.named`).
import type { WorldState, NamedPerson } from '../state';
import { ALIVE, BORN_UNKNOWN, NO_LOT } from '../state';
import { spawn } from '../ecs';
import { spawnPerson } from '../people/archive';
import type { World } from '../world';
import type { System } from '../schedule';
import { type Chronicle, GESTATION_DAYS, Happening, firstEventOn } from '../content/chronicle';
import { drawDeath } from './deaths';
import { DRAW, type Persons, lifeEnd, murderDay, settleAll } from './succession';
import { setRulerCulture } from './cultures';
import { hash01 } from '../rng';
import { founder, NG } from '../people/genes';
import { poolOf } from '../people/pools';
import { ALL_CULTURES } from '../content/peoples';

// a stream of draws of its own: the world's seed, the chronicle key of the person, the number of the draw (the life and
// the murder are DRAW of src/sim/systems/succession.ts)
const K = { trait: 10, genes: 100 } as const;
function keyHash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
const u01 = (seed: number, key: number, k: number) => hash01(seed ^ 0x52554c45, key, k); // "RULE"
function normal(seed: number, key: number, k: number): number {
  const a = Math.max(u01(seed, key, k), 2 ** -32),
    b = u01(seed, key, k + 1);
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
}
const clampU8 = (v: number) => Math.min(255, Math.max(0, Math.round(v)));

/** The realm of each key, and the person (the row) of each chronicle key, of a state (rebuilt when the state changes:
 *  a person of history comes into the world, or the rows close up on the first of January, src/sim/people/archive.ts). */
const index = new WeakMap<
  WorldState,
  { realms: Map<string, number>; persons: Map<string, number>; keys: Map<number, string>; n: number; table: object }
>();
function indexOf(s: WorldState) {
  let x = index.get(s);
  if (!x || x.n !== s.named.length || x.table !== s.person) {
    x = {
      realms: new Map(s.realmText.map((t, k) => [t.key, k])),
      persons: new Map(s.named.map((p) => [p.key, p.person])),
      keys: new Map(s.named.map((p) => [p.person, p.key])),
      n: s.named.length,
      table: s.person,
    };
    index.set(s, x);
  }
  return x;
}

/** The genes of a ruler: a founder of the pool of the ruler's culture (src/sim/people/pools.ts; portrait round 111),
 *  else of the place the ruler lives in, from the ruler's own stream of draws. */
function giveRulerGenes(s: WorldState, w: World, id: number, key: string, place: number): void {
  const seed = s.seed >>> 0,
    kh = keyHash(key),
    P = s.person.cols;
  const bits = (k: number) => {
    const u = (j: number) => BigInt(Math.floor(u01(seed, kh, K.genes + 2 * k + j) * 4294967296));
    return (u(1) << 32n) | u(0);
  };
  P.genes.set(founder(poolOf(ALL_CULTURES[P.culture[id]], w.lon[place], w.lat[place]), bits), id * 2 * NG);
}

/** Gives every ruler of the world their genes anew, as they would have drawn them on entering it (the upgrade of a
 *  world whose rulers drew by the place: src/sim/upgrade.ts). */
export function rulerGenes(s: WorldState, w: World): void {
  for (const n of s.named ?? [])
    giveRulerGenes(s, w, n.person, n.key, s.family.cols.place[s.person.cols.family[n.person]]);
}

/** The person ids of the persons of history (rulers): they have no part in the economy. */
export function namedPersons(s: WorldState): Set<number> {
  return new Set((s.named ?? []).map((p) => p.person));
}

/** The place a ruler lives in: the capital of the realm, else its first place on the map. */
function seatOf(s: WorldState, realm: number): number {
  const c = s.realm.cols.capital[realm];
  if (c >= 0) return c;
  const o = s.place.owner;
  for (let i = 0; i < o.length; i++) if (o[i] === realm) return i;
  return -1;
}

/** A happening of the chronicle, and the index of the realms and the persons of history of a state. */
type Event = Chronicle['events'][number];
type Index = ReturnType<typeof indexOf>;

/** What a day does besides its happenings: the realms whose crown it touched, with the person of the chronicle who
 *  left it (-1: nobody), for `settle`; and the deaths it dates. */
interface Day {
  touch(r: number, left: number): void;
  crown(r: number, id: number): void;
}

/** What one happening does to the state. Returns false when it could not be applied (the realm is not in this world,
 *  or the person is not in the world). `drawn`: a death the life table drew, not the chronicle's. */
function happen(s: WorldState, w: World, c: Chronicle, e: Event, d: Day, drawn = false): boolean {
  const x = indexOf(s),
    P = s.person.cols,
    R = s.realm.cols,
    cp = c.persons[e.person];
  const realm = e.realm ? x.realms.get(e.realm) : undefined;
  if (e.what === Happening.Enter)
    return realm !== undefined && !unborn(s, w, c, e.person) && enter(s, w, c, e, x, realm, d) !== undefined;
  const id = x.persons.get(cp.key);
  if (e.what === Happening.Accede && realm !== undefined && (id === undefined || P.died[id] !== ALIVE))
    d.touch(realm, -1); // history's holder is not there: see that the crown finds somebody
  if (id === undefined) return false;
  if (e.what === Happening.Die) {
    if (P.died[id] !== ALIVE) return true;
    // a free world: a person with a known birth dies on a day of their own
    if (!drawn && w.rulerDeaths === 'drawn' && P.born[id] !== BORN_UNKNOWN) return true;
    const seen = c.seenUntil[e.person];
    if (seen !== null && P.born[id] !== BORN_UNKNOWN && P.dies[id] !== e.day) {
      // the sources lose sight of the person here: from the last day they show them alive on, the life table decides
      if (P.dies[id] === ALIVE) P.dies[id] = drawDeath(s, id, Math.max(e.day, seen));
      return true;
    }
    P.died[id] = e.day;
    for (let r = 0; r < s.realm.size; r++) if (R.holder[r] === id) passCrown(s, c, e, x, r, d);
    return true;
  }
  if (realm === undefined || P.died[id] !== ALIVE) return false;
  if (e.what === Happening.End) {
    if (R.holder[realm] === id) passCrown(s, c, e, x, realm, d);
    return true;
  }
  const h = R.holder[realm]; // Accede
  if (h < 0 || h === id || reigning(c, realm, x, h, e.day, s)) d.crown(realm, id);
  return true;
}

/** Whether the person in row `id` reigns over `realm` on `day` in history. */
function reigning(c: Chronicle, realm: number, x: Index, id: number, day: number, s: WorldState): boolean {
  const p = numberOf(c).get(x.keys.get(id) ?? '');
  return (c.reignsOf.get(s.realmText[realm].key) ?? []).some(
    (g) => g.person === p && g.start <= day && (g.end === null || g.end >= day),
  );
}

/** The person of history of `e` enters the world in the seat of `realm`, with a family of their own: the row, or
 *  undefined when the realm has no place, or the person is in the world already. */
function enter(s: WorldState, w: World, c: Chronicle, e: Event, x: Index, realm: number, d: Day): number | undefined {
  const P = s.person.cols,
    cp = c.persons[e.person];
  const place = seatOf(s, realm);
  if (place < 0 || x.persons.has(cp.key)) return undefined;
  const id = spawnPerson(s),
    seed = s.seed >>> 0,
    kh = keyHash(cp.key);
  const born = c.bornDay[e.person];
  P.born[id] = born ?? BORN_UNKNOWN;
  P.sex[id] = cp.sex;
  P.mother[id] = -1;
  P.father[id] = -1;
  P.role[id] = 0;
  P.agent[id] = 0; // as the economy leaves every person outside it (src/sim/systems/economy.ts)
  P.firm[id] = -1;
  P.died[id] = ALIVE;
  // a ruler's death is decided by `happen`; a kin has no day of death in the chronicle's happenings, and in a free world
  // nobody with a known birth keeps the chronicle's
  const end =
    !c.home[e.person] || w.rulerDeaths === 'drawn' ? lifeEnd(w, c, e.person, drawOf(s, c, e.person, DRAW.life)) : null;
  P.dies[id] = end === null ? ALIVE : Math.max(end, e.day + 1);
  P.bears[id] = ALIVE; // and a ruler bears no child here
  P.home[id] = -1;
  P.moves[id] = ALIVE; // and does not move (src/sim/systems/moves.ts)
  setRulerCulture(s, id, realm); // the culture and faith of the realm the ruler enters the world in
  const z = (j: number) => normal(seed, kh, K.trait + 2 * j);
  P.iq[id] = clampU8(100 + 15 * z(0));
  P.o[id] = clampU8(50 + 10 * z(1));
  P.c[id] = clampU8(50 + 10 * z(2));
  P.e[id] = clampU8(50 + 10 * z(3));
  P.a[id] = clampU8(50 + 10 * z(4));
  P.n[id] = clampU8(50 + 10 * z(5));
  giveRulerGenes(s, w, id, cp.key, place);
  const f = spawn(s.family),
    F = s.family.cols;
  F.place[f] = place;
  F.man[f] = cp.sex === 1 ? id : -1;
  F.woman[f] = cp.sex === 0 ? id : -1;
  F.lot[f] = NO_LOT; // a ruler holds no parcel of a town: castles and residences are not built yet
  P.family[id] = f;
  const named: NamedPerson = { person: id, key: cp.key, name: cp.name, house: cp.house, qid: cp.qid };
  s.named.push(named);
  // a reign the sources begin before the person enters the world (a date without a day is the middle of its month or
  // year, which can lie before the birth): its accession found nobody, so the crown is the person's from today
  for (const g of reignsOfPerson(c).get(e.person) ?? []) {
    const r = x.realms.get(g.realm);
    if (r !== undefined && Math.max(0, g.start) < e.day && (g.end === null || g.end > e.day)) d.crown(r, id);
  }
  return id;
}

/** The draw `k` of the stream of the person `p` of the chronicle. */
const drawOf = (s: WorldState, c: Chronicle, p: number, k: number) => u01(s.seed >>> 0, keyHash(c.persons[p].key), k);

/** The reigns of every person of the chronicle, with the realm. */
const reigns = new WeakMap<Chronicle, Map<number, { realm: string; start: number; end: number | null }[]>>();
function reignsOfPerson(c: Chronicle) {
  let m = reigns.get(c);
  if (!m) {
    m = new Map();
    for (const [realm, list] of c.reignsOf)
      for (const g of list) {
        const l = m.get(g.person) ?? [];
        l.push({ realm, start: g.start, end: g.end });
        m.set(g.person, l);
      }
    reigns.set(c, m);
  }
  return m;
}

/** The crown of `r` that the person of `e` leaves goes to a co-ruler who still reigns that day, else to nobody (and
 *  `settle` looks at it at the end of the day). */
function passCrown(s: WorldState, c: Chronicle, e: Event, x: Index, r: number, d: Day): void {
  const P = s.person.cols;
  s.realm.cols.holder[r] = -1;
  d.touch(r, e.person);
  for (const g of c.reignsOf.get(s.realmText[r].key) ?? []) {
    if (g.person === e.person || g.start > e.day || (g.end !== null && g.end <= e.day)) continue;
    const q = x.persons.get(c.persons[g.person].key);
    if (q !== undefined && P.died[q] === ALIVE) {
      d.crown(r, q);
      return;
    }
  }
}

/** Whether the person `p` of the chronicle cannot be born into this world: a father who is a person of the world
 *  died before the child's conception, or a mother before its birth, though history has them alive then; in a free
 *  world also a parent the world does not have who dies then on a day of their own (`lifeEnd`, the day they would die
 *  on in the world); or a parent of history was not born either. Without a day of birth there is no day of conception,
 *  and the person comes as history has it (OWN RULE: no date to test against). `known` keeps the answers for the state
 *  as it is, to share among several questions: the forefathers of the persons of the chronicle are many, and shared. */
export function unborn(s: WorldState, w: World, c: Chronicle, p: number, known = new Map<number, boolean>()): boolean {
  const was = known.get(p);
  if (was !== undefined) return was;
  known.set(p, false); // a loop of parents in the data ends here
  const born = c.bornDay[p],
    out =
      born !== null &&
      (gone(s, w, c, c.fatherOf[p], born - GESTATION_DAYS, known) || gone(s, w, c, c.motherOf[p], born, known));
  known.set(p, out);
  return out;
}

/** Whether the parent `q` (a person of the chronicle, or none) was not alive in this world on `day` though history
 *  has them alive then. A parent who never came into the world is gone when not born either; one the world had no
 *  seat for is no difference between the world and history, except in a free world, where every person of history
 *  dies on a day of their own. */
function gone(
  s: WorldState,
  w: World,
  c: Chronicle,
  q: number | null,
  day: number,
  known: Map<number, boolean>,
): boolean {
  if (q === null) return false;
  const id = indexOf(s).persons.get(c.persons[q].key),
    history = c.diedDay[q],
    alive = history !== null && history > day;
  if (id !== undefined) {
    const died = s.person.cols.died[id];
    return alive && died !== ALIVE && died <= day;
  }
  if (unborn(s, w, c, q, known)) return true;
  if (!alive || w.rulerDeaths !== 'drawn') return false;
  const end = lifeEnd(w, c, q, drawOf(s, c, q, DRAW.life));
  return end !== null && end <= day;
}

/** The number of each person in the chronicle, by key. */
const numbers = new WeakMap<Chronicle, Map<string, number>>();
function numberOf(c: Chronicle): Map<string, number> {
  let m = numbers.get(c);
  if (!m) {
    m = new Map(c.persons.map((p, k) => [p.key, k]));
    numbers.set(c, m);
  }
  return m;
}

/** A death the life table drew for a person of history (`person.dies`, see `happen`). */
interface Drawn {
  day: number;
  person: number;
}
const byDay = (a: Drawn, b: Drawn) => a.day - b.day || a.person - b.person;

/** The drawn deaths of the persons of history on the days `from` … `to`, by day and then by the person's number in
 *  the chronicle, as the chronicle orders its own. */
function drawnDeaths(s: WorldState, c: Chronicle, from: number, to: number): Drawn[] {
  const P = s.person.cols,
    k = numberOf(c),
    out: Drawn[] = [];
  for (const n of s.named) {
    const day = P.dies[n.person],
      person = k.get(n.key);
    if (day !== ALIVE && P.died[n.person] === ALIVE && day >= from && day <= to && person !== undefined)
      out.push({ day, person });
  }
  return out.sort(byDay);
}

/** Applies every happening of the chronicle from day `from` up to and including day `to`, and the deaths the life
 *  table drew for those days; returns the happenings that could not be applied (realms not in this world, persons not
 *  in it). On a day the drawn deaths come where the chronicle's deaths come: after the ends of reigns, before the
 *  accessions. At the end of each day the crowns the day left with nobody are settled (src/sim/systems/succession.ts). */
export function playChronicle(s: WorldState, w: World, from: number, to: number): number {
  const c = w.chronicle;
  if (!c || c.year !== s.startYear) return 0;
  const P = s.person.cols,
    R = s.realm.cols,
    k = numberOf(c),
    due = drawnDeaths(s, c, from, to),
    touched = new Map<number, number>();
  let missed = 0,
    next = 0,
    today = Number.NaN;
  const d: Day = {
    touch: (r, left) => touched.set(r, left >= 0 ? left : (touched.get(r) ?? -1)),
    crown(r, id) {
      if (w.rulerDeaths === 'drawn' && !R.holder.includes(id)) {
        const p = k.get(indexOf(s).keys.get(id) ?? '');
        const m = p === undefined ? ALIVE : Math.max(today + 1, murderDay(today, drawOf(s, c, p, DRAW.murder)));
        if (m !== ALIVE && (P.dies[id] === ALIVE || m < P.dies[id])) P.dies[id] = m;
        dated(id);
      }
      R.holder[r] = id;
    },
  };
  /** a death dated during the play goes in its place among those still due (an older date of the person is skipped) */
  const dated = (id: number) => {
    const day = P.dies[id],
      person = k.get(indexOf(s).keys.get(id) ?? '');
    if (day === ALIVE || day < from || day > to || person === undefined) return;
    const x = { day, person };
    let at = next;
    while (at < due.length && byDay(due[at], x) < 0) at++;
    due.splice(at, 0, x);
  };
  const persons: Persons = {
    row: (p) => indexOf(s).persons.get(c.persons[p].key),
    unborn: (p) => unborn(s, w, c, p, known),
    enter(p, realm, day) {
      const id = enter(
        s,
        w,
        c,
        { day, what: Happening.Enter, person: p, realm: s.realmText[realm].key },
        indexOf(s),
        realm,
        d,
      );
      if (id !== undefined) dated(id);
      return id;
    },
    draw: (p, n) => drawOf(s, c, p, n),
  };
  /** the persons not born into the world, as far as asked since the deaths of the day (nobody dies while the crowns
   *  are settled) */
  let known = new Map<number, boolean>();
  const dawn = (day: number) => {
    if (day === today) return;
    known = new Map();
    settleAll(s, w, c, persons, touched, today, d.crown);
    touched.clear();
    today = day;
  };
  const dieUntil = (day: number) => {
    for (; next < due.length && due[next].day <= day; next++) {
      const x = due[next],
        id = indexOf(s).persons.get(c.persons[x.person].key);
      if (id === undefined || P.dies[id] !== x.day || P.died[id] !== ALIVE) continue;
      dawn(x.day);
      happen(s, w, c, { day: x.day, what: Happening.Die, person: x.person, realm: '' }, d, true);
    }
  };
  for (let i = firstEventOn(c, from); i < c.events.length && c.events[i].day <= to; i++) {
    const e: Event = c.events[i];
    dieUntil(e.what < Happening.Die ? e.day - 1 : e.day);
    dawn(e.day);
    const was = e.what === Happening.Die ? indexOf(s).persons.get(c.persons[e.person].key) : undefined,
      before = was === undefined ? ALIVE : P.dies[was];
    if (!happen(s, w, c, e, d)) missed++;
    if (was !== undefined && P.dies[was] !== before) dated(was); // the life table drew the day just now
    if (e.what === Happening.Enter) {
      const id = indexOf(s).persons.get(c.persons[e.person].key);
      if (id !== undefined && P.dies[id] !== ALIVE) dated(id);
    }
  }
  dieUntil(to);
  dawn(Number.NaN);
  return missed;
}

/** Founds the rulers of a new world (or of an older one brought up to date): every happening up to the day the world
 *  has reached, so the holders are those of that day. */
export function foundRulers(s: WorldState, w: World): number {
  s.realm.cols.holder.fill(-1);
  return playChronicle(s, w, Number.MIN_SAFE_INTEGER, s.day);
}

/** Gives every ruler of the world the culture and faith of the realm the ruler entered the world in, as the day of
 *  entering does (for a world from before the persons had cultures, src/sim/upgrade.ts). */
export function rulerCultures(s: WorldState, w: World): void {
  const c = w.chronicle;
  if (!c || c.year !== s.startYear) return;
  const x = indexOf(s),
    done = new Set<number>();
  for (const e of c.events) {
    if (e.day > s.day) break;
    if (e.what !== Happening.Enter || !e.realm) continue;
    const id = x.persons.get(c.persons[e.person].key),
      realm = x.realms.get(e.realm);
    if (id === undefined || realm === undefined || done.has(id)) continue;
    done.add(id);
    setRulerCulture(s, id, realm);
  }
}

/** Every day: what the chronicle says for that day. */
export const rulers: System = {
  id: 'rulers',
  run(s, w, t) {
    playChronicle(s, w, t.day, t.day);
  },
};
