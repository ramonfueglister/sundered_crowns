// World server core: one authoritative persistent world. No sockets here (see server/main.ts for the transport),
// so the whole thing can be driven in-process by tests.
//
// Determinism: every change to the GameState goes through a LogEntry, which is appended to the command log in the
// exact order in which it was applied, interleaved with day markers ({adv:1}). Snapshot + log replay therefore
// reproduces hashState exactly (tests/world_replay.test.ts). Real-time inputs (who is online, inactivity, offer
// expiry in hours) are turned into log entries before they touch the state.
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, readdirSync, openSync, writeSync, closeSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { GameState, Command, CmdResult } from '../src/sim/types';
import type { World } from '../src/sim/world';
import type { ArmyLite, MapMode, NationLite, Query } from '../src/game/protocol';
import { createGame } from '../src/sim/setup';
import { advanceDay, saveBinary, loadBinary, hashState, END_YEAR } from '../src/sim/engine';
import { applyCommand } from '../src/sim/commands';
import { acceptProposal } from '../src/sim/systems/diplomacy';
import { answerEvent } from '../src/sim/systems/events';
import { notice, chronicle, hasTreaty, atWar } from '../src/sim/ctx';
import { nationLites, armyLites, playerView, warsView, pendingView, mapModeColors, answer, landmarksView, roadLevels, tradeView } from '../src/game/view';
import { dateToDay, dayToDate } from '../src/sim/calendar';
import { nationDev } from '../src/sim/systems/war';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { checkAchievements, type AchievementCtx } from '../src/online/achievements';
import {
  type ServerMsg, type ClientMsg, type WorldInfo, type FreeNation, type SeatInfo, type ChatMsg, type PlayerOffer, type OfferAction, type LeaderRow,
  type EarnedAchievement, type RosterEntry, OFFER_ACTIONS, DEFAULT_ORDERS, sanitizeOrders, encodeBinary, BIN_OWNERS, BIN_COLORS, BIN_SNOW, BIN_ROADS, MAP_MODE_LIST, PROTOCOL_VERSION,
  type WireTickView,
} from '../src/online/protocol';
import { NullStore, type WorldStore } from './store';

// ======================================================================= deterministic layer
export type LogEntry =
  | { k: 'cmd'; uid: string; cmd: Command }
  | { k: 'dev'; uid: string; cmd: Command }
  | { k: 'join'; uid: string; nation: number; protect: number }
  | { k: 'online'; nation: number }
  | { k: 'offline'; nation: number }
  | { k: 'release'; nation: number; reason: string }
  | { k: 'offer'; from: number; to: number; action: OfferAction; expires: number; text?: string }
  | { k: 'offer_answer'; offer: number; by: number; accept: boolean }
  | { k: 'end_season' };
export type LogLine = { d: number; e: LogEntry } | { d: number; adv: 1 };

interface OnlineState { offers: PlayerOffer[]; nextOffer: number }
/** Player-to-player offers live inside the GameState so they are saved, hashed and replayed with it. */
export function onlineState(s: GameState): OnlineState {
  const a = s as any; if (!a.online) a.online = { offers: [], nextOffer: 1 }; return a.online;
}
const OK: CmdResult = { ok: true };
const err = (e: string): CmdResult => ({ ok: false, err: e });
const PLAYER_CMDS = new Set<Command['t']>(['move', 'merge', 'split', 'recruit', 'mercs', 'disband', 'general', 'build', 'declare', 'peace', 'peace_answer', 'diplo', 'law', 'estate', 'tax', 'budget',
  'event', 'tech', 'doctrine', 'agent', 'colonize', 'explore', 'spy', 'office', 'loan', 'merchant', 'integrate', 'orders', 'decision', 'workshop', 'embark', 'landmark']);

function offerAllowed(s: GameState, from: number, to: number, action: OfferAction): string | null {
  const A = s.nations[from], B = s.nations[to];
  if (!A?.alive || !B?.alive) return 'no such realm';
  if (from === to) return 'cannot make an offer to yourself';
  if (!A.playerId || !B.playerId) return 'offers are only between player realms';
  if (!OFFER_ACTIONS.includes(action)) return 'unknown offer';
  if (atWar(s, from, to)) return 'at war';
  if (hasTreaty(s, from, to, action as any)) return 'already agreed';
  return null;
}

/** Apply one log entry to the state. Pure function of (state, entry): used live and in replay. */
export function applyEntry(s: GameState, w: World, e: LogEntry): CmdResult {
  switch (e.k) {
    case 'cmd': {
      let cmd = e.cmd;
      const n = s.nations[cmd?.n];
      if (!n || !n.alive) return err('no such realm');
      if (n.playerId !== e.uid) return err('not your realm');
      if (!PLAYER_CMDS.has(cmd.t)) return err('command not allowed');
      if (cmd.t === 'declare') {
        const t = s.nations[cmd.target];
        if (t && (t.flags.protected_until || 0) > s.day) return err('that realm is under protection');
      }
      if (cmd.t === 'orders') cmd = { ...cmd, orders: sanitizeOrders(cmd.orders) };
      const r = applyCommand(s, w, cmd);
      if (r.ok && cmd.t === 'declare') delete n.flags.protected_until; // an aggressor gives up its protection
      return r;
    }
    case 'dev': {
      s.flags.devtools = 1;
      try { return applyCommand(s, w, { ...e.cmd, t: 'dev' } as Command); } finally { delete s.flags.devtools; }
    }
    case 'join': {
      const n = s.nations[e.nation];
      if (!n || !n.alive) return err('no such realm');
      if (n.playerId) return err('this realm already has a ruler');
      if (s.nations.some((x) => x.playerId === e.uid)) return err('you already rule a realm');
      n.playerId = e.uid;
      if (!s.playerNations.includes(n.id)) s.playerNations.push(n.id);
      delete s.flags[`offline_${n.id}`];
      n.flags.protected_until = s.day + e.protect;
      n.standingOrders = sanitizeOrders(n.standingOrders ?? DEFAULT_ORDERS);
      chronicle(s, n.id, 'online', { en: `A new ruler takes up the crown of ${n.short.en}.`, de: `Ein neuer Herrscher übernimmt die Krone von ${n.short.de}.` }, n.capital >= 0 ? n.capital : undefined);
      return OK;
    }
    case 'online': {
      const n = s.nations[e.nation]; if (!n?.playerId) return err('no ruler');
      if (!s.playerNations.includes(n.id)) s.playerNations.push(n.id);
      delete s.flags[`offline_${n.id}`];
      return OK;
    }
    case 'offline': {
      const n = s.nations[e.nation]; if (!n?.playerId) return err('no ruler');
      s.playerNations = s.playerNations.filter((x) => x !== n.id);
      s.flags[`offline_${n.id}`] = 1; // the AI now follows the standing orders (systems/ai.ts)
      return OK;
    }
    case 'release': {
      const n = s.nations[e.nation]; if (!n) return err('no such realm');
      n.playerId = null; delete n.standingOrders; delete n.flags.protected_until;
      s.playerNations = s.playerNations.filter((x) => x !== n.id);
      delete s.flags[`offline_${n.id}`];
      for (const p of s.pending.filter((x) => x.nation === n.id)) answerEvent(s, w, n.id, p.id, -1);
      const o = onlineState(s); o.offers = o.offers.filter((x) => x.from !== n.id && x.to !== n.id);
      return OK;
    }
    case 'offer': {
      const why = offerAllowed(s, e.from, e.to, e.action); if (why) return err(why);
      const o = onlineState(s);
      if (o.offers.filter((x) => x.from === e.from).length >= 6) return err('too many open offers');
      if (o.offers.some((x) => x.from === e.from && x.to === e.to && x.action === e.action)) return err('offer already sent');
      o.offers.push({ id: o.nextOffer++, from: e.from, to: e.to, action: e.action, day: s.day, expires: Math.max(s.day + 1, e.expires), text: e.text?.slice(0, 300) });
      const A = s.nations[e.from];
      notice(s, e.to, 'player_offer', { en: `${A.short.en} (a player) proposes: ${e.action}.`, de: `${A.short.de} (ein Spieler) schlägt vor: ${e.action}.` });
      return OK;
    }
    case 'offer_answer': {
      const o = onlineState(s); const of = o.offers.find((x) => x.id === e.offer && x.to === e.by);
      if (!of) return err('no such offer');
      o.offers = o.offers.filter((x) => x !== of);
      const B = s.nations[of.to];
      if (!e.accept) { notice(s, of.from, 'player_offer_declined', { en: `${B.short.en} declined our offer (${of.action}).`, de: `${B.short.de} hat unser Angebot abgelehnt (${of.action}).` }); return OK; }
      const why = offerAllowed(s, of.from, of.to, of.action); if (why) return err(why);
      acceptProposal(s, w, of.from, of.to, of.action);
      notice(s, of.from, 'player_offer_accepted', { en: `${B.short.en} accepted our offer (${of.action}).`, de: `${B.short.de} hat unser Angebot angenommen (${of.action}).` });
      return OK;
    }
    case 'end_season': {
      if (!s.ended) { s.ended = true; const best = s.nations.filter((n) => n.alive).sort((a, b) => b.score - a.score)[0]; s.victory = { nation: best?.id ?? -1, kind: 'score' }; }
      return OK;
    }
  }
  return err('unknown entry');
}

