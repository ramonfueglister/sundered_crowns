// The fields of the farmsteads: feature 4 of the settlement (docs/SETTLEMENT_DESIGN.md, where every source is
// listed). How much arable each farmstead of a hamlet holds, where the hamlet's fields lie, how they fall into the
// courses of the rotation (Zelgen), into furlongs (Gewanne) and into one strip per farmstead. Only arithmetic here,
// no state: src/sim/systems/fields.ts writes the land register with it.
//
// A hamlet of the world stands for a hundred hamlets of its time and a farmstead for a hundred farms (src/sim/scale.ts),
// so the fields of a farmstead are the arable of a hundred farming families: the arable the economy cultivates
// (src/sim/systems/cultivation.ts), at the real size of the land (a block of 2 m at the scale of the houses is shown as
// LAND_PER_BLOCK metres of land).
import { LAND_PER_BLOCK, METRES_PER_BLOCK } from './hamlets';

/** A furlong (Gewann) with its balk, in blocks: as wide (east-west) and as deep (north-south) as a field lot of the
 *  world graphic (src/worldprobe/settle.ts), whose rows of lots are set off by half a lot every other row. */
export const FIELD_LOT = { w: 11, d: 8 } as const;
/** The furlong itself, in blocks: all of its lot but a balk a block wide on its west and north side. */
export const GEWANN = { w: FIELD_LOT.w - 1, d: FIELD_LOT.d - 1 } as const;
/** Hectares of land a block stands for. */
export const HA_PER_BLOCK = (LAND_PER_BLOCK * LAND_PER_BLOCK) / 10000;
/** Hectares of land a whole furlong holds: 10 × 7 blocks of 125 m, 109.4 ha. */
export const GEWANN_HA = GEWANN.w * GEWANN.d * HA_PER_BLOCK;

/** In how many courses the fields are tilled: three north of the Mediterranean (winter corn, spring corn, fallow;
 *  HLS, Dreifelderwirtschaft), two where the map has the Mediterranean kind of land (corn and fallow; the dry summers
 *  bear no spring corn). PLACEHOLDER line: the HLS has two courses also in the Breisgau and the Vaud. */
export const COURSES = 3, COURSES_DRY = 2;

/** What a course carries in a year. */
export const CROP = { winter: 0, spring: 1, fallow: 2 } as const;
export type Crop = (typeof CROP)[keyof typeof CROP];
/** What the course `zelge` of fields tilled in `courses` courses carries in `year`: each course moves on by one a year,
 *  winter corn → spring corn → fallow → winter corn (two courses: corn → fallow → corn). */
export function cropOf(zelge: number, courses: number, year: number): Crop {
  const k = (((zelge + year) % courses) + courses) % courses;
  if (courses >= 3) return k === 0 ? CROP.winter : k === 1 ? CROP.spring : CROP.fallow;
  return k === 0 ? CROP.winter : CROP.fallow;
}

/** The ground of a furlong in metres at the scale of the houses: its middle east and south of the centre of the town,
 *  its width (east-west) and its depth (north-south). */
export interface FieldBox { x: number; z: number; w: number; d: number }
/** A spot a furlong can lie on: the block of its north-west corner, east and south of the town's centre block. */
export interface Slot { bx: number; bz: number }
/** Hectares a furlong of `w` by `d` metres holds. */
export const hectaresOf = (w: number, d: number): number => (w / METRES_PER_BLOCK) * (d / METRES_PER_BLOCK) * HA_PER_BLOCK;

/** The spot of the field lot (`lx`, `lz`) of the world graphic's grid of lots, as the block of its furlong's north-west
 *  corner in the world (src/worldprobe/settle.ts lays the same lots). */
export function lotCorner(lx: number, lz: number): [number, number] {
  return [lx * FIELD_LOT.w + (lz & 1 ? Math.floor(FIELD_LOT.w / 2) : 0) + 1, lz * FIELD_LOT.d + 1];
}
/** The field lot of the world graphic's grid whose furlong has its north-west corner at the world block (wx, wz), or
 *  null when no furlong starts there. */
export function lotAt(wx: number, wz: number): [number, number] | null {
  const lz = Math.floor((wz - 1) / FIELD_LOT.d), shift = lz & 1 ? Math.floor(FIELD_LOT.w / 2) : 0, lx = Math.floor((wx - 1 - shift) / FIELD_LOT.w);
  const [x0, z0] = lotCorner(lx, lz);
  return x0 === wx && z0 === wz ? [lx, lz] : null;
}

/** A hamlet as the fields are laid out for it: its middle (metres from the town's centre) and the middles of its
 *  farmsteads in the order of the register. */
