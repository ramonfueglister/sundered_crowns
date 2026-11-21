// The fields by the season (people feature 12): what the pieces tell the stage of their field columns
// (src/worldprobe/season_codes.ts), and what the stage makes of it on a day (src/lookprobe/stage/season_look.ts).
import { describe, expect, it } from 'vitest';
import { Batch } from '../../src/lookprobe/batch';
import { styleOf } from '../../src/buildings';
import { N } from '../../src/lookprobe/layout';
import { LOOK_NUMBERS, LUMA, PART, PARTS, SOWINGS, fillLook } from '../../src/lookprobe/stage/season_look';
import { dateToDay } from '../../src/sim/calendar';
import { FARM_YEAR } from '../../src/sim/people/farm_year';
import { Land } from '../../src/worldprobe/climate';
import { CROPS_AT } from '../../src/worldprobe/crops';
import { coverLand } from '../../src/worldprobe/far';
import { CROP, YOUNG } from '../../src/worldprobe/field_season';
import {
  FAR_LOOK,
  SEASON_BYTES,
  SEASON_CODES,
  SEASON_SIDE,
  farmYearsAt,
  seasonCode,
  seasonMap,
  seasonOf,
} from '../../src/worldprobe/season_codes';
import { meadow } from './meadow';

const START = 1291;
/** the numbers of `code`, part `part`, of the fields' numbers about `u`, from a look filled by `fillLook` */
const numbers = (look: Float32Array, code: number, part: number, u = 0.5) => {
  const at = ((code * PARTS + part) * SOWINGS + Math.min(SOWINGS - 1, Math.floor(u * SOWINGS))) * 4;
  return Array.from(look.subarray(at, at + 4));
};
/** the share of the season's colour in a part, and the sheaves' height */
const share = (look: Float32Array, code: number, part: number, u = 0.5) => numbers(look, code, part, u)[3];
const tall = (look: Float32Array, code: number, u = 0.5) => numbers(look, code, PART.tall, u)[0];
/** what a part turns a grey of brightness one into (seasons.ts `tintBy`) */
const grey = (look: Float32Array, code: number, part: number, u = 0.5) => {
  const [r, g, b, k] = numbers(look, code, part, u),
    l = LUMA[0] + LUMA[1] + LUMA[2];
  return [1 + (l * r - 1) * k, 1 + (l * g - 1) * k, 1 + (l * b - 1) * k];
};
const lookOn = (y: number, m: number, d: number) => {
  const look = new Float32Array(LOOK_NUMBERS);
  fillLook(look, { day: dateToDay(y, m - 1, d, START), startYear: START });
  return look;
};

describe('the codes of the field columns', () => {
  it('tell the farming year, the course and the courses, and fit below FAR_LOOK', () => {
    expect(SEASON_CODES).toBeLessThan(FAR_LOOK);
    for (const farmYear of Object.values(FARM_YEAR))
      for (const [kind, courses] of [
        [CROP.fallow, 3],
        [CROP.spring, 3],
        [CROP.winter, 3],
        [CROP.fallow, 2],
        [CROP.winter, 2],
        [CROP.vine, 3],
        [CROP.winter, 1],
      ]) {
        const code = seasonCode(farmYear, kind, courses);
        expect(code).toBeGreaterThan(0);
        expect(seasonOf(code)).toEqual({ farmYear, first: kind, courses: kind === CROP.vine ? 1 : courses });
      }
    expect(seasonOf(0)).toBeNull();
  });

  it('give the fields the farming year of their nearest place’s region and of their own land', () => {
    const at = (region: string, land: number) =>
      farmYearsAt(
        () => region,
        () => land,
      )(10, 10);
    expect(at('mesopotamia', Land.Desert)).toBe(FARM_YEAR.mesopotamia);
    expect(at('iberia', Land.Mediterranean)).toBe(FARM_YEAR.mediterranean);
    expect(at('iberia', Land.Steppe)).toBe(FARM_YEAR.mediterranean);
    expect(at('france', Land.Temperate)).toBe(FARM_YEAR.north);
    expect(at('germany', Land.Mediterranean)).toBe(FARM_YEAR.north);
  });

  it('are laid by the far steps on every field column, from afar or with the sheaves, as the same lot everywhere', () => {
    const style = styleOf('');
    const laid = (ox: number, step: number) =>
      coverLand(meadow(ox), step, new Batch(), [], {
        ploughed: () => 0.3,
        courses: () => 3,
        vines: () => 0.2,
        farm: () => style.house,
        own: () => true,
        woods: () => null,
        farmYear: () => FARM_YEAR.mediterranean,
      });
    for (const step of [CROPS_AT, 3]) {
      const c = laid(0, step),
        d = laid(200, step);
      let fields = 0;
      for (let i = 0; i < N * N; i++) {
        const kind = c.kind?.[i] ?? 0,
          code = c.season?.[i * 2] ?? 0;
        if (kind < 4 || kind > 7) {
          expect(code, `column ${i}`).toBe(0);
          continue;
        }
        fields++;
        // the kinds of far.ts: 4 fallow, 5 spring, 6 winter, 7 vines
        const what = seasonOf(code % FAR_LOOK)!;
        expect(what.farmYear).toBe(FARM_YEAR.mediterranean);
        expect(what.first).toBe([CROP.fallow, CROP.spring, CROP.winter, CROP.vine][kind - 4]);
        // at the first far step the corn stands as sheaves on its soil, the vines are a colour from afar
        expect(code >= FAR_LOOK).toBe(step > CROPS_AT || kind === 7);
      }
      expect(fields).toBeGreaterThan(1000);
      // where two grounds overlap, a column is the same field with the same number on both
      for (let z = 0; z < N; z++)
        for (let x = 0; x < N - 200; x++) {
          const i = z * N + x + 200,
            j = z * N + x;
          expect([c.season![i * 2], c.season![i * 2 + 1]]).toEqual([d.season![j * 2], d.season![j * 2 + 1]]);
        }
    }
  }, 60000);

  it('go into the map of a piece’s columns and those just beyond them with their ground’s height, where its cover still shows the field', () => {
    const side = 24,
      codes = new Uint8Array(side * side * 2),
      h = new Int16Array(side * side).fill(300),
      part = { x0: 8, z0: 8, x1: 12, z1: 12 };
    codes[(8 * side + 9) * 2] = 5;
    codes[(8 * side + 9) * 2 + 1] = 77;
    codes[(10 * side + 10) * 2] = 5 + FAR_LOOK;
    codes[(11 * side + 11) * 2] = 6 + FAR_LOOK;
    // a field of a lot whose middle lies on the piece reaches beyond its own columns
    codes[(9 * side + 15) * 2] = 6;
    const has = new Uint8Array(side * side),
      crops = new Uint8Array(side * side);
    has[10 * side + 10] = 1;
    crops[9 * side + 15] = 1;
    const map = seasonMap(codes, h, side, part, { has, crops })!;
    const at = (x: number, z: number) => {
      const i = ((z - map.z0) * SEASON_SIDE + x - map.x0) * SEASON_BYTES;
      return Array.from(map.cols.subarray(i, i + SEASON_BYTES));
    };
    expect([map.x0, map.z0]).toEqual([2, 2]);
    // a column of sheaves where the cover has no crop any more, and one from afar whose cover a way took off, show none
    expect(at(9, 8)).toEqual([0, 0, 300 & 255, 300 >> 8]);
    expect(at(11, 11)).toEqual([0, 0, 300 & 255, 300 >> 8]);
    expect(at(10, 10)).toEqual([5 + FAR_LOOK, 0, 300 & 255, 300 >> 8]);
    expect(at(15, 9)).toEqual([6, 0, 300 & 255, 300 >> 8]);
    // without a cover, as at the finest step, every field column shows
    expect(seasonMap(codes, h, side, part)!.cols[((8 - 2) * SEASON_SIDE + 9 - 2) * SEASON_BYTES + 1]).toBe(77);
    expect(seasonMap(undefined, h, side, part)).toBeUndefined();
  });
});

