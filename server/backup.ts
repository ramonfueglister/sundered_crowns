// The copy of the world in the store (server/store.ts: Supabase Storage and tables), so that a lost disk loses
// nothing: the latest snapshot with the log after it, the years of the archive of the dead, and a readable copy of the
// rulers. The uploads go one after the other and never stop the world; restoreFromStore puts the copy back on an empty
// disk.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { decodeState, hashState } from '../src/sim/snapshot';
import type { WorldState } from '../src/sim/state';
import type { World } from '../src/sim/world';
import type { WorldConfig } from './config';
import { unpackSnapshot, WorldFiles, writeFileDurable } from './files';
import { parseLog } from './log';
import { RulerCopy } from './rulers_copy';
import type { WorldStore } from './store';

/** What the world's meta.json says about the copy: how far the store has it. */
export interface BackupMarks {
  /** the day of the last snapshot sent to the store (Supabase Storage); absent while none was */
  uploaded?: number;
  /** the years of the archive of the dead that arrived in the store (their days) */
  archiveSent?: number[];
}

/** When the disk holds no world (a new or a lost volume) and the store holds a copy of it, puts that copy on the disk
 *  under `root`, so that the world resumes it instead of founding a new world that would then overwrite the copy.
 *  Throws when the store cannot be read: better no world server than a new world over the old one. */
export async function restoreFromStore(
  store: WorldStore,
  id: string,
  root: string,
  log: (m: string) => void,
): Promise<boolean> {
  if (!store.enabled) return false;
  const files = new WorldFiles(join(root, 'world'));
  if (files.latest()) {
    files.close();
    return false;
  }
  const b = await store.downloadBackup(id);
  if (!b) return false;
  const s = decodeState(unpackSnapshot(b.bin)),
    day = s.day,
    hash = hashState(s);
  // the years of the archive of the dead the snapshot names (the log after it makes the later ones again)
  for (const y of s.archive ?? []) {
    const bin = await store.downloadArchived(id, y.day);
    if (bin) files.putArchivedBytes(y.day, bin);
    else log(`the year of the archive of day ${y.day} is not in the store`);
  }
  // the log lines after the snapshot, if they follow it without a gap
  const lines = parseLog(b.log).filter((l) => l.d >= day);
  const usable = lines.length > 0 && lines[0].d === day;
  files.putSnapshot(day, hash, b.bin);
  if (usable) for (const l of lines) files.append(l);
  files.sync();
  files.close();
  if (b.history && !existsSync(join(root, 'borders.ndjson')))
    writeFileDurable(join(root, 'borders.ndjson'), gunzipSync(b.history));
  if (b.meta && !existsSync(join(root, 'meta.json'))) {
    const meta: BackupMarks = JSON.parse(b.meta);
    meta.uploaded = day;
    writeFileDurable(join(root, 'meta.json'), JSON.stringify(meta));
  }
  log(
    `restored from the store: snapshot of day ${day} + ${usable ? lines.length : 0} log lines${lines.length && !usable ? ' (log does not follow the snapshot, left out)' : ''}`,
  );
  return true;
}

/** The world a copy is taken of. Its files, meta and state are read when an upload is made: the world sets them up in
 *  its init(), after the copy is made. */
interface BackupSource {
  readonly id: string;
  /** the world's folder: borders.ndjson lies in it */
  readonly root: string;
  readonly store: WorldStore;
  files(): WorldFiles;
  /** the whole meta.json of the world, which goes with each snapshot */
  meta(): BackupMarks;
  saveMeta(): void;
  state(): { s: WorldState; w: World };
}

/** Sends the world to the store, one upload after the other. */
export class StoreBackup {
  /** the uploads to the store, one after the other (a log never overtakes the snapshot it follows) */
  private uploads: Promise<void> = Promise.resolve();
  /** what is queued or on its way; a kind already on its way is not queued again (the next one sends what this one
   *  would have, so nothing is lost when the clock runs faster than the uploads) */
  private pending = { snapshot: false, log: false, rulers: false, archive: false };
  private lastSnapshotUpload = -Infinity;
  /** the readable copy of the rulers in Supabase (null until startRulerCopy, and without a store) */
  private rulerCopy: RulerCopy | null = null;