/** Deterministic end-of-day housekeeping of the online layer (offer expiry). */
export function afterDay(s: GameState): void {
  const o = (s as any).online as OnlineState | undefined; if (!o || !o.offers.length) return;
  const keep: PlayerOffer[] = [];
  for (const x of o.offers) {
    if (x.expires > s.day) { keep.push(x); continue; }
    const A = s.nations[x.from], B = s.nations[x.to];
    if (A && B) notice(s, x.from, 'player_offer_expired', { en: `Our offer to ${B.short.en} (${x.action}) has expired.`, de: `Unser Angebot an ${B.short.de} (${x.action}) ist verfallen.` });
  }
  o.offers = keep;
}

/** Replays log lines on top of a state (mutates and returns it). */
export function replayLines(s: GameState, w: World, lines: Iterable<LogLine>): GameState {
  for (const l of lines) {
    if ('adv' in l) { if (l.d !== s.day) throw new Error(`replay out of step: log day ${l.d}, state day ${s.day}`); advanceDay(s, w); afterDay(s); }
    else applyEntry(s, w, l.e);
  }
  return s;
}
export function parseLog(text: string): LogLine[] {
  const out: LogLine[] = [];
  for (const line of text.split('\n')) { if (!line.trim()) continue; try { out.push(JSON.parse(line)); } catch { break; /* torn last line after a crash */ } }
  return out;
}

// ======================================================================= persistence on disk
class SeasonFiles {
  dir: string; private fd = -1; segment = -1;
  constructor(root: string, season: number) { this.dir = join(root, `season-${season}`); mkdirSync(this.dir, { recursive: true }); }
  exists() { return existsSync(join(this.dir, 'snapshot.json')); }
  latest(): { day: number; file: string; hash: string } | null { try { return JSON.parse(readFileSync(join(this.dir, 'snapshot.json'), 'utf8')); } catch { return null; } }
  writeSnapshot(s: GameState): { day: number; hash: string; bin: Uint8Array } {
    const bin = saveBinary(s), day = s.day, hash = hashState(s);
    const file = `snap-${day}.bin`;
    writeFileSync(join(this.dir, file + '.tmp'), bin); renameSync(join(this.dir, file + '.tmp'), join(this.dir, file));
    this.openSegment(day);
    writeFileSync(join(this.dir, 'snapshot.json.tmp'), JSON.stringify({ day, file, hash })); renameSync(join(this.dir, 'snapshot.json.tmp'), join(this.dir, 'snapshot.json'));
    // keep the genesis snapshot (day 0) and the three most recent ones
    const snaps = this.snapshots().filter((d) => d !== 0);
    for (const d of snaps.slice(0, -3)) try { unlinkSync(join(this.dir, `snap-${d}.bin`)); } catch { /* ignore */ }
    return { day, hash, bin };
  }
  snapshots(): number[] { return readdirSync(this.dir).map((f) => /^snap-(\d+)\.bin$/.exec(f)).filter(Boolean).map((m) => Number(m![1])).sort((a, b) => a - b); }
  segments(): number[] { return readdirSync(this.dir).map((f) => /^log-(\d+)\.ndjson$/.exec(f)).filter(Boolean).map((m) => Number(m![1])).sort((a, b) => a - b); }
  readSnapshot(day: number): Uint8Array { return new Uint8Array(readFileSync(join(this.dir, `snap-${day}.bin`))); }
  readLines(fromDay: number): LogLine[] {
    const out: LogLine[] = [];
    for (const seg of this.segments()) if (seg >= fromDay) out.push(...parseLog(readFileSync(join(this.dir, `log-${seg}.ndjson`), 'utf8')));
    return out;
  }
  segmentText(day: number): string { try { return readFileSync(join(this.dir, `log-${day}.ndjson`), 'utf8'); } catch { return ''; } }
  openSegment(day: number) { if (this.fd >= 0) closeSync(this.fd); this.fd = openSync(join(this.dir, `log-${day}.ndjson`), 'a'); this.segment = day; }
  append(line: LogLine) { if (this.fd < 0) throw new Error('log not open'); writeSync(this.fd, JSON.stringify(line) + '\n'); }
  close() { if (this.fd >= 0) closeSync(this.fd); this.fd = -1; }
}

// ======================================================================= world core
export interface WorldConfig {
  id: string; name: string; dataDir: string;
  secondsPerDay: number;          // real seconds per in-game day (36 → one season ≈ 10 weeks)
  snapshotEveryDays: number;      // in-game days between snapshots on disk
  uploadEveryDays: number;        // in-game days between snapshot uploads to Supabase Storage
  seed: number; startYear: number; maxPlayers: number;
  protectionDays: number;         // in-game days of protection after joining
  inactiveReleaseMs: number;      // real time without login after which a seat goes back to the AI
  offerExpiryHours: number;       // real hours a player offer stays open (converted to in-game days)
  cmdsPerDay: number;             // commands a player may queue per in-game day
  admins: string[];               // uids or display names with admin rights (in addition to the store's admin table)
  seasonEndDay?: number;          // override for tests; default: the simulation's own end (31 Dec 1815)
  devAuth: boolean;               // true when no Supabase is configured (display-name login)
  log?: (msg: string) => void;
}
export function configFromEnv(env: Record<string, string | undefined> = process.env): WorldConfig {
  const num = (k: string, d: number) => { const v = Number(env[k]); return env[k] !== undefined && env[k] !== '' && Number.isFinite(v) ? v : d; };
  return {
    id: (env.WORLD_ID || 'europa-1').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 32), name: env.WORLD_NAME || 'Europa I', dataDir: env.WORLD_DATA_DIR || './world-data',
    secondsPerDay: num('SECONDS_PER_DAY', 36), snapshotEveryDays: Math.max(1, num('SNAPSHOT_EVERY_DAYS', 30)), uploadEveryDays: Math.max(1, num('SNAPSHOT_UPLOAD_EVERY_DAYS', 300)), seed: num('WORLD_SEED', 1356), startYear: num('WORLD_START_YEAR', 1356),
    maxPlayers: num('MAX_PLAYERS', 100), protectionDays: num('PROTECTION_DAYS', 30), inactiveReleaseMs: num('INACTIVE_RELEASE_DAYS', 7) * 86400_000,
    offerExpiryHours: num('OFFER_EXPIRY_HOURS', 48), cmdsPerDay: num('CMDS_PER_DAY', 60), admins: (env.ADMIN_USERS || '').split(',').map((x) => x.trim()).filter(Boolean),
    seasonEndDay: env.SEASON_END_DAY ? num('SEASON_END_DAY', 0) : undefined, devAuth: !(env.SUPABASE_JWT_SECRET || env.SUPABASE_JWKS_URL || env.SUPABASE_URL),
  };
}

