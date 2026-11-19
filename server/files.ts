// The world on disk: the snapshots and the command log after each (docs/DEPLOY.md, "World data"), written so that a
// crash or a power loss never leaves half a file.
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, zstdCompressSync, zstdDecompressSync, constants as zlibConstants } from 'node:zlib';
import { decodeState, encodeState, hashBytes } from '../src/sim/snapshot';
import type { WorldState } from '../src/sim/state';
import { type LogLine, parseLog } from './log';

/** Writes a file so that a crash or a power loss leaves either the old or the new one, whole: the bytes go to a
 *  temporary file, are forced onto the disk, and the temporary file takes the place of the old one. */
export function writeFileDurable(file: string, data: Uint8Array | string) {
  const fd = openSync(`${file}.tmp`, 'w');
  try {
    writeSync(fd, typeof data === 'string' ? Buffer.from(data) : data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(`${file}.tmp`, file);
}

/**
 * A snapshot as it goes to disk and to the store: zstd at its fastest level. The state of 1291 is ~80 MB; gzip took
 * 1.6 s for it (41 MB), zstd takes 0.15 s (28 MB), which matters when the clock runs fast and a snapshot falls every
 * few seconds. Snapshots written by gzip before (on disk or in the store) are still read: unpackSnapshot tells them by
 * their first bytes.
 */
export function packSnapshot(raw: Uint8Array): Uint8Array {
  return zstdCompressSync(raw, { params: { [zlibConstants.ZSTD_c_compressionLevel]: 1 } });
}
export function unpackSnapshot(b: Uint8Array): Uint8Array {
  if (b[0] === 0x1f && b[1] === 0x8b) return gunzipSync(b);
  if (b[0] === 0x28 && b[1] === 0xb5 && b[2] === 0x2f && b[3] === 0xfd) return zstdDecompressSync(b);
  return b;
}

/** Snapshots (zstd) and log segments: log-<day>.ndjson holds everything after the snapshot of that day. The genesis
 *  snapshot and the three most recent ones stay; the log segments all stay (a few bytes a day), so the world can be
 *  replayed from day 0. */
export class WorldFiles {
  private fd = -1;
  constructor(readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }
  latest(): { day: number; hash: string } | null {
    try {
      return JSON.parse(readFileSync(join(this.dir, 'snapshot.json'), 'utf8'));
    } catch {
      return null;
    }
  }
  snapshots(): number[] {
    return readdirSync(this.dir)
      .map((f) => /^snap-(\d+)\.bin$/.exec(f))
      .filter(Boolean)
      .map((m) => Number(m![1]))
      .sort((a, b) => a - b);
  }
  segments(): number[] {
    return readdirSync(this.dir)
      .map((f) => /^log-(\d+)\.ndjson$/.exec(f))
      .filter(Boolean)
      .map((m) => Number(m![1]))
      .sort((a, b) => a - b);
  }
  writeSnapshot(s: WorldState): { day: number; hash: string; bin: Uint8Array } {
    const raw = encodeState(s),
      bin = packSnapshot(raw),
      day = s.day,
      hash = hashBytes(raw);
    this.putSnapshot(day, hash, bin);
    return { day, hash, bin };
  }
  /** Puts the bytes of a snapshot (packSnapshot) on disk as the latest one and opens the log segment after it. */
  putSnapshot(day: number, hash: string, bin: Uint8Array) {
    writeFileDurable(join(this.dir, `snap-${day}.bin`), bin);
    writeFileDurable(join(this.dir, 'snapshot.json'), JSON.stringify({ day, hash }));
    // keep the genesis snapshot and the three most recent ones
    const snaps = this.snapshots().filter((d) => d !== 0);
    for (const d of snaps.slice(0, Math.max(0, snaps.length - 3))) {
      try {
        unlinkSync(join(this.dir, `snap-${d}.bin`));
      } catch {
        /* gone */
      }
    }
    this.openSegment(day);
  }
  readSnapshot(day: number): WorldState {
    return decodeState(unpackSnapshot(readFileSync(join(this.dir, `snap-${day}.bin`))));
  }
  readLines(fromDay: number): LogLine[] {
    const out: LogLine[] = [];
    for (const seg of this.segments())
      if (seg >= fromDay) out.push(...parseLog(readFileSync(join(this.dir, `log-${seg}.ndjson`), 'utf8')));
    return out;
  }
  segmentText(day: number): string {
    try {
      return readFileSync(join(this.dir, `log-${day}.ndjson`), 'utf8');
    } catch {
      return '';
    }
  }
  openSegment(day: number) {
    if (this.fd >= 0) closeSync(this.fd);
    this.fd = openSync(join(this.dir, `log-${day}.ndjson`), 'a');
  }
  append(line: LogLine) {
    if (this.fd < 0) throw new Error('log not open');
    writeSync(this.fd, `${JSON.stringify(line)}\n`);
  }
  /** Forces what was appended onto the disk (once a day, after the day marker). */
  sync() {
    if (this.fd >= 0) fsyncSync(this.fd);
  }
  close() {
    if (this.fd >= 0) closeSync(this.fd);
    this.fd = -1;
  }
}
