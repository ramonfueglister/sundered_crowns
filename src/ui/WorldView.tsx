// The world in the game: the voxel world to travel through (worldprobe/view.ts) under the HUD. Far out it lies flat
// and shows the realms as the world server last told them; a click on a place of the game map selects it.
import { useEffect, useRef } from 'preact/hooks';
import { effect } from '@preact/signals';
import { dayLength, owners, realms, status, world, worldHour } from '../net/client';
import { L, lang } from './i18n';
import { hoverPlace, mapCtl, mapError, selectedPlace } from './mapstate';
import { landOf, mapMode } from './mapmode';
import { replay } from './replay';
import { listenForWorldClicks } from '../people/panel';
import { listenForWorldHover } from '../people/hover';
import { showRulers } from '../people/rulers_mode';
import { followDayPlans } from '../people/day_figures';
import { followTownRolls } from '../people/town_rolls';
import type { WorldView as View } from '../worldprobe/view';

/** where the game opens: as far out as the view goes, the world's frame from west to east as a map of its realms */
const START = { lon: 21.5, lat: 47, wide: Infinity };
/** a flight to a place shows this many finest blocks across the picture: its town and the land round it */
const AT_PLACE = 260;

interface Geo {
  loc: { lon: number[]; lat: number[] };
}
/** how long the world waits for the server to name its start year before it builds that of 1356 (no server: a preview) */
const WAIT_FOR_YEAR = 8000;
/** the world's start year as the server names it on welcome: its realms, towns, persons and woods are built from it */
function startYear(): Promise<number | undefined> {
  return new Promise((done) => {
    const stops: (() => void)[] = [];
    let over = false;
    const end = (y: number | undefined) => {
      if (over) return;
      over = true;
      clearTimeout(t);
      for (const s of stops) s();
      done(y);
    };
    const t = setTimeout(() => end(undefined), WAIT_FOR_YEAR);
    stops.push(
      world.subscribe((w) => {
        if (w) end(w.startYear);
      }),
    );
    // no server to ask: the connection is lost or refused before a welcome
    stops.push(
      status.subscribe((st) => {
        if (st === 'lost' || st === 'refused') end(world.value?.startYear);
      }),
    );
    if (over) for (const s of stops) s();
  });
}
/** whether the panel of the person clicked and the card of the person under the pointer listen yet: once for the page */
let listeningForPeople = false;
/** the panel of the person clicked (once for the page), which the dots of the rulers open too */
let peoplePanel: ReturnType<typeof listenForWorldClicks> | undefined;

export function WorldView() {
  const canvas = useRef<HTMLCanvasElement>(null),
    wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let view: View | null = null,
      disposed = false,
      wide = START.wide,
      shown: { owner: Int16Array | null; realms: string } = { owner: null, realms: '' };
    const stops: (() => void)[] = [];
    (async () => {
      try {
        const [{ createWorldView }, { realmsShown }, year] = await Promise.all([
          import('../worldprobe/view'),
          import('../worldprobe/zoom'),
          startYear(),
        ]);
        // taken down while the world was being fetched: the canvas is gone
        if (disposed) return;
        const made = await createWorldView({
          canvas: canvas.current!,
          names: wrap.current!,
          ...START,
          year,
          status: (text) => {
            mapError.value = text || null;
          },
          moved: (_lon, _lat, w) => {
            wide = w;
          },
          // far out a click selects the place under it; near, it is for what stands there (people/panel.ts), and the
          // place's panel makes room for the person's
          clicked: (_hit, place) => {
            if (realmsShown(wide))
              place().then((id) => {
                selectedPlace.value = id;
              });
            else selectedPlace.value = -1;
          },
        });
        if (disposed) {
          made.dispose();
          return;
        }
        view = made;
        if (import.meta.env.DEV) (window as Window & { __world?: unknown }).__world = made; // for browser tests
        // the places of the game map, to fly to
        const geo: Promise<Geo> = fetch(`${import.meta.env.BASE_URL}data/geo.json`).then((r) => r.json());
        mapCtl.home = (loc: number) => {
          geo.then((g) => {
            if (loc >= 0 && loc < g.loc.lon.length) made.flyTo(g.loc.lon[loc], g.loc.lat[loc], AT_PLACE);
          });
        };
        stops.push(() => {
          mapCtl.home = () => {};
        });
        // colours and names follow the owners and the realms
        stops.push(
          effect(() => {
            const rp = replay.value,
              o = rp ? rp.owner : owners.value,
              rs = realms.value;
            void lang.value;
            if (!o) return;
            const colors: number[] = [],
              names: string[] = [];
            if (rp)
              rp.colors.forEach((c, k) => {
                colors[k] = c;
                names[k] = L(rp.names[k]);
              }); // the replay of the borders (replay.ts)
            else
              for (const r of rs) {
                colors[r.id] = r.color;
                names[r.id] = L(r.short);
              }
            // the realms change in other ways too (a new ruler, a place more): the map is painted anew only for what it shows
            const now = `${colors.join()}|${names.join('|')}`;
            if (o === shown.owner && now === shown.realms) return;
            shown = { owner: o, realms: now };
            made.setRealms({ owner: o, colors, names });
          }),
        );
        // the map mode chosen bottom right (political: the realms' colours lie on the land near and far)
        stops.push(
          effect(() => {
            made.mapMode(landOf(mapMode.value));
          }),
        );
        // the map mode of the rulers: a dot for each far out, their figure in their realm's colour near
        {
          let hide: (() => void) | null = null;
          const loc = geo.then((g) => g.loc);
          stops.push(
            effect(() => {
              const on = mapMode.value === 'rulers';
              if (on && !hide)
                hide = showRulers(
                  made,
                  loc,
                  (uid) => void peoplePanel?.show(uid),
                  import.meta.env.VITE_WORLD_URL,
                  // the travelling rulers ride their ways with the days and hours of the world
                  () => {
                    const w = world.value,
                      ms = w ? dayLength(w) : 0;
                    return w && { day: w.day + (worldHour() ?? 0) / 24, pace: w.paused || !ms ? 0 : 1000 / ms };
                  },
                );
              else if (!on && hide) {
                hide();
                hide = null;
              }
            }),
          );
          stops.push(() => hide?.());
        }
        // the place selected is picked out on the far map
        stops.push(
          effect(() => {
            made.choose(selectedPlace.value);
          }),
        );
        // the figures of the great cities go where the plans of their day have them at the world's hour
        stops.push(
          followDayPlans(
            made,
            geo.then((g) => g.loc.lat),
          ),
        );
        // and show the persons of their towns as they are on the world's day: the dead leave, the young come
        stops.push(followTownRolls(made, import.meta.env.VITE_WORLD_URL));
        // a click on a figure of the great cities opens that person; the pointer resting on one shows who it is
        if (!listeningForPeople) {
          listeningForPeople = true;
          const host = wrap.current!.closest<HTMLElement>('.app') ?? document.body;
          peoplePanel = listenForWorldClicks(host);
          listenForWorldHover(host);
        }
      } catch (e) {
        console.error(e);
        mapError.value = String((e as Error | undefined)?.message || e);
      }
    })();
    hoverPlace.value = -1;
    return () => {
      disposed = true;
      for (const s of stops) s();
      view?.dispose();
    };
  }, []);
  return (
    <div class="mapwrap" ref={wrap}>
      <canvas ref={canvas} class="map" onContextMenu={(e) => e.preventDefault()} />
      {mapError.value && <div class="maperror">{mapError.value}</div>}
    </div>
  );
}
