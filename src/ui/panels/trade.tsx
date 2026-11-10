// Trade panel (spec points 27, 47, 48, 54): a market's trade power with its breakdown, our merchants (send, recall,
// collect or steer home, with the expected gain), the goods with their producers, consumers, prices and what drives
// them, and our trade policy (tariff, agreements, embargoes). Numbers come from src/game/tradeview.ts.
import { useState, useEffect } from 'preact/hooks';
import './trade.css';
import { view, nations } from '../../game/client';
import { playerId, panelArg } from '../store';
import { Section, Row, NLink, Btn, Empty, Tabs, Slider, Spark, useQuery, act, t, L, num, signed, pct, Tip, placeName, flyToLoc } from './common';
import { TipHead, Parts } from './explain';
import { keyName } from '../TopBar';

type Tab = 'market' | 'goods' | 'policy';

export function TradeTab() {
  const pv = view.value?.player;
  const [tab, setTab] = useState<Tab>('market');
  const [sel, setSel] = useState(-1);
  // another panel may open us on a market (the economy panel's market summary)
  const askMarket = panelArg.value?.market;
  useEffect(() => { if (typeof askMarket === 'number' && askMarket >= 0) { setSel(askMarket); setTab('market'); } }, [askMarket]);
  const home = pv?.homeMarket ?? -1;
  const mid = sel >= 0 ? sel : home;
  const [list] = useQuery<any[]>({ q: 'tmarkets' }, [], 3000);
  if (!pv) return <Empty>{t('loading')}…</Empty>;
  return <div class="trade-tab">
    <Tabs<Tab> tabs={[['market', t('tr_tab_market')], ['goods', t('tr_tab_goods')], ['policy', t('tr_tab_policy')]]} value={tab} onChange={setTab} />
    {tab !== 'policy' && <div class="act-row">
      <span class="k">{t('market')}</span>
      <select value={mid} onChange={(e) => setSel(Number((e.target as HTMLSelectElement).value))}>
        {(list ?? []).map((m: any) => <option value={m.id}>{placeName(m.name)}{m.home ? ` (${t('home')})` : ''}{m.merchants ? ` · ${m.merchants} ${t('tr_merchants_short')}${m.steer ? ' ➜' : ''}` : ''}{m.share >= 0.005 ? ` · ${pct(m.share, 0)}` : ''}</option>)}
      </select>
      {sel >= 0 && sel !== home && home >= 0 && <Btn onClick={() => setSel(-1)}>{t('tr_home_market')}</Btn>}
    </div>}
    {tab === 'market' && (mid >= 0 ? <MarketView mid={mid} /> : <Empty>{t('tr_no_home')}</Empty>)}
    {tab === 'market' && <OurMarkets list={list ?? []} pick={setSel} />}
    {tab === 'goods' && (mid >= 0 ? <GoodsView mid={mid} /> : <Empty>{t('tr_no_home')}</Empty>)}
    {tab === 'policy' && <PolicyView />}
  </div>;
}

// ---------------------------------------------------------------- market and trade power
function PowerTip({ r, total }: { r: any; total: number }) {
  return <div>
    <TipHead name={<>{L(nations.value[r.n]?.short)} · {t('tr_power')}</>} value={num(r.total, 0)} hint={t('tr_power_hint')} />
    <Parts rows={r.parts} digits={0} total={r.parts.reduce((p: number, x: [string, number]) => p + x[1], 0)} totalLabel={t('tr_power_raw')} />
    {r.merchantN > 0 && <div class="muted small">{t('tr_merchants_here')}: {r.merchantN}{r.crowd < 1 ? ` · ${t('tr_crowded')} × ${num(r.crowd, 2)}` : ''}</div>}
    {r.shipN > 0 && <div class="muted small">{t('tr_ships_here')}: {num(r.shipN, 1)}</div>}
    <div class="breakdown"><div class="bd-row"><span>{t('tr_trade_effects')}</span><span>× {num(r.mult, 2)}</span></div>
      {r.blocked && <div class="bd-row neg"><span>{t('tr_blocked')}</span><span>× 0</span></div>}
      <div class="bd-row bd-total"><span>{t('tr_power')}</span><span>{num(r.total, 0)}</span></div>
      <div class="bd-row"><span>{t('tr_share')}</span><span>{pct(total > 0 ? r.total / total : 0, 1)}</span></div></div>
  </div>;
}

