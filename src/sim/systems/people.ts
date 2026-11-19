// The people: feature 1 of the person system (docs/PEOPLE_DESIGN.md, where every source is listed).
//
// The cities of the start year (src/sim/content/cities.ts: in 1356 the 30 largest after Chandler, in 1291 every town
// of the world graphic with people inside the world frame) get real persons at the scale of the whole world, 1:100. Each person has a birthday, a sex, a mother and a father, a family, an IQ and the Big Five;
// a family is a place and the couple at its head. The people of a place are its persons, counted (src/sim/systems/hamlets.ts).
//
// The population is founded as one that does not grow, after England around 1300 (La Poutré & Paping 2025; feature 2,
// part 2): the ages of the stationary population of its life table, and as many households as the persons fill at
// 5.8 a household. A household is a family with a seat: the woman at its head is the housewife. The persons die,
// marry and are born while the world runs (src/sim/systems/deaths.ts, src/sim/systems/families.ts). Age is never
// stored; it follows from the birthday and the day of the world.
//
// Ids are never reused: no row of either table is ever freed, so a mother, a father or a family that a person points
// to is always the one it was (the portraits seed their randomness from the person id).
import type { WorldState } from '../state';
import { PERSON_SCHEMA, FAMILY_SCHEMA, ALIVE } from '../state';
import { createTable, spawn } from '../ecs';
import { hash01 } from '../rng';
import { survival, yearsLived } from '../people/lifetable';
import { housewives, GROOM_OLDER, GROOM_AGE_MIN, AGE_WINDOW, FERTILE_TO, WIDOW_REMARRIES_BELOW, SEX_RATIO_AT_BIRTH } from '../people/marriage';
import { child, founder, origin, NG, type Bits } from '../people/genes';
import { poolOfCulture } from '../people/pools';
import { ALL_CULTURES } from '../content/peoples';
import { type City, citiesOf, hasCities } from '../content/cities';
import { SCALE, toHeads } from '../scale';
import { presentPersons } from '../people/living';

export type { City } from '../content/cities';
/** The cities of a world of 1356 (src/sim/content/cities.ts has those of every start year). */
export const CITIES: readonly City[] = citiesOf(1356);

/** The scale of the world (src/sim/scale.ts): the real world of the time has this many times its people. */
export { SCALE } from '../scale';
export { SEX_RATIO_AT_BIRTH } from '../people/marriage';
/** A child's mother was 15 to 45 at its birth (src/sim/people/marriage.ts: a wife bears until 45). */
export const MOTHER_AGE: readonly [number, number] = [15, FERTILE_TO];
/** Heritability: IQ 0.66 (Haworth et al. 2010, young adults), each Big Five trait 0.40 (Vukasović & Bratko 2015). */
export const HERITABILITY = { iq: 0.66, big5: 0.4 } as const;
export const TRAITS = ['iq', 'o', 'c', 'e', 'a', 'n'] as const;
type Trait = (typeof TRAITS)[number];
const DAYS_PER_YEAR = 365.25;

/** The age of a person on a day of the world, in years. */
export const ageOn = (born: number, day: number): number => (day - born) / DAYS_PER_YEAR;

/** People who live in each place according to the cities of a start year (several cities may lie in one place). */
export function cityPeopleByPlace(year = 1356): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of citiesOf(year)) m.set(c.place, (m.get(c.place) ?? 0) + c.people);
  return m;
}

/** A place is never smaller than the cities in it: where Chandler gives a city more people than the start setup gives
 *  its whole place, the place gets the city's (Ramon's decision of 15 November 2026). Cities count the real people of the time,
 *  places the people of the world (a hundredth of them). */
export function fitPlacesToCities(s: WorldState): void {
  for (const [p, n] of cityPeopleByPlace(s.startYear)) if (s.place.pop[p] < toHeads(n)) s.place.pop[p] = toHeads(n);
}

