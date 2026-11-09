// Breakdown tooltips: every number of the realm explains where it comes from (spec point 52).
// The data comes from the simulation (src/game/view.ts explainRealm, locExplain); this file only lays it out.
import type { ComponentChildren } from 'preact';
import type { I18n } from '../../sim/types';
import { view } from '../../game/client';
import { CLASSES, CLASS_NAME } from '../../sim/defs';
import { t, L, num, signed, pct, realm, reasonLabel, Effects } from './common';
import { keyName } from '../TopBar';

export type Row = [string | I18n, number];

/** Label of a breakdown row: a key of the text table (x_…, r_…) or a bilingual name from the content. */
export function partLabel(k: string | I18n): string {
  if (typeof k !== 'string') return L(k);
  const v = t(k); return v !== k ? v : reasonLabel(k);
}

/**
 * A breakdown as the simulation computes it: rows that add up to the total (or multiply, in product mode).
 * `bad` flips the colours for values where more is worse (corruption, war exhaustion, dread, costs).
 */
export function Parts({ title, rows, total, totalLabel, digits = 1, fmt, product = false, bad = false, keepZero = false, base }: {
  title?: ComponentChildren; rows: Row[]; total?: number; totalLabel?: ComponentChildren; digits?: number; fmt?: (v: number) => string; product?: boolean; bad?: boolean; keepZero?: boolean;
  /** product mode: the first row is the base value the factors multiply, shown plainly with this format */
  base?: (v: number) => string;
}) {
  const head = product && base && rows.length ? rows[0] : null;
  const r = (head ? rows.slice(1) : rows).filter(([, v]) => keepZero || (product ? Math.abs(v - 1) > 1e-6 : Math.abs(v) > 1e-6));
  const f = fmt ?? ((v: number) => (product ? `× ${num(v, 2)}` : signed(v, digits)));
  const cls = (v: number) => { const up = product ? v > 1 : v > 0; if (Math.abs(product ? v - 1 : v) < 1e-9) return ''; return up !== bad ? 'pos' : 'neg'; };
  return <div class="breakdown">
    {title && <div class="bd-title">{title}</div>}
    {head && <div class="bd-row"><span>{partLabel(head[0])}</span><span>{base!(head[1])}</span></div>}
    {r.map(([k, v]) => <div class="bd-row"><span>{partLabel(k)}</span><span class={cls(v)}>{f(v)}</span></div>)}
    {!r.length && <div class="bd-row muted"><span>{t('x_nothing')}</span><span /></div>}
    {total !== undefined && <div class="bd-row bd-total"><span>{totalLabel ?? '='}</span><span>{product ? num(total, 2) : (fmt ? f(total) : num(total, digits))}</span></div>}
  </div>;
}

/** Header of a stat tooltip: name, current value and a one-line explanation. */
export function TipHead({ name, value, hint }: { name: ComponentChildren; value?: ComponentChildren; hint?: ComponentChildren }) {
  return <div class="tip-head"><div class="tip-title"><b>{name}</b>{value !== undefined && <span class="tip-val">{value}</span>}</div>{hint && <div class="tip-hint">{hint}</div>}</div>;
}
/** "Drifts toward X: ±y per month" line. */
export function Drift({ target, monthly, digits = 1, fmt, bad = false }: { target?: number; monthly: number; digits?: number; fmt?: (v: number) => string; bad?: boolean }) {
  const f = fmt ?? ((v: number) => signed(v, digits));
  const good = bad ? monthly < 0 : monthly > 0;
  return <div class="tip-drift">
    {target !== undefined && <span>{t('x_target')} <b>{fmt ? fmt(target).replace(/^\+/, '') : num(target, 0)}</b></span>}
    <span class={Math.abs(monthly) < 1e-9 ? 'muted' : good ? 'pos' : 'neg'}>{f(monthly)} {t('x_per_month')}</span>
  </div>;
}
const ex = () => realm.value?.explain ?? null;
const pending = () => <div class="muted">{t('loading')}…</div>;

