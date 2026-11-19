// People feature 4 (docs/PEOPLE_DESIGN.md): the unmarried move to other places and an heir comes home. The rules and
// their numbers (Dribe 2002, Dribe & Lundh 2002, Raven 2024), a world that runs them for years, and the state.
import { describe, it, expect } from 'vitest';
import { loadSetup, newWorldState } from '../tools/sim/load';
import {
  BANDS,
  FAR_SHARE,
  LEAVES_HOME,
  MOVING_AGE,
  ORPHAN,
  SERVICE,
  TOP_RATE,
  bandOf,
  movesAYear,
  yearsToNext,
  type Mover,
} from '../src/sim/people/moving';
import { ageOn } from '../src/sim/systems/people';
import { deathsTo, settleEstates } from '../src/sim/systems/deaths';
import { birthsTo, weddingsOn, type Passed } from '../src/sim/systems/families';
import { destination, movesTo, noMoves, rateOf } from '../src/sim/systems/moves';
import { namedPersons, playChronicle } from '../src/sim/systems/rulers';
import { ROLE } from '../src/sim/systems/work';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { upgradeState } from '../src/sim/upgrade';
import { ALIVE, PERSON_SCHEMA, STATE_VERSION } from '../src/sim/state';
import { advanceDay } from '../src/sim/engine';

const child: Mover = { age: 20, man: true, home: true, landed: true, fatherDead: false, motherDead: false };

describe('the rules of moving', () => {
  it('a child leaves home at the rates of Scania: the landless more often, the daughters of the landless most', () => {
    const pct = (x: number) => Math.round(1000 * x) / 10;
    expect([pct(LEAVES_HOME.young.men.landed), pct(LEAVES_HOME.young.men.landless)]).toEqual([2.4, 8.2]);
    expect([pct(LEAVES_HOME.young.women.landed), pct(LEAVES_HOME.young.women.landless)]).toEqual([1.0, 8.3]);
    expect([pct(LEAVES_HOME.grown.men.landed), pct(LEAVES_HOME.grown.men.landless)]).toEqual([9.1, 13.1]);
    expect([pct(LEAVES_HOME.grown.women.landed), pct(LEAVES_HOME.grown.women.landless)]).toEqual([8.8, 18.1]);
    // the rate of all families is the events over the person-years of the tables
    expect(LEAVES_HOME.young.men.all).toBeCloseTo(407 / 6190, 12);
    expect(LEAVES_HOME.grown.women.all).toBeCloseTo(505 / 3313, 12);
    for (const stage of ['young', 'grown'] as const)
      for (const sex of ['men', 'women'] as const) {
        const r = LEAVES_HOME[stage][sex];
        expect(r.landed).toBeLessThan(r.all);
        expect(r.all).toBeLessThan(r.landless);
      }
  });
  it('the rate follows the age, the sex, the place and the parents', () => {
    expect(movesAYear({ ...child, age: 9.9 })).toBe(0);
    expect(movesAYear({ ...child, age: 60 })).toBe(0);
    expect(movesAYear({ ...child, age: MOVING_AGE[0] })).toBe(LEAVES_HOME.young.men.landed);
    expect(movesAYear({ ...child, age: 16.9, landed: false })).toBe(LEAVES_HOME.young.men.landless);
    expect(movesAYear({ ...child, age: 17 })).toBe(LEAVES_HOME.grown.men.landed);
    expect(movesAYear({ ...child, landed: undefined })).toBe(LEAVES_HOME.grown.men.all); // a world without economies
    expect(movesAYear({ ...child, age: 30 })).toBe(0); // no table for a child of 30 at home
    expect(movesAYear({ ...child, fatherDead: true })).toBeCloseTo(
      LEAVES_HOME.grown.men.landed * ORPHAN.father.grown.men,
      12,
    );
    expect(movesAYear({ ...child, man: false, age: 12, fatherDead: true, motherDead: true })).toBeCloseTo(
      LEAVES_HOME.young.women.landed * 1.55 * 1.47,
      12,
    );
    expect(movesAYear({ ...child, motherDead: true })).toBe(LEAVES_HOME.grown.men.landed); // the table has no clear effect
    // who lives elsewhere changes places as a servant, from 15 on
    expect(movesAYear({ ...child, home: false, age: 14 })).toBe(0);
    expect(movesAYear({ ...child, home: false })).toBeCloseTo(0.52, 2);
    expect(movesAYear({ ...child, home: false, man: false })).toBeCloseTo(0.533, 3);
    expect(movesAYear({ ...child, home: false, age: 40 })).toBeCloseTo(0.407, 3);
    expect(movesAYear({ ...child, home: false, man: false, age: 40 })).toBeCloseTo(0.267, 3);
    expect(SERVICE.men.young * 15 + SERVICE.men.later * 30).toBeCloseTo(20.0, 9);
    expect(SERVICE.women.young * 15 + SERVICE.women.later * 30).toBeCloseTo(16.0, 9);
  });
  it('no rate is above the rate the days are drawn at', () => {
    let top = 0;
    for (let age = 10; age < 60; age++)
      for (const man of [true, false])
        for (const home of [true, false])
          for (const landed of [true, false, undefined])
            for (const fatherDead of [true, false])
              for (const motherDead of [true, false])
                top = Math.max(top, movesAYear({ age, man, home, landed, fatherDead, motherDead }));
    expect(top).toBeLessThanOrEqual(TOP_RATE);
    expect(top).toBeGreaterThan(0.5);
    // the waiting time to the next far move a person may make: exponential, with the mean of the rate
    const N = 20000;
    let sum = 0;
    for (let k = 0; k < N; k++) sum += yearsToNext((k + 0.5) / N);
    expect(sum / N).toBeCloseTo(1 / (TOP_RATE * FAR_SHARE), 0);
    expect(yearsToNext(0)).toBeCloseTo(0, 12);
  });
  it('a far move goes 16 to 115 km, in the shares of the serfs of Essex', () => {
    expect(BANDS.map(([lo, hi]) => [lo, hi])).toEqual([
      [16, 32],
      [32, 64],
      [64, 115],
    ]);
    expect(BANDS.reduce((x, b) => x + b[2], 0)).toBeCloseTo(1, 12);
    expect(bandOf(0)).toBe(0);
    expect(bandOf(5 / 11 - 1e-9)).toBe(0);
    expect(bandOf(5 / 11 + 1e-9)).toBe(1);
    expect(bandOf(9 / 11 + 1e-9)).toBe(2);
    expect(bandOf(0.999999)).toBe(2);
  });
});