// --- random numbers: a stream of their own, a hash of the world's seed, the person and the number of the draw ---
// slots 0 … 21 for the founding, from 100 on for the genes (two 32-bit draws make one 64-bit draw of genes.ts)
const K = { sex: 0, age: 1, ageInYear: 2, housewife: 3, widow: 4, mother: 5, trait: 10, genes: 100 } as const;
const u01 = (seed: number, id: number, k: number) => hash01(seed, id, k);
/** A standard normal draw (Box–Muller) from the draws k and k + 1. */
function normal(seed: number, id: number, k: number): number {
  const a = Math.max(u01(seed, id, k), 2 ** -32), b = u01(seed, id, k + 1);
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
}

/** The stationary population of the life table (one for both sexes): the share of men and the cumulative share by
 *  year of age. */
function stationary() {
  const L = yearsLived(), total = L.reduce((s, v) => s + v, 0), cdf = new Float64Array(L.length);
  let r = 0; for (let i = 0; i < L.length; i++) cdf[i] = (r += L[i]) / total;
  return { pMale: SEX_RATIO_AT_BIRTH / (1 + SEX_RATIO_AT_BIRTH), cdf };
}

/** Founds the people of a world on the day it has reached (a new world: day 0 = 1 January of the start year). */
export function foundPeople(s: WorldState): void {
  const person = createTable(PERSON_SCHEMA, 32768), family = createTable(FAMILY_SCHEMA, 8192);
  s.person = person; s.family = family;
  if (!hasCities(s.startYear)) return; // the cities of the start year (src/sim/content/cities.ts)
  const st = stationary(), wifeShare = housewives(), seed = s.seed >>> 0, P = person.cols, F = family.cols, day = s.day;
  const z: Record<Trait, number[]> = { iq: [], o: [], c: [], e: [], a: [], n: [] };
  const newFamily = (place: number, man: number, woman: number, seat: number) => {
    const f = spawn(family); F.place[f] = place; F.man[f] = man; F.woman[f] = woman; F.seat[f] = seat; return f;
  };

  for (const city of citiesOf(s.startYear)) {
    const n = Math.round(city.people / SCALE);
    const ids: number[] = [], age = new Map<number, number>();
    // 1. sex and age from the stationary population
    for (let k = 0; k < n; k++) {
      const id = spawn(person); ids.push(id);
      const u = u01(seed, id, K.age);
      let y = 0; while (y < st.cdf.length - 1 && st.cdf[y] <= u) y++;
      const a = y + u01(seed, id, K.ageInYear);
      P.sex[id] = u01(seed, id, K.sex) < st.pMale ? 1 : 0;
      P.born[id] = day - Math.ceil(a * DAYS_PER_YEAR);
      P.mother[id] = -1; P.father[id] = -1; P.family[id] = -1; P.died[id] = ALIVE; P.dies[id] = ALIVE; P.bears[id] = ALIVE; P.home[id] = -1; P.moves[id] = ALIVE;
      age.set(id, ageOn(P.born[id], day));
    }
    // 2. the households: a woman is a housewife with the share of her age in a population that does not grow
    // (src/sim/people/marriage.ts), the oldest first. Her husband is the free man of 18 or older whose age is
    // nearest to hers plus three years, within ten; a housewife past the age at which a widow marries again has
    // lost him with the chance that a man three years older than she has died since she reached that age.
    const wives = ids.filter((id) => P.sex[id] === 0 && u01(seed, id, K.housewife) < wifeShare[Math.min(119, Math.floor(age.get(id)!))])
      .sort((x, y) => age.get(y)! - age.get(x)! || x - y);
    const freeMen = new Set(ids.filter((id) => P.sex[id] === 1 && age.get(id)! >= GROOM_AGE_MIN));
    for (const w of wives) {
      const aw = age.get(w)!, target = aw + GROOM_OLDER;
      const widowed = aw >= WIDOW_REMARRIES_BELOW && u01(seed, w, K.widow) >= survival(target) / survival(WIDOW_REMARRIES_BELOW + GROOM_OLDER);
      let best = -1, bestD: number = AGE_WINDOW.groom;
      if (!widowed) for (const m of freeMen) { const d = Math.abs(age.get(m)! - target); if (d < bestD || (d === bestD && m < best)) { best = m; bestD = d; } }
      if (best >= 0) freeMen.delete(best);
      const f = newFamily(city.place, best, w, 1); P.family[w] = f; if (best >= 0) P.family[best] = f;
    }
    // 3. everybody else lives in the household of a housewife who was 15 to 45 at their birth: her child, and her
    // husband's, where she has one (in the household of a widow the parents are not known)
    for (const id of ids) {
      if (P.family[id] >= 0) continue;
      const ca = age.get(id)!;
      const mothers = wives.filter((w) => { const d = age.get(w)! - ca; return d >= MOTHER_AGE[0] && d <= MOTHER_AGE[1]; });
      if (!mothers.length) continue;
      const w = mothers[Math.floor(u01(seed, id, K.mother) * mothers.length)], f = P.family[w];
      P.family[id] = f;
      if (F.man[f] >= 0) { P.mother[id] = w; P.father[id] = F.man[f]; }
    }
    // 4. whoever is left is a family of their own, without a seat
    for (const id of ids) if (P.family[id] < 0) P.family[id] = newFamily(city.place, -1, -1, 0);
    // 5. IQ and the Big Five: persons without known parents draw from the standard normal; children inherit by the
    // infinitesimal model, z = h²·(z_mother + z_father)/2 + ε with ε ~ N(0, 1 − h⁴/2), which keeps the variance at 1.
    // All parents are founders (the heads of the households have no known parents), so the founders are drawn first.
    for (const id of ids) if (P.mother[id] < 0) TRAITS.forEach((t, j) => { z[t][id] = normal(seed, id, K.trait + 2 * j); });
    for (const id of ids) {
      const mo = P.mother[id], fa = P.father[id];
      if (mo < 0) continue;
      TRAITS.forEach((t, j) => { z[t][id] = inherit(t, z[t][mo], z[t][fa], normal(seed, id, K.trait + 2 * j)); });
    }
    for (const id of ids) writeTraits(P, id, (t) => z[t][id]);
  }
  // (the genes follow the cultures: `giveGenes`, called by `foundPersonCultures`)
}
const inherit = (t: Trait, mother: number, father: number, e: number): number => {
  const h2 = t === 'iq' ? HERITABILITY.iq : HERITABILITY.big5;
  return (h2 * (mother + father)) / 2 + Math.sqrt(1 - (h2 * h2) / 2) * e;
};
function writeTraits(P: WorldState['person']['cols'], id: number, z: (t: Trait) => number): void {
  P.iq[id] = clampU8(100 + 15 * z('iq'));
  P.o[id] = clampU8(50 + 10 * z('o')); P.c[id] = clampU8(50 + 10 * z('c')); P.e[id] = clampU8(50 + 10 * z('e'));
  P.a[id] = clampU8(50 + 10 * z('a')); P.n[id] = clampU8(50 + 10 * z('n'));
}

