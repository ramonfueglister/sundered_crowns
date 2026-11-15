// Commands are the only way a player (or the AI of a realm without one) changes the world. Each kind has a check that
// says why it cannot be done (null: it can) and an effect. The world server logs every accepted command, so replaying
// the log on a snapshot reproduces the world exactly.
import type { WorldState } from './state';
import type { World } from './world';

export interface Command { t: string; realm: number; [k: string]: unknown }
export interface CmdResult { ok: boolean; err?: string }

export interface CommandDef<C extends Command = Command> {
  check(s: WorldState, w: World, c: C): string | null;
  apply(s: WorldState, w: World, c: C): void;
}

/** The commands of the game by kind (filled as systems are built). */
export const COMMANDS: Record<string, CommandDef<any>> = {};

export function applyCommand(s: WorldState, w: World, c: Command): CmdResult {
  const def = COMMANDS[c?.t];
  if (!def) return { ok: false, err: 'unknown command' };
  if (!Number.isInteger(c.realm) || c.realm < 0 || c.realm >= s.realm.size || !s.realm.alive[c.realm]) return { ok: false, err: 'no such realm' };
  const why = def.check(s, w, c);
  if (why) return { ok: false, err: why };
  def.apply(s, w, c);
  return { ok: true };
}
