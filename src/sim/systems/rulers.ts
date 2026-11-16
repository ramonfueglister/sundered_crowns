// The rulers: every realm has a holder, a historical person who is born, takes the crown and dies on the real days of
// the chronicle (src/sim/content/chronicle.ts). Ramon, 16 November 2026: rulers strictly by the historical dates for
// now; a ruler is one person (1:1), the rest of the nobility will come at 1:100; a realm follows the real holder of
// its title (after the realm's end the title goes on with whoever really held it, so one person may hold several
// crowns). The borders do not move here.
//
// A ruler is a person of the person table like everybody else: the genes, the IQ and the Big Five are drawn as for
// the founders of the cities, from the gene pool of the place the ruler lives in. The ruler lives in the capital of
// the realm of the first reign, in a family of their own, and has no part in the economy (role 0). Who the person is
// in the sources stands beside the table (`WorldState.named`).
import type { WorldState, NamedPerson } from '../state';
import { ALIVE, BORN_UNKNOWN, NO_LOT } from '../state';
import { spawn } from '../ecs';
import type { World } from '../world';
import type { System } from '../schedule';
import { type Chronicle, Happening, firstEventOn } from '../content/chronicle';
import { hash01 } from '../rng';
import { founder, origin, NG } from '../people/genes';

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

/** The realm of each key, and the person of each chronicle key, of a state (rebuilt when the state changes). */
const index = new WeakMap<WorldState, { realms: Map<string, number>; persons: Map<string, number>; n: number }>();
function indexOf(s: WorldState) {
  let x = index.get(s);
  if (!x || x.n !== s.named.length) {
    x = { realms: new Map(s.realmText.map((t, k) => [t.key, k])), persons: new Map(s.named.map((p) => [p.key, p.person])), n: s.named.length };
    index.set(s, x);
  }
  return x;
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
    const id = spawn(s.person), seed = s.seed >>> 0, kh = keyHash(cp.key);
    const born = c.bornDay[e.person];
    P.born[id] = born ?? BORN_UNKNOWN; P.sex[id] = cp.sex; P.mother[id] = -1; P.father[id] = -1;
    P.role[id] = 0; P.agent[id] = 0; // as the economy leaves every person outside it (src/sim/systems/economy.ts)
    P.firm[id] = -1; P.died[id] = ALIVE;
    const z = (j: number) => normal(seed, kh, K.trait + 2 * j);
    P.iq[id] = clampU8(100 + 15 * z(0));
    P.o[id] = clampU8(50 + 10 * z(1)); P.c[id] = clampU8(50 + 10 * z(2)); P.e[id] = clampU8(50 + 10 * z(3));
    P.a[id] = clampU8(50 + 10 * z(4)); P.n[id] = clampU8(50 + 10 * z(5));
    const bits = (k: number) => {
      const u = (j: number) => BigInt(Math.floor(u01(seed, kh, K.genes + 2 * k + j) * 4294967296));
      return (u(1) << 32n) | u(0);
    };
    P.genes.set(founder(origin(w.lon[place], w.lat[place]), bits), id * 2 * NG);
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

/** Every day: what the chronicle says for that day. */
export const rulers: System = {
  id: 'rulers',
  run(s, w, t) { playChronicle(s, w, t.day, t.day); },
};