describe('what the fields show on a day', () => {
  const winter = seasonCode(FARM_YEAR.north, CROP.winter, 3),
    fallow = seasonCode(FARM_YEAR.north, CROP.fallow, 3),
    spring = seasonCode(FARM_YEAR.north, CROP.spring, 3),
    vines = seasonCode(FARM_YEAR.north, CROP.vine, 3);

  it('is the summer the pieces are built in without a day, but that no sheaf stands on the fallow', () => {
    const look = new Float32Array(LOOK_NUMBERS);
    fillLook(look, null);
    for (const code of [0, winter, fallow, spring, vines]) {
      for (let part = 0; part < PART.tall; part++) expect(share(look, code, part)).toBe(0);
      expect(tall(look, code)).toBe(code === fallow ? 0 : 1);
    }
  });

  it('is that summer for a field of winter corn on the day before it is reaped, ripe', () => {
    // (the first of the numbers is reaped on 1 August: field_season.ts)
    const look = lookOn(START, 7, 31);
    for (let part = 0; part < PART.tall; part++) expect(share(look, winter, part, 0), `part ${part}`).toBeCloseTo(0, 5);
    expect(tall(look, winter, 0)).toBeCloseTo(1, 5);
  });

  it('keeps the young winter corn low and green in January, and lets the fallow lie bare', () => {
    const look = lookOn(START, 1, 15);
    expect(tall(look, winter)).toBeCloseTo(YOUNG, 5);
    // all of its colour is the season's, and green
    expect(share(look, winter, PART.top)).toBeCloseTo(1, 5);
    const [r, g, b] = grey(look, winter, PART.top);
    expect(g).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(b);
    expect(tall(look, fallow)).toBe(0);
    // the fallow's stubble stays as it is built
    expect(share(look, fallow, PART.soil)).toBe(0);
  });

  it('turns the spring corn of the year after into the fallow’s course, and takes the stubble off the winter corn', () => {
    // in 1292 the field of winter corn of 1291 carries the spring corn, sown in February and March
    const june = lookOn(START + 1, 6, 20);
    expect(tall(june, winter)).toBeGreaterThan(0);
    // the spring corn of 1291 lies fallow in 1292: no sheaves
    expect(tall(june, spring)).toBe(0);
    // the fallow of 1291 carries the winter corn of 1292, in flower and full grown by the second half of June
    // (AHDB: flowering 59 days before the harvest, here 9 August)
    expect(tall(june, fallow)).toBeCloseTo(1, 5);
  });

  it('leaves the vines bare in winter and the vineyards’ soil as it is', () => {
    const look = lookOn(START, 1, 15);
    expect(tall(look, vines)).toBe(1);
    expect(share(look, vines, PART.top)).toBeCloseTo(1, 5);
    // grey-brown wood
    const [r, g, b] = grey(look, vines, PART.top);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(share(look, vines, PART.soil)).toBe(0);
  });

  it('turns the vines’ leaves yellow after the vintage, in part', () => {
    // (the vintage of the north on 22 September: field_season.ts)
    const look = lookOn(START, 10, 7),
      k = share(look, vines, PART.top);
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThan(1);
  });
});
