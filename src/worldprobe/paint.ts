// The realms' map (realms.ts): a tile of it is a picture of the realms' colours and of the lines between them, and
// every realm's name is written across the largest piece of its land.
import type { RGB } from '../lookprobe/batch';

/** The realms on the map: `ids` holds the place of every map pixel, counted from 1 (land places first: `owner` has one entry each, -1 for no realm). */
export interface Realms { ids: Uint16Array; w: number; h: number; owner: ArrayLike<number>; /** linear colour of every realm */ colors: readonly RGB[]; /** the place that is picked out, counted from 0 (none: -1 or left out) */ chosen?: number }
/** a realm's colour covers its land this strongly; the lines between realms are its colour darkened */
const WASH = 0.72, BORDER = 0.45, BORDER_COVER = 0.92;
/** the place picked out: its colour is lightened this far towards white and covers this strongly, inside a line of this colour; land without a realm has this colour there */
const CHOSEN_LIGHT = 0.45, CHOSEN_COVER = 0.9, CHOSEN_LINE: RGB = [1, 0.86, 0.5], NO_REALM: RGB = [0.5, 0.5, 0.5];

/**
 * The realms of the tile (tx, ty) of `level` of a map with `cells` finest cells per map pixel, `side` dots wide: per
 * dot the realm's colour times its cover, and the cover (so that the dots blend cleanly), in linear light.
 */
export function paintRealms(r: Realms, level: number, tx: number, ty: number, side: number, cells: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(side * side * 4), perDot = 2 ** level / cells, lands = r.owner.length, chosen = r.chosen ?? -1;
  /** the land place at a dot of the tile, counted from 0 (-1: water, or beyond the map) */
  const place = (x: number, y: number) => {
    const mx = Math.floor((tx * side + x + 0.5) * perDot), my = Math.floor((ty * side + y + 0.5) * perDot);
    if (mx < 0 || my < 0 || mx >= r.w || my >= r.h) return -1;
    const at = r.ids[my * r.w + mx] - 1;
    return at < lands ? at : -1;
  };
  // per dot the realm (-1 none, -2 water) and whether it is of the place picked out
  const row = new Int16Array((side + 2) * 3), marked = new Uint8Array((side + 2) * 3);
  const fill = (k: number, y: number) => { for (let x = -1; x <= side; x++) { const at = place(x, y), j = k * (side + 2) + x + 1; row[j] = at < 0 ? -2 : r.owner[at]; marked[j] = at >= 0 && at === chosen ? 1 : 0; } };
  fill(0, -1); fill(1, 0);
  for (let y = 0; y < side; y++) {
    // three rows are kept: the one above, the dot's own and the one below
    fill((y + 2) % 3, y + 1);
    const up = ((y % 3) * (side + 2)) + 1, own = (((y + 1) % 3) * (side + 2)) + 1, down = (((y + 2) % 3) * (side + 2)) + 1;
    for (let x = 0; x < side; x++) {
      const o = row[own + x], i = (y * side + x) * 4;
      if (marked[own + x]) {
        const rim = !(marked[own + x - 1] && marked[own + x + 1] && marked[up + x] && marked[down + x]), c = o < 0 ? NO_REALM : r.colors[o];
        const cover = rim ? 1 : CHOSEN_COVER, light = (v: number) => (v + (1 - v) * CHOSEN_LIGHT) * cover * 255;
        if (rim) { out[i] = CHOSEN_LINE[0] * 255; out[i + 1] = CHOSEN_LINE[1] * 255; out[i + 2] = CHOSEN_LINE[2] * 255; } else { out[i] = light(c[0]); out[i + 1] = light(c[1]); out[i + 2] = light(c[2]); }
        out[i + 3] = cover * 255;
        continue;
      }
      if (o < 0) continue;
      const other = (n: number) => n !== o && n !== -2;
      const edge = other(row[own + x - 1]) || other(row[own + x + 1]) || other(row[up + x]) || other(row[down + x]);
      const c = r.colors[o], cover = edge ? BORDER_COVER : WASH, strength = (edge ? BORDER : 1) * cover * 255;
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
