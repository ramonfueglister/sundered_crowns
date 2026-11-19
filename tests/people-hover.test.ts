// The card a figure shows while the pointer rests on it (src/people/hover_lines.ts).
import { describe, it, expect } from 'vitest';
import { hoverLines } from '../src/people/hover_lines';
import type { PersonDetail } from '../src/net/people';

const base: PersonDetail = {
  id: 7,
  alive: true,
  day: 0,
  female: true,
  born: -12000,
  age: 32.9,
  mother: -1,
  father: -1,
  family: 3,
  place: 1,
  culture: 'english',
  iq: 104,
  big5: [63, 50, 38, 50, 50],
  genes: [],
  history: null,
  spouse: 8,
  children: [9, 10],
  town: 'London',
  dwelling: 'parcel',
  economy: {
    role: 'worker',
    firm: 2,
    sector: 1,
    firmOwner: 5,
    employees: 4,
    wage: 0.01,
    income: 0.01,
    spent: 0.01,
    savings: 1,
  },
  household: {
    persons: 4,
    working: 2,
    baskets: 3,
    income: 0.02,
    spent: 0.02,
    savings: 2,
    consumed: 0.005,
    need: 0,
    fed: 0,
  },
};
const rows = (p: PersonDetail) => Object.fromEntries(hoverLines(p).rows);

describe('the card of the person under the pointer', () => {
  it('says who the person is, what they do, where and with whom they live, and the traits that stand out', () => {
    expect(hoverLines(base).title).toBe('Frau');
    expect(rows(base)).toEqual({
      Alter: '32 Jahre',
      Erwerb: 'Arbeiterin, Gewerbe',
      Wohnt: 'Parzelle in London',
      Familie: 'verheiratet, 2 Kinder',
      Haushalt: '4 Personen, 2 erwerbstätig',
      Merkmale: 'IQ 104, offen, zurückhaltend',
    });
  });
  it('names a ruler and the crown, and marks the dead', () => {
    const p = {
      ...base,
      alive: false,
      history: {
        name: 'Eduard III.',
        house: 'Plantagenet',
        qid: 'Q1',
        crowns: [{ key: 'ENG', name: 'England' }],
        died: 10,
      },
    };
    expect(hoverLines(p).title).toBe('Eduard III. †');
    expect(rows(p).Krone).toBe('England');
  });
  it('leaves out what is not known', () => {
    const r = rows({ ...base, economy: null, household: null, spouse: -1, children: [], town: null, age: null });
    expect(r).toEqual({ Alter: 'unbekannt', Merkmale: 'IQ 104, offen, zurückhaltend' });
  });
});

describe('the card with a world server older than spouse, children and town', () => {
  it('shows what the server sends', () => {
    const { spouse: _s, children: _c, town: _t, dwelling: _d, ...old } = base;
    expect(rows(old as PersonDetail).Familie).toBeUndefined();
    expect(rows(old as PersonDetail).Wohnt).toBeUndefined();
  });
});
