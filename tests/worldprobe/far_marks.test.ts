// The landmarks of the land register at the far steps: the model the finest step stood on a great building's ground,
// built from the same numbers as the piece of the finest step that built it.
import { describe, expect, it } from 'vitest';
import { type Model, styleOf } from '../../src/buildings';
import { Batch } from '../../src/lookprobe/batch';
import { GRID, type Ground, LAND_Y, Mat, N, onGrid, SEA_Y } from '../../src/lookprobe/layout';
import { markOn } from '../../src/worldprobe/far_marks';
import { PIECE } from '../../src/worldprobe/piece_sight';
import { type Mark, type Site, settle } from '../../src/worldprobe/settle';

/** a model of w × d blocks whose colour is the next three numbers of its source */
const drawn = (w: number, d: number): Model => ({
  build: (r) => {
    const b = new Batch();
    b.box(-w / 2, 0, -d / 2, w / 2, 2, d / 2, [r.next(), r.next(), r.next()]);
    return b;
  },
  w,
  d,
  height: 2,
});
/** the town's middle in finest blocks of the world, and its landmarks in metres east and south of it */
const MIDDLE = [1150, 700] as const;
const MARKS: Mark[] = [
  // east of the ground of the piece west of the town's middle, and the first of them: that piece does not build it
  { x: 440, z: 20, model: drawn(8, 6), kind: 'landmark' },
  { x: -100, z: -40, model: drawn(6, 4), kind: 'church' },
  { x: 120, z: 30, model: drawn(5, 5), kind: 'church' },
  { x: -260, z: 50, model: drawn(7, 3), kind: 'castle' },
  // as large as the third: told apart by where it stands
  { x: 60, z: -60, model: drawn(5, 5), kind: 'church' },
  { x: 300, z: 0, model: drawn(9, 4), kind: 'landmark' },
];

describe('the landmarks of the register at the far steps', () => {
  it('are the models the finest step stood there, from the numbers of the piece that built each', () => {
    onGrid(GRID, () => {
      const town = (ox: number, oz: number): Site => ({
          id: 7,
          at: [MIDDLE[0] + 0.5 - ox, MIDDLE[1] + 0.5 - oz],
          size: 2,
          pop: 40,
          region: '',
          style: styleOf(''),
          marks: MARKS,
        }),
        stood: { gx: number; gz: number; gw: number; gd: number; colour: number[] }[] = [];
      // the two pieces of the finest step the town's landmarks stand on, each on its ground of GRID blocks
      for (const px of [5, 6]) {
        const ox = px * PIECE - (GRID - PIECE) / 2,
          oz = 3 * PIECE - (GRID - PIECE) / 2,
          g: Ground = {
            h: new Int16Array(N * N).fill(LAND_Y),
            mat: new Uint8Array(N * N).fill(Mat.Grass),
            wet: new Uint8Array(N * N),
            shore: new Uint8Array(N * N),
            occ: new Float32Array(N * N).fill(LAND_Y),
            surf: new Float32Array(N * N).fill(SEA_Y),
            ox,
            oz,
          },
          things = new Batch(),
          own = (x: number, z: number) => x >= 100 && x < 300 && z >= 100 && z < 300;
        settle(
          g,
          things,
          [town(ox, oz)],
          [],
          () => ({ region: '', style: styleOf('') }),
          () => 0,
          () => 0,
          {},
          own,
          undefined,
          undefined,
          undefined,
          {
            house() {},
            town() {},
            // (the model stood last is the last box of what stands)
            great(_kind, x, z, w, d) {
              const v = (things.pos.length / 3 - 30) * 3;
              stood.push({ gx: x + ox, gz: z + oz, gw: w, gd: d, colour: [...things.col.slice(v, v + 3)] });
            },
          },
        );
      }
      expect(stood.length).toBe(MARKS.length);
      const built = new Map<string, (Batch | null)[]>(),
        site = town(0, 0);
      for (const { gx, gz, gw, gd, colour } of stood) {
        const b = markOn(site, gx, gz, gw, gd, [MIDDLE[0] + 0.5, MIDDLE[1] + 0.5], built);
        expect(b, `${gx}, ${gz}`).not.toBeNull();
        expect([...b!.col.slice(0, 3)]).toEqual(colour);
      }
      // and none where no landmark of the town stands
      const { gx, gz, gw, gd } = stood[0];
      expect(markOn(site, gx, gz, 11, 11, MIDDLE, built)).toBeNull();
      expect(markOn(site, gx + 40, gz, gw, gd, MIDDLE, built)).toBeNull();
    });
  });
});
