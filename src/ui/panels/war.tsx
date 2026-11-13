// War pass (claude/war-pass): the siege panel with its assault, the army's regiments, supply and attrition, the battle
// report and the lists of battles, and what the war does to a place. The numbers come from src/game/warview.ts, which
// reads the same simulation functions that apply them.
import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { view } from '../../game/client';
import { panelArg, playerId, openPanel } from '../store';
import { Parts, TipHead } from './explain';
import { Section, Row, Bar, NLink, Btn, Empty, LocName, useQuery, act, t, L, num, pct, signed, Tip, daysText, fmtDateShort, locName, namesVersion } from './common';
import { terrainName } from './location';
import { sfx } from '../audio';

const pctS = (v: number, d = 0) => `${signed(v * 100, d)} %`;
const when = (day: number) => { const v = view.value; return v ? fmtDateShort(day, v.startYear) : ''; };

// ---------------------------------------------------------------- siege
/** The siege of a place: progress, garrison and its stores, breach, blockade, the monthly roll, the expected time, the
 *  log and, for our besiegers, the assault with its odds and expected losses. */
export function SiegeBox({ sg, refresh }: { sg: any; refresh?: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const pid = playerId.value;
  const o = sg.odds;
  const ours = sg.nation === pid || !!sg.assault;
  const a = sg.assault;
  return <div class="siege-box xw-siege">
    <div class="xw-sg-h"><b>{t('siege')}</b> <LocName id={sg.loc} /> · <NLink id={sg.nation} size={14} /> {t('xw_against')} <NLink id={sg.defender} size={14} /></div>
    <div class="grid2">
      <Row k={t('xw_progress')} v={<span>{sg.progress} / {sg.need} <Bar value={sg.progress} max={sg.need} color="#9b2a20" /></span>}
        tip={() => <div><TipHead name={t('xw_progress')} value={`${sg.progress} / ${sg.need}`} hint={t('x_siege_hint')} />
          <Parts title={t('xw_roll_bonus')} rows={o.parts} total={o.bonus} digits={1} />
          <div class="breakdown"><div class="bd-row"><span>{t('xw_walls_need')}</span><span>{num(o.need, 1)}</span></div>
            <div class="bd-row"><span>{t('xw_step_chance')}</span><span>{pct(o.pStep)}</span></div>
            <div class="bd-row"><span>{t('xw_breach_chance')}</span><span>{o.battering ? t('xw_battering') : pct(o.pBreach)}</span></div>
            {o.pResupply > 0 && <div class="bd-row"><span>{t('xw_resupply_chance')}</span><span class="neg">{pct(o.pResupply)}</span></div>}</div></div>} />
      <Row k={t('xw_expected')} v={o.steps > 0 ? `≈ ${daysText(o.days)}` : '—'}
        tip={() => <div><TipHead name={t('xw_expected')} value={daysText(o.days)} hint={t('xw_expected_hint')} />
          <div class="breakdown"><div class="bd-row"><span>{t('xw_steps_left')}</span><span>{o.steps}</span></div><div class="bd-row"><span>{t('xw_step_chance')}</span><span>{pct(o.pStep)}</span></div>
            {o.pResupply > 0 && <div class="bd-row"><span>{t('xw_resupply_chance')}</span><span class="neg">−{pct(o.pResupply)}</span></div>}
            <div class="bd-row"><span>{t('x_days')}</span><span>{sg.days}</span></div></div></div>} />
      <Row k={t('garrison')} v={`${num(sg.garrison)} / ${num(sg.garrison0)}`}
        tip={() => <div><TipHead name={t('garrison')} value={num(sg.garrison)} hint={t('xw_garrison_hint')} />
          <Parts title={t('xw_starving')} rows={sg.starveRows} total={sg.starve} fmt={(v) => `−${num(v * 100, 1)} %`} bad /></div>} />
      <Row k={t('xw_stores')} v={<span class={sg.blockade ? 'neg' : ''}>−{num(sg.starve * 100, 1)} % / {t('month')}</span>}
        tip={() => <div><TipHead name={t('xw_stores')} value={`−${num(sg.starve * 100, 1)} %`} hint={t('xw_stores_hint')} /><Parts rows={sg.starveRows} total={sg.starve} fmt={(v) => `−${num(v * 100, 1)} %`} bad /></div>} />
      <Row k={t('x_breaches')} v={`${sg.breach} / 3`} tip={<div><TipHead name={t('x_breaches')} value={`${sg.breach} / 3`} hint={t('xw_breach_hint')} /></div>} />
      <Row k={t('x_blockade')} v={sg.blockade ? <span class="pos">✓</span> : sg.coastal ? <span class="neg">✗</span> : '—'} tip={<div><TipHead name={t('x_blockade')} hint={t('xw_siege_blockade_hint')} /></div>} />
    </div>
    {a && <div class="xw-assault">
      <Tip content={() => <div><TipHead name={t('xw_assault')} value={pct(a.p)} hint={t('xw_assault_hint')} />
        <Parts title={t('xw_assault_odds')} rows={a.parts} total={a.p} fmt={(v) => pctS(v)} />
        <div class="breakdown"><div class="bd-row"><span>{t('xw_assault_men')}</span><span>{num(a.men)}</span></div><div class="bd-row"><span>{t('garrison')}</span><span>{num(a.garrison)}</span></div>
          <div class="bd-row bd-total"><span>{t('xw_assault_loss')}</span><span class="neg">−{num(a.loss)}</span></div></div>
        <div class="muted small">{t('xw_assault_fail')}</div></div>}>
        <span class="has-tip">{t('xw_assault_chance')} <b>{pct(a.p)}</b> · {t('xw_assault_loss')} <b class="neg">{num(a.loss)}</b></span>
      </Tip>
      <span class="spacer" />
      <Btn cls="danger" disabled={a.refusal} tip={a.wait > 0 ? `${t('xw_wait')} ${daysText(a.wait)}` : t('xw_assault_hint')}
        onClick={() => { if (!confirm) { setConfirm(true); sfx('click'); return; } setConfirm(false); act({ t: 'assault', army: a.army }, 'battle').then(() => refresh?.()); }}>{confirm ? t('xw_assault_confirm') : t('xw_assault')}</Btn>
    </div>}
    {sg.log.length > 0 && <details class="xw-log" open={ours}><summary>{t('xw_siege_log')}</summary>
      {sg.log.slice(0, 10).map((e: any) => <div class="small"><span class="muted">{e.day >= 0 ? when(e.day) : ''}</span> {t(`xw_sl_${e.kind}`)}</div>)}
    </details>}
  </div>;
}

// ---------------------------------------------------------------- army detail
/** Regiments with their full strength and refill, supply and attrition here, and the siege the army lies before. */
export function ArmyDetail({ id }: { id: number }) {
  const [d, refresh] = useQuery<any>({ q: 'army', army: id }, [id], 900);
  if (!d) return null;
  const at = d.attrition, sup = d.supply, rf = d.refill;
  return <div class="xw-army">
    {!d.fleet && <div class="xw-sup">
      {sup && <Tip content={() => <div><TipHead name={t('xw_supply')} value={`${num(sup.total)} ${t('men')}`} hint={t('xw_supply_hint')} />
        <Parts product rows={sup.rows} total={sup.total} base={(v) => num(v)} />
        <div class="muted small">{t('xw_supply_min')}</div></div>}>
        <span class={`has-tip ${at && at.men > sup.total ? 'neg' : ''}`}>{t('xw_supply')}: <b>{num(at?.men ?? d.men)}</b> / {num(sup.total)}</span></Tip>}
      {at && <Tip content={() => <div><TipHead name={t('xw_attrition')} value={`${num(at.total * 100, 1)} % / ${t('month')}`} hint={at.quartered ? t('xw_quartered') : t('xw_attrition_hint')} />
        <Parts rows={at.rows} total={at.total} fmt={(v) => `${num(v * 100, 2)} %`} bad />
        {at.mult.length > 0 && <Parts title={t('xw_attrition_mult')} product rows={at.mult} />}
        <div class="breakdown"><div class="bd-row bd-total"><span>{t('xw_men_lost')}</span><span class="neg">−{num(d.men * at.total)}</span></div></div></div>}>
        <span class={`has-tip ${at.total > 0.02 ? 'neg' : ''}`}>{t('xw_attrition')}: <b>{num(at.total * 100, 1)} %</b></span></Tip>}
      {d.scorched && <span class="neg">{t('xw_scorched_here')}</span>}
    </div>}
    <table class="tbl xw-regs"><thead><tr><th>{t('xw_regiment')}</th><th class="r">{t('men')}</th><th>{t('xw_strength')}</th><th class="r">{t('xw_refill')}</th></tr></thead>
      <tbody>{d.regs.map((r: any) => <tr><td>{L(r.name)}</td>
        <td class="r"><Tip content={<div><TipHead name={L(r.name)} value={`${num(r.men)} / ${num(r.max)}`} hint={t('xw_full_strength_hint')} /></div>}>{num(r.men)}</Tip></td>
        <td><Bar value={r.men} max={Math.max(1, r.max)} color="#4d7a3a" /></td>
        <td class="r"><Tip content={() => <RefillTip rf={rf} r={r} />}><span class={r.want > 0.5 ? 'pos has-tip' : 'muted has-tip'}>{r.want > 0.5 ? `+${num(r.want)}` : r.men >= r.max - 0.5 ? '✓' : '—'}</span></Tip></td></tr>)}</tbody></table>
    {rf.men > 0.5 && <div class="muted small">{t('xw_refill_month')}: +{num(rf.men)} {t('men')} · {num(rf.gold, 1)} <i class="ic gold sm" /></div>}
    {rf.block && rf.block !== 'x_rf_no' && d.regs.some((r: any) => r.men < r.max - 0.5) && <div class="muted small">{t('xw_no_refill')}: {t(rf.block)}</div>}
    {d.siege && <SiegeBox sg={d.siege} refresh={refresh} />}
  </div>;
}
function RefillTip({ rf, r }: { rf: any; r: any }) {
  return <div><TipHead name={t('xw_refill')} value={r.want > 0.5 ? `+${num(r.want)}` : '0'} hint={t('xw_refill_hint')} />
    <div class="breakdown">
      <div class="bd-row"><span>{t('xw_missing')}</span><span>{num(Math.max(0, r.max - r.men))}</span></div>
      <div class="bd-row"><span>{t('xw_refill_rate')}</span><span>{num(r.max * 0.06)}</span></div>
      {rf.block && <div class="bd-row"><span>{t('xw_no_refill')}</span><span class="neg">{t(rf.block)}</span></div>}
      <div class="bd-row"><span>{t('manpower')}</span><span>{num(rf.manpower)}</span></div>
      <div class="bd-row"><span>{t('xw_refill_cost')}</span><span>{num(rf.gold, 1)}</span></div>
    </div>
    <div class="muted small">{t('xw_refill_scale')}</div></div>;
}

// ---------------------------------------------------------------- what the war does to a place
export function LocWar({ d, refresh }: { d: any; refresh: () => void }) {
  const x = d.war; if (!x) return null;
  const p = view.value?.player;
  const canScorch = x.scorch && p?.atWar;
  return <>
    {(x.scorchedUntil > 0 || x.blockadedBy >= 0 || x.marketBlockedUntil > 0 || canScorch || x.supply) && <div class="grid2 xw-loc">
      {x.supply && <Row k={t('xw_supply')} v={`${num(x.supply.total)} ${t('men')}`} tip={() => <div><TipHead name={t('xw_supply')} value={`${num(x.supply.total)} ${t('men')}`} hint={t('xw_supply_hint')} /><Parts product rows={x.supply.rows} total={x.supply.total} base={(v) => num(v)} /><div class="muted small">{t('xw_supply_min')}</div></div>} />}
      {x.scorchedUntil > 0 && <Row k={t('xw_scorched')} v={<span class="neg">{t('xw_until')} {when(x.scorchedUntil)}</span>} tip={<div><TipHead name={t('xw_scorched')} value={when(x.scorchedUntil)} hint={t('xw_scorched_hint')} /></div>} />}
      {x.blockadedBy >= 0 && <Row k={t('xw_port_blockaded')} v={<NLink id={x.blockadedBy} size={14} />} tip={<div><TipHead name={t('xw_port_blockaded')} hint={t('xw_port_blockaded_hint')} /></div>} />}
      {x.marketBlockedUntil > 0 && <Row k={t('xw_market_blockaded')} v={<span class="neg">{t('xw_until')} {when(x.marketBlockedUntil)}</span>} tip={<div><TipHead name={t('xw_market_blockaded')} hint={t('xw_market_blockaded_hint')} /></div>} />}
    </div>}
    {canScorch && <div class="act-row"><Tip content={<div><TipHead name={t('xw_scorch')} hint={t('xw_scorch_hint')} /></div>}><span class="muted small has-tip">{t('xw_scorch_short')}</span></Tip><span class="spacer" />
      <Btn cls="danger" disabled={x.scorch.refusal} onClick={() => act({ t: 'scorch', loc: d.id }, 'click').then(refresh)}>{t('xw_scorch')}</Btn></div>}
    {x.siege && <SiegeBox sg={x.siege} refresh={refresh} />}
  </>;
}

// ---------------------------------------------------------------- battles
const sideName = (nation: number, rebels: boolean): ComponentChildren => (rebels ? <span>{t('xw_rebels')}</span> : <NLink id={nation} size={14} />);
/** Battles in a list: name, date, the men on both sides and the losses; a click opens the report. */
export function BattleList({ rows, empty }: { rows: any[] | null; empty?: string }) {
  void namesVersion.value;
  if (!rows) return <div class="muted small">{t('loading')}…</div>;
  if (!rows.length) return <div class="muted small">{empty ?? t('xw_no_battles')}</div>;
  return <table class="tbl xw-blist"><thead><tr><th>{t('xw_battle_of')}</th><th>{t('xw_date')}</th><th>{t('xw_attacker')}</th><th class="r">{t('xw_losses')}</th><th>{t('xw_defender')}</th></tr></thead>
    <tbody>{rows.map((b) => <tr class="click" onClick={() => { sfx('open'); openPanel('battle', { id: b.id }); }}>
      <td>{b.naval ? '⚓ ' : '⚔ '}{locName(b.loc)}</td><td class="muted">{when(b.day)}</td>
      <td class={b.winner === 'att' ? 'pos' : ''}>{sideName(b.att, b.attRebels)} <small class="muted">{num(b.menA)}</small></td>
      <td class="r"><Tip content={<div><TipHead name={t('xw_losses')} hint={t('xw_losses_hint')} /><div class="breakdown"><div class="bd-row"><span>{t('xw_attacker')}</span><span class="neg">−{num(b.lossA)}</span></div><div class="bd-row"><span>{t('xw_defender')}</span><span class="neg">−{num(b.lossD)}</span></div></div></div>}>{num(b.lossA)} / {num(b.lossD)}</Tip></td>
      <td class={b.winner === 'def' ? 'pos' : ''}>{sideName(b.def, b.defRebels)} <small class="muted">{num(b.menD)}</small></td></tr>)}</tbody></table>;
}
/** Our latest battles (military panel). */
export function RecentBattles() {
  const pid = playerId.value;
  const [rows] = useQuery<any[]>(pid >= 0 ? { q: 'battles' } : null, [pid], 3000);
  return <Section title={t('xw_recent_battles')} id="mil-battles"><BattleList rows={rows} /></Section>;
}

function reasonText(k: string, d: any): string {
  const [key, side] = k.split(':');
  const who = side === 'att' ? t('xw_attacker') : side === 'def' ? t('xw_defender') : '';
  if (key === 'terrain') return `${t('xw_br_terrain')}: ${terrainName(side)}`;
  if (key.startsWith('x_bm_')) return `${t(key)} (${who})`;
  void d;
  return t(`xw_br_${key}`);
}

/** The battle report: commanders, troops by type at the start and the end, the ground, the river, each day's fighting,
 *  the losses and the morale, and why it went as it did. */
export function BattleTab() {
  const id = panelArg.value?.id;
  const [d] = useQuery<any>(id !== undefined ? { q: 'battle', id } : null, [id], 60000);
  void namesVersion.value;
  if (id === undefined) return <Empty>{t('xw_no_report')}</Empty>;
  if (!d) return <Empty>{t('loading')}…</Empty>;
  const pid = playerId.value;
  const ourSide = d.att.nation === pid ? 'att' : d.def.nation === pid ? 'def' : '';
  const won = ourSide && d.winner === ourSide;
  const strength = (x: any) => x.parts.reduce((p: number, r: [string, number]) => p * r[1], 1);
  const lossBattle = (k: 'lossA' | 'lossD') => d.days.reduce((p: number, x: any) => p + x[k], 0);
  return <div class="xw-report">
    <div class="xw-rep-h">
      <div><b>{d.naval ? t('xw_naval_battle_of') : t('xw_battle_of')} <LocName id={d.loc} /></b></div>
      <div class="muted small">{when(d.day0)} – {when(d.day1)} · {d.days.length} {t('days')}</div>
      {ourSide && <div class={won ? 'pos' : 'neg'}><b>{won ? t('xw_victory') : t('xw_defeat')}</b></div>}
    </div>
    <div class="chips xw-ground">
      <Tip content={<div><TipHead name={t('terrain')} value={d.naval ? t('xw_sea') : terrainName(d.terrain)} hint={t('xw_terrain_hint')} /></div>}><span class="chip"><small>{t('terrain')}</small>{d.naval ? t('xw_sea') : terrainName(d.terrain)}</span></Tip>
      {d.river && <Tip content={<div><TipHead name={t('xw_river')} value={`× ${num(0.8, 2)}`} hint={t('xw_river_hint')} /></div>}><span class="chip neg"><small>{t('xw_river')}</small>{t('xw_river_crossed')}</span></Tip>}
      {d.snow > 0.05 && <Tip content={<div><TipHead name={t('xw_winter')} value={pct(d.snow)} hint={t('xw_winter_hint')} /></div>}><span class="chip"><small>{t('xw_winter')}</small>{pct(d.snow)}</span></Tip>}
      {d.fort > 0 && <Tip content={<div><TipHead name={t('xw_fort')} value={d.fort} hint={t('xw_fort_hint')} /></div>}><span class="chip"><small>{t('xw_fort')}</small>{d.fort}</span></Tip>}
    </div>
    <div class="cols2 xw-sides">{(['att', 'def'] as const).map((k) => { const x = d[k]; const lost = k === 'att' ? d.lossA : d.lossD; const pursuit = d.winner && d.winner !== k ? d.pursuit : 0;
      return <div class={`xw-side ${d.winner === k ? 'won' : ''}`}>
        <div class="sub-h">{k === 'att' ? t('xw_attacker') : t('xw_defender')}: {sideName(x.nation, x.rebels)} {d.winner === k && <span class="pos">✔</span>}</div>
        <div class="small">{t('xw_commanders')}: {x.generals.length ? x.generals.map((g: any) => <Tip content={<div><TipHead name={g.name} value={`${t('xw_skill')} ${g.skill}`} hint={t('xw_general_hint')} /></div>}><span class="chip">{g.name} <b>{g.skill}</b></span></Tip>) : <span class="muted">{t('none')}</span>}</div>
        <table class="tbl"><thead><tr><th>{t('xw_troops')}</th><th class="r">{t('xw_start')}</th><th class="r">{t('xw_end')}</th></tr></thead>
          <tbody>{x.troops.map((r: any) => <tr><td>{L(r.name)}</td><td class="r">{num(r.start)}</td><td class="r"><Tip content={<div><TipHead name={L(r.name)} value={`−${num(r.start - r.end)}`} hint={t('xw_troop_loss_hint')} /></div>}>{num(r.end)}</Tip></td></tr>)}
            <tr class="bd-total"><td><b>Σ</b></td><td class="r"><b>{num(x.start)}</b></td><td class="r"><b>{num(x.end)}</b></td></tr></tbody></table>
        <Row k={t('xw_losses')} v={<span class="neg">−{num(lost)}</span>} tip={() => <div><TipHead name={t('xw_losses')} value={num(lost)} hint={t('xw_losses_hint')} />
          <div class="breakdown"><div class="bd-row"><span>{t('xw_in_battle')}</span><span class="neg">−{num(lossBattle(k === 'att' ? 'lossA' : 'lossD'))}</span></div>
            {pursuit > 0 && <div class="bd-row"><span>{x.routed ? t('xw_rout_pursuit') : t('xw_pursuit')}</span><span class="neg">−{num(pursuit)}</span></div>}
            <div class="bd-row bd-total"><span>Σ</span><span class="neg">−{num(lost)}</span></div></div></div>} />
        <Row k={t('morale')} v={<span>{pct(x.morale0)} → <b class={x.broke ? 'neg' : ''}>{pct(x.morale)}</b>{x.routed ? <span class="neg"> · {t('xw_routed')}</span> : x.broke ? <span class="neg"> · {t('xw_broke')}</span> : null}</span>}
          tip={<div><TipHead name={t('morale')} value={`${pct(x.morale0)} → ${pct(x.morale)}`} hint={t('xw_morale_hint')} /></div>} />
        <Row k={t('xw_strength')} v={num(strength(x))} tip={() => <div><TipHead name={t('xw_strength')} value={num(strength(x))} hint={t('xw_strength_hint')} /><Parts product rows={x.parts} total={strength(x)} base={(v) => num(v)} /></div>} />
        {x.mods.length > 0 && <Row k={t('xw_unit_mix')} v={x.mods.map((m: [string, number]) => t(m[0])).join(', ')} tip={() => <div><TipHead name={t('xw_unit_mix')} hint={t('xw_unit_mix_hint')} /><Parts rows={x.mods} fmt={(v) => pctS(v)} /></div>} />}
      </div>; })}</div>
    <Section title={t('xw_days_fought')} id="rep-days">
      <table class="tbl xw-days"><thead><tr><th>{t('day')}</th><th>{t('xw_phase')}</th><th class="r">{t('xw_loss_att')}</th><th class="r">{t('xw_loss_def')}</th><th>{t('xw_morale_att')}</th><th>{t('xw_morale_def')}</th></tr></thead>
        <tbody>{d.days.map((x: any) => <tr><td>{x.day}</td><td class="muted">{t(x.phase === 0 ? 'xw_phase_ranged' : 'xw_phase_melee')}</td><td class="r">{num(x.lossA)}</td><td class="r">{num(x.lossD)}</td>
          <td><Bar value={x.moraleA} color="#4d7a3a" tip={<div><TipHead name={t('xw_morale_att')} value={pct(x.moraleA)} hint={t('xw_break_hint')} /></div>} /></td>
          <td><Bar value={x.moraleD} color="#4d7a3a" tip={<div><TipHead name={t('xw_morale_def')} value={pct(x.moraleD)} hint={t('xw_break_hint')} /></div>} /></td></tr>)}
          {d.pursuit > 0 && <tr><td /><td class="muted">{t('xw_pursuit')}</td><td class="r">{d.winner === 'def' ? num(d.pursuit) : ''}</td><td class="r">{d.winner === 'att' ? num(d.pursuit) : ''}</td><td /><td /></tr>}</tbody></table>
    </Section>
    <Section title={t('xw_why')} id="rep-why">
      <ul class="xw-why">{d.reasons.map((k: string) => <li>{reasonText(k, d)}</li>)}</ul>
    </Section>
    {d.wars.length > 0 && <div class="act-row">{d.wars.map((w: number) => { const war = view.value?.wars.find((x) => x.id === w); return war ? <a class="lk" onClick={() => openPanel('peace', { war: w })}>{L(war.name)}</a> : null; })}</div>}
  </div>;
}
