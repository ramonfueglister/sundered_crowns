// Writes public/data/roads_<year>.json: the ways between the towns of the world graphic and from every place of the
// map near them to the nearest way (docs/wiki/strassen.md).
//
// The ways are laid as a road builder lays them: along the cheapest line over the land, where a step costs its length,
// more on a slope and much more across a river, and less where a way already runs (Galin, Peytavie, Marechal and
// Guérin 2010, "Procedural generation of roads", Computer Graphics Forum 29(2): a weighted shortest path over the
// terrain with costs for slope and for crossing water; Galin, Peytavie, Guérin and Beneš 2011, "Authoring hierarchical
// road networks", Computer Graphics Forum 30(7): the towns are joined in order of their importance and a later way
// takes what an earlier one built). The importance of a pair of towns is the traffic a gravity model gives it, the
// product of their people over the square of their distance; what a way carries is the sum of that of the pairs it
// serves, and its kind follows from it (`KINDS`).
//
// The land is read from the world graphic's own map data (public/map/regions/world): heights after erosion, water and
// drainage, a map pixel (some 2 km in middle Europe) at a time. A river is as wide as hydraulic geometry gives it,
// width ∝ discharge^0.5 ∝ drainage area^0.5 (Leopold and Maddock 1953), and crossing it costs as much as a detour
// as long as ten times its width: so ways gather at a few crossings, as they gathered at bridges and fords.
//
//   npx tsx tools/roads/build_roads.ts 1291
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MinHeap } from '../../src/sim/minheap';
import { ROAD_KINDS } from '../../src/worldprobe/roads';
import { waysBetween } from './between';
import { DX, DY, direction, readLand } from './land';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const year = Number(process.argv[2] ?? 1291);

// ---- the map, a pixel at a time (tools/roads/land.ts) ----------------------------------------------------------------
const land = readLand(ROOT, year),
  { geo, H, kmRow, towns, X0, Y0, X1, Y1, w, h, n, height, wet, drains } = land;

// ---- what a step costs ----------------------------------------------------------------------------------------------
/** a slope of this much (rise over run) doubles the cost of a step; carts take about 5 % without trouble (an assumption after Galin et al. 2010, who weigh slope by a power above a limit) */
const SLOPE_DOUBLES = 0.05,
  SLOPE_MOST = 12;
/** drainage area from which a line of pixels is a river a way must cross (km²): a brook of some 20 m (an assumption) */
const RIVER_FROM = 200;
/** a river's width in metres per √km² of its drainage area (Rhine at Cologne: 144,000 km², some 400 m; hydraulic geometry after Leopold and Maddock 1953) */
const WIDTH_PER_ROOT = 1.1;
/** crossing costs as much as a detour of this many metres per metre of the river's width */
const CROSS_PER_METRE = 100;
/** a step where a way already runs costs this share of a new one (the reuse of Galin et al. 2011) */
const REUSE = 0.55;
const river = new Float32Array(n);
for (let i = 0; i < n; i++)
  if (!wet[i] && drains[i] >= RIVER_FROM) river[i] = (WIDTH_PER_ROOT * Math.sqrt(drains[i]) * CROSS_PER_METRE) / 1000;
// a river line is closed against steps from corner to corner: where it runs diagonally, the lower of the two pixels beside the step is river too
for (let y = 0; y + 1 < h; y++)
  for (let x = 0; x + 1 < w; x++) {
    for (const [a, c, p, q] of [
      [y * w + x, (y + 1) * w + x + 1, y * w + x + 1, (y + 1) * w + x],
      [y * w + x + 1, (y + 1) * w + x, y * w + x, (y + 1) * w + x + 1],
    ]) {
      if (river[a] && river[c] && !river[p] && !river[q]) {
        const k = wet[p] ? q : wet[q] ? p : height[p] <= height[q] ? p : q;
        river[k] = Math.min(river[a], river[c]);
      }
    }
  }
const road = new Uint8Array(n);
/** the cost of a step from pixel i to its neighbour j in direction d (km of level road) */
function stepCost(i: number, j: number, d: number, y: number): number {
  const km = kmRow[y + Y0] * (d < 4 ? 1 : Math.SQRT2),
    slope = Math.abs(height[j] - height[i]) / (km * 1000);
  const own =
    km * Math.min(SLOPE_MOST, 1 + (slope / SLOPE_DOUBLES) ** 2) +
    (river[j] && !river[i] ? river[j] : river[j] ? river[j] * 0.3 : 0);
  return road[j] && road[i] ? own * REUSE : own;
}

