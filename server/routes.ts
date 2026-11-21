// The world server's answers over HTTP (server/main.ts serves them): its health, the world, the history of the
// borders, the divergence from history, the persons, the rulers and the land register. Each answer is worked out
// from the world of a WorldCore alone, so a test can ask for it without a server.
import { MAX_SITES_PER_REQUEST, manyTownsLots, townLots } from '../src/net/lots';
import {
  MAX_PLACES_PER_REQUEST,
  TRACK_DAYS,
  manyPlacesPeople,
  personDetail,
  placePeople,
  rulersOnMap,
} from '../src/net/people';
import { headingOf, staysOf, tracksOf } from '../src/sim/content/itineraries';
import { personPlan } from '../src/net/plan';
import { rowOf } from '../src/sim/people/archive';
import { ALL_CULTURES } from '../src/sim/content/peoples';
import type { WorldCore } from './world';

/** An answer: its status, the headers it adds to the JSON headers, and its body. */
export interface Answer {
  status: number;
  headers?: Record<string, string>;
  body: string | Buffer;
}

const ok = (value: unknown): Answer => ({ status: 200, body: JSON.stringify(value) });

/** The answer to a GET of `url` from the world of `core`; `gzip`: the client takes a gzipped body. */
export function answer(core: WorldCore, url: string, gzip: boolean): Answer {
  if (url === '/health' || url === '/')
    return ok({
      ok: true,
      world: core.worldInfo().id,
      day: core.s.day,
      players: core.seats().length,
      stepMs: core.stepMs,
    });
  if (url === '/world') return ok(core.worldInfo());
  // the history of the borders, for the replay (server/history.ts)
  if (url === '/history') {
    const { json, gz } = core.history.payload(core.s.startYear);
    return {
      status: 200,
      headers: { vary: 'Origin, Accept-Encoding', ...(gzip ? { 'content-encoding': 'gzip' } : {}) },
      body: gzip ? gz : json,
    };
  }
  // how far the world has gone from history (src/sim/divergence.ts)
  if (url === '/divergence') return ok(core.divergence());
  // the persons (src/net/people.ts): of a place for the figures, one in full for the portrait
  const people = /^\/people\/(\d+)$/.exec(url),
    person = /^\/person\/(\d+)$/.exec(url);
  if (people && Number(people[1]) < core.s.place.pop.length)
    return ok(placePeople(core.s, Number(people[1]), staysOf(core.s, core.itineraries, core.travels)));
  // the rulers who hold a crown, for the map mode of the rulers (src/ui/mapmode.ts)
  if (url === '/rulers')
    return ok(
      rulersOnMap(
        core.s,
        staysOf(core.s, core.itineraries, core.travels),
        tracksOf(core.s, core.itineraries, core.travels, TRACK_DAYS),
      ),
    );
  const many = /^\/people\?places=(\d+(?:,\d+)*)$/.exec(url);
  if (many) {
    const places = many[1].split(',').map(Number);
    if (places.length <= MAX_PLACES_PER_REQUEST && places.every((p) => p < core.s.place.pop.length))
      return ok(manyPlacesPeople(core.s, places, staysOf(core.s, core.itineraries, core.travels)));
  }
  if (person) {
    const d = personDetail(
      core.s,
      Number(person[1]),
      (i) => ALL_CULTURES[i] ?? 'unknown',
      (uid) => core.archived(uid),
    );
    if (!d) return { status: 404, body: '{"error":"not found"}' };
    // the plan of the day of a living person, where the person is today (a ruler where staying)
    const id = rowOf(core.s, d.id);
    if (!d.alive || id < 0) return ok(d);
    const at = staysOf(core.s, core.itineraries, core.travels).get(id) ?? d.place;
    return ok({
      ...d,
      plan: personPlan(core.s, core.w, id, at, headingOf(core.s, core.itineraries, core.travels, id)),
    });
  }
  // the land register (src/net/lots.ts): the parcels of a town, for the houses of the world graphic
  const lots = /^\/lots\/(\d+)$/.exec(url),
    manyLots = /^\/lots\?sites=(\d+(?:,\d+)*)$/.exec(url);
  if (lots && Number(lots[1]) <= 0x7fff) return ok(townLots(core.s, Number(lots[1])));
  if (manyLots) {
    const sites = manyLots[1].split(',').map(Number);
    if (sites.length <= MAX_SITES_PER_REQUEST && sites.every((x) => x <= 0x7fff))
      return ok(manyTownsLots(core.s, sites));
  }
  return { status: 404, body: '{"error":"not found"}' };
}
