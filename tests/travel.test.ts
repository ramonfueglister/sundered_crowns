// How a ruler travels between the places of their itinerary (src/sim/content/travel.ts), which stops are left out as
// out of reach, and how the map moves the ruler's dot along the way (src/people/rulers_mode.ts).
import { describe, it, expect } from 'vitest';
import { loadWorldFor } from '../tools/sim/load';
import { dayOf } from '../src/sim/content/chronicle';
import { compileItineraries, type ItineraryFile } from '../src/sim/content/itineraries';
import { Travels, km, reachableStops } from '../src/sim/content/travel';
import { whereOn } from '../src/people/rulers_mode';
import type { RulerOnMap } from '../src/net/people';

const w = loadWorldFor(1291);
const at = (name: string) => w.names.indexOf(name);
const PARIS = at('Paris'),
  BRUGES = at('Bruges'),
  ROME = at('Rome');
const day = (d: string) => dayOf(d, 1291) as number;
const tr = new Travels(w);
const straight = (a: number, b: number) => km(w.lat[a], w.lon[a], w.lat[b], w.lon[b]);

describe('the stops a king can have been at', () => {
  it('leaves out a stay he could not have reached in haste from either side', () => {
    const kept = reachableStops([1, 2, 3, 4, 5], [PARIS, PARIS, PARIS, ROME, PARIS], w.lat, w.lon);
    expect(kept).toEqual([0, 1, 2, 4]);
  });
  it('leaves out the stay with fewer days where one step cannot be gone in haste', () => {
    // three days at Paris, then one at Rome the day after, then Rome is left and Bruges reached in good time
    const kept = reachableStops([1, 2, 3, 4, 90], [PARIS, PARIS, PARIS, ROME, BRUGES], w.lat, w.lon);
    expect(kept).toEqual([0, 1, 2, 4]);
  });
  it('of two stays with as many days, leaves out the one that lies off the way of the stays around them', () => {
    // Rome can be reached from Paris in 39 days, but Bruges not from Rome in 3: Rome is the far one between Paris
    // and Paris (as 'in Arluno', Milan, between Luxembourg and Thionville in 1346)
    const kept = reachableStops([1, 40, 43, 80], [PARIS, ROME, BRUGES, PARIS], w.lat, w.lon);
    expect(kept).toEqual([0, 2, 3]);
  });
  it('keeps every stay that can be reached', () => {
    const kept = reachableStops([1, 30, 80], [PARIS, BRUGES, ROME], w.lat, w.lon);
    expect(kept).toEqual([0, 1, 2]);
  });
});

describe('the way between two places', () => {
  const way = tr.wayBetween(PARIS, BRUGES);
  it('goes from the one to the other over neighbouring places, the days growing', () => {
    expect(way.place[0]).toBe(PARIS);
    expect(way.place[way.place.length - 1]).toBe(BRUGES);
    for (let i = 1; i < way.place.length; i++) expect(way.at[i]).toBeGreaterThan(way.at[i - 1]);
  });
  it("takes about the court's pace of 30 km a day: no less than the straight line, not three times it", () => {
    const days = way.at[way.at.length - 1],
      d = straight(PARIS, BRUGES);
    expect(days).toBeGreaterThanOrEqual(d / 30);
    expect(days).toBeLessThan((3 * d) / 30);
  });
});

/** Edward I (Q1): at Bruges early in 1291, at Paris on 10 March; then at Bruges again two days after Paris. */
const file: ItineraryFile = {
  places: [
    ['Brugge', w.lat[BRUGES], w.lon[BRUGES]],
    ['Parisius', w.lat[PARIS], w.lon[PARIS]],
  ],
  kings: [
    {
      key: 'Q1',
      name: 'Edward I',
      from: '1291-01-01',
      to: '1291-12-31',
      stops: [
        ['1291-01-03', 0],
        ['1291-03-10', 1],
        ['1291-03-17', 0],
      ],
    },
  ],
};

describe('a king on the way', () => {
  const j = compileItineraries(file, w.lat, w.lon, 1291).get('Q1')!,
    way = tr.wayBetween(BRUGES, PARIS),
    takes = way.at[way.at.length - 1],
    arrive = day('1291-03-10');
  it('stays where the sources last name him until he must leave to arrive in time', () => {
    expect(tr.where(j, day('1291-02-01'))).toBe(BRUGES);
    expect(tr.where(j, Math.floor(arrive - takes))).toBe(BRUGES);
    const halfway = tr.where(j, Math.round(arrive - takes / 2));
    expect(Array.from(way.place)).toContain(halfway);
    expect([BRUGES, PARIS]).not.toContain(halfway);
    expect(tr.where(j, arrive)).toBe(PARIS);
  });
  it('hurries where the days between are fewer than the way takes, and is still on time', () => {
    // a week from Paris to Bruges is less than the way takes at the court's pace (more than 7 days)
    expect(takes).toBeGreaterThan(7);
    expect(tr.where(j, arrive)).toBe(PARIS);
    const between = tr.where(j, arrive + 3);
    expect([PARIS, BRUGES]).not.toContain(between);
    expect(tr.where(j, day('1291-03-17'))).toBe(BRUGES);
  });
  it('tells the way ahead from the last place named, staying at the last one to the day asked for', () => {
    const t = tr.track(j, day('1291-02-01'), day('1291-02-01') + 120);
    expect(t.place[0]).toBe(BRUGES);
    expect(t.day[0]).toBe(day('1291-01-03'));
    expect(t.place).toContain(PARIS);
    for (let i = 1; i < t.day.length; i++) expect(t.day[i]).toBeGreaterThanOrEqual(t.day[i - 1]);
    expect(t.day[t.day.length - 1]).toBe(day('1291-02-01') + 120);
    expect(t.place[t.place.length - 1]).toBe(BRUGES);
    expect(tr.track(j, day('1292-01-01'), day('1292-05-01')).day).toEqual([]);
  });
});

describe('the dot of a travelling ruler', () => {
  const loc = { lon: Array.from(w.lon), lat: Array.from(w.lat) },
    r: RulerOnMap = {
      uid: 1,
      name: 'Edward I',
      house: 'Plantagenet',
      female: false,
      place: BRUGES,
      crowns: [],
      track: { day: [10, 20, 30], place: [BRUGES, BRUGES, PARIS] },
    };
  it('stands at a place while the ruler stays, and goes the straight line between two places of the way', () => {
    expect(whereOn(r, loc, 15)).toEqual([w.lon[BRUGES], w.lat[BRUGES]]);
    const [lon, lat] = whereOn(r, loc, 25);
    expect(lon).toBeCloseTo((w.lon[BRUGES] + w.lon[PARIS]) / 2, 5);
    expect(lat).toBeCloseTo((w.lat[BRUGES] + w.lat[PARIS]) / 2, 5);
    expect(whereOn(r, loc, 40)).toEqual([w.lon[PARIS], w.lat[PARIS]]);
  });
  it('stands where the server names without a day', () => {
    expect(whereOn(r, loc, undefined)).toEqual([w.lon[BRUGES], w.lat[BRUGES]]);
  });
});
