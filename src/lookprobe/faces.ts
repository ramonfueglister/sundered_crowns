// A mesh's rectangles as faces. Most of the world is upright and level rectangles on the grid of blocks: the tops
// and sides of the ground's columns, the blocks of woods and far towns. As triangles such a rectangle is six corners
// of 20 bytes (worldprobe/small.ts); as a face it is 32 bytes, from which the stage makes its four corners on the
// graphics card (stage/materials.ts):
//
//  - where it lies, six numbers of 16 bits in 64ths of a block: the axis it faces along (0 x, 1 y, 2 z; and FLIPPED
//    more where its triangles turn the other way), its level on that axis, and its two spans u0, u1 and v0, v1 along
//    the two other axes in their order (a span may run backwards: the face's first corner is at u0, v0);
//  - the colours of its four corners, at (u0, v0), (u1, v0), (u1, v1), (u0, v1), four bytes each as small.ts has them;
//  - its direction, four bytes as small.ts has it.
//
// The two triangles are the face's corners 0, 1, 2 and 0, 2, 3, or 0, 3, 2 and 0, 2, 1 where FLIPPED: so the stage
// draws the very triangles the builder made, corner for corner, and the picture is the same to the dot.

/** The faces of a mesh, one after the other in each list. */
export interface Faces {
  /** where each lies: FACE_GEO numbers */
  geo: Int16Array;
  /** the colours of its four corners: FACE_COL bytes */
  col: Uint8Array;
  /** its direction: four bytes */
  nor: Int8Array;
  /**
   * Of a mesh that glides to the shape of the next coarser step (worldprobe/glide.ts): where each face ends up, two
   * numbers in 64ths of a block. A level face's first is its level there; an upright face's two are the ends of its
   * span in height there, in the span's order. A face that does not glide has its own numbers here.
   */
  aim?: Int16Array;
  /** and the colours of its four corners there, as `col` has them; the fourth byte of its direction is then 127 where the face ends up as ground to the map's paper */
  aimCol?: Uint8Array;
  /**
   * The faces lie this many blocks above where their numbers put them: for the sea, whose level is on no 64th of a
   * block (worldprobe/small.ts `faced`).
   */
  lift?: number;
}

/**
 * A mesh's rectangles that lie on no grid. What stands on a near piece (houses, walls, trees, fences) is upright and
 * level rectangles as well, but their corners are where the builder's floats put them (measured on pieces of Paris:
 * 77 to 90 of 100 triangles of what stands there, none of them on the 64ths of a block). Such a face is 40 bytes:
 * five floats of where it lies, and colours and direction as a face on the grid has them. The stage hands each corner
 * the very floats the builder made, so here too the picture is the same to the dot.
 */
export interface Free {
  /** where each lies, FREE_GEO floats: its level on the axis it faces along, and its two spans u0, u1 and v0, v1 along the two other axes in their order */
  geo: Float32Array;
  /** the colours of its four corners: FACE_COL bytes, as a face on the grid has them */
  col: Uint8Array;
  /** its direction, three bytes, which tell its axis; and a fourth, 1 where its triangles turn the other way (as FLIPPED) */
  nor: Int8Array;
}

/**
 * The level tops of a mesh's columns, joined where columns of one height lie side by side (worldprobe/tops.ts): a
 * face of these may span many columns, so its colour is not that of its four corners. Each column keeps the colours
 * of its own four corners in the field, a square of FIELD_SIDE × FIELD_SIDE colours (four bytes each, as a face's
 * colours are) that holds two by two of them to each column of the FIELD_COLUMNS × FIELD_COLUMNS from (x0, z0); the
 * stage reads them where it draws a dot of such a face, and mixes them across the column as the two triangles of its
 * own face did. A face of these has no colours of its own.
 */
