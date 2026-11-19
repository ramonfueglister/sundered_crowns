// World server core: one authoritative, persistent world that runs without end. No sockets here (server/main.ts is
// the transport), so tests can drive it in-process. Its parts: the log entries and their replay (log.ts), the files
// on disk (files.ts), the copy in the store (backup.ts), the settings (config.ts) and the connections (session.ts).
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorldState } from '../src/sim/state';
import type { World } from '../src/sim/world';
import type { CmdResult, Command } from '../src/sim/commands';
import { advanceDay } from '../src/sim/engine';
import { hashState } from '../src/sim/snapshot';
import { createWorldState } from '../src/sim/setup';
import { upgradeState } from '../src/sim/upgrade';
import { loadWorldFor, loadSetup } from '../tools/sim/load';
import { realmInfos, placeDetail } from '../src/net/views';
import { encodeOwners, SPEEDS, type ClientMsg, type WorldInfo, type Me } from '../src/net/protocol';
import type { WorldConfig } from './config';
import { type BackupMarks, restoreFromStore, StoreBackup } from './backup';
import { WorldFiles, writeFileDurable } from './files';
import { applyEntry, type LogEntry, replayLines } from './log';
import { type Conn, Session, type UserAuth } from './session';
import { NullStore, type WorldStore } from './store';
import { BorderHistory } from './history';
import { type ArchivedPersons, indexIn, takeArchived, yearsWith } from '../src/sim/people/archive';

/** at the highest speed, the days of one beat of the clock take this much real time at most before what changed goes out */
const BATCH_MS = 100;
/** smoothed real time of the parts of a day */
const ema = (a: number, b: number) => a * 0.9 + b * 0.1;

interface Seat {
  uid: string;
  name: string;
  realm: number;
  joinedAt: number;
  lastSeen: number;
}
interface Meta extends BackupMarks {
  id: string;
  name: string;
  seed: number;
  startedAt: number;
  paused: boolean;
  seats: Record<string, Seat>;
}
interface Queued {
  e: LogEntry;
  session: Session | null;
  id: number;
}

class Bucket {
  t: number;
  last = Date.now();
  constructor(
    private cap: number,
    private perSec: number,
  ) {
    this.t = cap;
  }
  take(): boolean {
    const now = Date.now();
    this.t = Math.min(this.cap, this.t + ((now - this.last) / 1000) * this.perSec);
    this.last = now;
    if (this.t < 1) return false;
    this.t -= 1;
    return true;
  }
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
  /** the copy of the world in the store */
  private readonly backup: StoreBackup;
  /** the years of the archive of the dead read from the disk lately (a browser that opens the ancestors asks often) */
  private deadYears = new Map<number, ArchivedPersons>();
  private log: (m: string) => void;
  /** the history of the borders (server/history.ts), for the replay */
  history!: BorderHistory;
  /** the speed of the clock, 1 … SPEEDS.length (not kept over a restart: the world comes back at its own pace) */
  speed = 1;
  /** real time the last beat of the clock took (ms), taken off the wait for the next */
  private beatMs = 0;
  /** smoothed real time of each part of a day (ms), for /health */
  stepMs = { cmds: 0, day: 0, persist: 0, broadcast: 0 };

  constructor(cfg: WorldConfig, store: WorldStore = new NullStore()) {
    this.cfg = cfg;
    this.store = store;
    this.log = cfg.log ?? ((m) => console.log(`[world ${cfg.id}] ${m}`));
    this.backup = new StoreBackup({
      id: cfg.id,
      root: this.root,
      store,
      files: () => this.files,
      meta: () => this.meta,
      saveMeta: () => this.saveMeta(),
      state: () => ({ s: this.s, w: this.w }),
    });
  }
  get root() {
    return join(this.cfg.dataDir, this.cfg.id);
  }

