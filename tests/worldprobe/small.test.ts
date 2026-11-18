import { describe, expect, it } from 'vitest';
import { cornerOf, small } from '../../src/worldprobe/small';

/** a list of corners: places within a piece of the world, directions of length one, colours up to `bright` */
function corners(n: number, bright: number) {
  let seed = 7;
  const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  for (let v = 0; v < n; v++) {
    pos.push(98 + next() * 225, 2 + next() * 30, 98 + next() * 204);
    const axis = v % 4 !== 0, d = axis ? [[1, 0, 0], [0, -1, 0], [0, 0, 1]][v % 3] : [next() - 0.5, next() - 0.5, next() - 0.5], l = Math.hypot(d[0], d[1], d[2]);
    nor.push(d[0] / l, d[1] / l, d[2] / l);
    const dim = v % 5 === 0 ? 0.03 : 1;
    col.push(next() * bright * dim, next() * bright * dim, next() * bright * dim);
  }
  return { pos, nor, col };
}

describe('small', () => {
  it('takes 20 bytes to a corner and leaves its place as it is', () => {
    const b = corners(300, 1), s = small(b);
    expect((s.pos as Float32Array).byteLength + (s.nor as Int8Array).byteLength + (s.col as Uint8Array).byteLength).toBe(300 * 20);
    expect(Array.from(s.pos)).toEqual(Array.from(new Float32Array(b.pos)));
  });

  it('keeps a direction within a 254th and a colour within a 510th of its brightest part', () => {
    const b = corners(3000, 1.7), s = small(b);
    for (let v = 0; v < 3000; v++) {
      const c = cornerOf(s, v), most = Math.max(b.col[v * 3], b.col[v * 3 + 1], b.col[v * 3 + 2]);
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(c.nor[k] - b.nor[v * 3 + k])).toBeLessThanOrEqual(0.5 / 127 + 1e-9);
        // (the brightest part is rounded up by a 127th at most)
        expect(Math.abs(c.col[k] - b.col[v * 3 + k])).toBeLessThanOrEqual((most + 2 / 254) * (0.5 / 255) + 1e-9);
      }
    }
  });

  it('keeps the directions along the axes as they are', () => {
    const b = corners(600, 1), s = small(b);
    for (let v = 0; v < 600; v++) if (v % 4 !== 0) expect(cornerOf(s, v).nor.map((x) => x + 0)).toEqual(b.nor.slice(v * 3, v * 3 + 3).map((x) => x + 0));
  });

  it('never gives a colour the mark of a colour of floats', () => {
    const s = small({ pos: [0, 0, 0, 1, 0, 0, 0, 0, 1], nor: [0, 1, 0, 0, 1, 0, 0, 1, 0], col: [5, 5, 5, 2, 2, 2, 0, 0, 0] });
    expect([s.col[3], s.col[7], s.col[11]]).toEqual([254, 254, 0]);
    expect(cornerOf(s, 1).col).toEqual([2, 2, 2]);
    expect(cornerOf(s, 2).col).toEqual([0, 0, 0]);
  });
});
