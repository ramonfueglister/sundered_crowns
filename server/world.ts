// World server core: one authoritative, persistent world that runs without end. No sockets here (server/main.ts is
// the transport), so tests can drive it in-process.
//
// Determinism: every change to the state goes through a log entry, appended to the command log in the order it was
// applied and interleaved with day markers. A snapshot plus the log after it reproduces the state exactly
// (verifyReplay). Real-time facts (a player left long ago) become log entries before they touch the state.
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, readdirSync, openSync, writeSync, closeSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import type { WorldState } from '../src/sim/state';
import type { World } from '../src/sim/world';
import { applyCommand, type Command, type CmdResult } from '../src/sim/commands';
import { advanceDay } from '../src/sim/engine';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { createWorldState } from '../src/sim/setup';
import { loadWorld, loadSetup } from '../tools/sim/load';
import { realmInfos, placeDetail } from '../src/net/views';
import { encodeOwners, type ClientMsg, type ServerMsg, type WorldInfo, type Me } from '../src/net/protocol';
import { NullStore, type WorldStore } from './store';

// ======================================================================= deterministic layer
export type LogEntry =
  | { k: 'cmd'; uid: string; cmd: Command }
  | { k: 'claim'; uid: string; realm: number }
  | { k: 'release'; realm: number };
export type LogLine = { d: number; e: LogEntry } | { d: number; adv: 1 };

const OK: CmdResult = { ok: true };
const err = (e: string): CmdResult => ({ ok: false, err: e });

/** Applies one log entry. A pure function of (state, entry): used live and in replay. */
export function applyEntry(s: WorldState, w: World, e: LogEntry): CmdResult {
  switch (e.k) {
    case 'cmd': {
      const r = e.cmd?.realm;
      if (!Number.isInteger(r) || r < 0 || r >= s.realm.size || !s.realm.alive[r]) return err('no such realm');
      if (s.ruler[r] !== e.uid) return err('not your realm');
      return applyCommand(s, w, e.cmd);
    }
    case 'claim': {
      const r = e.realm;
      if (!Number.isInteger(r) || r < 0 || r >= s.realm.size || !s.realm.alive[r]) return err('no such realm');
      if (s.ruler[r]) return err('this realm already has a ruler');
      if (s.ruler.includes(e.uid)) return err('you already rule a realm');
      s.ruler[r] = e.uid;
      return OK;
    }
    case 'release': {
      if (!s.ruler[e.realm]) return err('no ruler');
      s.ruler[e.realm] = '';
      return OK;
    }
  }
  return err('unknown entry');
}

export function replayLines(s: WorldState, w: World, lines: Iterable<LogLine>): WorldState {
  for (const l of lines) {
    if ('adv' in l) { if (l.d !== s.day) throw new Error(`replay out of step: log day ${l.d}, state day ${s.day}`); advanceDay(s, w); }
    else applyEntry(s, w, l.e);
  }
  return s;
}
export function parseLog(text: string): LogLine[] {
  const out: LogLine[] = [];
  for (const line of text.split('\n')) { if (!line.trim()) continue; try { out.push(JSON.parse(line)); } catch { break; /* torn last line after a crash */ } }
  return out;
}

