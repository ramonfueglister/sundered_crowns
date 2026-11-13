// Catch-up window (spec point 106): when a ruler returns to the persistent world after a while, the server sends what
// happened in between (src/online/catchup.ts). Every place in it can be shown on the map.
import { useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { catchUp } from '../../online/worldClient';
import type { CatchUp } from '../../online/catchup';
import type { ChronEntry } from '../../sim/types';
import { worldInfo } from '../../online/worldClient';
import { Panel, NLink, Tip, L, num, signed, selectLoc, locName, fmtDateShort } from '../panels/common';
import { TipHead } from '../panels/explain';
import { tt, fmtDuration } from './strings';
import '../panels/polish.css';

/** Whether the window is shown (it opens when a summary arrives and can be opened again from the online bar). */
export const catchUpOpen = signal(false);
let seen: CatchUp | null = null;

function Fact({ name, value, hint, rows }: { name: string; value: string; hint?: string; rows: [string, string][] }) {
  return <Tip content={<div><TipHead name={name} value={value} hint={hint} /><div class="breakdown">{rows.map(([k, v]) => <div class="bd-row"><span>{k}</span><span>{v}</span></div>)}</div></div>}>
    <div class="cu-fact has-tip"><span class="muted small">{name}</span><b>{value}</b></div>
  </Tip>;
}

function Entries({ list, start }: { list: ChronEntry[]; start: number }) {
  if (!list.length) return <div class="muted">{tt('cu_nothing')}</div>;
  return <ul class="cu-list">{list.map((e) => <li class={e.loc !== undefined ? 'click' : ''} title={e.loc !== undefined ? tt('cu_show') : undefined} onClick={() => e.loc !== undefined && selectLoc(e.loc)}>
    <span class="cu-date">{fmtDateShort(e.day, start)}</span>{e.nation >= 0 && <NLink id={e.nation} size={14} name={false} />}<span>{L(e.text)}</span>
  </li>)}</ul>;
}

function Locs({ ids, count }: { ids: number[]; count: number }) {
  return <div class="cu-locs">{ids.map((l) => <a class="click" title={tt('cu_show')} onClick={() => selectLoc(l)}>{locName(l)}</a>)}{count > ids.length && <span class="muted">+{count - ids.length} {tt('cu_more')}</span>}</div>;
}

export function CatchUpWindow() {
  const c = catchUp.value;
  const [, force] = useState(0);
  if (c && c !== seen) { seen = c; catchUpOpen.value = true; }
  if (!c || !catchUpOpen.value) return null;
  const close = () => { catchUpOpen.value = false; force((x) => x + 1); };
  const start = worldInfo.value?.startYear ?? 1356;
  const dT = c.treasury.to - c.treasury.from, dI = c.income.to - c.income.from;
  return <div class="modal-fixed" onClick={close}><div onClick={(e) => e.stopPropagation()}>
    <Panel title={tt('cu_title')} sub={`${fmtDateShort(c.fromDay, start)} – ${fmtDateShort(c.toDay, start)}`} cls="catchup" onClose={close}>
      <div class="cu-facts">
        <Fact name={tt('cu_days')} value={num(c.daysAway, 0)} rows={[[tt('cu_from_to'), fmtDateShort(c.fromDay, start)], [tt('cu_to'), fmtDateShort(c.toDay, start)], [tt('cu_real'), fmtDuration(c.msAway)]]} />
        <Fact name={tt('cu_treasury')} value={signed(dT, 0)} rows={[[tt('cu_from_to'), num(c.treasury.from, 0)], [tt('cu_to'), num(c.treasury.to, 0)]]} />
        <Fact name={tt('cu_income')} value={num(c.income.to, 1)} rows={[[tt('cu_from_to'), num(c.income.from, 1)], [tt('cu_to'), num(c.income.to, 1)], ['Δ', signed(dI, 1)]]} />
        <Fact name={tt('cu_land')} value={signed(c.gainedCount - c.lostCount, 0)} rows={[[tt('cu_gained'), `+${c.gainedCount}`], [tt('cu_lost_locs'), `−${c.lostCount}`]]} />
        <Fact name={tt('cu_battles')} value={`${c.battles.won} / ${c.battles.lost}`} rows={[[tt('cu_won'), String(c.battles.won)], [tt('cu_lost'), String(c.battles.lost)]]} />
      </div>
      {c.pending > 0 && <div class="sc-note">{c.pending} {tt('cu_pending')}</div>}
      {(c.warsStarted.length > 0 || c.warsEnded.length > 0 || c.atWar.length > 0) && <div class="sec">
        {c.warsStarted.length > 0 && <div><b>{tt('cu_wars_started')}:</b> {c.warsStarted.map((w) => <span>{L(w.name)} <span class="muted">({tt(w.attacker ? 'cu_attacker' : 'cu_defender')}, {tt('cu_against')} {w.enemies.slice(0, 4).map((e) => <NLink id={e} size={14} />)})</span> </span>)}</div>}
        {c.warsEnded.length > 0 && <div><b>{tt('cu_wars_ended')}:</b> {c.warsEnded.map((w) => L(w.name)).join(', ')}</div>}
        {c.atWar.length > 0 && <div><b>{tt('cu_at_war')}:</b> {c.atWar.map((w) => L(w.name)).join(', ')}</div>}
      </div>}
      {(c.gainedCount > 0 || c.lostCount > 0) && <div class="sec">
        {c.gainedCount > 0 && <div><b>{tt('cu_gained')}:</b> <Locs ids={c.gained} count={c.gainedCount} /></div>}
        {c.lostCount > 0 && <div><b>{tt('cu_lost_locs')}:</b> <Locs ids={c.lost} count={c.lostCount} /></div>}
      </div>}
      <h3><Tip content={<div><TipHead name={tt('cu_events')} hint={tt('cu_events_hint')} /></div>}><span class="has-tip">{tt('cu_events')}</span></Tip></h3>
      {c.events.length ? <ul class="cu-list">{c.events.map((e) => <li class={e.loc !== undefined ? 'click' : ''} onClick={() => e.loc !== undefined && selectLoc(e.loc)}>
        <span class="cu-date">{fmtDateShort(e.day, start)}</span><span><b>{L(e.title)}</b>: {L(e.option)}</span></li>)}</ul> : <div class="muted">{tt('cu_nothing')}</div>}
      {c.battles.entries.length > 0 && <><h3>{tt('cu_battles')}</h3><Entries list={c.battles.entries} start={start} /></>}
      <h3>{tt('cu_ours')}</h3><Entries list={c.ours} start={start} />
      <h3>{tt('cu_news')}</h3><Entries list={c.news} start={start} />
      <div class="act-row"><span class="spacer" /><button class="btn gold" onClick={close}>{tt('cu_close')}</button></div>
    </Panel>
  </div></div>;
}
