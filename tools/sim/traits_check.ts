// Prints what the traits do to the persons (people feature 5, docs/PEOPLE_DESIGN.md) against the studies behind
// src/sim/people/traits.ts: a world of 1291 in which only deaths, moves, weddings and births run. The slopes are
// estimated as the studies estimate them: death by a step of Cox's partial likelihood over year and whole age, a far
// move from the mean trait of the movers against all who could move, ever marrying by a logistic regression over
// those of 35 to 59 born in the world. And where the means of the traits go, which the children inherit.
// npm run traits:check [-- years]
import { loadSetup, loadWorld } from './load';
import { createWorldState } from '../../src/sim/setup';
import { ageOn } from '../../src/sim/systems/people';
import { deathsTo, settleEstates } from '../../src/sim/systems/deaths';
import { birthsTo, weddingsOn } from '../../src/sim/systems/families';
import { movesTo, offersOn, noMoves } from '../../src/sim/systems/moves';
import { ALIVE } from '../../src/sim/state';
const YEARS = Number(process.argv[2] ?? 100);
const w = loadWorld(),
  s = createWorldState(w, loadSetup(1291), 1291),
  P = s.person.cols,
  F = s.family.cols;
const TR = ['iq', 'o', 'c', 'e', 'a', 'n'] as const;
type Tr = (typeof TR)[number];
const z = (t: Tr, i: number) => (t === 'iq' ? (P.iq[i] - 100) / 15 : (P[t][i] - 50) / 10);
const living = (i: number): boolean => s.person.alive[i] !== 0 && P.died[i] === ALIVE && P.dies[i] !== ALIVE;
function traits(pick: (i: number) => boolean) {
  const m = TR.map(() => 0),
    q = TR.map(() => 0);
  let n = 0;
  for (let i = 0; i < s.person.size; i++)
    if (pick(i)) {
      n++;
      TR.forEach((t, k) => {
        const v = z(t, i);
        m[k] += v;
        q[k] += v * v;
      });
    }
  return (
    `n ${n}: ` +
    TR.map((t, k) => `${t} ${(m[k] / n).toFixed(3)} (sd ${Math.sqrt(q[k] / n - (m[k] / n) ** 2).toFixed(2)})`).join(
      ', ',
    )
  );
}
console.log('living at the start,', traits(living));
const ever = new Set<number>();
const mark = () => {
  for (let f = 0; f < s.family.size; f++)
    if (F.seat[f]) {
      if (F.woman[f] >= 0) ever.add(F.woman[f]);
      if (F.man[f] >= 0 && F.woman[f] >= 0) ever.add(F.man[f]);
    }
};
mark();
let placeOf = new Int32Array(0);
const snap = () => {
  if (placeOf.length < s.person.size) {
    const n = new Int32Array(s.person.size * 2).fill(-1);
    n.set(placeOf);
    placeOf = n;
  }
  for (let i = 0; i < s.person.size; i++) placeOf[i] = living(i) ? F.place[P.family[i]] : -1;
};
snap();
const mv = { n: 0, o: 0, a: 0, e: 0, pn: 0, po: 0, pa: 0, pe: 0 };
const cox = { c: { U: 0, I: 0 }, iq: { U: 0, I: 0 }, e: { U: 0, I: 0 }, deaths: 0, ageSum: 0 };
const moved = noMoves();
const t0 = Date.now();
let pop0 = 0;
for (let i = 0; i < s.person.size; i++) if (living(i)) pop0++;
for (let y = 1; y <= YEARS; y++) {
  const day0 = Math.round((y - 1) * 365.25),
    day1 = Math.round(y * 365.25);
  // the adults at risk at the start of the year, by whole age
  const risk: number[] = [],
    S = new Map<number, { n: number; c: number; cc: number; q: number; qq: number; e: number; ee: number }>();
  for (let i = 0; i < s.person.size; i++) {
    if (!living(i)) continue;
    const a = Math.floor(ageOn(P.born[i], day0));
    if (a < 15) continue;
    risk.push(i);
    let x = S.get(a);
    if (!x) {
      x = { n: 0, c: 0, cc: 0, q: 0, qq: 0, e: 0, ee: 0 };
      S.set(a, x);
    }
    const c = z('c', i),
      q = z('iq', i),
      e = z('e', i);
    x.n++;
    x.c += c;
    x.cc += c * c;
    x.q += q;
    x.qq += q * q;
    x.e += e;
    x.ee += e * e;
  }
  for (let mo = 1; mo <= 12; mo++) {
    const day = Math.round((y - 1 + mo / 12) * 365.25);
    deathsTo(s, day);
    movesTo(s, w, day, moved);
    for (let i = 0; i < placeOf.length && i < s.person.size; i++) {
      if (placeOf[i] < 0 || !living(i)) continue;
      const a = ageOn(P.born[i], day);
      if (a < 10 || a >= 60) continue;
      const f = P.family[i];
      if (F.man[f] === i || F.woman[f] === i) continue;
      mv.pn++;
      mv.po += z('o', i);
      mv.pa += z('a', i);
      mv.pe += z('e', i);
      if (F.place[f] !== placeOf[i]) {
        mv.n++;
        mv.o += z('o', i);
        mv.a += z('a', i);
        mv.e += z('e', i);
      }
    }
    birthsTo(s, day);
    weddingsOn(s, day);
    settleEstates(s, day);
    offersOn(s, w, day, moved);
    mark();
    snap();
  }
  for (const i of risk) {
    if (P.died[i] === ALIVE || P.died[i] > day1) continue;
    const a = Math.floor(ageOn(P.born[i], day0)),
      x = S.get(a)!;
    if (x.n < 2) continue;
    cox.c.U += z('c', i) - x.c / x.n;
    cox.c.I += x.cc / x.n - (x.c / x.n) ** 2;
    cox.iq.U += z('iq', i) - x.q / x.n;
    cox.iq.I += x.qq / x.n - (x.q / x.n) ** 2;
    cox.e.U += z('e', i) - x.e / x.n;
    cox.e.I += x.ee / x.n - (x.e / x.n) ** 2;
    cox.deaths++;
    cox.ageSum += ageOn(P.born[i], P.died[i]);
  }
  if (y % 25 === 0) {
    let n = 0,
      seats = 0,
      vac = 0;
    for (let i = 0; i < s.person.size; i++) if (living(i)) n++;
    for (let f = 0; f < s.family.size; f++)
      if (F.seat[f]) {
        seats++;
        if (F.woman[f] < 0) vac++;
      }
    console.log(`year ${y}: ${n} living, ${seats} households (${vac} vacant), ${Date.now() - t0} ms`);
  }
}
const end = Math.round(YEARS * 365.25);
console.log('living at the end,', traits(living));
console.log(
  'born in the last ten years,',
  traits((i) => living(i) && P.born[i] > end - 3652),
);
const hr = (x: { U: number; I: number }) =>
  `${Math.exp(x.U / x.I).toFixed(3)} (±${((1.96 / Math.sqrt(x.I)) * Math.exp(x.U / x.I)).toFixed(3)})`;