// ======================================================================= files on disk
/** Snapshots (gzip) and log segments: log-<day>.ndjson holds everything after the snapshot of that day. */
export class WorldFiles {
  private fd = -1;
  constructor(readonly dir: string) { mkdirSync(dir, { recursive: true }); }
  latest(): { day: number; hash: string } | null { try { return JSON.parse(readFileSync(join(this.dir, 'snapshot.json'), 'utf8')); } catch { return null; } }
  snapshots(): number[] { return readdirSync(this.dir).map((f) => /^snap-(\d+)\.bin$/.exec(f)).filter(Boolean).map((m) => Number(m![1])).sort((a, b) => a - b); }
  segments(): number[] { return readdirSync(this.dir).map((f) => /^log-(\d+)\.ndjson$/.exec(f)).filter(Boolean).map((m) => Number(m![1])).sort((a, b) => a - b); }
  writeSnapshot(s: WorldState): { day: number; hash: string; bin: Uint8Array } {
    const bin = gzipSync(encodeState(s)), day = s.day, hash = hashState(s);
    const file = join(this.dir, `snap-${day}.bin`);
    writeFileSync(file + '.tmp', bin); renameSync(file + '.tmp', file);
    writeFileSync(join(this.dir, 'snapshot.json.tmp'), JSON.stringify({ day, hash })); renameSync(join(this.dir, 'snapshot.json.tmp'), join(this.dir, 'snapshot.json'));
    // keep the genesis snapshot and the three most recent ones; log segments older than the oldest kept go too
    const snaps = this.snapshots().filter((d) => d !== 0);
    for (const d of snaps.slice(0, Math.max(0, snaps.length - 3))) { try { unlinkSync(join(this.dir, `snap-${d}.bin`)); } catch { /* gone */ } }
    this.openSegment(day);
    return { day, hash, bin };
  }
  readSnapshot(day: number): WorldState { return decodeState(gunzipSync(readFileSync(join(this.dir, `snap-${day}.bin`)))); }
  readLines(fromDay: number): LogLine[] {
    const out: LogLine[] = [];
    for (const seg of this.segments()) if (seg >= fromDay) out.push(...parseLog(readFileSync(join(this.dir, `log-${seg}.ndjson`), 'utf8')));
    return out;
  }
  segmentText(day: number): string { try { return readFileSync(join(this.dir, `log-${day}.ndjson`), 'utf8'); } catch { return ''; } }
  openSegment(day: number) { if (this.fd >= 0) closeSync(this.fd); this.fd = openSync(join(this.dir, `log-${day}.ndjson`), 'a'); }
  append(line: LogLine) { if (this.fd < 0) throw new Error('log not open'); writeSync(this.fd, JSON.stringify(line) + '\n'); }
  close() { if (this.fd >= 0) closeSync(this.fd); this.fd = -1; }
}

// ======================================================================= world core
export interface WorldConfig {
  id: string; name: string; dataDir: string;
  /** real seconds per in-game day */
  secondsPerDay: number;
  snapshotEveryDays: number;
  /** in-game days between snapshot uploads to Supabase Storage */
  uploadEveryDays: number;
  seed: number; startYear: number; maxPlayers: number;
  /** real time without a login after which a player's realm is free again */
  inactiveReleaseMs: number;
  /** commands a player may give per in-game day */
  cmdsPerDay: number;
  /** account ids or display names with admin rights (besides the store's admin table) */
  admins: string[];
  devAuth: boolean;
  log?: (msg: string) => void;
}
export function configFromEnv(env: Record<string, string | undefined> = process.env): WorldConfig {
  const num = (k: string, d: number) => { const v = Number(env[k]); return env[k] !== undefined && env[k] !== '' && Number.isFinite(v) ? v : d; };
  return {
    id: (env.WORLD_ID || 'europa-1').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 32), name: env.WORLD_NAME || 'Europa I', dataDir: env.WORLD_DATA_DIR || './world-data',
    secondsPerDay: num('SECONDS_PER_DAY', 36), snapshotEveryDays: Math.max(1, num('SNAPSHOT_EVERY_DAYS', 30)), uploadEveryDays: Math.max(1, num('SNAPSHOT_UPLOAD_EVERY_DAYS', 300)),
    seed: num('WORLD_SEED', 1356), startYear: num('WORLD_START_YEAR', 1356), maxPlayers: num('MAX_PLAYERS', 100),
    inactiveReleaseMs: num('INACTIVE_RELEASE_DAYS', 7) * 86400_000, cmdsPerDay: num('CMDS_PER_DAY', 60),
    admins: (env.ADMIN_USERS || '').split(',').map((x) => x.trim()).filter(Boolean),
    devAuth: !(env.SUPABASE_JWT_SECRET || env.SUPABASE_JWKS_URL || env.SUPABASE_URL),
  };
}

export interface UserAuth { uid: string; name: string; admin: boolean }
export interface Conn { send(m: ServerMsg): void; sendBin(b: Uint8Array): void; close(code: number, reason: string): void }

