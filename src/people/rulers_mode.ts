// The map mode of the rulers (src/ui/mapmode.ts): every ruler who holds a crown, far out as a black dot where they
// live, ringed in the colour of their realm, and near as their own figure painted in that colour (src/figures/stage.ts
// paintRulers; src/figures/crowd.ts always stands them in a street of their town). The world server says who they are
// and where (GET /rulers, src/net/people.ts rulersOnMap); asked again now and then, as crowns change hands.
import { httpOf } from '../figures/people';
import { paintRulers } from '../figures/stage';
import type { RulerOnMap } from '../net/people';
import type { WorldMark, WorldView } from '../worldprobe/view';

/** The rulers are asked for again this often, in milliseconds (a crown changes hands on a day of the world). */
const REFRESH = 30_000;

/** The CSS colour of a realm colour (0xRRGGBB). */
const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** The dots of the rulers: at the degrees of the place they live in, with their name and crowns for the pointer. */
export function rulerMarks(
  list: readonly RulerOnMap[],
  loc: { lon: number[]; lat: number[] },
  open: (uid: number) => void,
): WorldMark[] {
  return list.flatMap((r) =>
    r.place >= 0 && r.place < loc.lon.length
      ? [
          {
            lon: loc.lon[r.place],
            lat: loc.lat[r.place],
            color: css(r.crowns[0].color),
            title: `${r.name} (${r.crowns.map((c) => c.name).join(', ')})`,
            open: () => open(r.uid),
          },
        ]
      : [],
  );
}

/** Shows the rulers on the view until the returned function is called; without a world server nothing is shown. */
export function showRulers(
  view: Pick<WorldView, 'setMarks' | 'redraw'>,
  loc: Promise<{ lon: number[]; lat: number[] }>,
  open: (uid: number) => void,
  worldUrl: string | undefined,
): () => void {
  let stopped = false;
  const ask = async () => {
    if (!worldUrl) return;
    try {
      const [r, l] = await Promise.all([fetch(`${httpOf(worldUrl)}/rulers`), loc]);
      if (!r.ok || stopped) return;
      const list: RulerOnMap[] = await r.json();
      if (stopped) return;
      view.setMarks(rulerMarks(list, l, open));
      if (paintRulers(new Map(list.map((x) => [x.uid, x.crowns[0].color])))) view.redraw();
    } catch (e) {
      console.warn('rulers', e);
    }
  };
  void ask();
  const timer = setInterval(() => void ask(), REFRESH);
  return () => {
    stopped = true;
    clearInterval(timer);
    view.setMarks([]);
    if (paintRulers(new Map())) view.redraw();
  };
}
