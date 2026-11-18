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
import type { Shape } from '../lookprobe/stage';
import { ballOf } from './ball';

/** the brightest colour that can be told */
export const BRIGHTEST = 2;

/** The lists of a mesh with small numbers for direction and colour (see above). */
export function small(b: { pos: ArrayLike<number>; nor: ArrayLike<number>; col: ArrayLike<number> }): Shape {
  const pos = new Float32Array(b.pos), n = pos.length / 3, nor = new Int8Array(n * 4), col = new Uint8Array(n * 4);
  for (let v = 0, i = 0, o = 0; v < n; v++, i += 3, o += 4) {
    nor[o] = Math.round(b.nor[i] * 127); nor[o + 1] = Math.round(b.nor[i + 1] * 127); nor[o + 2] = Math.round(b.nor[i + 2] * 127);
    const r = Math.max(0, b.col[i]), g = Math.max(0, b.col[i + 1]), l = Math.max(0, b.col[i + 2]);
    // the brightest part, rounded up so that the shares stay under one
    const most = Math.min(254, Math.ceil((Math.max(r, g, l) / BRIGHTEST) * 254)), k = most ? (255 * 254) / (most * BRIGHTEST) : 0;
    col[o] = Math.min(255, Math.round(r * k)); col[o + 1] = Math.min(255, Math.round(g * k)); col[o + 2] = Math.min(255, Math.round(l * k)); col[o + 3] = most;
  }
  return { pos, nor, col, ball: ballOf(pos), small: true };
}

/** The lists of a mesh as floats, three to a corner. */
export function flat(b: { pos: ArrayLike<number>; nor: ArrayLike<number>; col: ArrayLike<number> }): Shape {
  const pos = new Float32Array(b.pos);
  return { pos, nor: new Float32Array(b.nor), col: new Float32Array(b.col), ball: ballOf(pos) };
}

/** A corner of small lists as the stage shows it: direction and colour (for the tests). */
export function cornerOf(s: Shape, v: number): { nor: number[]; col: number[] } {
  const o = v * 4, most = (s.col[o + 3] / 254) * BRIGHTEST;
  return { nor: [0, 1, 2].map((k) => Math.max(-1, s.nor[o + k] / 127)), col: [0, 1, 2].map((k) => (s.col[o + k] / 255) * most) };
}
