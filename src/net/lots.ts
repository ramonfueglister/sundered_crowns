// What the world server tells a browser about the land register (src/sim/systems/lots.ts): the parcels of a town,
// its streets and market, its wall, the farmsteads of its hamlets and their fields, for the houses and fields the world graphic sets on them. Read-only HTTP: GET /lots/<site> and GET /lots?sites=<a>,<b>,…
// (server/main.ts). A town is named by its site: its index into data/content/gazetteer.json.
import type { WorldState } from '../sim/state';
import { ALIVE, NO_LOT, LOT_KIND } from '../sim/state';
import { stripOrder } from '../sim/settlement/fields';
import { presentPersons } from '../sim/people/living';
import { planGroundOf } from '../sim/systems/lots';

/** The ground of a town and of its hamlets in the land register, as columns of equal length (JSON). Metres at the
 *  scale of the houses; x east and z south of the centre of the town. */
export interface TownLots {
  site: number;
  /** the day of the world the list is for */
  day: number;
  /** the id of each piece of ground, what it is (LOT_KIND in src/sim/state.ts: 0 a parcel of the town, 1 a
   *  farmstead) and the hamlet it lies in (an id of `hamlets`; −1 in the town itself) */
  id: number[]; kind: number[]; hamlet: number[];
  /** its middle, its metres along the street and its metres deep */
  x: number[]; z: number[]; w: number[]; d: number[];
  /** the side its street lies on: 0 north, 1 east, 2 south, 3 west */
  front: number[];
  /** the family that lives on it (the lowest id when several do), −1 when nobody does, and the living persons of
   *  all families on it */
  family: number[]; persons: number[];
  /** the hamlets of the town: their ids, their middles, the farmsteads laid out in each, and the farmsteads in the order
   *  of their strips in the furlongs of the open field, from the west (ids of the ground above) */
  hamlets: { id: number[]; x: number[]; z: number[]; farms: number[]; strips: number[][] };
  /** the streets and the market of the town (settlement feature 3): the ends of each straight piece on its middle
   *  line, or the corners of the market; what it is (STREET_KIND in src/sim/state.ts) and its width in metres */
  streets: { x0: number[]; z0: number[]; x1: number[]; z1: number[]; kind: number[]; width: number[] };
  /** the furlongs of the fields of its hamlets (settlement feature 4): the hamlet each belongs to (an id of
   *  `hamlets`), its middle, metres east-west and north-south, its course and the courses its land is tilled in, and
   *  the farmstead that holds it whole (an id of the ground above; −1 in the open field, where every farmstead of the
   *  hamlet has a strip in it, from the west in the order of `hamlets.strips`) */
  fields: { hamlet: number[]; x: number[]; z: number[]; w: number[]; d: number[]; zelge: number[]; courses: number[]; farm: number[] };
  /** the landmarks of the town (settlement feature 5): what each is (LANDMARK_KIND in src/sim/settlement/landmarks.ts),
   *  its middle and its metres east-west and north-south, the building known by name it is (its index in
   *  src/sim/content/landmarks_<year>.json `named`, −1 for none), the order of a convent (255 for none), and the years
   *  of its building and of its fall (NO_YEAR where none): `builtIn` tells how it stands in a year */
  landmarks: { kind: number[]; x: number[]; z: number[]; w: number[]; d: number[]; named: number[]; order: number[]; start: number[]; end: number[]; ruined: number[] };
  /** the wall of the town (settlement feature 6): the ends of each straight piece of its ring, in turn round it, and
   *  what it is (WALL_PIECE in src/sim/settlement/walls.ts: 0 wall, 1 gate, 2 postern); none for a town without one */
  walls: { x0: number[]; z0: number[]; x1: number[]; z1: number[]; kind: number[] };
  /** a town laid on a real plan that draws its land and water (src/sim/settlement/plan_ground.ts): the metres of a
   *  radius of the plan and how far its streets reach from their middle lines, for the graphic to draw that ground */
  ground?: { radius: number; half: number };
}

/** The landmarks that stand alone, outside the towns, at their real place. */
export interface AloneLandmarks { kind: number[]; lat: number[]; lon: number[]; w: number[]; d: number[]; named: number[]; start: number[]; end: number[]; ruined: number[] }

export function aloneLandmarks(s: WorldState): AloneLandmarks {
  const C = s.landmark?.cols, o: AloneLandmarks = { kind: [], lat: [], lon: [], w: [], d: [], named: [], start: [], end: [], ruined: [] };
  for (let i = 0; C && i < s.landmark.size; i++) if (s.landmark.alive[i] && C.site[i] < 0) {
    o.kind.push(C.kind[i]); o.lat.push(C.lat[i]); o.lon.push(C.lon[i]); o.w.push(C.w[i]); o.d.push(C.d[i]); o.named.push(C.named[i]); o.start.push(C.start[i]); o.end.push(C.end[i]); o.ruined.push(C.ruined[i]);
  }
  return o;
}

/** The most towns one request may ask for (GET /lots?sites=…). */
export const MAX_SITES_PER_REQUEST = 200;

export function townLots(s: WorldState, site: number): TownLots {
  return manyTownsLots(s, [site])[0];
}

/** The ground of several towns, one list each in the order asked, in one pass over the register, the families and
 *  the persons. A site without ground gets an empty list. */