interface Seat { uid: string; name: string; realm: number; joinedAt: number; lastSeen: number }
interface Meta { id: string; name: string; seed: number; startedAt: number; paused: boolean; seats: Record<string, Seat> }
interface Queued { e: LogEntry; session: Session | null; id: number }

class Bucket {
  t: number; last = Date.now();
  constructor(private cap: number, private perSec: number) { this.t = cap; }
  take(): boolean { const now = Date.now(); this.t = Math.min(this.cap, this.t + ((now - this.last) / 1000) * this.perSec); this.last = now; if (this.t < 1) return false; this.t -= 1; return true; }
}

export class Session {
  closed = false;
  constructor(readonly core: WorldCore, readonly conn: Conn, readonly user: UserAuth) {}
  send(m: ServerMsg) { if (!this.closed) try { this.conn.send(m); } catch { /* socket gone */ } }
  sendBin(b: Uint8Array) { if (!this.closed) try { this.conn.sendBin(b); } catch { /* socket gone */ } }
  handle(m: ClientMsg) { if (!this.closed) this.core.handle(this, m); }
  disconnect() { if (this.closed) return; this.closed = true; this.core.detach(this); }
}

export class WorldCore {
  readonly cfg: WorldConfig;
  readonly store: WorldStore;
  w!: World;
  s!: WorldState;
  meta!: Meta;
  private files!: WorldFiles;
  private queue: Queued[] = [];
  private sessions = new Set<Session>();
  private buckets = new Map<string, Bucket>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private prevOwner!: Int16Array;
  private lastUpload = 0;
  private log: (m: string) => void;
  /** smoothed real time of each part of a day (ms), for /health */
  stepMs = { cmds: 0, day: 0, persist: 0, broadcast: 0 };

  constructor(cfg: WorldConfig, store: WorldStore = new NullStore()) {
    this.cfg = cfg; this.store = store; this.log = cfg.log ?? ((m) => console.log(`[world ${cfg.id}] ${m}`));
  }
  get root() { return join(this.cfg.dataDir, this.cfg.id); }

  /** Creates the world, or resumes it from its latest snapshot and the log after it. */
  init(): this {
    this.w = loadWorld();
    mkdirSync(this.root, { recursive: true });
    const metaPath = join(this.root, 'meta.json');
    this.meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8'))
      : { id: this.cfg.id, name: this.cfg.name, seed: this.cfg.seed, startedAt: Date.now(), paused: false, seats: {} };
    this.files = new WorldFiles(join(this.root, 'world'));
    const latest = this.files.latest();
    if (!latest) {
      this.s = createWorldState(this.w, loadSetup(this.cfg.startYear), this.meta.seed);
      this.files.writeSnapshot(this.s);
      this.log(`created at day 0, hash ${hashState(this.s)}`);
    } else {
      this.s = this.files.readSnapshot(latest.day);
      const lines = this.files.readLines(latest.day);
      replayLines(this.s, this.w, lines);
      this.files.openSegment(latest.day);
      this.log(`resumed at day ${this.s.day} (snapshot ${latest.day} + ${lines.length} log lines), hash ${hashState(this.s)}`);
    }
    // seats and state agree (a crash between the two writes)
    for (const seat of Object.values(this.meta.seats)) if (this.s.ruler[seat.realm] !== seat.uid) delete this.meta.seats[seat.uid];
    this.prevOwner = this.s.place.owner.slice();
    this.saveMeta();
    this.store.upsertWorld(this.worldInfo()).catch(() => {});
    return this;
  }
  private saveMeta() {
    const p = join(this.root, 'meta.json');
    writeFileSync(p + '.tmp', JSON.stringify(this.meta)); renameSync(p + '.tmp', p);
  }
  /** Applies an entry and logs it (only accepted entries change the state, but every one is logged in order). */
  private apply(e: LogEntry): CmdResult {
    const r = applyEntry(this.s, this.w, e);
    if (r.ok) this.files.append({ d: this.s.day, e });
    return r;
  }

  start() { this.running = true; this.schedule(); }
  stop() { this.running = false; if (this.timer) clearTimeout(this.timer); this.timer = null; }
  shutdown() { this.stop(); this.files.writeSnapshot(this.s); this.saveMeta(); this.files.close(); }
  private schedule() {
    if (!this.running) return;
    this.timer = setTimeout(() => { try { if (!this.meta.paused) this.step(); } catch (e: any) { this.log(`step failed: ${e?.stack ?? e}`); } this.schedule(); }, this.cfg.secondsPerDay * 1000);
  }

