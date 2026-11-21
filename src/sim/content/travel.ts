// How a ruler goes from one place their itinerary names to the next (src/sim/content/itineraries.ts). Ramon,
// 20 November 2026: "der könig muss sich dann in avignon befinden sprich dorthin laufen bewegen etc. per pferd": a
// ruler does not leap from one place of issue to the next but travels the way between them, day by day.
//
// - The way is the one over the net of the world's places that takes the least time, as goods go
//   (src/sim/economy/routes.ts): on land along the ways of the year at the effort of their slopes, off them at the
//   speed off a way (edgeKm, src/sim/roads.ts); on rivers and the sea at the speeds of the economy's table
//   (routes.km_per_day, from ORBIS), a river at the mean time of both directions.
// - The pace on land: a king and his court went 25 to 30 km a day on journeys without an army (Ludwig 1897,
//   "Untersuchungen über die Reise- und Marschgeschwindigkeit im XII. und XIII. Jahrhundert", p. 21, from the
//   itineraries of Konrad III and Friedrich I; Kehr, quoted there on p. 1, gives 20 to 30 km as the emperors' normal
//   pace). The game takes ORBIS's traveller with moderately loaded pack animals, 30 km a day (MEANS.foot), which lies
//   in that span; slopes slow it (Ludwig p. 17 finds 15 to 23 km a day in the Alps and Italy).
// - In haste a king went 52 and 56 km on single days (Ludwig p. 20); ORBIS's routine horseback, 56 km a day
//   (MEANS.horse), is the fastest a ruler travels.
// - OWN RULE: the ruler stays at a place the sources name until he must leave to reach the next one on its day, as he
//   stays at the last place named on a day no source tells; where the days between two places are fewer than the way
//   takes at the court's pace, he leaves on the day of the first and goes as fast as he must.
import { MEANS } from '../roads';
import { edgeKm } from '../economy/routes';
import { EDGE_COAST, EDGE_RIVER, EDGE_SEA, EDGE_STRAIT, type World } from '../world';
import type { Journey } from './itineraries';

/** km a day of a king with his court on level land (above) */
const COURT_KM_PER_DAY = MEANS.foot.kmPerDay;
/** km a day of a king in haste (above) */
const HASTE_KM_PER_DAY = MEANS.horse.kmPerDay;

/** A way between two places: the places it passes, first and last included, and the days at the court's pace from
 *  the first to each. */
interface Way {
  place: Int32Array;
  at: Float64Array;
}

/** What a ruler's journey looks like on the map from a day on: the places reached and the day (with its fraction)
 *  each is reached; between two of them the ruler is on the way from the one to the other. */
export interface Track {
  day: number[];
  place: number[];
}

/** The days each edge of the world's net takes the court (above). */
function daysPerEdge(w: World): Float64Array {
  const len = edgeKm(w, w.ways ?? null),
    v = w.cityEconomies.table.routes.km_per_day.value,
    out = new Float64Array(len.length);
  for (let e = 0; e < len.length; e++) {
    const f = w.adjFlag[e];
    if (f & (EDGE_SEA | EDGE_COAST | EDGE_STRAIT)) out[e] = w.adjKm[e] / v.sea;
    else if (f & EDGE_RIVER) out[e] = w.adjKm[e] * 0.5 * (1 / v.river_down + 1 / v.river_up);
    else out[e] = len[e] / COURT_KM_PER_DAY;
  }
  return out;
}

/** The ways of the rulers over the net of one world, each searched once. */
export class Travels {
  private days: Float64Array;
  private ways = new Map<number, Way>();
  private cost: Float64Array;
  private from: Int32Array;
  private heapCost: Float64Array;
  private heapNode: Int32Array;
  constructor(private w: World) {
    const n = w.adjStart.length - 1;
    this.days = daysPerEdge(w);
    this.cost = new Float64Array(n);
    this.from = new Int32Array(n);
    this.heapCost = new Float64Array(w.adj.length + 1);
    this.heapNode = new Int32Array(w.adj.length + 1);
  }

