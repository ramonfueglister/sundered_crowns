// Statecraft panels of the truth pass: tax instruments (land tax, hearth tax, excise), the twelve-month budget forecast,
// administrative capacity and over-extension, production methods and migration of a location, diplomatic standing
// and the tradition of the culture group. The numbers come from src/game/view.ts (realmDetail, locDetail) and are the
// simulation's own (systems/duties.ts, systems/administration.ts); this file only lays them out.
import { Section, Row, Bar, Btn, Slider, act, t, L, num, signed, pct, Tip, Effects, Spark } from './common';
import { TipHead, Parts, type Row as BdRow } from './explain';
import { keyName } from '../TopBar';

const ESTATE_KEY: Record<string, string> = { magnates: 'est_magnates', prelates: 'est_prelates', burghers: 'est_burghers', commons: 'est_commons' };
const estLabel = (id: string) => { const v = t(ESTATE_KEY[id] ?? id); return v === (ESTATE_KEY[id] ?? id) ? id : v; };

// ---------------------------------------------------------------- tax instruments
function DutyTip({ d, p }: { d: any; p: any }) {
  const rateTxt = d.id === 'hearth' ? `${num(d.rate, 2)} ${t('x_marks_per_100')}` : pct(d.rate, 1);
  return <div>
    <TipHead name={t(`duty_${d.id}`)} value={rateTxt} hint={t(`duty_${d.id}_hint`)} />
    <div class="tip-drift"><span>{keyName(d.ledger)}</span><span class="pos">+{num(p.incomeBreak?.[d.ledger] ?? 0, 1)} {t('x_per_month')}</span></div>
    <Parts title={t('x_duty_resented')} keepZero rows={Object.entries(d.estates).map(([e, k]) => [estLabel(e), -(k as number) * d.rate] as BdRow)} digits={1} />
    <div class="muted small">{t('x_duty_per_step')}: {Object.entries(d.estates).map(([e, k]) => `${estLabel(e)} ${signed(-(k as number) * d.step, 1)}`).join(', ')} · {t('unrest')} +{num(d.unrest * d.step, 2)}</div>
    <div class="muted small">{t('x_duty_resented_hint')}</div>
    <div class="tip-drift"><span>{t('unrest')}</span><span class={d.rate > 0 ? 'neg' : 'muted'}>+{num(d.rate * d.unrest, 1)} {t('x_in_each_loc')}</span></div>
    <div class="muted small">{t('x_duty_max')}: {d.id === 'hearth' ? num(d.max, 2) : pct(d.max, 0)}</div>
  </div>;
}
/** Sliders for the three instruments (command { t: 'budget', key: 'land' | 'hearth' | 'excise' }). */
export function Duties({ r, p }: { r: any; p: any }) {
  if (!r?.duties) return null;
  return <Section title={t('duties')} id="eco-duties" right={<Tip content={<div><TipHead name={t('unrest')} value={`+${num(r.dutyUnrest, 1)}`} hint={t('x_duty_unrest_hint')} /></div>}><span class="muted has-tip">{t('unrest')} +{num(r.dutyUnrest, 1)}</span></Tip>}>
    {r.duties.map((d: any) => <div class="slider-row">
      <Tip tag="div" class="tip-contents" content={() => <DutyTip d={d} p={p} />}><span class="k has-tip">{t(`duty_${d.id}`)}</span>
        <Slider value={d.rate} min={0} max={d.max} step={d.step} fmt={(x) => (d.id === 'hearth' ? num(x, 2) : pct(x, 1))} onCommit={(x) => act({ t: 'budget', key: d.id, value: x })} /></Tip>
    </div>)}
    <div class="muted small">{t('duties_hint')}</div>
  </Section>;
}
/** Tooltip lines for the tariff ceiling set by the trade law. */
export function TariffCap({ r }: { r: any }) {
  if (!r?.tariffMaxParts) return null;
  return <Parts title={t('x_tariff_max')} rows={r.tariffMaxParts} total={r.tariffMax} fmt={(v) => `${signed(v * 100, 0)} %`} />;
}