export interface UserAuth { uid: string; name: string; admin: boolean }
export interface Conn { send(m: ServerMsg): void; sendBin(b: Uint8Array): void; close(code: number, reason: string): void; /** an already serialized JSON frame (optional) */ sendRaw?(json: string): void }

interface Seat {
  uid: string; name: string; nation: number; key: string; joinedDay: number; joinedAt: number; lastSeen: number;
  join: AchievementCtx['join']; lastWarDay: number;
}
interface Meta {
  id: string; name: string; season: number; seed: number; startedAt: number; paused: boolean; secondsPerDay: number;
  seats: Record<string, Seat>; achievements: Record<string, EarnedAchievement[]>; chat: ChatMsg[]; nextChat: number;
  seasons: { season: number; ended: number; rows: LeaderRow[] }[];
}
interface Queued { e: LogEntry; session: Session | null; id: number }

class Bucket {
  t: number; last = Date.now();
  constructor(private cap: number, private perSec: number) { this.t = cap; }
  take(n = 1): boolean { const now = Date.now(); this.t = Math.min(this.cap, this.t + ((now - this.last) / 1000) * this.perSec); this.last = now; if (this.t < n) return false; this.t -= n; return true; }
}

export class Session {
  lastNotice: number; needFull = true; mapMode: MapMode = 'political'; mapFocus = -1; closed = false;
  strikes = 0;
  constructor(readonly core: WorldCore, readonly conn: Conn, readonly user: UserAuth) { this.lastNotice = core.lastNoticeId(); }
  get seat(): Seat | null { return this.core.meta.seats[this.user.uid] ?? null; }
  send(m: ServerMsg) { if (!this.closed) try { this.conn.send(m); } catch { /* socket gone */ } }
  sendBin(b: Uint8Array) { if (!this.closed) try { this.conn.sendBin(b); } catch { /* socket gone */ } }
  /** Sends a frame serialized once for many sessions; transports without raw frames get the parsed message. */
  sendJson(json: string) { if (this.closed) return; try { if (this.conn.sendRaw) this.conn.sendRaw(json); else this.conn.send(JSON.parse(json)); } catch { /* socket gone */ } }
  handle(m: ClientMsg) { this.core.handle(this, m); }
  disconnect() { if (this.closed) return; this.closed = true; this.core.detach(this); }
}

export class WorldCore {
  readonly cfg: WorldConfig;
  w!: World;
  s!: GameState;
  meta!: Meta;
  private files!: SeasonFiles;
  private queue: Queued[] = [];
  private sessions = new Set<Session>();
  private buckets = new Map<string, Bucket>();
  private chatBuckets = new Map<string, Bucket>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private stepping = false;
  nextDayAt = 0;
  msPerDay = 0;
  /** Smoothed real time of each part of a day step (ms), for /health and load tests. */
  stepMs = { cmds: 0, day: 0, persist: 0, broadcast: 0 };
  private prevOwner!: Int16Array; private prevCtrl!: Int16Array;
  private lastChron = 0; private lastOwnerChange = 0; private lastMonth = -1;
  private nationsDirty = true;
  readonly store: WorldStore;
  private log: (m: string) => void;
  onDay: ((day: number) => void)[] = [];

  constructor(cfg: WorldConfig, store: WorldStore = new NullStore()) {
    this.cfg = cfg; this.store = store; this.log = cfg.log ?? ((m) => console.log(`[world ${cfg.id}] ${m}`));
  }
  get root() { return join(this.cfg.dataDir, this.cfg.id); }
  get seasonEndDay() { return this.cfg.seasonEndDay ?? dateToDay(END_YEAR + 1, 0, 1, this.s?.startYear ?? this.cfg.startYear); }

  /** Create the world or resume it from disk (snapshot + command log). */
  init(): this {
    this.w = loadWorld();
    mkdirSync(this.root, { recursive: true });
    const metaPath = join(this.root, 'meta.json');
    const meta: Meta | null = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : null;
    this.meta = meta ?? { id: this.cfg.id, name: this.cfg.name, season: 1, seed: this.cfg.seed, startedAt: Date.now(), paused: false, secondsPerDay: this.cfg.secondsPerDay, seats: {}, achievements: {}, chat: [], nextChat: 1, seasons: [] };
    if (!meta) this.meta.secondsPerDay = this.cfg.secondsPerDay;
    this.files = new SeasonFiles(this.root, this.meta.season);
    if (this.files.exists()) this.resume(); else this.newSeasonState();
    this.prevOwner = new Int16Array(this.s.loc.owner); this.prevCtrl = new Int16Array(this.s.loc.ctrl);
    this.lastChron = this.s.chronicle.length; this.lastOwnerChange = ((this.s as any).ownerChanges || []).length;
    this.saveMeta();
    this.store.upsertWorld(this.worldInfo()).catch(() => {});
    return this;
  }
  private seasonSeed(season: number) { return (Math.imul(this.meta.seed ^ 0x9e3779b9, 31) + season * 7919) >>> 0; }
  private newSeasonState() {
    this.s = createGame(this.w, loadSetup(this.cfg.startYear), loadHubs(), this.seasonSeed(this.meta.season), { player: [] });
    onlineState(this.s);
    const snap = this.files.writeSnapshot(this.s); // genesis, kept forever
    this.log(`season ${this.meta.season} created, seed ${this.seasonSeed(this.meta.season)}, hash ${snap.hash}`);
    this.store.event(this.meta.id, this.meta.season, 'season_start', 0, { seed: this.seasonSeed(this.meta.season) }).catch(() => {});
  }
  private resume() {
    const latest = this.files.latest()!;
    const s = loadBinary(this.files.readSnapshot(latest.day));
    const lines = this.files.readLines(latest.day);
    replayLines(s, this.w, lines);
    this.s = s;
    this.files.openSegment(this.files.segments().filter((d) => d >= latest.day).pop() ?? latest.day);
    // reconcile seats with the state (the state is the truth)
    for (const [uid, seat] of Object.entries(this.meta.seats)) if (this.s.nations[seat.nation]?.playerId !== uid) delete this.meta.seats[uid];
    for (const n of this.s.nations) if (n.playerId && !this.meta.seats[n.playerId]) this.meta.seats[n.playerId] = this.newSeat(n.playerId, n.playerId, n.id);
    // nobody is connected after a restart
    for (const n of this.s.nations) if (n.playerId && this.s.playerNations.includes(n.id)) this.apply({ k: 'offline', nation: n.id });
    this.log(`resumed season ${this.meta.season} at day ${this.s.day} (snapshot ${latest.day} + ${lines.length} log lines), hash ${hashState(this.s)}`);
  }
  private newSeat(uid: string, name: string, nation: number): Seat {
    const n = this.s.nations[nation]; let locs = 0; for (let i = 0; i < this.w.L; i++) if (this.s.loc.owner[i] === nation) locs++;
    return { uid, name, nation, key: n.key, joinedDay: this.s.day, joinedAt: Date.now(), lastSeen: Date.now(), join: { locs, battlesWon: n.stats.battlesWon, warsWon: n.stats.warsWon }, lastWarDay: this.s.day };
  }
  private saveMeta() {
    const p = join(this.root, 'meta.json');
    writeFileSync(p + '.tmp', JSON.stringify(this.meta)); renameSync(p + '.tmp', p);
  }

