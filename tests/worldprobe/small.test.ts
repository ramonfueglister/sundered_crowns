import { describe, expect, it } from 'vitest';
import { Batch } from '../../src/lookprobe/batch';
import { FACE_GEO, FREE_GEO, faceHit, freeHit, unfaced, unfree } from '../../src/lookprobe/faces';
import { cornerOf, faced, small } from '../../src/worldprobe/small';

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

/** the triangles of small lists, each as a word of its three corners in their order, sorted */
function triangles(...lists: { pos: ArrayLike<number>; nor: ArrayLike<number>; col: ArrayLike<number> }[]): string[] {
  const words: string[] = [];
  for (const s of lists) for (let t = 0; t < s.pos.length / 9; t++) words.push([...Array.from(s.pos).slice(t * 9, t * 9 + 9), '|', ...Array.from(s.nor).slice(t * 12, t * 12 + 12), '|', ...Array.from(s.col).slice(t * 12, t * 12 + 12)].join(' '));
  return words.sort();
}

describe('faced', () => {
  /** blocks and steps as the ground and the woods are made of, and what is not on the grid */
  const mixed = () => {
    const b = new Batch();
    // blocks on the grid, with darker feet and a top of their own
    b.box(100, 3, 100, 101, 5, 101, [0.4, 0.5, 0.2], { top: [0.5, 0.6, 0.3], foot: 0.7, bottom: true, away: [0.2, 0.3, 0.3] });
    b.box(101.5, 3, 100, 102, 4.25, 100.5, [0.6, 0.6, 0.6], { foot: 0.8 });
    // a level top with a colour to each corner, turned both ways round and split along either diagonal
    const four = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6], [0.7, 0.8, 0.9], [1.2, 1.1, 1.0]] as const;
    b.quad([110, 6, 110], [110, 6, 111], [111, 6, 111], [111, 6, 110], four, [0, 1, 0]);
    b.quad([110, 6, 111], [111, 6, 111], [111, 6, 110], [110, 6, 110], four, [0, 1, 0]);
    b.quad([110, 6, 110], [111, 6, 110], [111, 6, 111], [110, 6, 111], four, [0, 1, 0]);
    b.quad([111, 2, 110], [110, 2, 110], [110, 2, 111], [111, 2, 111], four, [0, -1, 0]);
    b.quad([112, 3, 110], [112, 3, 111], [112, 5, 111], [112, 5, 110], four, [-1, 0, 0]);
    b.quad([112, 3, 112], [113, 3, 112], [113, 5, 112], [112, 5, 112], four, [0, 0, -1]);
    return b;
  };
  /** what must stay in the lists: the sea's level, a slope, a single triangle, a quad off the grid, one whose halves differ in colour */
  const loose = (b: Batch) => {
    b.quad([120, 2.7, 120], [120, 2.7, 121], [121, 2.7, 121], [121, 2.7, 120], [0.1, 0.3, 0.5], [0, 1, 0]);
    b.quad([122, 3, 120], [122, 3, 121], [123, 4, 121], [123, 4, 120], [0.3, 0.3, 0.3], [0, 1, 0]);
    b.tri([124, 3, 120], [124, 3, 121], [125, 3, 121], [0.3, 0.3, 0.3], undefined, undefined, [0, 1, 0]);
    b.quad([126, 3, 120], [126, 3, 121.001], [127, 3, 121.001], [127, 3, 120], [0.3, 0.3, 0.3], [0, 1, 0]);
    b.tri([128, 3, 120], [128, 3, 121], [129, 3, 121], [0.3, 0.3, 0.3], undefined, undefined, [0, 1, 0]);
    b.tri([128, 3, 120], [129, 3, 121], [129, 3, 120], [0.5, 0.3, 0.3], undefined, undefined, [0, 1, 0]);
    // (and a level one too far from the mesh's beginning for numbers of 16 bits)
    b.quad([600, 3, 120], [600, 3, 121], [601, 3, 121], [601, 3, 120], [0.3, 0.3, 0.3], [0, 1, 0]);
  };

  it('takes every rectangle on the grid out of the lists and leaves the rest', () => {
    const b = mixed(), rects = b.triangles / 2;
    loose(b);
    const all = b.triangles, f = faced(b);
    expect(f.faces!.geo.length / FACE_GEO).toBe(rects);
    expect(f.pos.length / 9).toBe(all - rects * 2);
    expect(f.small).toBe(true);
    // (32 bytes to a face)
    expect(f.faces!.geo.byteLength + f.faces!.col.byteLength + f.faces!.nor.byteLength).toBe(rects * 32);
  });

  it('gives back the very triangles of the lists: places, directions and colours, corner by corner', () => {
    const b = mixed();
    loose(b);
    const f = faced(b);
    expect(triangles(f, unfaced(f.faces!))).toEqual(triangles(small(b)));
    expect(f.ball).toEqual(small(b).ball);
  });

  it('leaves lists without a rectangle as they are', () => {
    const b = new Batch();
    loose(b);
    const f = faced(b);
    expect(f.faces).toBeUndefined();
    expect(triangles(f)).toEqual(triangles(small(b)));
  });

  it('takes the sea as faces on a grid lifted to its level, and gives back its very triangles', () => {
    // the sea's level is on no 64th of a block: its faces lie this far above the 64th under it
    const SEA = 2.7, lift = SEA - Math.floor(SEA * 64) / 64, b = new Batch();
    for (let z = 100; z < 110; z++) for (let x = 100; x < 110; x++) b.quad([x, SEA, z], [x, SEA, z + 1], [x + 1, SEA, z + 1], [x + 1, SEA, z], [[0.1, 0.3, 0.5], [0.1, 0.32, 0.5], [0.12, 0.3, 0.5], [0.1, 0.3, 0.52]], [0, 1, 0]);
    // (and one sheet that is on that grid without the lift: it is none of the sea's and stays a list)
    b.quad([120, 3, 120], [120, 3, 121], [121, 3, 121], [121, 3, 120], [0.3, 0.3, 0.3], [0, 1, 0]);
    expect(faced(b).faces!.geo.length / FACE_GEO).toBe(1);
    const f = faced(b, lift);
    expect(f.faces!.geo.length / FACE_GEO).toBe(100);
    expect(f.faces!.lift).toBe(lift);
    expect(f.pos.length / 9).toBe(2);
    expect(triangles(f, unfaced(f.faces!))).toEqual(triangles(small(b)));
    // a ray finds the sea where it lies, not where its numbers put it
    expect(faceHit(f.faces!, [105.5, 10, 105.5], [0, -1, 0])).toBeCloseTo(10 - SEA, 9);
    // and a mesh without a lift says nothing of one
    expect(faced(mixed()).faces!.lift).toBeUndefined();
  });

  it('takes the upright and level rectangles on no grid as faces of floats where asked, and gives back the very triangles', () => {
    const b = mixed(), rects = b.triangles / 2;
    loose(b);
    // a house as the builder's floats put it, with darker feet, a top of its own and a shaded side; and a top with a colour to each corner, turned both ways
    b.box(130.07, 3.3, 130.13, 130.56, 4.11, 130.9, [0.4, 0.5, 0.2], { top: [0.5, 0.6, 0.3], foot: 0.7, bottom: true, away: [0.2, 0.3, 0.3] });
    const four = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6], [0.7, 0.8, 0.9], [1.2, 1.1, 1.0]] as const;
    b.quad([140.1, 6.2, 140.3], [140.1, 6.2, 141.7], [141.9, 6.2, 141.7], [141.9, 6.2, 140.3], four, [0, 1, 0]);
    b.quad([140.1, 6.2, 141.7], [141.9, 6.2, 141.7], [141.9, 6.2, 140.3], [140.1, 6.2, 140.3], four, [0, 1, 0]);
    b.quad([141.9, 2.2, 140.3], [140.1, 2.2, 140.3], [140.1, 2.2, 141.7], [141.9, 2.2, 141.7], four, [0, -1, 0]);
    const all = b.triangles, f = faced(b, 0, true);
    // the rectangles on the grid are faces as before; of what was left the sea's sheet, the quad off the grid, the one too far and the new ones are faces of floats
    expect(f.faces!.geo.length / FACE_GEO).toBe(rects);
    expect(f.free!.geo.length / FREE_GEO).toBe(3 + 6 + 3);
    // (40 bytes to such a face)
    expect(f.free!.geo.byteLength + f.free!.col.byteLength + f.free!.nor.byteLength).toBe(12 * 40);
    // the slope, the single triangle and the two whose halves differ stay
    expect(f.pos.length / 9).toBe(all - (rects + 12) * 2);
    expect(f.pos.length / 9).toBe(5);
    expect(triangles(f, unfaced(f.faces!), unfree(f.free!))).toEqual(triangles(small(b)));
    expect(f.ball).toEqual(small(b).ball);
    // not asked, they stay in the lists
    expect(faced(b).free).toBeUndefined();
    // a mesh of nothing but such rectangles has no lists left, and one without any has no such faces
    const house = new Batch();
    house.box(0.07, 3.3, 0.13, 0.56, 4.11, 0.9, [0.4, 0.5, 0.2]);
    const h = faced(house, 0, true);
    expect(h.pos.length).toBe(0);
    expect(h.faces).toBeUndefined();
    expect(triangles(unfree(h.free!))).toEqual(triangles(small(house)));
    expect(faced(mixed(), 0, true).free).toBeUndefined();
  });

  it('lets a ray find the first face on no grid it meets from the front', () => {
    const b = new Batch();
    b.box(130.07, 3.3, 130.13, 130.56, 4.11, 130.9, [0.4, 0.5, 0.2], { bottom: true });
    const f = faced(b, 0, true).free!;
    // straight down onto the top, from below onto the bottom, level onto the side that looks along -x; beside it, none
    expect(freeHit(f, [130.3, 50, 130.5], [0, -1, 0])).toBeCloseTo(50 - 4.11, 5);
    expect(freeHit(f, [130.3, 0, 130.5], [0, 1, 0])).toBeCloseTo(3.3, 5);
    expect(freeHit(f, [120, 3.5, 130.5], [1, 0, 0])).toBeCloseTo(10.07, 4);
    expect(freeHit(f, [130.6, 50, 130.5], [0, -1, 0])).toBeNull();
  });

  it('lets a ray find the first face it meets from the front', () => {
    const f = faced(mixed()).faces!;
    // straight down onto the first block's top, and onto the top with four colours over the face that looks down
    expect(faceHit(f, [100.5, 50, 100.5], [0, -1, 0])).toBeCloseTo(45, 9);
    expect(faceHit(f, [110.5, 50, 110.5], [0, -1, 0])).toBeCloseTo(44, 9);
    // from below, the face that looks down; past all of them, none
    expect(faceHit(f, [110.5, 0, 110.5], [0, 1, 0])).toBeCloseTo(2, 9);
    expect(faceHit(f, [105, 50, 105], [0, -1, 0])).toBeNull();
    // level, onto the side of the first block that looks along -x
    expect(faceHit(f, [90, 3.5, 100.25], [1, 0, 0])).toBeCloseTo(10, 9);
  });
});
