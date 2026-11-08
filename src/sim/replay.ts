// Replays a single-player game from its command log: same setup, same seed, the same commands on the same days.
import type { GameState, ReplayLog } from './types';
import type { World } from './world';
import { createGame } from './setup';
import { advanceDay } from './engine';
import { applyCommand } from './commands';

/** Start a new game that records its commands (the worker does this for every new single-player game). */
export function startRecorded(w: World, setup: any, hubs: any, header: Omit<ReplayLog, 'log'>): GameState {
  const s = createGame(w, setup, hubs, header.seed, { player: header.player !== null ? [header.player] : [] });
  if (header.devtools) s.flags.devtools = 1;
  if (header.difficulty !== undefined) s.difficulty = header.difficulty;
  if (header.player !== null) s.flags.peaceful_start = 30;
  s.replay = { ...header, log: [] };
  return s;
}

/** Apply a command (or a change of the played realm) and record it. */
export function recordCommand(s: GameState, w: World, cmd: ReplayLog['log'][number][1]) {
  s.replay?.log.push([s.day, JSON.parse(JSON.stringify(cmd))]);
  if (cmd.t === '__player') { s.playerNations = cmd.player !== null ? [cmd.player] : []; return { ok: true }; }
  return applyCommand(s, w, cmd);
}

/** Rebuild a game from its log up to `untilDay` (default: the last logged day). */
export function replayGame(w: World, setup: any, hubs: any, r: ReplayLog, untilDay?: number): GameState {
  const s = startRecorded(w, setup, hubs, r);
  const end = untilDay ?? (r.log.length ? r.log[r.log.length - 1][0] : 0);
  let k = 0;
  for (;;) {
    while (k < r.log.length && r.log[k][0] === s.day) recordCommand(s, w, r.log[k++][1]);
    if (s.day >= end || s.ended) break;
    advanceDay(s, w);
  }
  return s;
}
