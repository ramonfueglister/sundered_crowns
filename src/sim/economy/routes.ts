// The routes between the cities of the economy (economy feature 17, docs/ECONOMY_DESIGN.md, section 17): how many
// days goods travel between two cities and how many days of labour carrying a real unit of each product takes.
//
// The way between two cities is the way over the net of the world's places on which carrying a tonne takes the
// least labour: every edge is land, river or water (sea, coast, strait), and a kilometre of each kind takes so many
// days of labour a tonne (the table's `day_wages_per_tonne_km`). The net does not know which way a river flows, so a
// kilometre of river costs the mean of both directions and takes the mean of both times. The days of travel are the
// kilometres of each kind over the kilometres a day of that kind. Regions the table names as apart have no way to
// the regions outside them.
//
// Over land goods go on the ways of the year (src/sim/roads.ts, docs/wiki/strassen.md) where there are any: a stretch
// between two places that a way joins is the straight line times as much as the way winds and climbs (its effort
// over the straight line between its ends); a stretch without a way is the straight line, weighted by its slope, at
// the speed off a way (Tobler 1993), and goods take the quicker of the two (`stretchOf`). Days and labour both follow
// from these kilometres, as they follow from the time the carriers take. A world without ways goes on the straight
// line between places, as on a level way.
import type { World } from '../world';
import { EDGE_RIVER, EDGE_STRAIT, EDGE_COAST, EDGE_SEA } from '../world';
import { stretchOf, type WayNet } from '../roads';
import type { CalibrationTable } from './calibration';

/** What the engine is given (`sce_routes`): per city of origin and of destination the days of travel (0: no way)
 *  and the days of labour that carry a tonne; per product the tonnes of a real unit; and the elasticity of the
 *  stock to keep. */
interface CityRoutes {
  cities: number;
  days: Uint32Array;
  labour: Float64Array;
  weight: number[];
  elasticity: number;
}

const LAND = 0,
  RIVER = 1,
  WATER = 2;
const kind = (flag: number): number =>
  flag & (EDGE_SEA | EDGE_COAST | EDGE_STRAIT) ? WATER : flag & EDGE_RIVER ? RIVER : LAND;

/** What one search over the net writes: per place the labour of carrying a tonne there (days), the kilometres of
 *  each kind, whether it is done and whether it is wanted, and the heap of the places to look at. */
interface Room {
  labour: Float64Array;
  km: Float64Array;
  done: Uint8Array;
  wanted: Uint8Array;
  heapCost: Float64Array;
  heapNode: Int32Array;
}

const LENGTHS = new WeakMap<World, Map<WayNet | null, Float32Array>>();
/** The kilometres of every edge of the world's net as goods count them (above): the ways' efforts on land, or the
 *  straight line off them; the straight line on rivers and water, and everywhere in a world without ways. */
export function edgeKm(w: World, net: WayNet | null): Float32Array {
  let kept = LENGTHS.get(w);
  if (!kept) {
    kept = new Map();
    LENGTHS.set(w, kept);
  }
  const had = kept.get(net);
  if (had) return had;
  const len = Float32Array.from(w.adjKm);
  if (net)
    for (let i = 0; i < w.adjStart.length - 1; i++)
      for (let e = w.adjStart[i]; e < w.adjStart[i + 1]; e++) {
        if (kind(w.adjFlag[e]) !== LAND) continue;
        const j = w.adj[e];
        len[e] = w.adjKm[e] * stretchOf(net.between(i, j), w.adjKm[e], w.elev[j] - w.elev[i]);
      }
  kept.set(net, len);
  return len;
}

/** The ways from one place to the places wanted: the labour of carrying a tonne (days), and the kilometres of each
 *  kind. The lists of `room` are used again for every search. */
function ways(
  w: World,
  from: number,
  perKm: readonly number[],
  targets: readonly number[],
  room: Room,
  len: Float32Array,
): void {
  const { labour, km, done, wanted, heapCost, heapNode } = room;
  labour.fill(Infinity);
  km.fill(0);
  done.fill(0);
  wanted.fill(0);
  for (const p of targets) wanted[p] = 1;
  let left = targets.length,
    size = 1;
  labour[from] = 0;
  heapCost[0] = 0;
  heapNode[0] = from;
  while (size > 0 && left > 0) {
    // take the nearest place off the heap
    const c = heapCost[0],
      i = heapNode[0];
    size--;
    if (size > 0) {
      const lastC = heapCost[size],
        lastN = heapNode[size];
      let k = 0;
      for (;;) {
        const a = 2 * k + 1,
          b = a + 1;
        let m = k,
          mc = lastC;
        if (a < size && heapCost[a] < mc) {
          m = a;
          mc = heapCost[a];
        }
        if (b < size && heapCost[b] < mc) m = b;
        if (m === k) break;
        heapCost[k] = heapCost[m];
        heapNode[k] = heapNode[m];
        k = m;
      }
      heapCost[k] = lastC;
      heapNode[k] = lastN;
    }
    if (done[i]) continue;
    done[i] = 1;
    if (wanted[i]) left--;
    for (let e = w.adjStart[i]; e < w.adjStart[i + 1]; e++) {
      const j = w.adj[e],
        q = kind(w.adjFlag[e]),
        n = c + perKm[q] * len[e];
      if (n < labour[j]) {
        labour[j] = n;
        km[3 * j] = km[3 * i];
        km[3 * j + 1] = km[3 * i + 1];
        km[3 * j + 2] = km[3 * i + 2];
        km[3 * j + q] += len[e];
        let k = size++;
        while (k > 0) {
          const p = (k - 1) >> 1;
          if (heapCost[p] <= n) break;
          heapCost[k] = heapCost[p];
          heapNode[k] = heapNode[p];
          k = p;
        }
        heapCost[k] = n;
        heapNode[k] = j;
      }
    }
  }
}

