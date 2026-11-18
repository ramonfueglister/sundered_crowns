// The unmarried move to other places (people feature 4; docs/PEOPLE_DESIGN.md). The rules and their numbers are
// src/sim/people/moving.ts: how often a child leaves the home of the parents and a servant the master (Dribe 2002,
// Dribe & Lundh 2002), and how far (Raven 2024).
//
// A place is a town with its land, so only a far move changes the place. For every person the day of the next far
// move the person may make is drawn (`person.moves`; the next-event method, as the deaths and the births), at a
// rate no person exceeds. When the day has come the person moves with the share that the person's own rate on that
// day has of that rate, and the next day is drawn. So the rate follows the age, the death of the father and the
// standing of the family without a draw of its own.
//
// Who: a person of 10 to 59 who is not the man or the woman of a family (not married, and not the widower at the
// head of what is left of a household). Who still lives in the place
// the person comes from (`person.home`) leaves at the rate of a child at home, to 29; who lives elsewhere changes
// places at the rate of a servant.
//
// Where to: a distance is drawn, 16 to 32 km, 32 to 64 km or 64 to 115 km, and with it a piece of land that far
// away along the land of the map (over a strait, not over the sea), each piece with its area over its distance, as
// if the direction were drawn. The person goes to the town that lies nearest to that piece, along the land. Where
// that is the person's own town, or the band holds no land, the move stays inside the place and nothing happens.
//
// There the person lives with a parent, a brother or a sister where one lives there, else as a servant in one of
// the households of the place, belongs to its purse (src/sim/systems/household.ts) and marries as the unmarried of
// that place do (src/sim/systems/families.ts). A part in the economy of the old place goes to a successor there
// (src/sim/systems/deaths.ts); in the new place the person has none until one falls free. Who has a part that
// nobody of the old place can take stays.
//
// An heir comes home: src/sim/systems/families.ts.
//
// Ours, not a source: that the direction is drawn, the household of a servant (any of the place), that a person
// with a part nobody can take stays, and that a person without kin goes to no place without a household.
import type { WorldState } from '../state';
import { ALIVE } from '../state';
import { EDGE_COAST, EDGE_SEA, type World } from '../world';
import type { System } from '../schedule';
import { MinHeap } from '../minheap';
import { hash01 } from '../rng';
import { ageOn } from './people';
import { changeFamily, eventKey, livingIn } from './deaths';
import { namedPersons } from './rulers';
import { ROLE } from './work';
import { BANDS, MOVING_AGE, TOP_RATE, bandOf, movesAYear, yearsToNext } from '../people/moving';

const DAYS_PER_YEAR = 365.25;
/** The draws of a move come from a stream of their own: by the person and the day the draw is made on. */
const draw = (s: WorldState, id: number, day: number, k: number): number => hash01((s.seed ^ 0x6d6f7665) >>> 0, id, 8 * day + k);
const K = { accept: 0, band: 1, land: 2, host: 3, next: 4 } as const;

/** What the moves of a run of days did, for the checks. */
export interface Moved {
  /** persons who went to another place: from home, and from a place they had moved to before */
  home: number; service: number;
  /** of them women, and to a parent, a brother or a sister */
  women: number; kin: number;
  /** moves that stayed inside the place (the band reached no other town) */
  near: number;
  /** persons who stayed because nobody could take their part, or the place had no household */
  held: number;
  /** the ages of those who went to another place, summed, and how many of them were 15 to 29 */
  ages: number; prime: number;
}
export const noMoves = (): Moved => ({ home: 0, service: 0, women: 0, kin: 0, near: 0, held: 0, ages: 0, prime: 0 });

/** The day of the next far move the person `id` may make, drawn on `from`: not before the age of 10, ALIVE where
 *  it would fall after the age of 60. */
function nextMove(s: WorldState, id: number, from: number): number {
  const born = s.person.cols.born[id], start = Math.max(from, born + Math.floor(MOVING_AGE[0] * DAYS_PER_YEAR));
  const day = start + Math.max(1, Math.ceil(yearsToNext(draw(s, id, from, K.next)) * DAYS_PER_YEAR));
  return ageOn(born, day) >= MOVING_AGE[1] ? ALIVE : day;
}

/** The moves that are due, the earliest first: a heap over `person.moves`, built when a state is first seen. */
const queues = new WeakMap<WorldState, MinHeap>();
function queueOf(s: WorldState): MinHeap {
  let q = queues.get(s);
  if (!q) {
    q = new MinHeap();
    const P = s.person.cols;
    for (let id = 0; id < s.person.size; id++) {
      if (s.person.alive[id] && P.died[id] === ALIVE && P.moves[id] !== ALIVE) q.push(eventKey(P.moves[id], id), id);
    }
    queues.set(s, q);
  }
  return q;
}

