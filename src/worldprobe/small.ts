// A mesh's lists with small numbers, made where the mesh is built: 20 bytes to a corner where three lists of floats
// take 36. A piece of the world is 10 to 30 MB of such floats, which are handed to the page, sent to the graphics
// card and kept on disk; all three take as long as the lists are large.
//
//  - a corner's place stays three floats. (As steps of 16 bits it would take 8 bytes, not 12, but a piece reaches
//    over 230 blocks, which leaves steps of 1/256 of a block: tried, and where a house stands askew the corners that
//    lie on another triangle's edge came off it, and single dots of the wall behind showed through.)
//  - its direction as three bytes, 127 for one;
//  - its colour as three bytes of the share each part has of the brightest, and that brightest as a fourth, 254 for
//    two (colours go up to 1.7 where the sun lies on white); never 255, by which the stage tells such a colour from
//    one of three floats.
//
// Direction and colour have a fourth byte because the graphics card reads a corner's numbers in fours of bytes.
//
// Most of a piece is upright and level rectangles on the grid of blocks (measured on pieces of Paris: 86 to 90 of
// 100 triangles of the ground, all of what its columns carry). `faced` takes those out of the lists as faces
// (lookprobe/faces.ts), 32 bytes to a rectangle where its two triangles take 120; and, where asked, the upright and
// level rectangles that lie on no grid (most of what stands on a near piece) as faces of floats, 40 bytes each.
import { FACE_COL, FACE_GEO, FACE_STEPS, FLIPPED, FREE_GEO } from '../lookprobe/faces';
import type { Shape } from '../lookprobe/shape';
import { ballOf } from './ball';

/** the brightest colour that can be told */
export const BRIGHTEST = 2;

/** The lists of a mesh with small numbers for direction and colour (see above). */
export function small(b: { pos: ArrayLike<number>; nor: ArrayLike<number>; col: ArrayLike<number> }): Shape {
  const pos = new Float32Array(b.pos),
    n = pos.length / 3,
    nor = new Int8Array(n * 4),
    col = new Uint8Array(n * 4),
    turned = b.nor,
    tints = b.col;
  for (let v = 0, i = 0, o = 0; v < n; v++, i += 3, o += 4) {
    nor[o] = Math.round(turned[i] * 127);
    nor[o + 1] = Math.round(turned[i + 1] * 127);
    nor[o + 2] = Math.round(turned[i + 2] * 127);
    const r = Math.max(0, tints[i]),
      g = Math.max(0, tints[i + 1]),
      l = Math.max(0, tints[i + 2]);
    // the brightest part, rounded up so that the shares stay under one
    const most = Math.min(254, Math.ceil((Math.max(r, g, l) / BRIGHTEST) * 254)),
      k = most ? (255 * 254) / (most * BRIGHTEST) : 0;
    col[o] = Math.min(255, Math.round(r * k));
    col[o + 1] = Math.min(255, Math.round(g * k));
    col[o + 2] = Math.min(255, Math.round(l * k));
    col[o + 3] = most;
  }
  return { pos, nor, col, ball: ballOf(pos), small: true };
}

/**
 * The lists of a mesh with small numbers, and of those its rectangles on the grid as faces (see above): pairs of
 * triangles that follow each other, as `Batch.quad` makes them. What is left stays in the lists. `lift`: the grid
 * lies this many blocks higher, for a mesh whose heights are on no 64th of a block (the sea: its faces then tell the
 * stage to draw them that much higher). `free`: the upright and level rectangles that lie on no grid are taken out
 * of the lists too, as faces of floats (faces.ts `Free`); 'all': and those on the grid as such faces as well, for a
 * mesh the stage draws as one.
 */
