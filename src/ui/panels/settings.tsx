// Settings added in the polish pass (spec point 4): key bindings, the colour-blind palette and high-contrast borders,
// the resolution scale with the frame rate, and browser notifications. SettingsPanel (system.tsx) shows these sections.
import { useEffect, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { settings, saveSettings, showToast } from '../store';
import { t, lang } from '../i18n';
import { rendererRef } from '../MapView';
import { Section, Btn, pct, num } from './common';
import { Tip } from '../Tip';
import { TipHead } from './explain';
import { KEY_ACTIONS, KEY_GROUPS, KEY_INDEX, keyFor, keyLabel, bindKey, resetKey, resetAllKeys, keyConflicts, comboOf, keyOverrides } from '../keys';
import { sfx } from '../audio';
import './polish.css';

/** The action waiting for its new key (the game's own shortcuts pause meanwhile). */
export const keyCapture = signal<string | null>(null);

/** One capturing key listener for the whole page, installed at load: it is in place before the first key press after
 *  a click on a key (a listener added by an effect could come a frame too late on a slow machine). */
function onCaptureKey(e: KeyboardEvent) {
  const cap = keyCapture.value; if (!cap) return;
  // the game's own key handlers (App.tsx, the map) listen on the same window: they must not see this key at all
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.key === 'Escape') { keyCapture.value = null; return; }
  if (e.key === 'Backspace' || e.key === 'Delete') { bindKey(cap, ''); keyCapture.value = null; return; }
  const c = comboOf(e); if (!c) return; // a modifier alone: wait for the key
  bindKey(cap, c); keyCapture.value = null; sfx('click');
}
if (typeof window !== 'undefined') window.addEventListener('keydown', onCaptureKey, true);

export function KeyBindings() {
  const de = lang.value === 'de';
  const cap = keyCapture.value; void keyOverrides.value;
  const conflicts = keyConflicts();
  const conflictOf = (id: string) => { const c = keyFor(id); const ids = c ? conflicts.get(c) : undefined; return ids ? ids.filter((x) => x !== id) : []; };
  useEffect(() => () => { keyCapture.value = null; }, []);
  const nConf = [...conflicts.values()].length;
  return <Section title={<>{t('x_keys')} {nConf > 0 && <span class="neg small">({nConf} {t('x_key_conflicts')})</span>}</>} id="set-keys" open={false}>
    <div class="muted small">{t('x_keys_hint')}</div>
    <div class="keys-tbl">{KEY_GROUPS.map(([g, en, dg]) => <>
      <div class="keys-grp">{de ? dg : en}</div>
      {KEY_ACTIONS.filter((a) => a.group === g).map((a) => {
        const c = keyFor(a.id); const clash = conflictOf(a.id); const changed = !a.fixed && c !== keyFor(a.id, {});
        return <div class={`keys-row ${clash.length ? 'clash' : ''}`}>
          <span class="keys-name">{de ? a.name[1] : a.name[0]}</span>
          {a.fixed ? <Tip content={<div><TipHead name={de ? a.name[1] : a.name[0]} hint={t('x_key_fixed')} /></div>}><span class="keycap fixed">{keyLabel(c, de)} 🔒</span></Tip>
            : <button class={`keycap ${cap === a.id ? 'listening' : ''}`} onClick={() => { sfx('click'); keyCapture.value = cap === a.id ? null : a.id; }}>{cap === a.id ? t('x_press_key') : c ? keyLabel(c, de) : t('x_unbound')}</button>}
          {clash.length > 0 && <Tip content={<div><TipHead name={t('x_key_conflict')} value={keyLabel(c, de)} hint={t('x_key_conflict_hint')} /><div class="breakdown">{clash.map((id) => <div class="bd-row"><span>{de ? KEY_INDEX[id].name[1] : KEY_INDEX[id].name[0]}</span><span>{keyLabel(c, de)}</span></div>)}</div></div>}><span class="neg small">⚠ {clash.map((id) => de ? KEY_INDEX[id].name[1] : KEY_INDEX[id].name[0]).join(', ')}</span></Tip>}
          {changed && <button class="link small" onClick={() => resetKey(a.id)}>{t('x_reset')}</button>}
        </div>;
      })}
    </>)}</div>
    <div class="act-row"><span class="muted small">{t('x_keys_capture_hint')}</span><span class="spacer" /><Btn onClick={() => { resetAllKeys(); showToast(t('x_keys_reset_done')); }}>{t('x_reset_all')}</Btn></div>
  </Section>;
}

