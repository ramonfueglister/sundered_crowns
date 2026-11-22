// The fields of a far piece (far.ts `coverLand`): the lots of the finest step in the colours of their crops, or the
// furlongs of the land register.
import { type RGB, hash2, shade } from '../lookprobe/batch';
import { OATS, OATS_SIDE, VINE_BODY, WHEAT, WHEAT_SIDE } from '../lookprobe/blocks';
import { Mat, N, idx, inGrid } from '../lookprobe/layout';
import { FALLOW_SHOWS, SOIL_FALLOW } from '../lookprobe/terrain_colours';
import { CROP } from '../sim/settlement/fields';
import { CROPS_AT, FALLOW_FIELD, OATS_FIELD, VINE_FIELD, WHEAT_FIELD, furlongOf } from './crops';
import type { Laying } from './far_lay';
import { SEEN_FALLOW, SEEN_SPRING, SEEN_VINES, SEEN_WINTER, VINEYARD, field, tinted } from './field_colours';
import { FAR_LOOK, seasonCode, sow, sowingOf } from './season_codes';
import { FALLOW, FIELD_GROUND, SPRING, blockOf, courseOf } from './settle';

/** fields at the finest step lie in lots of eleven by eight blocks (settle.ts) */
const LOT_W = 11,
  LOT_D = 8;
/**
 * The lots are those of the finest step (settle.ts), at the same places of the world at every step: rows of LOT_D
 * finest blocks, every other row set off by half a lot. A block of the step belongs to the lot its middle lies in.
 * From afar a lot is all field: the fields of a landscape lie together as one ground of many colours, without the
 * balks between them (which made of them a pattern of bricks) and without the farmhouses at their corners. Up to
 * the step LOTS_UNTIL a lot is larger than a block; beyond it the lots are drawn twice as large with every step.
 */
