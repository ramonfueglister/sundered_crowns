// The deterministic layer of the world server. Every change to the state goes through a log entry, appended to the
// command log in the order it was applied and interleaved with day markers; a snapshot plus the log after it
// reproduces the state exactly (WorldCore.verifyReplay, server/world.ts). Real-time facts (a player left long ago)
// become log entries before they touch the state.
import { applyCommand, type CmdResult, type Command } from '../src/sim/commands';
import { advanceDay } from '../src/sim/engine';
import type { WorldState } from '../src/sim/state';
import type { World } from '../src/sim/world';

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
    if ('adv' in l) {
      if (l.d !== s.day) throw new Error(`replay out of step: log day ${l.d}, state day ${s.day}`);
      advanceDay(s, w);
    } else applyEntry(s, w, l.e);
  }
  return s;
}
export function parseLog(text: string): LogLine[] {
  const out: LogLine[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      break; /* torn last line after a crash */
    }
  }
  return out;
}
