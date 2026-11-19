// Step 4 of the world of towns (src/sim/systems/cultures.ts): every person has a culture and a faith, the counted
// minorities of the towns among them; a place has those of its persons.
import { describe, it, expect } from 'vitest';
import { newWorldState, loadSetup } from '../tools/sim/load';
import { ALL_CULTURES, FAITHS } from '../src/sim/content/peoples';
import { citiesOf } from '../src/sim/content/cities';
import { communitiesOf } from '../src/sim/systems/cultures';
import { SCALE } from '../src/sim/scale';
import { placeDetail } from '../src/net/views';
import { personDetail } from '../src/net/people';
import { upgradeState } from '../src/sim/upgrade';
import { hashState } from '../src/sim/snapshot';
import { STATE_VERSION } from '../src/sim/state';
import { Happening } from '../src/sim/content/chronicle';

const { s, w } = newWorldState(1291, 1291);
const setup = loadSetup(1291);
const P = s.person.cols,
  F = s.family.cols;
const rulers = new Set(s.named.map((n) => n.person));
const key = (id: number) => `${ALL_CULTURES[P.culture[id]]}/${FAITHS[P.faith[id]].id}`;
/** the persons of each counted community, by town */
const members = new Map<string, number[]>();
for (const c of communitiesOf(1291)) {
  const place = citiesOf(1291).find((x) => x.name === c.town)!.place,
    m: number[] = [];
  for (let id = 0; id < s.person.size; id++)
    if (F.place[P.family[id]] === place && key(id) === `${c.culture}/${c.faith}`) m.push(id);
  members.set(c.town, m);
}
const inCommunity = new Set([...members.values()].flat());

describe('the culture and faith of a person', () => {
  it('are those of the setup for the place of the town, unless the person is of a counted community or a ruler', () => {
    let differ = 0,
      persons = 0;
    for (let id = 0; id < s.person.size; id++) {
      if (rulers.has(id) || inCommunity.has(id)) continue;
      const p = F.place[P.family[id]];
      persons++;
      if (key(id) !== `${setup.culture[p] ?? 'unknown'}/${setup.faith[p] ?? 'latin'}`) differ++;
    }
    expect(persons).toBeGreaterThan(100_000);
    expect(differ).toBe(0);
  });
  it('of a ruler are those of the realm the ruler enters the world in', () => {
    const c = w.chronicle!,
      R = s.realm.cols,
      person = new Map(s.named.map((n) => [n.key, n.person]));
    const realm = new Map(s.realmText.map((r, k) => [r.key, k])),
      seen = new Set<number>();
    for (const e of c.events) {
      if (e.day > s.day) break;
      const id = person.get(c.persons[e.person].key),
        r = e.realm ? realm.get(e.realm) : undefined;
      if (e.what !== Happening.Enter || id === undefined || r === undefined || seen.has(id)) continue;
      seen.add(id);
      expect(P.culture[id]).toBe(R.culture[r]);
      expect(P.faith[id]).toBe(R.faith[r]);
    }
    expect(seen.size).toBe(rulers.size);
  });
  it("are told to a client: the portrait dresses the person by the person's culture", () => {
    const id = members.get('Nuremberg')![0];
    expect(personDetail(s, id, (k) => ALL_CULTURES[k])!.culture).toBe('ashkenazi');
  });
});

describe('the counted communities of 1291', () => {
  it('are whole families of their town, never more persons than the source counts at 1:100', () => {
    const got: Record<string, number> = {};
    for (const c of communitiesOf(1291)) {
      const m = members.get(c.town)!;
      got[c.town] = m.length;
      const families = new Set(m.map((id) => P.family[id]));
      for (const f of families)
        for (let id = 0; id < s.person.size; id++) if (P.family[id] === f) expect(m).toContain(id); // whole families
      if (c.families !== undefined) expect(families.size).toBe(c.families);
      else expect(m.length).toBeLessThanOrEqual(Math.round(c.people! / SCALE));
      for (const id of m) expect(rulers.has(id)).toBe(false);
    }
    expect(got.Amberg).toBe(0);
    expect(got.Nördlingen).toBe(0); // fewer than 50 people: no person at 1:100
    expect(got.Nuremberg).toBeGreaterThanOrEqual(4);
    expect(got.Würzburg).toBeGreaterThanOrEqual(6);
    expect(got.Paris).toBeGreaterThan(0);
  });
  it('show in the place: the town has the culture of its majority and its minority beside it', () => {
    const i = w.names.indexOf('Nuremberg'),
      d = placeDetail(s, w, i)!;
    expect(d.peoples!.reduce((a, x) => a + x.persons, 0)).toBe(d.pop);
    expect(d.peoples!.length).toBeGreaterThanOrEqual(2);
    expect(d.culture).toEqual(d.peoples![0].culture);
    expect(d.peoples!.some((x) => x.faith.en === 'Judaism' && x.persons === members.get('Nuremberg')!.length)).toBe(
      true,
    );
  });
  it('leave a place without persons without culture', () => {
    let empty = 0;
    for (let i = 0; i < w.L && empty < 5; i++)
      if (s.place.pop[i] === 0) {
        empty++;
        expect(placeDetail(s, w, i)!.peoples).toEqual([]);
      }
  });
});

describe('a world of 1291 saved before the persons had cultures', () => {
  it('gets them by the upgrade from 18 and encodes as a new world', { timeout: 60_000 }, () => {
    // biome-ignore lint/suspicious/noExplicitAny: a state of an older version, which no type of today describes
    const old = structuredClone(s) as any;
    old.v = 18;
    delete old.person.cols.culture;
    delete old.person.cols.faith;
    // version 18 kept a culture and a faith for every place (here those of 1356, as the running world was founded)
    const s1356 = loadSetup(1356),
      owner = old.place.owner,
      pop = old.place.pop,
      harvest = old.place.harvest,
      arable = old.place.arable;
    old.place = {
      owner,
      culture: Uint16Array.from(s1356.culture.slice(0, w.L), (c) => Math.max(0, ALL_CULTURES.indexOf(c ?? 'unknown'))),
      faith: Uint8Array.from(s1356.faith.slice(0, w.L), (f) =>
        Math.max(
          0,
          FAITHS.findIndex((x) => x.id === f),
        ),
      ),
      pop,
      harvest,
      arable,
    };
    const up = upgradeState(old, w, () => setup);
    expect(up.v).toBe(STATE_VERSION);
    expect(hashState(up)).toBe(hashState(s));
  });
});