  /** When the disk holds no world and the store holds a copy of it, puts that copy on the disk, so that init() resumes
   *  it (restoreFromStore, server/backup.ts). Throws when the store cannot be read. */
  restoreIfEmpty(): Promise<boolean> {
    return restoreFromStore(this.store, this.cfg.id, this.root, this.log);
  }

  /** Creates the world, or resumes it from its latest snapshot and the log after it. */
  init(): this {
    this.w = loadWorldFor(this.cfg.startYear);
    mkdirSync(this.root, { recursive: true });
    const metaPath = join(this.root, 'meta.json');
    this.meta = existsSync(metaPath)
      ? JSON.parse(readFileSync(metaPath, 'utf8'))
      : { id: this.cfg.id, name: this.cfg.name, seed: this.cfg.seed, startedAt: Date.now(), paused: false, seats: {} };
    this.files = new WorldFiles(join(this.root, 'world'));
    const latest = this.files.latest();
    if (!latest) {
      this.s = createWorldState(this.w, loadSetup(this.cfg.startYear), this.meta.seed);
      this.files.writeSnapshot(this.s);
      this.log(`created at day 0, hash ${hashState(this.s)}`);
    } else {
      this.s = upgradeState(this.files.readSnapshot(latest.day), this.w, () => loadSetup(this.cfg.startYear));
      const lines = this.files.readLines(latest.day);
      replayLines(this.s, this.w, lines);
      this.keepArchived();
      this.files.openSegment(latest.day);
      this.log(
        `resumed at day ${this.s.day} (snapshot ${latest.day} + ${lines.length} log lines), hash ${hashState(this.s)}`,
      );
    }
    // seats and state agree (a crash between the two writes)
    for (const seat of Object.values(this.meta.seats))
      if (this.s.ruler[seat.realm] !== seat.uid) delete this.meta.seats[seat.uid];
    this.prevOwner = this.s.place.owner.slice();
    this.history = new BorderHistory(join(this.root, 'borders.ndjson'), this.s, this.w, () =>
      this.files.snapshots().includes(0)
        ? upgradeState(this.files.readSnapshot(0), this.w, () => loadSetup(this.cfg.startYear))
        : null,
    );
    // a world the store has no copy of yet sends its latest snapshot right away
    const now = this.files.latest()!;
    if (this.store.enabled && this.meta.uploaded === undefined)
      this.backup.sendSnapshot(now.day, readFileSync(join(this.files.dir, `snap-${now.day}.bin`)));
    this.saveMeta();
    const info = this.worldInfo();
    this.backup.queue(() => this.store.upsertWorld(info)); // the row the copy of the rulers points at comes first
    if (this.store.enabled) {
      this.backup.startRulerCopy();
      this.backup.sendArchive();
    }
    return this;
  }
  /** Puts the years that went to the archive of the dead on this day (or in a replay) on the disk, before anything
   *  else is written: a snapshot after the first of January no longer holds them. */
  private keepArchived() {
    let any = false;
    for (const a of takeArchived(this.s)) {
      this.files.putArchived(a);
      this.deadYears.set(a.day, a);
      any = true;
    }
    if (any) {
      this.trimDeadYears();
      this.backup.sendArchive();
    }
  }
  private trimDeadYears() {
    while (this.deadYears.size > 8) this.deadYears.delete(this.deadYears.keys().next().value!);
  }
  /** A dead person of the archive (GET /person/<uid>): the year that holds the person, and the place there; null where
   *  the archive has no such person. */
  archived(uid: number): { year: ArchivedPersons; k: number } | null {
    for (const y of yearsWith(this.s, uid)) {
      let a = this.deadYears.get(y.day) ?? null;
      if (!a) {
        try {
          a = this.files.readArchived(y.day);
        } catch (e) {
          this.log(`the year of the archive of day ${y.day} cannot be read: ${(e as Error).message}`);
        }
      }
      if (!a) continue;
      this.deadYears.delete(y.day);
      this.deadYears.set(y.day, a);
      this.trimDeadYears();
      const k = indexIn(a, uid);
      if (k >= 0) return { year: a, k };
    }
    return null;
  }
  private saveMeta() {
    writeFileDurable(join(this.root, 'meta.json'), JSON.stringify(this.meta));
  }
  /** Resolves when every upload to the store queued so far has ended. */
  flushUploads(): Promise<void> {
    return this.backup.flush();
  }
  /** Applies an entry and logs it (only accepted entries change the state, but every one is logged in order). */
  private apply(e: LogEntry): CmdResult {
    const r = applyEntry(this.s, this.w, e);
    if (r.ok) this.files.append({ d: this.s.day, e });
    return r;
  }