function MarketView({ mid }: { mid: number }) {
  const [d, refresh] = useQuery<any>({ q: 'tmarket', market: mid }, [mid], 2000);
  const pid = playerId.value;
  if (!d) return <Empty>{t('loading')}…</Empty>;
  const top = d.rows.slice(0, 12);
  const mine = d.rows.find((r: any) => r.n === pid);
  const rest = d.rows.slice(12).filter((r: any) => r.n !== pid);
  const restSum = rest.reduce((p: number, r: any) => p + r.total, 0);
  return <>
    <Section title={<>{t('market')}: {placeName(d.name)}</>} id="tr-mkt" right={<a class="lk" onClick={() => flyToLoc(d.hub)}>{placeName(L(d.hubName))}</a>}>
      <div class="grid2">
        <Row k={t('tr_value')} v={num(d.tv, 1)} tip={<div><TipHead name={t('tr_value')} value={num(d.tv, 1)} hint={t('tr_value_hint')} /></div>} />
        <Row k={t('tr_steered_in')} v={num(d.tin, 1)} tip={<div><TipHead name={t('tr_steered_in')} value={num(d.tin, 1)} hint={t('tr_steered_in_hint')} /></div>} />
        <Row k={t('tr_our_share')} v={pct(d.our?.share ?? 0, 1)} tip={() => mine ? <PowerTip r={mine} total={d.total} /> : <div>{t('tr_no_power')}</div>} />
        <Row k={t('tr_our_income')} v={<span class="pos">+{num(d.our?.paid ?? 0, 1)}</span>} tip={() => <OurIncomeTip d={d} />} />
        <Row k={t('price_index')} v={<span class={d.priceIndex > 1.2 ? 'neg' : d.priceIndex < 0.85 ? 'pos' : ''}>{num(d.priceIndex, 2)}</span>} tip={() => <PriceIndexTip index={d.priceIndex} parts={d.index} />} />
      </div>
      <div class="tbl-wrap"><table class="tbl tr-power">
        <thead><tr><th>{t('realm')}</th><th class="r">{t('tr_power')}</th><th class="r">{t('tr_share')}</th><th class="r">{t('tr_income')}</th><th>{t('tr_mode')}</th></tr></thead>
        <tbody>
          {top.map((r: any) => <PowerRow r={r} d={d} pid={pid} />)}
          {mine && !top.includes(mine) && <PowerRow r={mine} d={d} pid={pid} />}
          {rest.length > 0 && <tr class="muted"><td>{t('tr_others')} ({rest.length})</td><td class="r">{num(restSum, 0)}</td><td class="r">{pct(d.total > 0 ? restSum / d.total : 0, 1)}</td><td /><td /></tr>}
        </tbody>
      </table></div>
      {d.rows.length === 0 && <div class="muted small">{t('tr_no_power')}</div>}
    </Section>
    {d.our && <Merchants d={d} refresh={refresh} />}
    <Section title={t('trade_links')} id="tr-links" open={false}>
      <div class="chips">{d.links.map((l: any) => <span class="chip">{placeName(l.name)}{l.sea ? ' ⚓' : ''}{l.ocean ? ' 🌊' : ''}</span>)}</div>
    </Section>
  </>;
}

/** The price index of a market and the goods that move it most (src/game/tradeview.ts priceIndexParts): each good's
 *  price against its base, its weight in what the market bought, and its pull on the index. */
export function PriceIndexTip({ index, parts }: { index: number; parts: any }) {
  return <div><TipHead name={t('price_index')} value={num(index, 2)} hint={t('x_price_index_how')} />
    {parts?.top?.length > 0 && <div class="breakdown">
      <div class="bd-row bd-cols"><span>{t('x_price_index_good')}</span><span>{t('x_price_index_rel')} · {t('x_price_index_weight')} · {t('x_price_index_pull')}</span></div>
      <div class="bd-row"><span>{t('x_price_index_base')}</span><span>{num(1, 2)}</span></div>
      {parts.top.map((x: any) => <div class="bd-row"><span>{L(x.name)}</span><span>× {num(x.rel, 2)} · {pct(x.share, 0)} · <b class={x.pull > 0.005 ? 'neg' : x.pull < -0.005 ? 'pos' : ''}>{signed(x.pull, 2)}</b></span></div>)}
      {parts.goods > parts.top.length && <div class="bd-row"><span>{t('x_price_index_rest').replace('{n}', String(parts.goods - parts.top.length))}</span><span><b>{signed(parts.rest, 2)}</b></span></div>}
      <div class="bd-row bd-total"><span>{t('price_index')}</span><span>{num(index, 2)}</span></div>
    </div>}
  </div>;
}

/** What we took in this market last month, exactly as paid: our share of its own trade and of the trade steered in
 *  (by the market it came from); and what our merchants here steered home earned us where it arrived. */
function OurIncomeTip({ d }: { d: any }) {
  const o = d.our; if (!o) return <div>{t('tr_no_power')}</div>;
  const rows: [string, number][] = [[t('tr_own_share'), o.own], ...o.fromIn.map((x: any) => [t('tr_steered_from').replace('{m}', placeName(x.name)), x.v] as [string, number])];
  const home = o.homeRows.reduce((p: number, x: any) => p + x.v, 0);
  return <div><TipHead name={t('tr_our_income')} value={num(o.paid, 2)} hint={t('tr_our_income_hint')} />
    <Parts rows={rows} total={o.paid} digits={2} />
    {o.homeRows.length > 0 && <Parts title={<>{t('tr_from_here_home')} ({num(o.steered, 2)} {t('tr_sent_short')})</>} rows={o.homeRows.map((x: any) => [t('tr_arrived_at').replace('{m}', placeName(x.name)), x.v] as [string, number])} total={home} digits={2} />}
    {o.homeRows.length > 0 && <div class="muted small">{t('tr_from_here_home_hint')}</div>}
  </div>;
}