// ---- the cheapest line (A*, the heuristic the cheapest a km can cost) -----------------------------------------------
const cost = new Float64Array(n),
  from = new Int32Array(n),
  seen = new Uint32Array(n),
  done = new Uint32Array(n);
let stamp = 0;
const heap = new MinHeap();
/** the cheapest line from pixel a to one of the pixels `goal` says is one, at most `limit` km of cost; the pixels from the end back to a */
function cheapest(a: number, goal: (i: number) => boolean, toward: number | null, limit: number): number[] | null {
  stamp++;
  heap.clear();
  cost[a] = 0;
  from[a] = -1;
  seen[a] = stamp;
  heap.push(0, a);
  const gx = toward === null ? 0 : toward % w,
    gy = toward === null ? 0 : Math.floor(toward / w),
    hk = REUSE * kmRow[Math.min(H - 1, gy + Y0)] * 0.95;
  const guess = (i: number) => (toward === null ? 0 : Math.hypot((i % w) - gx, Math.floor(i / w) - gy) * hk);
  while (heap.size) {
    const i = heap.popVal();
    if (done[i] === stamp) continue;
    done[i] = stamp;
    if (goal(i) && i !== a) {
      const out: number[] = [];
      for (let k = i; k >= 0; k = from[k]) out.push(k);
      return out;
    }
    if (cost[i] > limit) return null;
    const x = i % w,
      y = (i - x) / w;
    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d],
        ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (wet[j] || done[j] === stamp) continue;
      const c = cost[i] + stepCost(i, j, d, y);
      if (seen[j] !== stamp || c < cost[j]) {
        seen[j] = stamp;
        cost[j] = c;
        from[j] = i;
        heap.push(c + guess(j), j);
      }
    }
  }
  return null;
}

// ---- the ways between the towns -------------------------------------------------------------------------------------
/** what each pixel's way carries: the sum of the gravity of the pairs it serves (people² / km²) */
const traffic = new Float64Array(n);
/** the steps the ways take, as pairs of neighbouring pixels */
const links = new Set<number>();
const link = (a: number, b: number) => links.add(a < b ? a * n + b : b * n + a);
const lay = (path: number[], weight: number) => {
  for (let k = 0; k < path.length; k++) {
    road[path[k]] = 1;
    traffic[path[k]] += weight;
    if (k) link(path[k - 1], path[k]);
  }
};
const at = (t: { x: number; y: number }) => (t.y - Y0) * w + (t.x - X0);
// a town on a water pixel (a port on the map's coast) stands on the nearest land
for (const t of towns) {
  if (!wet[at(t)]) continue;
  let best: [number, number] | null = null;
  for (let r = 1; r < 6 && !best; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const q = { x: t.x + dx, y: t.y + dy };
        if (!wet[at(q)] && !best) best = [q.x, q.y];
      }
  if (best) [t.x, t.y] = best;
}
/**
 * The pairs of towns: each town with its nearest neighbours, and every pair of the Gabriel graph (no third town lies in
 * the circle over their distance: so that two towns with nothing between them are joined though a range of mountains
 * or a sea makes neither the other's nearest), by the traffic they would have.
 */
const NEIGHBOURS = 6,
  FARTHEST_KM = 600;
const pairs: { a: number; b: number; weight: number }[] = [],
  had = new Set<string>();
towns.forEach((t, i) => {
  const km = (u: typeof t) => Math.hypot(u.x - t.x, u.y - t.y) * kmRow[t.y];
  const all = towns
    .map((u, j) => ({ j, d: km(u) }))
    .filter((e) => e.j !== i && e.d < FARTHEST_KM)
    .sort((p, q) => p.d - q.d);
  const gabriel = all.filter(({ j }) => {
    const u = towns[j],
      mx = (u.x + t.x) / 2,
      my = (u.y + t.y) / 2,
      r2 = ((u.x - t.x) ** 2 + (u.y - t.y) ** 2) / 4;
    return !towns.some((v, k) => k !== i && k !== j && (v.x - mx) ** 2 + (v.y - my) ** 2 < r2);
  });
  const near = [...all.slice(0, NEIGHBOURS), ...gabriel.filter((e) => !all.slice(0, NEIGHBOURS).includes(e))];
  for (const { j, d } of near) {
    const key = i < j ? `${i},${j}` : `${j},${i}`;
    if (had.has(key)) continue;
    had.add(key);
    pairs.push({ a: i, b: j, weight: (t.people * towns[j].people) / Math.max(1, d) ** 2 });
  }
});
pairs.sort((p, q) => q.weight - p.weight);
let laid = 0;
const started = Date.now();
for (const { a, b, weight } of pairs) {
  const s = at(towns[a]),
    e = at(towns[b]);
  const path = cheapest(s, (i) => i === e, e, 6 * FARTHEST_KM);
  if (path) {
    lay(path, weight);
    laid++;
  }
}
console.log(
  `${laid} of ${pairs.length} pairs of ${towns.length} towns in ${((Date.now() - started) / 1000).toFixed(0)} s`,
);

