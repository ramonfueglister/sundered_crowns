// Paints tiles of the realms' map off the page's own thread (paint.ts), finds where the realms' names are written
// and says which place of the game map lies at a point. The pictures are handed over, not copied. The realms are
// those of the world's start year as the game sets them up (1356 when the page does not say), until the page says
// who holds which place now.
import { rgb } from '../lookprobe/batch';
import { maybeGunzip } from '../render/assets';
import { type RealmName, type Realms, type Rest, paintRealms, placeAt, realmNames } from './paint';
import { indexOf } from './region';

/** The realms as they stand: who holds every place (-1: no realm), and every realm's colour (0xrrggbb) and name, by its number. */
export interface RealmsNow { owner: Int16Array; colors: number[]; names: string[] }
/** A tile of the realms' map, the realms' names, new realms to draw from now on, the place to pick out from now on (-1: none), or the place at a map pixel. */
export type RealmsJob = { id: number; region: string; base: string; /** the world's start year: its setup colours the map until the page sends the realms (default 1356) */ year?: number } & ({ kind: 'tile'; level: number; tx: number; ty: number; /** finest cells along a map pixel */ cells: number } | { kind: 'names' } | ({ kind: 'realms' } & RealmsNow) | { kind: 'choose'; place: number } | { kind: 'place'; x: number; y: number });
export interface RealmsDone {
  id: number;
  /** the tile, RGBA row by row from the north; none where the tile holds no realm */
  tile?: Uint8ClampedArray;
  /** where the realms' names are written, with the names */
  names?: (RealmName & { name: string })[];
  /** the place at the map pixel asked for, counted from 0 (-1: none, sea) */
  place?: number;
  error?: string;
}
/** a realm the page gave no colour for */
const NO_COLOUR = 0x808080;
interface Setup { states: { short: { de: string }; color: string }[]; owner: (number | null)[] }

const get = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r; };
const u16 = (raw: Uint8Array) => new Uint16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
/** cells of the rest of the world to a map pixel (half as fine as the game map) */
const REST_CELLS = 0.5;
/** The places of the rest of the world, beyond the game map, over the whole world frame (0 on the game map). */
async function restOf(base: string, worldW: number): Promise<Rest> {
  const raw = await maybeGunzip(new Uint8Array(await (await get(`${base}map/beyond.bin.gz`)).arrayBuffer())), w = Math.round(worldW * REST_CELLS);
  if (raw.byteLength % (w * 2)) throw new Error(`beyond.bin: ${raw.byteLength} bytes are no rows of ${w}`);
  return { ids: u16(raw), w, h: raw.byteLength / (w * 2), cells: REST_CELLS };
}
let realms: Promise<Realms & { names: string[] }> | undefined;
/** The realms of the start year `year` as the game sets them up, on the map of region `name`. */
const realmsOf = (name: string, base: string, year = 1356) => realms ??= (async (): Promise<Realms & { names: string[] }> => {
  const [index, setup, packed] = await Promise.all([indexOf(name, base), get(`${base}data/setup_${year}.json`).then((r) => r.json() as Promise<Setup>), get(`${base}map/ids.bin.gz`).then((r) => r.arrayBuffer())]);
  const raw = await maybeGunzip(new Uint8Array(packed));
  if (raw.byteLength !== index.mapW * index.mapH * 2) throw new Error(`ids.bin: expected ${index.mapW * index.mapH * 2} bytes, got ${raw.byteLength}`);
  return { ids: u16(raw), w: index.mapW, h: index.mapH, round: index.worldW, rest: index.worldW ? await restOf(base, index.worldW) : undefined, owner: Int16Array.from(setup.owner, (o) => (typeof o === 'number' && o >= 0 ? o : -1)), colors: setup.states.map((s) => rgb(Number.parseInt(s.color.slice(1), 16))), names: setup.states.map((s) => s.short.de) };
})();

self.onmessage = async (e: MessageEvent<RealmsJob>) => {
  const job = e.data, done = (d: Omit<RealmsDone, 'id'>) => (self as unknown as Worker).postMessage({ id: job.id, ...d } satisfies RealmsDone, d.tile ? [d.tile.buffer] : []);
  try {
    if (job.kind === 'realms') {
      const { ids, w, h, round, rest, chosen } = await realmsOf(job.region, job.base, job.year);
      realms = Promise.resolve({ ids, w, h, round, rest, chosen, owner: job.owner, colors: Array.from(job.colors, (c) => rgb(c ?? NO_COLOUR)), names: Array.from(job.names, (n) => n ?? '') });
      return done({});
    }
    const r = await realmsOf(job.region, job.base, job.year);
    if (job.kind === 'choose') { realms = Promise.resolve({ ...r, chosen: job.place }); return done({}); }
    if (job.kind === 'place') {
      const place = placeAt(r, Math.floor(job.x), Math.floor(job.y));
      return done({ place: place >= 0 && place < r.owner.length ? place : -1 });
    }
    if (job.kind === 'names') return done({ names: realmNames(r, 4, (k) => [...(r.names[k] ?? "")].length).map((n) => ({ ...n, name: r.names[n.realm] })) });
    const index = await indexOf(job.region, job.base), tile = paintRealms(r, job.level, job.tx, job.ty, index.tile, job.cells);
    done({ tile: tile.some((v) => v > 0) ? tile : undefined });
  } catch (err) {
    done({ error: String(err) });
  }
};
