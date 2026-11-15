// The order in which systems run. A day is one tick. Systems that cover every place spread the work over SHARDS days
// (each place once per cycle), so every tick costs about the same and the world never stalls on a month change.
import type { WorldState } from './state';
import type { World } from './world';
import { dayToDate, type DateParts } from './calendar';

export const SHARDS = 30;

export interface Tick {
  day: number;
  date: DateParts;
  /** first day of a month / of a year */
  newMonth: boolean;
  newYear: boolean;
  /** which shard of the places this tick covers (day mod SHARDS) */
  shard: number;
}

export interface System {
  id: string;
  /** runs every tick; a system decides itself what it does on a new month (tick.newMonth) or for its shard */
  run(s: WorldState, w: World, t: Tick): void;
}

/** Places [from, to) of a shard. */
export function shardRange(n: number, shard: number): [number, number] {
  return [Math.floor((n * shard) / SHARDS), Math.floor((n * (shard + 1)) / SHARDS)];
}

/** Advances the world by one day and runs the systems in their order. */
export function tick(s: WorldState, w: World, systems: readonly System[]): Tick {
  s.day++;
  const date = dayToDate(s.day, s.startYear);
  const t: Tick = { day: s.day, date, newMonth: date.d === 1, newYear: date.d === 1 && date.m === 0, shard: s.day % SHARDS };
  for (const sys of systems) sys.run(s, w, t);
  return t;
}