// ---------------------------------------------------------------- budget forecast
function ForecastTip({ f }: { f: any }) {
  return <div>
    <TipHead name={t('forecast')} value={`${num(f.start)} → ${num(f.end)}`} hint={t('forecast_hint')} />
    <Parts title={t('x_forecast_income')} rows={f.incomeLines.map(([k, v]: [string, number]) => [keyName(k), v * 12] as BdRow)} total={f.income * 12} digits={0} />
    <Parts title={t('x_forecast_expense')} bad rows={[...f.expenseLines.map(([k, v]: [string, number]) => [keyName(k), v * 12] as BdRow), [keyName('interest'), f.interestYear], [keyName('loan_repay'), f.repaidYear]]} total={f.fixed * 12 + f.interestYear + f.repaidYear} digits={0} />
    <div class="muted small">{t('forecast_left_out')}</div>
  </div>;
}
export function Forecast({ r }: { r: any }) {
  const f = r?.forecast; if (!f) return null;
  const net = f.end - f.start;
  return <Section title={t('forecast')} id="eco-forecast">
    {!f.expenseLines.length && <div class="muted small">{t('first_month_hint')}</div>}
    <Tip tag="div" content={() => <ForecastTip f={f} />}>
      <div class="kv"><span class="k">{t('x_in_12_months')}</span><span class={`v ${f.end < 0 ? 'neg' : ''}`}>{num(f.end)} <small class={net >= 0 ? 'pos' : 'neg'}>({signed(net, 0)})</small></span></div>
      <Spark data={[f.start, ...f.months.map((m: any) => m.treasury)]} w={220} h={34} base={0} color={f.end < 0 ? '#a8331f' : '#4d8a3a'} />
    </Tip>
    <table class="tbl small">
      <thead><tr><th>{t('month')}</th><th class="r">{t('income')}</th><th class="r">{t('expenses')}</th><th class="r">{t('treasury')}</th></tr></thead>
      <tbody>{f.months.filter((_: any, i: number) => i % 3 === 2).map((m: any, i: number) => <tr>
        <td>+{(i + 1) * 3}</td><td class="r pos">{num(m.income, 1)}</td>
        <td class="r neg"><Tip content={<div><div class="bd-row"><span>{t('x_fixed_costs')}</span><span>{num(m.expense - m.interest - m.repaid, 1)}</span></div><div class="bd-row"><span>{keyName('interest')}</span><span>{num(m.interest, 1)}</span></div>{m.repaid > 0 && <div class="bd-row"><span>{keyName('loan_repay')}</span><span>{num(m.repaid, 1)}</span></div>}</div>}>{num(m.expense, 1)}</Tip></td>
        <td class={`r ${m.treasury < 0 ? 'neg' : ''}`}>{num(m.treasury)}</td>
      </tr>)}</tbody>
    </table>
  </Section>;
}

