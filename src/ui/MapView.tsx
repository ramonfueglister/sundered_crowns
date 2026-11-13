// The map: owns the WebGPU renderer and feeds it what the world server last told us (who owns which place).
import { useEffect, useRef } from 'preact/hooks';
import { signal, effect } from '@preact/signals';
import { owners, realms, world } from '../net/client';
import type { RealmInfo } from '../net/protocol';
import { lang, t } from './i18n';
import { labelsFor, computeSettlements } from './mapdata';
import { dayToDate } from '../sim/calendar';
import { deName } from '../sim/content/names_de';
import type { MapPlace } from '../render/overlay';

/** The place under the pointer and the one clicked (−1: none). */
export const hoverPlace = signal(-1);
export const selectedPlace = signal(-1);
export const mapError = signal<string | null>(null);

const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/** realms by id (holes where an id is unused) */
function byId(list: RealmInfo[]): (RealmInfo | undefined)[] {
  const out: (RealmInfo | undefined)[] = []; for (const r of list) out[r.id] = r; return out;
}
function colors(list: (RealmInfo | undefined)[]): Uint8Array {
  const c = new Uint8Array(list.length * 3);
  list.forEach((r, i) => { if (!r) return; c[i * 3] = (r.color >> 16) & 255; c[i * 3 + 1] = (r.color >> 8) & 255; c[i * 3 + 2] = r.color & 255; });
  return c;
}
/** Place names for close zoom: capitals first, then the larger towns, then the larger places. */
function placeList(geo: any, rs: (RealmInfo | undefined)[]): (MapPlace | null)[] {
  const de = lang.value === 'de';
  const caps = new Set<number>(); for (const r of rs) if (r && r.capital >= 0) caps.add(r.capital);
  const out: (MapPlace | null)[] = new Array(geo.L).fill(null);
  for (let l = 0; l < geo.L; l++) {
    const nm: string | null = geo.loc.name[l]; if (!nm) continue;
    const cap = caps.has(l);
    out[l] = { x: geo.loc.x[l], y: geo.loc.y[l], name: de ? deName(nm) : nm, rank: (cap ? 1e9 : 0) + (geo.loc.size[l] ?? 0) * 1e6 + (geo.loc.area[l] ?? 0), capital: cap };
  }
  return out;
}

export function MapView() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let disposed = false, r: any = null, assets: any = null;
    const stops: (() => void)[] = [];
    (async () => {
      try {
        if (!('gpu' in navigator)) { mapError.value = t('no_webgpu'); return; }
        const R = await import('../render');
        assets = await R.loadMapAssets('/');
        if (disposed) return;
        r = await R.MapRenderer.create(canvas.current!, assets, 'high');
        if (disposed || !canvas.current) { r.destroy?.(); return; }
        if (import.meta.env.DEV) (window as any).__map = r; // for browser tests
        r.attachControls(canvas.current);
        r.onClick = (loc: number) => { selectedPlace.value = loc >= 0 && loc < assets.geo.L ? loc : -1; };
        r.onHover = (loc: number) => { hoverPlace.value = loc >= 0 && loc < assets.geo.L ? loc : -1; };
        r.start();
        r.flyTo(assets.W * 0.55, assets.H * 0.33, 0.9);
        // borders, colours and names follow the owners and the realms
        stops.push(effect(() => {
          const o = owners.value, rs = byId(realms.value); void lang.value;
          if (!o) return;
          r.setPolitical(o, o, colors(rs));
          r.setLabels(labelsFor(o, assets, rs));
          r.setSettlements?.(computeSettlements(o, assets, rs));
          r.setPlaces?.(placeList(assets.geo, rs));
        }));
        stops.push(effect(() => {
          const wi = world.value; if (!wi) return;
          const d = dayToDate(wi.day, wi.startYear); r.setDate?.(wi.day, (MONTH_START[d.m] + d.d - 0.5) / 365);
        }));
        stops.push(effect(() => { r.setSelection?.(selectedPlace.value); }));
      } catch (e: any) { console.error(e); mapError.value = String(e?.message || e); }
    })();
    return () => { disposed = true; for (const s of stops) s(); r?.destroy?.(); };
  }, []);
  return <div class="mapwrap">
    <canvas ref={canvas} class="map" onContextMenu={(e) => e.preventDefault()} />
    {mapError.value && <div class="maperror">{mapError.value}</div>}
  </div>;
}

