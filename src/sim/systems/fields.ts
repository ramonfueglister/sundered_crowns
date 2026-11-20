// The fields of the farmsteads: feature 4 of the settlement (docs/SETTLEMENT_DESIGN.md, where every source is listed).
//
// Every hamlet tills the arable its farmsteads hold: the arable the economy cultivates in the place
// (src/sim/systems/cultivation.ts), an equal share to every farmstead of the place. The fields lie round the hamlet in
// furlongs (Gewanne) on the open ground nearest to it, in three courses north of the Mediterranean and in two where
// the map has the Mediterranean kind of land (src/sim/settlement/fields.ts). The furlongs are rows of their own
// (FIELD_SCHEMA in src/sim/state.ts); the strips of a furlong are not stored: they follow from the farmsteads of its
// hamlet and their order at the lane. What the world graphic shows of the fields round the towns is drawn from these
// rows and from nothing else, with the crop of each course in the year.
//
// The fields are laid out once, when the world is founded (or by the upgrade 30 → 31 of an older one), on the arable
// of the year before the start. The arable follows the persons of the place every year; the fields do not follow it
// yet. The harvest of a place stays the harvest the economy brings in; a farmstead's part of it is its share of the
// place's furlongs (farmHarvest).
import type { WorldState } from '../state';
import { FIELD_SCHEMA, LOT_KIND, NO_LOT } from '../state';
import { createTable, spawn } from '../ecs';
import { FIELD_LOT, GEWANN, GEWANN_HA, COURSES, hectaresOf, layFields, slotsAround, stripOrder, type FieldHamlet, type Slot } from '../settlement/fields';
import { landmarkBoxes } from './landmarks';
import { HAMLET_GAP, HAMLET_OFF, METRES_PER_BLOCK, hamletBox } from '../settlement/hamlets';
import type { Tilth } from '../content/tilth';

/** What founding the fields found. */
export interface FieldsFound {
  /** hectares the farmsteads of all towns should hold, and hectares their furlongs hold */
  asked: number; laid: number;
  /** the towns whose furlongs hold less than 99.5 % of their arable: not enough open ground round their hamlets */
  short: number[];
}

/** The towns of the register with hamlets, in the order of their first hamlet: per site its place, its hamlets
 *  (rows of the table of hamlets) and, per hamlet, its farmsteads (rows of the land register, lowest id first). */
function hamletsByTown(s: WorldState): Map<number, { place: number; hamlets: number[]; farms: number[][] }> {
  const H = s.hamlets.cols, L = s.lot.cols, out = new Map<number, { place: number; hamlets: number[]; farms: number[][] }>(), at = new Map<number, number[]>();
  for (let h = 0; h < s.hamlets.size; h++) {
    if (!s.hamlets.alive[h]) continue;
    const t = out.get(H.site[h]) ?? { place: H.place[h], hamlets: [], farms: [] };
    out.set(H.site[h], t);
    const list: number[] = [];
    t.hamlets.push(h); t.farms.push(list); at.set(h, list);
  }
  for (let i = 0; i < s.lot.size; i++) if (s.lot.alive[i] && L.kind[i] === LOT_KIND.farmstead) at.get(L.hamlet[i])?.push(i);
  return out;
}

/** The farmsteads of each place: an equal share of the place's arable goes to each. */
function farmsteadsOfPlace(s: WorldState): Map<number, number> {
  const L = s.lot.cols, n = new Map<number, number>();
  for (let i = 0; i < s.lot.size; i++) if (s.lot.alive[i] && L.kind[i] === LOT_KIND.farmstead) n.set(L.place[i], (n.get(L.place[i]) ?? 0) + 1);
  return n;
}

/**
 * Founds the fields of every hamlet of the register (layFields): each farmstead holds an equal share of its place's
 * arable (`place.arable`), and the furlongs lie on the open ground round its hamlet that the world graphic surveyed
 * (`tilth`, src/sim/content/tilth.ts), clear of the town and of every hamlet. A town whose ground was not surveyed has
 * its furlongs laid on every spot round it, without regard to the ground, in three courses (PLACEHOLDER).
 */
