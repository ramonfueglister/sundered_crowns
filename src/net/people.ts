// What the world server tells a browser about the persons (src/sim/systems/people.ts): the persons of a place, short,
// for the figures that walk its streets, and one person in full, for the portrait and the panel a click opens.
// Read-only HTTP: GET /people/<place> and GET /person/<id> (server/main.ts).
import type { WorldState } from '../sim/state';
import { genesOf } from '../sim/systems/people';
import { NG } from '../sim/people/genes';

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
  };
}
