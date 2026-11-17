// The hamlets of a town and the farmsteads in them: feature 2 of the settlement (docs/SETTLEMENT_DESIGN.md, where
// every source is listed). How many hamlets the farming families of a town make, how large a farmstead is, where
// the farmsteads of a hamlet lie and where the hamlets lie round their town. Only arithmetic here, no state:
// src/sim/systems/lots.ts writes the land register with it.
import { FRONT, PARCEL_SHARE, type Parcel, type ParcelSize } from './rule';

/** A hamlet has no more farmsteads than this. In Switzerland three to five farmsteads already made a village and
 *  most villages had ten to twenty (HLS, Dorf); the Westphalian Drubbel has three to fifteen (Henkel 2007); Catalan
 *  hamlets mostly fewer than ten houses (Bolòs 2026). */
export const HAMLET_FARMS = 10;

/** The farmstead of a family: metres at the lane and metres deep. Half the sides of the smallest farmstead the
 *  sources measure (Cottam, Yorkshire: a row of four tofts of just over 20 m by 35 m, Historic England, list entry
 *  1017068). The half is no source's: Ramon's choice of 17 November 2026, so that the hamlets do not take the land
 *  of the fields (a block of the houses is shown as about 125 m of land). It holds a farmhouse of 5 m by 10 m, as
 *  Cottam's small buildings are, and a yard. */
export const FARM: ParcelSize = { w: 10, d: 17.5 };

/** The lane between the two rows of a hamlet, in metres: as wide as the streets of a town of such parcels, which
 *  leave the parcels PARCEL_SHARE of the ground (src/sim/settlement/rule.ts). No source measures a hamlet's lane. */
export const LANE = 2 * FARM.d * (1 / Math.sqrt(PARCEL_SHARE) - 1);

/** How far a hamlet keeps from the outermost parcels of its town, and hamlets from each other, in metres at the
 *  scale of the houses. PLACEHOLDER: no source. */
export const HAMLET_OFF = 20, HAMLET_GAP = 4;

/** A block of the houses (2 m) is shown as about this many metres of land (src/worldprobe/land.ts: a quarter of a
 *  cell of the map's data, some 130 m in middle Europe; nominal). The land is not scaled, the houses are. */
export const LAND_PER_BLOCK = 125, METRES_PER_BLOCK = 2;

/** The hamlets of a town with so many farming families: the fewest that hold them, HAMLET_FARMS at most each. */
export const hamletsOf = (families: number): number => (families > 0 ? Math.ceil(families / HAMLET_FARMS) : 0);

/** The farmsteads of each hamlet of a town: the families shared out evenly, the first hamlets one more. */
export function hamletSizes(families: number): number[] {
  const n = hamletsOf(families), each = n ? Math.floor(families / n) : 0, more = n ? families % n : 0;
  return Array.from({ length: n }, (_, k) => each + (k < more ? 1 : 0));
}

/** The ground a hamlet of `farms` farmsteads takes: metres east-west and north-south. */
export const hamletBox = (farms: number): { w: number; d: number } => ({ w: Math.ceil(farms / 2) * FARM.w, d: 2 * FARM.d + LANE });

/**
 * Where the farmsteads of a hamlet lie round its middle (0, 0): in two rows at a lane that runs east-west, the
 * northern row fronting the lane to its south and the southern the lane to its north, the innermost first (rows of
 * regular farmsteads: Cottam; sixteen houses along the stream at Pfaffenschlag, Archaeological Atlas of Bohemia).
 * The northern row has the odd one.
 */
export function layFarms(farms: number): Parcel[] {
  const out: Parcel[] = [], north = Math.ceil(farms / 2), south = farms - north, z = (LANE + FARM.d) / 2;
  for (let i = 0; i < north; i++) out.push({ x: (i - (north - 1) / 2) * FARM.w, z: -z, front: FRONT.south });
  for (let i = 0; i < south; i++) out.push({ x: (i - (south - 1) / 2) * FARM.w, z, front: FRONT.north });
  return out.sort((a, b) => Math.abs(a.x) - Math.abs(b.x) || a.z - b.z || a.x - b.x);
}

/** The angle between one hamlet and the next round their town: the golden angle, so that they never line up. */
export const HAMLET_TURN = Math.PI * (3 - Math.sqrt(5));

/**
 * Where the `n` hamlets of a town lie round its centre, in metres at the scale of the houses: spread evenly over
 * the ring between `inner` (the edge of the town) and `outer` (the edge of its fields), so that every hamlet lies
 * in the middle of as much of the land as every other (fields lie near the farm: within 1 to 2 km, at most about
 * 5 km, Chisholm 1979 after Shukurov et al.). The pattern, a sunflower, is a PLACEHOLDER as the grid of the towns
 * is. The middle of a hamlet lies on the middle of a block.
 */
export function hamletSpots(n: number, inner: number, outer: number): { x: number; z: number }[] {
  const snap = (v: number) => Math.round(v / METRES_PER_BLOCK) * METRES_PER_BLOCK;
  return Array.from({ length: n }, (_, k) => {
    const r = Math.sqrt(inner * inner + ((k + 0.5) / n) * (outer * outer - inner * inner)), a = k * HAMLET_TURN;
    return { x: snap(r * Math.cos(a)), z: snap(r * Math.sin(a)) };
  });
}

/** The radius of the disc that holds `hectares` of arable, in metres at the scale of the houses: how far the fields
 *  of a town reach when all the land round it is under its plough. */
export const fieldReach = (hectares: number): number => (Math.sqrt((hectares * 10000) / Math.PI) / LAND_PER_BLOCK) * METRES_PER_BLOCK;

/** The ring the hamlets of a town lie in: from the edge of the town (`half`: how far its parcels reach from its
 *  centre) to the edge of its fields, and never so narrow that the hamlets have no room beside each other. */
export function hamletRing(half: number, sizes: readonly number[], hectares: number): { inner: number; outer: number } {
  if (!sizes.length) return { inner: 0, outer: 0 };
  const box = hamletBox(Math.max(...sizes)), inner = half + HAMLET_OFF + Math.max(box.w, box.d) / 2, room = box.w * box.w + box.d * box.d;
  return { inner, outer: Math.max(fieldReach(hectares), Math.sqrt(inner * inner + (sizes.length * room) / Math.PI)) };
}
