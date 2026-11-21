// The parts of the world server (server/world.ts) that hold state for the rulers and the browsers: how many commands
// a ruler may give (server/order_limit.ts) and the years of the archive of the dead read lately (server/dead_years.ts).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrderLimit } from '../server/order_limit';
import { DeadYears } from '../server/dead_years';
import type { ArchivedPersons } from '../src/sim/people/archive';
import type { ArchiveYear, WorldState } from '../src/sim/state';

describe('the limit of the orders', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it('lets a ruler give a day of commands at once, and as many again in a day of the game', () => {
    vi.useFakeTimers({ now: 0 });
    const limit = new OrderLimit(2, 240);
    expect([limit.take('a'), limit.take('a'), limit.take('a')]).toEqual([true, true, false]);
    expect(limit.take('b')).toBe(true); // every ruler has a bucket of their own
    vi.setSystemTime(120_000); // half a day: one command
    expect([limit.take('a'), limit.take('a')]).toEqual([true, false]);
    vi.setSystemTime(10_000_000); // the bucket holds a day of commands at most
    expect([limit.take('a'), limit.take('a'), limit.take('a')]).toEqual([true, true, false]);
  });
});

describe('the years of the archive of the dead', () => {
  /** A year of the archive that went on `day`, of the persons with the uids `first` … `first + 9`. */
  const year = (day: number, first: number): ArchivedPersons =>
    // the years kept read only the day and the uids of a year
    ({
      day,
      persons: 10,
      cols: { uid: Uint32Array.from({ length: 10 }, (_, k) => first + k) },
    }) as unknown as ArchivedPersons;
  const days = Array.from({ length: 12 }, (_, k) => 365 * (k + 1));
  const archive: ArchiveYear[] = days.map((day, k) => ({ day, persons: 10, first: 100 * k, last: 100 * k + 9 }));
  // the list of the years of the archive is all of a state that a search reads
  const s = { archive } as unknown as WorldState;
  it('finds a dead person in the year that holds the person, read from the disk once', () => {
    const read = vi.fn((day: number) => year(day, 100 * days.indexOf(day))),
      dead = new DeadYears(read, () => {});
    expect(dead.find(s, 305)).toEqual({ year: year(days[3], 300), k: 5 });
    expect(dead.find(s, 301)!.k).toBe(1);
    expect(read).toHaveBeenCalledTimes(1);
    expect(dead.find(s, 350)).toBeNull(); // not in the archive
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('keeps the eight years read or put on the disk last', () => {
    const read = vi.fn((day: number) => year(day, 100 * days.indexOf(day))),
      dead = new DeadYears(read, () => {});
    dead.add(days.slice(0, 8).map((day, k) => year(day, 100 * k)));
    dead.find(s, 0); // the first year is read last now
    dead.find(s, 800); // a ninth: the second year goes
    expect(read).toHaveBeenCalledTimes(1);
    dead.find(s, 0);
    expect(read).toHaveBeenCalledTimes(1);
    dead.find(s, 100);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('tells why a year cannot be read, and goes on without it', () => {
    const said: string[] = [],
      dead = new DeadYears(
        () => {
          throw new Error('gone');
        },
        (m) => said.push(m),
      );
    expect(dead.find(s, 205)).toBeNull();
    expect(said).toEqual([`the year of the archive of day ${days[2]} cannot be read: gone`]);
    expect(
      new DeadYears(
        () => null,
        () => {},
      ).find(s, 205),
    ).toBeNull();
  });
});
