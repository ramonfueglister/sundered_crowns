// Feature 2 of the economy, the cultivated land per place (docs/ECONOMY_DESIGN.md): the rule, the yield curve of a
// place, the calibration on England in 1300 and 1380, and the yearly system.
import { describe, it, expect } from 'vitest';
import {
  arableHa,
  hectares,
  landLimitHa,
  soilOf,
  ENGLAND_ARABLE,
  HECTARES_PER_ACRE,
} from '../src/sim/systems/cultivation';
import { ENGLAND_1300 } from '../src/sim/systems/harvest';
import { newWorldState, loadLand, loadCultivation, peopleOfMap } from '../tools/sim/load';
import { ALIVE } from '../src/sim/state';
import { calibrate, englandAt } from '../tools/sim/calibration';
import { advanceDay } from '../src/sim/engine';
import { ofTime } from '../src/sim/scale';

const { w } = newWorldState();
/** the people of the setup of 1356: the numbers of the sources the calibration spreads England's people by */
const map = peopleOfMap(1356);
const england = loadLand().england.places;
const place = (name: string) => {
  const i = w.names.indexOf(name);
  if (i < 0 || i >= w.L) throw new Error(`no place ${name}`);
  return i;
};

describe('the rule for cultivated land', () => {
  const free = place('Kraków'),
    full = place('Norwich');
  it('gives every head the same arable while the place has land to spare', () => {
    const p = ofTime(map[free]) / 4;
    expect(arableHa(w, free, p)).toBeCloseTo(w.arablePerHead * p, 9);
    expect(arableHa(w, free, 2 * p)).toBeCloseTo(2 * arableHa(w, free, p), 9);
  });
  it('stops at the land limit, however many people there are', () => {
    expect(arableHa(w, full, ofTime(map[full]))).toBeCloseTo(w.landLimit * hectares(w, full), 6);
    expect(arableHa(w, full, 10 * ofTime(map[full]))).toBe(arableHa(w, full, ofTime(map[full])));
  });
  it('never cultivates land without a yield, and nothing without people', () => {
    const cairo = place('Cairo');
    expect(w.landFertile[cairo]).toBe(0);
    expect(arableHa(w, cairo, ofTime(map[cairo]))).toBe(0);
    expect(arableHa(w, free, 0)).toBe(0);
    for (let i = 0; i < w.L; i++) {
      const x = arableHa(w, i, ofTime(map[i]));
      expect(x).toBeLessThanOrEqual(landLimitHa(w, i));
      expect(x).toBeLessThanOrEqual(w.landFertile[i] * hectares(w, i) + 1e-9);
    }
  });
});

describe('the yield curve of a place', () => {
  it('takes the best soil first: every further hectare adds less', () => {
    for (const i of [place('Kraków'), place('Norwich'), place('Paris'), place('Moscow')]) {
      const F = hectares(w, i);
      let last = Infinity;
      for (let share = 0.02; share <= 0.4; share += 0.02) {
        const marginal = (soilOf(w, i, share * F) - soilOf(w, i, (share - 0.02) * F)) / (0.02 * F);
        expect(marginal).toBeLessThanOrEqual(last + 1e-6);
        last = marginal;
      }
    }
  });
  it("adds up to the place's whole soil", () => {
    // all of England's land through the curves against the mean yield times the area (feature 1's data)
    let curve = 0,
      mean = 0;
    for (const i of england) {
      curve += soilOf(w, i, hectares(w, i));
      mean += (w.landYield[i] || 0) * hectares(w, i);
    }
    expect(Math.abs(curve / mean - 1)).toBeLessThan(0.005);
    expect(soilOf(w, england[0], 0)).toBe(0);
  });
});

describe('the calibration on England', () => {
  it('is the one stored in public/data/cultivation.json', () => {
    const stored = loadCultivation(),
      c = calibrate(w, england, map);
    expect(c.landLimit / stored.landLimit).toBeCloseTo(1, 9);
    expect(c.arablePerHead / stored.arablePerHead).toBeCloseTo(1, 9);
    expect(c.englandLand / stored.englandLand).toBeCloseTo(1, 9);
  });
  it('reproduces the arable of 1300 and the harvest of 1300–09', () => {
    const e = englandAt(w, england, map, ENGLAND_ARABLE.y1300.people);
    expect(e.arableAcres / ENGLAND_ARABLE.y1300.acres).toBeCloseTo(1, 9);
    expect(e.perHeadDay / ENGLAND_1300.kcalPerHeadDay).toBeCloseTo(1, 9);
  });
  it('reproduces the arable of 1380', () => {
    const e = englandAt(w, england, map, ENGLAND_ARABLE.y1380.people);
    expect(e.arableAcres / ENGLAND_ARABLE.y1380.acres).toBeCloseTo(1, 9);
    expect(e.arableHa).toBeCloseTo(8.73e6 * HECTARES_PER_ACRE, 0);
  });
});

describe('cultivated land in the running world', () => {
  it('is set for every place from the first day', () => {
    const { s } = newWorldState();
    expect(s.place.arable.length).toBe(w.L);
    for (let i = 0; i < w.L; i++) expect(s.place.arable[i]).toBe(arableHa(w, i, ofTime(s.place.pop[i])));
  });
  it('follows the people on the first day of a year, before the harvest is brought in', () => {
    const { s } = newWorldState();
    // a city below its land limit: its arable follows its persons
    const i = [...new Set(Array.from({ length: s.family.size }, (_, f) => s.family.cols.place[f]))].find(
      (p) => s.place.arable[p] > 0 && s.place.arable[p] < landLimitHa(w, p),
    )!;
    const arable = s.place.arable[i],
      harvest = s.place.harvest[i],
      P = s.person.cols;
    let k = 0; // every second person of the place leaves the world
    for (let id = 0; id < s.person.size; id++)
      if (s.family.cols.place[P.family[id]] === i && k++ % 2 === 0) P.died[id] = 0;
    advanceDay(s, w);
    expect(s.place.arable[i]).toBe(arable);
    s.day = 366 - 1; // 31 December 1356, a leap year
    advanceDay(s, w);
    const Q = s.person.cols; // on the first of January the dead go to the archive and the rows close up (a new table)
    let alive = 0;
    for (let id = 0; id < s.person.size; id++)
      if (s.family.cols.place[Q.family[id]] === i && Q.died[id] === ALIVE) alive++;
    expect(s.place.pop[i]).toBe(alive);
    expect(s.place.arable[i]).toBe(arableHa(w, i, ofTime(alive)));
    expect(s.place.arable[i]).toBeLessThan(arable * 0.6);
    // fewer people on the better part of the land: less harvest, but more for each of them
    expect(s.place.harvest[i]).toBeLessThan(harvest);
    expect(s.place.harvest[i]).toBeGreaterThan(harvest * 0.4);
  }, 30_000); // the jump to 31 December lets the economies of the cities compute a year of days (about 5 s)
});