  /** Apply and log an entry right now (server operations; player commands go through the queue). */
  private apply(e: LogEntry): CmdResult {
    this.files.append({ d: this.s.day, e });
    const r = applyEntry(this.s, this.w, e);
    if (e.k !== 'cmd' && e.k !== 'dev') this.nationsDirty = true;
    return r;
  }

  // ------------------------------------------------------------- clock
  start() {
    if (this.running) return; this.running = true; this.schedule();
  }
  stop() {
    this.running = false; if (this.timer) clearTimeout(this.timer); this.timer = null;
  }
  shutdown() {
    this.stop();
    for (const ss of [...this.sessions]) { ss.send({ type: 'broadcast', text: 'The world server is restarting.', at: Date.now() }); ss.conn.close(1012, 'restart'); }
    this.files.writeSnapshot(this.s); this.saveMeta(); this.files.close();
  }
  private schedule(delay?: number) {
    if (!this.running) return;
    if (this.meta.paused) { this.nextDayAt = 0; this.timer = setTimeout(() => this.schedule(), 500); return; }
    const ms = Math.max(0, this.meta.secondsPerDay * 1000);
    const wait = delay ?? ms;
    this.nextDayAt = Date.now() + wait;
    this.timer = setTimeout(() => {
      this.timer = null;
      const next = Date.now() + ms; this.nextDayAt = next; // announced to clients in this step's broadcast
      try { this.step(); } catch (e: any) { this.log(`step failed: ${e?.stack || e}`); }
      this.schedule(Math.max(0, next - Date.now())); // steady cadence: the step's own time is not added
    }, wait);
  }

  /** One in-game day: apply queued commands, advance, persist, broadcast. */
  step() {
    if (this.stepping) return; this.stepping = true;
    try {
      const s = this.s, now = Date.now();
      // real-time housekeeping becomes log entries before the day runs
      for (const seat of Object.values(this.meta.seats)) {
        const online = [...this.sessions].some((x) => x.user.uid === seat.uid);
        if (online) seat.lastSeen = now;
        else if (now - seat.lastSeen > this.cfg.inactiveReleaseMs) this.releaseSeat(seat, 'inactive');
      }
      if (!s.ended && s.day >= this.seasonEndDay) this.apply({ k: 'end_season' });
      const sm = this.stepMs, ema = (k: keyof typeof sm, t: number) => { sm[k] = sm[k] * 0.8 + (performance.now() - t) * 0.2; };
      let t1 = performance.now();
      const q = this.queue; this.queue = [];
      for (const it of q) {
        const res = this.apply(it.e);
        if (it.session) it.session.send({ type: 'cmdResult', id: it.id, res });
        if (res.ok && it.e.k === 'cmd' && it.e.cmd.t === 'orders') { const seat = this.meta.seats[it.e.uid]; if (seat) this.store.upsertSeat(this.meta.id, this.meta.season, seat, this.s.nations[seat.nation].standingOrders ?? DEFAULT_ORDERS, this.s.nations[seat.nation].flags.protected_until ?? 0).catch(() => {}); }
      }
      ema('cmds', t1);
      if (!s.ended) {
        this.files.append({ d: s.day, adv: 1 });
        const t0 = performance.now();
        advanceDay(s, this.w); afterDay(s);
        this.msPerDay = this.msPerDay * 0.8 + (performance.now() - t0) * 0.2; sm.day = this.msPerDay;
      }
      t1 = performance.now();
      const d = dayToDate(s.day, s.startYear);
      for (const seat of Object.values(this.meta.seats)) if (s.wars.some((x) => x.att.includes(seat.nation) || x.def.includes(seat.nation))) seat.lastWarDay = s.day;
      if (d.d === 1) this.checkAchievements(false);
      if (s.day % this.cfg.snapshotEveryDays === 0) this.snapshot();
      if (s.day % 10 === 0) this.store.upsertWorld(this.worldInfo()).catch(() => {});
      this.saveMeta();
      ema('persist', t1); t1 = performance.now();
      this.broadcastTick();
      ema('broadcast', t1);
      for (const f of this.onDay) f(s.day);
      if (s.ended) this.finishSeason();
    } finally { this.stepping = false; }
  }
  private lastUpload = -1;
  /** Writes a snapshot to disk; every `uploadEveryDays` also to Supabase Storage (with the log since the last upload). */
  snapshot(forceUpload = false) {
    const snap = this.files.writeSnapshot(this.s);
    if (this.store.enabled && (forceUpload || this.lastUpload < 0 || snap.day - this.lastUpload >= this.cfg.uploadEveryDays)) {
      const from = Math.max(0, this.lastUpload);
      const log = this.files.segments().filter((d) => d >= from && d < snap.day).map((d) => this.files.segmentText(d)).join('');
      this.lastUpload = snap.day;
      this.store.uploadSnapshot(this.meta.id, this.meta.season, snap.day, snap.bin, from, log).catch((e) => this.log(`snapshot upload failed: ${e}`));
    }
    return snap;
  }
  /** Replays the current season from a snapshot (default: the latest) and the log; returns the resulting hash. */
  verifyReplay(fromDay?: number): { hash: string; live: string; from: number; lines: number } {
    const snaps = this.files.snapshots();
    const from = fromDay ?? this.files.latest()!.day;
    if (!snaps.includes(from)) throw new Error(`no snapshot for day ${from}`);
    const s = loadBinary(this.files.readSnapshot(from)); const lines = this.files.readLines(from);
    replayLines(s, this.w, lines);
    return { hash: hashState(s), live: hashState(this.s), from, lines: lines.length };
  }
  snapshotDays() { return this.files.snapshots(); }

  // ------------------------------------------------------------- seats
  private releaseSeat(seat: Seat, reason: string) {
    this.apply({ k: 'release', nation: seat.nation, reason });
    delete this.meta.seats[seat.uid];
    this.store.removeSeat(this.meta.id, seat.uid).catch(() => {});
    this.store.event(this.meta.id, this.meta.season, 'release', this.s.day, { nation: seat.key, reason }).catch(() => {});
    for (const ss of this.sessions) if (ss.user.uid === seat.uid) { ss.send({ type: 'seat', seat: null }); ss.send({ type: 'free', nations: this.freeNations() }); }
    this.sendRoster();
  }
  freeNations(): FreeNation[] {
    const locs = new Int32Array(this.s.nations.length); for (let i = 0; i < this.w.L; i++) { const o = this.s.loc.owner[i]; if (o >= 0) locs[o]++; }
    return this.s.nations.filter((n) => n.alive && !n.playerId && locs[n.id] > 0).map((n) => ({
      id: n.id, key: n.key, name: n.name, short: n.short, color: n.color, coa: n.coa, rank: n.rank, dev: Math.round(nationDev(this.s, n.id)), locs: locs[n.id], capital: n.capital, difficulty: n.difficulty,
    })).sort((a, b) => b.dev - a.dev);
  }
  seatInfo(seat: Seat | null): SeatInfo | null {
    if (!seat) return null; const n = this.s.nations[seat.nation];
    return { nation: seat.nation, key: seat.key, joinedDay: seat.joinedDay, protectedUntil: n.flags.protected_until ?? 0, orders: sanitizeOrders(n.standingOrders ?? DEFAULT_ORDERS) };
  }
  roster(): RosterEntry[] {
    return Object.values(this.meta.seats).map((x) => ({ nation: x.nation, key: x.key, name: x.name, online: [...this.sessions].some((ss) => ss.user.uid === x.uid) }));
  }
  /** Roster and world status (player counts) to everyone. */
  private sendRoster() { const r = this.roster(), wi = this.worldInfo(); for (const ss of this.sessions) { ss.send({ type: 'roster', roster: r }); ss.send({ type: 'world', world: wi }); } }

