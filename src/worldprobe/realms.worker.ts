// Paints tiles of the realms' map off the page's own thread (paint.ts), finds where the realms' names are written
// and says which place of the game map lies at a point. The pictures are handed over, not copied. The realms are
// those of 1356 as the game sets them up, until the page says who holds which place now.
import { rgb } from '../lookprobe/batch';
import { maybeGunzip } from '../render/assets';
import { type RealmName, type Realms, paintRealms, realmNames } from './paint';
import { indexOf } from './region';

/** The realms as they stand: who holds every place (-1: no realm), and every realm's colour (0xrrggbb) and name, by its number. */
export interface RealmsNow { owner: Int16Array; colors: number[]; names: string[] }
/** A tile of the realms' map, the realms' names, new realms to draw from now on, or the place at a map pixel. */
export type RealmsJob = { id: number; region: string; base: string } & ({ kind: 'tile'; level: number; tx: number; ty: number } | { kind: 'names' } | ({ kind: 'realms' } & RealmsNow) | { kind: 'place'; x: number; y: number });
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
interface Setup { states: { short: { de: string }; color: string }[]; owner: number[] }

const get = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r; };
let realms: Promise<Realms & { names: string[] }> | undefined;
/** The realms of 1356 as the game sets them up, on the map of region `name`. */
const realmsOf = (name: string, base: string) => realms ??= (async () => {
  const [index, setup, packed] = await Promise.all([indexOf(name, base), get(`${base}data/setup_1356.json`).then((r) => r.json() as Promise<Setup>), get(`${base}map/ids.bin.gz`).then((r) => r.arrayBuffer())]);
  const raw = await maybeGunzip(new Uint8Array(packed));
  if (raw.byteLength !== index.mapW * index.mapH * 2) throw new Error(`ids.bin: expected ${index.mapW * index.mapH * 2} bytes, got ${raw.byteLength}`);
  return { ids: new Uint16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)), w: index.mapW, h: index.mapH, owner: setup.owner, colors: setup.states.map((s) => rgb(Number.parseInt(s.color.slice(1), 16))), names: setup.states.map((s) => s.short.de) };
})();

self.onmessage = async (e: MessageEvent<RealmsJob>) => {
  const job = e.data, done = (d: Omit<RealmsDone, 'id'>) => (self as unknown as Worker).postMessage({ id: job.id, ...d } satisfies RealmsDone, d.tile ? [d.tile.buffer] : []);
  try {
    if (job.kind === 'realms') {
      const { ids, w, h } = await realmsOf(job.region, job.base);
      realms = Promise.resolve({ ids, w, h, owner: job.owner, colors: Array.from(job.colors, (c) => rgb(c ?? NO_COLOUR)), names: Array.from(job.names, (n) => n ?? '') });
      return done({});
    }
    const r = await realmsOf(job.region, job.base);
    if (job.kind === 'place') {
      const x = Math.floor(job.x), y = Math.floor(job.y), place = x < 0 || y < 0 || x >= r.w || y >= r.h ? -1 : r.ids[y * r.w + x] - 1;
      return done({ place: place < r.owner.length ? place : -1 });
    }
    if (job.kind === 'names') return done({ names: realmNames(r).map((n) => ({ ...n, name: r.names[n.realm] })) });
    const index = await indexOf(job.region, job.base), tile = paintRealms(r, job.level, job.tx, job.ty, index.tile, index.cells);
    done({ tile: tile.some((v) => v > 0) ? tile : undefined });
  } catch (err) {
    done({ error: String(err) });
  }
};