  /** The quickest way from place `a` to place `b` (Dijkstra over the net); a way of the two places alone, at no time,
   *  where none joins them. */
  wayBetween(a: number, b: number): Way {
    const n = this.cost.length,
      key = a * n + b,
      had = this.ways.get(key);
    if (had) return had;
    const { w, days, cost, from, heapCost, heapNode } = this;
    cost.fill(Infinity);
    from.fill(-1);
    cost[a] = 0;
    heapCost[0] = 0;
    heapNode[0] = a;
    let size = 1;
    while (size > 0) {
      const c = heapCost[0],
        i = heapNode[0];
      size--;
      // sift the last entry down from the top
      const lc = heapCost[size],
        ln = heapNode[size];
      let k = 0;
      for (;;) {
        const l = 2 * k + 1,
          r = l + 1;
        let m = k,
          mc = lc;
        if (l < size && heapCost[l] < mc) {
          m = l;
          mc = heapCost[l];
        }
        if (r < size && heapCost[r] < mc) m = r;
        if (m === k) break;
        heapCost[k] = heapCost[m];
        heapNode[k] = heapNode[m];
        k = m;
      }
      heapCost[k] = lc;
      heapNode[k] = ln;
      if (c > cost[i]) continue;
      if (i === b) break;
      for (let e = w.adjStart[i]; e < w.adjStart[i + 1]; e++) {
        const j = w.adj[e],
          t = c + days[e];
        if (t >= cost[j]) continue;
        cost[j] = t;
        from[j] = i;
        // sift the new entry up
        let q = size++;
        while (q > 0) {
          const p = (q - 1) >> 1;
          if (heapCost[p] <= t) break;
          heapCost[q] = heapCost[p];
          heapNode[q] = heapNode[p];
          q = p;
        }
        heapCost[q] = t;
        heapNode[q] = j;
      }
    }
    const back: number[] = [];
    if (cost[b] < Infinity) for (let i = b; i >= 0; i = from[i]) back.push(i);
    else back.push(b, a);
    back.reverse();
    const way = {
      place: Int32Array.from(back),
      at: Float64Array.from(back, (p) => (cost[p] < Infinity ? cost[p] : 0)),
    };
    this.ways.set(key, way);
    return way;
  }

  /** The way of the leg that ends at stop `k` of a journey, and the day the ruler leaves and how many days of the
   *  court's pace pass in one of the world's (above): 1 at the court's pace, more where he must hurry. */
  private leg(j: Journey, k: number): { way: Way; leave: number; pace: number } {
    const way = this.wayBetween(j.place[k - 1], j.place[k]),
      takes = way.at[way.at.length - 1],
      gap = j.day[k] - j.day[k - 1];
    return takes <= gap ? { way, leave: j.day[k] - takes, pace: 1 } : { way, leave: j.day[k - 1], pace: takes / gap };
  }

  /** The place a ruler is at on `day` by the journey: a place the sources name, or the last place of the way between
   *  two of them that they have reached; −1 outside the days the journey covers. */
  where(j: Journey, day: number): number {
    const k = lastStop(j, day);
    if (k < 0) return -1;
    if (k === j.day.length - 1 || j.place[k + 1] === j.place[k]) return j.place[k];
    const { way, leave, pace } = this.leg(j, k + 1);
    if (day <= leave) return j.place[k];
    const t = (day - leave) * pace;
    let i = 0;
    while (i + 1 < way.at.length && way.at[i + 1] <= t) i++;
    return way.place[i];
  }

