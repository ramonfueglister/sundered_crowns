// The window of the map that the ways of tools/roads/build_roads.ts are laid over, a map pixel at a time: the towns
// of the world graphic, and the height, water and drainage of every pixel from the world graphic's own map data
// (public/map/regions/world).
import { readFileSync, existsSync } from 'node:fs';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import gazetteer from '../../data/content/gazetteer.json';
import { type Index, fromDifferences } from '../../src/worldprobe/region';

/** the eight neighbours of a pixel: the four sides first, then the four corners */
export const DX = [1, -1, 0, 0, 1, 1, -1, -1],
  DY = [0, 0, 1, -1, 1, -1, 1, -1];

/** The direction (an index of `DX`, `DY`) of the step from pixel `a` to its neighbour `b` in a window `w` wide. */
export function direction(w: number, a: number, b: number): number {
  const dx = (b % w) - (a % w),
    dy = Math.floor(b / w) - Math.floor(a / w);
  for (let d = 0; d < 8; d++) if (DX[d] === dx && DY[d] === dy) return d;
  return 0;
}

/** The map of geo.json and the window of it that the towns of a year need. */
export function readLand(ROOT: string, year: number) {
  const geo = JSON.parse(readFileSync(resolve(ROOT, 'public/data/geo.json'), 'utf8')) as {
    W: number;
    H: number;
    L: number;
    lon0: number;
    lon1: number;
    latN: number;
    latS: number;
    loc: { x: number[]; y: number[] };
  };
  const index = JSON.parse(readFileSync(resolve(ROOT, 'public/map/regions/world/index.json'), 'utf8')) as Pick<
    Index,
    'tile' | 'cells' | 'mapW' | 'mapH' | 'tiles' | 'coding'
  >;
  const W = geo.W,
    H = geo.H,
    C = index.cells,
    T = index.tile,
    PT = T / C;
  const merc = (deg: number) => Math.asinh(Math.tan((deg * Math.PI) / 180));
  const latOfRow = (y: number) =>
    (Math.atan(Math.sinh(merc(geo.latN) - (y / H) * (merc(geo.latN) - merc(geo.latS)))) * 180) / Math.PI;
  const pixelOf = (lon: number, lat: number): [number, number] => [
    ((lon - geo.lon0) / (geo.lon1 - geo.lon0)) * W,
    ((merc(geo.latN) - merc(lat)) / (merc(geo.latN) - merc(geo.latS))) * H,
  ];
  /** km along a pixel at a row (the map is a Mercator map: a pixel is as tall as it is wide) */
  const kmRow = new Float32Array(H);
  for (let y = 0; y < H; y++)
    kmRow[y] = ((geo.lon1 - geo.lon0) / W) * 111.32 * Math.cos((latOfRow(y + 0.5) * Math.PI) / 180);

  // the towns of the world graphic: those the simulation holds persons for
  const land = JSON.parse(readFileSync(resolve(ROOT, `public/data/hamletland_${year}.json`), 'utf8')) as {
    town: number[];
    inside: number[];
    hamlet: number[];
  };
  const places = gazetteer.places as { name: string; lon: number; lat: number }[];
  const towns = land.town.map((t, k) => {
    const [x, y] = pixelOf(places[t].lon, places[t].lat);
    return {
      site: t,
      name: places[t].name,
      x: Math.floor(x),
      y: Math.floor(y),
      people: (land.inside[k] + land.hamlet[k]) * 100,
    };
  });

  // the window of the map the towns need, with a margin
  const MARGIN = 200;
  const X0 = Math.max(0, Math.min(...towns.map((t) => t.x)) - MARGIN),
    Y0 = Math.max(0, Math.min(...towns.map((t) => t.y)) - MARGIN);
  const X1 = Math.min(W, Math.max(...towns.map((t) => t.x)) + MARGIN),
    Y1 = Math.min(H, Math.max(...towns.map((t) => t.y)) + MARGIN);
  const w = X1 - X0,
    h = Y1 - Y0,
    n = w * h;
  /** mean height (m), whether the pixel is water (sea or lake), and the largest drainage area (km²) of its cells */
  const height = new Float32Array(n),
    wet = new Uint8Array(n),
    drains = new Float32Array(n);
  {
    const has = new Set(index.tiles),
      sum = new Float32Array(n),
      cnt = new Uint8Array(n),
      water = new Uint8Array(n);
    for (let ty = Math.floor(Y0 / PT); ty * PT < Y1; ty++)
      for (let tx = Math.floor(X0 / PT); tx * PT < X1; tx++) {
        const file = resolve(ROOT, `public/map/regions/world/${tx}_${ty}.${index.coding === 'br' ? 'bin' : 'bin.gz'}`);
        if (!has.has(`${tx}_${ty}`) || !existsSync(file)) continue;
        const raw =
            index.coding === 'br'
              ? fromDifferences(brotliDecompressSync(readFileSync(file)), T)
              : gunzipSync(readFileSync(file)),
          t = T * T;
        const shaped = new Int16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + t * 2)),
          drainage = raw.subarray(t * 2, t * 3),
          wat = raw.subarray(t * 3, t * 4);
        for (let cy = 0; cy < T; cy++)
          for (let cx = 0; cx < T; cx++) {
            const px = tx * PT + Math.floor(cx / C) - X0,
              py = ty * PT + Math.floor(cy / C) - Y0;
            if (px < 0 || py < 0 || px >= w || py >= h) continue;
            const i = py * w + px,
              c = cy * T + cx;
            sum[i] += shaped[c];
            cnt[i]++;
            if (wat[c] !== 0) water[i]++;
            drains[i] = Math.max(drains[i], 2 ** (drainage[c] / 16) - 1);
          }
      }
    for (let i = 0; i < n; i++) {
      height[i] = cnt[i] ? sum[i] / cnt[i] : 0;
      wet[i] = !cnt[i] || water[i] * 2 > cnt[i] ? 1 : 0;
    }
  }
  return { geo, W, H, kmRow, towns, X0, Y0, X1, Y1, w, h, n, height, wet, drains };
}

export type Land = ReturnType<typeof readLand>;