  // ------------------------------------------------------------- sessions
  lastNoticeId() { const ns = this.s.notices; return ns.length ? ns[ns.length - 1].id : 0; }
  attach(conn: Conn, user: UserAuth): Session {
    const ss = new Session(this, conn, user);
    // ADMIN_USERS lists uids; display names only count in DEV mode (where anyone can pick any name anyway)
    user.admin = user.admin || this.cfg.admins.includes(user.uid) || (this.cfg.devAuth && this.cfg.admins.includes(user.name));
    this.sessions.add(ss);
    const seat = this.meta.seats[user.uid];
    if (seat) {
      seat.lastSeen = Date.now(); if (user.name && seat.name !== user.name) seat.name = user.name;
      if (!this.s.playerNations.includes(seat.nation)) this.apply({ k: 'online', nation: seat.nation });
    }
    ss.send({ type: 'welcome', user: { id: user.uid, name: user.name, admin: user.admin }, world: this.worldInfo(), seat: this.seatInfo(seat ?? null), L: this.w.L, S: this.w.S, nations: nationLites(this.s, this.w) });
    if (!seat) ss.send({ type: 'free', nations: this.freeNations() });
    ss.send({ type: 'chat', msgs: this.chatFor(ss) });
    ss.send({ type: 'roster', roster: this.roster() });
    ss.send({ type: 'achievements', earned: this.meta.achievements[user.uid] ?? [], fresh: [] });
    if (seat) ss.send({ type: 'offers', offers: this.offersFor(seat.nation) });
    this.sendFullView(ss);
    this.sendRoster();
    return ss;
  }
  detach(ss: Session) {
    this.sessions.delete(ss);
    const seat = this.meta.seats[ss.user.uid];
    if (seat && ![...this.sessions].some((x) => x.user.uid === ss.user.uid)) {
      seat.lastSeen = Date.now();
      this.apply({ k: 'offline', nation: seat.nation });
      this.store.upsertSeat(this.meta.id, this.meta.season, seat, this.s.nations[seat.nation].standingOrders ?? DEFAULT_ORDERS, this.s.nations[seat.nation].flags.protected_until ?? 0).catch(() => {});
    }
    this.queue = this.queue.map((q) => (q.session === ss ? { ...q, session: null } : q));
    this.sendRoster();
  }
  sessionCount() { return this.sessions.size; }

  private bucket(uid: string) { let b = this.buckets.get(uid); if (!b) this.buckets.set(uid, (b = new Bucket(40, 10))); return b; }

  handle(ss: Session, m: ClientMsg) {
    if (!m || typeof m !== 'object' || typeof (m as any).type !== 'string') return;
    if (m.type !== 'ping' && !this.bucket(ss.user.uid).take()) {
      ss.send({ type: 'error', code: 'rate_limited', message: 'Too many requests; slow down.', id: (m as any).id });
      if (++ss.strikes > 200) { ss.send({ type: 'kicked', reason: 'flooding' }); ss.conn.close(4008, 'flooding'); }
      return;
    }
    const seat = ss.seat;
    switch (m.type) {
      case 'ping': ss.send({ type: 'pong', t: m.t, server: Date.now() }); return;
      case 'free': ss.send({ type: 'free', nations: this.freeNations() }); return;
      case 'join': return this.join(ss, m.nation);
      case 'leave': if (seat) this.releaseSeat(seat, 'abdicated'); return;
      case 'cmd': return this.queueCmd(ss, m.id, m.cmd);
      case 'query': {
        const q = m.q as Query; let data: any = null;
        try { data = answer(this.s, this.w, seat?.nation ?? -1, q); } catch (e: any) { data = null; }
        ss.send({ type: 'reply', id: m.id, data: stripTyped(data) }); return;
      }
      case 'mapmode': {
        if (!MAP_MODE_LIST.includes(m.mode)) return;
        ss.mapMode = m.mode; ss.mapFocus = Number.isInteger(m.focus) ? m.focus : -1; this.sendColors(ss); return;
      }
      case 'chat': return this.chat(ss, m.text, m.to);
      case 'offer': return this.offer(ss, m.to, m.action, m.text);
      case 'offer_answer': {
        if (!seat) return ss.send({ type: 'error', code: 'no_seat', message: 'You do not rule a realm here.' });
        const r = this.apply({ k: 'offer_answer', offer: Number(m.offer), by: seat.nation, accept: !!m.accept });
        if (!r.ok) ss.send({ type: 'error', code: 'offer', message: r.err ?? 'failed' });
        this.sendOffers(); return;
      }
      case 'leaderboard': ss.send({ type: 'leaderboard', season: this.meta.season, rows: this.leaderRows(20), final: false }); return;
      case 'admin': return this.admin(ss, m);
    }
  }
  private join(ss: Session, nation: number) {
    if (ss.seat) return ss.send({ type: 'error', code: 'has_seat', message: 'You already rule a realm in this world.' });
    if (Object.keys(this.meta.seats).length >= this.cfg.maxPlayers) return ss.send({ type: 'error', code: 'full', message: 'This world is full.' });
    if (this.s.ended) return ss.send({ type: 'error', code: 'ended', message: 'The season is over.' });
    const n = this.s.nations[nation];
    if (!n || !n.alive || n.playerId) return ss.send({ type: 'error', code: 'taken', message: 'That realm is not free.' });
    const r = this.apply({ k: 'join', uid: ss.user.uid, nation, protect: this.cfg.protectionDays });
    if (!r.ok) return ss.send({ type: 'error', code: 'join', message: r.err ?? 'failed' });
    const seat = this.newSeat(ss.user.uid, ss.user.name, nation);
    this.meta.seats[ss.user.uid] = seat;
    this.store.upsertSeat(this.meta.id, this.meta.season, seat, n.standingOrders ?? DEFAULT_ORDERS, n.flags.protected_until ?? 0).catch(() => {});
    this.store.event(this.meta.id, this.meta.season, 'join', this.s.day, { nation: n.key, name: ss.user.name }).catch(() => {});
    for (const x of this.sessions) if (x.user.uid === ss.user.uid) { x.send({ type: 'seat', seat: this.seatInfo(seat) }); x.send({ type: 'offers', offers: this.offersFor(nation) }); x.needFull = true; this.sendFullView(x); }
    this.sendRoster();
    this.checkAchievements(false, ss.user.uid);
    this.saveMeta();
  }
  private queueCmd(ss: Session, id: number, cmd: Command) {
    const seat = ss.seat;
    if (!seat) return ss.send({ type: 'cmdResult', id, res: { ok: false, err: 'You do not rule a realm here.' } });
    if (!cmd || typeof cmd !== 'object' || typeof cmd.t !== 'string') return ss.send({ type: 'cmdResult', id, res: { ok: false, err: 'bad command' } });
    if (JSON.stringify(cmd).length > 4096) return ss.send({ type: 'cmdResult', id, res: { ok: false, err: 'command too large' } });
    if (cmd.t === 'dev') {
      if (!ss.user.admin) return ss.send({ type: 'cmdResult', id, res: { ok: false, err: 'developer commands are for admins only' } });
      this.queue.push({ e: { k: 'dev', uid: ss.user.uid, cmd }, session: ss, id });
      return ss.send({ type: 'queued', id, day: this.s.day });
    }
    if (cmd.n !== seat.nation) return ss.send({ type: 'cmdResult', id, res: { ok: false, err: 'not your realm' } });
    if (!PLAYER_CMDS.has(cmd.t)) return ss.send({ type: 'cmdResult', id, res: { ok: false, err: 'command not allowed online' } });
    // diplomatic proposals to another player become asynchronous offers
    if (cmd.t === 'diplo' && this.s.nations[cmd.target]?.playerId && (OFFER_ACTIONS as string[]).includes(cmd.action)) {
      const r = this.offer(ss, cmd.target, cmd.action as OfferAction);
      return ss.send({ type: 'cmdResult', id, res: r });
    }
    if (this.queue.filter((q) => q.e.k === 'cmd' && q.e.uid === ss.user.uid).length >= this.cfg.cmdsPerDay)
      return ss.send({ type: 'cmdResult', id, res: { ok: false, err: 'too many orders for one day' } });
    this.queue.push({ e: { k: 'cmd', uid: ss.user.uid, cmd }, session: ss, id });
    ss.send({ type: 'queued', id, day: this.s.day });
  }
  private offer(ss: Session, to: number, action: OfferAction, text?: string): CmdResult {
    const seat = ss.seat; if (!seat) { ss.send({ type: 'error', code: 'no_seat', message: 'You do not rule a realm here.' }); return { ok: false, err: 'no seat' }; }
    const days = Math.max(1, Math.round((this.cfg.offerExpiryHours * 3600) / Math.max(0.001, this.meta.secondsPerDay)));
    const r = this.apply({ k: 'offer', from: seat.nation, to: Number(to), action, expires: this.s.day + days, text: typeof text === 'string' ? cleanText(text, 300) : undefined });
    if (!r.ok) { ss.send({ type: 'error', code: 'offer', message: r.err ?? 'failed' }); return r; }
    const target = Object.values(this.meta.seats).find((x) => x.nation === Number(to));
    this.store.message({ world_id: this.meta.id, season: this.meta.season, kind: 'offer', from_user: ss.user.uid, to_user: target?.uid ?? null, from_nation: seat.key, to_nation: target?.key ?? null,
      body: action, payload: { action, text }, status: 'open', game_day: this.s.day, expires_at: new Date(Date.now() + this.cfg.offerExpiryHours * 3600_000).toISOString() }).catch(() => {});
    this.sendOffers();
    return r;
  }
  offersFor(nation: number): PlayerOffer[] { return onlineState(this.s).offers.filter((o) => o.from === nation || o.to === nation); }
  private sendOffers() { for (const ss of this.sessions) { const seat = ss.seat; if (seat) ss.send({ type: 'offers', offers: this.offersFor(seat.nation) }); } }

