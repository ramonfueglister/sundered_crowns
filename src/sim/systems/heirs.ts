// Who is heir to a crown by the order of succession of the realm, among the persons of the chronicle and their kin
// (src/sim/content/chronicle.ts: the persons without a reign are kin, from Wikidata). src/sim/systems/succession.ts
// asks for an heir only where the world has gone another way than history and history's next holder is not there.
//
// The orders are those Kokkonen & Sundell (2014, Delivering Stability: Primogeniture and Autocratic Survival in
// European Monarchies 1000–1800, American Political Science Review 108(2), p. 443) code for every monarch, and those
// of the house laws and customs data/history/rulers/succession.csv cites for the realms they do not code:
// - primogeniture: "the principle of letting the oldest son inherit power" (p. 439), the line of a son who died before
//   his father coming before his younger brothers; coded as agnatic primogeniture (p. 441), so the kin in the male
//   line come first. OWN RULE: where no male in the male line lives, the crown goes by the same order through the
//   daughters (male preference): the sources read give no rule for an extinct male line, and the crowns of Naples,
//   Castile, Portugal and Scotland went so.
// - male primogeniture: the same in the male line only, where the source shuts the daughters out (a house law, the
//   apanages of France, the French crown after 1316).
// - cognatic primogeniture: the sons first and then the daughters, each with their line, before the brothers of the
//   last holder: "the fiefs of France passed by primogeniture to males and, in the absence of males, to females"
//   (Velde, The Salic Law, heraldica.org).
// - partible: the sons share the land (a house law before primogeniture). OWN RULE: the eldest son keeps the realm
//   and nobody the others' shares, as by male primogeniture: the world has one holder for each realm, and the
//   partitions are realms of the chronicle of their own.
// - agnatic seniority: "the ruler's oldest brother inherited the throne before any of his sons" (p. 438): the eldest
//   living male of the male line of the nearest forefather who has one.
// - election, and a union with another crown: no heir by blood (src/sim/systems/succession.ts decides).
import type { Chronicle, SuccessionOrder } from '../content/chronicle';

/** More generations than the chronicle's years hold: a guard against a loop of parents in the data. */
const MAX_GENERATIONS = 40;

/** The children of every person of the chronicle, the sons first and each by birth (unknown birth last). */
const children = new WeakMap<Chronicle, number[][]>();
function childrenOf(c: Chronicle): number[][] {
  let out = children.get(c);
  if (!out) {
    const list: number[][] = c.persons.map(() => []);
    for (let p = 0; p < c.persons.length; p++)
      for (const parent of [c.fatherOf[p], c.motherOf[p]]) if (parent !== null) list[parent].push(p);
    const born = (p: number) => c.bornDay[p] ?? Number.MAX_SAFE_INTEGER;
    for (const l of list) l.sort((a, b) => c.persons[b].sex - c.persons[a].sex || born(a) - born(b) || a - b);
    out = list;
    children.set(c, out);
  }
  return out;
}

/** The forefathers of `p` in the male line, `p` first. */
function maleLine(c: Chronicle, p: number): number[] {
  const out = [p];
  for (let q = c.fatherOf[p]; q !== null && out.length <= MAX_GENERATIONS && !out.includes(q); q = c.fatherOf[q])
    out.push(q);
  return out;
}

/** The first person in the order of primogeniture among the descendants of `a` (`a` not counted), leaving out the
 *  line of `skip`, who is `alive`; through the sons only when `agnatic`. */
function firstOfLine(
  c: Chronicle,
  a: number,
  skip: number,
  agnatic: boolean,
  alive: (p: number) => boolean,
  seen: Set<number>,
): number | null {
  for (const k of childrenOf(c)[a]) {
    if (k === skip || seen.has(k) || (agnatic && c.persons[k].sex !== 1)) continue;
    seen.add(k);
    if (alive(k)) return k;
    const below = firstOfLine(c, k, -1, agnatic, alive, seen);
    if (below !== null) return below;
  }
  return null;
}

/** Every male of the male line below `a` (`a` not counted). */
function agnates(c: Chronicle, a: number, seen: Set<number>, out: number[]): void {
  for (const k of childrenOf(c)[a]) {
    if (c.persons[k].sex !== 1 || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    agnates(c, k, seen, out);
  }
}

/** The heir of the person `left` (a person of the chronicle who held the crown) by `order`: a person of the chronicle
 *  for whom `alive` holds, or null when the order knows nobody (and for an election or a union). */
export function heirOf(
  c: Chronicle,
  left: number,
  order: SuccessionOrder,
  alive: (p: number) => boolean,
): number | null {
  if (order === 'election' || order === 'union') return null;
  const line = maleLine(c, left);
  if (order === 'agnatic_seniority') {
    for (let g = 1; g < line.length; g++) {
      const all: number[] = [];
      agnates(c, line[g], new Set(), all);
      const living = all.filter((p) => p !== left && alive(p));
      if (living.length) {
        const born = (p: number) => c.bornDay[p] ?? Number.MAX_SAFE_INTEGER;
        return living.reduce((a, b) => (born(b) < born(a) || (born(b) === born(a) && b < a) ? b : a));
      }
    }
    return null;
  }
  const passes = order === 'primogeniture' ? [true, false] : order === 'cognatic_primogeniture' ? [false] : [true];
  for (const agnatic of passes) {
    const seen = new Set([left]);
    for (let g = 0; g < line.length; g++) {
      const heir = firstOfLine(c, line[g], g > 0 ? line[g - 1] : -1, agnatic, alive, seen);
      if (heir !== null) return heir;
    }
  }
  return null;
}