/** A child is born to `mother` and `father` on `day`, into the family of the mother: sex, the traits inherited as at
 *  the founding (from the parents' points, which are whole numbers), the genes from both, the culture and the faith
 *  of the mother. The day of death is for the caller (src/sim/systems/families.ts). Returns the child. */
export function bearChild(s: WorldState, mother: number, father: number, day: number): number {
  const id = spawn(s.person), P = s.person.cols, seed = s.seed >>> 0;
  P.sex[id] = u01(seed, id, K.sex) < SEX_RATIO_AT_BIRTH / (1 + SEX_RATIO_AT_BIRTH) ? 1 : 0;
  P.born[id] = day; P.mother[id] = mother; P.father[id] = father; P.family[id] = P.family[mother];
  P.firm[id] = -1; P.died[id] = ALIVE; P.dies[id] = ALIVE; P.bears[id] = ALIVE;
  P.home[id] = s.family.cols.place[P.family[mother]]; P.moves[id] = ALIVE; // the first move is for the caller too (src/sim/systems/moves.ts)
  P.culture[id] = P.culture[mother]; P.faith[id] = P.faith[mother];
  const zOf = (t: Trait, x: number) => (t === 'iq' ? (P.iq[x] - 100) / 15 : (P[t][x] - 50) / 10);
  const zs = {} as Record<Trait, number>;
  TRAITS.forEach((t, j) => { zs[t] = inherit(t, zOf(t, mother), zOf(t, father), normal(seed, id, K.trait + 2 * j)); });
  writeTraits(P, id, (t) => zs[t]);
  const G = P.genes, g = (x: number) => G.subarray(x * 2 * NG, (x + 1) * 2 * NG);
  G.set(child(g(father), g(mother), geneBits(seed, id)), id * 2 * NG);
  return id;
}

