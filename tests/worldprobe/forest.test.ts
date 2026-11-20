// The forest of a start year in the world graphic: its share is read between the cells that hold one, and laid out
// as woods with open land between them, so that over a landscape as much is wooded as the layer says.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { fbm2 } from '../../src/lookprobe/batch';
import { type Forest, WOOD, conifersAt, forestAt, leanOf, stand, tilth } from '../../src/worldprobe/forest';

describe('the forest of a year at a place', () => {
  // 4 by 2 cells, 8 by 4 map pixels: the cells' middles lie at the odd pixels
  const forest: Forest = {
    w: 4,
    h: 2,
    share: Uint8Array.from([0, 250, 255, 255, 125, 250, 255, 50]),
    conifers: Uint8Array.from([255, 255, 255, 255, 255, 255, 255, 100]),
  };

  it("is the cell's share at its middle, and lies between the cells elsewhere", () => {
    expect(forestAt(forest, 1, 1)).toBe(0);
    expect(forestAt(forest, 3, 1)).toBe(1);
    expect(forestAt(forest, 2, 1)).toBeCloseTo(0.5);
    expect(forestAt(forest, 1, 2)).toBeCloseTo(0.25);
  });

  it("leaves the cells without a value out: by the sea the land's share holds", () => {
    expect(forestAt(forest, 4, 1)).toBe(1);
    expect(forestAt(forest, 6.5, 2.5)).toBeCloseTo(0.2);
  });

  it('is unknown where no cell round the place holds a value', () => {
    expect(forestAt(forest, 5.5, 0.5)).toBeNull();
    expect(conifersAt(forest, 1, 1)).toBeNull();
    expect(conifersAt(forest, 7, 3)).toBeCloseTo(0.4);
    expect(conifersAt({ ...forest, conifers: null }, 7, 3)).toBeNull();
  });

  it('goes on round the globe', () => {
    expect(forestAt(forest, 8.5, 3)).toBeCloseTo(forestAt(forest, 0.5, 3)!);
  });
});

describe('the woods of a landscape', () => {
  /** the mean of `stand` over a square of `side` data cells, taken every `pitch` cells from (x0, z0) on */
  const mean = (share: number, fine: number, x0 = 0, z0 = 0, side = 400, pitch = 0.5) => {
    let sum = 0,
      n = 0;
    for (let z = z0; z < z0 + side; z += pitch)
      for (let x = x0; x < x0 + side; x += pitch) {
        sum += stand(share, x, z, fine);
        n++;
      }
    return sum / n;
  };

  it('cover the share of it the layer gives, whatever the share and wherever the landscape', () => {
    for (const share of [0.02, 0.088, 0.25, 0.5, 0.75, 0.95])
      for (const [x0, z0] of [
        [0, 0],
        [9000, 3000],
        [-5000, 1234.5],
      ])
        expect(Math.abs(mean(share, 1, x0, z0) - share)).toBeLessThan(0.02);
  });

  it('are woods and open land, not trees spread evenly', () => {
    let inside = 0,
      open = 0,
      n = 0;
    for (let z = 0; z < 300; z += 0.5)
      for (let x = 0; x < 300; x += 0.5) {
        const s = stand(0.3, x, z);
        if (s > 0.9) inside++;
        else if (s < 0.1) open++;
        n++;
      }
    expect(inside / n).toBeGreaterThan(0.2);
    expect(open / n).toBeGreaterThan(0.6);
    // a wood is some cells across: a step of half a cell seldom leaves it
    let same = 0,
      pairs = 0;
    for (let z = 0; z < 300; z += 0.5)
      for (let x = 0; x < 300; x += 0.5) {
        pairs++;
        if (stand(0.3, x, z) > 0.5 === stand(0.3, x + 0.5, z) > 0.5) same++;
      }
    expect(same / pairs).toBeGreaterThan(1 - 2 / WOOD);
  });

  it('are none where nothing grows and closed where all is wooded', () => {
    for (let k = 0; k < 200; k++) {
      expect(stand(0, k * 3.7, k * 1.3)).toBe(0);
      expect(stand(1, k * 3.7, k * 1.3)).toBe(1);
    }
  });

  it('give way to the share itself where a block is as large as a wood', () => {
    expect(stand(0.3, 12.5, 7.5, 0)).toBe(0.3);
    expect(Math.abs(mean(0.3, 0.5) - 0.3)).toBeLessThan(0.02);
    for (let k = 0; k < 200; k++) {
      const s = stand(0.3, k * 3.7, k * 1.3, 0.5);
      expect(s).toBeGreaterThanOrEqual(0.15);
      expect(s).toBeLessThanOrEqual(0.65);
    }
  });

  it('stand at the same places for every piece and step: by the place alone', () => {
    expect(stand(0.4, 1234.25, -77.5)).toBe(stand(0.4, 1234.25, -77.5));
    expect(stand(0.4, 1234.25, -77.5, 0.5)).toBeCloseTo(0.4 + (stand(0.4, 1234.25, -77.5) - 0.4) * 0.5);
  });
});