export interface Field {
  /** where each lies, FACE_GEO numbers as `Faces.geo` */
  geo: Int16Array;
  /** its direction, four bytes */
  nor: Int8Array;
  /** the colours of the columns' corners, FIELD_SIDE² × 4 bytes: the corner (u0, v0) of the column (x, z) at (2 (x − x0), 2 (z − z0)), (u1, v0) one to the right of that, (u0, v1) one below it */
  tones: Uint8Array;
  /** the first column the field holds, in the mesh's own blocks */
  x0: number; z0: number;
}
/** the columns a field holds along each side: those of a piece of the world (worldprobe/pieces.ts PIECE) */
export const FIELD_COLUMNS = 200;
/** and its colours along each side, two to a column */
export const FIELD_SIDE = FIELD_COLUMNS * 2;

/** a block is this many steps of a face's numbers; a face reaches no farther than 511 blocks from its mesh's own beginning */
export const FACE_STEPS = 64;
/** numbers to a face of where it lies, and bytes of its colours */
export const FACE_GEO = 6, FACE_COL = 16;
/** floats to a face on no grid of where it lies */
export const FREE_GEO = 5;
/** added to a face's first number where its triangles turn the other way: their second corner lies along v from their first, not along u */
export const FLIPPED = 4;
/**
 * added to the first number of an upright face that has no height yet and gains it in a glide: its span in height
 * runs upwards (a face with a height shows by its numbers which way its span runs, and has none again where a glide
 * would turn it over)
 */
export const RISES = 8;
/** the corners of a face's two triangles: which of the face's four each is; the second row where FLIPPED */
export const FACE_CORNERS = [[0, 1, 2, 0, 2, 3], [0, 3, 2, 0, 2, 1]] as const;

/**
 * Where a face lies at a share of its glide (0 … 1), as the stage moves it (stage/materials.ts `gliding`), in 64ths of a block:
 * a level face's level; an upright face's two ends of its span in height, in the span's order. The far end never
 * passes the near one: a side whose columns end up the other way round has no height there.
 */
export function glided(f: Faces, k: number, share: number): [number, number] {
  const g = k * FACE_GEO, kind = f.geo[g], axis = kind % FLIPPED;
  if (axis === 1) return [f.aim ? f.geo[g + 1] + (f.aim[k * 2] - f.geo[g + 1]) * share : f.geo[g + 1], 0];
  const lo = axis === 0 ? 2 : 4, from0 = f.geo[g + lo], from1 = f.geo[g + lo + 1];
  if (!f.aim) return [from0, from1];
  const end0 = from0 + (f.aim[k * 2] - from0) * share, way = kind >= RISES || from1 >= from0 ? 1 : -1;
  return [end0, end0 + way * Math.max(way * (from1 + (f.aim[k * 2 + 1] - from1) * share - end0), 0)];
}

/** The faces as the triangles the stage draws of them, in small lists (for the tests). */
export function unfaced(f: Faces): { pos: Float32Array; nor: Int8Array; col: Uint8Array } {
  const n = f.geo.length / FACE_GEO, pos = new Float32Array(n * 18), nor = new Int8Array(n * 24), col = new Uint8Array(n * 24);
  for (let k = 0; k < n; k++) {
    const g = k * FACE_GEO, axis = f.geo[g] % FLIPPED, corners = FACE_CORNERS[f.geo[g] & FLIPPED ? 1 : 0], level = f.geo[g + 1] / FACE_STEPS;
    for (let c = 0; c < 6; c++) {
      const at = corners[c], a = f.geo[g + (at === 1 || at === 2 ? 3 : 2)] / FACE_STEPS, b = f.geo[g + (at >= 2 ? 5 : 4)] / FACE_STEPS, o = (k * 6 + c) * 3, p = (k * 6 + c) * 4;
      pos[o] = axis === 0 ? level : a; pos[o + 1] = (axis === 0 ? a : axis === 1 ? level : b) + (f.lift ?? 0); pos[o + 2] = axis === 2 ? level : b;
      for (let m = 0; m < 4; m++) { nor[p + m] = f.nor[k * 4 + m]; col[p + m] = f.col[k * FACE_COL + at * 4 + m]; }
    }
  }
  return { pos, nor, col };
}