  /** One in-game day: queued entries, the day, persistence, then what changed goes out. */
  step() {
    const t0 = performance.now();
    this.releaseInactive();
    const q = this.queue; this.queue = [];
    for (const x of q) {
      const r = this.apply(x.e);
      if (x.session && x.e.k === 'cmd') x.session.send({ type: 'result', id: x.id, ok: r.ok, err: r.err });
      if (x.e.k !== 'cmd' && r.ok) this.rulersChanged();
    }
    const t1 = performance.now();
    this.files.append({ d: this.s.day, adv: 1 });
    advanceDay(this.s, this.w);
    const t2 = performance.now();
    if (this.s.day % this.cfg.snapshotEveryDays === 0) this.snapshot();
    const t3 = performance.now();
    this.broadcastDay();
    const t4 = performance.now();
    const ema = (a: number, b: number) => a * 0.9 + b * 0.1;
    this.stepMs = { cmds: ema(this.stepMs.cmds, t1 - t0), day: ema(this.stepMs.day, t2 - t1), persist: ema(this.stepMs.persist, t3 - t2), broadcast: ema(this.stepMs.broadcast, t4 - t3) };
  }

  snapshot(forceUpload = false) {
    const from = this.files.segments().filter((d) => d < this.s.day).pop() ?? 0;
    const logText = this.files.segmentText(from);
    const { day, bin } = this.files.writeSnapshot(this.s);
    this.saveMeta();
    if (forceUpload || day - this.lastUpload >= this.cfg.uploadEveryDays) {
      this.lastUpload = day;
      this.store.uploadSnapshot(this.cfg.id, day, bin, from, logText).catch(() => {});
      this.store.upsertWorld(this.worldInfo()).catch(() => {});
    }
  }

  /** Replays the log from a snapshot on disk and compares with the live state. */
  verifyReplay(fromDay?: number): { hash: string; live: string; from: number; lines: number } {
    const from = fromDay ?? this.files.snapshots()[0] ?? 0;
    const s = this.files.readSnapshot(from); const lines = this.files.readLines(from);
    replayLines(s, this.w, lines);
    return { hash: hashState(s), live: hashState(this.s), from, lines: lines.length };
  }

  // ------------------------------------------------------------- players
  seats(): Seat[] { return Object.values(this.meta.seats); }
  private rulerName = (uid: string) => this.meta.seats[uid]?.name ?? null;
  private me(ss: Session): Me { return { uid: ss.user.uid, name: ss.user.name, admin: ss.user.admin, realm: this.meta.seats[ss.user.uid]?.realm ?? -1 }; }
  worldInfo(): WorldInfo {
    return { id: this.cfg.id, name: this.meta.name, day: this.s.day, startYear: this.s.startYear, secondsPerDay: this.cfg.secondsPerDay, paused: this.meta.paused, players: this.seats().length, maxPlayers: this.cfg.maxPlayers };
  }

  attach(conn: Conn, user: UserAuth): Session {
    const ss = new Session(this, conn, { ...user, admin: user.admin || this.cfg.admins.includes(user.uid) || this.cfg.admins.includes(user.name) });
    this.sessions.add(ss);
    const seat = this.meta.seats[user.uid];
    if (seat) { seat.lastSeen = Date.now(); seat.name = user.name; }
    ss.send({ type: 'welcome', me: this.me(ss), world: this.worldInfo(), realms: realmInfos(this.s, this.rulerName) });
    ss.sendBin(encodeOwners(this.s.place.owner));
    return ss;
  }
  detach(ss: Session) {
    this.sessions.delete(ss);
    const seat = this.meta.seats[ss.user.uid]; if (seat) seat.lastSeen = Date.now();
  }
  private online(uid: string) { for (const ss of this.sessions) if (ss.user.uid === uid) return true; return false; }

