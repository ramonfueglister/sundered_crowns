// Local saves in IndexedDB (autosave + manual). Cloud saves extend this in src/online/.
import { sim, view, nations } from '../game/client';
import { settings } from './store';
import { fmtDate } from '../sim/calendar';
import { L, lang } from './i18n';
import type { I18n } from '../sim/types';

/** `start` and `short` (newer saves) let the list write the date and the realm in the language the player reads now;
 *  `named`: the player gave the label. */
export interface SaveMeta { id: string; label: string; nation: string; date: string; real: number; size: number; auto: boolean; day: number; start?: number; short?: I18n | null; named?: boolean }
const DB = 'sundered-crowns', STORE = 'saves', META = 'meta';
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE); if (!d.objectStoreNames.contains(META)) d.createObjectStore(META); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function tx<T>(store: string, mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((res, rej) => { const t = d.transaction(store, mode); const q = f(t.objectStore(store)); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }));
}
export async function listSaves(): Promise<SaveMeta[]> {
  const all = await tx<any[]>(META, 'readonly', (s) => s.getAll());
  return (all as SaveMeta[]).sort((a, b) => b.real - a.real);
}
export async function writeSave(data: Uint8Array, auto: boolean, name?: string): Promise<SaveMeta> {
  const v = view.value!; const p = v.player; const n = p ? nations.value[p.id] : null;
  const id = auto ? 'autosave' : `save_${Date.now()}`;
  const meta: SaveMeta = { id, label: '', nation: n?.key ?? '', date: '', real: Date.now(), size: data.byteLength, auto, day: v.day, start: v.startYear, short: n ? n.short : null, named: !!name };
  meta.label = name || saveLabel(meta); meta.date = saveDate(meta);
  await tx(STORE, 'readwrite', (s) => s.put(data, id));
  await tx(META, 'readwrite', (s) => s.put(meta, id));
  return meta;
}
/** The date of a save in the UI language (older saves keep the text they were written with). */
export function saveDate(m: SaveMeta): string { return m.start !== undefined && m.day >= 0 ? fmtDate(m.day, m.start, lang.value) : m.date; }
/** The label of a save: the player's name for it, or realm and date in the UI language. */
export function saveLabel(m: SaveMeta): string {
  if (m.named || m.start === undefined) return m.label;
  return `${m.short ? L(m.short) : lang.value === 'de' ? 'Beobachter' : 'Observer'} – ${saveDate(m)}`;
}
export async function loadSave(id: string): Promise<Uint8Array | null> { return (await tx<any>(STORE, 'readonly', (s) => s.get(id))) ?? null; }
export async function deleteSave(id: string) { await tx(STORE, 'readwrite', (s) => s.delete(id)); await tx(META, 'readwrite', (s) => s.delete(id)); }
export async function saveNow(name?: string, auto = false) { const data = await sim().save(); return writeSave(data, auto, name); }

let lastAutoDay = -1;
export function autosaveTick() {
  const v = view.value; if (!v || v.speed === 0 || (sim() as any).online) return; // the world server keeps online saves
  const every = Math.max(1, settings.value.autosaveMonths) * 30;
  if (lastAutoDay < 0) { lastAutoDay = v.day; return; }
  if (v.day - lastAutoDay >= every) { lastAutoDay = v.day; saveNow(undefined, true).catch((e) => console.warn('autosave failed', e)); }
}

/** Store a save file imported from disk (works from the main menu, without a running game). */
export async function importSave(data: Uint8Array, name: string): Promise<SaveMeta> {
  const id = `import_${Date.now()}`;
  const meta: SaveMeta = { id, label: name.replace(/\.[a-z0-9]+$/i, ''), nation: '', date: '', real: Date.now(), size: data.byteLength, auto: false, day: 0 };
  await tx(STORE, 'readwrite', (s) => s.put(data, id));
  await tx(META, 'readwrite', (s) => s.put(meta, id));
  return meta;
}