// ---------------------------------------------------------------- the realm's standing
export function TreasuryTip() {
  const p = view.value?.player; if (!p) return null;
  const inc = Object.entries(p.incomeBreak).filter(([, x]) => Math.abs(x) > 0.005).map(([k, x]) => [keyName(k), x] as Row);
  const exp = Object.entries(p.expenseBreak).filter(([, x]) => Math.abs(x) > 0.005).map(([k, x]) => [keyName(k), -x] as Row);
  return <div>
    <TipHead name={t('treasury')} value={num(p.treasury)} hint={t('x_treasury_hint')} />
    <div class="tip-cols">
      <Parts title={t('income')} rows={inc.sort((a, b) => b[1] - a[1])} total={p.income} />
      <Parts title={t('expenses')} rows={exp.sort((a, b) => a[1] - b[1])} total={-p.expense} />
    </div>
    <div class="tip-drift"><span>{t('x_balance')}</span><span class={p.income - p.expense >= 0 ? 'pos' : 'neg'}>{signed(p.income - p.expense, 1)} {t('x_per_month')}</span></div>
    {p.loans > 0 && <div class="muted">{t('loans')}: {num(p.loans)}</div>}
  </div>;
}
export function IncomeTip() {
  const p = view.value?.player; if (!p) return null;
  return <div><TipHead name={t('income')} value={num(p.income, 1)} hint={t('x_income_hint')} />
    <Parts rows={Object.entries(p.incomeBreak).map(([k, x]) => [keyName(k), x] as Row).sort((a, b) => b[1] - a[1])} total={p.income} /></div>;
}
export function ExpenseTip() {
  const p = view.value?.player; if (!p) return null;
  return <div><TipHead name={t('expenses')} value={num(p.expense, 1)} hint={t('x_expense_hint')} />
    <Parts bad rows={Object.entries(p.expenseBreak).map(([k, x]) => [keyName(k), x] as Row).sort((a, b) => b[1] - a[1])} total={p.expense} /></div>;
}

export function ManpowerTip() {
  const p = view.value?.player; const e = ex();
  if (!p) return null;
  return <div>
    <TipHead name={t('manpower')} value={`${num(p.manpower)} / ${num(p.maxManpower)}`} hint={t('x_manpower_hint')} />
    {e ? <>
      <Parts title={t('x_max_manpower')} rows={e.manpower.parts} total={e.manpower.max} digits={0} />
      <div class="tip-drift"><span>{t('x_recovery')}</span><span class="pos">+{num(e.manpower.monthly)} {t('x_per_month')}</span></div>
      {e.manpower.occupied > 0 && <div class="neg">{t('x_occupied_locs')}: {e.manpower.occupied}</div>}
      <div class="tip-sep" />
      <div class="tip-title"><b>{t('sailors')}</b><span class="tip-val">{num(p.sailors)} / {num(e.sailors.max)}</span></div>
      <div class="muted">{t('x_sailors_hint')} +{num(e.sailors.monthly)} {t('x_per_month')}</div>
    </> : pending()}
  </div>;
}

