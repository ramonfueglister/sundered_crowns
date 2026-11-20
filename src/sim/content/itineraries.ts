// The journeys of persons of history, where the sources tell them day by day: the place a ruler is staying in on a day
// of the world. Ramon, 20 November 2026: "reale Reisen müssten auch real stattfinden oder rekonstruiert werden": a
// journey that is known is played as it was; on a day no source tells, the ruler stays at the place the last one
// named (nothing is made up between two places). Outside the days an itinerary covers, a ruler stays at home.
//
// The itineraries are those of the Roman-German kings from the Regesta Imperii (data/history/itineraries/
// regesta_imperii.json, built by tools/history/itineraries/regesta.py). A day of a regest is a day the king's chancery
// issued a charter at a place: as a rule where the king was (Müller-Crepon, Neupert-Wentz, Kokkonen, Møller, "Rulers
// on the road", AJPS 2025, reconstruct the emperors' journeys from 72,665 dated and placed documents the same way).
import { dayOf } from './chronicle';
import type { WorldState } from '../state';

/** data/history/itineraries/<source>.json */
export interface ItineraryFile {
  /** the places of issue: name as the source writes it, latitude, longitude */
  places: [string, number, number][];
  /** per king: the key of the person in the chronicle of rulers (the Wikidata id), the first and the last day of the
   *  reign the source covers, and the days with the place (index into `places`) */
  kings: { key: string; name: string; from: string; to: string; stops: [string, number][] }[];
}

/** An itinerary as days of the world: the stops in order, each with the place of the map, and the last day it covers. */
interface Journey {
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

function km(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p = Math.PI / 180,
    h =
      Math.sin(((lat2 - lat1) * p) / 2) ** 2 +
      Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(((lon2 - lon1) * p) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

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
    const stops = k.stops.filter(([, p]) => onMap[p] >= 0);
    if (!stops.length) continue;
    out.set(k.key, {
      day: Int32Array.from(stops, ([d]) => dayOf(d, startYear) as number),
      place: Int32Array.from(stops, ([, p]) => onMap[p]),
      to: dayOf(k.to, startYear) as number,
    });
  }
  return out;
}

/** The place a person of history is staying in on `day` by the itinerary: that of the last stop on or before it, while
 *  the itinerary covers the day; −1 outside it. */
export function stayOn(j: Journey, day: number): number {
  if (day < j.day[0] || day > j.to) return -1;
  let lo = 0,
    hi = j.day.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (j.day[mid] <= day) lo = mid;
    else hi = mid - 1;
  }
  return j.place[lo];
}

/** Where the persons of history are staying today, by row, for those an itinerary places (the rest are at home). */
export function staysOf(s: WorldState, it: Itineraries | null): Map<number, number> {
  const out = new Map<number, number>();
  if (!it) return out;
  for (const n of s.named ?? []) {
    const j = it.get(n.key);
    if (!j) continue;
    const p = stayOn(j, s.day);
    if (p >= 0) out.set(n.person, p);
  }
  return out;
}