/** Gives every person the place the person comes from, and every living person of the towns the day of the next
 *  move, on the day the world has reached; a ruler has neither. */
export function foundMoves(s: WorldState): void {
  const P = s.person.cols, F = s.family.cols, named = namedPersons(s);
  for (let id = 0; id < s.person.size; id++) {
    P.home[id] = -1; P.moves[id] = ALIVE;
    if (!s.person.alive[id] || named.has(id) || P.family[id] < 0) continue;
    P.home[id] = F.place[P.family[id]];
    if (P.died[id] === ALIVE && P.dies[id] !== ALIVE) P.moves[id] = nextMove(s, id, s.day);
  }
  queues.delete(s);
  reaches.delete(s);
}

/** Draws the first move of a person who has come into the world on `day` (src/sim/systems/families.ts). */
export function scheduleMove(s: WorldState, id: number, day: number): void {
  const P = s.person.cols, had = queues.has(s);
  P.moves[id] = nextMove(s, id, day);
  if (had && P.moves[id] !== ALIVE) queueOf(s).push(eventKey(P.moves[id], id), id);
}

/** Where the far moves of a world end: the town every piece of land belongs to, and for the places that were asked
 *  for, the pieces of land of every band of distance with the town of each. */
interface Reach {
  /** the town (a place with a household) nearest to every place of the map along the land, −1 where none is reached */
  town: Int32Array;
  bands: Map<number, { to: Int32Array; cum: Float64Array }[]>;
}
const reaches = new WeakMap<WorldState, Reach>();
/** The ways a person walks: from land to land, and over a strait. */
const walkable = (w: World, k: number): boolean => w.adj[k] < w.L && (w.adjFlag[k] & (EDGE_COAST | EDGE_SEA)) === 0;

function reachOf(s: WorldState, w: World): Reach {
  let r = reaches.get(s);
  if (r) return r;
  // the towns: the places with a household, which a town keeps (src/sim/systems/families.ts)
  const F = s.family.cols, towns = new Uint8Array(w.L);
  for (let f = 0; f < s.family.size; f++) if (s.family.alive[f] && F.seat[f]) towns[F.place[f]] = 1;
  const town = new Int32Array(w.L).fill(-1), dist = new Float64Array(w.L).fill(Infinity), heap = new MinHeap();
  for (let p = 0; p < w.L; p++) if (towns[p]) { town[p] = p; dist[p] = 0; heap.push(0, p); }
  while (heap.size) {
    const [d, a] = heap.pop();
    if (d > dist[a]) continue;
    for (let k = w.adjStart[a]; k < w.adjStart[a + 1]; k++) {
      if (!walkable(w, k)) continue;
      const b = w.adj[k], nd = d + w.adjKm[k];
      // of two towns equally far the one with the lower number, so the order of the heap does not matter
      if (nd < dist[b] || (nd === dist[b] && town[a] < town[b])) { dist[b] = nd; town[b] = town[a]; heap.push(nd, b); }
    }
  }
  r = { town, bands: new Map() };
  reaches.set(s, r);
  return r;
}

/** The pieces of land of every band of distance around `place`, each with the town it belongs to and its share of
 *  the band: its area over its distance. */
function bandsOf(r: Reach, w: World, place: number): { to: Int32Array; cum: Float64Array }[] {
  let b = r.bands.get(place);
  if (b) return b;
  const far = BANDS[BANDS.length - 1][1], dist = new Map<number, number>([[place, 0]]), heap = new MinHeap();
  heap.push(0, place);
  while (heap.size) {
    const [d, a] = heap.pop();
    if (d > dist.get(a)!) continue;
    for (let k = w.adjStart[a]; k < w.adjStart[a + 1]; k++) {
      if (!walkable(w, k)) continue;
      const x = w.adj[k], nd = d + w.adjKm[k];
      if (nd < far && nd < (dist.get(x) ?? Infinity)) { dist.set(x, nd); heap.push(nd, x); }
    }
  }
  const pieces = [...dist.entries()].filter(([x]) => x !== place).sort((a, c) => a[0] - c[0]);
  b = BANDS.map(([lo, hi]) => {
    const inBand = pieces.filter(([, d]) => d >= lo && d < hi);
    let total = 0;
    for (const [x, d] of inBand) total += w.area[x] / d;
    let sum = 0;
    return { to: Int32Array.from(inBand, ([x]) => r.town[x]), cum: Float64Array.from(inBand, ([x, d]) => (sum += w.area[x] / d / total)) };
  });
  r.bands.set(place, b);
  return b;
}