// ---- the places of the map: each joins the nearest way ---------------------------------------------------------------
/** a place this many km from the nearest town, or nearer, is joined (the land the towns' people live from and farther) */
const PLACE_KM = 160,
  PLACE_LIMIT = 60;
let joined = 0;
for (let l = 0; l < geo.L; l++) {
  const x = Math.floor(geo.loc.x[l]),
    y = Math.floor(geo.loc.y[l]);
  if (x < X0 || y < Y0 || x >= X1 || y >= Y1) continue;
  const i = (y - Y0) * w + (x - X0);
  if (wet[i] || road[i]) continue;
  if (!towns.some((t) => Math.hypot(t.x - x, t.y - y) * kmRow[y] < PLACE_KM)) continue;
  const path = cheapest(i, (j) => road[j] === 1, null, PLACE_LIMIT);
  if (path) {
    lay(path, 0);
    joined++;
  }
}
console.log(`${joined} places joined`);

// ---- what the ways carry: every pair of towns travels the cheapest way over the finished net ------------------------
/**
 * The traffic of the net: every pair of towns sends people × people / cost² (the gravity model, its distance the cost
 * of the cheapest way between them on the net), and that traffic runs along the cheapest way. So a way over a pass
 * that joins two small towns still carries what goes between the great towns on either side, as the ways over the
 * Alps carried the trade of Venice with Germany.
 */
const nbr = new Map<number, number[]>();
for (const k of links) {
  const a = Math.floor(k / n),
    b = k % n;
  (nbr.get(a) ?? nbr.set(a, []).get(a)!).push(b);
  (nbr.get(b) ?? nbr.set(b, []).get(b)!).push(a);
}
traffic.fill(0);
{
  const nodes = [...nbr.keys()],
    id = new Map(nodes.map((p, k) => [p, k])),
    m = nodes.length;
  const dist = new Float64Array(m),
    parent = new Int32Array(m),
    order = new Int32Array(m),
    flow = new Float64Array(m),
    townAt = new Float64Array(m);
  const dirOf = (a: number, b: number) => direction(w, a, b);
  const edgeCost = (a: number, b: number) => stepCost(a, b, dirOf(a, b), Math.floor(a / w));
  const sites = towns.map((t) => id.get(at(t)) ?? -1);
  const q = new MinHeap();
  sites.forEach((s, k) => {
    if (s >= 0) townAt[s] += towns[k].people;
  });
  for (let src = 0; src < towns.length; src++) {
    const s = sites[src];
    if (s < 0) continue;
    dist.fill(Infinity);
    parent.fill(-1);
    q.clear();
    dist[s] = 0;
    q.push(0, s);
    let settled = 0;
    while (q.size) {
      const d = q.peekKey(),
        u = q.popVal();
      if (d > dist[u]) continue;
      order[settled++] = u;
      for (const vp of nbr.get(nodes[u])!) {
        const v = id.get(vp)!,
          c = d + edgeCost(nodes[u], vp);
        if (c < dist[v]) {
          dist[v] = c;
          parent[v] = u;
          q.push(c, v);
        }
      }
    }
    // what each node sends back towards the source: its own towns' share, and what passes through it
    flow.fill(0);
    for (let k = settled - 1; k > 0; k--) {
      const u = order[k];
      if (townAt[u] && u !== s) flow[u] += (towns[src].people * townAt[u]) / Math.max(1, dist[u]) ** 2 / 2;
      if (parent[u] >= 0) flow[parent[u]] += flow[u];
      traffic[nodes[u]] += flow[u];
    }
  }
}

