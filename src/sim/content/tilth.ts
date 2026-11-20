// The ground the fields of the towns can lie on (public/data/tilth_<year>.json, written by
// tools/worldprobe/build_tilth.ts from the ground of the world graphic): for every town with hamlets, which field lots
// of the world graphic's grid round it are open ground for a furlong (no water, no rock, no woods, nothing built, level
// to within two blocks: as the world graphic has laid its fields), and in how many courses its land is tilled (the
// Mediterranean kind of land of the map at the town: two, else three). Static data, like the map: the land register
// lays the fields of the farmsteads on it (src/sim/systems/fields.ts).
import { COURSES, COURSES_DRY, lotCorner, type Slot } from '../settlement/fields';

export interface TilthJson {
  year: number;
  /** per town: `site` (index of the gazetteer), `wx`, `wz` (the world block of its centre, as the world graphic has it),
   *  `dry` (1: the Mediterranean kind of land, two courses), and the field lots from (`lx0`, `lz0`) in a box of `cols`
   *  by `rows`: `cells`, base64 of a bit field, row by row from north to south, in a row from west to east, the lowest
   *  bit of a byte first, 1 = a furlong can lie there */
  sites: {
    site: number;
    wx: number;
    wz: number;
    dry: number;
    lx0: number;
    lz0: number;
    cols: number;
    rows: number;
    cells: string;
  }[];
}

export interface Tilth {
  year: number;
  /** whether the ground round the town was surveyed */
  has(site: number): boolean;
  /** the world block of the town's centre at the finest step of the world graphic, from which the furlongs lie;
   *  null when not surveyed */
  centre(site: number): [number, number] | null;
  /** in how many courses the town's land is tilled */
  courses(site: number): number;
  /** the spots round the town a furlong can lie on: the blocks of their north-west corners east and south of the
   *  town's centre block, row by row from the north */
  slots(site: number): Slot[];
}

export function compileTilth(j: TilthJson): Tilth {
  const towns = new Map(j.sites.map((t) => [t.site, t]));
  return {
    year: j.year,
    has: (site) => towns.has(site),
    centre: (site) => {
      const t = towns.get(site);
      return t ? [t.wx, t.wz] : null;
    },
    courses: (site) => (towns.get(site)?.dry ? COURSES_DRY : COURSES),
    slots: (site) => {
      const t = towns.get(site);
      if (!t) return [];
      const bits = Uint8Array.from(atob(t.cells), (c) => c.charCodeAt(0)),
        out: Slot[] = [];
      for (let r = 0; r < t.rows; r++)
        for (let c = 0; c < t.cols; c++) {
          const k = r * t.cols + c;
          if (!((bits[k >> 3] >> (k & 7)) & 1)) continue;
          const [x, z] = lotCorner(t.lx0 + c, t.lz0 + r);
          out.push({ bx: x - t.wx, bz: z - t.wz });
        }
      return out;
    },
  };
}
