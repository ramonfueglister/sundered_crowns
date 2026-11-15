// The painted map: what the world of blocks looks like from so far above that no block can be told from the next.
// A tile of the map (region.ts) becomes a picture of its land, one dot per cell, in the colours the blocks have from
// above (meadow, sand, woods, fields, rock, snow), with the heights as light and shade, the rivers as lines and the
// towns as marks in the colour of their roofs. A second picture holds the realms: their colours and the lines between them.
import { type RGB, hash2, mix, noise2, shade, smooth } from '../lookprobe/batch';
import { ROOFS } from '../buildings/palette';
import { CYPRESS, JUNGLE, LEAVES, WHEAT } from '../lookprobe/blocks';
import { GRASS_A, GRASS_B, GRASS_DRY, OPEN_WATER, ROCK_TOP_HIGH, ROCK_TOP_LOW, SHADED_SOIL, WATER_SHALLOW } from '../lookprobe/terrain';
import { type Climate, Land, climateAt } from './climate';
import { BARE, ROCK_FROM, ROCK_SHIFT_MOST, SNOW_LINE, TINT, TREE_LINE, WOODS, blockOfCell, lineShift } from './land';
import { type Region, Water, cellOf, latOf } from './region';

const mean = (list: readonly RGB[]): RGB => list.reduce<RGB>((s, c) => [s[0] + c[0] / list.length, s[1] + c[1] / list.length, s[2] + c[2] / list.length], [0, 0, 0]);
/**
 * The colours are those of the blocks seen from far above, measured on pictures of both (blocks only, map only, of
 * the same places): green ground keeps this share of its colour under its own grain and soft shade, bare ground
 * (sand, ice) and rock a little more.
 */
const GROUND_LIGHT = 0.62, BARE_LIGHT = 0.71, ROCK_LIGHT = 0.8;
/** woods from above are crowns with the shaded soil between them: darker and duller than a single crown in the sun */
const CANOPY = 0.55, SOIL_SEEN = 0.3;
const woods = (crowns: readonly RGB[]) => mix(shade(mean(crowns), CANOPY), SHADED_SOIL, SOIL_SEEN);
const LEAF = woods(LEAVES), CONIFER = woods(CYPRESS), RAIN = woods(JUNGLE), FIELD = mean(WHEAT);
/** a wood as thick as can be covers this share of its ground with crowns */
const CROWNS = 1.4;
/**
 * Ripe fields cover this share of the ploughland. At the finest level they are patches of this many blocks on the
 * blocks' own grid, as the fields of the blocks are; on the coarser levels the land only takes on their colour.
 */
const RIPE = 0.34, FIELD_SIDE = 6, FIELD_LIGHT = 0.85;
/** rock and snow take over across this many metres */
const ROCK_BAND = 250, SNOW_BAND = 250;
/** a slope of this many metres from one cell to the next is drawn as a wall at the finest level; coarser levels are flattened as the blocks are */
const WALL = 260, FLATTER = 0.6;
/** the light comes from the upper left of the picture, as on a relief map; a shaded slope keeps this share, a lit one gains up to that */
const LIGHT = [0.6, 0.6, 0.53] as const, SHADE_LEAST = 0.62, SHADE_MOST = 1.16;
/** the land's edge towards the sea is drawn in ink */
const COAST = 0.74;
/** a town is a mark in the colour of its roofs with a dark rim, larger the larger the town (`size` 1 … 5) */
const ROOF = mean(ROOFS), RIM = shade(ROOF, 0.5);
/** A place of the gazetteer, as far as the map needs it. */
export interface Mark { lon: number; lat: number; size: number }

/** linear light to the byte of an sRGB picture */
const BYTE = new Uint8Array(4097);
for (let i = 0; i <= 4096; i++) { const v = i / 4096; BYTE[i] = Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)); }
const byteOf = (v: number) => BYTE[Math.max(0, Math.min(4096, Math.round(v * 4096)))];