describe('the fields of a landscape', () => {
  const over = (of: (x: number, z: number) => number, side = 400, pitch = 0.5) => {
    let sum = 0,
      n = 0;
    for (let z = 0; z < side; z += pitch)
      for (let x = 0; x < side; x += pitch) {
        sum += of(x, z);
        n++;
      }
    return sum / n;
  };

  it('cover the share of it that is under the plough', () => {
    for (const share of [0.03, 0.15, 0.39, 0.57, 0.9])
      expect(Math.abs(over((x, z) => tilth(share, x + 700, z - 300)) - share)).toBeLessThan(0.02);
  });

  it('lie together, where the woods do not, and leave the open grass between the two', () => {
    const woods = 0.25,
      fields = 0.5;
    let both = 0,
      grass = 0,
      n = 0;
    for (let z = 0; z < 300; z += 0.5)
      for (let x = 0; x < 300; x += 0.5) {
        const w = stand(woods, x, z),
          f = tilth(fields, x, z);
        if (w > 0.5 && f > 0.5) both++;
        if (w < 0.5 && f < 0.5) grass++;
        n++;
      }
    expect(both).toBe(0);
    // a quarter of the land is neither: the open grass
    expect(grass / n).toBeGreaterThan(0.22);
    expect(grass / n).toBeLessThan(0.28);
    let same = 0,
      pairs = 0;
    for (let z = 0; z < 300; z += 0.5)
      for (let x = 0; x < 300; x += 0.5) {
        pairs++;
        if (tilth(fields, x, z) > 0.5 === tilth(fields, x + 0.5, z) > 0.5) same++;
      }
    expect(same / pairs).toBeGreaterThan(1 - 2 / WOOD);
  });

  it('take the floors and plains of the land, as the woods keep its heights', () => {
    let floors = 0,
      heights = 0;
    for (let k = 0; k < 4000; k++) {
      floors += tilth(0.3, k * 3.7, k * 1.3, 1, -1);
      heights += tilth(0.3, k * 3.7, k * 1.3, 1, 1);
    }
    expect(floors / 4000).toBeGreaterThan(0.45);
    expect(heights / 4000).toBeLessThan(0.15);
  });

  it('give way to the share itself where a block is as large as a wood', () => {
    expect(tilth(0.3, 12.5, 7.5, 0)).toBe(0.3);
    expect(tilth(0, 12.5, 7.5)).toBe(0);
  });
});

