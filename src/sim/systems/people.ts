// The people: feature 1 of the person system (docs/PEOPLE_DESIGN.md, where every source is listed).
//
// The 30 largest cities of 1356 after Chandler (src/sim/content/cities_1356.json) get real persons at the scale of
// the whole world, 1:100. Each person has a birthday, a sex, a mother and a father, a family, an IQ and the Big Five;
// a family is a place and the couple at its head. The rest of every place stays a number (place.pop), as before.
//
// The population is built once, when the world is founded, and does not change yet: nobody is born, dies or marries
// while the world runs. Age is never stored; it follows from the birthday and the day of the world.
//
// Ids are never reused: no row of either table is ever freed, so a mother, a father or a family that a person points
// to is always the one it was (the portraits seed their randomness from the person id).
import type { WorldState } from '../state';
import { PERSON_SCHEMA, FAMILY_SCHEMA, ALIVE } from '../state';
import { createTable, spawn } from '../ecs';
import { hash01 } from '../rng';
import { personYears, type Sex } from '../people/lifetable';
import { child, founder, origin, NG } from '../people/genes';
import { type City, citiesOf, hasCities } from '../content/cities';
import { SCALE, toHeads } from '../scale';

export type { City } from '../content/cities';
/** The cities of a world of 1356 (src/sim/content/cities.ts has those of every start year). */
export const CITIES: readonly City[] = citiesOf(1356);

/** The scale of the world (src/sim/scale.ts): the real world of the time has this many times its people. */
export { SCALE } from '../scale';
/** Coale-Demeny West level 3: life expectancy at birth of women 25 years (Bailey & Rigby 2012: 20 to 25 in the
 *  Middle Ages; Ohlin 1966: about 25 for the nobility around 1300). The population is stationary. */
export const LIFE_TABLE_LEVEL = 3;
/** Boys per girl at birth (assumption: the usual biological value; no source opened). */
export const SEX_RATIO_AT_BIRTH = 1.05;
/** Mean age at first marriage, England around 1300 (La Poutré & Paping 2025). */
export const MARRIAGE_AGE: Record<Sex, number> = { f: 24, m: 27 };
/** Spread of the age at first marriage (assumption: no source read). */
export const MARRIAGE_AGE_SD = 4;
/** Nobody marries below this age (assumption, as the youngest mother below). */
export const MARRIAGE_AGE_MIN = 15;
/** A child's mother was 15 to 49 at its birth. */
export const MOTHER_AGE: readonly [number, number] = [15, 49];
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
const K = { sex: 0, age: 1, ageInYear: 2, marriage: 3, mother: 5, trait: 10, genes: 100 } as const;
const u01 = (seed: number, id: number, k: number) => hash01(seed, id, k);
/** A standard normal draw (Box–Muller) from the draws k and k + 1. */
function normal(seed: number, id: number, k: number): number {
  const a = Math.max(u01(seed, id, k), 2 ** -32), b = u01(seed, id, k + 1);
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
}

/** The stationary population of a life table: the share of each sex and the cumulative share by year of age. */
function stationary(level: number) {
  const L = { f: personYears('f', level), m: personYears('m', level) };
  const sum = (a: Float64Array) => a.reduce((s, v) => s + v, 0);
  const pMale = (SEX_RATIO_AT_BIRTH * sum(L.m)) / (SEX_RATIO_AT_BIRTH * sum(L.m) + sum(L.f));
  const cdf = (a: Float64Array) => { const t = sum(a), c = new Float64Array(a.length); let r = 0; for (let i = 0; i < a.length; i++) c[i] = (r += a[i]) / t; return c; };
  return { pMale, cdf: { f: cdf(L.f), m: cdf(L.m) } };
}

