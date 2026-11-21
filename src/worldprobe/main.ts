// World probe: the world to travel through (view.ts) on a page of its own.
// Address options, besides those of the stage (see ../lookprobe/stage/index.ts): ?lon=12.1&lat=45.85 (the place at the middle),
// ?wide=190 (finest blocks across the picture), ?region=world (the cut of the world to show), ?year=1291 (the start year whose realms colour the map; default 1356), ?mode=political, terrain or rulers (the map mode; default:
// the realms only on the flat world far out), ?at=160:10 (the persons' figures where the plan of the day has them on
// that day of the world and at that hour, people feature 12; default: in the streets), ?at=160 (the fields as they
// are on that day of the world; default: in the summer of the start year). The address follows the view.
import { planPlaces } from '../figures/plan_places';
import { figuresAtHour } from '../figures/stage';
import { FARM_YEAR } from '../sim/people/farm_year';
import { fieldsOnDay, showError } from '../lookprobe/stage';
import { createWorldView } from './view';

const q = new URLSearchParams(location.search),
  status = document.querySelector<HTMLElement>('#status');
/** a number of the address; the equator and the meridian of Greenwich are places too, so 0 counts */
const num = (k: string, fallback: number) => {
  const v = Number(q.get(k) || NaN);
  return Number.isFinite(v) ? v : fallback;
};
let noted = 0;
const mode = q.get('mode');
// the figures follow the plan of a day at an hour (src/figures/schedule.ts), as the game has them follow the world's
// (src/people/day_figures.ts); the latitudes and farming years are those the world server has (src/sim/world.ts)
const [day, hour] = (q.get('at') ?? '').split(':').map(Number);
// (the fields as the figures; the pieces are built for the start year: worldprobe/season_codes.ts)
if (q.get('at') && Number.isFinite(day)) fieldsOnDay(day, num('year', 1356));
if (Number.isFinite(day) && Number.isFinite(hour))
  void planPlaces(
    import.meta.env.BASE_URL,
    fetch(`${import.meta.env.BASE_URL}data/geo.json`).then((r) => r.json()),
  ).then((p) =>
    figuresAtHour({
      day,
      hour,
      startYear: num('year', 1356),
      lat: (place) => Math.fround(p.lat[place]),
      farm: (place) => p.farm[place] ?? FARM_YEAR.north,
    }),
  );
createWorldView({
  region: q.get('region') ?? 'world',
  year: q.has('year') ? num('year', 1356) : undefined,
  lon: num('lon', 12.1),
  lat: num('lat', 45.85),
  wide: num('wide', 190),
  // a picture of fixed size is taken by a tool
  still: q.has('w'),
  status: (text) => {
    if (status) status.textContent = text;
  },
  // the address follows the view, a moment after it has come to rest
  moved: (lon, lat, wide) => {
    clearTimeout(noted);
    noted = window.setTimeout(() => {
      const to = new URLSearchParams(location.search);
      to.set('lon', lon.toFixed(3));
      to.set('lat', lat.toFixed(3));
      to.set('wide', String(Math.round(wide)));
      history.replaceState(null, '', `${location.pathname}?${to}`);
    }, 400);
  },
})
  .then((view) => {
    if (import.meta.env.DEV) (window as Window & { __world?: unknown }).__world = view; // for browser tests
    if (mode === 'political' || mode === 'terrain' || mode === 'rulers')
      view.mapMode(mode === 'rulers' ? 'political' : mode);
    // the rulers' dots and figures (src/people/rulers_mode.ts), from the world server of the build
    if (mode === 'rulers') {
      const env = (import.meta as { env?: Record<string, string> }).env ?? {};
      const loc = fetch(`${env.BASE_URL ?? '/'}data/geo.json`)
        .then((r) => r.json())
        .then((g: { loc: { lon: number[]; lat: number[] } }) => g.loc);
      void import('../people/rulers_mode').then((m) => m.showRulers(view, loc, () => {}, env.VITE_WORLD_URL));
    }
  })
  .catch(showError);