/** Our trade income of last month by market: the markets that earned us something or hold our merchants, the trade
 *  steered home credited to the market it came from; the column adds up to the ledger's trade and company lines. */
function OurMarkets({ list, pick }: { list: any[]; pick: (m: number) => void }) {
  const p = view.value?.player;
  const rows = list.filter((m) => m.earned > 0.005 || m.merchants > 0).sort((a, b) => b.earned - a.earned || a.id - b.id);
  if (!rows.length) return null;
  const sum = rows.reduce((q, m) => q + m.earned, 0);
  const ledger = (p?.incomeBreak.trade ?? 0) + (p?.incomeBreak.company ?? 0);
  return <Section title={t('tr_by_market')} id="tr-ours">
    <div class="tbl-wrap"><table class="tbl tr-ours">
      <thead><tr><th>{t('market')}</th><th class="r">{t('merchants')}</th><th class="r">{t('tr_share')}</th><Tip tag="th" class="r" content={<div><TipHead name={t('tr_earned')} hint={t('tr_earned_hint')} /></div>}>{t('tr_earned')}</Tip></tr></thead>
      <tbody>{rows.map((m) => <tr class="click" onClick={() => pick(m.id)}>
        <td>{placeName(m.name)}{m.home ? ` (${t('home')})` : ''}</td>
        <td class="r">{m.merchants ? <>{m.merchants}{m.steer ? ' ➜' : ''}</> : '—'}</td>
        <td class="r">{pct(m.share, 1)}</td>
        <td class="r"><Tip content={() => <div><TipHead name={placeName(m.name)} value={num(m.earned, 2)} hint={t('tr_earned_hint')} />
          <Parts rows={[...(m.own > 0 ? [[m.company ? keyName('company') : t('tr_own_share'), m.own] as [string, number]] : []), ...m.steeredHome.map((x: any) => [t('tr_arrived_at').replace('{m}', placeName(x.name)), x.v] as [string, number])]} total={m.earned} digits={2} /></div>}>
          <span class={m.earned > 0 ? 'pos' : 'muted'}>{m.earned > 0 ? `+${num(m.earned, 1)}` : '0'}</span></Tip></td>
      </tr>)}</tbody>
      <tfoot><tr class="bd-total"><td colSpan={3}><Tip content={<div><TipHead name={t('tr_earned_sum')} value={num(sum, 1)} hint={t('tr_earned_sum_hint')} /><div class="breakdown"><div class="bd-row"><span>{keyName('trade')}</span><span>{num(p?.incomeBreak.trade ?? 0, 1)}</span></div><div class="bd-row"><span>{keyName('company')}</span><span>{num(p?.incomeBreak.company ?? 0, 1)}</span></div><div class="bd-row bd-total"><span>=</span><span>{num(ledger, 1)}</span></div></div></div>}><span class="has-tip">{t('tr_earned_sum')}</span></Tip></td><td class="r pos">+{num(sum, 1)}</td></tr></tfoot>
    </table></div>
  </Section>;
}

function PowerRow({ r, d, pid }: { r: any; d: any; pid: number }) {
  return <tr class={r.n === pid ? 'mine' : ''}>
    <td><NLink id={r.n} /></td>
    <td class="r"><Tip content={() => <PowerTip r={r} total={d.total} />}>{num(r.total, 0)}</Tip></td>
    <td class="r"><Tip content={() => <PowerTip r={r} total={d.total} />}>{pct(r.share, 1)}</Tip></td>
    <td class="r"><Tip content={<div><TipHead name={t('tr_income')} value={num(r.paid, 2)} hint={t('tr_income_hint')} />{r.steered > 0 && <div class="muted">{t('tr_sent_home')}: {num(r.steered, 2)}</div>}</div>}>{num(r.paid, 1)}</Tip></td>
    <td>{r.blocked ? <span class="neg">{t('tr_blocked_short')}</span> : r.steer ? <Tip content={t('tr_steers_hint')}><span>➜ {t('tr_steers')}</span></Tip> : r.merchantN > 0 ? <span>{t('tr_collects')}</span> : <span class="muted">—</span>}</td>
  </tr>;
}

function gainText(v: number | null) { return v === null ? '' : `${v >= 0 ? '+' : '−'}${num(Math.abs(v), 1)}`; }
function GainTip({ name, v, hint, d, steer = false }: { name: string; v: number | null; hint: string; d: any; steer?: boolean }) {
  return <div><TipHead name={name} value={v === null ? '—' : `${gainText(v)} ${t('x_per_month')}`} hint={hint} />
    <div class="breakdown"><div class="bd-row"><span>{t('tr_trade_now')}</span><span>{num(d.our.gains.now, 1)}</span></div>
      {v !== null && <div class="bd-row bd-total"><span>{t('tr_trade_then')}</span><span>{num(d.our.gains.now + v, 1)}</span></div>}</div>
    <div class="muted small">{t('tr_gain_basis')}</div>{steer && <div class="muted small">{t('tr_gain_steer_note')}</div>}</div>;
}

