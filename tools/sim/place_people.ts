// Prints the people of every place of a new world of `year` as JSON: its living persons on the first day, in people of
// the time (persons × 100, src/sim/scale.ts). Read by tools/worldprobe/build_arable.py, so that the fields of the
// world graphic are the land the persons cultivate.
//   npx tsx tools/sim/place_people.ts 1291
import { newWorldState } from './load';
import { ofTime } from '../../src/sim/scale';

const year = Number(process.argv[2] ?? 1291);
const { s } = newWorldState(year, year);
process.stdout.write(JSON.stringify(Array.from(s.place.pop, (p) => ofTime(p))) + '\n');
