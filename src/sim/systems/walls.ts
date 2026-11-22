// The walls of the towns: settlement feature 6 (docs/SETTLEMENT_DESIGN.md, where every source is listed).
//
// Every town of the start year has a wall, "even the smallest of towns had walls" (Pounds 2005, p. 29), but a town a
// source knows to have had none (Venice: Gelichi 2016, pp. 265, 268–269). Its ring (src/sim/settlement/walls.ts) is
// laid round the town as the land register holds it:
//   - Most towns filled their circuit (Pounds 2005, pp. 27–29): the ring holds every parcel and the church of the see.
//   - Where the sources know the walled area of the year against the settled area (`walledOf`, Cesaretti et al. 2016,
//     appendix S2), the ring holds that share of the town: below one the parcels nearest the market (the families of
//     a town all have parcels of one size, so their count is the area), and the others are the suburbs; above one
//     the ring round the whole town is stretched from the market until it holds that share (Bruges, Ghent and Norwich
//     closed fields and marsh in, though not yet in 1291).
//   - A town with a real plan that draws its wall has that wall (Paris: the wall of Philippe Auguste, ALPAGE), at
//     the plan's scale; its share from the sources is left aside, the plan already being laid as wide as its walled
//     town (src/sim/settlement/streets.ts, OWN RULE).
//   - A parcel of the suburbs or any other landmark (a convent, a residence, a building known by name) that the ring
//     would cut is taken in where its middle lies inside, else the ring bends round it.
//   - A town on both banks of a river has a ring on each.
// The ring is open where the dry ground ends (water, rock), and has a gate where a street crosses it.
//
// The walls are written once, when the world is founded (and by the upgrade of a running world), and do not change
// while it runs: the towns do not grow yet.
import type { WorldState } from '../state';
import { LOT_KIND, STREET_KIND, WALL_SCHEMA } from '../state';
import { createTable, spawn } from '../ecs';
import { citiesOf } from '../content/cities';
import { planOf } from '../content/town_plans';
import { waysOf } from '../content/town_ways';
import { unwalled, walledOf } from '../content/walls';
import type { Ground } from '../content/ground';
import { footprint } from '../settlement/rule';
import { planDraw } from '../settlement/streets';
import { LANDMARK_KIND } from '../settlement/landmarks';
import {
  type Box,
  type Crossing,
  RUNS_ON,
  WALL_PIECE,
  holds,
  layRing,
  runOn,
  scaled,
  straddles,
} from '../settlement/walls';
import { shapeAround } from '../settlement/wall_shape';
import { FARM } from '../settlement/hamlets';

/** How often along the ring the ground is asked whether it carries the wall, in metres: a block of the ground. */
const STEP = 2;
/** A gate as wide as two streets: the passage and the towers either side of it. OWN RULE: no source in hand for the
 *  width of a gatehouse against the street it lets through. */
const GATE_STREETS = 2;
/** metres: farther than any town reaches */
const FAR = 1e6;
/** How often a ring is laid anew to bend round the parcels and landmarks it cuts, at most: London's suburb along the
 *  road north takes 20 rounds, parcel by parcel, with the country folk of feature 7. */
const TAKE_IN = 64;
/** The ring is smoothed over bays this many streets wide, and its corners lie this many metres off a straight line at
 *  the least (src/sim/settlement/wall_shape.ts). OWN RULE: the sources give where some rings ran, not how closely a
 *  ring followed its town; three streets keep it from going in and out round every parcel. */
const SMOOTH_STREETS = 3,
  CORNER = 2;

/** what of a town the ring is laid round: its parcels, its landmarks, its streets and its market */
export function townOf(s: WorldState, site: number) {
  const L = s.lot.cols,
    S = s.street.cols,
    M = s.landmark.cols;
  const parcels: Box[] = [],
    farms: Box[] = [],
    core: Box[] = [],
    edge: Box[] = [],
    streets: Crossing[] = [];
  let market = { x: 0, z: 0 },
    width = 0,
    size = { w: 0, d: 0 };
  for (let i = 0; i < s.lot.size; i++)
    if (s.lot.alive[i] && L.site[i] === site && L.kind[i] === LOT_KIND.parcel) {
      size = { w: L.w[i], d: L.d[i] };
      const f = footprint({ front: L.front[i] }, size);
      parcels.push({ x: L.x[i], z: L.z[i], w: f.w, d: f.d });
    } else if (s.lot.alive[i] && L.site[i] === site && L.kind[i] === LOT_KIND.farmstead) {
      const f = footprint({ front: L.front[i] }, FARM);
      farms.push({ x: L.x[i], z: L.z[i], w: f.w, d: f.d });
    }
  for (let k = 0; k < s.street.size; k++)
    if (s.street.alive[k] && S.site[k] === site) {
      if (S.kind[k] === STREET_KIND.market) market = { x: (S.x0[k] + S.x1[k]) / 2, z: (S.z0[k] + S.z1[k]) / 2 };
      else {
        width = S.width[k];
        streets.push({ x0: S.x0[k], z0: S.z0[k], x1: S.x1[k], z1: S.z1[k], kind: S.kind[k] });
      }
    }
  for (let i = 0; i < s.landmark.size; i++)
    if (s.landmark.alive[i] && M.site[i] === site) {
      const b = { x: M.x[i], z: M.z[i], w: M.w[i], d: M.d[i] };
      // the church of the see stands in the town; any other landmark only where the ring would cut it (a building
      // known by name may stand outside the walls, as Westminster Abbey stood outside London's)
      const see =
        M.kind[i] === LANDMARK_KIND.cathedral ||
        M.kind[i] === LANDMARK_KIND.orthodox ||
        M.kind[i] === LANDMARK_KIND.mosque;
      (see ? core : edge).push(b);
    }
  return { parcels, farms, core, edge, streets, market, width, size };
}

