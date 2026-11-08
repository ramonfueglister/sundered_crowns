// Local saves in IndexedDB (autosave + manual). Cloud saves extend this in src/online/.
import { sim, view, nations } from '../game/client';
import { settings } from './store';
import { fmtDate } from '../sim/calendar';
import { L } from './i18n';

export interface SaveMeta { id: string; label: string; nation: string; date: string; real: number; size: number; auto: boolean; day: number }
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
  const meta: SaveMeta = { id, label: name || `${n ? L(n.short) : 'Observer'} – ${fmtDate(v.day, v.startYear)}`, nation: n?.key ?? '', date: fmtDate(v.day, v.startYear), real: Date.now(), size: data.byteLength, auto, day: v.day };
  await tx(STORE, 'readwrite', (s) => s.put(data, id));
  await tx(META, 'readwrite', (s) => s.put(meta, id));
  return meta;
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
