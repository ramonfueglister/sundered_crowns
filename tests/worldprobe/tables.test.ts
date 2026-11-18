// The kept tables of the coarse steps (public/map/tables, written by tools/worldprobe/build_tables.ts). The browser
// draws the far pieces from them and never builds them, so tables of an older map would show a land that is no longer
// there, and nobody would be told: the steps below them are built from the map as it is. These tests tell.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildPiece } from '../../src/worldprobe/build';
import { type TablesIndex, keepTables, keyOfTable, packTable, tabled, withThings } from '../../src/worldprobe/table';

const YEAR = 1291, DIR = `public/map/tables/world_${YEAR}`, AGAIN = `build the tables again: npx tsx tools/worldprobe/build_tables.ts ${YEAR}`;
const index = JSON.parse(readFileSync(`${DIR}/index.json`, 'utf8')) as TablesIndex;
const stampOf = (file: string) => (existsSync(file) ? createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 12) : 'missing');

describe('the kept tables of the far pieces', () => {
  it('were built from the files of the map as they are now', () => {
    const stale = Object.entries(index.inputs).filter(([name, stamp]) => stampOf(name.startsWith('content/') ? `data/${name}` : `public/${name}`) !== stamp).map(([name]) => name);
    expect(stale, AGAIN).toEqual([]);
  });

  it('are there for every piece of land the index names, and no piece is both land and open sea', () => {
    let land = 0;
    for (const step of index.steps) {
      const at = index.land[step], sea = new Set<string>();
      for (let k = 0; k < (index.sea[step]?.length ?? 0); k += 2) sea.add(keyOfTable(step, index.sea[step][k], index.sea[step][k + 1]));
      for (let k = 0; k < at.length; k += 2) {
        land++;
        expect(existsSync(`${DIR}/${step}/${at[k]}_${at[k + 1]}.bin.gz`), `step ${step} piece ${at[k]},${at[k + 1]}`).toBe(true);
        expect(sea.has(keyOfTable(step, at[k], at[k + 1]))).toBe(false);
      }
    }
    expect(land).toBeGreaterThan(400);
  });

  describe('held against the build', () => {
    const fetched = globalThis.fetch;
    // the loaders of the world graphic fetch the map's data from the page's base: here they read the files of public/
    beforeAll(() => {
      globalThis.fetch = (async (url: string | URL | Request) => {
        const file = `public/${String(url).replace(/^\//, '')}`;
        return existsSync(file) ? new Response(readFileSync(file), { headers: { 'content-type': file.endsWith('.json') ? 'application/json' : 'application/octet-stream' } }) : new Response(null, { status: 404 });
      }) as typeof fetch;
    });
    afterAll(() => { globalThis.fetch = fetched; keepTables(false); });

    // Paris lies in these: a piece of the finest of the kept steps (with the landmarks, bridges and ribbons that stand
    // on it), the one of the next step over it and the one of the coarsest step over all. What changes the land's
    // shape or cover in the code (world.ts, far.ts), or how what stands on step 2 is drawn, changes these too.
    it.each([[2, 76, -32], [3, 38, -16], [4, 19, -8], [7, 2, -1]])('step %i piece %i,%i is what the build gives now', async (step, px, pz) => {
      const margin = (index.side - index.piece) / 2, piece = { ox: px * index.piece - margin, oz: pz * index.piece - margin, part: { x0: margin, z0: margin, x1: margin + index.piece, z1: margin + index.piece } };
      keepTables(true);
      const built = await buildPiece({ region: index.region, base: '/', bakedSky: true, year: YEAR, grid: index.side }, step, piece), table = tabled();
      keepTables(false);
      expect(built && table, 'a piece of land with a table').toBeTruthy();
      const now = new Uint8Array(packTable(withThings(table!, built!.things))), kept = new Uint8Array(gunzipSync(readFileSync(`${DIR}/${step}/${px}_${pz}.bin.gz`)));
      expect(now.length === kept.length && now.every((v, k) => v === kept[k]), AGAIN).toBe(true);
    }, 60000);
  });
});