  constructor(private readonly src: BackupSource) {}

  /** Queues an upload behind the ones before it; a failed upload is logged by the store and does not stop the world. */
  queue(f: () => Promise<unknown>) {
    this.uploads = this.uploads.then(f).then(
      () => {},
      () => {},
    );
  }
  /** Resolves when every upload queued so far has ended. */
  flush(): Promise<void> {
    return this.uploads;
  }

  /** Whether the snapshot of `day` goes to the store: the first one, then one every `uploadEveryDays` days, but never
   *  sooner than `uploadMinMinutes` of real time after the one before. */
  snapshotDue(day: number, cfg: Pick<WorldConfig, 'uploadEveryDays' | 'uploadMinMinutes'>): boolean {
    const uploaded = this.src.meta().uploaded;
    return (
      uploaded === undefined ||
      (day - uploaded >= cfg.uploadEveryDays && Date.now() - this.lastSnapshotUpload >= cfg.uploadMinMinutes * 60_000)
    );
  }
  sendSnapshot(day: number, bin: Uint8Array) {
    if (this.pending.snapshot) return;
    this.pending.snapshot = true;
    this.lastSnapshotUpload = Date.now();
    const meta = JSON.stringify({ ...this.src.meta(), uploaded: day });
    const historyFile = join(this.src.root, 'borders.ndjson');
    const history = existsSync(historyFile) ? gzipSync(readFileSync(historyFile)) : null;
    this.queue(async () => {
      // only a snapshot that arrived whole counts: until then the log goes on from the one before
      try {
        if (await this.src.store.uploadSnapshot(this.src.id, day, bin, meta, history)) {
          this.src.meta().uploaded = day;
          this.src.saveMeta();
        }
      } finally {
        this.pending.snapshot = false;
      }
    });
  }
  /** Sends the log since the last snapshot sent: with it and that snapshot the store can rebuild today's world. */
  sendLog() {
    if (this.pending.log || this.src.meta().uploaded === undefined) return;
    this.pending.log = true;
    this.queue(async () => {
      try {
        // read when its turn comes: behind a snapshot that just arrived, the log starts at that snapshot
        const from = this.src.meta().uploaded!;
        const files = this.src.files();
        const text = files
          .segments()
          .filter((d) => d >= from)
          .map((d) => files.segmentText(d))
          .join('');
        if (text) await this.src.store.uploadLog(this.src.id, text);
      } finally {
        this.pending.log = false;
      }
    });
  }
  /** Starts the readable copy of the rulers (server/rulers_copy.ts) and sends what it does not have yet. */
  startRulerCopy() {
    this.rulerCopy = new RulerCopy(this.src.id);
    this.sendRulers();
  }
  /** Sends the rows of the readable copy of the rulers that changed. */
  sendRulers() {
    if (!this.rulerCopy || this.pending.rulers) return;
    const { s, w } = this.src.state();
    const ch = this.rulerCopy.changes(s, w);
    if (!ch.persons.length && !ch.reigns.length) return;
    this.pending.rulers = true;
    this.queue(async () => {
      try {
        if (await this.src.store.upsertRulers(ch.persons, ch.reigns)) this.rulerCopy!.sentOk(ch.keys);
      } finally {
        this.pending.rulers = false;
      }
    });
  }
  /** Sends the years of the archive of the dead that the store does not have yet (each once; one that did not arrive
   *  goes with the next). */
  sendArchive() {
    if (!this.src.store.enabled || this.pending.archive) return;
    const sent = new Set(this.src.meta().archiveSent ?? []),
      files = this.src.files(),
      due = this.src
        .state()
        .s.archive.map((y) => y.day)
        .filter((d) => !sent.has(d) && files.hasArchived(d));
    if (!due.length) return;
    this.pending.archive = true;
    this.queue(async () => {
      try {
        for (const d of due) {
          const bin = this.src.files().archivedBytes(d);
          if (!bin || !(await this.src.store.uploadArchived(this.src.id, d, bin))) break;
          const meta = this.src.meta();
          meta.archiveSent = [...(meta.archiveSent ?? []), d];
          this.src.saveMeta();
        }
      } finally {
        this.pending.archive = false;
      }
    });
  }
}
