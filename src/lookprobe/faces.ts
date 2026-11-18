// A mesh's rectangles as faces. Most of the world is upright and level rectangles on the grid of blocks: the tops
// and sides of the ground's columns, the blocks of woods and far towns. As triangles such a rectangle is six corners
// of 20 bytes (worldprobe/small.ts); as a face it is 32 bytes, from which the stage makes the six corners on the
// graphics card (stage.ts):
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
}

/** a block is this many steps of a face's numbers; a face reaches no farther than 511 blocks from its mesh's own beginning */
export const FACE_STEPS = 64;
/** numbers to a face of where it lies, and bytes of its colours */
export const FACE_GEO = 6, FACE_COL = 16;
/** added to a face's first number where its triangles turn the other way: their second corner lies along v from their first, not along u */
export const FLIPPED = 4;
/** the corners of a face's two triangles: which of the face's four each is; the second row where FLIPPED */
export const FACE_CORNERS = [[0, 1, 2, 0, 2, 3], [0, 3, 2, 0, 2, 1]] as const;

/** The faces as the triangles the stage draws of them, in small lists (for the tests). */
export function unfaced(f: Faces): { pos: Float32Array; nor: Int8Array; col: Uint8Array } {
  const n = f.geo.length / FACE_GEO, pos = new Float32Array(n * 18), nor = new Int8Array(n * 24), col = new Uint8Array(n * 24);
  for (let k = 0; k < n; k++) {
    const g = k * FACE_GEO, axis = f.geo[g] % FLIPPED, corners = FACE_CORNERS[f.geo[g] >= FLIPPED ? 1 : 0], level = f.geo[g + 1] / FACE_STEPS;
    for (let c = 0; c < 6; c++) {
      const at = corners[c], a = f.geo[g + (at === 1 || at === 2 ? 3 : 2)] / FACE_STEPS, b = f.geo[g + (at >= 2 ? 5 : 4)] / FACE_STEPS, o = (k * 6 + c) * 3, p = (k * 6 + c) * 4;
      pos[o] = axis === 0 ? level : a; pos[o + 1] = axis === 0 ? a : axis === 1 ? level : b; pos[o + 2] = axis === 2 ? level : b;
      for (let m = 0; m < 4; m++) { nor[p + m] = f.nor[k * 4 + m]; col[p + m] = f.col[k * FACE_COL + at * 4 + m]; }
    }
  }
  return { pos, nor, col };
}

/**
 * How far along a ray the first face lies that the ray meets from its front, in lengths of `along`; none where it
 * meets no face. `from` and `along` in the mesh's own blocks.
 */
export function faceHit(f: Faces, from: ArrayLike<number>, along: ArrayLike<number>): number | null {
  let first = Infinity;
  for (let k = 0, g = 0; g < f.geo.length; k++, g += FACE_GEO) {
    const axis = f.geo[g] % FLIPPED, way = along[axis];
    if (way * f.nor[k * 4 + axis] >= 0) continue;
    const t = (f.geo[g + 1] / FACE_STEPS - from[axis]) / way;
    if (t <= 0 || t >= first) continue;
    const u = axis === 0 ? 1 : 0, v = axis === 2 ? 1 : 2, a = (from[u] + t * along[u]) * FACE_STEPS, b = (from[v] + t * along[v]) * FACE_STEPS;
    if (a < Math.min(f.geo[g + 2], f.geo[g + 3]) || a > Math.max(f.geo[g + 2], f.geo[g + 3]) || b < Math.min(f.geo[g + 4], f.geo[g + 5]) || b > Math.max(f.geo[g + 4], f.geo[g + 5])) continue;
    first = t;
  }
  return first < Infinity ? first : null;
}
