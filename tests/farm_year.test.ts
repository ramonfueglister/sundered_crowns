// The farming years (people feature 12, step D of the people's road map): the works of the year round the
// Mediterranean and in Mesopotamia, and which places follow which year (src/sim/people/farm_year.ts,
// src/sim/content/place_climate.ts, public/data/place_climate.json).
import { describe, expect, it } from 'vitest';
import { dateToDay } from '../src/sim/calendar';
import { CLIMATE } from '../src/sim/content/place_climate';
import { FARM_YEAR, TASK, farmTask, farmYears, inBarn } from '../src/sim/people/farm_year';
import { loadWorld } from '../tools/sim/load';

const day = (m: number, d: number) => dateToDay(1291, m - 1, d, 1291);
const task = (year: number, m: number, d: number) => farmTask(day(m, d), 1291, year);

describe('the year of Córdoba', () => {
  const at = (m: number, d: number) => task(FARM_YEAR.mediterranean, m, d);
  it('prunes the vines in January and February, plants the summer crops in March and April', () => {
    expect(at(1, 10)).toBe(TASK.prune); // "the vines … are pruned"
    expect(at(2, 20)).toBe(TASK.prune); // "the vine shoots transplanted"
    expect(at(3, 1)).toBe(TASK.garden); // "Sugar cane is planted"
    expect(at(4, 30)).toBe(TASK.garden); // "rice and beans are sown"
  });
  it('reaps in May and June, threshes on the floor in July, out of doors', () => {
    expect(at(5, 1)).toBe(TASK.harvest); // "farīk is gathered"
    expect(at(6, 30)).toBe(TASK.harvest);
    expect(at(7, 15)).toBe(TASK.floor); // "barley is threshed"
    expect(inBarn(TASK.floor)).toBe(false);
  });
  it('sows from September to November, also when the olive picking commences, and gardens in August and December', () => {
    expect(at(8, 10)).toBe(TASK.garden); // "autumn beans … turnips"
    expect(at(9, 1)).toBe(TASK.winter); // "ploughed and sown in the mountains"
    expect(at(10, 15)).toBe(TASK.winter);
    expect(at(11, 30)).toBe(TASK.winter); // "sowing activities reach their peak"
    expect(at(12, 10)).toBe(TASK.garden); // "White poppy is sown, and also garlic"
  });
});

describe('the year of Mesopotamia', () => {
  const at = (m: number, d: number) => task(FARM_YEAR.mesopotamia, m, d);
  it('sows from September to March, reaps from April, threshes after the harvest', () => {
    expect(at(1, 20)).toBe(TASK.winter); // "Nov–end Jan", the spring crops to March
    expect(at(3, 31)).toBe(TASK.winter);
    expect(at(4, 1)).toBe(TASK.harvest); // "The harvest begins in April"
    expect(at(6, 15)).toBe(TASK.floor);
    expect(at(8, 20)).toBe(TASK.summer); // the summer crops, August to October
    expect(at(9, 1)).toBe(TASK.winter); // "Sep–Oct"
  });
});

describe('the farming year of a place', () => {
  const provinces = [
    { locs: [0, 1, 2], region: 'iberia' },
    { locs: [3, 4], region: 'anatolia' },
    { locs: [5], region: 'mesopotamia' },
    { locs: [6], region: 'egypt' },
  ];
  const climate = [CLIMATE.mediterranean, CLIMATE.dry, CLIMATE.other, CLIMATE.mediterranean, CLIMATE.dry, 0, 2, 1];
  const years = farmYears(provinces, climate);
  it('goes by the climate round the Mediterranean, and in Iberia, the Maghreb and the Levant also by the dry land', () => {
    expect([...years.slice(0, 5)]).toEqual([
      FARM_YEAR.mediterranean,
      FARM_YEAR.mediterranean,
      FARM_YEAR.north,
      FARM_YEAR.mediterranean,
      FARM_YEAR.north,
    ]);
  });
  it('is the handbook’s in Mesopotamia, and the north’s where no source was read or no province is', () => {
    expect(years[5]).toBe(FARM_YEAR.mesopotamia);
    expect(years[6]).toBe(FARM_YEAR.north);
    expect(years[7]).toBe(FARM_YEAR.north);
  });
  it('is that of the towns as the map has them', () => {
    const w = loadWorld(),
      of = (name: string) => {
        const p = w.names.indexOf(name);
        expect(p).toBeGreaterThanOrEqual(0);
        return w.farmYear?.[p];
      };
    for (const town of ['Seville', 'Toledo', 'Rome', 'Palermo', 'Tunis', 'Marrakesh', 'Damascus', 'Aleppo'])
      expect([town, of(town)]).toEqual([town, FARM_YEAR.mediterranean]);
    for (const town of ['Paris', 'Milan', 'Cairo', 'Konya', 'Isfahan'])
      expect([town, of(town)]).toEqual([town, FARM_YEAR.north]);
    expect(of('Baghdad')).toBe(FARM_YEAR.mesopotamia);
  });
});
