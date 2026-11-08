// Cloud saves for single player, on top of the local IndexedDB saves in src/ui/saves.ts.
// Metadata: public.saves (RLS: own rows only). File: Storage bucket 'saves' at `${uid}/${saveId}.bin` (own folder only).
// A cloud save remembers the id of the local save it came from (local_id), which is how conflicts are detected.
import { supabase, session } from './supabase';
import { listSaves, loadSave, deleteSave, writeSave, type SaveMeta } from '../ui/saves';

export interface CloudSave {
  id: string; local_id: string | null; label: string; nation_key: string | null; game_day: number; game_date: string | null;
  start_year: number; size_bytes: number; client_saved_at: string; updated_at: string;
}
export type SyncStatus = 'in_sync' | 'local_only' | 'cloud_only' | 'local_newer' | 'cloud_newer' | 'conflict';
export interface SyncRow { key: string; local: SaveMeta | null; cloud: CloudSave | null; status: SyncStatus; recommend: 'local' | 'cloud' | null }

const MAX_BYTES = 50 * 1024 * 1024;
function need() { if (!supabase || !session.value) throw new Error('Sign in to use cloud saves.'); return { db: supabase, uid: session.value.user.id }; }
const path = (uid: string, id: string) => `${uid}/${id}.bin`;

export async function listCloudSaves(): Promise<CloudSave[]> {
  const { db } = need();
  const { data, error } = await db.from('saves').select('id, local_id, label, nation_key, game_day, game_date, start_year, size_bytes, client_saved_at, updated_at').order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as CloudSave[]) ?? [];
}

/** Uploads a local save (creating or replacing its cloud copy). */
export async function uploadSave(meta: SaveMeta, data?: Uint8Array): Promise<CloudSave> {
  const { db, uid } = need();
  const bin = data ?? (await loadSave(meta.id));
  if (!bin) throw new Error('The local save could not be read.');
  if (bin.byteLength > MAX_BYTES) throw new Error('This save is too large for the cloud (50 MB).');
  const row = { user_id: uid, local_id: meta.id, label: meta.label.slice(0, 120), nation_key: meta.nation || null, game_day: meta.day, game_date: meta.date, size_bytes: bin.byteLength, client_saved_at: new Date(meta.real).toISOString() };
  const { data: saved, error } = await db.from('saves').upsert(row, { onConflict: 'user_id,local_id' }).select().single();
  if (error) throw new Error(error.message);
  const up = await db.storage.from('saves').upload(path(uid, saved.id), bin, { upsert: true, contentType: 'application/octet-stream' });
  if (up.error) throw new Error(up.error.message);
  return saved as CloudSave;
}

export async function downloadSave(c: CloudSave): Promise<Uint8Array> {
  const { db, uid } = need();
  const { data, error } = await db.storage.from('saves').download(path(uid, c.id));
  if (error || !data) throw new Error(error?.message ?? 'download failed');
  return new Uint8Array(await data.arrayBuffer());
}

export async function deleteCloudSave(c: CloudSave): Promise<void> {
  const { db, uid } = need();
  await db.storage.from('saves').remove([path(uid, c.id)]);
  const { error } = await db.from('saves').delete().eq('id', c.id);
  if (error) throw new Error(error.message);
}

/** Compares one local save with its cloud copy: timestamps first, the in-game day as a cross-check. */
export function compareSaves(local: SaveMeta, cloud: CloudSave): { status: SyncStatus; recommend: 'local' | 'cloud' | null } {
  const lt = local.real, ct = Date.parse(cloud.client_saved_at);
  if (Math.abs(lt - ct) < 2000 && local.day === cloud.game_day) return { status: 'in_sync', recommend: null };
  const timeSaysLocal = lt > ct, daySaysLocal = local.day > cloud.game_day, sameDay = local.day === cloud.game_day;
  if (timeSaysLocal && (daySaysLocal || sameDay)) return { status: 'local_newer', recommend: 'local' };
  if (!timeSaysLocal && (!daySaysLocal || sameDay)) return { status: 'cloud_newer', recommend: 'cloud' };
  // the newer file is from an earlier in-game date (e.g. an older game continued on another device): ask
  return { status: 'conflict', recommend: timeSaysLocal ? 'local' : 'cloud' };
}

/** Pairs local and cloud saves and classifies every pair. */
export async function syncPlan(): Promise<SyncRow[]> {
  const [locals, clouds] = await Promise.all([listSaves(), listCloudSaves()]);
  const byLocal = new Map(clouds.filter((c) => c.local_id).map((c) => [c.local_id!, c]));
  const rows: SyncRow[] = [];
  for (const l of locals) {
    const c = byLocal.get(l.id) ?? null; if (c) byLocal.delete(l.id);
    rows.push(c ? { key: l.id, local: l, cloud: c, ...compareSaves(l, c) } : { key: l.id, local: l, cloud: null, status: 'local_only', recommend: 'local' });
  }
  for (const c of clouds) if (!c.local_id || byLocal.has(c.local_id)) rows.push({ key: 'cloud:' + c.id, local: null, cloud: c, status: 'cloud_only', recommend: 'cloud' });
  return rows;
}

/** "Keep local": the local file replaces the cloud copy. */
export async function keepLocal(row: SyncRow) { if (!row.local) throw new Error('no local save'); return uploadSave(row.local); }

/**
 * "Keep cloud": the caller loads the downloaded save into the game (sim().init({ save })) and then calls
 * `adoptCloudSave`, which stores it locally (via writeSave, so it gets fresh metadata from the running game),
 * removes the outdated local copy and points the cloud row at the new local id.
 */
export async function adoptCloudSave(row: SyncRow, data: Uint8Array): Promise<SaveMeta> {
  const { db } = need();
  const meta = await writeSave(data, false, row.cloud?.label);
  if (row.local && row.local.id !== meta.id) await deleteSave(row.local.id);
  if (row.cloud) await db.from('saves').update({ local_id: meta.id, client_saved_at: new Date(meta.real).toISOString() }).eq('id', row.cloud.id);
  return meta;
}