export function foundFields(s: WorldState, tilth?: Tilth | null): FieldsFound {
  const field = createTable(FIELD_SCHEMA, 131072), C = field.cols, L = s.lot.cols, H = s.hamlets.cols, found: FieldsFound = { asked: 0, laid: 0, short: [] };
  s.field = field;
  const t = tilth && tilth.year === s.startYear ? tilth : null, perPlace = farmsteadsOfPlace(s);
  // the ground of each town itself: how far its parcels and its streets reach from its centre
  const half = new Map<number, number>();
  for (let i = 0; i < s.lot.size; i++) if (s.lot.alive[i] && L.kind[i] === LOT_KIND.parcel) half.set(L.site[i], Math.max(half.get(L.site[i]) ?? 0, Math.abs(L.x[i]) + L.w[i], Math.abs(L.z[i]) + L.w[i], Math.abs(L.x[i]) + L.d[i], Math.abs(L.z[i]) + L.d[i]));
  for (let k = 0; k < s.street.size; k++) if (s.street.alive[k]) { const S = s.street.cols, site = S.site[k]; half.set(site, Math.max(half.get(site) ?? 0, Math.abs(S.x0[k]), Math.abs(S.x1[k]), Math.abs(S.z0[k]), Math.abs(S.z1[k]))); }
  for (const [site, town] of hamletsByTown(s)) {
    const farms = town.farms.reduce((n, f) => n + f.length, 0), hectares = (s.place.arable[town.place] * farms) / (perPlace.get(town.place) ?? farms);
    if (!(hectares > 0)) continue;
    const hamlets: FieldHamlet[] = town.hamlets.map((h, k) => ({ x: H.x[h], z: H.z[h], farms: town.farms[k].map((i) => ({ x: L.x[i], z: L.z[i] })) }));
    // the spots: surveyed, or every spot as far as the hamlets' fields can reach
    let slots: Slot[];
    if (t?.has(site)) slots = t.slots(site);
    else {
      const perHamlet = hectares / hamlets.length, flur = Math.sqrt(((perHamlet / GEWANN_HA) * FIELD_LOT.w * FIELD_LOT.d) / Math.PI) * METRES_PER_BLOCK;
      slots = slotsAround(Math.max(...hamlets.map((h) => Math.hypot(h.x, h.z))) + 2 * flur);
    }
    // clear of the town and of every hamlet of the town (as the hamlets keep from them, src/sim/settlement/hamlets.ts)
    const townHalf = (half.get(site) ?? 0) + HAMLET_OFF, boxes = [...hamlets.map((h, k) => ({ x: h.x, z: h.z, ...hamletBox(town.farms[k].length) })), ...landmarkBoxes(s, site)];
    slots = slots.filter((q) => {
      const x0 = q.bx * METRES_PER_BLOCK, z0 = q.bz * METRES_PER_BLOCK, x1 = (q.bx + GEWANN.w) * METRES_PER_BLOCK, z1 = (q.bz + GEWANN.d) * METRES_PER_BLOCK;
      if (x1 > -townHalf && x0 < townHalf && z1 > -townHalf && z0 < townHalf) return false;
      return !boxes.some((b) => x1 > b.x - b.w / 2 - HAMLET_GAP && x0 < b.x + b.w / 2 + HAMLET_GAP && z1 > b.z - b.d / 2 - HAMLET_GAP && z0 < b.z + b.d / 2 + HAMLET_GAP);
    });
    const courses = t?.has(site) ? t.courses(site) : COURSES, laid = layFields(hamlets, hectares, courses, slots);
    for (const f of laid.fields) {
      const id = spawn(field), h = town.hamlets[f.hamlet];
      C.place[id] = town.place; C.site[id] = site; C.hamlet[id] = h;
      C.x[id] = f.x; C.z[id] = f.z; C.w[id] = f.w; C.d[id] = f.d; C.zelge[id] = f.zelge; C.courses[id] = courses;
      C.farm[id] = f.farm < 0 ? NO_LOT : town.farms[f.hamlet][f.farm];
    }
    found.asked += laid.asked; found.laid += laid.laid;
    if (laid.laid < 0.995 * laid.asked) found.short.push(site);
  }
  return found;
}

/** What a farmstead holds of its hamlet's fields: its furlongs held whole, and its strips in the furlongs of the open
 *  field (one in each), with their hectares. */
export interface FarmFields { furlongs: number; strips: number; hectares: number }

/** The fields of every farmstead of a place: per farmstead (a row of the land register) what it holds. */
export function placeFarmFields(s: WorldState, place: number): Map<number, FarmFields> {
  const C = s.field.cols, L = s.lot.cols, out = new Map<number, FarmFields>(), farmsOf = new Map<number, number[]>();
  for (let i = 0; i < s.lot.size; i++) {
    if (!s.lot.alive[i] || L.kind[i] !== LOT_KIND.farmstead || L.place[i] !== place) continue;
    out.set(i, { furlongs: 0, strips: 0, hectares: 0 });
    const list = farmsOf.get(L.hamlet[i]);
    if (list) list.push(i); else farmsOf.set(L.hamlet[i], [i]);
  }
  for (let k = 0; k < s.field.size; k++) {
    if (!s.field.alive[k] || C.place[k] !== place) continue;
    const ha = hectaresOf(C.w[k], C.d[k]);
    if (C.farm[k] !== NO_LOT) { const o = out.get(C.farm[k]); if (o) { o.furlongs++; o.hectares += ha; } continue; }
    const farms = farmsOf.get(C.hamlet[k]) ?? [];
    for (const f of farms) { const o = out.get(f)!; o.strips++; o.hectares += ha / farms.length; }
  }
  return out;
}

/** The order of the strips in the furlongs of a hamlet's open field: the farmsteads (rows of the land register) from
 *  west to east (stripOrder). */
export function hamletStrips(s: WorldState, hamlet: number): number[] {
  const L = s.lot.cols, farms: number[] = [];
  for (let i = 0; i < s.lot.size; i++) if (s.lot.alive[i] && L.kind[i] === LOT_KIND.farmstead && L.hamlet[i] === hamlet) farms.push(i);
  return stripOrder(farms.map((i) => ({ x: L.x[i], z: L.z[i] }))).map((k) => farms[k]);
}

/** A farmstead's part of its place's harvest of the year (kilocalories, in heads at 1 : 100 as the harvest): the
 *  harvest the economy brought in (`place.harvest`) by the farmstead's share of the hectares of the place's furlongs. */
export function farmHarvest(s: WorldState, farmstead: number, fields = placeFarmFields(s, s.lot.cols.place[farmstead])): number {
  let all = 0;
  for (const f of fields.values()) all += f.hectares;
  const mine = fields.get(farmstead)?.hectares ?? 0;
  return all > 0 ? (s.place.harvest[s.lot.cols.place[farmstead]] * mine) / all : 0;
}
