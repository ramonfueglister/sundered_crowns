// Paints tiles of the realms' map off the page's own thread (paint.ts), finds where the realms' names are written
// and says which place of the game map lies at a point. The pictures are handed over, not copied. The realms are
// those of the world's start year as the game sets them up (1356 when the page does not say), until the page says
// who holds which place now.
import { rgb } from '../lookprobe/batch';
import { maybeGunzip } from './gunzip';
import { type NamesOptions, type RealmName, type Realms, type Rest, paintRealms, placeAt, realmNames } from './paint';
import { extentOf } from './extent';
import { indexOf, projectionFrom } from './region';

/** The realms as they stand: who holds every place (-1: no realm), and every realm's colour (0xrrggbb) and name, by its number. */
export interface RealmsNow {
  owner: Int16Array;
  colors: number[];
  names: string[];
}
/** A tile of the realms' map, the realms' names, new realms to draw from now on, the place to pick out from now on (-1: none), or the place at a map pixel. */
export type RealmsJob = {
  id: number;
  region: string;
  base: string;
  /** the world's start year: its setup colours the map until the page sends the realms (default 1356) */
  year?: number;
} & (
  | {
      kind: 'tile';
      level: number;
      tx: number;
      ty: number;
      /** finest cells along a map pixel */
      cells: number;
    }
  | { kind: 'names' }
  | ({ kind: 'realms' } & RealmsNow)
  | { kind: 'choose'; place: number }
  | { kind: 'place'; x: number; y: number }
);
export interface RealmsDone {
  id: number;
  /** the tile, RGBA row by row from the north; none where the tile holds no realm */
  tile?: Uint8ClampedArray;
  /** where the realms' names are written, with the names */
  names?: (RealmName & { name: string })[];
  /** the place at the map pixel asked for, counted from 0 (-1: none, sea) */
  place?: number;
  /** after new realms or another place picked out: where the map changed, as rectangles of map pixels x0, y0, x1, y1
   *  (x1 and y1 excluded), one after another; the tiles that touch them are to be painted anew */
  dirty?: number[];
  /** after new realms: whether a realm's name moved or changed (the names are to be asked for anew) */
  renamed?: boolean;
  error?: string;
}
/** a realm the page gave no colour for */
const NO_COLOUR = 0x808080;
interface Setup {
  states: { short: { de: string }; color: string }[];
  owner: (number | null)[];
}

const get = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r;
};
const u16 = (raw: Uint8Array) => new Uint16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
/** cells of the rest of the world to a map pixel (half as fine as the game map) */
const REST_CELLS = 0.5;
/** The places of the rest of the world, beyond the game map, over the whole world frame (0 on the game map). */
async function restOf(base: string, worldW: number): Promise<Rest> {
  const raw = await maybeGunzip(new Uint8Array(await (await get(`${base}map/beyond.bin.gz`)).arrayBuffer())),
    w = Math.round(worldW * REST_CELLS);
  if (raw.byteLength % (w * 2)) throw new Error(`beyond.bin: ${raw.byteLength} bytes are no rows of ${w}`);
  return { ids: u16(raw), w, h: raw.byteLength / (w * 2), cells: REST_CELLS };
}
let realms: Promise<Realms & { names: string[] }> | undefined;
/** The realms of the start year `year` as the game sets them up, on the map of region `name`. */
const realmsOf = (name: string, base: string, year = 1356) =>
  (realms ??= (async (): Promise<Realms & { names: string[] }> => {
    const [index, setup, packed] = await Promise.all([
      indexOf(name, base),
      get(`${base}data/setup_${year}.json`).then((r) => r.json() as Promise<Setup>),
      get(`${base}map/ids.bin.gz`).then((r) => r.arrayBuffer()),
    ]);
    const raw = await maybeGunzip(new Uint8Array(packed));
    if (raw.byteLength !== index.mapW * index.mapH * 2)
      throw new Error(`ids.bin: expected ${index.mapW * index.mapH * 2} bytes, got ${raw.byteLength}`);
    return {
      ids: u16(raw),
      w: index.mapW,
      h: index.mapH,
      round: index.worldW,
      rest: index.worldW ? await restOf(base, index.worldW) : undefined,
      owner: Int16Array.from(setup.owner, (o) => (typeof o === 'number' && o >= 0 ? o : -1)),
      colors: setup.states.map((s) => rgb(Number.parseInt(s.color.slice(1), 16))),
      names: setup.states.map((s) => s.short.de),
    };
  })());

