// The landmarks of the land register and the monuments at the far steps: the model the finest step stood on a great
// building's ground, built from the same numbers as the piece of the finest step that built it.
import { describe, expect, it } from 'vitest';
import { type Model, type Style, styleOf } from '../../src/buildings';
import { Batch } from '../../src/lookprobe/batch';
import { GRID, type Ground, LAND_Y, Mat, N, onGrid, SEA_Y } from '../../src/lookprobe/layout';
import { type Stood, greatOn, markOn, monumentOn } from '../../src/worldprobe/far_marks';
import { PIECE } from '../../src/worldprobe/piece_sight';
import { type Mark, type Monument, type Site, settle } from '../../src/worldprobe/settle';

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
/** a meadow of the finest step whose first block is the world's block ox, oz */
const meadow = (ox: number, oz: number): Ground => ({
  h: new Int16Array(N * N).fill(LAND_Y),
  mat: new Uint8Array(N * N).fill(Mat.Grass),
  wet: new Uint8Array(N * N),
  shore: new Uint8Array(N * N),
  occ: new Float32Array(N * N).fill(LAND_Y),
  surf: new Float32Array(N * N).fill(SEA_Y),
  ox,
  oz,
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
          g = meadow(ox, oz),
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

  it("and a walled town's other churches and its towers, from the town's numbers after its landmarks", () => {
    onGrid(GRID, () => {
      // a town of the size of a great city with towers over it, its middle six blocks west of the border of two
      // pieces of the finest step: once with the churches of the graphic's own, once with landmarks of the register
      const style: Style = { ...styleOf('italy'), church: drawn(6, 11), great: drawn(12, 21), towers: true },
        middle = [1194, 700] as const;
      for (const marks of [undefined, MARKS.slice(1, 4)]) {
        const town = (ox: number, oz: number): Site => ({
            id: 9,
            at: [middle[0] + 0.5 - ox, middle[1] + 0.5 - oz],
            size: 5,
            pop: 400,
            region: 'italy',
            style,
            ...(marks ? { marks } : {}),
          }),
          stood: (Stood & { things: Batch; end: number })[] = [];
        let cx = 0,
          cz = 0;
        for (const px of [5, 6]) {
          const ox = px * PIECE - (GRID - PIECE) / 2,
            oz = 3 * PIECE - (GRID - PIECE) / 2,
            things = new Batch();
          settle(
            meadow(ox, oz),
            things,
            [town(ox, oz)],
            [],
            () => ({ region: 'italy', style }),
            () => 0,
            () => 0,
            {},
            (x, z) => x >= 100 && x < 300 && z >= 100 && z < 300,
            undefined,
            undefined,
            undefined,
            {
              house() {},
              town(_site, x, z) {
                cx = x + ox;
                cz = z + oz;
              },
              great(kind, x, z, w, d) {
                stood.push({ kind, x: x + ox, z: z + oz, w, d, things, end: things.col.length });
              },
            },
          );
        }
        // the building in the middle, two churches and two of the three towers (one finds no ground and takes no
        // numbers), or the four towers of a town with landmarks: the second piece, on whose ground a landmark of the
        // town does not stand, draws other spots for them; on both pieces
        const others = stood.filter((f) => f.kind === 'tower' || !marks);
        expect(others.length).toBe(marks ? 4 : 5);
        expect(new Set(others.map((f) => Math.floor((f.x + f.w / 2) / PIECE))).size).toBe(2);
        const built = new Map<string, Map<string, Batch>>(),
          site = town(0, 0);
        for (const f of others) {
          const b = greatOn(site, f.x, f.z, f.w, f.d, cx, cz, stood, built);
          expect(b, `${f.kind} at ${f.x}, ${f.z}`).not.toBeNull();
          expect([...b!.col]).toEqual([...f.things.col.slice(f.end - b!.col.length, f.end)]);
        }
        expect(greatOn(site, others[0].x + 1, others[0].z, others[0].w, others[0].d, cx, cz, stood, built)).toBeNull();
      }
    });
  });

  it('and the monuments, each from its own numbers, where it stands on its own ground or found ground near its place', () => {
    onGrid(GRID, () => {
      const ox = 900,
        oz = 500,
        monuments: Monument[] = [
          { id: 4097, at: [150.5, 160.5], model: drawn(9, 7), level: true },
          { id: 16, at: [230.2, 210.7], model: drawn(6, 6) },
        ],
        things = new Batch(),
        stood: { gx: number; gz: number; gw: number; gd: number; colour: number[] }[] = [];
      settle(
        meadow(ox, oz),
        things,
        [],
        monuments,
        () => ({ region: '', style: styleOf('') }),
        () => 0,
        () => 0,
        {},
        undefined,
        undefined,
        undefined,
        undefined,
        {
          house() {},
          town() {},
          great(_kind, x, z, w, d) {
            const v = (things.pos.length / 3 - 30) * 3;
            stood.push({ gx: x + ox, gz: z + oz, gw: w, gd: d, colour: [...things.col.slice(v, v + 3)] });
          },
        },
      );
      expect(stood.length).toBe(2);
      const world = (x: number, z: number): [number, number] => [x + ox, z + oz];
      for (const { gx, gz, gw, gd, colour } of stood) {
        const b = monumentOn(monuments, gx, gz, gw, gd, world);
        expect([...(b?.col.slice(0, 3) ?? [])]).toEqual(colour);
      }
      expect(monumentOn(monuments, stood[0].gx, stood[0].gz, 5, 5, world)).toBeNull();
    });
  });
});