  start() {
    this.running = true;
    this.schedule();
  }
  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  shutdown() {
    this.stop();
    this.files.writeSnapshot(this.s);
    this.saveMeta();
    this.files.close();
    this.history.close();
  }
  /** real milliseconds per day at the clock's speed (0: as fast as the days can be reckoned) */
  msPerDay(): number {
    const v = SPEEDS[this.speed - 1];
    return v === 'own' ? this.cfg.secondsPerDay * 1000 : v;
  }
  private schedule() {
    if (!this.running) return;
    this.timer = setTimeout(() => this.beat(), Math.max(0, this.msPerDay() - this.beatMs));
  }
  /** One beat of the clock: a day, or at the highest speed as many days as fit in BATCH_MS; what changed goes out once. */
  private beat() {
    const t0 = performance.now();
    try {
      if (!this.meta.paused) {
        const fast = this.msPerDay() === 0;
        do this.runDay();
        while (fast && !this.meta.paused && performance.now() - t0 < BATCH_MS);
        this.broadcastDay();
      }
    } catch (e) {
      this.log(`step failed: ${(e as Error | undefined)?.stack ?? e}`);
    }
    this.beatMs = this.meta.paused ? 0 : performance.now() - t0;
    this.schedule();
  }

  /** Pauses or runs the world, or sets the speed of its clock; everyone is told. */
  setTime(t: { paused?: boolean; speed?: number }) {
    let changed = false;
    if (typeof t.paused === 'boolean' && t.paused !== this.meta.paused) {
      this.meta.paused = t.paused;
      this.saveMeta();
      changed = true;
    }
    if (Number.isInteger(t.speed) && t.speed! >= 1 && t.speed! <= SPEEDS.length && t.speed !== this.speed) {
      this.speed = t.speed!;
      changed = true;
    }
    if (!changed) return;
    // the wait for the next day is that of the new speed, from now (at its own pace the world would wait minutes)
    if (this.running) {
      if (this.timer) clearTimeout(this.timer);
      this.beatMs = 0;
      this.schedule();
    }
    const world = this.worldInfo();
    for (const ss of this.sessions) ss.send({ type: 'world', world });
    this.log(`clock: ${this.meta.paused ? 'paused' : 'running'}, speed ${this.speed}`);
  }

  /** One in-game day, and what changed goes out. */
  step() {
    this.runDay();
    this.broadcastDay();
  }

  /** One in-game day: queued entries, the day, persistence. */
  private runDay() {
    const t0 = performance.now();
    this.releaseInactive();
    const q = this.queue;
    this.queue = [];
    for (const x of q) {
      const r = this.apply(x.e);
      if (x.session && x.e.k === 'cmd') x.session.send({ type: 'result', id: x.id, ok: r.ok, err: r.err });
      if (x.e.k !== 'cmd' && r.ok) this.rulersChanged();
    }
    const t1 = performance.now();
    this.files.append({ d: this.s.day, adv: 1 });
    this.files.sync();
    advanceDay(this.s, this.w);
    this.keepArchived();
    const t2 = performance.now();
    this.history.record(this.s);
    if (this.s.day % this.cfg.snapshotEveryDays === 0) this.snapshot();
    else if (this.store.enabled && this.s.day % this.cfg.logUploadEveryDays === 0) this.backup.sendLog();
    this.backup.sendRulers();
    const t3 = performance.now();
    this.stepMs = {
      ...this.stepMs,
      cmds: ema(this.stepMs.cmds, t1 - t0),
      day: ema(this.stepMs.day, t2 - t1),
      persist: ema(this.stepMs.persist, t3 - t2),
    };
  }

