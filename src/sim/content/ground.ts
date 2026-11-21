// The building ground of the towns: where in a town a house can stand (public/data/ground_<year>.json, written by
// tools/worldprobe/build_ground.ts from the ground of the world graphic: no water, no rock, no step higher than a
// block, not under the church, the great buildings, the towers or a monument). Static data, like the map: the land
// register lays the parcels of a town where a house can stand (src/sim/systems/lots.ts).

export interface GroundJson {
  year: number;
  /** metres a block stands for at the scale of the houses */
  metresPerBlock: number;
  /** per town: `site` (index of the gazetteer), `w` and `d` blocks (odd; the middle block is the town's centre), and
   *  `cells`: base64 of a bit field, rows from north to south, in a row from west to east, the lowest bit of a byte
   *  first, 1 = a house can stand */
  sites: { site: number; w: number; d: number; cells: string }[];
}

export interface Ground {
  year: number;
  metresPerBlock: number;
  /** whether the ground of the town was surveyed */
  has(site: number): boolean;
  /** how many blocks from the centre the survey of the town reaches (east, west, north and south) */
  reach(site: number): number;
  /** whether a house can stand on the block `bx` east and `bz` south of the town's centre; no beyond the survey */
  free(site: number, bx: number, bz: number): boolean;
}

export function compileGround(j: GroundJson): Ground {
  const towns = new Map<number, { w: number; d: number; bits: Uint8Array }>();
  for (const t of j.sites)
    towns.set(t.site, { w: t.w, d: t.d, bits: Uint8Array.from(atob(t.cells), (c) => c.charCodeAt(0)) });
  return {
    year: j.year,
    metresPerBlock: j.metresPerBlock,
    has: (site) => towns.has(site),
    reach: (site) => {
      const t = towns.get(site);
      return t ? Math.min(t.w, t.d) >> 1 : 0;
    },
    free: (site, bx, bz) => {
      const t = towns.get(site);
      if (!t) return false;
      const x = bx + (t.w >> 1),
        z = bz + (t.d >> 1);
      if (x < 0 || z < 0 || x >= t.w || z >= t.d) return false;
      const k = z * t.w + x;
      return ((t.bits[k >> 3] >> (k & 7)) & 1) === 1;
    },
  };
}

/** The building ground of the towns, and beyond its survey the dry ground (`dry`: no water, no rock, slopes not
 *  asked) as far as that reaches: for a town whose landmarks take the ground its survey holds (settlement feature 5).
 *  OWN RULE: the dry ground does not know the steps a house cannot stand on. */
export function widened(g: Ground | null, dry: Ground | null): Ground | null {
  if (!g || !dry || dry.year !== g.year || dry.metresPerBlock !== g.metresPerBlock) return g;
  return {
    year: g.year,
    metresPerBlock: g.metresPerBlock,
    has: (site) => g.has(site),
    reach: (site) => (dry.has(site) ? Math.max(g.reach(site), dry.reach(site)) : g.reach(site)),
    free: (site, bx, bz) => {
      const r = g.reach(site);
      return Math.abs(bx) <= r && Math.abs(bz) <= r ? g.free(site, bx, bz) : dry.free(site, bx, bz);
    },
  };
}