/** a river keeps this much of itself under a realm's colour */
const RIVER_KEPT = 0.8;

/**
 * The land of a tile: `region` is the tile's own window of the map at `level` (cells 2^level finest cells wide).
 * Returns one RGBA dot per cell, row by row from the north. The fourth value says how far a realm's colour may cover
 * the dot: not at all on the sea and the lakes, hardly on a river.
 */
export function paintLand(region: Region, climate: Climate, level: number, places: readonly Mark[] = []): Uint8ClampedArray {
  const { w, h } = region, out = new Uint8ClampedArray(w * h * 4), wider = 2 ** level, wall = WALL * wider ** FLATTER;
  const at = (x: number, y: number) => Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x));
  const c0x = region.x0 * region.cells, c0y = region.y0 * region.cells;
  const put = (i: number, c: RGB, land = 255) => { out[i * 4] = byteOf(c[0]); out[i * 4 + 1] = byteOf(c[1]); out[i * 4 + 2] = byteOf(c[2]); out[i * 4 + 3] = land; };
  for (let y = 0; y < h; y++) {
    const lat = latOf(region, y + 0.5), shift = lineShift(lat), treeLine = TREE_LINE + shift, rockFrom = Math.max(300, ROCK_FROM + Math.min(ROCK_SHIFT_MOST, shift));
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (region.water[i] !== Water.Land) { put(i, OPEN_WATER, 0); continue; }
      const m = region.shaped[i];
      // the kind of land, its borders frayed as those of the blocks are (world.ts)
      const [bx, bz] = blockOfCell((c0x + x + 0.5) * wider, (c0y + y + 0.5) * wider);
      const land = climateAt(climate, region.x0 + (x + 0.5 + (noise2(bx / 9, bz / 9, 61) - 0.5) * 3) / region.cells, region.y0 + (y + 0.5 + (noise2(bx / 9, bz / 9, 62) - 0.5) * 3) / region.cells), kind = land & 127;
      // the meadow, sun-bleached in the low country, and the ground of the lands that are not green
      let c = mix(mix(GRASS_A, GRASS_B, 0.5), GRASS_DRY, 0.35 * (0.25 + 0.3 * smooth(900, 200, m)));
      const tint = TINT[kind];
      if (tint) c = mix(c, tint[0], tint[1]);
      c = shade(c, GROUND_LIGHT + (BARE_LIGHT - GROUND_LIGHT) * (tint?.[1] ?? 0));
      const ripe = RIPE * (region.crops[i] / 255);
      c = mix(c, shade(FIELD, FIELD_LIGHT), level > 0 ? ripe : hash2(Math.floor(bx / FIELD_SIDE), Math.floor(bz / FIELD_SIDE), 31) < ripe ? 1 : 0);
      // woods up to the tree line, of the trees the blocks would plant; rock and snow above
      const rock = smooth(rockFrom, rockFrom + ROCK_BAND, m);
      if (!BARE.includes(kind) && m <= treeLine) {
        const cover = land & 128 ? region.forest[i] / 255 : WOODS[kind] ?? 0;
        const leaf = kind === Land.Rainforest ? RAIN : mix(LEAF, CONIFER, kind === Land.Boreal ? 0.85 : 0.08 + 0.8 * smooth(500 + shift, 1300 + shift, m));
        c = mix(c, leaf, Math.min(1, CROWNS * (0.04 + 0.7 * cover)) * (1 - rock));
      }
      c = mix(mix(c, shade(ROCK_TOP_LOW, ROCK_LIGHT), rock), ROCK_TOP_HIGH, smooth(SNOW_LINE + shift - SNOW_BAND / 2, SNOW_LINE + shift + SNOW_BAND / 2, m));
      // light and shade of the slopes
      const gx = (region.shaped[at(x + 1, y)] - region.shaped[at(x - 1, y)]) / 2 / wall, gy = (region.shaped[at(x, y + 1)] - region.shaped[at(x, y - 1)]) / 2 / wall;
      let lit = Math.max(SHADE_LEAST, Math.min(SHADE_MOST, (LIGHT[0] * gx + LIGHT[1] * gy + LIGHT[2]) / Math.sqrt(1 + gx * gx + gy * gy) / LIGHT[2]));
      if (region.water[at(x + 1, y)] === Water.Sea || region.water[at(x - 1, y)] === Water.Sea || region.water[at(x, y + 1)] === Water.Sea || region.water[at(x, y - 1)] === Water.Sea) lit *= COAST;
      put(i, shade(c, lit));
    }
  }
  // the rivers as lines, the great ones broader
  const wet = new Float32Array(w * h);
  for (const r of region.rivers) {
    const half = r.rank <= 2 ? 1.1 : r.rank <= 5 ? 0.75 : 0.5;
    for (let k = 0; k + 1 < r.pts.length; k++) {
      const [ax, ay] = r.pts[k], [bx, by] = r.pts[k + 1], len = Math.hypot(bx - ax, by - ay);
      for (let t = 0; t <= len; t += 0.5) {
        const px = ax + ((bx - ax) * t) / (len || 1), py = ay + ((by - ay) * t) / (len || 1);
        for (let y = Math.floor(py - half - 0.5); y <= py + half + 0.5; y++) for (let x = Math.floor(px - half - 0.5); x <= px + half + 0.5; x++) {
          if (x < 0 || y < 0 || x >= w || y >= h || region.water[y * w + x] !== Water.Land) continue;
          // the line's share of the dot; a dot keeps the most that any point of the line gave it
          const share = Math.max(0, Math.min(1, half + 0.5 - Math.hypot(x + 0.5 - px, y + 0.5 - py))), i = y * w + x, had = wet[i];
          if (share <= had) continue;
          const more = (share - had) / (1 - had);
          for (let ch = 0; ch < 3; ch++) out[i * 4 + ch] += (byteOf(WATER_SHALLOW[ch]) - out[i * 4 + ch]) * more;
          wet[i] = share; out[i * 4 + 3] = 255 * (1 - RIVER_KEPT * share);
        }
      }
    }
  }
  // the towns: all but the villages at the finest level, fewer and fewer on the coarser ones
  const least = level === 0 ? 2 : Math.min(5, 2 + Math.ceil(level / 2));
  for (const p of places) {
    if (p.size < least) continue;
    const [px, py] = cellOf(region, p.lon, p.lat), r = Math.max(1.2, (1 + 0.8 * p.size) / wider ** 0.7), rim = Math.min(0.9, r / 2.5);
    if (px < -r - 1 || py < -r - 1 || px > w + r + 1 || py > h + r + 1) continue;
    for (let y = Math.max(0, Math.floor(py - r - 1)); y <= Math.min(h - 1, py + r + 1); y++) for (let x = Math.max(0, Math.floor(px - r - 1)); x <= Math.min(w - 1, px + r + 1); x++) {
      const d = Math.hypot(x + 0.5 - px, y + 0.5 - py), share = Math.max(0, Math.min(1, r + 0.5 - d)), c = mix(ROOF, RIM, Math.max(0, Math.min(1, d - (r - rim) + 0.5))), i = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) out[i + ch] += (byteOf(c[ch]) - out[i + ch]) * share;
    }
  }
  return out;
}

