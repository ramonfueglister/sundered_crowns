// The map tooltip: pointing at a place shows its name, owner and controller, and the value the current map mode
// colours it by (src/game/view.ts mapTip), after a short rest of the pointer. Unknown land shows its name only.
import { useEffect, useRef, useState } from 'preact/hooks';
import { sim, nations, legend } from '../game/client';
import { hoverLoc, mapMode, selectedNation, playerId, uiHidden, settings } from './store';
import { cvdColorOf } from './palette';
import { t, L } from './i18n';
import { num, rgb } from './format';
import { placeName } from './panels/common';
import { terrainName } from './panels/location';
import type { TipRow } from '../game/view';

interface TipData { id: number; sea: boolean; unknown?: boolean; name: { en: string; de: string }; province?: string | null; owner: number; ctrl: number; rows: TipRow[] }

const REST_MS = 180;

export function MapTip() {
  const [d, setD] = useState<TipData | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0, pressed: false });
  // the pointer, followed without re-rendering; a pressed button (dragging the map) hides the tooltip
  useEffect(() => {
    const place = () => {
      const el = box.current; if (!el) return;
      const p = pos.current; const w = el.offsetWidth, h = el.offsetHeight;
      const x = p.x + 18 + w > window.innerWidth - 8 ? p.x - 14 - w : p.x + 18;
      const y = Math.min(window.innerHeight - h - 8, Math.max(8, p.y + 20));
      el.style.transform = `translate(${Math.max(8, x)}px, ${y}px)`;
      el.style.visibility = p.pressed ? 'hidden' : 'visible';
    };
    const move = (e: PointerEvent) => { pos.current = { x: e.clientX, y: e.clientY, pressed: e.buttons !== 0 }; place(); };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', move, { passive: true });
    window.addEventListener('pointerup', move, { passive: true });
    place();
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerdown', move); window.removeEventListener('pointerup', move); };
  }, [d]);
  // ask the simulation once the pointer rests on a place (and again when the mode, the good or the realm in focus changes)
  const loc = hoverLoc.value, mode = mapMode.value, good = legend.value?.good ?? -1;
  const focus = selectedNation.value >= 0 ? selectedNation.value : playerId.value;
  useEffect(() => {
    if (loc < 0) { setD(null); return; }
    let live = true;
    const h = setTimeout(() => {
      sim().query<TipData | null>({ q: 'maptip', loc, mode, good, focus }).then((r) => { if (live && hoverLoc.value === loc) setD(r ?? null); });
    }, REST_MS);
    return () => { live = false; clearTimeout(h); };
  }, [loc, mode, good, focus]);
  if (!d || loc < 0 || d.id !== loc || uiHidden.value) return null;
  const owner = nations.value[d.owner], ctrl = d.ctrl !== d.owner ? nations.value[d.ctrl] : undefined;
  const col = (id: number, c: [number, number, number]) => rgb(settings.value.palette === 'cvd' ? cvdColorOf(id) : c);
  const val = (r: TipRow) => {
    if (r.v !== undefined) return `${r.pct ? `${num(r.v * 100, 1)} %` : num(r.v, r.d ?? 0)}${r.text ? ` ${L(r.text)}` : ''}`;
    if (r.key === 'terrain' && typeof r.text === 'string') return terrainName(r.text);
    return r.text !== undefined ? L(r.text) : '';
  };
  return <div class="map-tip" ref={box} role="tooltip">
    <div class="mt-name">{d.sea ? L(d.name) : placeName(d.name.en)}</div>
    {d.province && !d.unknown && <div class="mt-sub">{placeName(d.province)}</div>}
    {d.unknown ? <div class="mt-sub">{t('terra_incognita')}</div> : d.sea ? <div class="mt-sub">{t('sea_zone')}</div> : <>
      <div class="mt-row"><span>{t('owner')}</span><span>{owner ? <><i class="mt-sw" style={{ background: col(d.owner, owner.color) }} />{L(owner.short)}</> : t('x_maptip_nobody')}</span></div>
      {ctrl && <div class="mt-row neg"><span>{t('x_maptip_held_by')}</span><span><i class="mt-sw" style={{ background: col(d.ctrl, ctrl.color) }} />{L(ctrl.short)}</span></div>}
      {d.rows.map((r) => <div class="mt-row"><span>{L(r.k)}</span><b>{val(r)}</b></div>)}
    </>}
  </div>;
}