  handle(ss: Session, m: ClientMsg) {
    switch (m?.type) {
      case 'claim': return this.claim(ss, m.realm);
      case 'abdicate': {
        const seat = this.meta.seats[ss.user.uid]; if (!seat) return;
        this.queue.push({ e: { k: 'release', realm: seat.realm }, session: ss, id: 0 });
        delete this.meta.seats[ss.user.uid]; this.saveMeta();
        this.store.removeSeat(this.cfg.id, ss.user.uid).catch(() => {});
        ss.send({ type: 'me', me: this.me(ss) });
        return;
      }
      case 'cmd': {
        const seat = this.meta.seats[ss.user.uid];
        const id = Number(m.id) || 0;
        if (!seat) return ss.send({ type: 'result', id, ok: false, err: 'you rule no realm' });
        let b = this.buckets.get(ss.user.uid); if (!b) this.buckets.set(ss.user.uid, (b = new Bucket(this.cfg.cmdsPerDay, this.cfg.cmdsPerDay / Math.max(0.05, this.cfg.secondsPerDay))));
        if (!b.take()) return ss.send({ type: 'result', id, ok: false, err: 'too many orders, wait a moment' });
        const cmd = { ...(m.cmd ?? {}), realm: seat.realm } as Command;
        this.queue.push({ e: { k: 'cmd', uid: ss.user.uid, cmd }, session: ss, id });
        return;
      }
      case 'place': { const d = placeDetail(this.s, this.w, m.place); if (d) ss.send({ type: 'place', detail: d }); return; }
    }
  }

  private claim(ss: Session, realm: number) {
    const uid = ss.user.uid;
    if (this.meta.seats[uid]) return ss.send({ type: 'error', code: 'claim', message: 'You already rule a realm.' });
    if (this.seats().length >= this.cfg.maxPlayers) return ss.send({ type: 'error', code: 'claim', message: 'This world is full.' });
    if (this.queue.some((q) => q.e.k === 'claim' && (q.e.realm === realm || q.e.uid === uid))) return ss.send({ type: 'error', code: 'claim', message: 'Someone is taking this realm just now.' });
    // checked now and applied at once (a seat must not wait for the next day), logged like any entry
    const r = this.apply({ k: 'claim', uid, realm });
    if (!r.ok) return ss.send({ type: 'error', code: 'claim', message: r.err ?? 'not possible' });
    const now = Date.now();
    this.meta.seats[uid] = { uid, name: ss.user.name, realm, joinedAt: now, lastSeen: now };
    this.saveMeta();
    this.store.upsertSeat(this.cfg.id, { uid, name: ss.user.name, key: this.s.realmText[realm].key, joinedAt: now, lastSeen: now }).catch(() => {});
    ss.send({ type: 'me', me: this.me(ss) });
    this.rulersChanged();
  }

  /** Realms whose player has not been seen for a long time are free again. */
  private releaseInactive() {
    const now = Date.now();
    for (const seat of this.seats()) {
      if (this.online(seat.uid) || now - seat.lastSeen < this.cfg.inactiveReleaseMs) continue;
      this.queue.push({ e: { k: 'release', realm: seat.realm }, session: null, id: 0 });
      delete this.meta.seats[seat.uid];
      this.store.removeSeat(this.cfg.id, seat.uid).catch(() => {});
      this.log(`released ${this.s.realmText[seat.realm]?.key} (${seat.name} away)`);
    }
  }

  private rulersChanged() {
    const realms = realmInfos(this.s, this.rulerName), world = this.worldInfo();
    for (const ss of this.sessions) { ss.send({ type: 'realms', realms }); ss.send({ type: 'world', world }); }
  }

  private broadcastDay() {
    const changes: [number, number][] = [];
    const o = this.s.place.owner;
    for (let i = 0; i < o.length; i++) if (o[i] !== this.prevOwner[i]) { changes.push([i, o[i]]); this.prevOwner[i] = o[i]; }
    for (const ss of this.sessions) {
      ss.send({ type: 'tick', day: this.s.day });
      if (changes.length) ss.send({ type: 'owners', changes });
    }
  }

  /** Enqueues an entry as the world itself (tests, admin tools). */
  enqueue(e: LogEntry) { this.queue.push({ e, session: null, id: 0 }); }
}
