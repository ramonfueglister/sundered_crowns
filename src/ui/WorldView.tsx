// The world in the game: the voxel world to travel through (worldprobe/view.ts) under the HUD. Far out it lies flat
// and shows the realms as the world server last told them; a click on a place of the game map selects it.
import { useEffect, useRef } from 'preact/hooks';
import { effect } from '@preact/signals';
import { owners, realms } from '../net/client';
import { L, lang } from './i18n';
import { hoverPlace, mapCtl, mapError, selectedPlace } from './MapView';
import { listenForWorldClicks } from '../people/panel';
import type { WorldView as View } from '../worldprobe/view';

/** where the game opens: Europe as a map of its realms */
const START = { lon: 12, lat: 47, wide: 80000 };
/** a flight to a place shows this many finest blocks across the picture: its town and the land round it */
const AT_PLACE = 260;

interface Geo { loc: { lon: number[]; lat: number[] } }
/** the panel of the person clicked, once for the page */
let people: ReturnType<typeof listenForWorldClicks> | undefined;

export function WorldView() {
  const canvas = useRef<HTMLCanvasElement>(null), wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let view: View | null = null, disposed = false, wide = START.wide, shown: { owner: Int16Array | null; realms: string } = { owner: null, realms: '' };
    const stops: (() => void)[] = [];
    (async () => {
      try {
        const [{ createWorldView }, { realmsShown }] = await Promise.all([import('../worldprobe/view'), import('../worldprobe/zoom')]);
        // taken down while the world was being fetched: the canvas is gone
        if (disposed) return;
        const made = await createWorldView({
          canvas: canvas.current!, names: wrap.current!, ...START,
          status: (text) => { mapError.value = text || null; },
          moved: (_lon, _lat, w) => { wide = w; },
          // far out a click selects the place under it; near, it is for what stands there (people/panel.ts), and the
          // place's panel makes room for the person's
          clicked: (_hit, place) => { if (realmsShown(wide)) place().then((id) => { selectedPlace.value = id; }); else selectedPlace.value = -1; },
        });
        if (disposed) { made.dispose(); return; }
        view = made;
        if (import.meta.env.DEV) (window as any).__world = made; // for browser tests
        // the places of the game map, to fly to
        const geo: Promise<Geo> = fetch(`${import.meta.env.BASE_URL}data/geo.json`).then((r) => r.json());
        mapCtl.overview = () => made.flyTo(START.lon, START.lat, START.wide);
        mapCtl.home = (loc: number) => { geo.then((g) => { if (loc >= 0 && loc < g.loc.lon.length) made.flyTo(g.loc.lon[loc], g.loc.lat[loc], AT_PLACE); }); };
        stops.push(() => { mapCtl.overview = () => {}; mapCtl.home = () => {}; });
        // colours and names follow the owners and the realms
        stops.push(effect(() => {
          const o = owners.value, rs = realms.value; void lang.value;
          if (!o) return;
          const colors: number[] = [], names: string[] = [];
          for (const r of rs) { colors[r.id] = r.color; names[r.id] = L(r.short); }
          // the realms change in other ways too (a new ruler, a place more): the map is painted anew only for what it shows
          const now = `${colors.join()}|${names.join('|')}`;
          if (o === shown.owner && now === shown.realms) return;
          shown = { owner: o, realms: now };
          made.setRealms({ owner: o, colors, names });
        }));
        // the place selected is picked out on the far map
        stops.push(effect(() => { made.choose(selectedPlace.value); }));
        // a click on a figure of the great cities opens that person
        people ??= listenForWorldClicks(wrap.current!.closest<HTMLElement>('.app') ?? document.body);
      } catch (e: any) { console.error(e); mapError.value = String(e?.message || e); }
    })();
    hoverPlace.value = -1;
    return () => { disposed = true; for (const s of stops) s(); view?.dispose(); };
  }, []);
  return <div class="mapwrap" ref={wrap}>
    <canvas ref={canvas} class="map" onContextMenu={(e) => e.preventDefault()} />
    {mapError.value && <div class="maperror">{mapError.value}</div>}
  </div>;
}