describe('a world whose unmarried move', () => {
  const { s, w } = newWorldState(1291, 1291);
  const P = s.person.cols,
    F = s.family.cols,
    named = namedPersons(s);
  const living = (id: number) => s.person.alive[id] === 1 && P.died[id] === ALIVE && !named.has(id);
  const placeOf = (id: number) => F.place[P.family[id]];
  const size0 = s.person.size,
    home0 = Int32Array.from(P.home);
  const parts = () => {
    const m = new Map<number, number>();
    for (let id = 0; id < s.person.size; id++)
      if (P.role[id] !== ROLE.none) m.set(placeOf(id), (m.get(placeOf(id)) ?? 0) + 1);
    return m;
  };
  const seats = () => {
    let n = 0;
    for (let f = 0; f < s.family.size; f++) n += F.seat[f];
    return n;
  };
  const parts0 = parts(),
    seats0 = seats();

  const place0 = Int32Array.from({ length: size0 }, (_, id) => placeOf(id)),
    moves0 = Int32Array.from(P.moves);

  it('is founded with the place every person comes from and the day of the next move', () => {
    let can = 0,
      never = 0;
    for (let id = 0; id < size0; id++) {
      if (named.has(id)) {
        expect(home0[id]).toBe(-1);
        expect(moves0[id]).toBe(ALIVE);
        continue;
      }
      expect(home0[id]).toBe(place0[id]);
      if (moves0[id] === ALIVE) {
        never++;
        continue;
      }
      can++;
      expect(moves0[id]).toBeGreaterThan(0);
      const at = ageOn(P.born[id], moves0[id]);
      expect(at).toBeGreaterThanOrEqual(MOVING_AGE[0]);
      expect(at).toBeLessThan(MOVING_AGE[1]);
    }
    expect(can).toBeGreaterThan(never); // most persons under 60 have a day before they are 60
  });
  it('a far move ends in another town or inside the place, the same for the same draws', () => {
    const towns = new Set<number>();
    for (let f = 0; f < s.family.size; f++) if (F.seat[f]) towns.add(F.place[f]);
    let out = 0,
      n = 0;
    for (const place of [...towns].slice(0, 60))
      for (let k = 0; k < 40; k++) {
        const u = (k + 0.5) / 40,
          v = (((k * 7 + 3) % 40) + 0.5) / 40,
          to = destination(s, w, place, u, v);
        expect(to).toBe(destination(s, w, place, u, v));
        n++;
        if (to < 0) continue;
        out++;
        expect(towns.has(to)).toBe(true);
        expect(to).not.toBe(place);
        expect(w.distKm(place, to)).toBeLessThan(250); // the land is at most 115 km away, and its town not much further
      }
    expect(out / n).toBeGreaterThan(0.1);
    expect(out / n).toBeLessThan(0.9);
  });

  const YEARS = 30,
    moved = noMoves(),
    passed: Passed = { passed: 0, sons: 0, daughters: 0, home: 0 };
  for (let m = 1; m <= 12 * YEARS; m++) {
    const day = Math.round((m / 12) * 365.25);
    deathsTo(s, day);
    movesTo(s, w, day, moved);
    birthsTo(s, day);
    weddingsOn(s, day, passed);
    settleEstates(s, day);
  }
  const day = Math.round(YEARS * 365.25),
    far = moved.home + moved.service;

  it('about one person in a thousand goes to another place a year: the young, women as often as men', () => {
    let n = 0;
    for (let id = 0; id < s.person.size; id++) if (living(id)) n++;
    expect(far / YEARS / n).toBeGreaterThan(0.0005);
    expect(far / YEARS / n).toBeLessThan(0.003);
    expect(moved.home).toBeGreaterThan(moved.service);
    expect(moved.service).toBeGreaterThan(0);
    expect(moved.women / far).toBeGreaterThan(0.4);
    expect(moved.women / far).toBeLessThan(0.62);
    expect(moved.prime / far).toBeGreaterThan(0.65);
    expect(moved.ages / far).toBeGreaterThan(17);
    expect(moved.ages / far).toBeLessThan(26);
    expect(moved.near).toBeGreaterThan(0);
    expect(moved.kin).toBeGreaterThan(0);
    expect(moved.kin).toBeLessThan(far / 4);
  });
  it('a person comes from one place for life, and who lives elsewhere lives in a family of that place', () => {
    let away = 0;
    for (let id = 0; id < s.person.size; id++) {
      if (id < size0) expect(P.home[id]).toBe(home0[id]);
      else expect(P.home[id]).toBeGreaterThanOrEqual(0);
      if (!living(id)) continue;
      expect(s.family.alive[P.family[id]]).toBe(1);
      if (P.home[id] !== placeOf(id)) away++;
    }
    expect(away).toBeGreaterThan(far / 4); // (some have died, some have come back)
    // a child is born where its mother lives
    let checked = 0;
    for (let id = size0; id < s.person.size; id++) {
      const m = P.mother[id];
      if (living(id) && living(m) && F.woman[P.family[m]] === m && P.home[id] === placeOf(id)) checked++;
    }
    expect(checked).toBeGreaterThan(1000);
  });
  it('the towns keep their households and their parts in the economy: the part of a mover goes to a successor at home', () => {
    expect(seats()).toBe(seats0);
    const now = parts();
    expect(now.size).toBe(parts0.size);
    for (const [place, n] of parts0) expect(now.get(place)).toBe(n);
    for (let f = 0; f < s.family.size; f++) {
      if (F.man[f] >= 0) {
        expect(P.died[F.man[f]]).toBe(ALIVE);
        expect(P.family[F.man[f]]).toBe(f);
      }
      if (F.woman[f] >= 0) {
        expect(P.died[F.woman[f]]).toBe(ALIVE);
        expect(P.family[F.woman[f]]).toBe(f);
      }
    }
  });
  it('the man and the woman of a family do not move, and nobody under 10 or of 60', () => {
    let married = 0,
      old = 0,
      small = 0;
    for (let id = 0; id < s.person.size; id++) {
      if (!living(id)) continue;
      const f = P.family[id],
        a = ageOn(P.born[id], day),
        r = rateOf(s, id, day);
      expect(r).toBeLessThanOrEqual(TOP_RATE);
      if (F.man[f] === id || F.woman[f] === id) {
        married++;
        expect(r).toBe(0);
      }
      if (a >= 60) {
        old++;
        expect(r).toBe(0);
      }
      if (a < 10) {
        small++;
        expect(r).toBe(0);
      }
    }
    expect(married).toBeGreaterThan(1000);
    expect(old).toBeGreaterThan(100);
    expect(small).toBeGreaterThan(1000);
  });
  it('an heir who lives in another place comes home for the house', () => {
    expect(passed.home!).toBeGreaterThan(20);
    expect(passed.home!).toBeLessThan(passed.sons + passed.daughters);
  });
  it('a saved world goes on as the one that ran: the lists are built anew from the state', () => {
    const copy = decodeState(encodeState(s));
    for (let m = 1; m <= 36; m++) {
      const d = day + Math.round((m / 12) * 365.25);
      for (const x of [s, copy]) {
        deathsTo(x, d);
        movesTo(x, w, d);
        birthsTo(x, d);
        weddingsOn(x, d);
        settleEstates(x, d);
      }
    }
    expect(hashState(copy)).toBe(hashState(s));
  }, 20_000);
});

