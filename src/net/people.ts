// What the world server tells a browser about the persons (src/sim/systems/people.ts): the persons of a place, short,
// for the figures that walk its streets, and one person in full, for the portrait and the panel a click opens.
// Read-only HTTP: GET /people/<place>, GET /people?places=<a>,<b>,… and GET /person/<id> (server/main.ts).
import type { WorldState } from '../sim/state';
import { ALIVE, BORN_UNKNOWN, LOT_KIND, NO_LOT } from '../sim/state';
import { farmHarvest, placeFarmFields } from '../sim/systems/fields';
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
  /** 1: the person's family lives in a hamlet outside the walls (src/sim/systems/hamlets.ts) */
  hamlet: number[];
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
  /** what the food the family needs cost that day, and the part of it the family covered, 0 to 1 (economy feature
   *  15); `need` 0: the family's place has no economy */
  need: number; fed: number;
}

/** One person in full. */
export interface PersonDetail {
  id: number; alive: boolean; day: number;
  /** born: BORN_UNKNOWN (−2³¹) when no source gives it, and then age null */
  female: boolean; born: number; age: number | null;
  mother: number; father: number; family: number;
  /** the place the person lives in and its culture (the key of src/sim/content/peoples.ts) */
  place: number; culture: string;
  iq: number;
  /** the Big Five as T-scores: openness, conscientiousness, extraversion, agreeableness, neuroticism */
  big5: [number, number, number, number, number];
  /** 100 bytes: the first allele of each of the 50 genes, then the second (src/sim/people/genes.ts) */
  genes: number[];
  /** null in a world without economies of the cities */
  economy: PersonEconomy | null;
  /** null in a world without economies of the cities */
  household: PersonHousehold | null;
  /** a person of history (a ruler, src/sim/systems/rulers.ts); null for everybody else */
  history: PersonHistory | null;
  /** the farmstead of the person's family and its fields (settlement feature 4); null for a family without one */
  farm: PersonFarm | null;
}

/** The farmstead of a person's family and its fields (settlement feature 4, src/sim/systems/fields.ts). */
export interface PersonFarm {
  /** in how many courses its land is tilled (3 or 2; 0 while it has no fields) */
  courses: number;
  /** the furlongs it holds whole and the strips it has in the furlongs of its hamlet's open field, and their hectares
   *  (the land of a hundred farms of the time: a farmstead of the world stands for a hundred) */
  furlongs: number; strips: number; hectares: number;
  /** the farmstead's part of its place's harvest of the year (kilocalories, at 1 : 100 as the harvest), and the living
   *  persons of the families on the farmstead */
  harvest: number; persons: number;
}

/** The farmstead of a person's family and its fields; null when the family has none. */
export function personFarm(s: WorldState, id: number): PersonFarm | null {
  const f = s.person.cols.family[id], lot = s.family.cols.lot[f];
  if (lot === NO_LOT || !s.lot.alive[lot] || s.lot.cols.kind[lot] !== LOT_KIND.farmstead) return null;
  const fields = placeFarmFields(s, s.lot.cols.place[lot]), mine = fields.get(lot) ?? { furlongs: 0, strips: 0, hectares: 0 };
  let courses = 0;
  for (let k = 0; s.field && k < s.field.size; k++) if (s.field.alive[k] && s.field.cols.hamlet[k] === s.lot.cols.hamlet[lot]) { courses = s.field.cols.courses[k]; break; }
  const P = s.person.cols, F = s.family.cols;
  let persons = 0;
  for (let i = 0; i < s.person.size; i++) if (s.person.alive[i] && P.died[i] === ALIVE && F.lot[P.family[i]] === lot) persons++;
  return { courses, ...mine, harvest: farmHarvest(s, lot, fields), persons };
}

/** Who a person of history is: the name, the house and the Wikidata id of the sources, the realms whose crown the
 *  person holds on the day, and the day of death (null while the person lives). */
export interface PersonHistory {
  name: string; house: string; qid: string;
  /** the realms: the key (the id of the setup) and the German short name */
  crowns: { key: string; name: string }[];
  died: number | null;
}

export function personHistory(s: WorldState, id: number): PersonHistory | null {
  const n = (s.named ?? []).find((x) => x.person === id);
  if (!n) return null;
  const crowns: PersonHistory['crowns'] = [];
  for (let r = 0; r < s.realm.size; r++) {
    if (s.realm.cols.holder[r] !== id) continue;
    const t = s.realmText[r];
    crowns.push({ key: t.key, name: t.name.de ?? t.name.en });
  }
  const d = s.person.cols.died[id];
  return { name: n.name, house: n.house, qid: n.qid, crowns, died: d === ALIVE ? null : d };
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
  return { persons: F.persons[f], working: F.working[f], baskets: F.baskets[f], income: F.income[f], spent: F.spent[f], savings: F.savings[f], consumed: s.person.cols.consumed[id], need: F.need[f], fed: F.fed[f] };
}

export function placePeople(s: WorldState, place: number): PlacePeople {
  return manyPlacesPeople(s, [place])[0];
}

/** The most places one request may ask for (GET /people?places=…). */
export const MAX_PLACES_PER_REQUEST = 200;

/** The living persons of several places, one list each in the order asked, in a single pass over the persons: the
 *  figures of a world with persons in hundreds of towns ask for them in a few requests, not one per place. */
export function manyPlacesPeople(s: WorldState, places: readonly number[]): PlacePeople[] {
  const P = s.person.cols, out = places.map((place): PlacePeople => ({ place, day: s.day, id: [], born: [], sex: [], family: [], hamlet: [] }));
  const at = new Map<number, PlacePeople>();
  out.forEach((o) => { if (!at.has(o.place)) at.set(o.place, o); });
  for (let i = 0; i < s.person.size; i++) {
    if (!s.person.alive[i] || P.died[i] !== ALIVE) continue;
    const o = at.get(s.family.cols.place[P.family[i]]);
    if (!o) continue;
    o.id.push(i); o.born.push(P.born[i]); o.sex.push(P.sex[i]); o.family.push(P.family[i]); o.hamlet.push(s.family.cols.hamlet[P.family[i]]);
  }
  return out.map((o) => at.get(o.place)!);
}

export function personDetail(s: WorldState, id: number, cultureKey: (index: number) => string): PersonDetail | null {
  if (!Number.isInteger(id) || id < 0 || id >= s.person.size) return null;
  const P = s.person.cols, place = s.family.cols.place[P.family[id]];
  return {
    id, alive: s.person.alive[id] === 1 && P.died[id] === ALIVE, day: s.day,
    female: P.sex[id] === 0, born: P.born[id],
    age: P.born[id] === BORN_UNKNOWN ? null : Math.round(((Math.min(s.day, P.died[id]) - P.born[id]) / 365.25) * 10) / 10,
    mother: P.mother[id], father: P.father[id], family: P.family[id],
    place, culture: cultureKey(P.culture[id]),
    iq: P.iq[id], big5: [P.o[id], P.c[id], P.e[id], P.a[id], P.n[id]],
    genes: Array.from(genesOf(s, id).subarray(0, 2 * NG)),
    economy: personEconomy(s, id),
    household: personHousehold(s, id),
    history: personHistory(s, id),
    farm: personFarm(s, id),
  };
}