// ---------------------------------------------------------------- administration
export function AdminTip({ a }: { a: any }) {
  return <div>
    <TipHead name={t('admin_capacity')} value={`${num(a.load, 1)} / ${num(a.capacity, 1)}`} hint={t('admin_capacity_hint')} />
    <Parts title={t('x_capacity_from')} rows={a.parts} total={a.capacity} digits={1} />
    {a.loadTop.length > 0 && <Parts title={t('x_load_from')} rows={a.loadTop.map((x: any) => [x.name, x.load] as BdRow)} total={a.load} digits={1} />}
    {a.overext > 0 ? <div class="breakdown">
      <div class="bd-title">{t('x_overextended')} ({pct(a.overext, 0)})</div>
      <div class="bd-row"><span>{t('unrest')}</span><span class="neg">+{num(a.effects.unrest, 1)}</span></div>
      <div class="bd-row"><span>{t('control')}</span><span class="neg">{signed(a.effects.control * 100, 0)} %</span></div>
      <div class="bd-row"><span>{t('x_integration_speed')}</span><span class="neg">× {num(a.share, 2)}</span></div>
      <div class="muted small">{t('x_overextended_hint')}</div>
    </div> : <div class="muted small">{t('x_within_capacity')}</div>}
  </div>;
}
export function Administration({ r }: { r: any }) {
  const a = r?.admin; if (!a) return null;
  const use = a.load / Math.max(1e-9, a.capacity);
  return <Section title={t('administration')} id="gov-admin">
    <Row k={t('admin_capacity')} v={<>{num(a.load, 1)} / {num(a.capacity, 1)} <small class={use > 1 ? 'neg' : 'muted'}>({pct(use, 0)})</small></>} tip={() => <AdminTip a={a} />} />
    <Bar value={Math.min(use, 2)} max={2} color={use > 1 ? '#a8331f' : '#4d8a3a'} tip={() => <AdminTip a={a} />} />
    <Row k={t('x_unintegrated_locs')} v={num(a.pending)} tip={t('x_unintegrated_hint')} />
    {r.tradition && <Row k={t('tradition')} v={L(r.tradition.name)} tip={() => <div><Effects title={L(r.tradition.name)} fx={r.tradition.effects} /><div class="muted">{t('tradition_hint')}</div></div>} />}
    {r.diplomacy && <Row k={t('diplomatic_standing')} v={`${signed(r.diplomacy.value * 100, 0)} %`} tip={() => <div><TipHead name={t('diplomatic_standing')} value={`${signed(r.diplomacy.value * 100, 0)} %`} hint={t('diplomatic_standing_hint')} /><Parts rows={r.diplomacy.parts} total={r.diplomacy.value} fmt={(v) => `${signed(v * 100, 1)} %`} /></div>} />}
    <div class="muted small">{t('admin_hint')}</div>
  </Section>;
}

// ---------------------------------------------------------------- production methods and migration of a location
function MethodTip({ m, cur }: { m: any; cur: boolean }) {
  return <div>
    <TipHead name={L(m.name)} hint={t(`method_${m.key}_hint`)} />
    <div class="breakdown">
      <div class="bd-row"><span>{t('x_method_output')}</span><span class={m.mult > 1 ? 'pos' : ''}>× {num(m.mult, 2)}</span></div>
      <div class="bd-row"><span>{t('x_method_inputs')}</span><span class={m.mult * m.input > 1 ? 'neg' : ''}>× {num(m.mult * m.input, 2)}</span></div>
      <div class="bd-row"><span>{t('x_method_jobs')}</span><span>× {num(m.jobs, 2)}</span></div>
      {!cur && m.cost > 0 && <div class="bd-row"><span>{t('cost')}</span><span>{num(m.cost)}</span></div>}
    </div>
  </div>;
}
export function Methods({ d, refresh }: { d: any; refresh: () => void }) {
  if (!d.methods?.length) return null;
  const cur = d.methods[d.method] ?? d.methods[0];
  return <div class="methods">
    <div class="act-row"><Tip content={<div><TipHead name={t('production_method')} value={L(cur.name)} hint={t('production_method_hint')} /><MethodTip m={cur} cur /></div>}><span class="k has-tip">{t('production_method')}</span></Tip>
      <span class="v">{L(cur.name)}</span>
      <Tip content={<div><TipHead name={t('x_employment')} value={pct(d.employed, 0)} hint={t('x_employment_hint')} /></div>}><span class="muted small has-tip">{t('x_employment')} {pct(d.employed, 0)}</span></Tip>
    </div>
    <div class="act-row">{d.methods.filter((m: any) => m.id !== d.method).map((m: any) =>
      <Btn disabled={m.block} tip={<MethodTip m={m} cur={false} />} onClick={() => act({ t: 'method', loc: d.id, method: m.id }, 'build', `${t('method_switched')}: ${L(m.name)}`).then(refresh)}>{L(m.name)} · {num(m.cost)}</Btn>)}</div>
  </div>;
}
/** People moving in or out last month (peasants and labourers looking for a better living). */
export function Migration({ d }: { d: any }) {
  if (!d.migration || Math.abs(d.migration) < 0.5) return null;
  return <Row k={t('migration')} v={<span class={d.migration > 0 ? 'pos' : 'neg'}>{signed(d.migration, 0)} {t('x_per_month')}</span>} tip={t('migration_hint')} />;
}
