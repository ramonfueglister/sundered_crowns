// The map: owns the WebGPU renderer, feeds it the simulation view, turns clicks into selections and orders.
import { useEffect, useRef } from 'preact/hooks';
import { signal } from '@preact/signals';
import { sim, view, nations } from '../game/client';
import type { TickView } from '../game/protocol';
import { selectedLoc, selectedArmies, selectedNation, mapMode, hoverLoc, settings, playerId, screen, showToast } from './store';
import { t, L, lang } from './i18n';
import { sfx } from './audio';

export const rendererRef: { r: any | null; assets: any | null } = { r: null, assets: null };
export const mapError = signal<string | null>(null);
export const mapReady = signal(false);
let labelOwner: Int16Array | null = null; // owners the labels were last computed from (for relabelling on a language switch)

/**
 * Nation names placed along the main axis of their land (recomputed when borders change). Only the realm's main body is used
 * (the connected cluster around the capital, unless that is a small exclave), so overseas holdings do not drag the name into
 * the sea. The size follows the extent along the text (in map px); the overlay keeps it within a readable range on screen and
 * resolves overlaps by `weight` (the area of that body).
 */
export function computeLabels(owner: Int16Array, assets: any, ns: { short: any; alive: boolean; capital?: number }[]) {
  const geo = assets.geo; const L0 = geo.L;
  const X = geo.loc.x, Y = geo.loc.y, A = geo.loc.area;
  const locs: number[][] = ns.map(() => []);
  for (let i = 0; i < L0; i++) { const o = owner[i]; if (o >= 0 && o < ns.length) locs[o].push(i); }
  const CELL = 40;
  const out: any[] = [];
  for (let n = 0; n < ns.length; n++) {
    const all = locs[n]; if (!all.length || !ns[n]?.alive) continue;
    // connected clusters on a coarse grid (gaps up to about one cell, e.g. narrow straits, are bridged)
    const cells = new Map<number, number[]>();
    for (const i of all) { const k = Math.floor(X[i] / CELL) * 65536 + Math.floor(Y[i] / CELL); let c = cells.get(k); if (!c) cells.set(k, c = []); c.push(i); }
    const comp = new Map<number, number>(); const comps: { locs: number[]; area: number }[] = [];
    for (const k0 of cells.keys()) {
      if (comp.has(k0)) continue;
      const id = comps.length; const cur = { locs: [] as number[], area: 0 }; comps.push(cur);
      const stack = [k0]; comp.set(k0, id);
      while (stack.length) {
        const k = stack.pop()!; for (const i of cells.get(k)!) { cur.locs.push(i); cur.area += Math.max(1, A[i]); }
        const cx = Math.floor(k / 65536), cy = k - cx * 65536;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const kk = (cx + dx) * 65536 + (cy + dy); if (cells.has(kk) && !comp.has(kk)) { comp.set(kk, id); stack.push(kk); } }
      }
    }
    let body = comps[0];
    for (const c of comps) if (c.area > body.area) body = c;
    const cap = ns[n].capital ?? -1;
    if (cap >= 0 && owner[cap] === n) { const ck = Math.floor(X[cap] / CELL) * 65536 + Math.floor(Y[cap] / CELL); const cc = comps[comp.get(ck) ?? -1]; if (cc && cc.area >= body.area * 0.3) body = cc; }
    let sx = 0, sy = 0, cnt = 0;
    for (const i of body.locs) { const a = Math.max(1, A[i]); sx += X[i] * a; sy += Y[i] * a; cnt += a; }
    const cx = sx / cnt, cy = sy / cnt;
    let xx = 0, yy = 0, xy = 0;
    for (const i of body.locs) {
      // each location counts as a small disc, so one-location realms get an extent too
      const a = Math.max(1, A[i]), inner = a / (4 * Math.PI), dx = X[i] - cx, dy = Y[i] - cy;
      xx += (dx * dx + inner) * a; yy += (dy * dy + inner) * a; xy += dx * dy * a;
    }
    const a = xx / cnt, b = xy / cnt, c = yy / cnt;
    // text follows the main axis, but steep realms get level text (sized by their width) and the slant stays moderate
    let ang = 0.5 * Math.atan2(2 * b, a - c);
    if (Math.abs(ang) > 1.1) ang = 0; else ang = Math.max(-0.75, Math.min(0.75, ang));
    const co = Math.cos(ang), si = Math.sin(ang);
    const along = Math.sqrt(Math.max(0, a * co * co + 2 * b * si * co + c * si * si));
    const across = Math.sqrt(Math.max(0, a * si * si - 2 * b * si * co + c * co * co));
    const text = L(ns[n].short).toUpperCase();
    // the name spans about the realm's length along the text and is never much taller than the realm is wide
    const size = Math.max(1, Math.min(along * 3.84 / Math.max(3, text.length), across * 2.2));
    // a covered name may slide across its direction while it stays well inside the realm (about 1.2 standard deviations)
    const room = Math.max(0, across * 1.2 - size * 0.45);
    out.push({ text, x: cx, y: cy, angle: ang, size, nation: n, id: n, weight: body.area, room });
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
          lastOwner = v.owner; labelOwner = v.owner;
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
  useEffect(() => { if (rendererRef.r && labelOwner) rendererRef.r.setLabels(computeLabels(labelOwner, rendererRef.assets, nations.value)); }, [lang.value]);
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
