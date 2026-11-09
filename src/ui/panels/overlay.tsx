// Notices (toasts from the simulation), the event modal, and the map legend.
import { useEffect, useRef, useState } from 'preact/hooks';
import { sim, view, notices, legend } from '../../game/client';
import { playerId, openPanel, settings, mapMode, lastSpeed } from '../store';
import { act, t, L, Tip, selectLoc, selectArmy, fmtDateShort } from './common';
import { EventArt } from './art';
import { useOptionFx, OptionEffects, OptionEffectsHead } from './eventfx';
import { sfx } from '../audio';

const BAD = new Set(['spy_caught', 'capital_lost', 'revolt', 'rebels_win', 'civil_war', 'coalition', 'heir_death', 'ruler_death', 'peace_refused', 'war', 'succession_crisis', 'estate_crisis', 'independence_war', 'fall', 'natives', 'general_death', 'regency']);
const GOOD = new Set(['peace', 'built', 'recruited', 'colony', 'discovery', 'tech', 'era', 'innovation', 'heir_born', 'converted', 'cb', 'diplo_accept', 'union', 'majority', 'reform']);
const ICON: Record<string, string> = { war: '⚔', battle: '⚔', siege: '♜', peace: '☮', peace_offer: '✉', peace_refused: '✉', built: '⚒', recruited: '⚔', colony: '⚓', discovery: '⚓', tech: '✎', era: '⌛', innovation: '✎', heir_born: '♔', ruler_death: '✝', heir_death: '✝', general_death: '✝', revolt: '⚑', rebels_win: '⚑', civil_war: '⚑', spy_caught: '◉', cb: '§', coalition: '⚠', diplo_offer: '✉', diplo_accept: '✉', situation: '✦', converted: '✝', reform: '§', capital_lost: '♜', intrigue: '◉' };
const LIFE = 12000;

export function Notices() {
  const pid = playerId.value; const all = notices.value; const v = view.value;
  const born = useRef(new Map<number, number>());
  const [gone, setGone] = useState<Set<number>>(new Set());
  const [hover, setHover] = useState(false);
  const [, tick] = useState(0);
  const lastId = useRef(0);
  const mine = all.filter((n) => pid < 0 || n.nation === pid);
  const now = Date.now();
  for (const n of mine) if (!born.current.has(n.id)) born.current.set(n.id, now);
  useEffect(() => {
    const newest = mine[mine.length - 1]; if (!newest || newest.id <= lastId.current) return;
    const first = lastId.current === 0; lastId.current = newest.id;
    if (!first) sfx(newest.kind === 'war' ? 'war' : newest.kind === 'peace' ? 'peace' : newest.kind === 'battle' ? 'battle' : 'page');
  }, [mine.length && mine[mine.length - 1].id]);
  useEffect(() => { const h = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(h); }, []);
  const shown = mine.filter((n) => !gone.has(n.id) && (hover || now - (born.current.get(n.id) ?? now) < LIFE)).slice(-6).reverse();
  if (!shown.length) return null;
  const click = (n: any) => {
    if (n.war !== undefined) openPanel('peace', { war: n.war });
    else if (n.army !== undefined) selectArmy(n.army);
    else if (n.loc !== undefined) selectLoc(n.loc);
    setGone(new Set([...gone, n.id]));
  };
  return <div class="notices" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onPointerDown={(e) => e.stopPropagation()}>
    {shown.map((n) => { const age = now - (born.current.get(n.id) ?? now); const fading = !hover && age > LIFE - 2500;
      return <div class={`notice ${BAD.has(n.kind) ? 'bad' : GOOD.has(n.kind) ? 'good' : ''} ${fading ? 'fading' : ''} ${n.loc !== undefined || n.war !== undefined || n.army !== undefined ? 'click' : ''}`} onClick={() => click(n)}>
        <span class="nt-ic">{ICON[n.kind] ?? '•'}</span>
        <span class="nt-t">{L(n.text)}</span>
        <span class="nt-d">{v ? fmtDateShort(n.day, v.startYear) : ''}</span>
        <button class="nt-x" onClick={(e) => { e.stopPropagation(); setGone(new Set([...gone, n.id])); }}>✕</button>
      </div>; })}
  </div>;
}

export function EventModal() {
  const v = view.value; const ev = v?.pending?.[0];
  const opened = useRef(-1);
  const resumeTo = useRef(0);
  const [busy, setBusy] = useState(false);
  const fx = useOptionFx(ev?.id, v?.day);
  useEffect(() => {
    if (!ev || opened.current === ev.id) return;
    opened.current = ev.id; sfx('event');
    if (settings.value.pauseOnEvents && (v?.speed ?? 0) > 0) { resumeTo.current = v!.speed; lastSpeed.value = v!.speed; sim().speed(0); }
  }, [ev?.id]);
  if (!ev) return null;
  const answer = async (k: number) => {
    if (busy) return; setBusy(true);
    const r = await act({ t: 'event', pending: ev.id, choice: k }, 'click');
    setBusy(false);
    if (r.ok && resumeTo.current && (view.value?.pending?.length ?? 0) <= 1) { sim().speed(resumeTo.current); resumeTo.current = 0; }
  };
  const paras = L(ev.text).split(/\n+/);
  return <div class="event-wrap" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
    <div class="event pnl">
      <EventArt art={ev.art} seed={ev.id} />
      <div class="ev-body">
        <h2>{L(ev.title)}</h2>
        <div class="ev-date muted">{v ? fmtDateShort(ev.day, v.startYear) : ''}{v && ev.expires > v.day && <> · {t('answer_by')} {fmtDateShort(ev.expires, v.startYear)}</>}</div>
        <div class="ev-text">{paras.map((p) => <p>{p}</p>)}</div>
        <OptionEffectsHead />
        <div class="ev-opts">{ev.options.map((o, k) => {
          const b = <button class="btn ev-opt" disabled={busy} onClick={() => answer(k)}><span class="ev-n">{['I', 'II', 'III', 'IV', 'V'][k] ?? k + 1}</span>{L(o.label)}</button>;
          return <div class="ev-choice">{o.hint ? <Tip tag="div" content={<div class="ev-hint">{L(o.hint)}</div>}>{b}</Tip> : b}<OptionEffects fx={fx ? fx[k] : null} /></div>;
        })}</div>
        {(v?.pending?.length ?? 0) > 1 && <div class="muted small ev-more">+{v!.pending.length - 1} {t('more_events')}</div>}
      </div>
    </div>
  </div>;
}

export function Legend() {
  const lg = legend.value; const m = mapMode.value;
  if (!lg || m === 'political' || m === 'terrain' || !lg.items.length) return null;
  return <div class="legend" onPointerDown={(e) => e.stopPropagation()}>
    <div class="lg-t">{L(lg.title)}</div>
    <div class="lg-items">{lg.items.slice(0, 16).map((it) => <span class="lg-i"><span class="sw" style={{ background: it.color }} />{L(it.label)}</span>)}</div>
  </div>;
}
