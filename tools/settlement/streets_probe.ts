// What the streets of settlement feature 3 give the world of a year (docs/SETTLEMENT_DESIGN.md): per town the parcels,
// streets and junctions, and over all towns the shares of the junctions and the distribution of the block areas,
// against the measured values (medieval Paris, data/cadastre/paris_1291.json; Lämmer et al. 2006; Strano et al. 2012).
//   npx tsx tools/settlement/streets_probe.ts 1291
import { newWorldState } from '../sim/load';
import { foundLots } from '../../src/sim/systems/lots';
import { citiesOf } from '../../src/sim/content/cities';
import { DEFAULT_TUNING } from '../../src/sim/settlement/streets';

const year = Number(process.argv[2] ?? 1291);
const t0 = Date.now();
const { s, w } = newWorldState(year, year);
const tune = process.env.TUNE
  ? (([rc, join, cross]) => ({ rc, join, cross, measure: true }))(process.env.TUNE.split(',').map(Number))
  : { ...DEFAULT_TUNING, measure: true };
const found = foundLots(s, w.ground, w.dry, tune);
if (tune) console.log('tuning', JSON.stringify(tune));
const names = new Map(citiesOf(year).map((c) => [c.site, c.name]));
let ends = 0,
  tees = 0,
  crosses = 0,
  bigE = 0,
  bigT = 0,
  bigC = 0,
  spread = 0;
const blocks: number[] = [];
const rows: string[] = [];
for (const [site, t] of found.streets) {
  spread += 'spread' in t && t.spread ? 1 : 0;
  if (t.streets.length >= 20) {
    bigE += t.nodes.ends;
    bigT += t.nodes.tees;
    bigC += t.nodes.crosses;
  }
  ends += t.nodes.ends;
  tees += t.nodes.tees;
  crosses += t.nodes.crosses;
  blocks.push(...t.blocks);
  const len = t.streets.reduce((n, q) => n + Math.abs(q.x1 - q.x0) + Math.abs(q.z1 - q.z0), 0);
  rows.push(
    `${names.get(site)}\tstreets ${t.streets.length}\tlength ${len} m\tends ${t.nodes.ends} tees ${t.nodes.tees} crosses ${t.nodes.crosses}\tblocks ${t.blocks.length}`,
  );
}
const junctions = ends + tees + crosses;
console.log(`towns ${found.streets.size}, tight ${found.tight.length}; ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(
  `junctions: ends ${(ends / junctions).toFixed(2)}, tees ${(tees / junctions).toFixed(2)}, crosses ${(crosses / junctions).toFixed(2)}`,
);
// the exponent of P(A) ~ A^−τ by the maximum likelihood of a power law above the smallest block area a_min (Clauset, Shalizi & Newman 2009, Eq. 3.1)
const big = blocks.filter((a) => a >= 200).sort((a, b) => a - b);
const tau = 1 + big.length / big.reduce((n, a) => n + Math.log(a / 200), 0);
const bigJ = bigE + bigT + bigC;
console.log(
  `towns of 20 streets and more: ends ${(bigE / bigJ).toFixed(2)}, tees ${(bigT / bigJ).toFixed(2)}, crosses ${(bigC / bigJ).toFixed(2)} (medieval Paris, Vasserot: 0.10 / 0.78 / 0.12); towns spread wider ${spread}`,
);
console.log(
  `blocks ${blocks.length}, of 200 m² and more ${big.length}: median ${big[big.length >> 1]} m², tau ${tau.toFixed(2)} (Lämmer et al. 2006: 1.9)`,
);
for (const name of ['Paris', 'Venice', 'Zürich', 'Bayonne', 'Limoges', 'Cairo']) {
  const r = rows.find((q) => q.startsWith(`${name}\t`));
  if (r) console.log(r);
}