/** The realms on the map: `ids` holds the place of every map pixel, counted from 1 (land places first: `owner` has one entry each, -1 for no realm). */
export interface Realms { ids: Uint16Array; w: number; h: number; owner: ArrayLike<number>; /** linear colour of every realm */ colors: readonly RGB[] }
/** a realm's colour covers its land this strongly; the lines between realms are its colour darkened */
const WASH = 0.72, BORDER = 0.45, BORDER_COVER = 0.92;

/**
 * The realms of the tile (tx, ty) of `level` of a map with `cells` finest cells per map pixel, `side` dots wide: per
 * dot the realm's colour times its cover, and the cover (so that the dots blend cleanly), in linear light.
 */
export function paintRealms(r: Realms, level: number, tx: number, ty: number, side: number, cells: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(side * side * 4), perDot = 2 ** level / cells, lands = r.owner.length;
  /** the realm at a dot of the tile: -1 none, -2 water */
  const realm = (x: number, y: number) => {
    const mx = Math.floor((tx * side + x + 0.5) * perDot), my = Math.floor((ty * side + y + 0.5) * perDot);
    if (mx < 0 || my < 0 || mx >= r.w || my >= r.h) return -2;
    const place = r.ids[my * r.w + mx] - 1;
    return place >= 0 && place < lands ? r.owner[place] : -2;
  };
  const row = new Int16Array((side + 2) * 3);
  const fill = (k: number, y: number) => { for (let x = -1; x <= side; x++) row[k * (side + 2) + x + 1] = realm(x, y); };
  fill(0, -1); fill(1, 0);
  for (let y = 0; y < side; y++) {
    // three rows of realms are kept: the one above, the dot's own and the one below
    fill((y + 2) % 3, y + 1);
    const up = ((y % 3) * (side + 2)) + 1, own = (((y + 1) % 3) * (side + 2)) + 1, down = (((y + 2) % 3) * (side + 2)) + 1;
    for (let x = 0; x < side; x++) {
      const o = row[own + x];
      if (o < 0) continue;
      const other = (n: number) => n !== o && n !== -2;
      const edge = other(row[own + x - 1]) || other(row[own + x + 1]) || other(row[up + x]) || other(row[down + x]);
      const c = r.colors[o], cover = edge ? BORDER_COVER : WASH, strength = (edge ? BORDER : 1) * cover * 255, i = (y * side + x) * 4;
      out[i] = c[0] * strength; out[i + 1] = c[1] * strength; out[i + 2] = c[2] * strength; out[i + 3] = cover * 255;
    }
  }
  return out;
}