function Merchants({ d, refresh }: { d: any; refresh: () => void }) {
  const o = d.our; const g = o.gains;
  const send = (amount: number, steer?: boolean) => act({ t: 'merchant', market: d.id, amount, steer }, 'coins').then(refresh);
  const why = o.refusal ?? (o.free <= 0 ? 'no merchants left' : null);
  const home = d.id === o.home;
  return <Section title={t('tr_our_merchants')} id="tr-merch" right={<Tip content={<div><TipHead name={t('merchants')} value={`${o.used}/${o.cap}`} hint={t('merchant_hint')} /></div>}><span class="muted has-tip">{t('merchants')}: {o.used}/{o.cap}</span></Tip>}>
    <div class="act-row"><span>{t('tr_here')}: <b>{o.have}</b> {o.have > 0 ? (o.steer ? `➜ ${t('tr_steers')}` : t('tr_collects')) : ''}</span>
      <span class="spacer" />
      <Tip content={<div><TipHead name={t('tr_range')} value={num(o.reach, 2)} hint={t('tr_range_hint')} /><div class="breakdown"><div class="bd-row"><span>{t('tr_distance_here')}</span><span>{isFinite(o.cost) ? num(o.cost, 2) : '—'}</span></div></div></div>}>
        <span class={`muted has-tip ${isFinite(o.cost) && o.cost > o.reach ? 'neg' : ''}`}>{t('tr_range')}: {isFinite(o.cost) ? num(o.cost, 2) : '—'} / {num(o.reach, 2)}</span></Tip>
    </div>
    <div class="tr-merch-btns">
      <Btn disabled={why} tip={() => <GainTip name={t('tr_send_collect')} v={g.addCollect} hint={o.have > 0 && o.steer ? t('tr_send_collect_switch_hint') : t('tr_send_collect_hint')} d={d} />} onClick={() => send(o.have + 1, false)}>
        {t('tr_send_collect')} {g.addCollect !== null && <span class={g.addCollect >= 0 ? 'pos' : 'neg'}>{gainText(g.addCollect)}</span>}</Btn>
      {!home && <Btn disabled={why ?? (!o.route ? 'no trade route home' : null)} tip={() => <GainTip name={t('tr_send_steer')} v={g.addSteer ?? (o.steer ? g.add : null)} hint={t('tr_send_steer_hint')} d={d} steer />} onClick={() => send(o.have + 1, true)}>
        {t('tr_send_steer')} {(g.addSteer ?? (o.steer ? g.add : null)) !== null && <span class={(g.addSteer ?? g.add) >= 0 ? 'pos' : 'neg'}>{gainText(g.addSteer ?? g.add)}</span>}</Btn>}
      <Btn disabled={o.have <= 0 ? 'none' : null} tip={() => <GainTip name={t('tr_recall')} v={g.recall} hint={t('tr_recall_hint')} d={d} />} onClick={() => send(o.have - 1)}>
        {t('tr_recall')} {g.recall !== null && <span class={g.recall >= 0 ? 'pos' : 'neg'}>{gainText(g.recall)}</span>}</Btn>
      {o.have > 0 && !home && <Btn disabled={!o.route ? 'no trade route home' : null} tip={() => <GainTip name={o.steer ? t('tr_to_collect') : t('tr_to_steer')} v={g.toggle} hint={t('tr_toggle_hint')} d={d} steer={!o.steer} />} onClick={() => send(o.have, !o.steer)}>
        {o.steer ? t('tr_to_collect') : t('tr_to_steer')} {g.toggle !== null && <span class={g.toggle >= 0 ? 'pos' : 'neg'}>{gainText(g.toggle)}</span>}</Btn>}
    </div>
    {!home && (o.route
      ? <Tip content={<div><TipHead name={t('tr_route_home')} value={`× ${num(o.route.factor, 2)}`} hint={t('tr_route_hint')} /><div class="breakdown"><div class="bd-row"><span>{t('tr_links')}</span><span>{o.route.hops}</span></div><div class="bd-row"><span>{t('tr_bonus')}</span><span>× {num(o.route.bonus, 2)}</span></div><div class="bd-row"><span>{t('tr_loss_per_link')}</span><span>× {num(o.route.loss, 2)}</span></div></div></div>}>
        <div class="muted small has-tip">{t('tr_route_home')}: {placeName(d.name)} → {o.route.via.map(placeName).join(' → ')} (× {num(o.route.factor, 2)})</div></Tip>
      : <div class="muted small">{t('tr_no_route_home')}</div>)}
    {home && <div class="muted small">{t('tr_home_note')}</div>}
  </Section>;
}