export function ConcordTip() {
  const p = view.value?.player; const e = ex(); if (!p) return null;
  return <div>
    <TipHead name={t('concord')} value={signed(p.concord)} hint={t('concord_hint')} />
    {e ? <><Drift target={e.concord.target} monthly={e.concord.monthly} /><Parts title={t('x_target_from')} rows={e.concord.parts} total={e.concord.target} />
      <div class="muted">{t('x_concord_drift')}</div></> : pending()}
  </div>;
}
export function MandateTip() {
  const p = view.value?.player; const e = ex(); if (!p) return null;
  return <div>
    <TipHead name={t('mandate')} value={num(p.mandate)} hint={t('mandate_hint')} />
    {e ? <><Drift target={e.mandate.target} monthly={e.mandate.monthly} /><Parts title={t('x_target_from')} rows={e.mandate.parts} total={e.mandate.target} />
      <div class="muted">{t('x_mandate_drift')}</div></> : pending()}
  </div>;
}
export function AuthorityTip() {
  const p = view.value?.player; const e = ex(); if (!p) return null;
  return <div>
    <TipHead name={t('authority')} value={num(p.authority)} hint={t('authority_hint')} />
    {e ? <Parts title={t('x_gain_per_month')} rows={e.authority.parts} total={e.authority.monthly} digits={2} /> : pending()}
    <div class="muted">{t('x_authority_uses')}</div>
  </div>;
}
export function PrestigeTip() {
  const p = view.value?.player; const e = ex(); if (!p) return null;
  return <div>
    <TipHead name={t('prestige')} value={num(p.prestige)} hint={t('x_prestige_hint')} />
    {e ? <Parts title={t('x_change_per_month')} rows={e.prestige.parts} total={e.prestige.monthly} digits={2} /> : pending()}
    <div class="muted">{t('x_prestige_events')}</div>
  </div>;
}
export function InsightTip() {
  const p = view.value?.player; const e = ex(); const r = realm.value; if (!p) return null;
  return <div>
    <TipHead name={t('insight')} value={num(p.insight)} hint={t('x_insight_hint')} />
    {e ? <Parts title={t('x_gain_per_month')} rows={e.insight.parts} total={e.insight.monthly} digits={2} /> : pending()}
    {r && <div class="tip-drift"><span>{t('x_next_doctrine')}</span><b>{num(r.doctrineCost)}</b></div>}
  </div>;
}
export function EnvoysTip() {
  const p = view.value?.player; const e = ex(); if (!p) return null;
  return <div>
    <TipHead name={t('envoys')} value={`${p.envoys - p.envoysBusy} / ${p.envoys}`} hint={t('envoys_hint')} />
    {e ? <Parts title={t('x_envoys_from')} rows={e.envoys.parts} total={p.envoys} digits={0} /> : pending()}
    {p.envoysBusy > 0 && <div class="muted">{t('x_envoys_busy')}: {p.envoysBusy}</div>}
  </div>;
}
export function WarExhaustionTip() {
  const p = view.value?.player; const e = ex(); if (!p) return null;
  return <div>
    <TipHead name={t('war_exhaustion')} value={num(p.warExhaustion, 1)} hint={t('x_we_hint')} />
    {e ? <><Parts title={t('x_change_per_month')} rows={e.warExhaustion.parts} total={e.warExhaustion.monthly} bad />
      <Parts title={t('x_effects_now')} rows={[['concord', -p.warExhaustion * 0.3], ['x_unrest_each_loc', p.warExhaustion * 0.12]]} bad={false} /></> : pending()}
    <div class="muted">{t('x_we_battles')}</div>
  </div>;
}
export function InflationTip() {
  const p = view.value?.player; const e = ex(); if (!p) return null;
  const pp = (v: number) => `${signed(v * 100, 2)} %`;
  return <div>
    <TipHead name={t('inflation')} value={pct(p.inflation, 1)} hint={t('inflation_hint')} />
    {e ? <Parts title={t('x_change_per_month')} rows={e.inflation.parts} total={e.inflation.monthly} fmt={pp} bad /> : pending()}
    <Parts title={t('x_effects_now')} rows={[['x_cost_buildings_units', p.inflation * 100], ['x_unrest_each_loc', p.inflation * 20]]} fmt={(v) => signed(v, 1)} bad />
  </div>;
}
export function CorruptionTip() {
  const p = view.value?.player; const e = ex(); if (!p) return null;
  const pp = (v: number) => `${signed(v * 100, 2)} %`;
  return <div>
    <TipHead name={t('corruption')} value={pct(p.corruption, 1)} hint={t('x_corruption_hint')} />
    {e ? <><Parts title={t('x_change_per_month')} rows={e.corruption.parts} total={e.corruption.monthly} fmt={pp} bad />
      {e.corruption.graft > 0.01 && <div class="neg">{keyName('graft')}: −{num(e.corruption.graft, 1)} {t('x_per_month')}</div>}</> : pending()}
    <Parts title={t('x_effects_now')} rows={[['x_tax_yield', -p.corruption * 100], ['x_court_cost', p.corruption * 100]]} fmt={(v) => `${signed(v, 1)} %`} />
  </div>;
}
export function DreadTip({ value }: { value?: number }) {
  const p = view.value?.player; const e = ex(); if (!p) return null;
  return <div>
    <TipHead name={t('dread')} value={num(value ?? p.dread, 1)} hint={t('dread_hint')} />
    {e && value === undefined ? <Parts title={t('x_change_per_month')} rows={e.dread.parts} total={e.dread.monthly} digits={2} bad /> : null}
    <div class="muted">{t('x_dread_sources')}</div>
  </div>;
}

