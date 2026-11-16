// Step 3 of the world of towns (src/sim/systems/hamlets.ts): the families who live from agriculture live in hamlets
// outside the walls of their town, a place has only its persons, and the arable and the harvest come from them.
import { describe, it, expect } from 'vitest';
import { newWorldState, peopleOfMap } from '../tools/sim/load';
import { AGRICULTURE, residents, farmersOf } from '../src/sim/systems/hamlets';
import { ROLE } from '../src/sim/systems/work';
import { ALIVE, STATE_VERSION } from '../src/sim/state';
import { arableHa } from '../src/sim/systems/cultivation';
import { kcalPerHeadDay } from '../src/sim/systems/harvest';
import { ofTime } from '../src/sim/scale';
import { upgradeState } from '../src/sim/upgrade';
import { hashState } from '../src/sim/snapshot';
import { manyPlacesPeople } from '../src/net/people';
import { placeDetail } from '../src/net/views';
import { loadSetup } from '../tools/sim/load';

const { s, w } = newWorldState(1291, 1291);
const P = s.person.cols, F = s.family.cols;
const living = (id: number) => s.person.alive[id] === 1 && P.died[id] === ALIVE;

describe('the hamlets of a world of 1291', () => {
  it('house exactly the families with a member who works for a firm of agriculture or owns one', () => {
    const farm = new Uint8Array(s.family.size);
    for (let id = 0; id < s.person.size; id++) {
      if (!living(id) || (P.role[id] !== ROLE.worker && P.role[id] !== ROLE.owner) || P.firm[id] < 0) continue;
      if (s.firm.cols.sector[P.firm[id]] === AGRICULTURE) farm[P.family[id]] = 1;
    }
    let differ = 0, hamlets = 0;
    for (let f = 0; f < s.family.size; f++) { if (farm[f] !== F.hamlet[f]) differ++; hamlets += F.hamlet[f]; }
    expect(differ).toBe(0);
    expect(hamlets).toBeGreaterThan(10_000);
  });
  it('hold about three quarters of the persons, as the economies of the towns put them in agriculture', () => {
    const { people, farmers } = residents(s);
    const all = people.reduce((a, b) => a + b, 0), farm = farmers.reduce((a, b) => a + b, 0);
    expect(farm / all).toBeGreaterThan(0.6); expect(farm / all).toBeLessThan(0.85);
    const paris = w.names.indexOf('Paris');
    expect(farmersOf(s, paris)).toBe(farmers[paris]);
    expect(farmers[paris]).toBeGreaterThan(0); expect(farmers[paris]).toBeLessThan(people[paris]);
  });
  it('keep their families in the place of their town; rulers live in town', () => {
    for (const n of s.named) expect(F.hamlet[P.family[n.person]]).toBe(0);
  });
});

describe('the people of a place', () => {
  it('are its persons and nobody else: a place without persons has no people, no arable and no harvest', () => {
    const { people } = residents(s);
    let empty = 0, all = 0;
    for (let i = 0; i < w.L; i++) {
      expect(s.place.pop[i]).toBe(people[i]);
      all += people[i];
      if (people[i] === 0) { empty++; expect(s.place.arable[i]).toBe(0); expect(s.place.harvest[i]).toBe(0); }
      else expect(s.place.arable[i]).toBe(arableHa(w, i, ofTime(people[i])));
    }
    let alive = 0; for (let id = 0; id < s.person.size; id++) if (living(id)) alive++;
    expect(all).toBe(alive);
    expect(empty).toBeGreaterThan(w.L - 1000);
    // the setup's numbers are only the start of the persons, not people of the world
    expect(all).toBeLessThan(peopleOfMap(1291).reduce((a, b) => a + b, 0) / 10);
  });
  it('are fed by their hamlets: a harvest per head of the time in most towns', () => {
    let fed = 0, towns = 0;
    for (let i = 0; i < w.L; i++) {
      if (!(s.place.pop[i] > 0)) continue;
      towns++;
      const k = kcalPerHeadDay(s.place.harvest[i], s.place.pop[i]);
      expect(k).toBeLessThan(5000);
      if (k > 500) fed++;
    }
    expect(towns).toBeGreaterThan(500);
    expect(fed / towns).toBeGreaterThan(0.5);
  });
  it('tell a client who lives in a hamlet', () => {
    const paris = w.names.indexOf('Paris');
    const [list] = manyPlacesPeople(s, [paris]);
    expect(list.hamlet.length).toBe(list.id.length);
    list.id.forEach((id, k) => expect(list.hamlet[k]).toBe(F.hamlet[P.family[id]]));
    expect(placeDetail(s, w, paris)!.harvest!.farmers).toBe(list.hamlet.filter((h) => h === 1).length);
  });
});

describe('a world of 1291 saved before the hamlets', () => {
  it('gets them by the upgrade from 16 and encodes as a new world', () => {
    const old = structuredClone(s);
    old.v = 16;
    delete (old.family.cols as Record<string, unknown>).hamlet;
    old.place.pop.set(peopleOfMap(1291)); // the numbers of the setup, as version 16 kept them
    old.place.arable.fill(1); old.place.harvest.fill(1);
    expect(hashState(old)).not.toBe(hashState(s));
    const up = upgradeState(old, w, () => loadSetup(1291));
    expect(up.v).toBe(STATE_VERSION);
    expect(hashState(up)).toBe(hashState(s));
  });
});