// ---------------------------------------------------------------- goods
function GoodsView({ mid }: { mid: number }) {
  const [d] = useQuery<any>({ q: 'tmarket', market: mid }, [mid], 3000);
  const [g, setG] = useState(-1);
  if (!d) return <Empty>{t('loading')}…</Empty>;
  const goods = d.goods.filter((x: any) => x.supply > 0.01 || x.demand > 0.01).sort((a: any, b: any) => b.demand * b.price - a.demand * a.price);
  const cur = g >= 0 ? g : goods[0]?.k ?? 0;
  return <>
    <Section title={<>{t('goods')}: {placeName(d.name)}</>} id="tr-goods">
      <div class="tbl-wrap"><table class="tbl market tr-goods">
        <thead><tr><th>{t('goods')}</th><th class="r">{t('price')}</th><th class="r">{t('vs_base')}</th><th class="r">{t('supply')}</th><th class="r">{t('demand')}</th><th class="r">{t('tr_net_exports')}</th><th>{t('tr_two_years')}</th></tr></thead>
        <tbody>{goods.map((x: any) => { const rel = x.price / Math.max(1e-6, x.base) - 1; return <tr class={`click ${x.k === cur ? 'mine' : ''}`} onClick={() => setG(x.k)}>
          <td>{L(x.name)}</td>
          <td class="r"><Tip content={<div><TipHead name={L(x.name)} value={num(x.price, 2)} hint={t('tr_click_good')} /></div>}>{num(x.price, 2)}</Tip></td>
          <td class={`r ${rel > 0.15 ? 'neg' : rel < -0.15 ? 'pos' : ''}`}><Tip content={<div><TipHead name={t('vs_base')} value={`${signed(rel * 100, 0)} %`} hint={t('tr_vs_base_hint')} /><div class="breakdown"><div class="bd-row"><span>{t('base_price')}</span><span>{num(x.base, 2)}</span></div></div></div>}>{signed(rel * 100, 0)} %</Tip></td>
          <td class="r"><Tip content={t('x_supply_hint')}>{num(x.supply, x.supply < 10 ? 1 : 0)}</Tip></td>
          <td class="r"><Tip content={t('x_demand_hint')}>{num(x.demand, x.demand < 10 ? 1 : 0)}</Tip></td>
          <td class={`r ${x.net > 0 ? 'pos' : x.net < 0 ? 'neg' : ''}`}><Tip content={t('tr_net_exports_hint')}>{signed(x.net, x.net && Math.abs(x.net) < 10 ? 1 : 0)}</Tip></td>
          <td><Spark data={x.hist} base={x.base} w={70} h={16} /></td>
        </tr>; })}</tbody>
      </table></div>
    </Section>
    <GoodDetail mid={mid} g={cur} />
  </>;
}

function PriceChart({ hist, base, anchor }: { hist: number[]; base: number; anchor: number }) {
  const W = 420, H = 110, pad = 34;
  if (hist.length < 2) return <div class="muted small">{t('history_empty')}</div>;
  const lo = Math.min(...hist, anchor) * 0.95, hi = Math.max(...hist, anchor) * 1.05;
  const x = (i: number) => pad + (i / (hist.length - 1)) * (W - pad - 6), y = (v: number) => H - 16 - ((v - lo) / Math.max(1e-9, hi - lo)) * (H - 24);
  const line = hist.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return <svg class="chart tr-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
    {[lo, (lo + hi) / 2, hi].map((v) => <g><line x1={pad} x2={W - 6} y1={y(v)} y2={y(v)} stroke="#b9a072" stroke-width={0.5} stroke-dasharray="3 3" /><text x={pad - 4} y={y(v) + 3} text-anchor="end" class="ax">{num(v, 2)}</text></g>)}
    <line x1={pad} x2={W - 6} y1={y(anchor)} y2={y(anchor)} stroke="#6b4a1c" stroke-width={0.9} stroke-dasharray="5 3" />
    <path d={line} fill="none" stroke="#7a4e1c" stroke-width={1.8} />
    <text x={pad} y={H - 3} class="ax">−{hist.length - 1} {t('tr_months')}</text><text x={W - 6} y={H - 3} text-anchor="end" class="ax">{t('tr_now')}</text>
    <text x={W - 6} y={10} text-anchor="end" class="ax">— {t('price')}  - - {t('tr_anchor')} ({num(base, 2)})</text>
  </svg>;
}

