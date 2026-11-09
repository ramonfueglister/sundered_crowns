// Exploration panel (spec points 91, 94): expeditions to unknown seas with their cost, time, risk and requirements
// before they sail, the expeditions at sea, and our chartered companies with what they hold and earn.
import { useState } from 'preact/hooks';
import './trade.css';
import { view } from '../../game/client';
import { Section, Row, NLink, Btn, Empty, Tabs, useQuery, act, t, L, num, pct, Tip, placeName, flyToLoc, daysText } from './common';
import { TipHead, Parts } from './explain';
import { keyName } from '../TopBar';

type Tab = 'expeditions' | 'companies';

export function ExploreTab() {
  const [tab, setTab] = useState<Tab>('expeditions');
  return <div class="explore-tab">
    <Tabs<Tab> tabs={[['expeditions', t('ex_tab_expeditions')], ['companies', t('ex_tab_companies')]]} value={tab} onChange={setTab} />
    {tab === 'expeditions' ? <Expeditions /> : <Companies />}
  </div>;
}

const needLabel = (k: string) => t(`ex_need_${k}`);
function Expeditions() {
  const [to, setTo] = useState<number | undefined>(undefined);
  const [fleet, setFleet] = useState(0);
  const [d, refresh] = useQuery<any>({ q: 'expedition', to, fleet }, [to, fleet], 2500);
  if (!d) return <Empty>{t('loading')}…</Empty>;
  const p = d.plan;
  const sel = d.targets.find((x: any) => x.to === d.to);
  return <>
    {d.atSea.length > 0 && <Section title={t('ex_at_sea')} id="ex-sea">
      {d.atSea.map((x: any) => <div class="kv"><span class="k">{x.region ? L(x.region) : '—'}</span>
        <span class="v"><Tip content={<div><TipHead name={x.region ? L(x.region) : t('ex_expedition')} value={`${x.days} ${t('days')}`} hint={t('ex_at_sea_hint')} />
          <div class="breakdown"><div class="bd-row"><span>{t('ex_charted')}</span><span>{x.found}</span></div><div class="bd-row"><span>{t('ex_on_land')}</span><span>{x.lands}</span></div>
            <div class="bd-row"><span>{t('ex_ships')}</span><span>{x.ships}</span></div><div class="bd-row"><span>{t('ex_places_left')}</span><span>{x.left}</span></div></div>
          {x.goods.length > 0 && <div>{t('ex_goods_seen')}: {x.goods.map((g: any) => L(g)).join(', ')}</div>}</div>}>
          <span class="has-tip">{x.days} {t('days')} · {x.found} {t('ex_charted_short')}</span></Tip></span></div>)}
    </Section>}
    <Section title={t('ex_plan')} id="ex-plan" right={<Tip content={<div><TipHead name={t('ex_expeditions')} value={`${d.atSea.length}/${d.max}`} hint={t('ex_limit_hint')} /></div>}><span class="muted has-tip">{d.atSea.length}/{d.max}</span></Tip>}>
      <div class="muted small">{t('ex_pick_target')}</div>
      <div class="ex-list">{d.targets.map((x: any) => <div class={`kv ${x.to === d.to ? 'on' : ''}`} onClick={() => setTo(x.to)}>
        <span class="k">{L(x.name)}</span>
        <span class="v"><Tip content={<div><TipHead name={L(x.name)} hint={t('ex_target_hint')} /><div class="breakdown"><div class="bd-row"><span>{t('ex_unknown_waters')}</span><span>{x.unknown} / {x.zones}</span></div><div class="bd-row"><span>{t('ex_distance')}</span><span>{num(x.km)} km</span></div></div></div>}>
          <span class="muted">{x.unknown}/{x.zones} · {num(x.km)} km</span></Tip></span></div>)}
        {!d.targets.length && <Empty>{t('ex_no_targets')}</Empty>}
      </div>
      {p && <>
        <div class="act-row"><span class="k">{t('ex_ships_from')}</span>
          <select value={fleet} onChange={(e) => setFleet(Number((e.target as HTMLSelectElement).value))}>
            <option value={0}>{t('ex_new_squadron')}</option>
            {d.fleets.filter((f: any) => !f.busy).map((f: any) => <option value={f.id}>{L(f.name)} ({f.ships})</option>)}
          </select>
        </div>
        <div class="grid2">
          <Row k={t('ex_target')} v={sel ? L(sel.name) : '—'} tip={<div><TipHead name={t('ex_target')} value={sel ? L(sel.name) : '—'} hint={t('ex_target_hint')} /></div>} />
          <Row k={t('ex_departure')} v={p.portName ? <a class="lk" onClick={() => flyToLoc(p.port)}>{placeName(L(p.portName))}</a> : '—'} tip={<div><TipHead name={t('ex_departure')} hint={fleet ? t('ex_departure_fleet') : t('ex_departure_hint')} /></div>} />
          <Row k={t('ex_ships')} v={`${p.ships} × ${p.unitName ? L(p.unitName) : '—'}`} tip={<div><TipHead name={t('ex_ships')} value={p.ships} hint={fleet ? t('ex_ships_fleet') : t('ex_ships_hint')} /></div>} />
          <Row k={t('ex_time')} v={`≈ ${daysText(p.days)}`} tip={<div><TipHead name={t('ex_time')} value={`${p.days} ${t('days')}`} hint={t('ex_time_hint')} /><div class="breakdown"><div class="bd-row"><span>{t('ex_distance')}</span><span>{num(p.km)} km</span></div><div class="bd-row"><span>{t('ex_route_zones')}</span><span>{p.path}</span></div><div class="bd-row"><span>{t('ex_voyage')}</span><span>{p.ocean ? t('ex_ocean') : t('ex_coastal')}</span></div></div></div>} />
          <Row k={t('ex_cost')} v={num(p.cost.total)} tip={() => <div><TipHead name={t('ex_cost')} value={num(p.cost.total)} hint={t('ex_cost_hint')} />
            <Parts rows={[['ex_cost_ships', p.cost.ships], ['ex_cost_provisions', p.cost.provisions]]} digits={0} total={p.cost.total} />
            <div class="muted small">{t('ex_provisions_rule')}: {p.cost.months} × {p.ships} × 40 × {num(p.priceLevel, 2)}</div></div>} />
          <Row k={t('ex_risk')} v={<span class={p.risk.loseOne > 0.1 ? 'neg' : ''}>{pct(p.risk.loseOne, 0)}</span>} tip={() => <div><TipHead name={t('ex_risk')} value={pct(p.risk.loseOne, 1)} hint={t('ex_risk_hint')} />
            <div class="breakdown"><div class="bd-row"><span>{t('ex_far_places')}</span><span>{p.risk.farSteps}</span></div><div class="bd-row"><span>{t('ex_loss_each')}</span><span>1 %</span></div>
              <div class="bd-row"><span>{t('ex_expected_loss')}</span><span>{num(p.risk.expected, 2)}</span></div><div class="bd-row bd-total"><span>{t('ex_all_lost')}</span><span>{pct(p.risk.loseAll, 2)}</span></div></div></div>} />
        </div>
        <div class="bd-title">{t('ex_requirements')}</div>
        <div class="ex-needs">{p.needs.map((n: any) => <Tip content={<div><TipHead name={needLabel(n.key)} value={n.need !== undefined ? `${num(n.have ?? 0)} / ${num(n.need)}` : n.ok ? '✔' : '✘'} hint={t(`ex_need_${n.key}_hint`)} /></div>}>
          <span class={n.ok ? 'ok' : 'no'}>{n.ok ? '✔' : '✘'} {needLabel(n.key)}{n.need !== undefined ? ` ${num(n.have ?? 0)}/${num(n.need)}` : ''}</span></Tip>)}</div>
        <div class="act-row"><span class="spacer" />
          <Btn cls="gold" disabled={p.refusal} tip={t('ex_send_hint')} onClick={() => act({ t: 'explore', fleet, to: d.to }, 'page', t('ex_sent')).then(() => { setFleet(0); refresh(); })}>{t('ex_send')}</Btn></div>
      </>}
    </Section>
  </>;
}