  private chatFor(ss: Session): ChatMsg[] { const nat = ss.seat?.nation ?? -2; return this.meta.chat.filter((c) => c.to === null || c.to === nat || c.from === ss.user.uid).slice(-80); }
  private chat(ss: Session, text: string, to?: number) {
    let b = this.chatBuckets.get(ss.user.uid); if (!b) this.chatBuckets.set(ss.user.uid, (b = new Bucket(5, 0.5)));
    const t = cleanText(String(text ?? ''), 500); if (!t) return;
    if (!b.take()) return ss.send({ type: 'error', code: 'chat_rate', message: 'You are sending messages too quickly.' });
    const target = to !== undefined && to !== null ? Number(to) : null;
    const msg: ChatMsg = { id: this.meta.nextChat++, at: Date.now(), day: this.s.day, from: ss.user.uid, fromName: ss.user.name, fromNation: ss.seat?.nation ?? -1, to: target, text: t };
    this.meta.chat.push(msg); if (this.meta.chat.length > 300) this.meta.chat.splice(0, this.meta.chat.length - 300);
    for (const x of this.sessions) if (target === null || x.seat?.nation === target || x.user.uid === ss.user.uid) x.send({ type: 'chat', msgs: [msg] });
    const toSeat = target !== null ? Object.values(this.meta.seats).find((x) => x.nation === target) : null;
    this.store.message({ world_id: this.meta.id, season: this.meta.season, kind: 'chat', from_user: ss.user.uid, to_user: toSeat?.uid ?? null, from_nation: ss.seat?.key ?? null, to_nation: toSeat?.key ?? null, body: t, payload: {}, status: 'sent', game_day: this.s.day, expires_at: null }).catch(() => {});
  }
  broadcast(text: string) {
    const t = cleanText(text, 500); if (!t) return;
    const msg: ChatMsg = { id: this.meta.nextChat++, at: Date.now(), day: this.s.day, from: 'server', fromName: 'Herald', fromNation: -1, to: null, text: t, system: true };
    this.meta.chat.push(msg);
    for (const x of this.sessions) { x.send({ type: 'broadcast', text: t, at: msg.at }); x.send({ type: 'chat', msgs: [msg] }); }
    this.store.event(this.meta.id, this.meta.season, 'broadcast', this.s.day, { text: t }).catch(() => {});
  }
  private admin(ss: Session, m: Extract<ClientMsg, { type: 'admin' }>) {
    if (!ss.user.admin) return ss.send({ type: 'error', code: 'forbidden', message: 'Admins only.' });
    this.store.event(this.meta.id, this.meta.season, 'admin', this.s.day, { by: ss.user.uid, action: m.action, uid: m.uid, nation: m.nation }).catch(() => {});
    switch (m.action) {
      case 'pause': this.meta.paused = true; break;
      case 'resume': this.meta.paused = false; break;
      case 'speed': if (Number(m.secondsPerDay) > 0) this.meta.secondsPerDay = Math.min(3600, Number(m.secondsPerDay)); break;
      case 'broadcast': this.broadcast(m.text ?? ''); break;
      case 'kick': {
        const uid = m.uid ?? Object.values(this.meta.seats).find((x) => x.nation === m.nation)?.uid;
        if (!uid) { ss.send({ type: 'error', code: 'admin', message: 'No such player.' }); break; }
        for (const x of [...this.sessions]) if (x.user.uid === uid) { x.send({ type: 'kicked', reason: m.text || 'kicked by an admin' }); x.conn.close(4003, 'kicked'); }
        if (m.release) { const seat = this.meta.seats[uid]; if (seat) this.releaseSeat(seat, 'kicked'); }
        break;
      }
      case 'release': { const seat = Object.values(this.meta.seats).find((x) => x.nation === m.nation || x.uid === m.uid); if (seat) this.releaseSeat(seat, 'admin'); break; }
      case 'dev': if (m.cmd) { const r = this.apply({ k: 'dev', uid: ss.user.uid, cmd: m.cmd }); if (!r.ok) ss.send({ type: 'error', code: 'dev', message: r.err ?? 'failed' }); this.nationsDirty = true; } break;
      case 'snapshot': this.snapshot(true); break;
      case 'end_season': this.apply({ k: 'end_season' }); break;
    }
    if (m.action === 'pause' || m.action === 'resume' || m.action === 'speed') {
      if (this.running) { if (this.timer) clearTimeout(this.timer); this.timer = null; this.schedule(); }
      const wi = this.worldInfo(); for (const x of this.sessions) x.send({ type: 'world', world: wi });
      this.store.upsertWorld(wi).catch(() => {});
    }
    this.saveMeta();
  }

