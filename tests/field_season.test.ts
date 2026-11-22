// The fields by the season (people feature 12): what a field shows on a day, by its farming year and its course in the
// rotation (src/worldprobe/field_season.ts), held to the weeks of the farming year (src/sim/people/farm_year.ts).
import { describe, expect, it } from 'vitest';
import { dateToDay } from '../src/sim/calendar';
import { FARM_YEAR, TASK, farmTask } from '../src/sim/people/farm_year';
import { CROP, GROUND, YOUNG, courseIn, fieldLook, vineLook } from '../src/worldprobe/field_season';

const START = 1291,
  day = (y: number, m: number, d: number) => dateToDay(y, m - 1, d, START);
/** a field that keeps its course every year (one course), of the farming year `fy` and number `u` */
const kept = (fy: number, crop: number, u: number, y: number, m: number, d: number) =>
  fieldLook(day(y, m, d), START, fy, crop, 1, START, u);
const LAST = 0.9999;

describe('the weeks of the work, as the farming year has them', () => {
  const task = (fy: number, y: number, m: number, d: number) => farmTask(day(y, m, d), START, fy);
  it('sows the winter corn in the north from 5 September to the end of November, and reaps it from 1 August', () => {
    expect(kept(FARM_YEAR.north, CROP.winter, 0, 1291, 9, 5).ground).toBe(GROUND.earth);
    expect(task(FARM_YEAR.north, 1291, 9, 5)).toBe(TASK.winter);
    expect(kept(FARM_YEAR.north, CROP.winter, LAST, 1291, 11, 30).ground).toBe(GROUND.earth);
    expect(task(FARM_YEAR.north, 1291, 11, 30)).toBe(TASK.winter);
    expect(kept(FARM_YEAR.north, CROP.winter, 0, 1292, 7, 31).ripe).toBe(1);
    expect(kept(FARM_YEAR.north, CROP.winter, 0, 1292, 8, 1).ground).toBe(GROUND.stubble);
    expect(task(FARM_YEAR.north, 1292, 8, 1)).toBe(TASK.harvest);
  });
  it('sows the spring corn in February and March, and reaps it last, to 4 September', () => {
    expect(kept(FARM_YEAR.north, CROP.spring, 0, 1292, 2, 1).ground).toBe(GROUND.earth);
    expect(task(FARM_YEAR.north, 1292, 2, 1)).toBe(TASK.spring);
    expect(kept(FARM_YEAR.north, CROP.spring, LAST, 1292, 3, 31).ground).toBe(GROUND.earth);
    expect(kept(FARM_YEAR.north, CROP.spring, LAST, 1292, 9, 3).height).toBe(1);
    expect(kept(FARM_YEAR.north, CROP.spring, LAST, 1292, 9, 4).ground).toBe(GROUND.stubble);
    expect(task(FARM_YEAR.north, 1292, 9, 4)).toBe(TASK.harvest);
  });
  it('ploughs the fallow in April and again after St John’s Day', () => {
    const fallow = (m: number, d: number, u: number) =>
      fieldLook(day(1291, m, d), START, FARM_YEAR.north, CROP.fallow, 3, START, u);
    expect(fallow(3, 31, 0).ground).toBe(GROUND.stubble);
    expect(fallow(4, 1, 0).ground).toBe(GROUND.earth);
    expect(task(FARM_YEAR.north, 1291, 4, 1)).toBe(TASK.fallow);
    expect(fallow(6, 24, 0).ground).toBe(GROUND.earth);
    expect(task(FARM_YEAR.north, 1291, 6, 24)).toBe(TASK.weed);
  });
  it('sows round the Mediterranean from September to November and reaps in May and June', () => {
    expect(kept(FARM_YEAR.mediterranean, CROP.winter, 0, 1291, 9, 1).ground).toBe(GROUND.earth);
    expect(task(FARM_YEAR.mediterranean, 1291, 9, 1)).toBe(TASK.winter);
    expect(kept(FARM_YEAR.mediterranean, CROP.winter, LAST, 1292, 6, 29).height).toBe(1);
    expect(kept(FARM_YEAR.mediterranean, CROP.winter, LAST, 1292, 6, 30).ground).toBe(GROUND.stubble);
    expect(task(FARM_YEAR.mediterranean, 1292, 6, 30)).toBe(TASK.harvest);
  });
  it('sows in Mesopotamia to the end of January and reaps from April', () => {
    expect(kept(FARM_YEAR.mesopotamia, CROP.winter, LAST, 1292, 1, 31).ground).toBe(GROUND.earth);
    expect(task(FARM_YEAR.mesopotamia, 1292, 1, 31)).toBe(TASK.winter);
    expect(kept(FARM_YEAR.mesopotamia, CROP.winter, 0, 1292, 4, 1).ground).toBe(GROUND.stubble);
    expect(task(FARM_YEAR.mesopotamia, 1292, 4, 1)).toBe(TASK.harvest);
  });
});

