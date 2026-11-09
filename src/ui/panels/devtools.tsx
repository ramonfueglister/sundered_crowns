// Developer panel additions (spec point 110): trigger any event for the player, switch a realm's AI off and on,
// fast-forward, and the frame rate, memory and simulation time per day.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { sim, view, nations } from '../../game/client';
import { selectedNation, playerId, showToast } from '../store';
import { rendererRef } from '../MapView';
import { Section, Row, Btn, act, t, L, num } from './common';
import { Tip } from '../Tip';
import { TipHead } from './explain';
import type { I18n } from '../../sim/types';

type DevState = { events: { id: string; title: I18n; major: boolean }[]; aiDisabled: number[] };
const MB = 1024 * 1024;

function usePerf() {
  const [p, setP] = useState({ fps: 0, frameMs: 0, heap: 0, total: 0, limit: 0 });
  useEffect(() => {
    const tick = () => {
      const st = rendererRef.r?.stats; const m = (performance as any).memory;
      setP({ fps: st?.intervalMs ? 1000 / st.intervalMs : 0, frameMs: st?.frameMs ?? 0, heap: m?.usedJSHeapSize ?? 0, total: m?.totalJSHeapSize ?? 0, limit: m?.jsHeapSizeLimit ?? 0 });
    };
    tick(); const h = setInterval(tick, 500); return () => clearInterval(h);
  }, []);
  return p;
}

export function DevTools() {
  const v = view.value; const pid = playerId.value; const nat = selectedNation.value >= 0 ? selectedNation.value : pid;
  const [st, setSt] = useState<DevState | null>(null);
  const [q, setQ] = useState(''); const [ev, setEv] = useState('');
  const reload = () => sim().query<DevState | null>({ q: 'devEvents' }).then((d) => d && setSt(d));
  useEffect(() => { reload(); }, []);
  const list = useMemo(() => { const k = q.trim().toLowerCase(); return (st?.events ?? []).filter((e) => !k || e.id.includes(k) || L(e.title).toLowerCase().includes(k)).slice(0, 300); }, [st, q]);
  const perf = usePerf();
  const aiOff = st ? st.aiDisabled.includes(nat) : false;
  const skip = (months: number) => { const days = Math.round(months * 30.44); (sim() as any).skip?.(days); showToast(`${t('x_dev_skipped')} ${months} ${t('months')}`); };
  return <>
    <Section title={t('x_dev_event')} id="dev-event">
      <div class="act-row"><input class="txt" placeholder={t('x_dev_search')} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        <select value={ev} onChange={(e) => setEv((e.target as HTMLSelectElement).value)}><option value="">{t('x_dev_pick_event')} ({list.length})</option>{list.map((e) => <option value={e.id}>{e.major ? '★ ' : ''}{L(e.title)} · {e.id}</option>)}</select>
        <Btn disabled={!ev || pid < 0 ? t('x_dev_pick_event') : null} onClick={() => act({ t: 'dev', action: 'event', payload: { id: ev, nation: pid } }, 'bell', t('x_dev_event_fired'))}>{t('x_dev_fire')}</Btn></div>
    </Section>
    <Section title={t('x_dev_ai')} id="dev-ai">
      <div class="act-row"><span>{L(nations.value[nat]?.short) || '—'}: <b class={aiOff ? 'neg' : 'pos'}>{aiOff ? t('x_dev_ai_off') : t('x_dev_ai_on')}</b></span><span class="spacer" />
        <Btn disabled={nat < 0 || nat === pid ? t('x_dev_ai_pick') : null} onClick={() => act({ t: 'dev', action: 'ai', payload: { nation: nat, on: aiOff } }, 'click').then(() => reload())}>{aiOff ? t('x_dev_ai_enable') : t('x_dev_ai_disable')}</Btn></div>
      {st && st.aiDisabled.length > 0 && <div class="muted small">{t('x_dev_ai_list')}: {st.aiDisabled.map((id) => L(nations.value[id]?.short)).join(', ')}</div>}
    </Section>
    <Section title={t('x_dev_forward')} id="dev-ff">
      <div class="seg wide">{[1, 3, 6, 12, 60].map((m) => <button onClick={() => skip(m)}>+{m} {t('months')}</button>)}</div>
      <div class="muted small">{t('x_dev_forward_hint')}</div>
    </Section>
    <Section title={t('x_dev_perf')} id="dev-perf">
      <Tip content={<div><TipHead name={t('x_fps')} value={num(perf.fps, perf.fps < 10 ? 1 : 0)} hint={t('x_fps_hint')} /><div class="breakdown"><div class="bd-row"><span>{t('x_frame_cpu')}</span><span>{num(perf.frameMs, 1)} ms</span></div></div></div>}>
        <Row k={t('x_fps')} v={perf.fps ? num(perf.fps, perf.fps < 10 ? 1 : 0) : '—'} /></Tip>
      <Tip content={<div><TipHead name={t('x_dev_memory')} value={perf.heap ? `${num(perf.heap / MB, 0)} MB` : '—'} hint={t('x_dev_memory_hint')} />
        {perf.heap > 0 && <div class="breakdown"><div class="bd-row"><span>{t('x_dev_heap_used')}</span><span>{num(perf.heap / MB, 0)} MB</span></div><div class="bd-row"><span>{t('x_dev_heap_total')}</span><span>{num(perf.total / MB, 0)} MB</span></div><div class="bd-row"><span>{t('x_dev_heap_limit')}</span><span>{num(perf.limit / MB, 0)} MB</span></div></div>}</div>}>
        <Row k={t('x_dev_memory')} v={perf.heap ? `${num(perf.heap / MB, 0)} / ${num(perf.limit / MB, 0)} MB` : t('x_dev_memory_na')} /></Tip>
      <Tip content={<div><TipHead name={t('dev_ms_day')} value={num(v?.msPerDay ?? 0, 2)} hint={t('x_dev_msday_hint')} /></div>}><Row k={t('dev_ms_day')} v={num(v?.msPerDay ?? 0, 2)} /></Tip>
    </Section>
  </>;
}