const CACHE = new WeakMap<World, Map<string, CityRoutes>>();

/** The routes between the cities at `places`, by the table, over land on the ways of `net` (null: the straight
 *  line). The same world, places, table and ways give the same routes; they are kept, since the ways of hundreds of
 *  cities take seconds. */
export function cityRoutes(
  w: World,
  places: ArrayLike<number>,
  t: CalibrationTable,
  net: WayNet | null = null,
): CityRoutes {
  checkRoutes(t);
  const r = t.routes,
    list = Array.from(places),
    n = list.length;
  const speed = r.km_per_day.value,
    cost = r.day_wages_per_tonne_km.value,
    weight = r.tonnes_per_pound.value,
    elasticity = r.stock_elasticity.value;
  const key = JSON.stringify([list, r, net ? [net.year, net.laid, net.size] : null]);
  let kept = CACHE.get(w);
  if (!kept) {
    kept = new Map();
    CACHE.set(w, kept);
  }
  const had = kept.get(key);
  if (had) return had;
  // a river: the mean of both directions, of the labour and of the time
  const perKm = [cost.land, (cost.river_down + cost.river_up) / 2, cost.sea];
  const daysPerKm = [1 / speed.land, (1 / speed.river_down + 1 / speed.river_up) / 2, 1 / speed.sea];
  const apart = new Set(r.apart.value);
  // the side of a city: the region itself when it is apart, '' for all others
  const side = list.map((p) => {
    const region = w.provinces[w.provOf[p]]?.region ?? '';
    return apart.has(region) ? region : '';
  });
  const days = new Uint32Array(n * n),
    labour = new Float64Array(n * n);
  const N = w.adjStart.length - 1,
    edges = w.adj.length,
    len = edgeKm(w, net);
  // a place enters the heap once for every edge that makes its way shorter, at most
  const room: Room = {
    labour: new Float64Array(N),
    km: new Float64Array(3 * N),
    done: new Uint8Array(N),
    wanted: new Uint8Array(N),
    heapCost: new Float64Array(edges + 1),
    heapNode: new Int32Array(edges + 1),
  };
  for (let c = 0; c < n; c++) {
    const targets = [...new Set(list.filter((_, d) => d > c && side[d] === side[c]))];
    if (!targets.length) continue;
    ways(w, list[c], perKm, targets, room, len);
    for (let d = c + 1; d < n; d++) {
      const p = list[d];
      if (side[d] !== side[c] || !Number.isFinite(room.labour[p])) continue;
      const time = Math.max(
        1,
        Math.round(
          room.km[3 * p + LAND] * daysPerKm[LAND] +
            room.km[3 * p + RIVER] * daysPerKm[RIVER] +
            room.km[3 * p + WATER] * daysPerKm[WATER],
        ),
      );
      days[c * n + d] = days[d * n + c] = time;
      labour[c * n + d] = labour[d * n + c] = room.labour[p];
    }
  }
  const out = { cities: n, days, labour, weight: [...weight], elasticity };
  kept.set(key, out);
  return out;
}

/** Throws unless every speed of the table's routes is above 0, every labour and weight 0 or more, every sector has a
 *  weight, and the elasticity is 0 or more. */
function checkRoutes(t: CalibrationTable): void {
  const r = t.routes,
    G = t.sectors.length;
  const speed = r.km_per_day.value,
    cost = r.day_wages_per_tonne_km.value,
    weight = r.tonnes_per_pound.value,
    elasticity = r.stock_elasticity.value;
  for (const v of [speed.land, speed.river_down, speed.river_up, speed.sea])
    if (!(v > 0)) throw new Error(`the routes of ${t.case} have a speed of ${v} km a day`);
  for (const v of [cost.land, cost.river_down, cost.river_up, cost.sea, ...weight])
    if (!(v >= 0)) throw new Error(`the routes of ${t.case} have a labour or a weight of ${v}`);
  if (weight.length !== G)
    throw new Error(`the routes of ${t.case} have the weight of ${weight.length} products, the table has ${G} sectors`);
  if (!(elasticity >= 0)) throw new Error(`the routes of ${t.case} have an elasticity of ${elasticity}`);
}
