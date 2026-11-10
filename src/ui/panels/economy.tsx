// Economy tab: treasury, income & expenses, taxes per class, budget, loans, markets and merchants, history.
import { useState } from 'preact/hooks';
import { view, nations } from '../../game/client';
import { playerId } from '../store';
import { CLASSES, CLASS_NAME } from '../../sim/defs';
import { Section, Row, Bar, Btn, Empty, Spark, Slider, useQuery, act, t, L, num, signed, pct, Tip, fmtDateShort, realm } from './common';
import { TreasuryTip, IncomeTip, ExpenseTip, InflationTip, CorruptionTip, TaxClassTip, MerchantsTip, TipHead, Parts } from './explain';
import { keyName } from '../TopBar';
import { Duties, Forecast, TariffCap, taxAct } from './statecraft';


/** The tax level the assembly weighs (class taxes by weight and duties) against what it granted. */
function TaxLevel() {
  const pid = playerId.value;
  const [g] = useQuery<any>({ q: 'govern' }, [pid], 1500);
  if (!g) return null;
  return <Row k={t('x_asm_level')} v={<>{pct(g.taxLevel, 1)} <small class="muted">{g.taxVote ? `(${t('x_asm_tax_ceiling')} ${pct(g.taxCeiling, 1)})` : `(${t('x_asm_no_vote')})`}</small></>} tip={() => <div>
    <TipHead name={t('x_asm_level')} value={pct(g.taxLevel, 1)} hint={t('x_asm_level_hint')} />
    <Parts rows={g.taxLevelRows} total={g.taxLevel} fmt={(v) => pct(v, 2)} />
    <div class="muted small">{g.taxVote ? t('x_asm_ceiling_hint') : t('x_asm_no_vote_hint')}</div></div>} />;
}