// ---- the kinds of way: by what they carry ---------------------------------------------------------------------------
/** of the length of the ways that carry traffic between towns, the share that is each kind, the busiest first (an assumption until the sources are laid in) */
const SHARES = [0.15, 0.4];
const kind = new Uint8Array(n);
{
  const busy = [...traffic.filter((v, i) => road[i] && v > 0)].sort((p, q) => q - p);
  const cut = SHARES.map(
    (_, k) =>
      busy[Math.min(busy.length - 1, Math.floor(busy.length * SHARES.slice(0, k + 1).reduce((s, v) => s + v, 0)))],
  );
  for (let i = 0; i < n; i++) if (road[i]) kind[i] = traffic[i] >= cut[0] ? 2 : traffic[i] >= cut[1] ? 1 : 0;
}

// ---- lines: the ways between their junctions, split where the kind changes ------------------------------------------
const used = new Set<number>(),
  lines: { k: number; p: number[] }[] = [];
const node = (i: number) => (nbr.get(i)?.length ?? 0) !== 2;
const walk = (a: number, b: number) => {
  const run = [a, b];
  used.add(a < b ? a * n + b : b * n + a);
  let prev = a,
    cur = b;
  while (!node(cur)) {
    const next = nbr.get(cur)!.find((q) => q !== prev)!,
      key = cur < next ? cur * n + next : next * n + cur;
    if (used.has(key)) break;
    used.add(key);
    run.push(next);
    prev = cur;
    cur = next;
  }
  // split where the kind changes: a step takes the lower kind of its two ends
  let start = 0;
  const kindOf = (s: number) => Math.min(kind[run[s]], kind[run[s + 1]]);
  for (let s = 1; s <= run.length - 1; s++) {
    if (s === run.length - 1 || kindOf(s) !== kindOf(start)) {
      const part = run.slice(start, s + 1),
        p: number[] = [];
      for (const i of part) p.push((i % w) + X0, Math.floor(i / w) + Y0);
      lines.push({ k: kindOf(start), p });
      start = s;
    }
  }
};
for (const [a, list] of nbr)
  if (node(a)) for (const b of list) if (!used.has(a < b ? a * n + b : b * n + a)) walk(a, b);
// rings without a junction
for (const [a, list] of nbr) for (const b of list) if (!used.has(a < b ? a * n + b : b * n + a)) walk(a, b);

// ---- the ways between the places of the map, for the simulation (tools/roads/between.ts) ---------------------------
const between = waysBetween(ROOT, land, { links, nbr, kind, stepCost, REUSE });

const km = { all: 0, byKind: [0, 0, 0] };
for (const key of links) {
  const a = Math.floor(key / n),
    b = key % n,
    y = Math.floor(a / w) + Y0,
    d = Math.hypot((a % w) - (b % w), Math.floor(a / w) - Math.floor(b / w)) * kmRow[y];
  km.all += d;
  km.byKind[Math.min(kind[a], kind[b])] += d;
}
console.log(
  `${lines.length} lines, ${Math.round(km.all)} km: ${km.byKind.map((v, k) => `${ROAD_KINDS[k].name} ${Math.round(v)}`).join(', ')}; ${between.size} ways between places`,
);

writeFileSync(
  resolve(ROOT, `public/data/roads_${year}.json`),
  JSON.stringify({
    year,
    about:
      "The ways of the world graphic and the simulation (tools/roads/build_roads.ts): lines in map pixels (x, y of pixel corners; a way runs through the middle of each pixel), k the kind (src/worldprobe/roads.ts ROAD_KINDS); between: the ways from place to place of the map: [a, b, k, km, effort] (indices of geo.json loc, k the best kind on the way, km its length from near the one place's middle to near the other's, effort those km weighted by the time their slopes take, Tobler 1993, src/sim/roads.ts slopeTime; straight the km of the straight line between the two ends).",
    sources: [
      'Galin, Peytavie, Marechal and Guérin 2010, Procedural generation of roads (cheapest line with slope and water costs)',
      'Galin, Peytavie, Guérin and Beneš 2011, Authoring hierarchical road networks (towns joined by importance, reuse)',
      'Leopold and Maddock 1953 (river width ∝ discharge^0.5)',
      'gravity model of traffic: people × people / km²',
      'Tobler 1993, Three presentations on geographical analysis and modeling (hiking function: the time a slope takes)',
    ],
    lines,
    between: [...between.values()]
      .filter((e) => e.km > 0)
      .map((e) => [
        e.a,
        e.b,
        e.k,
        Math.round(e.km * 10) / 10,
        Math.round(e.effort * 10) / 10,
        Math.round(e.straight * 10) / 10,
      ]),
  }),
);