/** The draws of the genes of a person: a 64-bit number per draw k, from the person's own stream. */
const geneBits = (seed: number, id: number): Bits => {
  const u = (k: number, j: number) => Math.floor(u01(seed, id, K.genes + 2 * k + j) * 4294967296);
  return Object.assign((k: number) => (BigInt(u(k, 1)) << 32n) | BigInt(u(k, 0)), { low: (k: number) => u(k, 0) });
};
/** The gene pool a person without known parents draws from: the pool of the person's culture (src/sim/people/
 *  pools.ts; portrait round 111), else, for a culture that is not known, the pool of the town's place (genes.ts
 *  `origin`, after dna.rs). */
function poolOf(s: WorldState, id: number): number {
  const P = s.person.cols, pool = poolOfCulture(ALL_CULTURES[P.culture[id]]);
  if (pool !== undefined) return pool;
  const place = s.family.cols.place[P.family[id]], c = citiesOf(s.startYear).find((x) => x.place === place);
  return c ? origin(c.lon, c.lat) : 0;
}

/** Gives every person of the towns their genes: those without known parents draw them from the gene pool of their
 *  culture, so the cultures must be set (src/sim/systems/cultures.ts `foundPersonCultures`, which calls this);
 *  everybody else takes them from their parents, the elder before the younger. The rulers are not touched: they
 *  draw theirs when they enter the world (src/sim/systems/rulers.ts). In a world that has run the persons get the
 *  genes they would have been born with (a birth draws from the child's own stream, `bearChild`). */
export function giveGenes(s: WorldState): void {
  const P = s.person.cols, G = P.genes, seed = s.seed >>> 0, ruler = new Set((s.named ?? []).map((n) => n.person));
  const born: number[] = [];
  for (let id = 0; id < s.person.size; id++) {
    if (ruler.has(id)) continue;
    if (P.mother[id] >= 0) { born.push(id); continue; }
    G.set(founder(poolOf(s, id), geneBits(seed, id)), id * 2 * NG);
  }
  // a parent is born before the child, so in the order of the birthdays every parent has genes before a child takes them
  born.sort((x, y) => P.born[x] - P.born[y] || x - y);
  const g = (x: number) => G.subarray(x * 2 * NG, (x + 1) * 2 * NG);
  for (const id of born) G.set(child(g(P.father[id]), g(P.mother[id]), geneBits(seed, id)), id * 2 * NG);
}

/** The gene bytes of a person (a view, not a copy). */
export const genesOf = (s: WorldState, id: number): Uint8Array => s.person.cols.genes.subarray(id * 2 * NG, (id + 1) * 2 * NG);
const clampU8 = (v: number) => Math.min(255, Math.max(0, Math.round(v)));

/** The living persons of a place (the people of its cities, and the rulers who live there). */
export function personsIn(s: WorldState, place: number): number[] {
  const out: number[] = [];
  for (const i of presentPersons(s)) {
    if (s.person.cols.died[i] === ALIVE && s.family.cols.place[s.person.cols.family[i]] === place) out.push(i);
  }
  return out;
}
