// The fields of the world graphic are the land the simulation has cultivated: the layer made for the graphic holds,
// for every place, the share of its land that the simulation's own rule puts under the plough.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { type Arable, arableAt } from '../../src/worldprobe/arable';
import { lotFill } from '../../src/worldprobe/far';
import { hectares } from '../../src/sim/systems/cultivation';
import { newWorldState } from '../../tools/sim/load';

describe('the land under the plough of a place', () => {
  // 2 by 2 cells, 4 by 4 pixels of the game map: no place, nothing ploughed, 39.2 % and all of the land
  const arable: Arable = { w: 2, h: 2, cells: Uint8Array.from([255, 0, 98, 250]) };

  it('is read from the byte of the place: 250 for all of its land', () => {
    expect(arableAt(arable, 2.5, 0.5)).toBe(0);
    expect(arableAt(arable, 1, 3)).toBeCloseTo(0.392);
    expect(arableAt(arable, 3.9, 2)).toBe(1);
  });

  it('is unknown on the water and beyond the game map', () => {
    expect(arableAt(arable, 0.5, 0.5)).toBeNull();
    expect(arableAt(arable, -1, 1)).toBeNull();
    expect(arableAt(arable, 4, 1)).toBeNull();
  });
});

describe('the shipped land under the plough of 1291', () => {
  const index = JSON.parse(readFileSync('public/map/regions/world/index.json', 'utf8')) as { mapW: number; mapH: number };
  const arable: Arable = { w: index.mapW >> 1, h: index.mapH >> 1, cells: new Uint8Array(gunzipSync(readFileSync('public/map/arable_1291.bin.gz'))) };
  const ids = new Uint16Array(new Uint8Array(gunzipSync(readFileSync('public/map/ids.bin.gz'))).buffer);
  const { s, w } = newWorldState(1291, 1291);

  it('lies on half the grid of the game map', () => {
    expect(arable.cells.length).toBe(arable.w * arable.h);
    expect(ids.length).toBe(index.mapW * index.mapH);
  });

  it('is what the simulation has cultivated in every place at its start', () => {
    let places = 0, most = 0;
    // every 37th cell of the layer, at the pixel in its middle
    for (let k = 0; k < arable.cells.length; k += 37) {
      const x = (k % arable.w) * 2 + 1, y = Math.floor(k / arable.w) * 2 + 1, place = ids[y * index.mapW + x] - 1;
      const share = arableAt(arable, x, y);
      if (place < 0 || place >= s.place.arable.length) { expect(share, `at ${x}, ${y}`).toBeNull(); continue; }
      const cultivated = hectares(w, place) > 0 ? s.place.arable[place] / hectares(w, place) : 0;
      expect(Math.abs(share! - cultivated), `place ${place}`).toBeLessThan(0.003);
      places++; most = Math.max(most, share!);
    }
    expect(places).toBeGreaterThan(20000);
    // no place has more of its land under the plough than the simulation's land limit
    expect(most).toBeLessThanOrEqual(Math.round(250 * w.landLimit) / 250);
  });
});

describe('a field lot from farther away', () => {
  it('keeps a balk while it is wide enough, and is all field once it is not', () => {
    expect(lotFill(1)).toBeCloseTo((5 * 3) / (6 * 4));
    expect(lotFill(2)).toBe(1);
    expect(lotFill(5)).toBe(1);
  });
});