  snapshot(forceUpload = false) {
    const { day, bin } = this.files.writeSnapshot(this.s);
    if (this.store.enabled) {
      if (forceUpload || this.backup.snapshotDue(day, this.cfg)) {
        this.backup.sendSnapshot(day, bin);
        this.store.upsertWorld(this.worldInfo()).catch(() => {});
      } else this.backup.sendLog();
      this.backup.sendArchive();
    }
    this.saveMeta();
  }

  /** Replays the log from a snapshot on disk and compares with the live state. */
  verifyReplay(fromDay?: number): { hash: string; live: string; from: number; lines: number } {
    const from = fromDay ?? this.files.snapshots()[0] ?? 0;
    const s = upgradeState(this.files.readSnapshot(from), this.w, () => loadSetup(this.cfg.startYear));
    const lines = this.files.readLines(from);
    replayLines(s, this.w, lines);
    return { hash: hashState(s), live: hashState(this.s), from, lines: lines.length };
  }

  // ------------------------------------------------------------- players
  seats(): Seat[] {
    return Object.values(this.meta.seats);
  }
  private rulerName = (uid: string) => this.meta.seats[uid]?.name ?? null;
  private me(ss: Session): Me {
    return {
      uid: ss.user.uid,
      name: ss.user.name,
      admin: ss.user.admin,
      realm: this.meta.seats[ss.user.uid]?.realm ?? -1,
      ...(ss.user.observer ? { observer: true } : {}),
      ...(this.mayTime(ss) ? { time: true } : {}),
    };
  }
  /** who may pause the world and change its speed: admins; everyone in a DEV world (for debugging) or with TIME_CONTROL=all */
  private mayTime(ss: Session) {
    return ss.user.admin || this.cfg.devAuth || this.cfg.timeControl === 'all';
  }
  worldInfo(): WorldInfo {
    return {
      id: this.cfg.id,
      name: this.meta.name,
      day: this.s.day,
      startYear: this.s.startYear,
      secondsPerDay: this.cfg.secondsPerDay,
      paused: this.meta.paused,
      players: this.seats().length,
      maxPlayers: this.cfg.maxPlayers,
      speed: this.speed,
    };
  }

  attach(conn: Conn, user: UserAuth): Session {
    const ss = new Session(this, conn, {
      ...user,
      admin: user.admin || this.cfg.admins.includes(user.uid) || this.cfg.admins.includes(user.name),
    });
    this.sessions.add(ss);
    const seat = this.meta.seats[user.uid];
    if (seat) {
      seat.lastSeen = Date.now();
      seat.name = user.name;
    }
    ss.send({ type: 'welcome', me: this.me(ss), world: this.worldInfo(), realms: realmInfos(this.s, this.rulerName) });
    ss.sendBin(encodeOwners(this.s.place.owner));
    return ss;
  }
  detach(ss: Session) {
    this.sessions.delete(ss);
    const seat = this.meta.seats[ss.user.uid];
    if (seat) seat.lastSeen = Date.now();
  }
  private online(uid: string) {
    for (const ss of this.sessions) if (ss.user.uid === uid) return true;
    return false;
  }

