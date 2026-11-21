// A coarser step as the mean of what the far camera sees of the finer one (worldprobe/mean.ts, mean_look.ts): the
// finer step's blocks, the mean a coarser block takes of its four, and the shadow it is not to carry twice.
import { describe, expect, it } from 'vitest';
import { Batch, type RGB } from '../../src/lookprobe/batch';
import { NEAR } from '../../src/lookprobe/layout';
import { SUN } from '../../src/lookprobe/light';
import type { Cover } from '../../src/worldprobe/far';
import { meanCover, summary, unshade } from '../../src/worldprobe/mean';
import { type Above, above, lay, look } from '../../src/worldprobe/mean_look';

const GRASS: RGB = [0.3, 0.5, 0.2],
  ROOF: RGB = [0.6, 0.25, 0.15],
  WALL: RGB = [0.8, 0.75, 0.65],
  /** the ground's height and the finer step's side, in blocks */
  Y = 4,
  W = 32;

/** a flat ground of one colour, a quad to a block, as the finer step draws its land */
function flat(colour: RGB = GRASS): Batch {
  const b = new Batch();
  for (let z = 0; z < W; z++)
    for (let x = 0; x < W; x++) b.quad([x, Y, z], [x, Y, z + 1], [x + 1, Y, z + 1], [x + 1, Y, z], colour, [0, 1, 0]);
  return b;
}
/** houses as boxes on the ground from (x0, z0) to (x1, z1), `rise` blocks high: walls of one colour, roofs of another */
function houses(...at: (readonly [number, number, number, number, number])[]): Batch {
  const b = new Batch();
  for (const [x0, z0, x1, z1, rise] of at) b.box(x0, Y, z0, x1, Y + rise, z1, WALL, { top: ROOF });
  return b;
}
/** the blocks of the ground and what stands on it; `first`: what stands is laid before the ground */
function laid(ground: Batch, standing?: Batch, first = false): Above {
  const a = above(W, W);
  if (standing && first) lay(a, standing, 0, 0);
  lay(a, ground, 0, 0, true);
  if (standing && !first) lay(a, standing, 0, 0);
  return a;
}
/**
 * The cover of a coarser ground of W blocks a side whose four quarters are each the summary of the one finer piece (W
 * finer blocks a side, so W / 2 coarser ones): the coarser block (x, z) of the first quarter holds the finer blocks
 * 2x and 2x + 1 by 2z and 2z + 1.
 */
const coverOf = (a: Above) => {
  const s = summary(a);
  return meanCover([s, s, s, s], W / 2, W, 0, 0);
};
const at = (list: Float32Array, j: number) => [list[j * 3], list[j * 3 + 1], list[j * 3 + 2]];

describe('the finer step as its blocks', () => {
  it.each([false, true])(
    'takes the height and colour of what is highest at the middle of every block, and the ground under it (houses first: %s)',
    (first) => {
      const a = laid(flat(), houses([10, 10, 12, 13, 3]), first);
      for (let z = 0; z < W; z++)
        for (let x = 0; x < W; x++) {
          const i = x + z * W,
            house = x >= 10 && x < 12 && z >= 10 && z < 13;
          expect([a.high[i], a.ground[i]], `${x}, ${z}`).toEqual([house ? Y + 3 : Y, Y]);
          expect(at(a.top, i).map((v) => Math.round(v * 100) / 100)).toEqual(house ? ROOF : GRASS);
        }
    },
  );

  it('sees no block where nothing is laid', () => {
    const a = above(4, 4);
    expect(look(a).every((v) => v === 0)).toBe(true);
    expect(a.high.every((v) => v === -Infinity)).toBe(true);
  });
});

describe('a coarser block as the mean of its four finer ones', () => {
  it('shows open flat ground in its own colour, flat on the ground', () => {
    const c = coverOf(laid(flat()));
    for (let j = 0; j < W * W; j++) {
      expect(c.has[j]).toBe(1);
      expect(c.rise[j]).toBe(0);
      at(c.top, j).forEach((v, k) => {
        expect(v).toBeCloseTo(GRASS[k], 2);
      });
    }
  });

  it('stands out as high as its four do in the mean, in its own blocks, where that is a block or more', () => {
    // a house four blocks high over the four finer blocks of one coarser block (10 … 12 is the coarser block 5), and
    // one of one block over a single finer block of another (the coarser block 10, as the summary is laid in every
    // quarter of the coarser ground)
    const c = coverOf(laid(flat(), houses([10, 10, 12, 12, 4], [20, 20, 21, 21, 1])));
    expect(c.rise[5 + 5 * W]).toBe(2);
    expect(c.rise[10 + 10 * W]).toBe(0);
    expect(c.rise[3 + 3 * W]).toBe(0);
  });

  it('shows the sides the camera sees of a block that stands out, in their colour', () => {
    const c = coverOf(laid(flat(), houses([10, 10, 12, 12, 4]))),
      side = at(c.side, 5 + 5 * W);
    // the walls, a little darker or lighter as the stage's lights fall on them, but walls and not roofs
    const wall = WALL[0] / WALL[2],
      roof = ROOF[0] / ROOF[2];
    expect(Math.abs(side[0] / side[2] - wall)).toBeLessThan(Math.abs(side[0] / side[2] - roof));
  });

  it.each([false, true])(
    'shows of a block hidden behind a high one less of its own top (houses first: %s)',
    (first) => {
      // the camera looks from the side of NEAR: a wall of houses on that side of the block hides it
      const target = [8, 8] as const,
        sx = Math.sign(NEAR[0]),
        sz = Math.sign(NEAR[1]),
        wall: [number, number, number, number, number][] = [];
      for (let k = 1; k <= 3; k++)
        wall.push([target[0] + sx * k, target[1] + sz * k, target[0] + sx * k + 2, target[1] + sz * k + 2, 8]);
      const open = look(laid(flat())),
        hidden = look(laid(flat(), houses(...wall), first)),
        i = target[0] + target[1] * W;
      expect(open[i * 8 + 3]).toBeGreaterThan(0);
      expect(hidden[i * 8 + 3]).toBeLessThan(open[i * 8 + 3] / 2);
    },
  );
});

describe("the coarser step's own shadow", () => {
  it('brightens the top of a block that a raised block hides from the sun, and leaves the others as they are', () => {
    const n = 16,
      sx = Math.sign(SUN[0]),
      sz = Math.sign(SUN[2]),
      c: Cover = {
        has: new Uint8Array(n * n).fill(1),
        rise: new Uint8Array(n * n),
        top: new Float32Array(n * n * 3).fill(0.4),
        side: new Float32Array(n * n * 3),
        town: new Uint8Array(n * n),
        share: new Float32Array(n * n).fill(1),
      },
      h = new Float32Array(n * n).fill(Y);
    // a block raised high one block towards the sun from (8, 8)
    h[8 + sx + (8 + sz) * n] = Y + 6;
    unshade(c, n, h);
    expect(c.top[(8 + 8 * n) * 3]).toBeGreaterThan(0.4 * 1.05);
    // a block on the sun's side of the raised one: nothing stands between it and the sun
    const free = 8 + 4 * sx + (8 + 4 * sz) * n;
    expect(c.top[free * 3]).toBe(Math.fround(0.4));
  });
});
