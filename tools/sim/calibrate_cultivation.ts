// Calibrates cultivated land and harvest on England and writes public/data/cultivation.json (feature 2 of the
// economy, docs/ECONOMY_DESIGN.md). Run after the land data or the start population of the map have changed:
//   npm run land          (tools/geo/build_land.py, then this)
import { writeFileSync } from 'node:fs';
import { ENGLAND_ARABLE } from '../../src/sim/systems/cultivation';
import { ENGLAND_1300 } from '../../src/sim/systems/harvest';
import { buildWorld, dataPath, loadLand, peopleOfMap } from './load';
import { calibrate, englandAt } from './calibration';

const START = 1356;
const w = buildWorld({ landLimit: 0, arablePerHead: 0, englandLand: 1 });
const pop = peopleOfMap(START); // the people of the setup: the world itself has only its persons
const places = loadLand().england.places;
const c = calibrate(w, places, pop);
const out = {
  source:
    'Broadberry, Campbell, Klein, Overton, van Leeuwen (2010), English Economic Growth, 1270-1700: table 1 (total arable) and table 19 (people; kilocalories per head and day from arable farming)',
  method:
    `the people of each decade are spread over the ${places.length} places of England as on the map in ${START}; ` +
    'landLimit and arablePerHead are set so that the places together cultivate the arable of 1300 and of 1380, ' +
    'englandLand so that they bring in the harvest of 1300-09',
  targets: { arable: ENGLAND_ARABLE, harvest: ENGLAND_1300 },
  ...c,
};
writeFileSync(dataPath('cultivation.json'), `${JSON.stringify(out, null, 1)}\n`);
const at = (people: number) => englandAt(w, places, pop, people, c);
const e1300 = at(ENGLAND_ARABLE.y1300.people),
  e1380 = at(ENGLAND_ARABLE.y1380.people);
console.log(
  `land limit ${(100 * c.landLimit).toFixed(2)} % of a place, arable per head ${c.arablePerHead.toFixed(4)} ha, T_E ${c.englandLand.toExponential(6)}`,
);
console.log(
  `England 1300: ${(e1300.arableAcres / 1e6).toFixed(3)} m acres, ${e1300.perHeadDay.toFixed(1)} kcal per head and day, ${e1300.atLimit} of ${places.length} places at the land limit`,
);
console.log(
  `England 1380: ${(e1380.arableAcres / 1e6).toFixed(3)} m acres, ${e1380.perHeadDay.toFixed(1)} kcal per head and day, ${e1380.atLimit} of ${places.length} places at the land limit`,
);