  // ------------------------------------------------------------- achievements & seasons
  private achCtx(seat: Seat, ended: boolean, rank: number): AchievementCtx { return { joinDay: seat.joinedDay, join: seat.join, lastWarDay: seat.lastWarDay, seasonEnded: ended, finalRank: rank }; }
  private checkAchievements(ended: boolean, only?: string, ranks?: Map<number, number>) {
    for (const seat of Object.values(this.meta.seats)) {
      if (only && seat.uid !== only) continue;
      const have = this.meta.achievements[seat.uid] ?? (this.meta.achievements[seat.uid] = []);
      const fresh = checkAchievements(this.s, this.w, seat.nation, this.achCtx(seat, ended, ranks?.get(seat.nation) ?? 0), have.map((x) => x.key));
      if (!fresh.length) continue;
      for (const k of fresh) have.push({ key: k, day: this.s.day, season: this.meta.season });
      this.store.achievements(seat.uid, fresh, this.meta.id, this.meta.season, seat.key).catch(() => {});
      for (const x of this.sessions) if (x.user.uid === seat.uid) x.send({ type: 'achievements', earned: have, fresh });
    }
  }
  leaderRows(limit = 100): LeaderRow[] {
    const ranked = this.s.nations.filter((n) => n.alive).sort((a, b) => b.score - a.score || a.id - b.id);
    const seatOf = new Map(Object.values(this.meta.seats).map((x) => [x.nation, x]));
    return ranked.map((n, i) => ({ rank: i + 1, nation: n.id, key: n.key, name: n.short, score: Math.round(n.score * 10) / 10, player: seatOf.get(n.id)?.name ?? null }))
      .filter((r) => r.rank <= limit || r.player !== null);
  }
  private finishSeason() {
    const rows = this.leaderRows(100);
    const ranks = new Map(rows.map((r) => [r.nation, r.rank]));
    this.checkAchievements(true, undefined, ranks);
    const seatOf = new Map(Object.values(this.meta.seats).map((x) => [x.nation, x.uid]));
    this.store.leaderboard(this.meta.id, this.meta.season, rows.map((r) => ({ ...r, uid: seatOf.get(r.nation) ?? null }))).catch(() => {});
    this.store.event(this.meta.id, this.meta.season, 'season_end', this.s.day, { winner: rows[0]?.key, top: rows.slice(0, 10) }).catch(() => {});
    this.snapshot(true); this.files.close();
    const ended = this.meta.season;
    this.meta.seasons.push({ season: ended, ended: Date.now(), rows: rows.slice(0, 100) });
    writeFileSync(join(this.root, `season-${ended}`, 'results.json'), JSON.stringify(rows, null, 1));
    this.log(`season ${ended} ended at day ${this.s.day}; winner ${rows[0]?.key}`);
    // new season: fresh map, every seat is free again (nothing carries over except cosmetic achievements)
    this.meta.season++; this.meta.seats = {}; this.meta.startedAt = Date.now(); this.meta.chat = [];
    this.files = new SeasonFiles(this.root, this.meta.season);
    this.newSeasonState();
    this.prevOwner = new Int16Array(this.s.loc.owner); this.prevCtrl = new Int16Array(this.s.loc.ctrl);
    this.lastChron = this.s.chronicle.length; this.lastOwnerChange = 0; this.nationsDirty = true;
    this.saveMeta();
    this.store.upsertWorld(this.worldInfo()).catch(() => {});
    for (const ss of this.sessions) {
      ss.send({ type: 'season', ended, started: this.meta.season, rows: rows.slice(0, 20) });
      ss.lastNotice = this.lastNoticeId();
      ss.send({ type: 'welcome', user: { id: ss.user.uid, name: ss.user.name, admin: ss.user.admin }, world: this.worldInfo(), seat: null, L: this.w.L, S: this.w.S, nations: nationLites(this.s, this.w) });
      ss.send({ type: 'free', nations: this.freeNations() });
      ss.needFull = true; this.sendFullView(ss);
    }
  }

  worldInfo(): WorldInfo {
    const s = this.s, spd = this.meta.secondsPerDay;
    const end = this.seasonEndDay;
    return {
      id: this.meta.id, name: this.meta.name, season: this.meta.season, day: s.day, startYear: s.startYear, secondsPerDay: spd, paused: this.meta.paused,
      nextDayAt: this.meta.paused ? 0 : this.nextDayAt, players: Object.keys(this.meta.seats).length, maxPlayers: this.cfg.maxPlayers, online: new Set([...this.sessions].map((x) => x.user.uid)).size,
      seasonEndDay: end, startedAt: this.meta.startedAt, projectedEnd: Date.now() + Math.max(0, end - s.day) * spd * 1000, dev: this.cfg.devAuth,
    };
  }