describe('the state of the moves', () => {
  it('of a world from before the moves gets the place of origin and the day of the next move by the upgrade', () => {
    const { s, w } = newWorldState(1291, 1291);
    const old = decodeState(encodeState(s)) as any;
    delete old.person.cols.home;
    delete old.person.cols.moves;
    old.v = 24;
    const up = upgradeState(decodeState(encodeState(old)), w, () => loadSetup(1291));
    expect(up.v).toBe(STATE_VERSION);
    expect(Object.keys(up.person.cols)).toEqual(Object.keys(PERSON_SCHEMA));
    expect(hashState(up)).toBe(hashState(s));
  }, 60_000);
});

describe('the moves and the economy', () => {
  it('the cities compute on when many move on one day: every part stays in its town, and a saved world goes on the same', () => {
    const { s, w } = newWorldState(1291, 1291);
    const P = s.person.cols,
      F = s.family.cols;
    const placeOf = (id: number) => F.place[P.family[id]];
    const parts = () => {
      const m = new Map<number, number>();
      for (let id = 0; id < s.person.size; id++)
        if (P.role[id] !== ROLE.none) m.set(placeOf(id), (m.get(placeOf(id)) ?? 0) + 1);
      return m;
    };
    const parts0 = parts();
    // the day of everybody of 15 to 29 who can move has come (the lists are built from the state when it is first run)
    let due = 0;
    for (let id = 0; id < s.person.size; id++) {
      const a = ageOn(P.born[id], 1);
      if (a >= 15 && a < 30 && rateOf(s, id, 1) > 0) {
        P.moves[id] = 1;
        due++;
      }
    }
    expect(due).toBeGreaterThan(10000);
    const start = decodeState(encodeState(s));
    advanceDay(s, w);
    let away = 0,
      withPart = 0;
    for (let id = 0; id < s.person.size; id++) {
      if (P.home[id] < 0 || P.home[id] === placeOf(id)) continue;
      away++;
      if (P.role[id] !== ROLE.none) withPart++;
      expect(P.moves[id]).toBeGreaterThan(1); // the next day is drawn
    }
    expect(away).toBeGreaterThan(100); // who holds a part leaves only where somebody who wants one takes it (people feature 6)
    expect(withPart).toBeLessThan(away / 2); // a newcomer has a part only where one fell free
    const now = parts();
    for (const [place, n] of parts0) expect(now.get(place)).toBe(n);
    advanceDay(s, w);
    expect(s.economy.cities!.halted).toBe('');
    // the same days from the saved state, saved again on the way
    advanceDay(start, w);
    const again = decodeState(encodeState(start));
    advanceDay(again, w);
    expect(hashState(again)).toBe(hashState(s));
    // a ruler who comes into the world later bears no child and does not move here, and the columns say so: a saved
    // world has them as the running one (a loaded world builds its lists of events from the columns)
    const before = s.named!.length;
    playChronicle(s, w, s.day + 1, s.day + 400);
    expect(s.named!.length).toBeGreaterThan(before);
    for (const n of s.named!) {
      expect(P.bears[n.person]).toBe(ALIVE);
      expect(P.moves[n.person]).toBe(ALIVE);
      expect(P.home[n.person]).toBe(-1);
    }
  }, 120_000);
});