export interface FieldHamlet { x: number; z: number; farms: readonly { x: number; z: number }[] }
/** A furlong laid out: its ground, the course it belongs to, and the farmstead that holds it whole (the index among
 *  the farmsteads of its hamlet; −1 for a furlong of the open field, whose strips go to every farmstead). */
export interface Field extends FieldBox { hamlet: number; zelge: number; farm: number }

/**
 * The order of the strips in every furlong of a hamlet's open field: the farmsteads from west to east along their lane,
 * the northern row first where two face each other. The strips lie in the same order from west to east in every
 * furlong (the sun division: the farm that lies farthest south in the village has the southernmost strip in every
 * field, Chouquer 2023 after the Jutland law of 1241; the lane of a hamlet runs east-west). Returns, for each strip
 * from the west, the index of its farmstead.
 */
export function stripOrder(farms: readonly { x: number; z: number }[]): number[] {
  return farms.map((_, i) => i).sort((a, b) => farms[a].x - farms[b].x || farms[a].z - farms[b].z || a - b);
}

/** The strip `k` (from the west) of a furlong shared by `n` farmsteads: its middle east of the furlong's middle and its
 *  width, in metres. All strips of a furlong are equally wide and as deep as the furlong. */
export function stripOf(f: FieldBox, n: number, k: number): { x: number; w: number } {
  const w = f.w / n;
  return { x: f.x - f.w / 2 + (k + 0.5) * w, w };
}

/** What laying out the fields of a town found. */
export interface FieldsLaid {
  fields: Field[];
  /** hectares the town's farmsteads should hold and hectares its furlongs hold */
  asked: number; laid: number;
}

/**
 * Lays out the fields of the hamlets of a town. `hectares` is the town's arable: the share of its place's arable that
 * its farming persons hold (as the hamlets of feature 2 take it). Every farmstead holds an equal share of it.
 *
 * 1. Each hamlet takes as many furlongs as hold its farmsteads' land, on the spots nearest its middle; the hamlets of a
 *    town take one spot each in turn, the first hamlet first, so that none is left without. `slots` are the spots a
 *    furlong can lie on (open ground: no water, no rock, no woods, nothing built; from the world graphic,
 *    src/sim/content/tilth.ts).
 * 2. Open field (`courses` 3): the furlongs of a hamlet fall into three courses of equal land, each a run of furlongs
 *    round the hamlet by their bearing from its middle, beginning in the north and going round by east. Every furlong
 *    is shared in strips by all the farmsteads (stripOrder), so each holds the same land in every course. The farthest
 *    furlong of each course is as much shorter (north-south) as makes the course's land come out exactly.
 * 3. Two courses (the Mediterranean kind of land): no courses in common; each furlong belongs whole to one farmstead,
 *    the farmsteads taking in turn the spot nearest their own; of each farmstead's furlongs, by their distance from it,
 *    one lies in the one course and the next in the other. The farthest is shortened so that the farmstead's land comes
 *    out exactly.
 *
 * A hamlet that finds fewer spots than it needs takes what it finds: its courses are as equal as the spots allow, and
 * `laid` falls short of `asked`.
 */