  handle(ss: Session, m: ClientMsg) {
    switch (m?.type) {
      case 'claim':
        return this.claim(ss, m.realm);
      case 'abdicate': {
        const seat = this.meta.seats[ss.user.uid];
        if (!seat) return;
        this.queue.push({ e: { k: 'release', realm: seat.realm }, session: ss, id: 0 });
        delete this.meta.seats[ss.user.uid];
        this.saveMeta();
        this.store.removeSeat(this.cfg.id, ss.user.uid).catch(() => {});
        ss.send({ type: 'me', me: this.me(ss) });
        return;
      }
      case 'cmd': {
        const seat = this.meta.seats[ss.user.uid];
        const id = Number(m.id) || 0;
        if (!seat || ss.user.observer) return ss.send({ type: 'result', id, ok: false, err: 'you rule no realm' });
        let b = this.buckets.get(ss.user.uid);
        if (!b) {
          b = new Bucket(this.cfg.cmdsPerDay, this.cfg.cmdsPerDay / Math.max(0.05, this.cfg.secondsPerDay));
          this.buckets.set(ss.user.uid, b);
        }
        if (!b.take()) return ss.send({ type: 'result', id, ok: false, err: 'too many orders, wait a moment' });
        const cmd = { ...(m.cmd ?? {}), realm: seat.realm } as Command;
        this.queue.push({ e: { k: 'cmd', uid: ss.user.uid, cmd }, session: ss, id });
        return;
      }
      case 'place': {
        const d = placeDetail(this.s, this.w, m.place);
        if (d) ss.send({ type: 'place', detail: d });
        return;
      }
      case 'time': {
        if (!this.mayTime(ss))
          return ss.send({ type: 'error', code: 'time', message: 'Only an admin may change the time.' });
        return this.setTime({ paused: m.paused, speed: m.speed });
      }
    }
  }

  private claim(ss: Session, realm: number) {
    const uid = ss.user.uid;
    if (ss.user.observer) return ss.send({ type: 'error', code: 'claim', message: 'Sign in to rule a realm.' });
    if (this.meta.seats[uid]) return ss.send({ type: 'error', code: 'claim', message: 'You already rule a realm.' });
    if (this.seats().length >= this.cfg.maxPlayers)
      return ss.send({ type: 'error', code: 'claim', message: 'This world is full.' });
    if (this.queue.some((q) => q.e.k === 'claim' && (q.e.realm === realm || q.e.uid === uid)))
      return ss.send({ type: 'error', code: 'claim', message: 'Someone is taking this realm just now.' });
    // checked now and applied at once (a seat must not wait for the next day), logged like any entry
    const r = this.apply({ k: 'claim', uid, realm });
    if (!r.ok) return ss.send({ type: 'error', code: 'claim', message: r.err ?? 'not possible' });
    const now = Date.now();
    this.meta.seats[uid] = { uid, name: ss.user.name, realm, joinedAt: now, lastSeen: now };
    this.saveMeta();
    this.store
      .upsertSeat(this.cfg.id, {
        uid,
        name: ss.user.name,
        key: this.s.realmText[realm].key,
        joinedAt: now,
        lastSeen: now,
      })
      .catch(() => {});
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
    const realms = realmInfos(this.s, this.rulerName),
      world = this.worldInfo();
    for (const ss of this.sessions) {
      ss.send({ type: 'realms', realms });
      ss.send({ type: 'world', world });
    }
  }

  private broadcastDay() {
    const t0 = performance.now();
    const changes: [number, number][] = [];
    const o = this.s.place.owner;
    for (let i = 0; i < o.length; i++)
      if (o[i] !== this.prevOwner[i]) {
        changes.push([i, o[i]]);
        this.prevOwner[i] = o[i];
      }
    // the borders moved (src/sim/systems/borders.ts): the realms first, a realm may have come in and the counts changed
    if (changes.length) this.rulersChanged();
    for (const ss of this.sessions) {
      ss.send({ type: 'tick', day: this.s.day });
      if (changes.length) ss.send({ type: 'owners', changes });
    }
    this.stepMs.broadcast = ema(this.stepMs.broadcast, performance.now() - t0);
  }

  /** Enqueues an entry as the world itself (tests, admin tools). */
  enqueue(e: LogEntry) {
    this.queue.push({ e, session: null, id: 0 });
  }
}