console.log(
  `deaths from 15 on: ${cox.deaths}, mean age ${(cox.ageSum / cox.deaths).toFixed(2)}; hazard ratio per sd: conscientiousness ${hr(cox.c)}, IQ ${hr(cox.iq)}, extraversion ${hr(cox.e)}`,
);
console.log(
  `far moves seen: ${mv.n} (${(mv.n / YEARS).toFixed(0)} a year); rate ratio per sd (exp of the movers' mean less the mean of all who could move): openness ${Math.exp(mv.o / mv.n - mv.po / mv.pn).toFixed(3)}, agreeableness ${Math.exp(mv.a / mv.n - mv.pa / mv.pn).toFixed(3)}, extraversion ${Math.exp(mv.e / mv.n - mv.pe / mv.pn).toFixed(3)}`,
);
// ever married among those of 35 to 59 born in the world: logistic regression on extraversion and openness
function logit(rows: { y: number; x: number[] }[]) {
  const k = rows[0].x.length;
  let b = new Array(k).fill(0);
  for (let it = 0; it < 30; it++) {
    const g = new Array(k).fill(0),
      H = Array.from({ length: k }, () => new Array(k).fill(0));
    for (const r of rows) {
      let eta = 0;
      for (let j = 0; j < k; j++) eta += b[j] * r.x[j];
      const p = 1 / (1 + Math.exp(-eta)),
        wgt = p * (1 - p);
      for (let j = 0; j < k; j++) {
        g[j] += (r.y - p) * r.x[j];
        for (let l = 0; l < k; l++) H[j][l] += wgt * r.x[j] * r.x[l];
      }
    }
    // solve H d = g
    const A = H.map((row, j) => [...row, g[j]]);
    for (let c = 0; c < k; c++) {
      let pv = c;
      for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[pv][c])) pv = r;
      [A[c], A[pv]] = [A[pv], A[c]];
      for (let r = 0; r < k; r++)
        if (r !== c) {
          const fct = A[r][c] / A[c][c];
          for (let l = c; l <= k; l++) A[r][l] -= fct * A[c][l];
        }
    }
    const d = A.map((row, j) => row[k] / row[j]);
    b = b.map((v, j) => v + d[j]);
    if (Math.max(...d.map(Math.abs)) < 1e-8) break;
  }
  return b;
}
for (const sex of [1, 0]) {
  const rows: { y: number; x: number[] }[] = [];
  let m = 0;
  for (let i = 0; i < s.person.size; i++) {
    if (!living(i) || P.sex[i] !== sex || P.born[i] <= 0) continue;
    const a = ageOn(P.born[i], end);
    if (a < 35 || a >= 60) continue;
    const yv = ever.has(i) ? 1 : 0;
    m += yv;
    rows.push({ y: yv, x: [1, z('e', i), z('o', i), z('c', i)] });
  }
  const b = logit(rows);
  console.log(
    `${sex ? 'men' : 'women'} of 35 to 59 born in the world: ${rows.length}, ever married ${((100 * m) / rows.length).toFixed(1)} %; odds ratio per sd: extraversion ${Math.exp(b[1]).toFixed(3)}, openness ${Math.exp(b[2]).toFixed(3)}, conscientiousness ${Math.exp(b[3]).toFixed(3)}`,
  );
}
let n = 0;
for (let i = 0; i < s.person.size; i++) if (living(i)) n++;
console.log(`persons ${pop0} -> ${n}; ${YEARS} years in ${Date.now() - t0} ms`);