export function manyTownsLots(s: WorldState, sites: readonly number[]): TownLots[] {
  const L = s.lot.cols, F = s.family.cols, P = s.person.cols;
  const out = sites.map((site): TownLots => ({ site, day: s.day, id: [], kind: [], hamlet: [], x: [], z: [], w: [], d: [], front: [], family: [], persons: [], hamlets: { id: [], x: [], z: [], farms: [], strips: [] }, streets: { x0: [], z0: [], x1: [], z1: [], kind: [], width: [] }, fields: { hamlet: [], x: [], z: [], w: [], d: [], zelge: [], courses: [], farm: [] }, landmarks: { kind: [], x: [], z: [], w: [], d: [], named: [], order: [], start: [], end: [], ruined: [] }, walls: { x0: [], z0: [], x1: [], z1: [], kind: [] } }));
  const at = new Map<number, TownLots>();
  out.forEach((o) => { if (!at.has(o.site)) at.set(o.site, o); });
  const row = new Int32Array(s.lot.size).fill(-1); // the position of a parcel in the list of its town
  for (let i = 0; i < s.lot.size; i++) {
    const o = s.lot.alive[i] ? at.get(L.site[i]) : undefined;
    if (!o) continue;
    row[i] = o.id.length;
    o.id.push(i); o.kind.push(L.kind[i]); o.hamlet.push(L.hamlet[i]); o.x.push(L.x[i]); o.z.push(L.z[i]); o.w.push(L.w[i]); o.d.push(L.d[i]); o.front.push(L.front[i]);
    o.family.push(-1); o.persons.push(0);
  }
  const H = s.hamlets.cols;
  for (let h = 0; h < s.hamlets.size; h++) {
    const o = s.hamlets.alive[h] ? at.get(H.site[h]) : undefined;
    if (o) { o.hamlets.id.push(h); o.hamlets.x.push(H.x[h]); o.hamlets.z.push(H.z[h]); o.hamlets.farms.push(H.farms[h]); o.hamlets.strips.push([]); }
  }
  // the farmsteads of each hamlet, in the order of their strips (src/sim/settlement/fields.ts stripOrder)
  const farmsteads = new Map<number, number[]>();
  for (let i = 0; i < s.lot.size; i++) if (s.lot.alive[i] && L.kind[i] === LOT_KIND.farmstead && at.has(L.site[i])) { const f = farmsteads.get(L.hamlet[i]); if (f) f.push(i); else farmsteads.set(L.hamlet[i], [i]); }
  for (const o of at.values()) o.hamlets.id.forEach((h, k) => { const f = farmsteads.get(h) ?? []; o.hamlets.strips[k] = stripOrder(f.map((i) => ({ x: L.x[i], z: L.z[i] }))).map((j) => f[j]); });
  const C = s.field?.cols;
  for (let k = 0; C && k < s.field.size; k++) {
    const o = s.field.alive[k] ? at.get(C.site[k]) : undefined;
    if (o) { const q = o.fields; q.hamlet.push(C.hamlet[k]); q.x.push(C.x[k]); q.z.push(C.z[k]); q.w.push(C.w[k]); q.d.push(C.d[k]); q.zelge.push(C.zelge[k]); q.courses.push(C.courses[k]); q.farm.push(C.farm[k]); }
  }
  const M = s.landmark?.cols;
  for (let k = 0; M && k < s.landmark.size; k++) {
    const o = s.landmark.alive[k] ? at.get(M.site[k]) : undefined;
    if (o) { const q = o.landmarks; q.kind.push(M.kind[k]); q.x.push(M.x[k]); q.z.push(M.z[k]); q.w.push(M.w[k]); q.d.push(M.d[k]); q.named.push(M.named[k]); q.order.push(M.order[k]); q.start.push(M.start[k]); q.end.push(M.end[k]); q.ruined.push(M.ruined[k]); }
  }
  const W = s.wall?.cols;
  for (let k = 0; W && k < s.wall.size; k++) {
    const o = s.wall.alive[k] ? at.get(W.site[k]) : undefined;
    if (o) { const q = o.walls; q.x0.push(W.x0[k]); q.z0.push(W.z0[k]); q.x1.push(W.x1[k]); q.z1.push(W.z1[k]); q.kind.push(W.kind[k]); }
  }
  for (const o of at.values()) {
    const parcels = o.id.map((_, i) => i).filter((i) => o.kind[i] === LOT_KIND.parcel);
    const ground = parcels.length ? planGroundOf(s.startYear, o.site, parcels.length, { w: o.w[parcels[0]], d: o.d[parcels[0]] }) : null;
    if (ground) o.ground = ground;
  }
  const S = s.street.cols;
  for (let k = 0; k < s.street.size; k++) {
    const o = s.street.alive[k] ? at.get(S.site[k]) : undefined;
    if (o) { o.streets.x0.push(S.x0[k]); o.streets.z0.push(S.z0[k]); o.streets.x1.push(S.x1[k]); o.streets.z1.push(S.z1[k]); o.streets.kind.push(S.kind[k]); o.streets.width.push(S.width[k]); }
  }
  for (let f = 0; f < s.family.size; f++) {
    const l = s.family.alive[f] ? F.lot[f] : NO_LOT;
    if (l === NO_LOT || row[l] < 0) continue;
    const o = at.get(L.site[l])!;
    if (o.family[row[l]] < 0) o.family[row[l]] = f;
  }
  for (const i of presentPersons(s)) {
    if (P.died[i] !== ALIVE) continue;
    const l = F.lot[P.family[i]];
    if (l === NO_LOT || row[l] < 0) continue;
    at.get(L.site[l])!.persons[row[l]]++;
  }
  return out.map((o) => at.get(o.site)!);
}
