// The map mode of the rulers (src/ui/mapmode.ts): every ruler who holds a crown, far out as a black dot where they
// are, ringed in the colour of their realm, and near as their own figure painted in that colour (src/figures/stage.ts
// paintRulers; src/figures/crowd.ts always stands them in a street of their town). The world server says who they are
// and where (GET /rulers, src/net/people.ts rulersOnMap); asked again now and then, as crowns change hands. A ruler
// whose itinerary the sources tell travels the way between its places (src/sim/content/travel.ts): the server sends
// the way ahead, and on its legs between two places the ruler rides it as a horseman (worldprobe/view_riders.ts),
// going on with the hours of the world; where the ruler stays, the dot stands at the place.
import { httpOf } from '../figures/people';
import { paintRulers } from '../figures/stage';
import type { RulerOnMap } from '../net/people';
import type { WorldMark, WorldRider, WorldView } from '../worldprobe/view';

/** The rulers are asked for again this often, in milliseconds (a crown changes hands on a day of the world). */
const REFRESH = 30_000;
/** The riders are told where they are this often, in milliseconds. */
const RIDE_EVERY = 1000;
/** OWN RULE: a rider is told the way ahead for this many real seconds at most, more than between two tellings, so
 *  that the rider rides on smoothly in between (worldprobe/view_riders.ts). */
const AHEAD = 5;

/** The world's clock as the riders follow it: the day with the share of it gone, and how many days pass in a real
 *  second (0: the world is paused). */
interface RideClock {
  day: number;
  pace: number;
}

/** The CSS colour of a realm colour (0xRRGGBB). */
const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

type Loc = { lon: number[]; lat: number[] };

/** Where a ruler is on `day`: on their way between the two places of their track reached before and after it (a
 *  straight line between the two neighbouring places of the map), else at the place the server names. */
export function whereOn(r: RulerOnMap, loc: Loc, day: number | undefined): [number, number] {
  const t = r.track;
  if (day === undefined || !t || !t.day.length) return [loc.lon[r.place], loc.lat[r.place]];
  let i = 0;
  while (i + 1 < t.day.length && t.day[i + 1] <= day) i++;
  const a = t.place[i];
  if (i + 1 >= t.day.length || day <= t.day[i]) return [loc.lon[a], loc.lat[a]];
  const b = t.place[i + 1],
    f = (day - t.day[i]) / (t.day[i + 1] - t.day[i]);
  return [loc.lon[a] + (loc.lon[b] - loc.lon[a]) * f, loc.lat[a] + (loc.lat[b] - loc.lat[a]) * f];
}

/** The leg of a ruler's way on `day`: the index i of the place reached last, where the next place is another one
 *  (the ruler is on the road between them); -1 where the ruler stays at a place, or the way has not begun or is over. */
export function legOn(r: RulerOnMap, day: number): number {
  const t = r.track;
  if (!t?.day.length || day < t.day[0]) return -1;
  let i = 0;
  while (i + 1 < t.day.length && t.day[i + 1] <= day) i++;
  return i + 1 < t.day.length && t.place[i] !== t.place[i + 1] ? i : -1;
}

/** The rulers on a leg of their way at `clock`, as riders: each goes on for the seconds ahead, at most to the end of
 *  the leg; in a paused world each stands, facing the next place. */
export function ridersOn(list: readonly RulerOnMap[], loc: Loc, clock: RideClock): Map<number, WorldRider> {
  const out = new Map<number, WorldRider>();
  for (const r of list) {
    const i = legOn(r, clock.day);
    if (i < 0 || !r.track) continue;
    const next = r.track.place[i + 1],
      [lon, lat] = whereOn(r, loc, clock.day),
      seconds = clock.pace > 0 ? Math.min(AHEAD, (r.track.day[i + 1] - clock.day) / clock.pace) : 0,
      [toLon, toLat] = seconds > 0 ? whereOn(r, loc, clock.day + clock.pace * seconds) : [loc.lon[next], loc.lat[next]];
    out.set(r.uid, { lon, lat, toLon, toLat, seconds, color: r.crowns[0].color });
  }
  return out;
}

/** The dots of the rulers: where they are on `day` (where the server names, without a day), with their name and
 *  crowns for the pointer; those `riding` are marked as riders (no dot: the horseman shows them). */
function rulerMarks(
  list: readonly RulerOnMap[],
  loc: Loc,
  open: (uid: number) => void,
  day?: number,
  riding: ReadonlyMap<number, WorldRider> = new Map(),
): WorldMark[] {
  return list.flatMap((r) => {
    if (r.place < 0 || r.place >= loc.lon.length) return [];
    const [lon, lat] = whereOn(r, loc, day);
    return [
      {
        lon,
        lat,
        color: css(r.crowns[0].color),
        title: `${r.name} (${r.crowns.map((c) => c.name).join(', ')})`,
        open: () => open(r.uid),
        rider: riding.has(r.uid),
      },
    ];
  });
}

/** Shows the rulers on the view until the returned function is called; without a world server nothing is shown.
 *  `clock` tells the world's day and pace (null until the world tells them): the travelling rulers ride their ways
 *  with it, and the server is asked again when a way it sent runs out. Without it the rulers stand where the server
 *  names. */
export function showRulers(
  view: Pick<WorldView, 'setMarks' | 'setRiders' | 'redraw'>,
  loc: Promise<Loc>,
  open: (uid: number) => void,
  worldUrl: string | undefined,
  clock?: () => RideClock | null,
): () => void {
  let stopped = false,
    asking = false,
    list: RulerOnMap[] = [],
    l: Loc | null = null,
    shownDay = Number.NaN,
    askedDay = Number.NaN;
  /** shows the dots and the riders at the world's day and hour (`fresh`: the list of the rulers is new) */
  const show = (fresh: boolean) => {
    if (!l) return;
    const c = clock?.() ?? null,
      riding = c ? ridersOn(list, l, c) : new Map<number, WorldRider>(),
      day = c ? Math.floor(c.day) : Number.NaN;
    view.setRiders([...riding.values()]);
    // (the dots move only with the days, and those of riders with the riders)
    if (fresh || riding.size || day !== shownDay) view.setMarks(rulerMarks(list, l, open, c?.day, riding));
    shownDay = day;
    if (c && day !== askedDay && list.some((r) => r.track?.day.length && c.day > r.track.day[r.track.day.length - 1])) {
      askedDay = day;
      void ask();
    }
  };
  const ask = async () => {
    if (!worldUrl || asking) return;
    asking = true;
    try {
      const [r, at] = await Promise.all([fetch(`${httpOf(worldUrl)}/rulers`), loc]);
      if (!r.ok || stopped) return;
      list = await r.json();
      l = at;
      if (stopped) return;
      show(true);
      if (paintRulers(new Map(list.map((x) => [x.uid, x.crowns[0].color])))) view.redraw();
    } catch (e) {
      console.warn('rulers', e);
    } finally {
      asking = false;
    }
  };
  void ask();
  const timer = setInterval(() => void ask(), REFRESH),
    riding = clock ? setInterval(() => show(false), RIDE_EVERY) : 0;
  return () => {
    stopped = true;
    clearInterval(timer);
    clearInterval(riding);
    view.setMarks([]);
    view.setRiders([]);
    if (paintRulers(new Map())) view.redraw();
  };
}