function GoodDetail({ mid, g }: { mid: number; g: number }) {
  const [d] = useQuery<any>({ q: 'tgood', market: mid, good: g }, [mid, g], 3000);
  if (!d) return <Empty>{t('loading')}…</Empty>;
  const cons = d.people + d.crafts + d.house;
  const drivers: [string, number][] = [['tr_d_base', d.base], ['tr_d_level', d.priceLevel], ['tr_d_debase', d.debase]];
  return <Section title={<>{L(d.name)} · {placeName(d.marketName)}</>} id="tr-good">
    <PriceChart hist={d.hist} base={d.anchor} anchor={d.anchor} />
    <div class="grid2">
      <Row k={t('price')} v={num(d.price, 2)} tip={() => <div><TipHead name={t('tr_price_drivers')} value={num(d.price, 2)} hint={t('tr_price_drivers_hint')} />
        <Parts product base={(v) => num(v, 2)} rows={drivers} total={d.anchor} totalLabel={t('tr_anchor')} />
        <div class="breakdown"><div class="bd-row"><span>{t('demand')} : {t('supply')}</span><span>{num(d.demand, 1)} : {num(d.supply, 1)}</span></div>
          <div class="bd-row"><span>{t('tr_pressure')}</span><span class={d.step > 1 ? 'neg' : d.step < 1 ? 'pos' : ''}>× {num(d.step, 3)} {t('tr_per_month')}</span></div>
          <div class="bd-row"><span>{t('tr_pull_anchor')}</span><span>4 % {t('tr_per_month')}</span></div>
          <div class="bd-row"><span>{t('tr_net_exports')}</span><span>{signed(d.net, 1)}</span></div>
          <div class="bd-row"><span>{t('tr_stock')}</span><span>{num(d.stock, 1)}</span></div></div></div>} />
      <Row k={t('tr_pressure')} v={<span class={d.step > 1.001 ? 'neg' : d.step < 0.999 ? 'pos' : ''}>{d.step > 1.001 ? t('tr_rising') : d.step < 0.999 ? t('tr_falling') : t('tr_steady')}</span>} tip={<div><TipHead name={t('tr_pressure')} value={`× ${num(d.step, 3)}`} hint={t('tr_pressure_hint')} /></div>} />
      <Row k={t('x_made_now')} v={num(d.made, 1)} tip={<div><TipHead name={t('x_made_now')} value={num(d.made, 1)} hint={t('x_made_now_hint')} /><div class="breakdown"><div class="bd-row"><span>{t('tr_ours')}</span><span>{num(d.ours.made, 1)}</span></div></div></div>} />
      <Row k={t('x_used_now')} v={num(cons, 1)} tip={() => <div><TipHead name={t('x_used_now')} value={num(cons, 1)} hint={t('x_used_now_hint')} /><Parts rows={[['tr_c_people', d.people], ['tr_c_crafts', d.crafts], ['tr_c_house', d.house]]} total={cons} /><div class="muted">{t('tr_ours')}: {num(d.ours.used, 1)}</div></div>} />
    </div>
    {d.books && <GoodBooks d={d} />}
    {!d.ready && <div class="muted small">{t('tr_after_month')}</div>}
    <div class="tr-cols">
      <div>
        <div class="bd-title">{t('tr_producers')}</div>
        {d.producers.length ? d.producers.map((p: any) => <div class="kv"><a class="k lk" onClick={() => flyToLoc(p.loc)}>{placeName(L(p.name))}</a><span class="v"><Tip content={<div><TipHead name={placeName(L(p.name))} value={num(p.q, 1)} hint={t('tr_per_month')} />{p.owner >= 0 && <NLink id={p.owner} />}</div>}>{num(p.q, 1)}</Tip></span></div>) : <div class="muted small">{t('x_nothing')}</div>}
        <div class="bd-title">{t('tr_by_realm')}</div>
        {d.producerRealms.map((r: any) => <div class="kv"><span class="k">{r.n >= 0 ? <NLink id={r.n} /> : t('tr_unclaimed')}</span><span class="v">{num(r.q, 1)} <small class="muted">{pct(d.made > 0 ? r.q / d.made : 0, 0)}</small></span></div>)}
      </div>
      <div>
        <div class="bd-title">{t('tr_consumers')}</div>
        {d.consumers.length ? d.consumers.map((c: any) => <div class="kv"><a class="k lk" onClick={() => flyToLoc(c.loc)}>{placeName(L(c.name))}</a><span class="v"><Tip content={() => <div><TipHead name={placeName(L(c.name))} value={num(c.q, 1)} hint={t('tr_per_month')} /><Parts rows={[['tr_c_people', c.people], ['tr_c_crafts', c.crafts], ['tr_c_house', c.house]]} total={c.q} /></div>}>{num(c.q, 1)}</Tip></span></div>) : <div class="muted small">{t('x_nothing')}</div>}
        <div class="bd-title">{t('tr_by_realm')}</div>
        {d.consumerRealms.map((r: any) => <div class="kv"><span class="k">{r.n >= 0 ? <NLink id={r.n} /> : t('tr_unclaimed')}</span><span class="v">{num(r.q, 1)} <small class="muted">{pct(cons > 0 ? r.q / cons : 0, 0)}</small></span></div>)}
      </div>
    </div>
    {d.partners.length > 0 && <><div class="bd-title">{t('tr_partners_good')}</div>
      {d.partners.map((p: any) => <div class="kv"><span class="k">{p.out ? '→' : '←'} {placeName(p.name)}</span><span class="v"><Tip content={<div><TipHead name={p.out ? t('tr_export') : t('tr_import')} value={num(p.value, 1)} hint={t('tr_flow_hint')} /><div class="breakdown"><div class="bd-row"><span>{t('tr_quantity')}</span><span>{num(p.qty, 1)}</span></div></div></div>}>{num(p.qty, 1)} · {num(p.value, 0)}</Tip></span></div>)}</>}
  </Section>;
}