/** The axis a face on no grid faces along, by its direction. */
export const freeAxis = (f: Free, k: number) => (f.nor[k * 4] ? 0 : f.nor[k * 4 + 1] ? 1 : 2);

/** The faces on no grid as the triangles the stage draws of them, in small lists (for the tests). */
export function unfree(f: Free): { pos: Float32Array; nor: Int8Array; col: Uint8Array } {
  const n = f.geo.length / FREE_GEO, pos = new Float32Array(n * 18), nor = new Int8Array(n * 24), col = new Uint8Array(n * 24);
  for (let k = 0; k < n; k++) {
    const g = k * FREE_GEO, axis = freeAxis(f, k), corners = FACE_CORNERS[f.nor[k * 4 + 3] ? 1 : 0], level = f.geo[g];
    for (let c = 0; c < 6; c++) {
      const at = corners[c], a = f.geo[g + (at === 1 || at === 2 ? 2 : 1)], b = f.geo[g + (at >= 2 ? 4 : 3)], o = (k * 6 + c) * 3, p = (k * 6 + c) * 4;
      pos[o] = axis === 0 ? level : a; pos[o + 1] = axis === 0 ? a : axis === 1 ? level : b; pos[o + 2] = axis === 2 ? level : b;
      for (let m = 0; m < 3; m++) nor[p + m] = f.nor[k * 4 + m];
      for (let m = 0; m < 4; m++) col[p + m] = f.col[k * FACE_COL + at * 4 + m];
    }
  }
  return { pos, nor, col };
}

/** How far along a ray the first face on no grid lies that the ray meets from its front, as `faceHit` tells it of faces on the grid. */
export function freeHit(f: Free, from: ArrayLike<number>, along: ArrayLike<number>): number | null {
  let first = Infinity;
  for (let k = 0, g = 0; g < f.geo.length; k++, g += FREE_GEO) {
    const axis = freeAxis(f, k), way = along[axis];
    if (way * f.nor[k * 4 + axis] >= 0) continue;
    const t = (f.geo[g] - from[axis]) / way;
    if (t <= 0 || t >= first) continue;
    const u = axis === 0 ? 1 : 0, v = axis === 2 ? 1 : 2, a = from[u] + t * along[u], b = from[v] + t * along[v];
    if (a < Math.min(f.geo[g + 1], f.geo[g + 2]) || a > Math.max(f.geo[g + 1], f.geo[g + 2]) || b < Math.min(f.geo[g + 3], f.geo[g + 4]) || b > Math.max(f.geo[g + 3], f.geo[g + 4])) continue;
    first = t;
  }
  return first < Infinity ? first : null;
}

/**
 * How far along a ray the first face lies that the ray meets from its front, in lengths of `along`; none where it
 * meets no face. `from` and `along` in the mesh's own blocks.
 */
export function faceHit(f: Pick<Faces, 'geo' | 'nor' | 'lift'>, from: ArrayLike<number>, along: ArrayLike<number>): number | null {
  // (the ray among the faces as their numbers put them)
  const start = [from[0], from[1] - (f.lift ?? 0), from[2]];
  let first = Infinity;
  for (let k = 0, g = 0; g < f.geo.length; k++, g += FACE_GEO) {
    const axis = f.geo[g] % FLIPPED, way = along[axis];
    if (way * f.nor[k * 4 + axis] >= 0) continue;
    const t = (f.geo[g + 1] / FACE_STEPS - start[axis]) / way;
    if (t <= 0 || t >= first) continue;
    const u = axis === 0 ? 1 : 0, v = axis === 2 ? 1 : 2, a = (start[u] + t * along[u]) * FACE_STEPS, b = (start[v] + t * along[v]) * FACE_STEPS;
    if (a < Math.min(f.geo[g + 2], f.geo[g + 3]) || a > Math.max(f.geo[g + 2], f.geo[g + 3]) || b < Math.min(f.geo[g + 4], f.geo[g + 5]) || b > Math.max(f.geo[g + 4], f.geo[g + 5])) continue;
    first = t;
  }
  return first < Infinity ? first : null;
}
