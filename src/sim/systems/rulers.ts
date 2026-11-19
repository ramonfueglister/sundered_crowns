// The rulers: every realm has a holder, a historical person who is born, takes the crown and dies on the real days of
// the chronicle (src/sim/content/chronicle.ts). Ramon, 16 November 2026: rulers strictly by the historical dates for
// now; a ruler is one person (1:1), the rest of the nobility will come at 1:100; a realm follows the real holder of
// its title (after the realm's end the title goes on with whoever really held it, so one person may hold several
// crowns). The borders do not move here.
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
import { type Chronicle, Happening, firstEventOn } from '../content/chronicle';
import { setRulerCulture } from './cultures';
import { hash01 } from '../rng';
import { founder, NG } from '../people/genes';
import { poolOf } from '../people/pools';
import { ALL_CULTURES } from '../content/peoples';

// a stream of draws of its own: the world's seed, the chronicle key of the person, the number of the draw
const K = { trait: 10, genes: 100 } as const;
function keyHash(key: string): number {
  let h = 0x811c9dc5; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const u01 = (seed: number, key: number, k: number) => hash01(seed ^ 0x52554c45, key, k); // "RULE"
function normal(seed: number, key: number, k: number): number {
  const a = Math.max(u01(seed, key, k), 2 ** -32), b = u01(seed, key, k + 1);
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
}
const clampU8 = (v: number) => Math.min(255, Math.max(0, Math.round(v)));

/** The realm of each key, and the person (the row) of each chronicle key, of a state (rebuilt when the state changes:
 *  a person of history comes into the world, or the rows close up on the first of January, src/sim/people/archive.ts). */
const index = new WeakMap<WorldState, { realms: Map<string, number>; persons: Map<string, number>; n: number; table: object }>();
function indexOf(s: WorldState) {
  let x = index.get(s);
  if (!x || x.n !== s.named.length || x.table !== s.person) {
    x = { realms: new Map(s.realmText.map((t, k) => [t.key, k])), persons: new Map(s.named.map((p) => [p.key, p.person])), n: s.named.length, table: s.person };
    index.set(s, x);
  }
  return x;
}

/** The genes of a ruler: a founder of the pool of the ruler's culture (src/sim/people/pools.ts; portrait round 111),
 *  else of the place the ruler lives in, from the ruler's own stream of draws. */
function giveRulerGenes(s: WorldState, w: World, id: number, key: string, place: number): void {
  const seed = s.seed >>> 0, kh = keyHash(key), P = s.person.cols;
  const bits = (k: number) => {
    const u = (j: number) => BigInt(Math.floor(u01(seed, kh, K.genes + 2 * k + j) * 4294967296));
    return (u(1) << 32n) | u(0);
  };
  P.genes.set(founder(poolOf(ALL_CULTURES[P.culture[id]], w.lon[place], w.lat[place]), bits), id * 2 * NG);
}

/** Gives every ruler of the world their genes anew, as they would have drawn them on entering it (the upgrade of a
 *  world whose rulers drew by the place: src/sim/upgrade.ts). */
export function rulerGenes(s: WorldState, w: World): void {
  for (const n of s.named ?? []) giveRulerGenes(s, w, n.person, n.key, s.family.cols.place[s.person.cols.family[n.person]]);
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

/** What one happening does to the state. Returns false when it could not be applied (the realm is not in this world,
 *  or the person is not in the world). */
function happen(s: WorldState, w: World, c: Chronicle, e: Chronicle['events'][number]): boolean {
  const x = indexOf(s), P = s.person.cols, R = s.realm.cols, cp = c.persons[e.person];
  const realm = e.realm ? x.realms.get(e.realm) : undefined;
  if (e.what === Happening.Enter) {
    if (realm === undefined) return false;
    const place = seatOf(s, realm);
    if (place < 0 || x.persons.has(cp.key)) return false;
    const id = spawnPerson(s), seed = s.seed >>> 0, kh = keyHash(cp.key);
    const born = c.bornDay[e.person];
    P.born[id] = born ?? BORN_UNKNOWN; P.sex[id] = cp.sex; P.mother[id] = -1; P.father[id] = -1;
    P.role[id] = 0; P.agent[id] = 0; // as the economy leaves every person outside it (src/sim/systems/economy.ts)
    P.firm[id] = -1; P.died[id] = ALIVE; P.dies[id] = ALIVE; P.bears[id] = ALIVE; // a ruler dies on the day of the chronicle, and bears no child here
    P.home[id] = -1; P.moves[id] = ALIVE; // and does not move (src/sim/systems/moves.ts)
    setRulerCulture(s, id, realm); // the culture and faith of the realm the ruler enters the world in
    const z = (j: number) => normal(seed, kh, K.trait + 2 * j);
    P.iq[id] = clampU8(100 + 15 * z(0));
    P.o[id] = clampU8(50 + 10 * z(1)); P.c[id] = clampU8(50 + 10 * z(2)); P.e[id] = clampU8(50 + 10 * z(3));
    P.a[id] = clampU8(50 + 10 * z(4)); P.n[id] = clampU8(50 + 10 * z(5));
    giveRulerGenes(s, w, id, cp.key, place);
    const f = spawn(s.family), F = s.family.cols;
    F.place[f] = place; F.man[f] = cp.sex === 1 ? id : -1; F.woman[f] = cp.sex === 0 ? id : -1;
    F.lot[f] = NO_LOT; // a ruler holds no parcel of a town: castles and residences are not built yet
    P.family[id] = f;
    const named: NamedPerson = { person: id, key: cp.key, name: cp.name, house: cp.house, qid: cp.qid };
    s.named.push(named);
    return true;
  }
  const id = x.persons.get(cp.key);
  if (id === undefined) return false;
  /** The crown of `r` that `id` leaves goes to a co-ruler who still reigns that day, else to nobody. */
  const leave = (r: number) => {
    let next = -1;
    for (const g of c.reignsOf.get(s.realmText[r].key) ?? []) {
      if (g.person === e.person || g.start > e.day || (g.end !== null && g.end <= e.day)) continue;
      const q = x.persons.get(c.persons[g.person].key);
      if (q !== undefined && P.died[q] === ALIVE) { next = q; break; }
    }
    R.holder[r] = next;
  };
  if (e.what === Happening.Die) {
    P.died[id] = e.day;
    for (let r = 0; r < s.realm.size; r++) if (R.holder[r] === id) leave(r);
    return true;
  }
  if (realm === undefined || P.died[id] !== ALIVE) return false;
  if (e.what === Happening.End) { if (R.holder[realm] === id) leave(realm); return true; }
  R.holder[realm] = id; // Accede
  return true;
}

/** Applies every happening of the chronicle from day `from` up to and including day `to`; returns those that could not
 *  be applied (realms not in this world, persons not in it). */
export function playChronicle(s: WorldState, w: World, from: number, to: number): number {
  const c = w.chronicle;
  if (!c || c.year !== s.startYear) return 0;
  let missed = 0;
  for (let i = firstEventOn(c, from); i < c.events.length && c.events[i].day <= to; i++) if (!happen(s, w, c, c.events[i])) missed++;
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
  const x = indexOf(s), done = new Set<number>();
  for (const e of c.events) {
    if (e.day > s.day) break;
    if (e.what !== Happening.Enter || !e.realm) continue;
    const id = x.persons.get(c.persons[e.person].key), realm = x.realms.get(e.realm);
    if (id === undefined || realm === undefined || done.has(id)) continue;
    done.add(id); setRulerCulture(s, id, realm);
  }
}

/** Every day: what the chronicle says for that day. */
export const rulers: System = {
  id: 'rulers',
  run(s, w, t) { playChronicle(s, w, t.day, t.day); },
};