describe('the corn between sowing and harvest', () => {
  it('shows the picture of the year the pieces are built for in mid July: the winter corn turning gold, the spring corn green', () => {
    const winter = kept(FARM_YEAR.north, CROP.winter, 0.5, 1291, 7, 15),
      spring = kept(FARM_YEAR.north, CROP.spring, 0.5, 1291, 7, 15);
    expect(winter.height).toBe(1);
    expect(winter.ripe).toBeGreaterThan(0.5);
    expect(spring.height).toBe(1);
    expect(spring.ripe).toBeLessThan(0.3);
  });
  it('keeps the young winter corn low and green through the northern winter', () => {
    const jan = kept(FARM_YEAR.north, CROP.winter, 0.5, 1292, 1, 15);
    expect(jan).toEqual({ height: YOUNG, ripe: 0, ground: GROUND.sown, crop: CROP.winter });
  });
  it('grows and ripens without going back, field by field', () => {
    for (const fy of [FARM_YEAR.north, FARM_YEAR.mediterranean, FARM_YEAR.mesopotamia])
      for (const u of [0, 0.5, LAST]) {
        let height = 0,
          ripe = 0;
        for (let d = day(1291, 12, 1); d < day(1292, 4, 1); d++) {
          const f = fieldLook(d, START, fy, CROP.winter, 1, START, u);
          if (f.ground !== GROUND.sown) continue;
          expect(f.height).toBeGreaterThanOrEqual(height);
          expect(f.ripe).toBeGreaterThanOrEqual(ripe);
          height = f.height;
          ripe = f.ripe;
        }
      }
  });
  it('has the green corn in May round the Mediterranean, when the farīk is gathered, and stubble in the summer', () => {
    const may = kept(FARM_YEAR.mediterranean, CROP.winter, 0.5, 1292, 5, 10);
    expect(may.height).toBe(1);
    expect(may.ripe).toBeGreaterThan(0);
    expect(may.ripe).toBeLessThan(1);
    expect(kept(FARM_YEAR.mediterranean, CROP.winter, 0.5, 1292, 8, 1).ground).toBe(GROUND.stubble);
  });
  it('presses the phases of a late sown field in Mesopotamia into the time it has', () => {
    const at = (m: number, d: number) => kept(FARM_YEAR.mesopotamia, CROP.winter, LAST, 1292, m, d);
    expect(at(2, 20).height).toBeGreaterThan(YOUNG);
    expect(at(5, 30).ripe).toBe(1);
  });
});

describe('the rotation', () => {
  it('moves a field of three courses from winter corn to spring corn to the fallow and back', () => {
    expect([1291, 1292, 1293, 1294].map((y) => courseIn(CROP.winter, 3, y, 1291))).toEqual([
      CROP.winter,
      CROP.spring,
      CROP.fallow,
      CROP.winter,
    ]);
  });
  it('takes turns of corn and fallow in two courses, and keeps the vines and the fields of one course', () => {
    expect([1291, 1292, 1293].map((y) => courseIn(CROP.fallow, 2, y, 1291))).toEqual([
      CROP.fallow,
      CROP.winter,
      CROP.fallow,
    ]);
    expect(courseIn(CROP.vine, 3, 1300, 1291)).toBe(CROP.vine);
    expect(courseIn(CROP.winter, 1, 1300, 1291)).toBe(CROP.winter);
  });
  it('sows the winter corn on last year’s fallow, not on its own stubble', () => {
    const oct = (crop: number) => fieldLook(day(1291, 11, 30), START, FARM_YEAR.north, crop, 3, START, 0.2);
    expect(oct(CROP.fallow).ground).toBe(GROUND.sown);
    expect(oct(CROP.winter).ground).toBe(GROUND.stubble);
    expect(oct(CROP.spring).ground).toBe(GROUND.stubble);
  });
});

describe('the vines', () => {
  it('stand bare in the winter, in leaf from April, with grapes before the vintage of late September in the north', () => {
    const at = (m: number, d: number) => vineLook(day(1291, m, d), START, FARM_YEAR.north);
    expect(at(1, 15).leaf).toBe(0);
    expect(at(6, 15)).toEqual({ leaf: 1, grapes: 0, turned: 0 });
    expect(at(9, 1).grapes).toBe(1);
    expect(at(10, 7).turned).toBeGreaterThan(0.4);
    expect(at(12, 1).leaf).toBe(0);
  });
  it('carry the first grapes in June round the Mediterranean', () => {
    expect(vineLook(day(1291, 6, 15), START, FARM_YEAR.mediterranean).grapes).toBe(1);
  });
});