export function EconomyTab() {
  const v = view.value; const p = v?.player; const r = realm.value;
  if (!p) return <Empty>{t('no_realm')}</Empty>;
  const net = p.income - p.expense;
  const inc = Object.entries(p.incomeBreak).filter(([, x]) => Math.abs(x) > 0.005).sort((a, b) => b[1] - a[1]);
  const exp = Object.entries(p.expenseBreak).filter(([, x]) => Math.abs(x) > 0.005).sort((a, b) => b[1] - a[1]);
  const maxRow = Math.max(1, ...inc.map((x) => x[1]), ...exp.map((x) => x[1]));
  return <div class="tab-econ">
    <div class="stat-cards">
      <Tip content={() => <TreasuryTip />}>
        <div class="card"><div class="card-k">{t('treasury')}</div><div class="card-v"><i class="ic gold" /> {num(p.treasury)}</div><div class={`card-s ${net >= 0 ? 'pos' : 'neg'}`}>{signed(net, 1)} / {t('month')}</div></div>
      </Tip>
      <Tip content={() => <IncomeTip />}><div class="card"><div class="card-k">{t('income')}</div><div class="card-v pos">{num(p.income, 1)}</div><div class="card-s muted">{t('x_per_month')}</div></div></Tip>
      <Tip content={() => <ExpenseTip />}><div class="card"><div class="card-k">{t('expenses')}</div><div class="card-v neg">{num(p.expense, 1)}</div><div class="card-s muted">{t('x_per_month')}</div></div></Tip>
      <Tip content={() => <InflationTip />}><div class="card"><div class="card-k">{t('inflation')}</div><div class={`card-v ${p.inflation > 0.05 ? 'neg' : ''}`}>{pct(p.inflation, 1)}</div><div class="card-s muted">{signed((realm.value?.explain?.inflation.monthly ?? 0) * 100, 2)} % / {t('month')}</div></div></Tip>
      <Tip content={() => <CorruptionTip />}><div class="card"><div class="card-k">{t('corruption')}</div><div class={`card-v ${p.corruption > 0.1 ? 'neg' : ''}`}>{pct(p.corruption, 1)}</div><div class="card-s muted">{t('x_tax_yield')} −{pct(p.corruption, 0)}</div></div></Tip>
      <Tip content={() => <LoansTip />}><div class="card"><div class="card-k">{t('loans')}</div><div class={`card-v ${p.loans > 0 ? 'neg' : ''}`}>{num(p.loans)}</div><div class="card-s muted">{p.debt > 0 ? <span class="neg">{t('debt')} {num(p.debt)}</span> : `${(r?.loans ?? []).length} / 8`}</div></div></Tip>
    </div>
    <div class="cols2">
      <Section title={t('income')} id="eco-inc">
        {inc.map(([k, x]) => <Tip tag="div" content={<FlowTip k={k} v={x} total={p.income} />}><div class="flow-row"><span>{keyName(k)}</span><span class="flow-bar"><i class="pos-bg" style={{ width: `${(x / maxRow) * 100}%` }} /></span><span class="r pos">{num(x, 1)}</span></div></Tip>)}
        {!inc.length && <div class="muted small">{t('first_month_hint')}</div>}
      </Section>
      <Section title={t('expenses')} id="eco-exp">
        {exp.map(([k, x]) => <Tip tag="div" content={<FlowTip k={k} v={x} total={p.expense} />}><div class="flow-row"><span>{keyName(k)}</span><span class="flow-bar"><i class="neg-bg" style={{ width: `${(x / maxRow) * 100}%` }} /></span><span class="r neg">{num(x, 1)}</span></div></Tip>)}
        {!exp.length && <div class="muted small">{t('first_month_hint')}</div>}
      </Section>
    </div>
    <div class="cols2">
      <Section title={t('taxes')} id="eco-tax">
        {CLASSES.map((c, k) => <div class="slider-row">
          <Tip tag="div" class="tip-contents" content={() => <TaxClassTip c={k} />}><span class="k has-tip">{L(CLASS_NAME[c])}</span>
          <Slider value={p.taxRate[k] ?? 0} min={0} max={0.5} step={0.01} fmt={(x) => pct(x)} onCommit={(x) => taxAct({ t: 'tax', cls: k, rate: x })} /></Tip>
        </div>)}
        <TaxLevel />
      </Section>
      <Section title={t('budget')} id="eco-budget">
        <div class="slider-row"><Tip tag="div" class="tip-contents" content={() => <MaintTip kind="army" />}><span class="k has-tip">{t('army_maint')}</span>
          <Slider value={p.armyMaint} min={0.25} max={1} step={0.05} fmt={(x) => pct(x)} onCommit={(x) => act({ t: 'budget', key: 'army', value: x })} /></Tip></div>
        <div class="slider-row"><Tip tag="div" class="tip-contents" content={() => <MaintTip kind="navy" />}><span class="k has-tip">{t('navy_maint')}</span>
          <Slider value={p.navyMaint} min={0.25} max={1} step={0.05} fmt={(x) => pct(x)} onCommit={(x) => act({ t: 'budget', key: 'navy', value: x })} /></Tip></div>
        <div class="slider-row"><Tip tag="div" class="tip-contents" content={() => <div><TipHead name={t('tariff')} value={pct(p.tariff)} hint={t('x_tariff_effect')} /><div class="tip-drift"><span>{keyName('tariffs')}</span><span class="pos">+{num(p.incomeBreak.tariffs ?? 0, 1)} {t('x_per_month')}</span></div><div class="muted">{t('kh_tariffs')}</div><TariffCap r={r} /></div>}><span class="k has-tip">{t('tariff')}</span>
          <Slider value={p.tariff} min={0} max={r?.tariffMax ?? 0.5} step={0.01} fmt={(x) => pct(x)} onCommit={(x) => act({ t: 'budget', key: 'tariff', value: x })} /></Tip></div>
        <div class="slider-row"><Tip tag="div" class="tip-contents" content={() => <div><TipHead name={t('coinage')} value={pct(p.coinage)} hint={t('x_coinage_effect')} /><div class="tip-drift"><span>{keyName('minting')}</span><span class="pos">+{num(p.incomeBreak.minting ?? 0, 1)} {t('x_per_month')}</span></div><div class="tip-drift"><span>{t('inflation')}</span><span class={p.coinage > 0 ? 'neg' : 'muted'}>+{num(p.coinage, 2)} % {t('x_per_month')}</span></div></div>}><span class="k has-tip">{t('coinage')}</span>
          <Slider value={p.coinage} min={0} max={0.5} step={0.01} fmt={(x) => pct(x)} onCommit={(x) => act({ t: 'budget', key: 'coinage', value: x })} /></Tip></div>
        <Loans />
      </Section>
    </div>
    <div class="cols2">
      <Duties r={r} p={p} />
      <Forecast r={r} />
    </div>
    <Markets />
    <History hist={r?.history ?? []} />
  </div>;
}