/** Whether the ground carries a wall at (x, z) metres from the town's centre: dry ground does (no water, no rock),
 *  and so does all beyond what was surveyed. */
const dryAt = (dry: Ground | null, site: number) => {
  if (!dry?.has(site)) return () => true;
  const m = dry.metresPerBlock,
    r = dry.reach(site);
  return (x: number, z: number) => {
    const bx = Math.round(x / m),
      bz = Math.round(z / m);
    return Math.abs(bx) > r || Math.abs(bz) > r || dry.free(site, bx, bz);
  };
};

type Ring = (readonly [number, number])[];

/** The rings of a town (each its corners in turn; one for each piece of the town between rivers), none for a town
 *  without parcels. */
export function ringsOf(s: WorldState, site: number, t: ReturnType<typeof townOf>): Ring[] {
  if (!t.parcels.length) return [];
  const plan = planOf(s.startYear, site);
  if (plan?.wall && plan.radius) {
    // the plan's radii in metres of the world, as the town's streets were laid from it
    const m = planDraw(t.parcels.length, t.size, plan.radius) * plan.radius;
    return [plan.wall.map(([x, z]) => [x * m, z * m] as const)];
  }
  const share = walledOf(s.startYear, site),
    k = share ? share.walled / share.settled : 1;
  const near = (b: Box) => Math.hypot(b.x - t.market.x, b.z - t.market.z);
  let held =
      k < 1
        ? [...t.parcels].sort((a, b) => near(a) - near(b)).slice(0, Math.max(1, Math.round(k * t.parcels.length)))
        : t.parcels,
    clear = t.farms;
  // (above one: stretched from the market until it holds that share; what it must stay clear of is drawn in by the
  // same factor before the ring is shaped, so that the stretched ring still runs clear of it)
  const drawnIn = (b: Box): Box =>
    k > 1
      ? { x: t.market.x + (b.x - t.market.x) / k, z: t.market.z + (b.z - t.market.z) / k, w: b.w / k, d: b.d / k }
      : b;
  const around = () =>
    shapeAround([...held, ...t.core], clear.map(drawnIn), t.width, SMOOTH_STREETS * t.width, CORNER).map((r) =>
      k > 1 ? scaled(r, t.market.x, t.market.z, k) : r,
    );
  let rings = around();
  // a parcel of the suburbs or a landmark that a ring cuts is taken inside where its middle lies inside, else the
  // ring bends round it, until no ring cuts any: a wall does not run through a house
  const rest = [...t.edge, ...(k < 1 ? t.parcels.filter((b) => !held.includes(b)) : [])];
  for (let n = 0; n < TAKE_IN; n++) {
    const cut = rest.filter((b) => !held.includes(b) && rings.some((r) => straddles(r, b)));
    if (!cut.length) break;
    // one the ring still cuts though it bends round it stands too near what the ring holds: it is taken in
    const inner = cut.filter((b) => clear.includes(b) || rings.some((r) => holds(r, [b.x, b.z])));
    held = [...held, ...inner];
    clear = [...clear.filter((b) => !inner.includes(b)), ...cut.filter((b) => !inner.includes(b))];
    rings = around();
  }
  return rings;
}

/** Lays the walls of every town of the start year (the table of walls anew). `dry`: the dry ground round the towns
 *  (src/sim/content/ground.ts), where the ring opens. */
export function foundWalls(s: WorldState, dry?: Ground | null): void {
  const wall = createTable(WALL_SCHEMA, 8192),
    W = wall.cols;
  s.wall = wall;
  const ground = dry && dry.year === s.startYear ? dry : null;
  for (const city of citiesOf(s.startYear)) {
    if (unwalled(s.startYear, city.site)) continue;
    const t = townOf(s, city.site),
      plan = planOf(s.startYear, city.site)?.wall,
      // a house the ring runs into closes it there (the wall of a real plan may cross the parcels laid on it): OWN
      // RULE, the wall is not drawn through it
      onHouse = (x: number, z: number) =>
        [...t.parcels, ...t.core, ...t.edge].some((b) => Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2),
      dryHere = (x: number, z: number) => dryAt(ground, city.site)(x, z) && !onHouse(x, z),
      gate = GATE_STREETS * t.width;
    const lay = (out: readonly Crossing[]) =>
      ringsOf(s, city.site, t).flatMap((ring) =>
        // a way runs on through the ring: in a town with a real plan from wherever its main street ends (the plan's
        // streets were cut at its wall, tools/settlement/cadastre_skeleton.py), elsewhere from near the ring
        layRing(ring, dryHere, [...runOn(ring, t.streets, plan ? FAR : RUNS_ON * t.width), ...out], STEP, gate),
      );
    let pieces = lay([]);
    // where no street of a way reaches a ring (it ended at water or rock in the town), the ways of the world still
    // leave the town: a gate where each crosses the ring, out from the market in its own direction
    if (pieces.length && !pieces.some((p) => p.kind === WALL_PIECE.gate)) {
      const out = waysOf(s.startYear, city.site).map((wy) => ({
        x0: t.market.x,
        z0: t.market.z,
        x1: t.market.x + Math.cos(wy.a) * FAR,
        z1: t.market.z + Math.sin(wy.a) * FAR,
        kind: wy.k + 1,
      }));
      if (out.length) pieces = lay(out);
    }
    for (const p of pieces) {
      const id = spawn(wall);
      W.site[id] = city.site;
      W.x0[id] = p.x0;
      W.z0[id] = p.z0;
      W.x1[id] = p.x1;
      W.z1[id] = p.z1;
      W.kind[id] = p.kind;
    }
  }
}