/** Last month's supply and demand of a good as the market's clearing counted them, adding up to the goods table. */
function GoodBooks({ d }: { d: any }) {
  const b = d.books;
  const dg = (v: number) => (Math.abs(v) < 10 ? 1 : 0);
  return <div class="cols2 tr-books">
    <Parts title={<Tip content={<div><TipHead name={t('supply')} value={num(d.supply, 1)} hint={t('x_books_supply_hint')} /></div>}><span class="has-tip">{t('supply')}</span></Tip>}
      rows={[[t('x_books_made'), b.made], [t('x_books_net_in'), b.netIn], [t('x_books_held'), b.held]]} total={d.supply} digits={dg(d.supply)} totalLabel={t('supply')} />
    <Parts title={<Tip content={<div><TipHead name={t('demand')} value={num(d.demand, 1)} hint={t('x_books_demand_hint')} /></div>}><span class="has-tip">{t('demand')}</span></Tip>}
      rows={[[t('tr_c_people'), b.people], [t('x_books_rest'), b.rest]]} fmt={(v) => num(v, dg(d.demand))} total={d.demand} digits={dg(d.demand)} totalLabel={t('demand')} />
    {b.unmet > 0.05 && <div class="neg small">{t('x_books_unmet')}: {num(b.unmet, dg(b.unmet))} ({pct(d.demand > 0 ? b.unmet / d.demand : 0, 0)})</div>}
    {b.left > 0.05 && <div class="muted small">{t('x_books_left')}: {num(b.left, dg(b.left))} · {t('tr_stock')} {num(d.stock, dg(d.stock))}</div>}
  </div>;
}

// ---------------------------------------------------------------- policy
function PolicyView() {
  const [d, refresh] = useQuery<any>({ q: 'tpolicy' }, [], 2500);
  if (!d) return <Empty>{t('loading')}…</Empty>;
  return <>
    <Section title={t('tariff')} id="tr-tariff">
      <div class="slider-row"><Tip tag="div" class="tip-contents" content={() => <TariffTip d={d} />}><span class="k has-tip">{t('tariff')}</span>
        <Slider value={d.tariff} min={0} max={d.max} step={0.01} fmt={(x) => pct(x)} onCommit={(x) => act({ t: 'budget', key: 'tariff', value: x }).then(refresh)} /></Tip></div>
      <div class="grid2">
        <Row k={t('tr_tariff_max')} v={pct(d.max)} tip={() => <div><TipHead name={t('tr_tariff_max')} value={pct(d.max)} hint={t('tr_tariff_max_hint')} /><Parts rows={d.maxParts} fmt={(v) => pct(v)} total={d.max} /></div>} />
        <Row k={t('tr_tariff_earned')} v={<span class="pos">+{num(d.earned, 1)}</span>} tip={() => <TariffTip d={d} />} />
        <Row k={t('tr_kept_out')} v={<span class={d.deter > 0 ? 'neg' : ''}>{num(d.deter, 1)}</span>} tip={() => <KeptOutTip d={d} />} />
        <Row k={keyName('trade')} v={<span class="pos">+{num(d.trade + d.company, 1)}</span>} tip={<div><TipHead name={keyName('trade')} value={num(d.trade + d.company, 1)} hint={t('kh_trade')} /><div class="breakdown"><div class="bd-row"><span>{keyName('trade')}</span><span>{num(d.trade, 1)}</span></div><div class="bd-row"><span>{keyName('company')}</span><span>{num(d.company, 1)}</span></div></div></div>} />
      </div>
    </Section>
    <Section title={t('tr_partners')} id="tr-partners">
      {d.traders.length ? <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>{t('realm')}</th><th class="r">{t('tr_goods_month')}</th><th class="r">{t('tr_their_tariff')}</th><th>{t('tr_agreement')}</th><th /></tr></thead>
        <tbody>{d.traders.map((x: any) => <tr><td><NLink id={x.n} /></td>
          <td class="r"><Tip content={<div><TipHead name={t('tr_goods_month')} value={num(x.goods, 0)} hint={t('tr_goods_month_hint')} /></div>}>{num(x.goods, 0)}</Tip></td>
          <td class="r"><Tip content={<div><TipHead name={t('tr_their_tariff')} value={pct(x.theirTariff)} hint={t('tr_their_tariff_hint')} />{x.agreement && <div class="pos">{t('tr_halved')}: {pct(x.theirTariff * d.agreementTariff)}</div>}</div>}>{pct(x.agreement ? x.theirTariff * d.agreementTariff : x.theirTariff)}</Tip></td>
          <td>{x.embargo ? <span class="neg">{t('tr_embargo')}</span> : x.agreement ? <span class="pos">✔</span> : <span class="muted">—</span>}</td>
          <td>{!x.agreement && !x.embargo && <Btn tip={t('tr_propose_hint')} onClick={() => act({ t: 'diplo', target: x.n, action: 'trade' }, 'page', t('envoy_sent')).then(refresh)}>{t('tr_propose')}</Btn>}</td></tr>)}</tbody>
      </table></div> : <div class="muted small">{t('tr_no_partners')}</div>}
    </Section>
    <Section title={t('tr_agreements')} id="tr-agree">
      {d.partners.length ? d.partners.map((p: any) => <div class="kv"><span class="k"><NLink id={p.n} /></span><span class="v"><Tip content={<div><TipHead name={t('tr_agreement')} hint={t('tr_agreement_hint')} /><div class="breakdown"><div class="bd-row"><span>{t('tr_their_tariff')}</span><span>{pct(p.theirs)}</span></div><div class="bd-row"><span>{t('tr_our_tariff_on')}</span><span>{pct(p.ours)}</span></div><div class="bd-row"><span>{t('tr_more_goods')}</span><span>× {num(d.agreementVolume, 2)}</span></div></div></div>}>{pct(p.theirs)} / {pct(p.ours)}</Tip></span></div>) : <div class="muted small">{t('tr_no_agreements')}</div>}
    </Section>
    <Section title={t('tr_embargoes')} id="tr-emb">
      {d.embargoes.length ? d.embargoes.map((e: any) => <div class="kv"><span class="k"><NLink id={e.n} /> {e.ours ? t('tr_we_embargo') : ''}{e.ours && e.theirs ? ' · ' : ''}{e.theirs ? <span class="neg">{t('tr_they_embargo')}</span> : ''}</span>
        <span class="v"><Tip content={() => <StakesTip st={e.stakes} />}><span class="has-tip">{num(e.stakes.goods, 0)}</span></Tip> {e.ours && <Btn onClick={() => act({ t: 'diplo', target: e.n, action: 'lift_embargo' }).then(refresh)}>{t('tr_lift')}</Btn>}</span></div>) : <div class="muted small">{t('tr_no_embargoes')}</div>}
    </Section>
  </>;
}