function Loans() {
  const r = realm.value; const p = view.value?.player; const v = view.value;
  const tax = p?.incomeBreak?.tax || 10;
  const max = Math.max(50, tax * 12);
  const [amt, setAmt] = useState(0);
  const a = amt || Math.round(Math.min(max, Math.max(10, tax * 6)));
  const loans: any[] = r?.loans ?? [];
  return <div class="loans">
    <div class="sub-h">{t('loans')}</div>
    {loans.map((l) => <Row k={l.lender} v={<>{num(l.amount)} · {pct(l.rate, 1)} · {t('due')} {v ? fmtDateShort(l.due, v.startYear) : ''}</>} tip={<div><TipHead name={l.lender} value={num(l.amount)} /><div class="breakdown"><div class="bd-row"><span>{t('x_rate')}</span><span>{pct(l.rate, 1)}</span></div><div class="bd-row"><span>{t('x_loan_interest')}</span><span class="neg">−{num(l.amount * l.rate / 12, 2)}</span></div><div class="bd-row"><span>{t('x_due')}</span><span>{v ? fmtDateShort(l.due, v.startYear) : ''}</span></div></div><div class="muted">{t('loan_hint')}</div></div>} />)}
    {!loans.length && <div class="muted small">{t('no_loans')}</div>}
    <div class="act-row">
      <select value={a} onChange={(e) => setAmt(Number((e.target as HTMLSelectElement).value))}>{[0.25, 0.5, 0.75, 1].map((f) => { const x = Math.round(Math.max(10, max * f)); return <option value={x}>{num(x)}</option>; })}</select>
      <Btn disabled={loans.length >= 8 ? 'no lender will extend more credit' : null} tip={t('loan_hint')} onClick={() => act({ t: 'loan', take: true, amount: a }, 'coins')}>{t('take_loan')}</Btn>
      <Btn disabled={!loans.length ? 'no loans' : (p?.treasury ?? 0) < loans[0].amount ? 'not enough gold' : null} onClick={() => act({ t: 'loan', take: false, amount: 0 }, 'coins')}>{t('repay')}</Btn>
    </div>
  </div>;
}

