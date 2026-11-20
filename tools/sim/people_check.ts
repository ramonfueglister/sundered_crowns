// Prints feature 1 of the people (docs/PEOPLE_DESIGN.md) against history: the persons of the 30 cities of a world
// founded in 1356, the shares that the sources give, and the inheritance of IQ and the Big Five.
// npm run people:check [-- worlds]
import { loadSetup, loadWorld } from './load';
import { createWorldState } from '../../src/sim/setup';
import { ageOn, CITIES, SCALE, HERITABILITY, TRAITS } from '../../src/sim/systems/people';
import type { WorldState } from '../../src/sim/state';

const WORLDS = Number(process.argv[2] ?? 5);
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const sd = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};
function slope(x: number[], y: number[]) {
  const mx = mean(x),
    my = mean(y);
  let n = 0,
    d = 0;
  for (let i = 0; i < x.length; i++) {
    n += (x[i] - mx) * (y[i] - my);
    d += (x[i] - mx) ** 2;
  }
  return n / d;
}

function figures(s: WorldState) {
  const P = s.person.cols,
    F = s.family.cols,
    N = s.person.size;
  const ages: number[] = [],
    women14: number[] = [],
    sizes = new Map<number, number>();
  let married14 = 0,
    male = 0,
    children = 0,
    orphans = 0;
  for (let i = 0; i < N; i++) {
    const a = ageOn(P.born[i], 0);
    ages.push(a);
    if (P.sex[i]) male++;
    sizes.set(P.family[i], (sizes.get(P.family[i]) ?? 0) + 1);
    if (P.sex[i] === 0 && a >= 14) {
      women14.push(i);
      if (F.woman[P.family[i]] === i && F.man[P.family[i]] >= 0) married14++;
    }
    if (P.mother[i] >= 0) children++;
    else if (F.man[P.family[i]] !== i && F.woman[P.family[i]] !== i) orphans++;
  }
  const trait = (t: (typeof TRAITS)[number]) => {
    const v: number[] = [];
    for (let i = 0; i < N; i++) v.push(P[t][i]);
    return v;
  };
  const reg = (t: (typeof TRAITS)[number]) => {
    const x: number[] = [],
      y: number[] = [];
    const v = P[t];
    for (let i = 0; i < N; i++)
      if (P.mother[i] >= 0) {
        x.push((v[P.mother[i]] + v[P.father[i]]) / 2);
        y.push(v[i]);
      }
    return slope(x, y);
  };
  const fam = [...sizes.values()];
  return {
    persons: N,
    families: s.family.size,
    meanAge: mean(ages),
    under15: ages.filter((a) => a < 15).length / N,
    over60: ages.filter((a) => a >= 60).length / N,
    male: male / N,
    married14: married14 / women14.length,
    familySize: mean(fam),
    familySizeCouples: mean([...sizes].filter(([f]) => F.man[f] >= 0 && F.woman[f] >= 0).map(([, n]) => n)),
    alone: fam.filter((n) => n === 1).length / fam.length,
    children: children / N,
    orphans: orphans / N,
    traits: TRAITS.map((t) => ({ t, mean: mean(trait(t)), sd: sd(trait(t)), slope: reg(t) })),
  };
}

const w = loadWorld(),
  setup = loadSetup(1356);
const runs = Array.from({ length: WORLDS }, (_, k) => figures(createWorldState(w, setup, 1356 + k)));
const avg = (f: (r: ReturnType<typeof figures>) => number) => mean(runs.map(f));
const pct = (v: number) => `${(100 * v).toFixed(1)} %`;
console.log(`${WORLDS} worlds founded 1356, ${CITIES.length} cities, scale 1:${SCALE}`);
console.log(`persons ${avg((r) => r.persons).toFixed(0)}, families ${avg((r) => r.families).toFixed(0)}`);
console.log(
  `mean age ${avg((r) => r.meanAge).toFixed(1)}, under 15 ${pct(avg((r) => r.under15))}, 60 and over ${pct(avg((r) => r.over60))}, male ${pct(avg((r) => r.male))}`,
);
console.log(`married women of 14 and over ${pct(avg((r) => r.married14))}   (poll tax 1377: about 60 %, Briggs 2024)`);
console.log(
  `persons per family ${avg((r) => r.familySize).toFixed(2)}, per family with a couple ${avg((r) => r.familySizeCouples).toFixed(2)}   (households c. 1300: 5.8, La Poutré & Paping 2025)`,
);
console.log(
  `families of one ${pct(avg((r) => r.alone))}, children with parents ${pct(avg((r) => r.children))}, children on their own ${pct(avg((r) => r.orphans))}`,
);
for (let j = 0; j < TRAITS.length; j++) {
  const t = TRAITS[j],
    h2 = t === 'iq' ? HERITABILITY.iq : HERITABILITY.big5;
  console.log(
    `${t.padEnd(3)} mean ${avg((r) => r.traits[j].mean).toFixed(2)} sd ${avg((r) => r.traits[j].sd).toFixed(2)} slope child on midparent ${avg((r) => r.traits[j].slope).toFixed(3)} (h² ${h2})`,
  );
}