function TariffTip({ d }: { d: any }) {
  return <div>
    <TipHead name={t('tariff')} value={pct(d.tariff)} hint={t('tr_tariff_hint')} />
    <div class="breakdown">
      <div class="bd-title">{t('tr_tariff_earns')}</div>
      <div class="bd-row"><span>{keyName('tariffs')}</span><span class="pos">+{num(d.earned, 1)} {t('x_per_month')}</span></div>
      <div class="bd-title">{t('tr_tariff_costs')}</div>
      <div class="bd-row"><span>{t('tr_kept_out')}</span><span class="neg">{num(d.deter, 1)}</span></div>
      {d.deter > 0 && <div class="bd-row"><span>{t('x_kept_margin')}</span><span>{num(d.keptMargin ?? 0, 1)}</span></div>}
      <div class="bd-row"><span>{t('tr_partners_pay')}</span><span>× {num(d.agreementTariff, 2)}</span></div>
    </div>
    <div class="muted small">{t('tr_tariff_note')}</div>
  </div>;
}

/** What our tariff kept out last month: by market, and by good with the margin those goods would have made. A tariff
 *  takes half its rate off the trader's margin, so it closes the thin-margin flows first. */
function KeptOutTip({ d }: { d: any }) {
  const share = d.deter > 0 ? (d.keptMargin ?? 0) / d.deter : 0;
  return <div><TipHead name={t('tr_kept_out')} value={num(d.deter, 1)} hint={t('tr_kept_out_hint')} />
    {d.markets.length > 0 && <Parts rows={d.markets.map((m: any) => [{ en: m.name, de: placeName(m.name) }, m.deter])} digits={1} />}
    {d.keptOut?.length > 0 && <div class="breakdown">
      <div class="bd-row bd-cols"><span>{t('goods')}</span><span>{t('x_kept_value')} · {t('x_kept_margin_short')}</span></div>
      {d.keptOut.map((x: any) => <div class="bd-row"><span>{L(x.name)}</span><span>{num(x.v, 1)} · {pct(x.margin, 1)}</span></div>)}
      {d.keptRest?.n > 0 && <div class="bd-row"><span>{t('x_price_index_rest').replace('{n}', String(d.keptRest.n))}</span><span>{num(d.keptRest.v, 1)} · {pct(d.keptRest.margin, 1)}</span></div>}
      <div class="bd-row bd-total"><span>{t('x_kept_margin')}</span><span>{num(d.keptMargin ?? 0, 1)} ({pct(share, 1)})</span></div>
    </div>}
    {d.deter > 0 && <div class="muted small">{t('x_kept_why').replace('{cut}', pct(d.tariff * 0.5, 1))}</div>}
  </div>;
}

export function StakesTip({ st }: { st: any }) {
  return <div><TipHead name={t('tr_stakes')} hint={t('tr_stakes_hint')} />
    <div class="breakdown">
      <div class="bd-row"><span>{t('tr_stakes_theirs')}</span><span>{num(st.theirs, 1)}</span></div>
      <div class="bd-row"><span>{t('tr_stakes_ours')}</span><span>{num(st.ours, 1)}</span></div>
      <div class="bd-row"><span>{t('tr_stakes_goods')}</span><span>{num(st.goods, 1)}</span></div>
    </div></div>;
}