const LOTS_UNTIL = 2;
/** every step's ground is built flatter than the step before by this much (world.ts `flatter`): a block of height stands for this many times the metres */
const FLATTER = 2 ** 0.6;
/** Where a point of the world (in finest blocks) lies among the lots: the lot and how far its row is set off. */
function spotOf(fx: number, fz: number) {
  const lz = Math.floor(fz / LOT_D),
    shift = lz & 1 ? Math.floor(LOT_W / 2) : 0,
    lx = Math.floor((fx - shift) / LOT_W);
  return { lx, lz, shift };
}
/** The fields on a far piece's free ground. */
export function layFields(l: Laying) {
  const { g, step, o, c, wider, ox, oz, taken, walls, free, put, pick } = l;
  // fields: the lots of the finest step, as large as they are, each all field and flat, in the colour of its crop.
  // A field that lies fallow is the grass with its stubble showing through, one under spring corn is green.
  // Farther out than LOTS_UNTIL a block is as large as a lot and then larger. The fields are drawn as before all the
  // same: in patches of some three blocks by two, each of one crop, a patch for the lots that lie under it. So the
  // ploughed land looks from every distance as it does from the middle one, and only shows less of itself.
  const grown = 2 ** Math.max(0, step - LOTS_UNTIL),
    salt = grown > 1 ? 7 * step : 0;
  const courses = (x: number, z: number) => o.courses?.(x, z) ?? 1;
  // what each field column carries by the season (season_codes.ts): the field's code and its own number; a field laid
  // in the colour of its crop shows that colour from afar, one with its sheaves its soil and sheaves
  const season = new Uint8Array(N * N * 2),
    sown = (x: number, z: number, kind: number, tilled: number, sowing: number, far = true) =>
      sow(season, idx(x, z), seasonCode(o.farmYear?.(x, z) ?? 0, kind, tilled) + (far ? FAR_LOOK : 0), sowing);
  c.season = season;
  const springOf = (lx: number, lz: number): [RGB, RGB] => [
    tinted(field(pick(OATS, hash2(lx, lz, 68 + salt)), true, OATS_SIDE), SEEN_SPRING),
    OATS_SIDE,
  ];
  const cropOf = (lx: number, lz: number, mx: number, mz: number): [RGB, RGB] =>
    hash2(lx, lz, 67 + salt) < o.vines(mx, mz)
      ? [tinted(VINEYARD, SEEN_VINES), shade(VINE_BODY, 0.8)]
      : [tinted(field(pick(WHEAT, hash2(lx, lz, 68 + salt)), true), SEEN_WINTER), WHEAT_SIDE];
  // the lots, their crops and their courses are those of the finest step (settle.ts: the same lot, the same lots
  // drawn by the same numbers), so that a field stays the field it is from step to step
  // And a lot is a field only where the finest step finds room for one (settle.ts `lot`): all of it, with a balk's
  // width round it, is dry ground without rock on which nothing is built, and it is level to within two blocks of
  // the finest step. In hill country most lots are not, and the land stays grass.
  const built = Uint8Array.from(c.has, (has, i) =>
      has || c.town[i] || taken[i] || g.wet[i] || g.mat[i] === Mat.Rock ? 1 : 0,
    ),
    slack = Math.floor(2 / FLATTER ** step),
    rooms = new Map<number, boolean>();
  const room = (lx: number, lz: number, shift: number) => {
    const key = (lx + 32768) * 65536 + lz + 32768,
      known = rooms.get(key);
    if (known !== undefined) return known;
    const x0 = Math.floor(((lx * LOT_W + shift) * grown) / wider) - ox,
      x1 = Math.floor(((lx * LOT_W + shift + LOT_W + 1) * grown - 1) / wider) - ox,
      z0 = Math.floor((lz * LOT_D * grown) / wider) - oz,
      z1 = Math.floor(((lz * LOT_D + LOT_D + 1) * grown - 1) / wider) - oz;
    // the lot with the balk round it, in finest world blocks
    const fx0 = (lx * LOT_W + shift) * grown,
      fx1 = fx0 + (LOT_W + 1) * grown,
      fz0 = lz * LOT_D * grown,
      fz1 = fz0 + (LOT_D + 1) * grown;
    let lo = Infinity,
      hi = -Infinity,
      fits = true;
    for (let k = 0; k < walls.length && fits; k += 4)
      if (fx0 < walls[k + 2] && walls[k] < fx1 && fz0 < walls[k + 3] && walls[k + 1] < fz1) fits = false;
    for (let z = z0; z <= z1 && fits; z++)
      for (let x = x0; x <= x1; x++) {
        if (!inGrid(x, z)) continue;
        if (built[idx(x, z)]) {
          fits = false;
          break;
        }
        lo = Math.min(lo, g.h[idx(x, z)]);
        hi = Math.max(hi, g.h[idx(x, z)]);
      }
    fits &&= hi - lo <= slack;
    rooms.set(key, fits);
    return fits;
  };
  // at the first far step a field is the finest step's: its soil, and its sheaves or its vines standing on it (crops.ts
  // draws them from the crop laid down here, and with the land register from the furlong's strips and rows)
  const lay = (x: number, z: number, crop: number, furlong: number) => {
    const i = idx(x, z);
    g.mat[i] = Mat.Soil;
    taken[i] = 1;
    c.kind![i] = crop === FALLOW_FIELD ? 4 : crop === OATS_FIELD ? 5 : crop === VINE_FIELD ? 7 : 6;
    c.crops ??= new Uint8Array(N * N);
    c.crops[i] = crop;
    if (!furlong) return;
    c.furlongs ??= new Uint8Array(N * N);
    c.furlongs[i] = furlong;
  };
  // with the land register's fields: a block is field where its middle lies on a furlong of the register (from the
  // second far step on, where a block is half a lot and more, anywhere on its lot), in the colour of its course's crop;
  // at the first far step where a block of it lies on the furlong (crops.ts `cropAt` gives each block its own)
  if (o.field)
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        if (!free(x, z)) continue;
        const px = (x + ox + 0.5) * wider,
          pz = (z + oz + 0.5) * wider,
          { lx, lz, shift } = spotOf(px, pz),
          f = o.field(lx, lz);
        if (!f) continue;
        const mx = ((lx + 0.5) * LOT_W + shift) / wider - ox,
          mz = ((lz + 0.5) * LOT_D) / wider - oz;
        const vines = f.crop === CROP.winter && hash2(lx, lz, 67) < o.vines(mx, mz),
          kind = f.crop === CROP.fallow ? FALLOW : f.crop === CROP.spring ? SPRING : vines ? 2 : 1;
        if (step === CROPS_AT) {
          // the middle of the column is the corner of its four blocks: the block after it must lie on the field, and
          // the block before it in z within the furlong's rows (settle.ts: `rows` deep from the balk)
          if (px - (lx * LOT_W + shift) < 1 || pz - lz * LOT_D - 2 >= f.rows) continue;
          const crop = f.crop === CROP.fallow ? FALLOW_FIELD : f.crop === CROP.spring ? OATS_FIELD : WHEAT_FIELD;
          lay(x, z, vines ? VINE_FIELD : crop, furlongOf(f.strips, f.rows));
          sown(x, z, kind, f.courses, sowingOf(lx, lz), false);
          continue;
        }
        if (f.crop === CROP.fallow) {
          put(x, z, 0, tinted(SOIL_FALLOW, SEEN_FALLOW), SOIL_FALLOW, 4);
          c.share[idx(x, z)] = FALLOW_SHOWS;
          sown(x, z, kind, f.courses, sowingOf(lx, lz));
          continue;
        }
        sown(x, z, kind, f.courses, sowingOf(lx, lz));
        put(
          x,
          z,
          0,
          ...(f.crop === CROP.spring ? springOf(lx, lz) : cropOf(lx, lz, mx, mz)),
          f.crop === CROP.spring ? 5 : vines ? 7 : 6,
        );
      }
  else
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        if (!free(x, z)) continue;
        const { lx, lz, shift } = spotOf(((x + ox + 0.5) * wider) / grown, ((z + oz + 0.5) * wider) / grown);
        const fx = ((lx + 0.5) * LOT_W + shift) * grown,
          fz = (lz + 0.5) * LOT_D * grown,
          mx = fx / wider - ox,
          mz = fz / wider - oz;
        // a lot is a field here if it is one at the finest step (settle.ts draws the same number against the same share)
        if (hash2(lx, lz, 65 + salt) > o.ploughed(mx, mz) / FIELD_GROUND || !room(lx, lz, shift)) continue;
        // the course of the block of fields the lot lies in, the same as at the finest step (settle.ts)
        const course = courseOf(courses(mx, mz), hash2(...blockOf(fx / grown, fz / grown), 66 + salt));
        const vines = course !== SPRING && course !== FALLOW && hash2(lx, lz, 67 + salt) < o.vines(mx, mz),
          sowing = sowingOf(lx, lz, salt);
        // (the courses go by the numbers of their crops, as settle.ts lays them down on the finest step's fields)
        if (step === CROPS_AT) {
          lay(x, z, vines ? VINE_FIELD : course, 0);
          sown(x, z, vines ? 2 : course, courses(mx, mz), sowing, false);
          continue;
        }
        sown(x, z, vines ? 2 : course, courses(mx, mz), sowing);
        if (course === FALLOW) {
          put(x, z, 0, tinted(SOIL_FALLOW, SEEN_FALLOW), SOIL_FALLOW, 4);
          c.share[idx(x, z)] = FALLOW_SHOWS;
          continue;
        }
        put(
          x,
          z,
          0,
          ...(course === SPRING ? springOf(lx, lz) : cropOf(lx, lz, mx, mz)),
          course === SPRING ? 5 : vines ? 7 : 6,
        );
      }
}