export function faced(
  b: { pos: ArrayLike<number>; nor: ArrayLike<number>; col: ArrayLike<number> },
  lift = 0,
  free: boolean | 'all' = false,
): Shape {
  const all = small(b),
    pos = all.pos as Float32Array,
    nor = all.nor as Int8Array,
    col = all.col as Uint8Array,
    tris = pos.length / 9,
    most = Math.floor(tris / 2);
  const geo = new Int16Array(most * FACE_GEO),
    tones = new Uint8Array(most * FACE_COL),
    turned = new Int8Array(most * 4);
  const loose = free
    ? { geo: new Float32Array(most * FREE_GEO), col: new Uint8Array(most * FACE_COL), nor: new Int8Array(most * 4) }
    : null;
  /** the triangles that stay, by their first corner */
  const left: number[] = [];
  /** two corners are one: the same place and the same colour */
  const same = (i: number, j: number) =>
    pos[i * 3] === pos[j * 3] &&
    pos[i * 3 + 1] === pos[j * 3 + 1] &&
    pos[i * 3 + 2] === pos[j * 3 + 2] &&
    col[i * 4] === col[j * 4] &&
    col[i * 4 + 1] === col[j * 4 + 1] &&
    col[i * 4 + 2] === col[j * 4 + 2] &&
    col[i * 4 + 3] === col[j * 4 + 3];
  /** the four corners' places: in 64ths of a block, and as they are */
  const q = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    w = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  let faces = 0,
    frees = 0;
  for (let t = 0; t < tris; t++) {
    const i = t * 3,
      j = i + 3;
    face: {
      if (t + 1 >= tris) break face;
      // one direction for all six corners, along an axis
      const o = i * 4,
        axis = nor[o] ? 0 : nor[o + 1] ? 1 : 2;
      if (Math.abs(nor[o + axis]) !== 127 || nor[o + ((axis + 1) % 3)] || nor[o + ((axis + 2) % 3)]) break face;
      for (let k = 1; k < 6; k++)
        if (nor[o + k * 4] !== nor[o] || nor[o + k * 4 + 1] !== nor[o + 1] || nor[o + k * 4 + 2] !== nor[o + 2])
          break face;
      // the two triangles share their first corner and the diagonal: (a, b, c) and (a, c, d), in either order
      if (!same(i, j)) break face;
      const a = i;
      let bb: number, c: number, d: number;
      if (same(i + 2, j + 1)) {
        bb = i + 1;
        c = i + 2;
        d = j + 2;
      } else if (same(i + 1, j + 2)) {
        bb = j + 1;
        c = j + 2;
        d = i + 2;
      } else break face;
      // all four on the grid of 64ths, or where their floats put them; on one level across the axis
      const u = axis === 0 ? 1 : 0,
        v = axis === 2 ? 1 : 2,
        four = [a, bb, c, d];
      let grid = free !== 'all';
      for (let k = 0; k < 4; k++)
        for (let m = 0; m < 3; m++) {
          let n = (w[k * 3 + m] = pos[four[k] * 3 + m]) * FACE_STEPS;
          // (a height on the lifted grid: the lift is no float of 32 bits, so the height is whole but for the last bits)
          if (lift && m === 1) {
            n -= lift * FACE_STEPS;
            if (Math.abs(n - Math.round(n)) < 1e-3) n = Math.round(n);
          }
          if (!Number.isInteger(n) || Math.abs(n) > 32767) grid = false;
          q[k * 3 + m] = n;
        }
      if (!grid && (!loose || lift)) break face;
      const p = grid ? q : w;
      if (p[3 + axis] !== p[axis] || p[6 + axis] !== p[axis] || p[9 + axis] !== p[axis]) break face;
      // a rectangle along the two other axes: b lies along u from a, or along v
      const ua = p[u],
        va = p[v],
        ub = p[3 + u],
        vb = p[3 + v],
        uc = p[6 + u],
        vc = p[6 + v],
        ud = p[9 + u],
        vd = p[9 + v];
      if (ua === uc || va === vc) break face;
      const flipped = ub === ua;
      if (flipped ? !(vb === vc && ud === uc && vd === va) : !(ub === uc && vb === va && ud === ua && vd === vc))
        break face;
      // the colours of the corners at (u0, v0), (u1, v0), (u1, v1), (u0, v1)
      const round = flipped ? [a, d, c, bb] : four,
        into = grid ? tones : loose!.col,
        at = grid ? faces : frees;
      for (let k = 0; k < 4; k++) for (let m = 0; m < 4; m++) into[at * FACE_COL + k * 4 + m] = col[round[k] * 4 + m];
      if (grid) {
        geo.set([axis + (flipped ? FLIPPED : 0), p[axis], ua, uc, va, vc], faces * FACE_GEO);
        for (let m = 0; m < 4; m++) turned[faces * 4 + m] = nor[o + m];
        faces++;
      } else {
        loose!.geo.set([p[axis], ua, uc, va, vc], frees * FREE_GEO);
        for (let m = 0; m < 3; m++) loose!.nor[frees * 4 + m] = nor[o + m];
        loose!.nor[frees * 4 + 3] = flipped ? 1 : 0;
        frees++;
      }
      t++;
      continue;
    }
    left.push(i);
  }
  if (!faces && !frees) return all;
  const n = left.length * 3,
    rest: Shape = {
      pos: new Float32Array(n * 3),
      nor: new Int8Array(n * 4),
      col: new Uint8Array(n * 4),
      ball: all.ball,
      small: true,
    };
  left.forEach((i, k) => {
    (rest.pos as Float32Array).set(pos.subarray(i * 3, i * 3 + 9), k * 9);
    (rest.nor as Int8Array).set(nor.subarray(i * 4, i * 4 + 12), k * 12);
    (rest.col as Uint8Array).set(col.subarray(i * 4, i * 4 + 12), k * 12);
  });
  // (lists of their own, as long as the faces are many: they are handed over and kept on disk)
  if (faces)
    rest.faces = {
      geo: geo.slice(0, faces * FACE_GEO),
      col: tones.slice(0, faces * FACE_COL),
      nor: turned.slice(0, faces * 4),
      ...(lift ? { lift } : {}),
    };
  if (frees)
    rest.free = {
      geo: loose!.geo.slice(0, frees * FREE_GEO),
      col: loose!.col.slice(0, frees * FACE_COL),
      nor: loose!.nor.slice(0, frees * 4),
    };
  return rest;
}

/** The lists of a mesh as floats, three to a corner. */
export function flat(b: { pos: ArrayLike<number>; nor: ArrayLike<number>; col: ArrayLike<number> }): Shape {
  const pos = new Float32Array(b.pos);
  return { pos, nor: new Float32Array(b.nor), col: new Float32Array(b.col), ball: ballOf(pos) };
}

/** A corner of small lists as the stage shows it: direction and colour (for the tests). */
export function cornerOf(s: Shape, v: number): { nor: number[]; col: number[] } {
  const o = v * 4,
    most = (s.col[o + 3] / 254) * BRIGHTEST;
  return {
    nor: [0, 1, 2].map((k) => Math.max(-1, s.nor[o + k] / 127)),
    col: [0, 1, 2].map((k) => (s.col[o + k] / 255) * most),
  };
}
