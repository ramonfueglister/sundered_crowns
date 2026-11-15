// Persistence of the world server in Supabase (service role). Everything is best effort: when Supabase is not
// configured (DEV mode) or unreachable, the world keeps running on its local files (./world-data).
// The database still has season columns from an earlier design; a persistent world is always season 1.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { WorldInfo } from '../src/net/protocol';

const SEASON = 1;
export interface SeatRow { uid: string; name: string; key: string; joinedAt: number; lastSeen: number }

export interface WorldStore {
  readonly enabled: boolean;
  upsertWorld(w: WorldInfo): Promise<void>;
  upsertSeat(world: string, seat: SeatRow): Promise<void>;
  removeSeat(world: string, uid: string): Promise<void>;
  uploadSnapshot(world: string, day: number, bin: Uint8Array, logFrom: number, log: string): Promise<void>;
  isAdmin(uid: string): Promise<boolean>;
  profileName(uid: string): Promise<string | null>;
}

/** DEV mode: nothing leaves the machine. */
export class NullStore implements WorldStore {
  readonly enabled = false;
  async upsertWorld() {} async upsertSeat() {} async removeSeat() {} async uploadSnapshot() {}
  async isAdmin() { return false; } async profileName() { return null; }
}

const isUuid = (s: string | null | undefined) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export class SupabaseStore implements WorldStore {
  readonly enabled = true;
  private db: SupabaseClient;
  private warned = new Set<string>();
  constructor(url: string, serviceKey: string, private serverUrl?: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  static fromEnv(env: Record<string, string | undefined> = process.env): SupabaseStore | null {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
    return new SupabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.PUBLIC_WORLD_URL);
  }
  private fail(what: string, e: any) {
    const k = `${what}:${e?.code ?? e?.message ?? e}`;
    if (!this.warned.has(k)) { this.warned.add(k); console.warn(`[store] ${what} failed: ${e?.message ?? e}`); }
  }
  private async run(what: string, p: PromiseLike<{ error: any }>) { try { const { error } = await p; if (error) this.fail(what, error); } catch (e) { this.fail(what, e); } }

  upsertWorld(w: WorldInfo) {
    return this.run('worlds', this.db.from('worlds').upsert({
      id: w.id, name: w.name, season: SEASON, status: w.paused ? 'paused' : 'running', ends_at: null,
      speed_seconds_per_day: w.secondsPerDay, max_players: w.maxPlayers, start_year: w.startYear,
      game_day: w.day, players: w.players, server_url: this.serverUrl ?? null, updated_at: new Date().toISOString(),
    }));
  }
  upsertSeat(world: string, seat: SeatRow) {
    if (!isUuid(seat.uid)) return Promise.resolve();
    return this.run('world_players', this.db.from('world_players').upsert({
      world_id: world, user_id: seat.uid, season: SEASON, nation_key: seat.key, display_name: seat.name,
      joined_at: new Date(seat.joinedAt).toISOString(), last_seen: new Date(seat.lastSeen).toISOString(),
    }));
  }
  removeSeat(world: string, uid: string) {
    if (!isUuid(uid)) return Promise.resolve();
    return this.run('world_players.delete', this.db.from('world_players').delete().eq('world_id', world).eq('user_id', uid));
  }
  async uploadSnapshot(world: string, day: number, bin: Uint8Array, logFrom: number, log: string) {
    const base = `${world}/persistent`;
    const up = (name: string, body: Uint8Array) => this.db.storage.from('world-snapshots').upload(`${base}/${name}`, body, { upsert: true, contentType: 'application/octet-stream' });
    await this.run('snapshot', up('snapshot.bin', bin));
    await this.run('snapshot meta', up('snapshot.json', new TextEncoder().encode(JSON.stringify({ day, logFrom, at: new Date().toISOString() }))));
    if (log) await this.run('log', up(`log-${logFrom}-${day}.ndjson`, new TextEncoder().encode(log)));
  }
  async isAdmin(uid: string) {
    if (!isUuid(uid)) return false;
    try { const { data } = await this.db.from('admin_roles').select('role').eq('user_id', uid).maybeSingle(); return data?.role === 'admin'; } catch { return false; }
  }
  async profileName(uid: string) {
    if (!isUuid(uid)) return null;
    try { const { data } = await this.db.from('profiles').select('display_name').eq('id', uid).maybeSingle(); return (data?.display_name as string) ?? null; } catch { return null; }
  }
}