/** The bounding box of every land place on the game map, in map pixels (x0, y0, x1, y1 each; x1, y1 excluded), found once. */
let boxes: Int32Array | undefined;
function boxesOf(r: Realms): Int32Array {
  if (boxes) return boxes;
  const n = r.owner.length,
    b = new Int32Array(n * 4);
  for (let p = 0; p < n; p++) {
    b[p * 4] = b[p * 4 + 1] = 0x7fffffff;
    b[p * 4 + 2] = b[p * 4 + 3] = -1;
  }
  for (let y = 0; y < r.h; y++)
    for (let x = 0, row = y * r.w; x < r.w; x++) {
      const p = r.ids[row + x] - 1;
      if (p < 0 || p >= n) continue;
      const k = p * 4;
      if (x < b[k]) b[k] = x;
      if (y < b[k + 1]) b[k + 1] = y;
      if (x >= b[k + 2]) b[k + 2] = x + 1;
      if (y >= b[k + 3]) b[k + 3] = y + 1;
    }
  boxes = b;
  return b;
}
/** The rectangles of these places, one after another (see `RealmsDone.dirty`). */
function rectsOf(r: Realms, places: Iterable<number>): number[] {
  const b = boxesOf(r),
    out: number[] = [];
  for (const p of places)
    if (p >= 0 && p < r.owner.length && b[p * 4 + 2] > 0) out.push(b[p * 4], b[p * 4 + 1], b[p * 4 + 2], b[p * 4 + 3]);
  return out;
}

/** The names last found, by realm, and the realms whose names are to be found anew (null: all of them). */
const named = new Map<number, RealmName & { name: string }>();
let stale: Set<number> | null = null;
const namesCache: NamesOptions['cache'] = {};

self.onmessage = async (e: MessageEvent<RealmsJob>) => {
  const job = e.data,
    done = (d: Omit<RealmsDone, 'id'>) =>
      (self as unknown as Worker).postMessage({ id: job.id, ...d } satisfies RealmsDone, d.tile ? [d.tile.buffer] : []);
  try {
    if (job.kind === 'realms') {
      const was = await realmsOf(job.region, job.base, job.year),
        { ids, w, h, round, rest, chosen } = was;
      const now: Realms & { names: string[] } = {
        ids,
        w,
        h,
        round,
        rest,
        chosen,
        owner: job.owner,
        colors: Array.from(job.colors, (c) => rgb(c ?? NO_COLOUR)),
        names: Array.from(job.names, (n) => n ?? ''),
      };
      // only what changed is painted and named anew: places that went to another realm, and the places of realms
      // that took another colour; the names of the realms that gained or lost places or took another name
      const moved: number[] = [],
        realmsNamed = new Set<number>();
      const recoloured = (k: number) => {
        const a = was.colors[k],
          b = now.colors[k];
        return !a !== !b || (!!a && (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]));
      };
      const colour = new Map<number, boolean>(),
        changedColour = (k: number) => {
          let c = colour.get(k);
          if (c === undefined) {
            c = k >= 0 && recoloured(k);
            colour.set(k, c);
          }
          return c;
        };
      for (let p = 0; p < now.owner.length; p++) {
        const a = was.owner[p],
          b = now.owner[p];
        if (a !== b) {
          moved.push(p);
          if (a >= 0) realmsNamed.add(a);
          if (b >= 0) realmsNamed.add(b);
        } else if (b >= 0 && changedColour(b)) moved.push(p);
      }
      for (let k = 0; k < Math.max(was.names.length, now.names.length); k++)
        if ((was.names[k] ?? '') !== (now.names[k] ?? '')) realmsNamed.add(k);
      if (stale) for (const k of realmsNamed) stale.add(k);
      realms = Promise.resolve(now);
      return done({ dirty: rectsOf(now, moved), renamed: realmsNamed.size > 0 });
    }
    const r = await realmsOf(job.region, job.base, job.year);
    if (job.kind === 'choose') {
      const before = r.chosen ?? -1;
      realms = Promise.resolve({ ...r, chosen: job.place });
      return done({ dirty: rectsOf(r, [before, job.place]) });
    }
    if (job.kind === 'place') {
      const place = placeAt(r, Math.floor(job.x), Math.floor(job.y));
      return done({ place: place >= 0 && place < r.owner.length ? place : -1 });
    }
    if (job.kind === 'names') {
      // only what the world shows is named: the frame (extent.ts) in map pixels; the first time every realm (some
      // seconds), then only those whose land or name changed since
      const index = await indexOf(job.region, job.base),
        frame = extentOf(projectionFrom(index, 1 / index.cells));
      const only = stale ?? undefined;
      if (!only || only.size) {
        const found = realmNames(r, 4, (k) => r.names[k] ?? '', frame, { only, cache: namesCache });
        if (only) for (const k of only) named.delete(k);
        else named.clear();
        for (const n of found) named.set(n.realm, { ...n, name: r.names[n.realm] });
      }
      stale = new Set();
      return done({ names: [...named.values()] });
    }
    const index = await indexOf(job.region, job.base),
      tile = paintRealms(r, job.level, job.tx, job.ty, index.tile, job.cells);
    done({ tile: tile.some((v) => v > 0) ? tile : undefined });
  } catch (err) {
    done({ error: String(err) });
  }
};
