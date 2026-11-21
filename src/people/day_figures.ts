// The figures of the great cities follow the plan of the day (people feature 12): once a second the world's hour is
// read (worldHour, src/net/client.ts) and the figures on the stage are put where the plans of their persons have them
// (figuresAtHour, src/figures/stage.ts and schedule.ts). Main thread only.
import { figuresAtHour } from '../figures/stage';
import { dayLength, world, worldHour } from '../net/client';
import type { WorldView } from '../worldprobe/view';

/** The figures are put this often, in milliseconds. */
const EVERY = 1000;

/** Has the figures on the stage of `view` follow the world's hour; `lat` gives the latitude of each place of the map
 *  (data/geo.json `loc.lat`, as the world server has it, src/sim/world.ts). Returns the way to stop. */
export function followDayPlans(view: Pick<WorldView, 'redraw'>, lat: Promise<ArrayLike<number>>): () => void {
  let of: ArrayLike<number> | null = null;
  void lat.then((l) => {
    of = l;
  });
  const timer = setInterval(() => {
    const w = world.value,
      l = of;
    if (!w || !l) return;
    // (where an hour of the world is shorter than the time between two puttings, the figures show each day at the
    // hour of the mass: schedule.ts TERCE)
    const fast = dayLength(w) < 24 * EVERY,
      hour = fast ? null : worldHour();
    if (!fast && hour === null) return;
    // (the server keeps the latitudes as 32-bit numbers: src/sim/world.ts)
    const clock = { day: w.day, hour, startYear: w.startYear, lat: (place: number) => Math.fround(l[place]) };
    if (figuresAtHour(clock)) view.redraw();
  }, EVERY);
  return () => clearInterval(timer);
}
