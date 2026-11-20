// Writes public/data/hamlets_<year>.json: for every place with persons in a new world of `year`, its persons and
// families, and those of its hamlets (src/sim/systems/hamlets.ts). The world graphic has no world server, so it reads
// the hamlets from this file to set them outside the walls of their town.
//   npx tsx tools/sim/write_hamlets.ts 1291
import { writeFileSync } from 'node:fs';
import { newWorldState, dataPath } from './load';
import { ALIVE } from '../../src/sim/state';

const year = Number(process.argv[2] ?? 1291);
const { s } = newWorldState(year, year);
const P = s.person.cols,
  F = s.family.cols;
const at = new Map<
  number,
  { persons: number; families: Set<number>; hamletPersons: number; hamletFamilies: Set<number> }
>();
for (let id = 0; id < s.person.size; id++) {
  if (!s.person.alive[id] || P.died[id] !== ALIVE) continue;
  const f = P.family[id],
    p = F.place[f];
  const o = at.get(p) ?? { persons: 0, families: new Set(), hamletPersons: 0, hamletFamilies: new Set() };
  at.set(p, o);
  o.persons++;
  o.families.add(f);
  if (F.hamlet[f]) {
    o.hamletPersons++;
    o.hamletFamilies.add(f);
  }
}
const places = [...at.keys()].sort((a, b) => a - b);
const out = {
  year,
  source: 'a new world of the year: src/sim/systems/hamlets.ts (tools/sim/write_hamlets.ts)',
  place: places,
  persons: places.map((p) => at.get(p)!.persons),
  families: places.map((p) => at.get(p)!.families.size),
  hamlet_persons: places.map((p) => at.get(p)!.hamletPersons),
  hamlet_families: places.map((p) => at.get(p)!.hamletFamilies.size),
};
writeFileSync(dataPath(`hamlets_${year}.json`), JSON.stringify(out) + '\n');
console.log(
  `hamlets_${year}.json: ${places.length} places, ${out.hamlet_families.reduce((a, b) => a + b, 0)} hamlet families`,
);