  /** The track of a ruler from the stop they last reached on `day` to the first point after `until`, or to the last
   *  day of the journey where it ends before; empty outside the days the journey covers. */
  track(j: Journey, day: number, until: number): Track {
    const out: Track = { day: [], place: [] },
      push = (d: number, p: number) => {
        out.day.push(d);
        out.place.push(p);
      };
    let k = lastStop(j, day);
    if (k < 0) return out;
    push(j.day[k], j.place[k]);
    for (k++; k < j.day.length && out.day[out.day.length - 1] <= until; k++) {
      if (j.place[k] === j.place[k - 1]) continue;
      const { way, leave, pace } = this.leg(j, k);
      for (let i = 0; i < way.place.length; i++) push(leave + way.at[i] / pace, way.place[i]);
    }
    // where the itinerary ends before the way ahead does, the ruler stays at its last place to its last day
    const last = out.day[out.day.length - 1];
    if (last < until && last < j.to) push(Math.min(until, j.to), out.place[out.place.length - 1]);
    return out;
  }
}

/** The stop of an itinerary last reached on `day`, while the itinerary covers the day; −1 outside it. */
export function lastStop(j: Journey, day: number): number {
  if (day < j.day[0] || day > j.to) return -1;
  let lo = 0,
    hi = j.day.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (j.day[mid] <= day) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** km on the great circle between two points (haversine, Earth's mean diameter 12,742 km) */
export function km(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p = Math.PI / 180,
    h =
      Math.sin(((lat2 - lat1) * p) / 2) ** 2 +
      Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(((lon2 - lon1) * p) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/**
 * The stops of an itinerary a king can have been at (`day` the days, `place` the places of the map). Where the king
 * could not have gone from one stay (the stops at one place one after the other) to the next at the pace in haste,
 * even on the straight line, which no way is shorter than, one of the two is left out: the one with fewer days the
 * sources name, until every step can be gone. OWN RULE: such a place is one where a charter was written in the king's
 * name without him (the chancery travelled apart at times) or a place of issue found at the wrong place, and the
 * regest does not say which; the place more days name is the likelier one. Where both have as many days, the one is
 * left out without which the journey from the stay before the two to the stay after them is the shorter: the reading
 * of place names that grounds them all in the smallest region is the likeliest (Leidner, Sinclair & Webber 2003,
 * "Grounding spatial named entities for information extraction and question answering", sec. 3, whose note 8
 * measures the region by the distances between the places); ties: the later one. Returns the indices of the stops
 * kept.
 */
export function reachableStops(
  day: ArrayLike<number>,
  place: ArrayLike<number>,
  lat: ArrayLike<number>,
  lon: ArrayLike<number>,
): number[] {
  // the stays: runs of stops at one place, by their indices
  let stays: number[][] = [];
  for (let i = 0; i < day.length; i++) {
    const last = stays[stays.length - 1];
    if (last && place[last[0]] === place[i]) last.push(i);
    else stays.push([i]);
  }
  const between = (a: number[] | undefined, b: number[] | undefined) => {
    if (!a || !b) return 0;
    const p = place[a[0]],
      q = place[b[0]];
    return km(lat[p], lon[p], lat[q], lon[q]);
  };
  const tooFast = (a: number[] | undefined, b: number[] | undefined) =>
    !!a && !!b && between(a, b) > HASTE_KM_PER_DAY * (day[b[0]] - day[a[a.length - 1]]);
  for (let changed = true; changed; ) {
    changed = false;
    const kept: number[][] = [];
    for (let k = 0; k < stays.length; k++) {
      const s = stays[k],
        before = kept[kept.length - 1];
      if (tooFast(before, s)) {
        changed = true;
        const earlier = kept[kept.length - 2],
          after = stays[k + 1],
          dropBefore =
            before.length !== s.length
              ? before.length < s.length
              : between(earlier, s) + between(s, after) < between(earlier, before) + between(before, after);
        if (!dropBefore) continue;
        kept.pop();
      }
      // a stay at the place of the one before it, once a stay between them is left out, is one stay with it
      const prev = kept[kept.length - 1];
      if (prev && place[prev[0]] === place[s[0]]) prev.push(...s);
      else kept.push(s);
    }
    stays = kept;
  }
  return stays.flat();
}
