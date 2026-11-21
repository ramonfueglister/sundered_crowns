// The farmers of a town at work on its furlongs (people feature 12, src/figures/farmers.ts): each works beside one
// furlong of the town's land register, facing it, put there by the one piece that owns the furlong's lot; no anonymous
// farmer works the town's furlongs; and the plan of the day has them there on a working day of the farming year, in
// the barn while they thresh.
import { describe, expect, it } from 'vitest';
import { type Figures, type SettledGround, crowd, setPlacePeople } from '../../src/figures';
import { DIRS, FIGURE_AT, PLAN } from '../../src/figures/aims';
import { lotOf } from '../../src/figures/farmers';
import { NOWHERE, figureAtHour } from '../../src/figures/schedule';
import { Mode } from '../../src/figures/estates';
import { type Ground, N, idx } from '../../src/lookprobe/layout';
import { AWAY, WHO, dayPlan } from '../../src/sim/people/day_plan';
import { CALENDAR, DAY } from '../../src/sim/holy_days';
import { inBarn } from '../../src/sim/people/farm_year';
import { lotCorner } from '../../src/sim/settlement/fields';
import CITIES_JSON from '../../src/sim/content/cities_1356.json';

const cologne = CITIES_JSON.cities.find((c) => c.name === 'Cologne')!;
const PEOPLE = 600,
  ID = 120000;
setPlacePeople({
  place: cologne.place,
  day: 0,
  id: Array.from({ length: PEOPLE }, (_, k) => ID + k),
  born: Array.from({ length: PEOPLE }, () => -365 * 30),
  sex: Array.from({ length: PEOPLE }, (_, k) => k % 2),
  who: Array.from({ length: PEOPLE }, (_, k) => (k % 3 === 0 ? WHO.craft : WHO.farm)),
  calendar: Array.from({ length: PEOPLE }, () => CALENDAR.latin),
  seed: 1291,
});

/** the town's furlongs: the lots lx 12–19, lz 40–43; the lots lx 22–27 of the same rows are fields of nobody's */
const TOWN_LOTS: number[] = [];
for (let lz = 40; lz < 44; lz++) for (let lx = 12; lx < 20; lx++) TOWN_LOTS.push(lx, lz);
const OTHER_LOTS: number[] = [];
for (let lz = 40; lz < 44; lz++) for (let lx = 22; lx < 28; lx++) OTHER_LOTS.push(lx, lz);

/** A ground of furlongs as settle() lays them: each fills its lot but for the balk on its west and north side. */
function fields(ox = 0): { g: Ground; s: SettledGround } {
  const g: Ground = {
    h: new Int16Array(N * N).fill(4),
    mat: new Uint8Array(N * N),
    wet: new Uint8Array(N * N),
    shore: new Uint8Array(N * N),
    occ: new Float32Array(N * N),
    surf: new Float32Array(N * N),
    ox,
    oz: 0,
  };
  const s: SettledGround = { used: new Uint8Array(N * N), town: new Uint8Array(N * N), field: new Uint8Array(N * N) };
  const lots = [...TOWN_LOTS, ...OTHER_LOTS];
  for (let j = 0; j < lots.length; j += 2) {
    const [x0, z0] = lotCorner(lots[j], lots[j + 1]);
    for (let z = z0; z < z0 + 7; z++)
      for (let x = x0 - ox; x < x0 - ox + 10; x++)
        if (x >= 0 && x < N) {
          s.field[idx(x, z)] = 1;
          s.used[idx(x, z)] = 1;
        }
  }
  s.furlongs = new Map([[cologne.site, TOWN_LOTS]]);
  return { g, s };
}
const townLots = new Set(
  Array.from({ length: TOWN_LOTS.length / 2 }, (_, j) => lotOf(...lotCorner(TOWN_LOTS[2 * j], TOWN_LOTS[2 * j + 1]))),
);
const ofKind = (f: Figures, kind: number) =>
  Array.from({ length: f.count }, (_, k) => k).filter((k) => f.at![k] === kind);
