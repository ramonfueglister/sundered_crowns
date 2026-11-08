// The map: owns the WebGPU renderer, feeds it the simulation view, turns clicks into selections and orders.
import { useEffect, useRef } from 'preact/hooks';
import { signal } from '@preact/signals';
import { sim, view, nations } from '../game/client';
import type { TickView } from '../game/protocol';
import { selectedLoc, selectedArmies, selectedNation, mapMode, hoverLoc, settings, playerId, screen, showToast } from './store';
import { t, L } from './i18n';
import { sfx } from './audio';

export const rendererRef: { r: any | null; assets: any | null } = { r: null, assets: null };
export const mapError = signal<string | null>(null);
export const mapReady = signal(false);

/** Nation names placed along the main axis of their land (recomputed when borders change). */
export function computeLabels(owner: Int16Array, assets: any, ns: { short: any; alive: boolean }[]) {
  const geo = assets.geo; const L0 = geo.L;
  const sx = new Float64Array(ns.length), sy = new Float64Array(ns.length), cnt = new Float64Array(ns.length);
  const xx = new Float64Array(ns.length), yy = new Float64Array(ns.length), xy = new Float64Array(ns.length);
  const X = geo.loc.x, Y = geo.loc.y, A = geo.loc.area;
  for (let i = 0; i < L0; i++) { const o = owner[i]; if (o < 0) continue; const a = Math.max(1, A[i]); sx[o] += X[i] * a; sy[o] += Y[i] * a; cnt[o] += a; }
  for (let i = 0; i < L0; i++) { const o = owner[i]; if (o < 0 || !cnt[o]) continue; const a = Math.max(1, A[i]); const dx = X[i] - sx[o] / cnt[o], dy = Y[i] - sy[o] / cnt[o]; xx[o] += dx * dx * a; yy[o] += dy * dy * a; xy[o] += dx * dy * a; }
  const out: any[] = [];
  for (let n = 0; n < ns.length; n++) {
    if (!cnt[n] || !ns[n]?.alive) continue;
    const cx = sx[n] / cnt[n], cy = sy[n] / cnt[n];
    const a = xx[n] / cnt[n], b = xy[n] / cnt[n], c = yy[n] / cnt[n];
    const ang = 0.5 * Math.atan2(2 * b, a - c);
    const spread = Math.sqrt(Math.max(a, c));
    const text = L(ns[n].short).toUpperCase();
    const size = Math.max(10, Math.min(spread * 2.4 / Math.max(3, text.length) * 1.6, 90));
    out.push({ text, x: cx, y: cy, angle: Math.abs(ang) > 1.2 ? 0 : ang, size, nation: n });
  }
  return out;
}