function Markets() {
  const r = realm.value; const pid = playerId.value;
  const pv = view.value?.player;
  const [sel, setSel] = useState(-1);
  const home = pv?.homeMarket ?? -1;
  const mid = sel >= 0 ? sel : home >= 0 ? home : r?.markets?.[0]?.id ?? -1;
  const [m] = useQuery<any>(mid >= 0 ? { q: 'market', market: mid } : null, [mid], 3000);
  const [sort, setSort] = useState<'name' | 'price' | 'supply' | 'demand' | 'dev'>('dev');
  const used = pv?.merchants.used ?? 0;
  const capM = pv?.merchants.cap ?? 0;
  const mine = m?.merchants?.[pid] || 0;
  const goods = (m?.goods ?? []).filter((g: any) => g.supply > 0.01 || g.demand > 0.01);
  const sorted = [...goods].sort((a: any, b: any) => sort === 'name' ? L(a.name).localeCompare(L(b.name)) : sort === 'price' ? b.price - a.price : sort === 'supply' ? b.supply - a.supply : sort === 'demand' ? b.demand - a.demand : (b.price / Math.max(1e-6, b.base)) - (a.price / Math.max(1e-6, a.base)));
  const th = (k: typeof sort, label: string, cls = '') => <th class={`sortable ${cls} ${sort === k ? 'on' : ''}`} onClick={() => setSort(k)}>{label}</th>;
  return <Section title={t('markets')} id="eco-mkt" right={<Tip content={() => <MerchantsTip />}><span class="muted has-tip">{t('merchants')}: {used}/{capM}</span></Tip>}>
    <div class="act-row">
      <select value={mid} onChange={(e) => setSel(Number((e.target as HTMLSelectElement).value))}>
        {[...(r?.markets ?? [])].sort((a: any, b: any) => a.name.localeCompare(b.name)).map((x: any) => <option value={x.id}>{x.name}{x.id === home ? ` (${t('home')})` : ''}{x.mine ? ` · ${x.mine}` : ''}</option>)}
      </select>
      {m && <Tip content={<div><b>{t('price_index')}</b> {num(m.priceIndex, 2)}<div class="muted">{t('price_index_hint')}</div></div>}><span class="muted">{t('price_index')} {num(m.priceIndex, 2)}</span></Tip>}
      <span class="spacer" />
      <Tip content={t('merchant_hint')}><span class="k">{t('our_merchants')}: <b>{mine}</b></span></Tip>
      <Btn disabled={mine <= 0 ? 'none' : null} onClick={() => act({ t: 'merchant', market: mid, amount: mine - 1 })}>−</Btn>
      <Btn disabled={used >= capM ? 'no merchants left' : null} onClick={() => act({ t: 'merchant', market: mid, amount: mine + 1 })}>+</Btn>
    </div>
    {m && <div class="muted small">{t('trade_links')}: {m.links.map((l: any) => `${l.to}${l.sea ? ' ⚓' : ''}`).join(', ') || '—'}</div>}
    {m ? <div class="tbl-wrap"><table class="tbl market">
      <thead><tr>{th('name', t('goods'))}{th('price', t('price'), 'r')}{th('dev', t('vs_base'), 'r')}{th('supply', t('supply'), 'r')}{th('demand', t('demand'), 'r')}<Tip tag="th" content={<div><TipHead name={t('ten_years')} hint={t('ten_years_hint')} /></div>}>{t('ten_years')}</Tip></tr></thead>
      <tbody>{sorted.map((g: any) => { const rel = g.price / Math.max(1e-6, g.base) - 1; const hist = (g.hist as number[]).filter((x) => x > 0);
        const ptip = () => <div><TipHead name={L(g.name)} value={num(g.price, 2)} hint={t('x_price_why')} /><div class="breakdown"><div class="bd-row"><span>{t('base_price')} × {t('x_price_level')}</span><span>{num(g.base, 2)}</span></div><div class="bd-row"><span>{t('demand')} : {t('supply')}</span><span>{num(g.demand, 1)} : {num(g.supply, 1)}</span></div><div class="bd-row bd-total"><span>{t('price')}</span><span class={rel > 0 ? 'neg' : 'pos'}>{signed(rel * 100)} %</span></div></div>{g.supply < 0.05 && <div class="neg">{t('x_no_supply')}</div>}</div>;
        return <tr><td>{L(g.name)}</td><td class="r"><Tip content={ptip}>{num(g.price, 2)}</Tip></td><td class={`r ${rel > 0.15 ? 'neg' : rel < -0.15 ? 'pos' : ''}`}><Tip content={ptip}>{signed(rel * 100)} %</Tip></td><td class="r"><Tip content={t('x_supply_hint')}>{num(g.supply, g.supply < 10 ? 1 : 0)}</Tip></td><td class="r"><Tip content={t('x_demand_hint')}>{num(g.demand, g.demand < 10 ? 1 : 0)}</Tip></td>
          <td><Tip content={<div><b>{L(g.name)}</b><div>{t('base_price')}: {num(g.base, 2)}</div><div>{t('ten_years_hint')}</div></div>}><Spark data={hist} base={g.base} w={90} h={18} /></Tip></td></tr>; })}</tbody>
    </table></div> : <Empty>{t('loading')}…</Empty>}
  </Section>;
}

function History({ hist }: { hist: any[] }) {
  const [key, setKey] = useState<'treasury' | 'income' | 'manpower' | 'dev'>('treasury');
  const v = view.value;
  return <Section title={t('history')} id="eco-hist" right={<span class="seg">{(['treasury', 'income', 'manpower', 'dev'] as const).map((k) => <button class={key === k ? 'on' : ''} onClick={() => setKey(k)}>{t(k === 'dev' ? 'development' : k)}</button>)}</span>}>
    {hist.length < 2 ? <div class="muted small">{t('history_empty')}</div> : <Chart hist={hist} k={key} startYear={v?.startYear ?? 1356} />}
  </Section>;
}