/** Frames per second of the map (from the renderer's frame interval). */
function useFps(): { fps: number; frameMs: number } {
  const [v, setV] = useState({ fps: 0, frameMs: 0 });
  useEffect(() => { const h = setInterval(() => { const st = rendererRef.r?.stats; setV(st && st.intervalMs ? { fps: 1000 / st.intervalMs, frameMs: st.frameMs } : { fps: 0, frameMs: 0 }); }, 500); return () => clearInterval(h); }, []);
  return v;
}

export function DisplaySettings() {
  const s = settings.value; const { fps, frameMs } = useFps();
  const cv = rendererRef.r?.canvas as HTMLCanvasElement | undefined;
  return <>
    <div class="slider-row"><span class="k">{t('x_res_scale')}</span><span class="slider"><input type="range" min={0.5} max={1} step={0.05} value={s.resScale} onInput={(e) => saveSettings({ resScale: Number((e.target as HTMLInputElement).value) })} /><span class="slider-v">{pct(s.resScale)}</span></span></div>
    <Tip content={<div><TipHead name={t('x_fps')} value={fps ? num(fps, fps < 10 ? 1 : 0) : '—'} hint={t('x_fps_hint')} />
      <div class="breakdown">
        <div class="bd-row"><span>{t('x_res_scale')}</span><span>{pct(s.resScale)}</span></div>
        <div class="bd-row"><span>{t('x_frame_cpu')}</span><span>{num(frameMs, 1)} ms</span></div>
        {cv && <div class="bd-row"><span>{t('x_pixels')}</span><span>{cv.width} × {cv.height}</span></div>}
        {cv && <div class="bd-row"><span>{t('x_canvas_css')}</span><span>{cv.clientWidth} × {cv.clientHeight}</span></div>}
      </div></div>}>
      <div class="muted small">{t('x_res_hint')} · <b>{fps ? `${num(fps, fps < 10 ? 1 : 0)} ${t('x_fps')}` : '—'}</b>{cv ? ` · ${cv.width}×${cv.height}` : ''}</div>
    </Tip>
  </>;
}

export function AccessSettings() {
  const s = settings.value;
  return <Section title={t('x_access')} id="set-access">
    <label class="chk"><input type="checkbox" checked={s.palette === 'cvd'} onChange={(e) => saveSettings({ palette: (e.target as HTMLInputElement).checked ? 'cvd' : 'normal' })} /> {t('x_cvd')}</label>
    <div class="muted small">{t('x_cvd_hint')}</div>
    <label class="chk"><input type="checkbox" checked={s.highContrast} onChange={(e) => saveSettings({ highContrast: (e.target as HTMLInputElement).checked })} /> {t('x_high_contrast')}</label>
    <label class="chk"><input type="checkbox" checked={s.notify} onChange={async (e) => {
      const on = (e.target as HTMLInputElement).checked;
      if (on && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
        const p = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission);
        if (p !== 'granted') { showToast(t('x_notify_denied'), 'err'); saveSettings({ notify: false }); return; }
      }
      saveSettings({ notify: on });
    }} /> {t('x_notify')}</label>
    <div class="muted small">{t('x_notify_hint')}</div>
  </Section>;
}

/** fix-people: when the game pauses by itself, events and offers apart (an offer of another realm need not stop time). */
export function PauseSettings() {
  const s = settings.value;
  return <>
    <label class="chk"><input type="checkbox" checked={s.pauseOnEvents} onChange={(e) => saveSettings({ pauseOnEvents: (e.target as HTMLInputElement).checked })} /> {t('pause_on_events')}</label>
    <label class="chk"><input type="checkbox" checked={s.pauseOnOffers} onChange={(e) => saveSettings({ pauseOnOffers: (e.target as HTMLInputElement).checked })} /> {t('xp_pause_on_offers')}</label>
    <div class="muted small">{t('xp_pause_on_offers_hint')}</div>
  </>;
}
