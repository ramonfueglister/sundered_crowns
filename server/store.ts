// Persistence of the world server in Supabase (service role). Everything is best effort: when Supabase is not
// configured (DEV mode) or unreachable, the world keeps running on its local files (./world-data).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { WorldInfo, LeaderRow } from '../src/online/protocol';
import type { StandingOrders } from '../src/sim/types';

export interface SeatRow { uid: string; name: string; key: string; joinedAt: number; lastSeen: number }
export interface MessageRow {
  world_id: string; season: number; kind: 'chat' | 'offer' | 'reply' | 'system'; from_user: string | null; to_user: string | null;
  from_nation: string | null; to_nation: string | null; body: string; payload: any; status: 'sent' | 'open' | 'accepted' | 'declined' | 'expired';
  game_day: number; expires_at: string | null;
}

export interface WorldStore {
  readonly enabled: boolean;
  upsertWorld(w: WorldInfo): Promise<void>;
  upsertSeat(world: string, season: number, seat: SeatRow, orders: StandingOrders, protectedUntil: number): Promise<void>;
  removeSeat(world: string, uid: string): Promise<void>;
  event(world: string, season: number, kind: 'season_start' | 'season_end' | 'broadcast' | 'join' | 'release' | 'admin', day: number, payload: any): Promise<void>;
  message(row: MessageRow): Promise<void>;
  achievements(uid: string, keys: string[], world: string, season: number, nationKey: string): Promise<void>;
  leaderboard(world: string, season: number, rows: (LeaderRow & { uid: string | null })[]): Promise<void>;
  uploadSnapshot(world: string, season: number, day: number, bin: Uint8Array, logFrom: number, log: string): Promise<void>;
  isAdmin(uid: string): Promise<boolean>;
  profileName(uid: string): Promise<string | null>;
}

/** DEV mode: nothing leaves the machine. */
export class NullStore implements WorldStore {
  readonly enabled = false;
  async upsertWorld() {} async upsertSeat() {} async removeSeat() {} async event() {} async message() {}
  async achievements() {} async leaderboard() {} async uploadSnapshot() {}
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
      id: w.id, name: w.name, season: w.season, status: w.paused ? 'paused' : 'running', started_at: new Date(w.startedAt).toISOString(),
      ends_at: new Date(w.projectedEnd).toISOString(), speed_seconds_per_day: w.secondsPerDay, max_players: w.maxPlayers, start_year: w.startYear,
      game_day: w.day, players: w.players, server_url: this.serverUrl ?? null, updated_at: new Date().toISOString(),
    }));
  }
  upsertSeat(world: string, season: number, seat: SeatRow, orders: StandingOrders, protectedUntil: number) {
    if (!isUuid(seat.uid)) return Promise.resolve();
    return this.run('world_players', this.db.from('world_players').upsert({
      world_id: world, user_id: seat.uid, season, nation_key: seat.key, display_name: seat.name, joined_at: new Date(seat.joinedAt).toISOString(),
      last_seen: new Date(seat.lastSeen).toISOString(), protected_until: protectedUntil, standing_orders: orders,
    }));
  }
  removeSeat(world: string, uid: string) {
    if (!isUuid(uid)) return Promise.resolve();
    return this.run('world_players.delete', this.db.from('world_players').delete().eq('world_id', world).eq('user_id', uid));
  }
  event(world: string, season: number, kind: Parameters<WorldStore['event']>[2], day: number, payload: any) {
    return this.run('world_events', this.db.from('world_events').insert({ world_id: world, season, kind, game_day: day, payload }));
  }
  message(row: MessageRow) {
    if (row.from_user && !isUuid(row.from_user)) return Promise.resolve();
    return this.run('player_messages', this.db.from('player_messages').insert({ ...row, to_user: isUuid(row.to_user) ? row.to_user : null }));
  }
  achievements(uid: string, keys: string[], world: string, season: number, nationKey: string) {
    if (!isUuid(uid) || !keys.length) return Promise.resolve();
    return this.run('achievements', this.db.from('achievements').upsert(keys.map((key) => ({ user_id: uid, key, world_id: world, season, nation_key: nationKey })), { onConflict: 'user_id,key', ignoreDuplicates: true }));
  }
  leaderboard(world: string, season: number, rows: (LeaderRow & { uid: string | null })[]) {
    return this.run('leaderboards', this.db.from('leaderboards').upsert(rows.map((r) => ({
      world_id: world, season, user_id: isUuid(r.uid) ? r.uid : null, display_name: r.player, nation_key: r.key, score: r.score, rank: r.rank,
    })), { onConflict: 'world_id,season,nation_key' }));
  }
  async uploadSnapshot(world: string, season: number, day: number, bin: Uint8Array, logFrom: number, log: string) {
    const base = `${world}/season-${season}`;
    await this.run('snapshot', this.db.storage.from('world-snapshots').upload(`${base}/snapshot.bin`, bin, { upsert: true, contentType: 'application/octet-stream' }));
    await this.run('snapshot meta', this.db.storage.from('world-snapshots').upload(`${base}/snapshot.json`, new TextEncoder().encode(JSON.stringify({ day, logFrom, at: new Date().toISOString() })), { upsert: true, contentType: 'application/octet-stream' }));
    // command log from the previous upload up to this snapshot (audit / replay of the cloud copy)
    if (log) await this.run('log', this.db.storage.from('world-snapshots').upload(`${base}/log-${logFrom}-${day}.ndjson`, new TextEncoder().encode(log), { upsert: true, contentType: 'application/octet-stream' }));
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
