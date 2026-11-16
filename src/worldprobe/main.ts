// World probe: the world to travel through (view.ts) on a page of its own.
// Address options, besides those of the stage (see ../lookprobe/stage.ts): ?lon=12.1&lat=45.85 (the place at the middle),
// ?wide=190 (finest blocks across the picture), ?region=world (the cut of the world to show), ?year=1291 (the start year whose realms colour the map; default 1356), ?mode=political or terrain (the map mode; default:
// the realms only on the flat world far out). The address follows the view.
import { showError } from '../lookprobe/stage';
import { createWorldView } from './view';

const q = new URLSearchParams(location.search), status = document.querySelector<HTMLElement>('#status');
/** a number of the address; the equator and the meridian of Greenwich are places too, so 0 counts */
const num = (k: string, fallback: number) => { const v = Number(q.get(k) || NaN); return Number.isFinite(v) ? v : fallback; };
let noted = 0;
const mode = q.get('mode');
createWorldView({
  region: q.get('region') ?? 'world', year: q.has('year') ? num('year', 1356) : undefined, lon: num('lon', 12.1), lat: num('lat', 45.85), wide: num('wide', 190),
  // a picture of fixed size is taken by a tool
  still: q.has('w'),
  status: (text) => { if (status) status.textContent = text; },
  // the address follows the view, a moment after it has come to rest
  moved: (lon, lat, wide) => {
    clearTimeout(noted);
    noted = window.setTimeout(() => {
      const to = new URLSearchParams(location.search);
      to.set('lon', lon.toFixed(3)); to.set('lat', lat.toFixed(3)); to.set('wide', String(Math.round(wide)));
      history.replaceState(null, '', `${location.pathname}?${to}`);
    }, 400);
  },
}).then((view) => { if (mode === 'political' || mode === 'terrain') view.mapMode(mode); }).catch(showError);