export function layFields(hamlets: readonly FieldHamlet[], hectares: number, courses: number, slots: readonly Slot[]): FieldsLaid {
  const out: Field[] = [], farmsAll = hamlets.reduce((n, h) => n + h.farms.length, 0);
  if (!(hectares > 0) || farmsAll === 0 || !slots.length) return { fields: out, asked: Math.max(0, hectares || 0), laid: 0 };
  const perFarm = hectares / farmsAll, open = courses >= 3;
  const mid = (s: Slot) => ({ x: (s.bx + GEWANN.w / 2) * METRES_PER_BLOCK, z: (s.bz + GEWANN.d / 2) * METRES_PER_BLOCK });
  const mids = slots.map(mid);
  // the land each hamlet asks for, in whole furlongs per course (open field) or per farmstead (two courses)
  const parts = hamlets.map((h) => {
    const land = perFarm * h.farms.length, n = open ? courses : h.farms.length, each = land / n;
    return { each, count: Array.from({ length: n }, () => Math.ceil(each / GEWANN_HA - 1e-9)) };
  });
  const need = parts.map((p) => p.count.reduce((a, b) => a + b, 0));
  // 1. the spots, nearest first, one in turn for each hamlet
  const taken = new Uint8Array(slots.length), got: number[][] = hamlets.map(() => []);
  const order = hamlets.map((h) => mids.map((_, i) => i).sort((a, b) => (mids[a].x - h.x) ** 2 + (mids[a].z - h.z) ** 2 - ((mids[b].x - h.x) ** 2 + (mids[b].z - h.z) ** 2) || a - b));
  const next = hamlets.map(() => 0);
  for (let busy = true; busy;) {
    busy = false;
    hamlets.forEach((_, h) => {
      if (got[h].length >= need[h]) return;
      const o = order[h];
      while (next[h] < o.length && taken[o[next[h]]]) next[h]++;
      if (next[h] >= o.length) return;
      taken[o[next[h]]] = 1; got[h].push(o[next[h]]); busy = true;
    });
  }
  let laid = 0;
  hamlets.forEach((h, hi) => {
    const mine = got[hi], p = parts[hi];
    if (!mine.length) return;
    const dist = (i: number, x: number, z: number) => (mids[i].x - x) ** 2 + (mids[i].z - z) ** 2;
    const put = (i: number, zelge: number, farm: number, ha: number) => {
      const s = slots[i], d = Math.min(GEWANN.d, (ha / HA_PER_BLOCK) / GEWANN.w) * METRES_PER_BLOCK, w = GEWANN.w * METRES_PER_BLOCK;
      // a shortened furlong keeps its north edge: its strips are shorter at the south end
      out.push({ x: s.bx * METRES_PER_BLOCK + w / 2, z: s.bz * METRES_PER_BLOCK + d / 2, w, d, hamlet: hi, zelge, farm });
      laid += hectaresOf(w, d);
    };
    /** the furlongs of a run, the land `each` on `count` of them: whole ones, the farthest shortened */
    const fill = (run: number[], each: number, zelge: (k: number) => number, farm: number, from: { x: number; z: number }) => {
      const near = [...run].sort((a, b) => dist(a, from.x, from.z) - dist(b, from.x, from.z) || a - b);
      let left = each;
      near.forEach((i, k) => { const ha = k === near.length - 1 ? Math.min(GEWANN_HA, left) : GEWANN_HA; left -= ha; put(i, zelge(k), farm, ha); });
    };
    // as many furlongs to each part as it asked for, as far as the spots go: the parts in turn
    const share = (n: number) => { const c = p.count.map(() => 0); for (let k = 0, left = n; left > 0; k = (k + 1) % c.length) if (c[k] < p.count[k]) { c[k]++; left--; } return c; };
    const counts = share(mine.length);
    if (open) {
      // 2. the courses: runs round the hamlet by bearing, from the north by east
      const bearing = (i: number) => { const a = Math.atan2(mids[i].x - h.x, -(mids[i].z - h.z)); return a < 0 ? a + 2 * Math.PI : a; };
      const round = [...mine].sort((a, b) => bearing(a) - bearing(b) || a - b);
      let at = 0;
      counts.forEach((c, z) => {
        const run = round.slice(at, at + c);
        at += c;
        fill(run, c === p.count[z] ? p.each : c * GEWANN_HA, () => z, -1, h);
      });
      return;
    }
    // 3. every furlong to one farmstead: the farmsteads take the spot nearest their own in turn
    const left = [...mine], theirs: number[][] = h.farms.map(() => []);
    for (let busy = true; busy && left.length;) {
      busy = false;
      h.farms.forEach((f, k) => {
        if (theirs[k].length >= counts[k] || !left.length) return;
        let best = 0;
        for (let j = 1; j < left.length; j++) if (dist(left[j], f.x, f.z) < dist(left[best], f.x, f.z)) best = j;
        theirs[k].push(left.splice(best, 1)[0]); busy = true;
      });
    }
    theirs.forEach((run, k) => { if (run.length) fill(run, run.length === p.count[k] ? p.each : run.length * GEWANN_HA, (j) => j % courses, k, h.farms[k]); });
  });
  return { fields: out, asked: hectares, laid };
}

/** Every spot a furlong can lie on within `reach` metres of a town's centre when its ground was not surveyed: the
 *  lots of the world graphic's grid as though the town's centre block were the world's block (0, 0). */
export function slotsAround(reach: number): Slot[] {
  const out: Slot[] = [], r = reach / METRES_PER_BLOCK;
  for (let lz = Math.floor(-r / FIELD_LOT.d) - 1; lz <= Math.ceil(r / FIELD_LOT.d); lz++) for (let lx = Math.floor(-r / FIELD_LOT.w) - 1; lx <= Math.ceil(r / FIELD_LOT.w); lx++) {
    const [bx, bz] = lotCorner(lx, lz);
    if (Math.hypot(bx + GEWANN.w / 2, bz + GEWANN.d / 2) <= r) out.push({ bx, bz });
  }
  return out;
}