/** Where a realm's name is written: the middle of its largest piece of land in map pixels, how long and broad that piece is, and how it lies (radians, 0: west to east). */
export interface RealmName { realm: number; x: number; y: number; long: number; broad: number; turn: number }

/** The largest connected piece of every realm, measured on every `every`-th map pixel. */
export function realmNames(r: Realms, every = 4): RealmName[] {
  const w = Math.floor(r.w / every), h = Math.floor(r.h / every), lands = r.owner.length, of = new Int16Array(w * h), done = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const place = r.ids[y * every * r.w + x * every] - 1; of[y * w + x] = place >= 0 && place < lands ? r.owner[place] : -1; }
  const best = new Map<number, { n: number; sx: number; sy: number; sxx: number; syy: number; sxy: number }>(), stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    const o = of[start];
    if (o < 0 || done[start]) continue;
    const sum = { n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0 };
    stack.push(start); done[start] = 1;
    while (stack.length) {
      const i = stack.pop()!, x = i % w, y = (i - x) / w;
      sum.n++; sum.sx += x; sum.sy += y; sum.sxx += x * x; sum.syy += y * y; sum.sxy += x * y;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && !done[j] && of[j] === o) { done[j] = 1; stack.push(j); }
    }
    if (sum.n > (best.get(o)?.n ?? 0)) best.set(o, sum);
  }
  return [...best].map(([realm, s]) => {
    // the piece as an ellipse of the same spread: its long axis is where the name runs
    const mx = s.sx / s.n, my = s.sy / s.n, a = s.sxx / s.n - mx * mx, b = s.sxy / s.n - mx * my, c = s.syy / s.n - my * my;
    const mid = (a + c) / 2, off = Math.hypot((a - c) / 2, b), turn = 0.5 * Math.atan2(2 * b, a - c);
    // a filled ellipse has a quarter of its half axis squared as its spread
    return { realm, x: (mx + 0.5) * every, y: (my + 0.5) * every, long: 4 * Math.sqrt(mid + off) * every, broad: 4 * Math.sqrt(Math.max(0.25, mid - off)) * every, turn };
  });
}
