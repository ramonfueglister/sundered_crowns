// The land register: feature 1 of the settlement (docs/SETTLEMENT_DESIGN.md, where every source is listed).
//
// Every family of a town has a parcel: a piece of the town's ground with a place, a size and a side at the street.
// The parcels are entities of their own (LOT_SCHEMA in src/sim/state.ts), and a family points to its parcel
// (`family.lot`). What a town shows of its houses is drawn from this table and from nothing else.
//
// How much ground a town takes follows from the persons who live in it (src/sim/settlement/rule.ts): the settled area
// of the real town they were derived from, a hundredth of it at the scale of the houses. The families share the
// parcels' part of that ground equally, and the parcels lie on a grid of blocks around the centre of the town.
//
// The register is written once, when the world is founded, and does not change yet: nobody is born, dies, marries or
// moves while the world runs, so no parcel is laid out, split or left. A ruler has no parcel (castles and residences
// are not built yet).
import type { WorldState } from '../state';
import { LOT_SCHEMA, LOT_KIND, NO_LOT } from '../state';
import { createTable, spawn } from '../ecs';
import { citiesOf } from '../content/cities';
import { SCALE } from '../scale';
import { townGround, parcelSize, layParcels } from '../settlement/rule';

/** The families of each town of the start year, in the order of the towns (src/sim/content/cities.ts): their ids,
 *  lowest first, and the persons in them. The people were founded town by town (src/sim/systems/people.ts), so the
 *  persons of a town are the next `round(people / SCALE)` ids; a family stores only its place, and a place may hold
 *  several towns. Holds while nobody has been born or has moved since the founding. */
export function townFamilies(s: WorldState): { families: number[]; persons: number }[] {
  const P = s.person.cols, F = s.family.cols, out: { families: number[]; persons: number }[] = [];
  let id = 0;
  for (const city of citiesOf(s.startYear)) {
    const n = Math.round(city.people / SCALE), seen = new Set<number>();
    for (const end = id + n; id < end; id++) {
      const f = P.family[id];
      if (id >= s.person.size || F.place[f] !== city.place) throw new Error(`person ${id} is not of ${city.name}: the persons are no longer those of the founding`);
      seen.add(f);
    }
    out.push({ families: [...seen].sort((a, b) => a - b), persons: n });
  }
  return out;
}

/**
 * Founds the land register of a world: lays out the parcels of every town of the start year and gives each of its
 * families one, the family with the lowest id the innermost (PLACEHOLDER: who lives where in a town has no rule yet).
 * `free` (optional) tells whether a parcel of a town can stand at a spot (metres east and south of its centre).
 */
export function foundLots(s: WorldState, free?: (site: number, x: number, z: number) => boolean): void {
  const lot = createTable(LOT_SCHEMA, 32768), L = lot.cols, F = s.family.cols;
  s.lot = lot;
  F.lot.fill(NO_LOT);
  const cities = citiesOf(s.startYear), towns = cities.length ? townFamilies(s) : [];
  cities.forEach((city, k) => {
    const { families, persons } = towns[k];
    if (!families.length) return;
    const size = parcelSize(townGround(persons, city.site), families.length);
    const parcels = layParcels(families.length, size, free && ((x, z) => free(city.site, x, z)));
    families.forEach((f, i) => {
      const id = spawn(lot), p = parcels[i];
      L.kind[id] = LOT_KIND.parcel; L.place[id] = city.place; L.site[id] = city.site;
      L.x[id] = p.x; L.z[id] = p.z; L.w[id] = size.w; L.d[id] = size.d; L.front[id] = p.front;
      F.lot[f] = id;
    });
  });
}
