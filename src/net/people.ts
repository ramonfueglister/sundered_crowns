// What the world server tells a browser about the persons (src/sim/systems/people.ts): the persons of a place, short,
// for the figures that walk its streets, and one person in full, for the portrait and the panel a click opens.
// Read-only HTTP: GET /people/<place> and GET /person/<id> (server/main.ts).
import type { WorldState } from '../sim/state';
import { genesOf } from '../sim/systems/people';
import { NG } from '../sim/people/genes';
import { ROLE } from '../sim/systems/work';

/** The living persons of a place, as columns of equal length (JSON). */
export interface PlacePeople {
  place: number;
  /** the day of the world the list is for; age = (day − born) / 365.25 */
  day: number;
  id: number[];
  born: number[];
  /** 0 female, 1 male */
  sex: number[];
  family: number[];
}

/** The part of a person in the economy of the city (economy feature 10, src/sim/systems/economy.ts): what the economy
 *  computed for the person on the last day. Money is in £ of the calibration; flows are those of one day. */
export interface PersonEconomy {
  /** a worker (with or without work), the owner of a firm, the owner of the city's bank, or none of them: a child
   *  or an adult who does not work */
  role: 'worker' | 'owner' | 'banker' | 'none';
  /** the firm: the employer of a worker, the own firm of an owner; −1 for a worker without work and everybody else */
  firm: number;
  /** of that firm: the sector (its number in the calibration table: agriculture, industry, services), the person
   *  who owns it and the persons it employs; −1, −1 and 0 without a firm */
  sector: number; firmOwner: number; employees: number;
  /** the wage of the day before tax (0 for everybody but a worker with work), the disposable income of the day,
   *  what was spent on consumption that day, and the savings */
  wage: number; income: number; spent: number; savings: number;
}

/** The household of a person's family (economy feature 11, src/sim/systems/household.ts): the family is the purse.
 *  Money is in £ of the calibration; flows are those of the last day. */
export interface PersonHousehold {
  /** the persons of the family, those of them who work, and the baskets they consume together (an adult one, a
   *  child under 15 half) */
  persons: number; working: number; baskets: number;
  /** of the whole family: the disposable income and the spending of the day, and the savings */
  income: number; spent: number; savings: number;
  /** what this person consumed that day: the person's share by baskets of what the family spent */
  consumed: number;
}

/** One person in full. */
export interface PersonDetail {
  id: number; alive: boolean; day: number;
  female: boolean; born: number; age: number;
  mother: number; father: number; family: number;
  /** the place the person lives in and its culture (the key of src/sim/content/peoples.ts) */
  place: number; culture: string;
  iq: number;
  /** the Big Five as T-scores: openness, conscientiousness, extraversion, agreeableness, neuroticism */
  big5: [number, number, number, number, number];
  /** 68 bytes: the first allele of each of the 34 genes, then the second (src/sim/people/genes.ts) */
  genes: number[];
  /** null in a world without economies of the cities */
  economy: PersonEconomy | null;
  /** null in a world without economies of the cities */
  household: PersonHousehold | null;
}

const ROLES: Record<number, PersonEconomy['role']> = { [ROLE.worker]: 'worker', [ROLE.owner]: 'owner', [ROLE.banker]: 'banker' };

/** The part of a person in the economy of the city; null in a world without economies. */
export function personEconomy(s: WorldState, id: number): PersonEconomy | null {
  if (!s.economy.cities) return null;
  const P = s.person.cols, F = s.firm.cols, role = ROLES[P.role[id]] ?? 'none', firm = role === 'none' ? -1 : P.firm[id];
  return {
    role, firm,
    sector: firm < 0 ? -1 : F.sector[firm], firmOwner: firm < 0 ? -1 : F.owner[firm], employees: firm < 0 ? 0 : F.employees[firm],
    wage: P.wage[id], income: P.income[id], spent: P.spent[id], savings: P.savings[id],
  };
}

/** The household of a person's family; null in a world without economies. */
export function personHousehold(s: WorldState, id: number): PersonHousehold | null {
  if (!s.economy.cities) return null;
  const F = s.family.cols, f = s.person.cols.family[id];
  return { persons: F.persons[f], working: F.working[f], baskets: F.baskets[f], income: F.income[f], spent: F.spent[f], savings: F.savings[f], consumed: s.person.cols.consumed[id] };
}

export function placePeople(s: WorldState, place: number): PlacePeople {
  const P = s.person.cols, out: PlacePeople = { place, day: s.day, id: [], born: [], sex: [], family: [] };
  for (let i = 0; i < s.person.size; i++) {
    if (!s.person.alive[i] || s.family.cols.place[P.family[i]] !== place) continue;
    out.id.push(i); out.born.push(P.born[i]); out.sex.push(P.sex[i]); out.family.push(P.family[i]);
  }
  return out;
}

export function personDetail(s: WorldState, id: number, cultureKey: (index: number) => string): PersonDetail | null {
  if (!Number.isInteger(id) || id < 0 || id >= s.person.size) return null;
  const P = s.person.cols, place = s.family.cols.place[P.family[id]];
  return {
    id, alive: s.person.alive[id] === 1, day: s.day,
    female: P.sex[id] === 0, born: P.born[id], age: Math.round(((s.day - P.born[id]) / 365.25) * 10) / 10,
    mother: P.mother[id], father: P.father[id], family: P.family[id],
    place, culture: cultureKey(s.place.culture[place]),
    iq: P.iq[id], big5: [P.o[id], P.c[id], P.e[id], P.a[id], P.n[id]],
    genes: Array.from(genesOf(s, id).subarray(0, 2 * NG)),
    economy: personEconomy(s, id),
    household: personHousehold(s, id),
  };
}
