// Notices (toasts from the simulation), the event modal, and the map legend.
import { useEffect, useRef, useState } from 'preact/hooks';
import { sim, view, notices, legend } from '../../game/client';
import { playerId, openPanel, settings, mapMode, lastSpeed } from '../store';
import { act, t, L, Tip, selectLoc, selectArmy, fmtDateShort, Reasons } from './common';
import { EventArt } from './art';
import { useOptionFx, OptionEffects, OptionEffectsHead } from './eventfx';
import { sfx } from '../audio';
import { GOODS } from '../../sim/defs';

const BAD = new Set(['spy_caught', 'capital_lost', 'revolt', 'rebels_win', 'civil_war', 'coalition', 'heir_death', 'ruler_death', 'peace_refused', 'war', 'succession_crisis', 'estate_crisis', 'independence_war', 'fall', 'natives', 'general_death', 'regency', 'battle_lost', 'assault_failed', 'expedition_lost', 'embargo', 'house_warning', 'house_extinct', 'diplo_refuse']);
const GOOD = new Set(['peace', 'built', 'recruited', 'colony', 'discovery', 'tech', 'era', 'innovation', 'heir_born', 'converted', 'cb', 'diplo_accept', 'union', 'majority', 'reform', 'battle_won', 'siege_won', 'expedition']);
const ICON: Record<string, string> = { war: '⚔', battle: '⚔', siege: '♜', peace: '☮', peace_offer: '✉', peace_refused: '✉', built: '⚒', recruited: '⚔', colony: '⚓', discovery: '⚓', tech: '✎', era: '⌛', innovation: '✎', heir_born: '♔', ruler_death: '✝', heir_death: '✝', general_death: '✝', revolt: '⚑', rebels_win: '⚑', civil_war: '⚑', spy_caught: '◉', cb: '§', coalition: '⚠', diplo_offer: '✉', diplo_accept: '✉', situation: '✦', converted: '✝', reform: '§', capital_lost: '♜', intrigue: '◉', battle_won: '⚔', battle_lost: '⚔', siege_won: '♜', assault_failed: '♜', scorched: '♨', expedition: '⚓', expedition_lost: '⚓', embargo: '⛔', house_warning: '♔', house_extinct: '♔', marriage: '⚭', diplo_refuse: '✉', council: '§' };
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
    if (n.report !== undefined) openPanel('battle', { id: n.report });
    else if (n.war !== undefined) openPanel('peace', { war: n.war });
    else if (n.army !== undefined) selectArmy(n.army);
    else if (n.loc !== undefined) selectLoc(n.loc);
    setGone(new Set([...gone, n.id]));
  };
  return <div class="notices" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onPointerDown={(e) => e.stopPropagation()}>
    {shown.map((n) => { const age = now - (born.current.get(n.id) ?? now); const fading = !hover && age > LIFE - 2500;
      return <div class={`notice ${BAD.has(n.kind) ? 'bad' : GOOD.has(n.kind) ? 'good' : ''} ${fading ? 'fading' : ''} ${n.loc !== undefined || n.war !== undefined || n.army !== undefined || n.report !== undefined ? 'click' : ''}`} onClick={() => click(n)}>
        <span class="nt-ic">{ICON[n.kind] ?? '•'}</span>
        {n.reasons?.length ? <Tip content={() => <Reasons title={t('they_say')} rows={n.reasons!} />}><span class="nt-t has-tip">{L(n.text)}</span></Tip> : <span class="nt-t">{L(n.text)}</span>}
        <span class="nt-d">{v ? fmtDateShort(n.day, v.startYear) : ''}</span>
        <button class="nt-x" onClick={(e) => { e.stopPropagation(); setGone(new Set([...gone, n.id])); }}>✕</button>
      </div>; })}
  </div>;
}

/** An offer of another realm (alliance, marriage, passage...) pauses only when the player asked for it (settings). */
const isOffer = (e: { event: string }) => e.event.startsWith('diplo_');
const pauses = (e: { event: string }) => (isOffer(e) ? settings.value.pauseOnOffers : settings.value.pauseOnEvents);

export function EventModal() {
  const v = view.value; const ev = v?.pending?.[0];
  const opened = useRef(-1);
  // the pause this window made: the speed to return to, and whether the game has been seen paused since (a player who
  // starts the game again by hand takes the pause over, and answering no longer resumes it)
  const ours = useRef<{ speed: number; seen: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const fx = useOptionFx(ev?.id, v?.day);
  useEffect(() => {
    if (!ev || opened.current === ev.id) return;
    opened.current = ev.id; sfx('event');
    if (pauses(ev) && (v?.speed ?? 0) > 0) { ours.current = { speed: v!.speed, seen: false }; lastSpeed.value = v!.speed; sim().speed(0); }
  }, [ev?.id]);
  useEffect(() => {
    const p = ours.current; if (!p) return;
    if ((v?.speed ?? 0) === 0) p.seen = true; else if (p.seen) ours.current = null;
  }, [v?.speed]);
  if (!ev) return null;
  const answer = async (k: number) => {
    if (busy) return; setBusy(true);
    const r = await act({ t: 'event', pending: ev.id, choice: k }, 'click');
    setBusy(false);
    // resume only the pause an event window made, once no window that pauses is left
    const rest = (view.value?.pending ?? []).filter((p) => p.id !== ev.id);
    const p = ours.current;
    if (r.ok && p && (view.value?.speed ?? 0) === 0 && !rest.some(pauses)) { sim().speed(p.speed); ours.current = null; }
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
    <div class="lg-t">{L(lg.title)}{lg.good !== undefined && <GoodPicker good={lg.good} optional={!!lg.goodOptional} />}</div>
    <div class="lg-items">{lg.items.slice(0, 16).map((it) => <span class="lg-i"><span class="sw" style={{ background: it.color }} />{L(it.label)}</span>)}</div>
  </div>;
}

/** The good the prices, production and markets map modes show (sent to the simulation, which recolours the map). */
function GoodPicker({ good, optional }: { good: number; optional: boolean }) {
  const goods = GOODS.map((g, k) => ({ k, name: L(g.name) })).sort((a, b) => a.name.localeCompare(b.name));
  return <select class="lg-good" value={good} title={t('tr_map_good')} onChange={(e) => { sim().mapGood(Number((e.target as HTMLSelectElement).value)); sfx('click'); }}>
    {optional && <option value={-1}>{t('tr_map_no_good')}</option>}
    {goods.map((g) => <option value={g.k}>{g.name}</option>)}
  </select>;
}
