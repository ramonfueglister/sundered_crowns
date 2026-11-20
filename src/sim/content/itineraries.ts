// The journeys of persons of history, where the sources tell them day by day: the place a ruler is staying in on a day
// of the world. Ramon, 20 November 2026: "reale Reisen müssten auch real stattfinden oder rekonstruiert werden": a
// journey that is known is played as it was; on a day no source tells, the ruler stays at the place the last one
// named (nothing is made up between two places). Outside the days an itinerary covers, a ruler stays at home.
//
// The itineraries are those of the Roman-German kings from the Regesta Imperii (data/history/itineraries/
// regesta_imperii.json, built by tools/history/itineraries/regesta.py). A day of a regest is a day the king's chancery
// issued a charter at a place: as a rule where the king was (Müller-Crepon, Neupert-Wentz, Kokkonen, Møller, "Rulers
// on the road", AJPS 2025, reconstruct the emperors' journeys from 72,665 dated and placed documents the same way).
// Edward I's is Gough's itinerary from the records of his chancery and household (Gough 1900, vol. II;
// data/history/itineraries/gough_edward_i.json, built by tools/history/itineraries/gough.py).
import { dayOf } from './chronicle';
import type { WorldState } from '../state';
import { km, lastStop, reachableStops, type Track, type Travels } from './travel';

/** data/history/itineraries/<source>.json */
export interface ItineraryFile {
  /** the places of issue: name as the source writes it, latitude, longitude */
  places: [string, number, number][];
  /** per king: the key of the person in the chronicle of rulers (the Wikidata id), the first and the last day of the
   *  reign the source covers, and the days with the place (index into `places`) and the uid of the source's first
   *  entry for the day there */
  kings: { key: string; name: string; from: string; to: string; stops: [day: string, place: number, uid?: number][] }[];
}

/** An itinerary as days of the world: the stops in order, each with the place of the map, and the last day it covers. */
export interface Journey {
  day: Int32Array;
  place: Int32Array;
  to: number;
}

/** The journeys of a world, by chronicle key. */
export type Itineraries = ReadonlyMap<string, Journey>;

/** A place of issue farther than this from every place of the map is not on the map (the median place of the map
 *  is some 1,850 km², about 24 km from its centre to its edge). OWN RULE: twice that, so that a place of issue near
 *  the edge of a place of the map still finds it. */
const ON_MAP_KM = 50;

/** The place of the map nearest each place of issue (−1: none within ON_MAP_KM), through a grid of whole degrees. */
function placesOnMap(f: ItineraryFile, lat: ArrayLike<number>, lon: ArrayLike<number>): Int32Array {
  const grid = new Map<string, number[]>(),
    cell = (a: number, b: number) => `${Math.floor(a)},${Math.floor(b)}`;
  for (let i = 0; i < lat.length; i++) {
    const k = cell(lat[i], lon[i]);
    const c = grid.get(k);
    if (c) c.push(i);
    else grid.set(k, [i]);
  }
  return Int32Array.from(f.places, ([, la, lo]) => {
    let best = -1,
      bestKm = ON_MAP_KM;
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (const i of grid.get(cell(la + a, lo + b)) ?? []) {
          const d = km(la, lo, lat[i], lon[i]);
          if (d <= bestKm) {
            best = i;
            bestKm = d;
          }
        }
    return best;
  });
}

/** The itineraries of a file as days of a world that starts in `startYear`, on the places of its map. */
export function compileItineraries(
  f: ItineraryFile,
  lat: ArrayLike<number>,
  lon: ArrayLike<number>,
  startYear: number,
): Itineraries {
  const onMap = placesOnMap(f, lat, lon),
    out = new Map<string, Journey>();
  for (const k of f.kings) {
    const stops = k.stops.filter(([, p]) => onMap[p] >= 0),
      day = Int32Array.from(stops, ([d]) => dayOf(d, startYear) as number),
      place = Int32Array.from(stops, ([, p]) => onMap[p]),
      kept = reachableStops(day, place, lat, lon);
    if (!kept.length) continue;
    out.set(k.key, {
      day: Int32Array.from(kept, (i) => day[i]),
      place: Int32Array.from(kept, (i) => place[i]),
      to: dayOf(k.to, startYear) as number,
    });
  }
  return out;
}

/** The place of the last stop on or before `day`, while the itinerary covers the day; −1 outside it. */
export function stayOn(j: Journey, day: number): number {
  const k = lastStop(j, day);
  return k < 0 ? -1 : j.place[k];
}

/** Where the persons of history are staying today, by row, for those an itinerary places (the rest are at home): on
 *  the way between two places of the sources where `travels` is given (src/sim/content/travel.ts), else at the last
 *  place named. */
export function staysOf(s: WorldState, it: Itineraries | null, travels?: Travels | null): Map<number, number> {
  const out = new Map<number, number>();
  if (!it) return out;
  for (const n of s.named ?? []) {
    const j = it.get(n.key);
    if (!j) continue;
    const p = travels ? travels.where(j, s.day) : stayOn(j, s.day);
    if (p >= 0) out.set(n.person, p);
  }
  return out;
}

/** The tracks of the persons of history an itinerary places today, by row, from today to `days` ahead. */
export function tracksOf(
  s: WorldState,
  it: Itineraries | null,
  travels: Travels | null,
  days: number,
): Map<number, Track> {
  const out = new Map<number, Track>();
  if (!it || !travels) return out;
  for (const n of s.named ?? []) {
    const j = it.get(n.key);
    if (!j) continue;
    const t = travels.track(j, s.day, s.day + days);
    if (t.day.length) out.set(n.person, t);
  }
  return out;
}
