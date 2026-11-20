// World probe: the world to travel through (view.ts) on a page of its own.
// Address options, besides those of the stage (see ../lookprobe/stage/index.ts): ?lon=12.1&lat=45.85 (the place at the middle),
// ?wide=190 (finest blocks across the picture), ?region=world (the cut of the world to show), ?year=1291 (the start year whose realms colour the map; default 1356), ?mode=political, terrain or rulers (the map mode; default:
// the realms only on the flat world far out). The address follows the view.
import { showError } from '../lookprobe/stage';
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