/** the block a figure faces, in the piece */
const faced = (f: Figures, k: number) => {
  const a = f.e[k * 4 + 2],
    d = DIRS.findIndex(([dx, dz]) => Math.abs(Math.atan2(dx, dz) - a) < 1e-4);
  return [Math.floor(f.a[k * 4]) + DIRS[d][0], Math.floor(f.a[k * 4 + 2]) + DIRS[d][1]];
};

describe('the farmers of a town', () => {
  const { g, s } = fields(),
    f = crowd(g, s, () => true),
    hands = ofKind(f, FIGURE_AT.field);
  it('work beside its furlongs, facing them, one to a block, waiting off the stage', () => {
    expect(hands.length).toBeGreaterThan(100);
    const blocks = new Set<number>();
    for (const k of hands) {
      expect(f.plan![k * PLAN]).toBe(WHO.farm);
      const x = Math.floor(f.a[k * 4]),
        z = Math.floor(f.a[k * 4 + 2]),
        [fx, fz] = faced(f, k);
      expect(s.used[idx(x, z)]).toBe(0);
      expect(s.field[idx(fx, fz)]).toBe(1);
      expect(townLots.has(lotOf(fx, fz))).toBe(true);
      expect(f.a[k * 4 + 3]).toBeLessThan(0);
      expect(f.c[k * 4]).toBe(Mode.Work);
      blocks.add(idx(x, z));
    }
    expect(blocks.size).toBe(hands.length);
  });
  it('each work one furlong, and no anonymous farmer works the town furlongs', () => {
    const ids = hands.map((k) => f.e[k * 4 + 3]);
    expect(new Set(ids).size).toBe(ids.length);
    const anonymous = ofKind(f, FIGURE_AT.anonymous).filter((k) => f.c[k * 4] === Mode.Work);
    expect(anonymous.length).toBeGreaterThan(0);
    for (const k of anonymous) expect(townLots.has(lotOf(...(faced(f, k) as [number, number])))).toBe(false);
  });
  it('are put by exactly one of two pieces that share the fields', () => {
    // (each piece's ground reaches beyond what it owns, as the world's pieces do)
    const l = fields(0),
      r = fields(100),
      mine = (x: number) => x >= 100 && x < 200,
      keys = (x: Figures, ox: number) =>
        ofKind(x, FIGURE_AT.field).map(
          (k) => `${x.e[k * 4 + 3]}:${Math.floor(x.a[k * 4]) + ox}:${Math.floor(x.a[k * 4 + 2])}`,
        );
    const both = [...keys(crowd(l.g, l.s, mine), 0), ...keys(crowd(r.g, r.s, mine), 100)].sort();
    expect(both.length).toBeGreaterThan(50);
    expect(both).toEqual(
      keys(
        crowd(l.g, l.s, (x) => x >= 100 && x < 300),
        0,
      ).sort(),
    );
  });
});

describe('the plan of a farmer', () => {
  const plan = (day: number) =>
    dayPlan({ who: WHO.farm, calendar: CALENDAR.latin, away: AWAY.none, heading: -1 }, cologne.place, 50.9, day, 1356);
  const workday = (from: number) => [...Array(14).keys()].map((d) => d + from).find((d) => plan(d).kind === DAY.work)!;
  it('has the farmer on the furlong on a working day, but in the barn while threshing', () => {
    const june = plan(workday(160)),
      december = plan(workday(340));
    expect(inBarn(june.task)).toBe(false);
    expect(figureAtHour(june, WHO.farm, 10)).toBe(FIGURE_AT.field);
    expect(figureAtHour(june, WHO.farm, 23)).toBe(NOWHERE);
    expect(inBarn(december.task)).toBe(true);
    expect(figureAtHour(december, WHO.farm, 11)).toBe(NOWHERE);
  });
});
