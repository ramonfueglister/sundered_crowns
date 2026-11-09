// The map: owns the WebGPU renderer, feeds it the simulation view, turns clicks into selections and orders.
import { useEffect, useRef } from 'preact/hooks';
import { signal } from '@preact/signals';
import { sim, view, nations, landmarks } from '../game/client';
import type { TickView } from '../game/protocol';
import { selectedLoc, selectedArmies, selectedNation, mapMode, hoverLoc, settings, playerId, screen, showToast } from './store';
import { t, L, lang } from './i18n';
import { sfx } from './audio';
import { abortTimelapse, timelapseRunning } from './timelapse';
import { labelsFor, computeSettlements } from './mapdata';
import { dayToDate } from '../sim/calendar';

const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

export const rendererRef: { r: any | null; assets: any | null } = { r: null, assets: null };
export const mapError = signal<string | null>(null);
export const mapReady = signal(false);
/** The player's explored map (null: everything known, as in observer mode or online). */
let knownLocs: Uint8Array | null = null;
let labelOwner: Int16Array | null = null; // owners the labels were last computed from (for relabelling on a language switch)

/** realm names for the current borders (the player's unexplored land carries none) */
export const computeLabels = (owner: Int16Array, assets: any, ns: { short: any; alive: boolean; capital?: number }[]) => labelsFor(owner, assets, ns, knownLocs);
export { computeSettlements };

export function MapView() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let disposed = false;
    let labelTimer: any = null;
    let lastOwner: Int16Array | null = null;
    knownLocs = null; let knownApplied = false;
    const feed = (v: TickView, force = false) => {
      // the player's explored map arrives monthly; keep it even while the renderer is still loading
      let exploredChanged = false;
      if (v.explored) { exploredChanged = !knownLocs || v.explored.length !== knownLocs.length || v.explored.some((x, i) => x !== knownLocs![i]); knownLocs = v.explored; }
      const r = rendererRef.r; if (!r) { if (exploredChanged) knownApplied = false; return; }
      if (exploredChanged || force || !knownApplied) { r.setExplored(knownLocs); knownApplied = true; if (exploredChanged && lastOwner && !force) r.setLabels(computeLabels(lastOwner, rendererRef.assets, nations.value)); }
      const ns = nations.value;
      if (v.owner && v.ctrl) {
        const cols = new Uint8Array(ns.length * 3);
        ns.forEach((n, k) => { cols[k * 3] = n.color[0]; cols[k * 3 + 1] = n.color[1]; cols[k * 3 + 2] = n.color[2]; });
        let changed = force || !lastOwner;
        if (!changed && lastOwner) for (let i = 0; i < v.owner.length; i += 1) if (lastOwner[i] !== v.owner[i]) { changed = true; break; }
        // a timelapse is showing a past year: keep the present for when it ends
        const past = timelapseRunning();
        if (!past) r.setPolitical(v.owner, v.ctrl, cols);
        if (v.ownerChanges && !force && !past) {
          const o = v.changeOrigin ?? v.ownerChanges[0]?.loc; const g = rendererRef.assets.geo;
          r.animateOwnerChange(v.ownerChanges, g.loc.x[o] ?? 0, g.loc.y[o] ?? 0);
        }
        if (changed) {
          lastOwner = v.owner; labelOwner = v.owner;
          clearTimeout(labelTimer);
          labelTimer = setTimeout(() => {
            if (!rendererRef.r || !lastOwner) return;
            rendererRef.r.setLabels(computeLabels(lastOwner, rendererRef.assets, nations.value));
            rendererRef.r.setSettlements?.(computeSettlements(lastOwner, rendererRef.assets, nations.value as any));
          }, force ? 0 : 400);
        }
      }
      if (v.snow) r.setSnow(v.snow);
      { const dt = dayToDate(v.day, v.startYear); r.setDate?.(v.day, (MONTH_START[dt.m] + dt.d - 0.5) / 365); }
      if (v.landmarks || force || exploredChanged) {
        const g0 = rendererRef.assets.geo; const de = lang.value === 'de';
        r.setLandmarks((v.landmarks ?? landmarks.value).filter((m) => !knownLocs || knownLocs[m.loc] !== 0).map((m) => ({ x: g0.loc.x[m.loc], y: g0.loc.y[m.loc], name: de ? m.name.de : m.name.en, kind: m.kind, tier: m.tier, max: m.max, building: m.work > 0 })));
      }
      const g = rendererRef.assets.geo; const sel = new Set(selectedArmies.value);
      const atWar = new Set<number>(); for (const w of v.wars ?? []) { for (const n of w.att) atWar.add(n); for (const n of w.def) atWar.add(n); }
      const units: any[] = [];
      const groups = new Map<string, any>();
      for (const a of v.armies) {
        if (a.embarked || (knownLocs && knownLocs[a.loc] === 0 && a.owner !== playerId.value)) continue;
        const key = `${a.loc}:${a.owner}:${a.fleet ? 1 : 0}`;
        let u = groups.get(key);
        const n = ns[a.owner];
        // a host on the march stands part of the way to the next place
        let ax = g.loc.x[a.loc], ay = g.loc.y[a.loc];
        if (a.path.length && a.prog) { const t = a.prog; ax += (g.loc.x[a.path[0]] - ax) * t; ay += (g.loc.y[a.path[0]] - ay) * t; }
        if (!u) { u = { id: a.id, ids: [], x: ax, y: ay, color: n ? n.color : [120, 120, 120], label: '', men: 0, kind: a.fleet ? 'fleet' : 'army', selected: false, moving: false, path: undefined as any, owner: a.owner, rebels: a.rebels, mine: a.owner === playerId.value, hot: atWar.has(a.owner) || !!a.rebels }; groups.set(key, u); units.push(u); }
        u.ids.push(a.id); u.men += a.men;
        if (sel.has(a.id)) { u.selected = true; if (a.path.length) u.path = [[ax, ay], ...a.path.map((p: number) => [g.loc.x[p], g.loc.y[p]])]; }
        if (a.path.length) { u.moving = true; u.hot = true; u.toX = g.loc.x[a.path[0]]; u.toY = g.loc.y[a.path[0]]; }
      }
      for (const u of units) u.label = u.kind === 'fleet' ? String(Math.round(u.men)) : u.men >= 1000 ? (u.men / 1000).toFixed(1) + 'k' : String(Math.round(u.men));
      for (const sgi of v.sieges) { if (knownLocs && knownLocs[sgi.loc] === 0) continue; units.push({ id: -sgi.loc, x: g.loc.x[sgi.loc], y: g.loc.y[sgi.loc] + 10, lx: g.loc.x[sgi.loc], ly: g.loc.y[sgi.loc], progress: sgi.progress, color: ns[sgi.nation]?.color ?? [90, 90, 90], label: Math.round(sgi.progress) + '%', kind: 'siege' }); }
      for (const b of v.battles) { if (knownLocs && knownLocs[b.loc] === 0) continue; units.push({ id: -100000 - b.id, x: g.loc.x[b.loc], y: g.loc.y[b.loc] - 12, lx: g.loc.x[b.loc], ly: g.loc.y[b.loc], color: [200, 40, 30], label: '⚔', kind: 'battle' }); }
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
        if (import.meta.env.DEV) (window as any).__map = r; // for browser tests
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
      abortTimelapse();
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
  return v.armies.filter((a) => a.loc === loc && a.owner === playerId.value && !a.embarked && !a.rebels);
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
