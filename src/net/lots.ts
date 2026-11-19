// What the world server tells a browser about the land register (src/sim/systems/lots.ts): the parcels of a town
// and the farmsteads of its hamlets, for the houses the world graphic sets on them. Read-only HTTP: GET /lots/<site> and GET /lots?sites=<a>,<b>,…
// (server/main.ts). A town is named by its site: its index into data/content/gazetteer.json.
import type { WorldState } from '../sim/state';
import { ALIVE, NO_LOT } from '../sim/state';
import { presentPersons } from '../sim/people/living';

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
  /** the hamlets of the town: their ids, their middles and the farmsteads laid out in each */
  hamlets: { id: number[]; x: number[]; z: number[]; farms: number[] };
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
  const out = sites.map((site): TownLots => ({ site, day: s.day, id: [], kind: [], hamlet: [], x: [], z: [], w: [], d: [], front: [], family: [], persons: [], hamlets: { id: [], x: [], z: [], farms: [] } }));
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
    if (o) { o.hamlets.id.push(h); o.hamlets.x.push(H.x[h]); o.hamlets.z.push(H.z[h]); o.hamlets.farms.push(H.farms[h]); }
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
