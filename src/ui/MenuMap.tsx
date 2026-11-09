// The living map behind the main menu (point 110): Europe on 1 January 1356, drifting slowly from one seat of power
// to the next. It uses the setup file directly, so no game needs to run; the loaded map is kept for the game.
import { useEffect, useRef } from 'preact/hooks';
import { signal } from '@preact/signals';
import { rendererRef, computeLabels } from './MapView';

export const menuMapReady = signal(false);
// seats the camera visits (lon/lat are looked up from the map's locations by name)
const TOUR = ['Paris', 'Constantinople', 'Venice', 'Prague', 'London', 'Granada', 'Moscow', 'Cairo', 'Kraków', 'Lisbon', 'Sarai', 'Rome'];

export function MenuMap() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!('gpu' in navigator)) return;
    let r: any = null, disposed = false, timer: any = null;
    (async () => {
      try {
        const R = await import('../render');
        const assets = rendererRef.assets || (rendererRef.assets = await R.loadMapAssets('/'));
        const setup = await fetch('/data/setup_1356.json').then((x) => x.json());
        if (disposed || !canvas.current) return;
        r = await R.MapRenderer.create(canvas.current, assets, 'medium');
        if (disposed) { r.destroy(); return; }
        const owner = new Int16Array(setup.owner);
        const cols = new Uint8Array(setup.states.length * 3);
        setup.states.forEach((s: any, k: number) => { const v = parseInt(String(s.color).replace('#', ''), 16); cols[k * 3] = (v >> 16) & 255; cols[k * 3 + 1] = (v >> 8) & 255; cols[k * 3 + 2] = v & 255; });
        r.setPolitical(owner, owner, cols);
        r.setLabels(computeLabels(owner, assets, setup.states.map((s: any) => ({ short: s.short, alive: true }))));
        r.start();
        const names: string[] = assets.geo.loc.name ?? [];
        const stops = TOUR.map((n) => names.indexOf(n)).filter((i) => i >= 0);
        let k = 0;
        const next = () => { if (!stops.length) return; const l = stops[k++ % stops.length]; r.flyTo(assets.geo.loc.x[l], assets.geo.loc.y[l], 1.6); };
        r.flyTo(assets.W * 0.55, assets.H * 0.35, 1.0);
        timer = setInterval(next, 14000);
        menuMapReady.value = true;
      } catch (e) { console.warn('menu map', e); }
    })();
    return () => { disposed = true; clearInterval(timer); menuMapReady.value = false; r?.destroy?.(); };
  }, []);
  return <canvas ref={canvas} class="menu-map" />;
}