describe('where in a landscape the woods were left', () => {
  // hills of some hundred metres over a ground of 200 by 200 columns, with a lake in them
  const n = 200,
    heights = new Float32Array(n * n),
    land = new Uint8Array(n * n).fill(1);
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) heights[z * n + x] = 400 + 600 * fbm2(x / 30, z / 30, 5);
  for (let z = 90; z < 110; z++)
    for (let x = 90; x < 110; x++) {
      land[z * n + x] = 0;
      heights[z * n + x] = 0;
    }
  const lean = leanOf(heights, land, n, 20);

  it('are the heights, and the valley floors are cleared first', () => {
    let top = 0,
      floor = 0;
    for (let z = 21; z < n - 21; z++)
      for (let x = 21; x < n - 21; x++) {
        const i = z * n + x;
        if (!land[i]) continue;
        let highest = true,
          lowest = true;
        for (let dz = -20; dz <= 20; dz += 5)
          for (let dx = -20; dx <= 20; dx += 5) {
            const j = (z + dz) * n + x + dx;
            if (!land[j]) continue;
            if (heights[j] > heights[i]) highest = false;
            if (heights[j] < heights[i]) lowest = false;
          }
        if (highest) {
          expect(lean[i]).toBeGreaterThan(0.3);
          top++;
        }
        if (lowest) {
          expect(lean[i]).toBeLessThan(-0.3);
          floor++;
        }
      }
    expect(top).toBeGreaterThan(3);
    expect(floor).toBeGreaterThan(3);
  });

  it('even out over the landscape, so that its share of woods holds', () => {
    // against the same woods laid out without the lie of the land
    let sum = 0,
      wooded = 0,
      plain = 0,
      count = 0;
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        const i = z * n + x;
        if (!land[i]) continue;
        sum += lean[i];
        wooded += stand(0.3, x / 2, z / 2, 1, lean[i]);
        plain += stand(0.3, x / 2, z / 2);
        count++;
      }
    expect(Math.abs(sum / count)).toBeLessThan(0.05);
    expect(Math.abs(wooded - plain) / count).toBeLessThan(0.02);
  });

  it('say nothing on a plain and on the water', () => {
    const flat = leanOf(
      new Float32Array(n * n).map((_, i) => 100 + (i % 7)),
      land,
      n,
      20,
    );
    for (let i = 0; i < n * n; i++) expect(Math.abs(flat[i])).toBeLessThan(0.2);
    expect(lean[100 * n + 100]).toBe(0);
    // the water's height counts for nothing: the shore of the lake is no height
    expect(
      Math.abs(
        lean[100 * n + 88] -
          leanOf(
            heights.map((h, i) => (land[i] ? h : 9000)),
            land,
            n,
            20,
          )[100 * n + 88],
      ),
    ).toBe(0);
  });

  it('move a wood no further than its landscape has woods or open land', () => {
    for (const share of [0.05, 0.5, 0.95])
      for (const l of [-1, 1])
        for (let k = 0; k < 100; k++) {
          const s = stand(share, k * 3.7, k * 1.3, 1, l);
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThanOrEqual(1);
        }
    let more = 0,
      less = 0;
    for (let k = 0; k < 4000; k++) {
      more += stand(0.3, k * 3.7, k * 1.3, 1, 1);
      less += stand(0.3, k * 3.7, k * 1.3, 1, -1);
    }
    expect(more / 4000).toBeGreaterThan(0.45);
    expect(less / 4000).toBeLessThan(0.15);
  });
});

describe('the shipped forest of 1291', () => {
  const index = JSON.parse(readFileSync('public/map/regions/world/index.json', 'utf8')) as {
    worldW: number;
    worldH: number;
    mapW: number;
    mapH: number;
    lon0: number;
    lon1: number;
    latN: number;
    latS: number;
  };
  const w = index.worldW >> 1,
    h = index.worldH >> 1;
  const read = (name: string) => new Uint8Array(gunzipSync(readFileSync(`public/map/${name}1291.bin.gz`)));
  const forest: Forest = { w, h, share: read('forest'), conifers: read('conifer') };
  const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const pixel = (lon: number, lat: number): [number, number] => [
    ((lon - index.lon0) / (index.lon1 - index.lon0)) * index.mapW,
    ((merc(index.latN) - merc(lat)) / (merc(index.latN) - merc(index.latS))) * index.mapH,
  ];

  it('lies on the grid of the climate layer', () => {
    expect(forest.share.length).toBe(w * h);
    expect(forest.conifers!.length).toBe(w * h);
  });

  it('has England cleared, the north wooded and nothing in the sea', () => {
    expect(forestAt(forest, ...pixel(-1.5, 52.6))!).toBeLessThan(0.2);
    expect(forestAt(forest, ...pixel(26, 62.5))!).toBeGreaterThan(0.6);
    expect(forestAt(forest, ...pixel(-15, 45))).toBeNull();
  });
});
