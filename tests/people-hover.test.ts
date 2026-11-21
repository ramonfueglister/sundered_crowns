// The card a figure shows while the pointer rests on it (src/people/hover_lines.ts).
import { describe, it, expect } from 'vitest';
import { hoverLines } from '../src/people/hover_lines';
import type { PersonDetail } from '../src/net/people';
import type { PersonPlan } from '../src/net/plan';
import { DAY } from '../src/sim/holy_days';
import { DOING, WHO } from '../src/sim/people/day_plan';
import { TASK } from '../src/sim/people/farm_year';

const base: PersonDetail = {
  id: 7, alive: true, day: 0, female: true, born: -12000, age: 32.9, mother: -1, father: -1, family: 3, place: 1, culture: 'english',
  iq: 104, big5: [63, 50, 38, 50, 50], genes: [], history: null, spouse: 8, children: [9, 10], town: 'London', dwelling: 'parcel', farm: null,
  economy: { role: 'worker', firm: 2, sector: 1, firmOwner: 5, employees: 4, wage: 0.01, income: 0.01, spent: 0.01, savings: 1 },
  household: { persons: 4, working: 2, baskets: 3, income: 0.02, spent: 0.02, savings: 2, consumed: 0.005, need: 0, fed: 0 },
};
const rows = (p: PersonDetail) => Object.fromEntries(hoverLines(p).rows);

describe('the card of the person under the pointer', () => {
  it('says who the person is, what they do, where and with whom they live, and the traits that stand out', () => {
    expect(hoverLines(base).title).toBe('Frau');
    expect(rows(base)).toEqual({
      Alter: '32 Jahre', Erwerb: 'Arbeiterin, Gewerbe', Wohnt: 'Parzelle in London', Familie: 'verheiratet, 2 Kinder',
      Haushalt: '4 Personen, 2 erwerbstätig', Merkmale: 'IQ 104',
    });
  });
  it('names a ruler and the crown, and marks the dead', () => {
    const p = { ...base, alive: false, history: { name: 'Eduard III.', house: 'Plantagenet', qid: 'Q1', crowns: [{ key: 'ENG', name: 'England' }], died: 10 } };
    expect(hoverLines(p).title).toBe('Eduard III. †');
    expect(rows(p).Krone).toBe('England');
  });
  it('leaves out what is not known', () => {
    const r = rows({ ...base, economy: null, household: null, spouse: -1, children: [], town: null, age: null });
    expect(r).toEqual({ Alter: 'unbekannt', Merkmale: 'IQ 104' });
  });
});

describe('the day of the person on the card', () => {
  const plan: PersonPlan = {
    kind: DAY.work, feast: false, weekday: 2, market: true, task: TASK.hay, sunrise: 4.5, sunset: 19.5, who: WHO.farm, to: null,
    slots: [[0, DOING.sleep], [4.5, DOING.work], [12, DOING.meal], [13.5, DOING.work], [19.5, DOING.home], [21, DOING.sleep]],
  };
  it('tells the kind of day and what the person does at the hour of the world, until when', () => {
    const r = rows({ ...base, plan });
    expect(r.Heute).toBe('Werktag, Markttag, Heuernte');
    expect(r.Jetzt).toBeUndefined();
    const at = (h: number) => Object.fromEntries(hoverLines({ ...base, plan }, h).rows).Jetzt;
    expect(at(10)).toBe('auf dem Feld: Heuernte (bis 12:00 Uhr)');
    // round the Mediterranean the corn is threshed out of doors, on the threshing floor (farm_year.ts)
    expect(Object.fromEntries(hoverLines({ ...base, plan: { ...plan, task: TASK.floor } }, 10).rows).Jetzt).toBe(
      'auf der Tenne: Dreschen (bis 12:00 Uhr)',
    );
    expect(at(12.5)).toBe('beim Mittagessen (bis 13:30 Uhr)');
    expect(at(22)).toBe('schläft');
    // the plan is of another day than the world's: no hour
    expect(Object.fromEntries(hoverLines({ ...base, plan }, 10, base.day + 1).rows).Jetzt).toBeUndefined();
  });
  it('names Sundays, feasts and the ruler on the way', () => {
    expect(rows({ ...base, plan: { ...plan, kind: DAY.rest, weekday: 0, market: false } }).Heute).toBe('Sonntag');
    expect(rows({ ...base, plan: { ...plan, kind: DAY.rest, feast: true, market: false } }).Heute).toBe('Feiertag');
    const ride = { ...plan, who: WHO.ruler, task: -1, market: false, to: 'Avignon', slots: [[0, DOING.sleep], [6, DOING.travel], [18, DOING.sleep]] as [number, number][] };
    expect(Object.fromEntries(hoverLines({ ...base, plan: ride }, 9).rows).Jetzt).toBe('unterwegs nach Avignon (bis 18:00 Uhr)');
  });
});

describe('the card with a world server older than spouse, children and town', () => {
  it('shows what the server sends', () => {
    const { spouse: _s, children: _c, town: _t, dwelling: _d, ...old } = base;
    expect(rows(old as PersonDetail).Familie).toBeUndefined();
    expect(rows(old as PersonDetail).Wohnt).toBeUndefined();
  });
});
