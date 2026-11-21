// The world server's answers over HTTP (server/routes.ts), asked of a world in-process.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { configFromEnv } from '../server/config';
import { answer } from '../server/routes';
import { WorldCore } from '../server/world';
import { MAX_SITES_PER_REQUEST } from '../src/net/lots';
import { MAX_PLACES_PER_REQUEST } from '../src/net/people';

describe('world server over HTTP', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scw-routes-'));
  const core = new WorldCore({ ...configFromEnv({}), dataDir: dir, id: 'test', log: () => {} }).init();
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const json = (url: string) => {
    const a = answer(core, url, false);
    expect(a.status, url).toBe(200);
    return JSON.parse(String(a.body));
  };
  const list = (n: number) => Array.from({ length: n }, (_, i) => i).join(',');

  it('tells its health and the world', () => {
    expect(json('/health')).toMatchObject({ ok: true, world: 'test', day: 0, players: 0 });
    expect(json('/')).toEqual(json('/health'));
    expect(json('/world').id).toBe('test');
  });

  it('gives the history of the borders, gzipped where the client takes it', () => {
    const plain = answer(core, '/history', false),
      zipped = answer(core, '/history', true);
    expect(plain.headers).toEqual({ vary: 'Origin, Accept-Encoding' });
    expect(zipped.headers).toEqual({ vary: 'Origin, Accept-Encoding', 'content-encoding': 'gzip' });
    expect(gunzipSync(zipped.body as Buffer).equals(plain.body as Buffer)).toBe(true);
    expect(JSON.parse(String(plain.body)).startYear).toBe(core.s.startYear);
  });

  it('gives the persons of places, one person in full and the rulers', () => {
    const pop = core.s.place.pop.length;
    const first = json('/people/0');
    expect(first.place).toBe(0);
    expect(answer(core, `/people/${pop}`, false).status).toBe(404);
    expect(json(`/people?places=${list(MAX_PLACES_PER_REQUEST)}`)).toHaveLength(MAX_PLACES_PER_REQUEST);
    expect(answer(core, `/people?places=${list(MAX_PLACES_PER_REQUEST + 1)}`, false).status).toBe(404);
    expect(answer(core, `/people?places=0,${pop}`, false).status).toBe(404);
    const uid = core.s.person.cols.uid[core.s.person.alive.indexOf(1)];
    expect(json(`/person/${uid}`).id).toBe(uid);
    // with the plan of the day of a living person (people feature 12)
    expect(json(`/person/${uid}`).plan.slots[0][0]).toBe(0);
    expect(answer(core, '/person/999999999', false).status).toBe(404);
    expect(Array.isArray(json('/rulers'))).toBe(true);
    expect(json('/divergence')).toBeTypeOf('object');
  });

  it('gives the parcels of towns', () => {
    const site = core.s.lot.cols.site[core.s.lot.alive.indexOf(1)];
    expect(json(`/lots/${site}`).site).toBe(site);
    expect(answer(core, '/lots/32768', false).status).toBe(404);
    expect(json(`/lots?sites=${list(MAX_SITES_PER_REQUEST)}`)).toHaveLength(MAX_SITES_PER_REQUEST);
    expect(answer(core, `/lots?sites=${list(MAX_SITES_PER_REQUEST + 1)}`, false).status).toBe(404);
  });

  it('answers anything else with 404', () => {
    for (const url of ['', '/nope', '/health/', '/people/x', '/history?x'])
      expect(answer(core, url, false), url).toEqual({ status: 404, body: '{"error":"not found"}' });
  });
});
