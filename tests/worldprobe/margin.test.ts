// A far piece is built on a narrow ground (pieces.ts NARROW) to save the work on land it does not show. What it shows
// must not depend on that: the pieces beside it are built on grounds of their own, and each draws the sides of its
// border columns down to what its own ground says of the neighbour's. A river's level once was the lowest floor it
// had passed on the ground, so it depended on where the ground began: this piece of the Alps had its river a block
// lower on the narrow ground than on the wide one, and the river stepped at the border to the next piece. Now the
// river's bed is settled for the whole river in the data (tools/worldprobe/beds.py, world.ts), and this holds it.
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GRID } from '../../src/lookprobe/layout';
import { buildPiece } from '../../src/worldprobe/build';
import { type Table, keepTables, tabled } from '../../src/worldprobe/table';

const YEAR = 1291, PIECE = 200, WIDE = (GRID - PIECE) / 2, NARROW = 32;

describe('a piece on a narrow ground', () => {
  const fetched = globalThis.fetch;
  // the loaders of the world graphic fetch the map's data from the page's base: here they read the files of public/
  beforeAll(() => {
    globalThis.fetch = (async (url: string | URL | Request) => {
      const file = `public/${String(url).replace(/^\//, '')}`;
      return existsSync(file) ? new Response(readFileSync(file), { headers: { 'content-type': file.endsWith('.json') ? 'application/json' : 'application/octet-stream' } }) : new Response(null, { status: 404 });
    }) as typeof fetch;
  });
  afterAll(() => { globalThis.fetch = fetched; keepTables(false); });

  /** the columns of a piece of a step, built on a ground with `margin` blocks round the piece's own */
  async function columns(step: number, px: number, pz: number, margin: number): Promise<Table> {
    const piece = { ox: px * PIECE - margin, oz: pz * PIECE - margin, part: { x0: margin, z0: margin, x1: margin + PIECE, z1: margin + PIECE } };
    keepTables(true);
    const built = await buildPiece({ region: 'world', base: '/', bakedSky: true, year: YEAR, grid: margin === WIDE ? undefined : PIECE + 2 * margin }, step, piece), table = tabled();
    keepTables(false);
    expect(built && table, 'a piece of land').toBeTruthy();
    return table!;
  }

  // step 1 in the Alps, east of Brig: a river crosses the piece and its floor does not fall evenly
  it('has its land and its rivers as high as on the wide ground', async () => {
    const wide = await columns(1, 162, -62, WIDE), narrow = await columns(1, 162, -62, NARROW);
    let other = 0, wet = 0;
    for (let z = 0; z < PIECE; z++) for (let x = 0; x < PIECE; x++) {
      const a = (z + WIDE) * wide.side + x + WIDE, b = (z + NARROW) * narrow.side + x + NARROW;
      if (wide.wet[a]) wet++;
      if (wide.h[a] !== narrow.h[b] || wide.wet[a] !== narrow.wet[b] || wide.surf[a] !== narrow.surf[b] || wide.mat[a] !== narrow.mat[b]) other++;
    }
    expect(wet, 'columns of water in the piece').toBeGreaterThan(100);
    expect(other, 'columns that differ between the two grounds').toBe(0);
  }, 60000);
});
