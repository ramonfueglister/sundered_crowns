// Paints tiles of the painted map off the page's own thread (paint.ts): the land of a tile, the realms on it, and
// where the realms' names are written. The pictures are handed over, not copied.
import gazetteer from '../../data/content/gazetteer.json';
import { rgb } from '../lookprobe/batch';
import { maybeGunzip } from '../render/assets';
import { loadClimate } from './climate';
import { type RealmName, type Realms, paintLand, paintRealms, realmNames } from './paint';
import { Water, indexOf, loadWindow } from './region';

/** A tile's land (with its realms, if `realms` says so), a tile's realms alone, or the realms' names. */
export type PaperJob = { id: number; region: string; base: string } & ({ kind: 'land'; level: number; tx: number; ty: number; realms: boolean } | { kind: 'realms'; level: number; tx: number; ty: number } | { kind: 'names' });
export interface PaperDone {
  id: number;
  /** the tile's land, RGBA row by row from the north; none where the tile is open sea */
  land?: Uint8ClampedArray;
  /** the tile's realms, as the land; none where the tile holds no realm */
  realms?: Uint8ClampedArray;
  /** where the realms' names are written, with the names */
  names?: (RealmName & { name: string })[];
  error?: string;
}
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

self.onmessage = async (e: MessageEvent<PaperJob>) => {
  const job = e.data, done = (d: Omit<PaperDone, 'id'>) => (self as unknown as Worker).postMessage({ id: job.id, ...d } satisfies PaperDone, [d.land, d.realms].flatMap((p) => (p ? [p.buffer] : [])));
  try {
    if (job.kind === 'names') { const r = await realmsOf(job.region, job.base); return done({ names: realmNames(r).map((n) => ({ ...n, name: r.names[n.realm] })) }); }
    const index = await indexOf(job.region, job.base), T = index.tile;
    const realms = async () => { const p = paintRealms(await realmsOf(job.region, job.base), job.level, job.tx, job.ty, T, index.cells); return p.some((v) => v > 0) ? p : undefined; };
    if (job.kind === 'realms') return done({ realms: await realms() });
    const region = await loadWindow(job.level ? `${job.region}/z${job.level}` : job.region, job.tx * T, job.ty * T, T, T, job.base);
    if (region.water.every((k) => k === Water.Sea)) return done({});
    done({ land: paintLand(region, await loadClimate(job.base, region.mapW, region.mapH), job.level, gazetteer.places), realms: job.realms ? await realms() : undefined });
  } catch (err) {
    done({ error: String(err) });
  }
};