  // ------------------------------------------------------------- views
  private sharedView(monthly: boolean) {
    const s = this.s, w = this.w;
    const chron = s.chronicle.slice(this.lastChron); this.lastChron = s.chronicle.length;
    const oc = ((s as any).ownerChanges || []) as { loc: number; order: number }[];
    const changes = oc.length > this.lastOwnerChange ? oc.slice(this.lastOwnerChange).map((c) => ({ loc: c.loc, order: c.order })) : undefined;
    this.lastOwnerChange = oc.length;
    const lp = (s as any).lastPeace;
    return {
      day: s.day, startYear: s.startYear, speed: this.meta.paused ? 0 : 1, ended: s.ended, victory: s.victory,
      ownerChanges: changes && changes.length ? changes : undefined, changeOrigin: lp && lp.day === s.day ? lp.origin : undefined,
      nationUpd: monthly || this.nationsDirty ? this.nationDelta() : undefined, ...this.armyDelta(), wars: warsView(s),
      sieges: s.sieges.map((x) => ({ loc: x.loc, nation: x.nation, progress: x.progress, garrison: x.garrison })),
      battles: s.battles.map((b) => ({ id: b.id, loc: b.loc, att: b.attNation, def: b.defNation, lossA: b.lossA, lossD: b.lossD, startA: b.startA, startD: b.startD, phase: b.phase })),
      chronicle: chron, ranking: s.ranking, msPerDay: this.msPerDay, landmarks: monthly ? landmarksView(s, w) : undefined, trade: monthly ? tradeView(s, w) : undefined,
    };
  }
  private prevNations: Record<string, string>[] = [];
  /** Realm fields that changed since the last time realms went out (descriptions and arms rarely change, dev and score monthly). */
  private nationDelta() {
    const out: (Partial<NationLite> & { id: number })[] = [];
    for (const n of nationLites(this.s, this.w)) {
      const prev = this.prevNations[n.id], cur: Record<string, string> = {}; let ch: any = null;
      for (const k in n) { const j = JSON.stringify((n as any)[k]); cur[k] = j; if (!prev || prev[k] !== j) (ch ??= { id: n.id })[k] = (n as any)[k] ?? null; } // null: JSON would drop a field that became undefined
      this.prevNations[n.id] = cur;
      if (ch) out.push(ch);
    }
    return out.length ? out : undefined;
  }
  private prevArmies = new Map<number, string>();
  /** Armies that changed since the last broadcast (whole lists only go out in full views). */
  private armyDelta() {
    const upd: ArmyLite[] = [], del: number[] = [], seen = new Set<number>();
    for (const a of armyLites(this.s, this.w)) {
      seen.add(a.id); const j = JSON.stringify(a);
      if (this.prevArmies.get(a.id) !== j) { upd.push(a); this.prevArmies.set(a.id, j); }
    }
    for (const id of this.prevArmies.keys()) if (!seen.has(id)) { del.push(id); this.prevArmies.delete(id); }
    return { armyUpd: upd.length ? upd : undefined, armyDel: del.length ? del : undefined };
  }
  private personal(ss: Session, shared: ReturnType<WorldCore['sharedView']> | ReturnType<WorldCore['sharedViewNoAdvance']>): WireTickView {
    const s = this.s; const nat = ss.seat?.nation ?? -1;
    const notices = s.notices.filter((n) => n.id > ss.lastNotice && (n.nation === nat || n.nation === -1));
    ss.lastNotice = this.lastNoticeId();
    return { ...shared, player: nat >= 0 && s.nations[nat] ? playerView(s, s.nations[nat]) : null, notices, pending: nat >= 0 ? pendingView(s, this.w, nat) : [] };
  }
  /** The personal part of a tick as JSON members, to append to the shared part serialized once per day. */
  private personalJson(ss: Session): string {
    const s = this.s; const nat = ss.seat?.nation ?? -1;
    const notices = s.notices.filter((n) => n.id > ss.lastNotice && (n.nation === nat || n.nation === -1));
    ss.lastNotice = this.lastNoticeId();
    return `"player":${JSON.stringify(nat >= 0 && s.nations[nat] ? playerView(s, s.nations[nat]) : null)},"notices":${JSON.stringify(notices)},"pending":${JSON.stringify(nat >= 0 ? pendingView(s, this.w, nat) : [])}`;
  }
  private ownersBin() {
    const N = this.w.N, buf = new Int16Array(N * 2); buf.set(this.s.loc.owner.subarray(0, N), 0); buf.set(this.s.loc.ctrl.subarray(0, N), N);
    return encodeBinary(BIN_OWNERS, buf);
  }
  /** daily: the day's chronicle and owner changes, when the full view replaces that day's tick. */
  private sendFullView(ss: Session, inTick = false, daily?: { chronicle: any; ownerChanges: any; changeOrigin: any }) {
    const shared = { ...this.sharedViewNoAdvance(), ...(daily ?? {}), nations: nationLites(this.s, this.w) };
    ss.sendBin(this.ownersBin()); ss.sendBin(encodeBinary(BIN_SNOW, this.s.loc.snow)); ss.sendBin(encodeBinary(BIN_ROADS, roadLevels(this.s)));
    ss.send({ type: 'tick', view: this.personal(ss, shared as any) });
    // a full view sent between days shows the live state, which the daily deltas' baselines may not hold yet:
    // such a session gets another full view with the next day, when the baselines move to the same state
    ss.needFull = inTick ? false : true; if (!inTick) this.nationsDirty = true;
    this.sendColors(ss);
  }
  private sharedViewNoAdvance() {
    const s = this.s; const lp = (s as any).lastPeace;
    return { day: s.day, startYear: s.startYear, speed: this.meta.paused ? 0 : 1, ended: s.ended, victory: s.victory, ownerChanges: undefined, changeOrigin: lp && lp.day === s.day ? lp.origin : undefined,
      armies: armyLites(s, this.w), wars: warsView(s), sieges: s.sieges.map((x) => ({ loc: x.loc, nation: x.nation, progress: x.progress, garrison: x.garrison })),
      battles: s.battles.map((b) => ({ id: b.id, loc: b.loc, att: b.attNation, def: b.defNation, lossA: b.lossA, lossD: b.lossD, startA: b.startA, startD: b.startD, phase: b.phase })),
      chronicle: [], ranking: s.ranking, msPerDay: this.msPerDay, landmarks: landmarksView(s, this.w), trade: tradeView(s, this.w) };
  }
  private sendColors(ss: Session) {
    if (ss.mapMode === 'political' || ss.mapMode === 'terrain' || ss.mapMode === 'explored') {
      ss.send({ type: 'legend', mode: ss.mapMode, legend: { title: { en: ss.mapMode, de: ss.mapMode }, items: [] } });
      ss.sendBin(encodeBinary(BIN_COLORS, new Uint8Array(this.w.N * 4), MAP_MODE_LIST.indexOf(ss.mapMode)));
      return;
    }
    const { rgba, legend } = mapModeColors(this.s, this.w, ss.mapMode, ss.mapFocus >= 0 ? ss.mapFocus : ss.seat?.nation ?? -1);
    ss.send({ type: 'legend', mode: ss.mapMode, legend });
    ss.sendBin(encodeBinary(BIN_COLORS, rgba, MAP_MODE_LIST.indexOf(ss.mapMode)));
  }
  private broadcastTick() {
    const s = this.s, d = dayToDate(s.day, s.startYear);
    const monthly = d.m !== this.lastMonth; this.lastMonth = d.m;
    const shared = this.sharedView(monthly); this.nationsDirty = false;
    // owner/ctrl: deltas, or the whole arrays (binary) when much changed
    const o = s.loc.owner, c = s.loc.ctrl, N = this.w.N; const delta: number[] = [];
    for (let i = 0; i < N; i++) if (o[i] !== this.prevOwner[i] || c[i] !== this.prevCtrl[i]) { delta.push(i, o[i], c[i]); this.prevOwner[i] = o[i]; this.prevCtrl[i] = c[i]; }
    const big = delta.length > 3 * 1500; const full = big ? this.ownersBin() : null;
    const snow = monthly ? encodeBinary(BIN_SNOW, s.loc.snow) : null;
    const roads = monthly ? encodeBinary(BIN_ROADS, roadLevels(s)) : null;
    const wi = JSON.stringify({ type: 'world', world: this.worldInfo() });
    const head = `{"type":"tick",${!full && delta.length ? `"ownerDelta":${JSON.stringify(delta)},` : ''}"view":${JSON.stringify(shared).slice(0, -1)},`;
    for (const ss of this.sessions) {
      ss.sendJson(wi);
      if (ss.needFull) { this.sendFullView(ss, true, { chronicle: shared.chronicle, ownerChanges: shared.ownerChanges, changeOrigin: shared.changeOrigin }); continue; }
      if (full) ss.sendBin(full);
      if (snow) ss.sendBin(snow);
      if (roads) ss.sendBin(roads);
      ss.sendJson(head + this.personalJson(ss) + '}}');
      if (monthly && ss.mapMode !== 'political' && ss.mapMode !== 'terrain') this.sendColors(ss);
    }
    if (monthly) this.sendOffers();
  }
  /** Players currently holding seats (for tests and the admin console). */
  seats() { return Object.values(this.meta.seats).map((x) => ({ ...x, online: [...this.sessions].some((ss) => ss.user.uid === x.uid) })); }
  hash() { return hashState(this.s); }
  version() { return PROTOCOL_VERSION; }
}

function cleanText(t: string, max: number) { return t.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
/** Typed arrays inside query replies are sent as plain arrays (JSON). */
function stripTyped(v: any): any {
  if (v === null || typeof v !== 'object') return v;
  if (ArrayBuffer.isView(v)) return Array.from(v as any);
  if (Array.isArray(v)) return v.map(stripTyped);
  const o: any = {}; for (const k in v) o[k] = stripTyped(v[k]); return o;
}
