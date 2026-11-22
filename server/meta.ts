// The world's own file meta.json: its name, seed and start, whether it is paused, the seats of the players, and the
// marks of its copy in the store (server/backup.ts). Written whole on every change, so that a crash leaves the old
// file or the new one (writeFileDurable, server/files.ts).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BackupMarks } from './backup';
import type { WorldConfig } from './config';
import { writeFileDurable } from './files';

/** a player and the realm the player rules */
export interface Seat {
  uid: string;
  name: string;
  realm: number;
  joinedAt: number;
  lastSeen: number;
}
export interface Meta extends BackupMarks {
  id: string;
  name: string;
  seed: number;
  startedAt: number;
  paused: boolean;
  seats: Record<string, Seat>;
}

/** meta.json of the world in root, or that of a new world from its settings when there is none yet */
export function readMeta(root: string, cfg: WorldConfig): Meta {
  const path = join(root, 'meta.json');
  return existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8'))
    : { id: cfg.id, name: cfg.name, seed: cfg.seed, startedAt: Date.now(), paused: false, seats: {} };
}

export function writeMeta(root: string, meta: Meta) {
  writeFileDurable(join(root, 'meta.json'), JSON.stringify(meta));
}