export function MapView() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let disposed = false;
    let labelTimer: any = null;
    let lastOwner: Int16Array | null = null;
    const feed = (v: TickView, force = false) => {
      const r = rendererRef.r; if (!r) return;
      const ns = nations.value;
      if (v.owner && v.ctrl) {
        const cols = new Uint8Array(ns.length * 3);
        ns.forEach((n, k) => { cols[k * 3] = n.color[0]; cols[k * 3 + 1] = n.color[1]; cols[k * 3 + 2] = n.color[2]; });
        let changed = force || !lastOwner;
        if (!changed && lastOwner) for (let i = 0; i < v.owner.length; i += 1) if (lastOwner[i] !== v.owner[i]) { changed = true; break; }
        r.setPolitical(v.owner, v.ctrl, cols);
        if (v.ownerChanges && !force) {
          const o = v.changeOrigin ?? v.ownerChanges[0]?.loc; const g = rendererRef.assets.geo;
          r.animateOwnerChange(v.ownerChanges, g.loc.x[o] ?? 0, g.loc.y[o] ?? 0);
        }
        if (changed) {
          lastOwner = v.owner;
          clearTimeout(labelTimer);
          labelTimer = setTimeout(() => { if (rendererRef.r && lastOwner) rendererRef.r.setLabels(computeLabels(lastOwner, rendererRef.assets, nations.value)); }, force ? 0 : 400);
        }
      }
      if (v.snow) r.setSnow(v.snow);
      const g = rendererRef.assets.geo; const sel = new Set(selectedArmies.value);
      const units: any[] = [];
      const groups = new Map<string, any>();
      for (const a of v.armies) {
        if (a.embarked) continue;
        const key = `${a.loc}:${a.owner}:${a.fleet ? 1 : 0}`;
        let u = groups.get(key);
        const n = ns[a.owner];
        if (!u) { u = { id: a.id, ids: [], x: g.loc.x[a.loc], y: g.loc.y[a.loc], color: n ? n.color : [120, 120, 120], label: '', men: 0, kind: a.fleet ? 'fleet' : 'army', selected: false, moving: false, path: undefined as any, owner: a.owner, rebels: a.rebels }; groups.set(key, u); units.push(u); }
        u.ids.push(a.id); u.men += a.men;
        if (sel.has(a.id)) { u.selected = true; if (a.path.length) u.path = [[g.loc.x[a.loc], g.loc.y[a.loc]], ...a.path.map((p: number) => [g.loc.x[p], g.loc.y[p]])]; }
        if (a.path.length) u.moving = true;
      }
      for (const u of units) u.label = u.kind === 'fleet' ? String(Math.round(u.men)) : u.men >= 1000 ? (u.men / 1000).toFixed(1) + 'k' : String(Math.round(u.men));
      for (const sgi of v.sieges) units.push({ id: -sgi.loc, x: g.loc.x[sgi.loc], y: g.loc.y[sgi.loc] + 10, color: ns[sgi.nation]?.color ?? [90, 90, 90], label: Math.round(sgi.progress) + '%', kind: 'siege' });
      for (const b of v.battles) units.push({ id: -100000 - b.id, x: g.loc.x[b.loc], y: g.loc.y[b.loc] - 12, color: [200, 40, 30], label: '⚔', kind: 'battle' });
      r.setUnits(units);
    };
    (async () => {
      try {
        if (!('gpu' in navigator)) { mapError.value = t('no_webgpu'); return; }
        const R = await import('../render');
        const assets = rendererRef.assets || (rendererRef.assets = await R.loadMapAssets('/'));
        if (disposed) return;
        const r = await R.MapRenderer.create(canvas.current!, assets, settings.value.quality);
        rendererRef.r = r;
        r.attachControls?.(canvas.current!);
        r.onClick = (loc: number, ev: MouseEvent) => onClick(loc, ev);
        r.onRightClick = (loc: number, ev: MouseEvent) => onRightClick(loc, ev);
        r.onHover = (loc: number) => { hoverLoc.value = loc; };
        r.start();
        mapReady.value = true;
        const v = view.value; if (v) feed(v, true);
        const cap = nations.value[playerId.value]?.capital;
        if (cap !== undefined && cap >= 0) r.flyTo(assets.geo.loc.x[cap], assets.geo.loc.y[cap], 3);
        else r.flyTo(assets.W * 0.6, assets.H * 0.33, 0.9);
      } catch (e: any) { console.error(e); mapError.value = String(e?.message || e); }
    })();
    const onTick = (v: TickView) => feed(v);
    const onColors = (mode: string, rgba: Uint8Array) => { const r = rendererRef.r; if (!r) return; r.setLocationColors(rgba); r.setMode(mode === 'political' ? 'political' : mode === 'terrain' ? 'terrain' : 'flat'); };
    sim().onTick.push(onTick); sim().onColors.push(onColors);
    return () => {
      disposed = true;
      sim().onTick = sim().onTick.filter((f) => f !== onTick); sim().onColors = sim().onColors.filter((f) => f !== onColors);
      rendererRef.r?.destroy?.(); rendererRef.r = null; mapReady.value = false;
    };
  }, []);
  useEffect(() => { rendererRef.r?.setQuality?.(settings.value.quality); }, [settings.value.quality]);
  useEffect(() => { sim().mapMode(mapMode.value, selectedNation.value >= 0 ? selectedNation.value : playerId.value); }, [mapMode.value, selectedNation.value]);
  useEffect(() => { rendererRef.r?.setSelection?.(selectedLoc.value, []); }, [selectedLoc.value]);
  return <div class="mapwrap">
    <canvas ref={canvas} class="map" onContextMenu={(e) => e.preventDefault()} />
    {mapError.value && <div class="maperror">{mapError.value}</div>}
  </div>;
}

function armiesAt(loc: number) {
  const v = view.value; if (!v) return [];
  return v.armies.filter((a) => a.loc === loc && a.owner === playerId.value && !a.embarked);
}

function onClick(loc: number, ev: MouseEvent) {
  sfx('click');
  if (screen.value === 'select') {
    const v = view.value; const o = v?.owner?.[loc] ?? -1;
    selectedLoc.value = loc; selectedNation.value = o >= 0 ? o : -1; return;
  }
  const mine = armiesAt(loc);
  if (mine.length && !ev.altKey) {
    selectedArmies.value = ev.shiftKey ? [...new Set([...selectedArmies.value, ...mine.map((a) => a.id)])] : mine.map((a) => a.id);
    selectedLoc.value = loc; return;
  }
  selectedArmies.value = [];
  selectedLoc.value = loc;
  const o = view.value?.owner?.[loc] ?? -1;
  selectedNation.value = o >= 0 ? o : -1;
}

async function onRightClick(loc: number, _ev: MouseEvent) {
  if (screen.value !== 'game') return;
  const ids = selectedArmies.value; if (!ids.length || loc < 0) return;
  let ok = 0, err = '';
  for (const id of ids) {
    const a = view.value?.armies.find((x) => x.id === id); if (!a) continue;
    const r = await sim().cmd({ t: 'move', n: playerId.value, army: id, to: loc });
    if (r.ok) ok++; else err = r.err || '';
  }
  if (ok) sfx('march'); else if (err) showToast(err, 'err');
}
