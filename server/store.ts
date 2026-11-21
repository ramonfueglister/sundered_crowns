// Persistence of the world server in Supabase (service role). Everything is best effort: when Supabase is not
// configured (DEV mode) or unreachable, the world keeps running on its local files (./world-data).
// The database still has season columns from an earlier design; a persistent world is always season 1.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { WorldInfo } from '../src/net/protocol';
import type { PersonRow, ReignRow } from './rulers_copy';

const SEASON = 1;
export interface Backup {
  bin: Uint8Array;
  log: string;
  meta: string | null;
  /** borders.ndjson, gzip */
  history: Uint8Array | null;
}
interface SeatRow {
  uid: string;
  name: string;
  key: string;
  joinedAt: number;
  lastSeen: number;
}

export interface WorldStore {
  readonly enabled: boolean;
  upsertWorld(w: WorldInfo): Promise<unknown>;
  upsertSeat(world: string, seat: SeatRow): Promise<unknown>;
  removeSeat(world: string, uid: string): Promise<unknown>;
  /** The copy of the world in Storage: the latest snapshot (gzip) with the meta of the world and the history of its
   *  borders (gzip, server/history.ts); true when all of it arrived. */
  uploadSnapshot(
    world: string,
    day: number,
    bin: Uint8Array,
    meta: string,
    history: Uint8Array | null,
  ): Promise<boolean>;
  /** The log since that snapshot (replaces the one before). */
  uploadLog(world: string, log: string): Promise<boolean>;
  /** A year of the archive of the dead (gzip, src/sim/people/archive.ts), written once; true when it arrived. */
  uploadArchived(world: string, day: number, bin: Uint8Array): Promise<boolean>;
  /** That year, null when the store does not have it; throws when Storage cannot be read. */
  downloadArchived(world: string, day: number): Promise<Uint8Array | null>;
  /** The copy of the world, null when there is none; throws when Storage cannot be read. */
  downloadBackup(world: string): Promise<Backup | null>;
  /** The readable copy of the rulers (tables world_persons, world_reigns): rows that are new or changed; true when the
   *  store took all of them. */
  upsertRulers(persons: PersonRow[], reigns: ReignRow[]): Promise<boolean>;
  isAdmin(uid: string): Promise<boolean>;
  profileName(uid: string): Promise<string | null>;
}

/** DEV mode: nothing leaves the machine. */
export class NullStore implements WorldStore {
  readonly enabled = false;
  async upsertWorld() {}
  async upsertSeat() {}
  async removeSeat() {}
  async uploadSnapshot() {
    return false;
  }
  async uploadLog() {
    return false;
  }
  async uploadArchived() {
    return false;
  }
  async downloadArchived() {
    return null;
  }
  async downloadBackup() {
    return null;
  }
  async upsertRulers() {
    return false;
  }
  async isAdmin() {
    return false;
  }
  async profileName() {
    return null;
  }
}

