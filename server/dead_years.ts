// The years of the archive of the dead (src/sim/people/archive.ts) that the world server read from its disk or put
// there lately: a browser that opens the ancestors of a person asks for the same years often.
import type { WorldState } from '../src/sim/state';
import { type ArchivedPersons, indexIn, yearsWith } from '../src/sim/people/archive';

/** the years kept, the latest read */
const KEPT = 8;

export class DeadYears {
  private readonly years = new Map<number, ArchivedPersons>();
  /** `read`: a year of the archive from the disk, by the day it went there (null: not on the disk) */
  constructor(
    private readonly read: (day: number) => ArchivedPersons | null,
    private readonly log: (m: string) => void,
  ) {}
  /** Keeps the years that went to the archive on a day (or in a replay), which the server put on its disk. */
  add(years: readonly ArchivedPersons[]): void {
    for (const a of years) this.years.set(a.day, a);
    this.trim();
  }
  /** A dead person of the archive of `s` (GET /person/<uid>): the year that holds the person, and the place there;
   *  null where the archive has no such person. */
  find(s: WorldState, uid: number): { year: ArchivedPersons; k: number } | null {
    for (const y of yearsWith(s, uid)) {
      let a = this.years.get(y.day) ?? null;
      if (!a) {
        try {
          a = this.read(y.day);
        } catch (e) {
          this.log(`the year of the archive of day ${y.day} cannot be read: ${(e as Error).message}`);
        }
      }
      if (!a) continue;
      this.years.delete(y.day);
      this.years.set(y.day, a);
      this.trim();
      const k = indexIn(a, uid);
      if (k >= 0) return { year: a, k };
    }
    return null;
  }
  private trim(): void {
    while (this.years.size > KEPT) this.years.delete(this.years.keys().next().value!);
  }
}