// ---------------------------------------------------------------- capacities and costs
export function MerchantsTip() {
  const p = view.value?.player; const e = ex(); if (!p) return null;
  return <div><TipHead name={t('merchants')} value={`${p.merchants.used} / ${p.merchants.cap}`} hint={t('merchant_hint')} />
    {e ? <Parts title={t('x_capacity_from')} rows={e.merchants.parts} total={p.merchants.cap} digits={0} /> : pending()}</div>;
}
export function AgentsTip() {
  const r = realm.value; const e = ex(); if (!r) return null;
  return <div><TipHead name={t('agents')} value={`${r.agents.length} / ${r.agentSlots}`} hint={t('agents_hint')} />
    {e ? <Parts title={t('x_capacity_from')} rows={e.agents.parts} total={r.agentSlots} digits={0} /> : pending()}</div>;
}
export function ColoniesTip() {
  const r = realm.value; const e = ex(); if (!r) return null;
  return <div><TipHead name={t('colonies')} value={`${r.colonies.length} / ${r.colonySlots}`} />
    {e ? <Parts title={t('x_capacity_from')} rows={e.colonies.parts} total={r.colonySlots} digits={0} keepZero /> : pending()}</div>;
}
export function DoctrineTip() {
  const r = realm.value; const e = ex(); if (!r) return null;
  const started = r.doctrines.filter((g: any) => g.taken > 0).length;
  return <div>
    <TipHead name={t('doctrines')} hint={t('doctrine_hint')} />
    {e ? <>
      <Parts title={`${t('x_doctrine_cost')}: ${num(r.doctrineCost)} ${t('insight')}`} rows={e.doctrineCost.parts} total={r.doctrineCost} digits={0} bad />
      <Parts title={`${t('slots')}: ${started} / ${r.doctrineSlots}`} rows={e.doctrineSlots.parts} total={r.doctrineSlots} digits={0} />
    </> : pending()}
  </div>;
}
/** Research rate of a branch: the product of its factors (systems/progress.ts researchRate). */
export function ResearchTip({ k }: { k: number }) {
  const r = realm.value; const e = ex(); if (!r) return null;
  const b = r.tech[k]; const months = b.rate > 0 ? (b.cost - b.progress) / b.rate : Infinity;
  return <div>
    <TipHead name={L(b.name)} value={`${t('level')} ${b.level}`} />
    <div class="tip-drift"><span>{t('progress')} <b>{num(b.progress)} / {num(b.cost)}</b></span><span>{isFinite(months) ? `≈ ${num(months)} ${t('months')}` : '—'}</span></div>
    {e ? <>
      <Parts title={`${t('rate')}: ${num(b.rate, 1)} ${t('x_per_month')}`} rows={e.research[k]} total={b.rate} product />
      {e.researchMods.length > 0 && <Parts title={t('x_research_mods')} rows={e.researchMods} fmt={(v) => `${signed(v * 100, 0)} %`} />}
      <Parts title={`${t('x_level_cost')}: ${num(b.cost)}`} rows={e.techCost[k]} total={b.cost} product bad />
    </> : pending()}
    <div class="muted">{t('tech_cost_hint')}</div>
  </div>;
}
/** Effective tax on one class: nominal rate after exemptions, corruption and modifiers (control is per location). */
export function TaxClassTip({ c }: { c: number }) {
  const p = view.value?.player; const e = ex(); if (!p) return null;
  const x = e?.tax?.[c];
  const pp = (v: number) => pct(v, 1);
  return <div>
    <TipHead name={L(CLASS_NAME[CLASSES[c]])} value={pct(p.taxRate[c] ?? 0)} hint={t(`tax_hint_${c === 6 ? 'wage' : CLASSES[c]}`)} />
    {x ? <>
      <div class="breakdown">
        <div class="bd-row"><span>{t('x_nominal_rate')}</span><span>{pp(x.nominal)}</span></div>
        {x.exempt > 0 && <div class="bd-row"><span>{t('x_exemption')}</span><span class="neg">× {num(1 - x.exempt, 2)}</span></div>}
        {e.taxCommon.map(([k, v]: Row) => Math.abs(v - 1) > 1e-6 && <div class="bd-row"><span>{partLabel(k)}</span><span class={v > 1 ? 'pos' : 'neg'}>× {num(v, 2)}</span></div>)}
        <div class="bd-row bd-total"><span>{t('x_effective_rate')}</span><span>{pp(x.effective)}</span></div>
      </div>
      {x.exemptParts.length > 0 && <Parts title={t('x_exemption')} rows={x.exemptParts} fmt={(v) => `${num(v * 100, 0)} %`} />}
      {e.taxMods.length > 0 && <Parts title={t('x_tax_mods')} rows={e.taxMods} fmt={(v) => `${signed(v * 100, 0)} %`} />}
      <div class="muted">{t('x_tax_control')}</div>
    </> : pending()}
    {c === 0 && <div class="neg">{t('unrest')}: +{num((p.taxRate[0] ?? 0) * 60, 1)} {t('x_in_each_loc')}</div>}
  </div>;
}
/** An estate's contentment and influence with where they drift. */
export function EstateTip({ e, kind }: { e: any; kind: 'influence' | 'contentment' }) {
  const x = ex()?.estates?.find((q: any) => q.id === e.id);
  if (kind === 'influence') return <div><TipHead name={t('influence')} value={num(e.influence)} hint={t('influence_hint')} /><div class="muted">{t('x_influence_from')}</div></div>;
  return <div>
    <TipHead name={t('contentment')} value={num(e.contentment)} hint={t('contentment_hint')} />
    {x && <><Drift target={x.contentTarget} monthly={x.contentMonthly} />
      <Parts title={t('x_target_from')} rows={[['x_base', 50], ['x_privileges', x.privileges * 6], ['x_tax_duties', -(x.duties ?? 0)]]} total={x.contentTarget} digits={0} /></>}
    <div class="muted">{t('x_content_events')}</div>
  </div>;
}
/** Effects of a law option, a privilege or a modifier, with a title. */
export function FxTip({ title, fx, desc }: { title: ComponentChildren; fx: Record<string, number>; desc?: ComponentChildren }) {
  return <div><Effects title={title} fx={fx} />{desc && <div class="muted">{desc}</div>}</div>;
}