function Companies() {
  const [d, refresh] = useQuery<any>({ q: 'companies' }, [], 3000);
  const startYear = view.value?.startYear ?? 1356;
  if (!d) return <Empty>{t('loading')}…</Empty>;
  const free = d.slots - d.mine.length;
  return <>
    <Section title={t('ex_companies')} id="ex-co" right={<Tip content={<div><TipHead name={t('ex_charters')} value={`${d.mine.length}/${d.slots}`} hint={t('ex_slots_hint')} /></div>}><span class="muted has-tip">{d.mine.length}/{d.slots}</span></Tip>}>
      {d.mine.length ? d.mine.map((c: any) => <div class="company">
        <div class="kv"><span class="k"><b>{L(c.name)}</b></span><span class="v muted">{t('since')} {Math.floor(startYear + c.since / 365.25)}</span></div>
        <div class="grid2">
          <Row k={t('market')} v={placeName(c.marketName)} tip={<div><TipHead name={t('market')} value={placeName(c.marketName)} hint={t('ex_co_market_hint')} /><div class="breakdown"><div class="bd-row"><span>{t('tr_value')}</span><span>{num(c.tv, 1)}</span></div></div></div>} />
          <Row k={t('ex_co_holdings')} v={`${c.holdings} · ${num(c.dev)}`} tip={<div><TipHead name={t('ex_co_holdings')} value={c.holdings} hint={t('ex_co_holdings_hint')} /><div class="breakdown"><div class="bd-row"><span>{t('development')}</span><span>{num(c.dev, 1)}</span></div></div></div>} />
          <Row k={t('ex_co_income')} v={<span class="pos">+{num(c.income, 1)}</span>} tip={<div><TipHead name={keyName('company')} value={num(c.income, 2)} hint={t('ex_co_income_hint')} /></div>} />
          <Row k={t('ex_co_ships')} v={num(c.ships, 1)} tip={<div><TipHead name={t('ex_co_ships')} value={num(c.ships, 1)} hint={t('ex_co_ships_hint')} /></div>} />
          <Row k={t('tr_share')} v={pct(c.share, 1)} tip={() => <div><TipHead name={t('tr_power')} value={num(c.power, 0)} hint={t('tr_power_hint')} /><Parts rows={c.parts} digits={0} /><div class="breakdown"><div class="bd-row"><span>{t('tr_trade_effects')}</span><span>× {num(c.mult, 2)}</span></div><div class="bd-row bd-total"><span>{t('tr_share')}</span><span>{pct(c.share, 1)}</span></div></div></div>} />
          <Row k={t('ex_co_home_trade')} v={num(c.withHome, 1)} tip={<div><TipHead name={t('ex_co_home_trade')} value={num(c.withHome, 1)} hint={t('ex_co_home_trade_hint')} /><div class="muted">{placeName(c.marketName)} ⇄ {placeName(c.homeName)}</div></div>} />
        </div>
      </div>) : <div class="muted small">{t('ex_no_companies')}</div>}
    </Section>
    <Section title={t('ex_charter')} id="ex-charter">
      <div class="ex-needs">
        <Tip content={<div><TipHead name={t('ex_need_commerce')} value={`${d.commerce} / ${d.need}`} hint={t('ex_charter_commerce_hint')} /></div>}><span class={d.commerce >= d.need ? 'ok' : 'no'}>{d.commerce >= d.need ? '✔' : '✘'} {t('ex_need_commerce')} {d.commerce}/{d.need}</span></Tip>
        <Tip content={<div><TipHead name={t('ex_charters')} value={`${d.mine.length}/${d.slots}`} hint={t('ex_slots_hint')} /></div>}><span class={free > 0 ? 'ok' : 'no'}>{free > 0 ? '✔' : '✘'} {t('ex_charters')} {d.mine.length}/{d.slots}</span></Tip>
        <Tip content={<div><TipHead name={t('ex_cost')} value={num(d.cost)} hint={t('ex_charter_cost_hint')} /></div>}><span class={d.treasury >= d.cost ? 'ok' : 'no'}>{d.treasury >= d.cost ? '✔' : '✘'} {t('ex_cost')} {num(d.cost)}</span></Tip>
      </div>
      {d.options.length ? d.options.map((o: any) => <div class="kv"><span class="k">{placeName(o.name)}</span><span class="v"><Tip content={<div><TipHead name={placeName(o.name)} hint={t('ex_charter_option_hint')} /><div class="breakdown"><div class="bd-row"><span>{t('tr_value')}</span><span>{num(o.tv, 1)}</span></div></div></div>}><span class="muted has-tip">{num(o.tv, 0)}</span></Tip>
        <Btn disabled={d.commerce < d.need ? 'our merchants are not ready (Commerce 12)' : free <= 0 ? 'no charter available' : d.treasury < d.cost ? 'not enough gold' : null} onClick={() => act({ t: 'charter', market: o.market }, 'coins').then(refresh)}>{t('ex_charter_do')}</Btn></span></div>)
        : <div class="muted small">{t('ex_no_charter_options')}</div>}
    </Section>
  </>;
}
void NLink;