function Chart({ hist, k, startYear }: { hist: any[]; k: string; startYear: number }) {
  const W = 680, H = 150, pad = 34;
  const a = hist.map((h) => (k === 'income' ? h.income : h[k]) as number);
  const b = k === 'income' ? hist.map((h) => h.expense as number) : null;
  const all = b ? [...a, ...b] : a;
  let lo = Math.min(0, ...all), hi = Math.max(...all); if (hi - lo < 1) hi = lo + 1;
  const x = (i: number) => pad + (i / (hist.length - 1)) * (W - pad - 6), y = (vv: number) => H - 18 - ((vv - lo) / (hi - lo)) * (H - 28);
  const line = (d: number[]) => d.map((vv, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(vv).toFixed(1)}`).join('');
  const y0 = startYear + hist[0].day / 365.25, y1 = startYear + hist[hist.length - 1].day / 365.25;
  const ticks = [lo, (lo + hi) / 2, hi];
  return <svg class="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
    {ticks.map((tv) => <g><line x1={pad} x2={W - 6} y1={y(tv)} y2={y(tv)} stroke="#b9a072" stroke-width={0.6} stroke-dasharray="3 3" /><text x={pad - 4} y={y(tv) + 3} text-anchor="end" class="ax">{num(tv)}</text></g>)}
    {lo < 0 && <line x1={pad} x2={W - 6} y1={y(0)} y2={y(0)} stroke="#6b4a1c" stroke-width={0.8} />}
    <path d={`${line(a)} L${x(a.length - 1)},${y(Math.max(lo, 0))} L${x(0)},${y(Math.max(lo, 0))} Z`} fill="rgba(122,78,28,.12)" />
    <path d={line(a)} fill="none" stroke={k === 'income' ? '#3f7a3a' : '#7a4e1c'} stroke-width={1.8} />
    {b && <path d={line(b)} fill="none" stroke="#9b2a20" stroke-width={1.5} stroke-dasharray="4 2" />}
    <text x={pad} y={H - 3} class="ax">{Math.floor(y0)}</text><text x={W - 6} y={H - 3} text-anchor="end" class="ax">{Math.floor(y1)}</text>
    {b && <text x={W - 6} y={12} text-anchor="end" class="ax">— {t('income')}  - - {t('expenses')}</text>}
  </svg>;
}
void Bar;

/** One line of income or expenses: what it is and its share of the total. */
function FlowTip({ k, v, total }: { k: string; v: number; total: number }) {
  const hint = t(`kh_${k}`);
  return <div><TipHead name={keyName(k)} value={num(v, 1)} hint={hint !== `kh_${k}` ? hint : undefined} /><div class="muted">{pct(v / Math.max(1e-9, total), 0)} {t('x_of_total')}</div></div>;
}
/** Army or navy maintenance: what it costs now and what changes the cost. */
function MaintTip({ kind }: { kind: 'army' | 'navy' }) {
  const p = view.value?.player; const e = realm.value?.explain; if (!p) return null;
  return <div>
    <TipHead name={t(kind === 'army' ? 'army_maint' : 'navy_maint')} value={pct(kind === 'army' ? p.armyMaint : p.navyMaint)} hint={t('x_maint_effect')} />
    <div class="tip-drift"><span>{t('x_upkeep_now')}</span><span class="neg">−{num(p.expenseBreak[kind] ?? 0, 1)} {t('x_per_month')}</span></div>
    <div class="muted">{t(`kh_${kind}`)}</div>
    <div class="tip-drift"><span>{t('x_maint_morale')}</span><span class={(kind === 'army' ? p.armyMaint : p.navyMaint) < 1 ? 'neg' : 'muted'}>× {num(0.5 + 0.5 * Math.max(0.25, Math.min(1, kind === 'army' ? p.armyMaint : p.navyMaint)), 2)}</span></div>
    {kind === 'army' && e?.armyCost?.length > 0 && <Parts title={t('x_army_cost_mods')} rows={e.armyCost} fmt={(x) => `${signed(x * 100, 0)} %`} bad />}
  </div>;
}
/** Loans: the lenders, interest and what debt means. */
function LoansTip() {
  const p = view.value?.player; const r = realm.value; const v = view.value; if (!p) return null;
  const loans: any[] = r?.loans ?? [];
  return <div>
    <TipHead name={t('loans')} value={num(p.loans)} hint={t('loan_hint')} />
    {loans.length > 0 && <div class="breakdown"><div class="bd-title">{t('x_loan_interest')}</div>{loans.map((l) => <div class="bd-row"><span>{l.lender} · {pct(l.rate, 1)}{v ? ` · ${fmtDateShort(l.due, v.startYear)}` : ''}</span><span class="neg">−{num(l.amount * l.rate / 12, 2)}</span></div>)}</div>}
    {p.debt > 0 && <div class="neg">{t('debt')}: {num(p.debt)}</div>}
    <div class="muted">{t('x_debt_hint')}</div>
  </div>;
}