/** The town a far move from `place` ends in, for the draws of the band and of the land; −1 where it stays inside
 *  the place. */
export function destination(s: WorldState, w: World, place: number, uBand: number, uLand: number): number {
  const band = bandsOf(reachOf(s, w), w, place)[bandOf(uBand)];
  let k = 0;
  while (k < band.cum.length - 1 && uLand >= band.cum[k]) k++;
  const to = band.to.length ? band.to[k] : -1;
  return to === place ? -1 : to;
}

/** The family a newcomer `id` lives in in the town `to`: that of a parent, a brother or a sister who lives there
 *  (the one with the lowest number), else one of the households of the place, by the draw `u`; −1 where the place
 *  has neither. `kin` says which it was. */
function hostOf(s: WorldState, id: number, to: number, u: number): { family: number; kin: boolean } {
  const P = s.person.cols, F = s.family.cols, mo = P.mother[id], fa = P.father[id];
  let kin = -1;
  const households: number[] = [];
  for (const o of livingIn(s, to)) {
    if (o === mo || o === fa || (mo >= 0 && P.mother[o] === mo) || (fa >= 0 && P.father[o] === fa)) { if (kin < 0 || o < kin) kin = o; }
    const f = P.family[o];
    if (F.seat[f] && F.woman[f] === o) households.push(f);
  }
  if (kin >= 0) return { family: P.family[kin], kin: true };
  if (!households.length) return { family: -1, kin: false };
  households.sort((a, b) => a - b);
  return { family: households[Math.floor(u * households.length)], kin: false };
}

/** The changes of place a year of the person `id` on `day`, near and far (src/sim/people/moving.ts); 0 for the
 *  man and the woman of a family. */
export function rateOf(s: WorldState, id: number, day: number): number {
  const P = s.person.cols, F = s.family.cols, f = P.family[id], place = F.place[f];
  if (F.woman[f] === id || F.man[f] === id) return 0;
  const age = ageOn(P.born[id], day), home = P.home[id] === place;
  let landed: boolean | undefined;
  if (home && s.economy.cities) {
    landed = false;
    for (const o of livingIn(s, place)) if (P.family[o] === f && P.role[o] === ROLE.owner) { landed = true; break; }
  }
  const dead = (x: number) => x >= 0 && P.died[x] !== ALIVE;
  return movesAYear({ age, man: P.sex[id] === 1, home, landed, fatherDead: dead(P.father[id]), motherDead: dead(P.mother[id]) });
}

/** The person `id`, whose day has come, moves or stays. */
function move(s: WorldState, w: World, id: number, day: number, tally?: Moved): void {
  const P = s.person.cols, F = s.family.cols, rate = rateOf(s, id, day);
  if (!(draw(s, id, day, K.accept) < rate / TOP_RATE)) return;
  const place = F.place[P.family[id]], home = P.home[id] === place;
  const to = destination(s, w, place, draw(s, id, day, K.band), draw(s, id, day, K.land));
  if (to < 0) { if (tally) tally.near++; return; }
  const host = hostOf(s, id, to, draw(s, id, day, K.host));
  if (host.family < 0 || !changeFamily(s, id, host.family, day)) { if (tally) tally.held++; return; }
  if (tally) {
    if (home) tally.home++; else tally.service++;
    if (P.sex[id] !== 1) tally.women++;
    if (host.kin) tally.kin++;
    const age = ageOn(P.born[id], day);
    tally.ages += age; if (age >= 15 && age < 30) tally.prime++;
  }
}

/** Everybody whose day has come moves or stays, and gets the day of the next move. Returns the number of days that
 *  had come. */
export function movesTo(s: WorldState, w: World, day: number, tally?: Moved): number {
  const q = queueOf(s), P = s.person.cols;
  let n = 0;
  while (q.size && Math.floor(q.peekKey()) <= day) {
    const [key, id] = q.pop(), due = Math.floor(key);
    if (!s.person.alive[id] || P.died[id] !== ALIVE || P.moves[id] !== due) continue; // an entry that no longer holds
    move(s, w, id, due, tally);
    P.moves[id] = nextMove(s, id, due);
    if (P.moves[id] !== ALIVE) q.push(eventKey(P.moves[id], id), id);
    n++;
  }
  return n;
}

/** Every day the moves that are due. After the deaths of the day and before the weddings, so a newcomer can marry
 *  in the month of the move; and before the economy, which then computes the day with the successors. */
export const moves: System = {
  id: 'moves',
  run(s, w, t) { movesTo(s, w, t.day); },
};
