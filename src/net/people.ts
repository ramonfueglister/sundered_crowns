// What the world server tells a browser about the persons (src/sim/systems/people.ts): the persons of a place, short,
// for the figures that walk its streets, and one person in full, for the portrait and the panel a click opens.
// Read-only HTTP: GET /people/<place>, GET /people?places=<a>,<b>,… and GET /person/<uid> (server/main.ts). A person is
// named by the uid, which never changes (the row does on the first of January, src/sim/people/archive.ts); a dead
// person in the archive is told from the year of the archive the world server keeps.
import type { WorldState } from '../sim/state';
import { ALIVE, BORN_UNKNOWN, LOT_KIND, NO_LOT } from '../sim/state';
import { citiesOf } from '../sim/content/cities';
import { genesOf } from '../sim/systems/people';
import { NG } from '../sim/people/genes';
import { ROLE } from '../sim/systems/work';
import { presentPersons } from '../sim/people/living';
import { type ArchivedPersons, rowOf } from '../sim/people/archive';

/** The living persons of a place, as columns of equal length (JSON). */
export interface PlacePeople {
  place: number;
  /** the day of the world the list is for; age = (day − born) / 365.25 */
  day: number;
  /** the uids of the persons */
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
   *  who owns it (the uid) and the persons it employs; −1, −1 and 0 without a firm */
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
  /** the uid; `archived`: the person is dead and in the archive of the dead (src/sim/people/archive.ts), with what
   *  the archive keeps (no economy, no household) */
  id: number; alive: boolean; archived?: boolean; day: number;
  /** born: BORN_UNKNOWN (−2³¹) when no source gives it, and then age null */
  female: boolean; born: number; age: number | null;
  /** the uids of the parents (−1: not known) and the family the person lives in (or last lived in) */
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
  /** the uid of the other one of the couple at the head of the person's family, −1 when the person heads none with a
   *  partner (and for the dead of the archive) */
  spouse: number;
  /** the uids of the person's children in the table of the persons (not those already in the archive of the dead) */
  children: number[];
  /** the town the person lives in (the name of src/sim/content/cities.ts), null where none is known */
  town: string | null;
  /** where the family lives: on a parcel of the town, on a farmstead of a hamlet outside its walls, or nowhere known */
  dwelling: 'parcel' | 'farmstead' | null;
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
    sector: firm < 0 ? -1 : F.sector[firm], firmOwner: firm < 0 || F.owner[firm] < 0 ? -1 : P.uid[F.owner[firm]], employees: firm < 0 ? 0 : F.employees[firm],
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
  for (const i of presentPersons(s)) {
    if (P.died[i] !== ALIVE) continue;
    const o = at.get(s.family.cols.place[P.family[i]]);
    if (!o) continue;
    o.id.push(P.uid[i]); o.born.push(P.born[i]); o.sex.push(P.sex[i]); o.family.push(P.family[i]); o.hamlet.push(s.family.cols.hamlet[P.family[i]]);
  }
  return out.map((o) => at.get(o.place)!);
}

/** The person `uid` in full: from the table of the persons, else from the archive (`archived`: the year of the
 *  archive that holds the person, and the place there; the world server reads them from its disk). Null where the
 *  world has no such person. */
export function personDetail(s: WorldState, uid: number, cultureKey: (index: number) => string,
  archived?: (uid: number) => { year: ArchivedPersons; k: number } | null): PersonDetail | null {
  if (!Number.isInteger(uid) || uid < 0) return null;
  const id = rowOf(s, uid);
  if (id < 0) { const a = archived?.(uid); return a ? archivedDetail(s, a.year, a.k, cultureKey) : null; }
  const P = s.person.cols, place = s.family.cols.place[P.family[id]];
  return {
    id: uid, alive: s.person.alive[id] === 1 && P.died[id] === ALIVE, day: s.day,
    female: P.sex[id] === 0, born: P.born[id],
    age: P.born[id] === BORN_UNKNOWN ? null : Math.round(((Math.min(s.day, P.died[id]) - P.born[id]) / 365.25) * 10) / 10,
    mother: P.mother[id], father: P.father[id], family: P.family[id],
    place, culture: cultureKey(P.culture[id]),
    iq: P.iq[id], big5: [P.o[id], P.c[id], P.e[id], P.a[id], P.n[id]],
    genes: Array.from(genesOf(s, id).subarray(0, 2 * NG)),
    economy: personEconomy(s, id),
    household: personHousehold(s, id),
    history: personHistory(s, id),
    spouse: spouseOf(s, id),
    children: childrenOf(s, id),
    ...homeOf(s, id),
  };
}

/** The uid of the other one of the couple at the head of the family of the person in row `id`, −1 when there is none. */
export function spouseOf(s: WorldState, id: number): number {
  const F = s.family.cols, f = s.person.cols.family[id];
  if (f < 0) return -1;
  const other = F.man[f] === id ? F.woman[f] : F.woman[f] === id ? F.man[f] : -1;
  return other >= 0 ? s.person.cols.uid[other] : -1;
}

/** The uids of the children of the person in row `id` who are in the table of the persons (not those in the archive
 *  of the dead): one pass over the table (some hundred thousand rows, well under a millisecond). */
export function childrenOf(s: WorldState, id: number): number[] {
  const P = s.person.cols, col = P.sex[id] === 0 ? P.mother : P.father, uid = P.uid[id], out: number[] = [];
  for (let i = 0; i < s.person.size; i++) if (col[i] === uid) out.push(P.uid[i]);
  return out;
}

/** The town and the ground the person's family lives on. */
export function homeOf(s: WorldState, id: number): Pick<PersonDetail, 'town' | 'dwelling'> {
  const f = s.person.cols.family[id], lot = f < 0 ? NO_LOT : s.family.cols.lot[f], cities = citiesOf(s.startYear);
  const site = lot === NO_LOT ? -1 : s.lot.cols.site[lot], place = f < 0 ? -1 : s.family.cols.place[f];
  const city = (site >= 0 ? cities.find((c) => c.site === site) : undefined) ?? cities.find((c) => c.place === place);
  const kind = lot === NO_LOT ? -1 : s.lot.cols.kind[lot];
  return { town: city?.name ?? null, dwelling: kind === LOT_KIND.parcel ? 'parcel' : kind === LOT_KIND.farmstead ? 'farmstead' : null };
}

/** A dead person of the archive, with what the archive keeps. */
export function archivedDetail(s: WorldState, a: ArchivedPersons, k: number, cultureKey: (index: number) => string): PersonDetail {
  const A = a.cols;
  return {
    id: A.uid[k], alive: false, archived: true, day: s.day,
    female: A.sex[k] === 0, born: A.born[k],
    age: A.born[k] === BORN_UNKNOWN ? null : Math.round(((A.died[k] - A.born[k]) / 365.25) * 10) / 10,
    mother: A.mother[k], father: A.father[k], family: A.family[k],
    place: A.place[k], culture: cultureKey(A.culture[k]),
    iq: A.iq[k], big5: [A.o[k], A.c[k], A.e[k], A.a[k], A.n[k]],
    genes: Array.from(A.genes.subarray(k * 2 * NG, (k + 1) * 2 * NG)),
    economy: null, household: null, history: null, spouse: -1, children: [], town: null, dwelling: null,
  };
}
