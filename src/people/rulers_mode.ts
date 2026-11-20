// The map mode of the rulers (src/ui/mapmode.ts): every ruler who holds a crown, far out as a black dot where they
// are, ringed in the colour of their realm, and near as their own figure painted in that colour (src/figures/stage.ts
// paintRulers; src/figures/crowd.ts always stands them in a street of their town). The world server says who they are
// and where (GET /rulers, src/net/people.ts rulersOnMap); asked again now and then, as crowns change hands. A ruler
// whose itinerary the sources tell travels the way between its places (src/sim/content/travel.ts): the server sends
// the way ahead, and the dot goes along it with the days of the world.
import { httpOf } from '../figures/people';
import { paintRulers } from '../figures/stage';
import type { RulerOnMap } from '../net/people';
import type { WorldMark, WorldView } from '../worldprobe/view';

/** The rulers are asked for again this often, in milliseconds (a crown changes hands on a day of the world). */
const REFRESH = 30_000;

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

/** The dots of the rulers: where they are on `day` (where the server names, without a day), with their name and
 *  crowns for the pointer. */
export function rulerMarks(
  list: readonly RulerOnMap[],
  loc: Loc,
  open: (uid: number) => void,
  day?: number,
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
      },
    ];
  });
}

/** Shows the rulers on the view until the returned function is called; without a world server nothing is shown.
 *  `days` hands each new day of the world to the function it is given (and returns how to stop it): the travelling
 *  rulers move with it, and the server is asked again when a way it sent runs out. */
export function showRulers(
  view: Pick<WorldView, 'setMarks' | 'redraw'>,
  loc: Promise<Loc>,
  open: (uid: number) => void,
  worldUrl: string | undefined,
  days?: (f: (day: number) => void) => () => void,
): () => void {
  let stopped = false,
    asking = false,
    list: RulerOnMap[] = [],
    l: Loc | null = null,
    today: number | undefined;
  const ask = async () => {
    if (!worldUrl || asking) return;
    asking = true;
    try {
      const [r, at] = await Promise.all([fetch(`${httpOf(worldUrl)}/rulers`), loc]);
      if (!r.ok || stopped) return;
      list = await r.json();
      l = at;
      if (stopped) return;
      view.setMarks(rulerMarks(list, at, open, today));
      if (paintRulers(new Map(list.map((x) => [x.uid, x.crowns[0].color])))) view.redraw();
    } catch (e) {
      console.warn('rulers', e);
    } finally {
      asking = false;
    }
  };
  void ask();
  const timer = setInterval(() => void ask(), REFRESH);
  const stopDays = days?.((day) => {
    if (day === today) return;
    today = day;
    const moving = list.filter((r) => r.track?.day.length);
    if (!moving.length || !l) return;
    view.setMarks(rulerMarks(list, l, open, day));
    if (moving.some((r) => day > r.track!.day[r.track!.day.length - 1])) void ask();
  });
  return () => {
    stopped = true;
    clearInterval(timer);
    stopDays?.();
    view.setMarks([]);
    if (paintRulers(new Map())) view.redraw();
  };
}