const isUuid = (s: string | null | undefined) =>
  !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export class SupabaseStore implements WorldStore {
  readonly enabled = true;
  private db: SupabaseClient;
  private warned = new Set<string>();
  constructor(
    url: string,
    serviceKey: string,
    private serverUrl?: string,
  ) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  static fromEnv(env: Record<string, string | undefined> = process.env): SupabaseStore | null {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
    return new SupabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.PUBLIC_WORLD_URL);
  }
  private fail(what: string, failure: unknown) {
    const e = failure as { code?: unknown; message?: unknown } | null | undefined;
    const k = `${what}:${e?.code ?? e?.message ?? e}`;
    if (!this.warned.has(k)) {
      this.warned.add(k);
      console.warn(`[store] ${what} failed: ${e?.message ?? e}`);
    }
  }
  private async run(what: string, p: PromiseLike<{ error: unknown }>): Promise<boolean> {
    try {
      const { error } = await p;
      if (error) {
        this.fail(what, error);
        return false;
      }
      return true;
    } catch (e) {
      this.fail(what, e);
      return false;
    }
  }

  upsertWorld(w: WorldInfo) {
    return this.run(
      'worlds',
      this.db.from('worlds').upsert({
        id: w.id,
        name: w.name,
        season: SEASON,
        status: w.paused ? 'paused' : 'running',
        ends_at: null,
        speed_seconds_per_day: w.secondsPerDay,
        max_players: w.maxPlayers,
        start_year: w.startYear,
        game_day: w.day,
        players: w.players,
        server_url: this.serverUrl ?? null,
        updated_at: new Date().toISOString(),
      }),
    );
  }
  upsertSeat(world: string, seat: SeatRow) {
    if (!isUuid(seat.uid)) return Promise.resolve();
    return this.run(
      'world_players',
      this.db.from('world_players').upsert({
        world_id: world,
        user_id: seat.uid,
        season: SEASON,
        nation_key: seat.key,
        display_name: seat.name,
        joined_at: new Date(seat.joinedAt).toISOString(),
        last_seen: new Date(seat.lastSeen).toISOString(),
      }),
    );
  }
  removeSeat(world: string, uid: string) {
    if (!isUuid(uid)) return Promise.resolve();
    return this.run(
      'world_players.delete',
      this.db.from('world_players').delete().eq('world_id', world).eq('user_id', uid),
    );
  }
  // The copy of a world lies in `world-snapshots/<world>/persistent/`: the latest snapshot (gzip) in parts of at most
  // PART bytes, `snapshot-<day>-<i>.bin` (the Free plan takes files of 50 MB at most, and a snapshot of 1291 is about
  // 38 MB on its first day and grows), `snapshot.json` (day, parts, time), `meta.json` (seats, seed) and `log.ndjson`
  // (the log since the snapshot; its lines carry their day, so a log older than the snapshot is told apart on
  // restore). snapshot.json points at the new parts only once they are all there; the parts of the snapshot before go
  // after that. meta.json, snapshot.json and log.ndjson are overwritten in place, so the copy does not grow.
  static readonly PART = 40 * 1024 * 1024;
  private bucket() {
    return this.db.storage.from('world-snapshots');
  }
  private up(world: string, name: string, body: Uint8Array | string) {
    return this.bucket().upload(
      `${world}/persistent/${name}`,
      typeof body === 'string' ? new TextEncoder().encode(body) : body,
      { upsert: true, contentType: 'application/octet-stream' },
    );
  }
  async uploadSnapshot(world: string, day: number, bin: Uint8Array, meta: string, history: Uint8Array | null) {
    const parts = Math.max(1, Math.ceil(bin.length / SupabaseStore.PART));
    for (let i = 0; i < parts; i++) {
      if (
        !(await this.run(
          'snapshot',
          this.up(
            world,
            `snapshot-${day}-${i}.bin`,
            bin.subarray(i * SupabaseStore.PART, (i + 1) * SupabaseStore.PART),
          ),
        ))
      )
        return false;
    }
    if (!(await this.run('world meta', this.up(world, 'meta.json', meta)))) return false;
    if (history && !(await this.run('border history', this.up(world, 'borders.ndjson.gz', history)))) return false;
    if (
      !(await this.run(
        'snapshot meta',
        this.up(
          world,
          'snapshot.json',
          JSON.stringify({ day, parts, bytes: bin.length, at: new Date().toISOString() }),
        ),
      ))
    )
      return false;
    // the parts of older snapshots (and the single file of the format before) go
    try {
      const { data } = await this.bucket().list(`${world}/persistent`, { limit: 1000 });
      const old = (data ?? [])
        .map((f) => f.name)
        .filter(
          (n) =>
            n === 'snapshot.bin' ||
            (/^snapshot-\d+-\d+\.bin$/.test(n) && !n.startsWith(`snapshot-${day}-`)) ||
            /^log-\d+-\d+\.ndjson$/.test(n),
        );
      if (old.length) await this.run('old snapshots', this.bucket().remove(old.map((n) => `${world}/persistent/${n}`)));
    } catch (e) {
      this.fail('old snapshots', e);
    }
    return true;
  }
  uploadLog(world: string, log: string) {
    return this.run('log', this.up(world, 'log.ndjson', log));
  }
  // The archive of the dead lies in `world-snapshots/<world>/persistent/archive/dead-<day>.bin`, a file a year (a few
  // hundred KB), written once and never removed: the snapshot names the years it needs.
  uploadArchived(world: string, day: number, bin: Uint8Array) {
    return this.run('archive', this.up(world, `archive/dead-${day}.bin`, bin));
  }
  downloadArchived(world: string, day: number) {
    return this.get(world, `archive/dead-${day}.bin`);
  }
  /** A file of the copy of a world, null when there is none; throws when Storage cannot be read. */
  private async get(world: string, name: string): Promise<Uint8Array | null> {
    const { data, error } = await this.bucket().download(`${world}/persistent/${name}`);
    if (error) {
      const e = error as { status?: unknown; statusCode?: unknown; code?: unknown; message?: string };
      if (e.status === 404 || e.statusCode === '404' || e.code === 'NoSuchKey' || /not.?found/i.test(e.message ?? ''))
        return null;
      throw new Error(`[store] reading ${name} of ${world} failed: ${e.message ?? e}`);
    }
    return new Uint8Array(await data.arrayBuffer());
  }
  async downloadBackup(world: string): Promise<Backup | null> {
    const get = (name: string) => this.get(world, name);
    const dec = new TextDecoder();
    const head = await get('snapshot.json');
    if (!head) return null;
    const { day, parts } = JSON.parse(dec.decode(head)) as { day: number; parts?: number };
    let bin: Uint8Array;
    if (parts === undefined) {
      // the format before: one file
      const one = await get('snapshot.bin');
      if (!one) return null;
      bin = one;
    } else {
      const chunks: Uint8Array[] = [];
      for (let i = 0; i < parts; i++) {
        const c = await get(`snapshot-${day}-${i}.bin`);
        if (!c) throw new Error(`[store] part ${i} of the snapshot of day ${day} of ${world} is missing`);
        chunks.push(c);
      }
      bin = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let o = 0;
      for (const c of chunks) {
        bin.set(c, o);
        o += c.length;
      }
    }
    const log = await get('log.ndjson'),
      meta = await get('meta.json'),
      history = await get('borders.ndjson.gz');
    return { bin, log: log ? dec.decode(log) : '', meta: meta ? dec.decode(meta) : null, history };
  }
  async upsertRulers(persons: PersonRow[], reigns: ReignRow[]) {
    const at = new Date().toISOString(),
      N = 500;
    for (let i = 0; i < persons.length; i += N) {
      const rows = persons.slice(i, i + N).map((r) => ({ ...r, updated_at: at }));
      if (
        !(await this.run(
          'world_persons',
          this.db.from('world_persons').upsert(rows, { onConflict: 'world_id,person' }),
        ))
      )
        return false;
    }
    for (let i = 0; i < reigns.length; i += N) {
      const rows = reigns.slice(i, i + N).map((r) => ({ ...r, updated_at: at }));
      if (
        !(await this.run('world_reigns', this.db.from('world_reigns').upsert(rows, { onConflict: 'world_id,realm,n' })))
      )
        return false;
    }
    return true;
  }
  async isAdmin(uid: string) {
    if (!isUuid(uid)) return false;
    try {
      const { data } = await this.db.from('admin_roles').select('role').eq('user_id', uid).maybeSingle();
      return data?.role === 'admin';
    } catch {
      return false;
    }
  }
  async profileName(uid: string) {
    if (!isUuid(uid)) return null;
    try {
      const { data } = await this.db.from('profiles').select('display_name').eq('id', uid).maybeSingle();
      return (data?.display_name as string) ?? null;
    } catch {
      return null;
    }
  }
}