/** Founds the people of a world on its first day (day 0 = 1 January of the start year). */
export function foundPeople(s: WorldState): void {
  const person = createTable(PERSON_SCHEMA, 32768), family = createTable(FAMILY_SCHEMA, 8192);
  s.person = person; s.family = family;
  if (!hasCities(s.startYear)) return; // the cities of the start year (src/sim/content/cities.ts)
  const st = stationary(LIFE_TABLE_LEVEL), seed = s.seed >>> 0, P = person.cols, F = family.cols;
  const z: Record<Trait, number[]> = { iq: [], o: [], c: [], e: [], a: [], n: [] };
  const newFamily = (place: number, man: number, woman: number) => {
    const f = spawn(family); F.place[f] = place; F.man[f] = man; F.woman[f] = woman; return f;
  };

  for (const city of citiesOf(s.startYear)) {
    const n = Math.round(city.people / SCALE);
    const ids: number[] = [], age = new Map<number, number>(), marriageAge = new Map<number, number>();
    // 1. sex and age from the stationary population; the personal age at first marriage
    for (let k = 0; k < n; k++) {
      const id = spawn(person); ids.push(id);
      const sex: Sex = u01(seed, id, K.sex) < st.pMale ? 'm' : 'f';
      const c = st.cdf[sex], u = u01(seed, id, K.age);
      let y = 0; while (y < c.length - 1 && c[y] <= u) y++;
      const a = y + u01(seed, id, K.ageInYear);
      P.sex[id] = sex === 'm' ? 1 : 0;
      P.born[id] = -Math.ceil(a * DAYS_PER_YEAR);
      P.mother[id] = -1; P.father[id] = -1; P.family[id] = -1; P.died[id] = ALIVE;
      age.set(id, ageOn(P.born[id], 0));
      marriageAge.set(id, Math.max(MARRIAGE_AGE_MIN, MARRIAGE_AGE[sex] + MARRIAGE_AGE_SD * normal(seed, id, K.marriage)));
    }
    const ofAge = (id: number) => age.get(id)! >= marriageAge.get(id)!;
    // 2. couples: each woman of marrying age, oldest first, takes the unmarried man of marrying age whose age is
    // nearest to hers plus the difference of the mean marriage ages
    const gap = MARRIAGE_AGE.m - MARRIAGE_AGE.f;
    const women = ids.filter((id) => P.sex[id] === 0 && ofAge(id)).sort((x, y) => age.get(y)! - age.get(x)! || x - y);
    const freeMen = new Set(ids.filter((id) => P.sex[id] === 1 && ofAge(id)));
    const wives: number[] = [];
    for (const w of women) {
      let best = -1, bestD = Infinity;
      for (const m of freeMen) { const d = Math.abs(age.get(m)! - (age.get(w)! + gap)); if (d < bestD || (d === bestD && m < best)) { best = m; bestD = d; } }
      if (best < 0) break;
      freeMen.delete(best);
      const f = newFamily(city.place, best, w); P.family[best] = f; P.family[w] = f; wives.push(w);
    }
    // 3. children: everybody below their marriage age lives with a wife who was 15 to 49 at their birth, and her husband
    for (const id of ids) {
      if (P.family[id] >= 0 || ofAge(id)) continue;
      const ca = age.get(id)!;
      const mothers = wives.filter((w) => { const d = age.get(w)! - ca; return d >= MOTHER_AGE[0] && d <= MOTHER_AGE[1]; });
      if (!mothers.length) continue;
      const w = mothers[Math.floor(u01(seed, id, K.mother) * mothers.length)], f = P.family[w];
      P.mother[id] = w; P.father[id] = F.man[f]; P.family[id] = f;
    }
    // 4. whoever is left (unmarried adults, children without a mother) is a family of their own
    for (const id of ids) {
      if (P.family[id] >= 0) continue;
      const m = P.sex[id] === 1;
      P.family[id] = newFamily(city.place, m && ofAge(id) ? id : -1, !m && ofAge(id) ? id : -1);
    }
    // 5. IQ and the Big Five: persons without known parents draw from the standard normal; children inherit by the
    // infinitesimal model, z = h²·(z_mother + z_father)/2 + ε with ε ~ N(0, 1 − h⁴/2), which keeps the variance at 1.
    // All parents are founders (children are unmarried), so the founders are drawn first.
    for (const id of ids) if (P.mother[id] < 0) TRAITS.forEach((t, j) => { z[t][id] = normal(seed, id, K.trait + 2 * j); });
    for (const id of ids) {
      const mo = P.mother[id], fa = P.father[id];
      if (mo < 0) continue;
      TRAITS.forEach((t, j) => {
        const h2 = t === 'iq' ? HERITABILITY.iq : HERITABILITY.big5;
        z[t][id] = (h2 * (z[t][mo] + z[t][fa])) / 2 + Math.sqrt(1 - (h2 * h2) / 2) * normal(seed, id, K.trait + 2 * j);
      });
    }
    for (const id of ids) {
      P.iq[id] = clampU8(100 + 15 * z.iq[id]);
      P.o[id] = clampU8(50 + 10 * z.o[id]); P.c[id] = clampU8(50 + 10 * z.c[id]); P.e[id] = clampU8(50 + 10 * z.e[id]);
      P.a[id] = clampU8(50 + 10 * z.a[id]); P.n[id] = clampU8(50 + 10 * z.n[id]);
    }
  }
  giveGenes(s);
}

/** The draws of the genes of a person: a 64-bit number per draw k, from the person's own stream. */
const geneBits = (seed: number, id: number) => (k: number) => {
  const u = (j: number) => BigInt(Math.floor(u01(seed, id, K.genes + 2 * k + j) * 4294967296));
  return (u(1) << 32n) | u(0);
};
/** The gene pool of each city place of a start year: the origin of the place (genes.ts, after dna.rs). */
function poolOf(year: number, place: number): number {
  const c = citiesOf(year).find((x) => x.place === place);
  return c ? origin(c.lon, c.lat) : 0;
}

/** Gives every person founded on the first day their genes: those without known parents draw them from the gene pool
 *  of their city, children take them from their parents (all parents of the first day have none known themselves). */
export function giveGenes(s: WorldState): void {
  const P = s.person.cols, F = s.family.cols, G = P.genes, seed = s.seed >>> 0;
  for (let id = 0; id < s.person.size; id++) {
    if (P.mother[id] >= 0) continue;
    G.set(founder(poolOf(s.startYear, F.place[P.family[id]]), geneBits(seed, id)), id * 2 * NG);
  }
  for (let id = 0; id < s.person.size; id++) {
    const m = P.mother[id], f = P.father[id];
    if (m < 0) continue;
    if (P.mother[m] >= 0 || P.mother[f] >= 0) throw new Error(`person ${id}: a parent has parents; found the elder first`);
    const g = (x: number) => G.subarray(x * 2 * NG, (x + 1) * 2 * NG);
    G.set(child(g(f), g(m), geneBits(seed, id)), id * 2 * NG);
  }
}

/** The 68 gene bytes of a person (a view, not a copy). */
export const genesOf = (s: WorldState, id: number): Uint8Array => s.person.cols.genes.subarray(id * 2 * NG, (id + 1) * 2 * NG);
const clampU8 = (v: number) => Math.min(255, Math.max(0, Math.round(v)));

/** The living persons of a place (the people of its cities, and the rulers who live there). */
export function personsIn(s: WorldState, place: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.person.size; i++) {
    if (s.person.alive[i] && s.person.cols.died[i] === ALIVE && s.family.cols.place[s.person.cols.family[i]] === place) out.push(i);
  }
  return out;
}
