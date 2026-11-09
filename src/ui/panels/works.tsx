// Managing a realm at scale (spec 22, 108): the building overview (where each building can stand, its price, estimated
// yield and payback, with "build at the best N" and "build everywhere"), the construction queue with cancelling, the
// levy overview (where the men come from, harbours, raising many regiments at once, the training queue), and the
// orders for a whole province or area in the location panel. The data comes from src/game/worksview.ts; the orders
// are the ordinary build, recruit and agent commands, sent as one batch command (validated one by one in the sim).
import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { sim } from '../../game/client';
import type { Command, CmdResult, I18n } from '../../sim/types';
import { BUILDINGS, UNITS } from '../../sim/defs';
import { playerId, panelArg, openPanel, showToast } from '../store';
import { errText } from '../i18n';
import { sfx, type Sfx } from '../audio';
import { Parts, TipHead, ManpowerTip } from './explain';
import { Section, Btn, Tabs, Empty, Bar, useQuery, t, L, num, Tip, daysText, selectLoc, placeName, type Cmd } from './common';

/** [location, level after queued works, price, estimated crown gain per month] */
type Spot = [number, number, number, number];
interface TypeV { id: number; key: string; name: I18n; desc: I18n; months: number; max: number; base: number; known: boolean; built: number; other: I18n | null; spots: Spot[] }
interface WorksV {
  treasury: number; inflation: number; priceLevel: number; manpower: number; maxManpower: number; sailors: number;
  provs: Record<number, string>; areas: Record<number, string>; rows: [number, number, number][]; names: Record<number, I18n>;
  types: TypeV[];
  queue: { loc: number; building: number; nth: number; left: number; total: number; cost: number; refund: number }[];
  levy: [number, number, number][];
  units: { id: number; name: I18n; kind: string; cost: number; per: number; days: number; upkeep: number }[];
  recruits: { loc: number; type: number; nth: number; men: number; left: number; total: number; refund: number }[];
}
type Filter = { prov: number; area: number; type: number };

/** Orders per batch command; the sim refuses more at once (src/sim/commands.ts BATCH_MAX). */
const CHUNK = 400;
const tf = (k: string, v: Record<string, string | number>) => t(k).replace(/\{(\w+)\}/g, (_, x) => String(v[x] ?? ''));
const payback = (sp: Spot) => (sp[3] > 1e-6 ? sp[2] / sp[3] : Infinity);
const bySpot = (a: Spot, b: Spot) => payback(a) - payback(b) || a[2] - b[2] || a[0] - b[0];
const months = (v: number) => (Number.isFinite(v) ? `${num(v, 0)} ${t('x_w_mo')}` : '—');

/** The places to build at, in order, while the treasury lasts: [chosen, total price, total yield, places left out]. */
function pick(spots: Spot[], n: number, treasury: number): { chosen: Spot[]; cost: number; gain: number; skipped: number } {
  const chosen: Spot[] = []; let left = treasury, cost = 0, gain = 0, skipped = 0;
  for (const sp of spots) {
    if (chosen.length >= n) break;
    if (sp[2] > left) { skipped++; continue; }
    chosen.push(sp); left -= sp[2]; cost += sp[2]; gain += sp[3];
  }
  return { chosen, cost, gain, skipped };
}

/** Send many orders as batch commands; one toast tells how many were given and why the rest were refused. */
export async function sendOrders(cmds: Cmd[], ok: Sfx = 'build'): Promise<number> {
  const n = playerId.value; let done = 0; let why: string | I18n | null = null;
  for (let i = 0; i < cmds.length; i += CHUNK) {
    const part = cmds.slice(i, i + CHUNK).map((c) => ({ ...c, n }) as Command);
    const r: CmdResult = await sim().cmd({ t: 'batch', n, cmds: part });
    if (r.ok) done += r.done ?? 0;
    if (!why && (r.msg || r.err)) why = r.msg ?? r.err ?? null;
    if (!r.ok) break;
  }
  if (done) { sfx(ok); showToast(why ? `${tf('x_w_batch_done', { k: done })}; ${t('x_w_batch_rest')}: ${errText(why)}` : tf('x_w_batch_done', { k: done })); }
  else { sfx('error'); showToast(errText(why ?? 'nothing to do'), 'err'); }
  return done;
}

const locLabel = (d: { names: Record<number, I18n> }, l: number) => L(d.names[l]) || `#${l}`;
function Place({ d, l }: { d: { names: Record<number, I18n> }; l: number }) {
  return <a class="w-place" onClick={(e) => { e.stopPropagation(); selectLoc(l); }}>{locLabel(d, l)}</a>;
}

// ---------------------------------------------------------------- the panel
export function WorksTab() {
  const [tab, setTab] = useState<'build' | 'levy'>(() => (panelArg.value?.tab === 'levy' ? 'levy' : 'build'));
  const [f, setF] = useState<Filter>({ prov: -1, area: -1, type: -1 });
  const [d, refresh] = useQuery<WorksV>({ q: 'works' }, [], 2000);
  if (!d) return <Empty>{t('loading')}…</Empty>;
  const where = new Map(d.rows.map(([l, p, a]) => [l, [p, a] as const]));
  const inFilter = (l: number) => { const x = where.get(l); return !!x && (f.prov < 0 || x[0] === f.prov) && (f.area < 0 || x[1] === f.area); };
  return <div class="works">
    <Tabs tabs={[['build', t('x_w_tab_build')], ['levy', t('x_w_tab_levy')]]} value={tab} onChange={setTab} />
    <Filters d={d} f={f} setF={setF} types={tab === 'build'} />
    {tab === 'build' ? <BuildTab d={d} f={f} inFilter={inFilter} refresh={refresh} /> : <LevyTab d={d} inFilter={inFilter} refresh={refresh} />}
  </div>;
}

function Filters({ d, f, setF, types }: { d: WorksV; f: Filter; setF: (f: Filter) => void; types: boolean }) {
  const provOfArea = new Map<number, Set<number>>();
  for (const [, p, a] of d.rows) if (p >= 0) { if (!provOfArea.has(a)) provOfArea.set(a, new Set()); provOfArea.get(a)!.add(p); }
  const sortNames = (r: Record<number, string>, keep?: Set<number>) => Object.entries(r).map(([k, v]) => [Number(k), placeName(v)] as const)
    .filter(([k]) => !keep || keep.has(k)).sort((a, b) => a[1].localeCompare(b[1]));
  const areas = sortNames(d.areas), provs = sortNames(d.provs, f.area >= 0 ? provOfArea.get(f.area) : undefined);
  const val = (e: Event) => Number((e.target as HTMLSelectElement).value);
  return <div class="w-filters">
    <select value={f.area} onChange={(e) => setF({ ...f, area: val(e), prov: -1 })}><option value={-1}>{t('x_w_all_areas')}</option>{areas.map(([k, v]) => <option value={k}>{v}</option>)}</select>
    <select value={f.prov} onChange={(e) => setF({ ...f, prov: val(e) })}><option value={-1}>{t('x_w_all_provs')}</option>{provs.map(([k, v]) => <option value={k}>{v}</option>)}</select>
    {types && <select value={f.type} onChange={(e) => setF({ ...f, type: val(e) })}><option value={-1}>{t('x_w_all_types')}</option>{d.types.filter((x) => x.known).map((x) => <option value={x.id}>{L(x.name)}</option>)}</select>}
  </div>;
}

// ---------------------------------------------------------------- buildings
type SortK = 'payback' | 'gain' | 'cost' | 'name';
function BuildTab({ d, f, inFilter, refresh }: { d: WorksV; f: Filter; inFilter: (l: number) => boolean; refresh: () => void }) {
  const [sort, setSort] = useState<SortK>('payback');
  const [n, setN] = useState(5);
  const [open, setOpen] = useState(-1);
  const rows = d.types.filter((x) => x.known && (f.type < 0 || x.id === f.type)).map((x) => {
    const spots = x.spots.filter((sp) => inFilter(sp[0])).sort(bySpot);
    const prices = spots.map((sp) => sp[2]);
    const best = spots[0];
    return { x, spots, min: prices.length ? Math.min(...prices) : 0, max: prices.length ? Math.max(...prices) : 0, gain: spots.reduce((p, sp) => Math.max(p, sp[3]), 0), pay: best ? payback(best) : Infinity };
  });
  const cmp: Record<SortK, (a: typeof rows[0], b: typeof rows[0]) => number> = {
    payback: (a, b) => a.pay - b.pay || b.gain - a.gain || (a.spots.length ? 0 : 1) - (b.spots.length ? 0 : 1) || a.x.id - b.x.id,
    gain: (a, b) => b.gain - a.gain || a.pay - b.pay || a.x.id - b.x.id,
    cost: (a, b) => (a.spots.length ? a.min : Infinity) - (b.spots.length ? b.min : Infinity) || a.x.id - b.x.id,
    name: (a, b) => L(a.x.name).localeCompare(L(b.x.name)),
  };
  rows.sort(cmp[sort]); // Infinity - Infinity is NaN, which falls through to the next comparison
  const head = (k: SortK | null, label: string, hint: string, cls = 'r') => <Tip tag="th" class={`${k ? 'sortable' : ''} ${k === sort ? 'on' : ''} ${cls}`} content={<div><TipHead name={label} hint={hint} /></div>}
    onClick={() => k && setSort(k)}>{label}{k === sort ? ' ▴' : ''}</Tip>;
  const build = (b: number, spots: Spot[]) => sendOrders(spots.map(([loc]) => ({ t: 'build', loc, building: b }) as Cmd)).then(refresh);
  return <>
    <div class="w-bar">
      <span class="muted">{t('treasury')}: <b>{num(d.treasury)}</b> <i class="ic gold sm" /></span>
      <span class="w-n"><Tip content={<div><TipHead name={t('x_w_count')} hint={t('x_w_count_hint')} /></div>}><span class="has-tip">{t('x_w_count')}</span></Tip>
        <input type="number" min={1} max={200} value={n} onChange={(e) => setN(Math.max(1, Math.min(200, Number((e.target as HTMLInputElement).value) || 1)))} /></span>
      <select value={sort} onChange={(e) => setSort((e.target as HTMLSelectElement).value as SortK)}>
        {(['payback', 'gain', 'cost', 'name'] as SortK[]).map((k) => <option value={k}>{t('x_w_sort')} {t(`x_w_sort_${k}`)}</option>)}
      </select>
    </div>
    <div class="tbl-wrap"><table class="tbl w-tbl">
      <thead><tr>
        {head('name', t('x_w_building'), t('x_w_tab_build'), '')}
        {head(null, t('x_w_built'), t('x_w_built_hint'))}
        {head(null, t('x_w_places'), t('x_w_places_hint'))}
        {head('cost', t('price'), t('x_w_price_hint'))}
        {head('gain', t('x_w_yield'), t('x_w_yield_hint'))}
        {head('payback', t('x_w_payback'), t('x_w_payback_hint'))}
        <th />
      </tr></thead>
      <tbody>{rows.map((r) => {
        const x = r.x;
        // a realm raises one seat of government at a time (src/sim/commands.ts buildRefusal)
        const cap = x.key === 'admin' ? 1 : Infinity;
        const best = pick(r.spots, Math.min(n, cap), d.treasury), all = pick(r.spots, cap, d.treasury);
        const one = (sp: Spot) => sendOrders([{ t: 'build', loc: sp[0], building: x.id } as Cmd]).then(refresh);
        const rowsOut = [<tr class={`click ${open === x.id ? 'me' : ''} ${r.spots.length ? '' : 'muted'}`} onClick={() => setOpen(open === x.id ? -1 : x.id)}>
          <Tip tag="td" content={<div><TipHead name={L(x.name)} value={`${x.months} ${t('months')}`} hint={L(x.desc)} />{x.other && <div class="small"><b>{t('x_w_use')}:</b> {L(x.other)}</div>}</div>}>
            <span class="caret">{open === x.id ? '▾' : '▸'}</span> {L(x.name)}</Tip>
          <td class="r">{x.built}</td>
          <td class="r">{r.spots.length}</td>
          <td class="r">{r.spots.length ? (Math.round(r.min) === Math.round(r.max) ? num(r.min) : `${num(r.min)}–${num(r.max)}`) : '—'}</td>
          <td class="r">{r.gain > 1e-6 ? `+${num(r.gain, 2)}` : <span class="muted">{x.other ? '·' : '—'}</span>}</td>
          <td class="r">{months(r.pay)}</td>
          <td class="r w-acts" onClick={(e) => e.stopPropagation()}>{r.spots.length > 0 && <>
            <Btn disabled={best.chosen.length ? null : 'not enough gold'} tip={() => <BatchTip x={x} p={best} of={r.spots.length} d={d} hint={tf('x_w_best_hint', { n })} />} onClick={() => build(x.id, best.chosen)}>{tf('x_w_best', { n: Math.min(n, cap, r.spots.length) })}</Btn>
            <Btn disabled={all.chosen.length ? null : 'not enough gold'} tip={() => <BatchTip x={x} p={all} of={r.spots.length} d={d} hint={t('x_w_all_hint')} />} onClick={() => build(x.id, all.chosen)}>{tf('x_w_all', { k: all.chosen.length })}</Btn>
          </>}</td>
        </tr>];
        if (open === x.id) rowsOut.push(<tr class="w-sub"><td colSpan={7}><SpotList d={d} x={x} spots={r.spots} onBuild={one} /></td></tr>);
        return rowsOut;
      })}</tbody>
    </table></div>
    <BuildQueue d={d} refresh={refresh} />
  </>;
}

function SpotList({ d, x, spots, onBuild }: { d: WorksV; x: TypeV; spots: Spot[]; onBuild: (sp: Spot) => void }) {
  const [all, setAll] = useState(false);
  if (!spots.length) return <div class="muted small">{t('x_w_no_spots')}</div>;
  const shown = all ? spots : spots.slice(0, 12);
  const prov = new Map(d.rows.map(([l, p]) => [l, p]));
  return <div class="w-spots">
    <table class="tbl"><tbody>{shown.map((sp) => <tr>
      <td><Place d={d} l={sp[0]} /> <span class="muted small">{placeName(d.provs[prov.get(sp[0]) ?? -1] ?? '')}</span></td>
      <td class="r muted">{t('level')} {sp[1] + 1}</td>
      <Tip tag="td" class="r has-tip" content={() => <PriceTip d={d} x={x} sp={sp} />}>{num(sp[2])}</Tip>
      <Tip tag="td" class="r has-tip" content={() => <GainTip loc={sp[0]} b={x.id} />}>{sp[3] > 1e-6 ? `+${num(sp[3], 2)}` : '—'}</Tip>
      <Tip tag="td" class="r has-tip" content={() => <PaybackTip sp={sp} />}>{months(payback(sp))}</Tip>
      <td class="r"><Btn disabled={sp[2] > d.treasury ? 'not enough gold' : null} onClick={() => onBuild(sp)}>{t('build')}</Btn></td>
    </tr>)}</tbody></table>
    {spots.length > shown.length && <a class="more" onClick={() => setAll(true)}>{t('more')} ({spots.length - shown.length})</a>}
  </div>;
}

/** Price of one level: base × level factor × price level × inflation, as src/sim/commands.ts buildCost. */
function PriceTip({ d, x, sp }: { d: WorksV; x: TypeV; sp: Spot }) {
  return <div><TipHead name={`${L(x.name)} · ${t('level')} ${sp[1] + 1}`} value={num(sp[2])} />
    <Parts rows={[['x_build_base', x.base], ['x_build_level', 1 + sp[1] * 0.5], ['x_price_level', d.priceLevel], ['inflation', 1 + d.inflation]]} product base={(v) => num(v, 0)} total={sp[2]} totalLabel={t('cost')} />
    <div class="muted small">{x.months} {t('months')} · {t('x_two_works')}</div></div>;
}
function PaybackTip({ sp }: { sp: Spot }) {
  return <div><TipHead name={t('x_w_payback')} value={months(payback(sp))} hint={t('x_w_payback_hint')} />
    <div class="breakdown"><div class="bd-row"><span>{t('price')}</span><span>{num(sp[2], 1)}</span></div>
      <div class="bd-row"><span>÷ {t('x_w_yield')}</span><span>{num(sp[3], 3)}</span></div>
      <div class="bd-row bd-total"><span>=</span><span>{months(payback(sp))}</span></div></div></div>;
}
/** The estimate behind a place's yield, asked from the sim when the tooltip opens (src/sim/systems/planning.ts). */
export function GainTip({ loc, b }: { loc: number; b: number }) {
  const [g] = useQuery<any>({ q: 'gain', loc, building: b }, [loc, b], 5000);
  if (!g) return <div class="muted">{t('loading')}…</div>;
  return <div>
    <TipHead name={t('x_w_gain_head')} value={`${g.gold > 0 ? '+' : ''}${num(g.gold, 2)} / ${t('month')}`} hint={t('x_w_gain_hint')} />
    {g.gold > 1e-6 ? <Parts rows={g.parts} total={g.gold} totalLabel={t('x_w_yield')} digits={3} /> : <div class="muted small">{t('x_w_gain_none')}</div>}
    {g.other && <div class="small"><b>{t('x_w_use')}:</b> {L(g.other)}</div>}
    {g.gold > 1e-6 && <div class="tip-drift"><span>{t('x_w_payback')}: <b>{months(g.cost / g.gold)}</b></span></div>}
  </div>;
}
function BatchTip({ x, p, of, d, hint }: { x: { name: I18n; months: number }; p: ReturnType<typeof pick>; of: number; d: { treasury: number; names: Record<number, I18n> }; hint: string }) {
  return <div>
    <TipHead name={L(x.name)} value={tf('x_w_affordable', { k: p.chosen.length, m: of })} hint={hint} />
    <div class="breakdown">
      <div class="bd-row"><span>{t('x_w_total_cost')}</span><span class="neg">{num(p.cost)}</span></div>
      {p.gain > 0 && <div class="bd-row"><span>{t('x_w_total_gain')}</span><span class="pos">+{num(p.gain, 2)}</span></div>}
      {p.gain > 0 && <div class="bd-row"><span>{t('x_w_payback')}</span><span>{months(p.cost / p.gain)}</span></div>}
      <div class="bd-row"><span>{t('x_w_time')}</span><span>{x.months} {t('months')}</span></div>
      <div class="bd-row bd-total"><span>{t('x_w_left_over')}</span><span>{num(d.treasury - p.cost)}</span></div>
    </div>
    <PlaceList d={d} locs={p.chosen.map((sp) => sp[0])} />
    {p.skipped > 0 && <div class="muted small">{t('x_w_not_paid')}: {p.skipped}</div>}
  </div>;
}
function PlaceList({ d, locs, max = 10 }: { d: { names: Record<number, I18n> }; locs: number[]; max?: number }) {
  if (!locs.length) return null;
  return <div class="small w-placelist">{locs.slice(0, max).map((l) => locLabel(d, l)).join(', ')}{locs.length > max ? ` … (+${locs.length - max})` : ''}</div>;
}

function BuildQueue({ d, refresh }: { d: WorksV; refresh: () => void }) {
  return <Section title={<>{t('x_w_queue')} <span class="muted">({d.queue.length})</span></>} id="works-queue">
    {!d.queue.length ? <div class="muted small">{t('x_w_queue_empty')}</div> : <table class="tbl"><tbody>{d.queue.map((c) => {
      const x = BUILDINGS[c.building]; const done = 1 - c.left / Math.max(1, c.total);
      return <tr>
        <td><Place d={d} l={c.loc} /></td><td>{L(x.name)}</td>
        <td class="w-prog"><Bar value={done} max={1} color="#7a5a2a" tip={<div><TipHead name={t('x_w_progress')} value={`${num(done * 100)} %`} /><div class="muted small">{daysText(c.left)}</div></div>} /></td>
        <td class="r muted small">{daysText(c.left)}</td>
        <td class="r"><Btn tip={() => <RefundTip paid={c.cost} label="x_w_paid" share={c.left / Math.max(1, c.total)} refund={c.refund} hint={t('x_w_cancel_build_hint')} />} onClick={() => sendOrders([{ t: 'cancel', kind: 'build', loc: c.loc, item: c.building, nth: c.nth } as Cmd], 'click').then(refresh)}>{t('cancel')} · +{num(c.refund)}</Btn></td>
      </tr>;
    })}</tbody></table>}
  </Section>;
}
/** Refund of a cancelled order (src/sim/commands.ts constructionRefund, recruitRefund): half of what is not yet used. */
function RefundTip({ paid, label, share, refund, hint }: { paid: number; label: string; share?: number; refund: number; hint: string }) {
  return <div><TipHead name={t('x_w_refund')} value={`+${num(refund)}`} hint={hint} />
    <Parts rows={[[label, paid], ...(share !== undefined ? [['x_w_share_left', Math.max(0, Math.min(1, share))] as [string, number]] : []), ['x_w_half', 0.5]]} product base={(v) => num(v, 0)} total={refund} totalLabel={t('x_w_refund')} /></div>;
}

// ---------------------------------------------------------------- levies
function LevyTab({ d, inFilter, refresh }: { d: WorksV; inFilter: (l: number) => boolean; refresh: () => void }) {
  const [unit, setUnit] = useState(() => d.units[0]?.id ?? 0);
  const [count, setCount] = useState(5);
  const [spread, setSpread] = useState(3);
  const [all, setAll] = useState(false);
  const u = d.units.find((x) => x.id === unit) ?? d.units[0];
  const ship = u?.kind === 'ship';
  const levy = d.levy.filter(([l]) => inFilter(l));
  const places = levy.filter(([, , h]) => !ship || h > 0).slice(0, Math.max(1, spread)).map(([l]) => l);
  const menEach = u ? (ship ? u.per * 50 : u.per) : 0;
  const pool = ship ? d.sailors : d.manpower;
  const k = u && places.length ? Math.max(0, Math.min(count, Math.floor(d.treasury / Math.max(1e-9, u.cost)), Math.floor(pool / Math.max(1, menEach)))) : 0;
  const why = !u ? 'unit not available' : !places.length ? (ship ? 'needs a harbour' : 'not your location') : d.treasury < u.cost ? 'not enough gold' : pool < menEach ? (ship ? 'not enough sailors' : 'not enough manpower') : null;
  const plan = Array.from({ length: k }, (_, i) => places[i % places.length]);
  const raise = () => sendOrders(plan.map((loc) => ({ t: 'recruit', loc, unit: u!.id, men: u!.per }) as Cmd), 'coins').then(refresh);
  const shown = all ? levy : levy.slice(0, 20);
  const prov = new Map(d.rows.map(([l, p]) => [l, p]));
  return <>
    <div class="grid2">
      <div class="kv"><span class="k">{t('manpower')}</span><Tip content={() => <ManpowerTip />}><span class="v has-tip">{num(d.manpower)} / {num(d.maxManpower)}</span></Tip></div>
      <div class="kv"><span class="k">{t('x_w_refill')}</span><Tip content={<div><TipHead name={t('x_w_refill')} value={`+${num(d.maxManpower / 120)}`} hint={t('x_w_refill_hint')} /><div class="breakdown"><div class="bd-row"><span>{t('x_w_limit')}</span><span>{num(d.maxManpower)}</span></div><div class="bd-row"><span>÷ 120</span><span /></div><div class="bd-row bd-total"><span>=</span><span>+{num(d.maxManpower / 120)}</span></div></div></div>}><span class="v has-tip">+{num(d.maxManpower / 120)}</span></Tip></div>
      <div class="kv"><span class="k">{t('sailors')}</span><span class="v">{num(d.sailors)}</span></div>
      <div class="kv"><span class="k">{t('treasury')}</span><span class="v">{num(d.treasury)} <i class="ic gold sm" /></span></div>
    </div>
    <Section title={t('x_w_raise')} id="works-raise">
      <div class="w-raise">
        <select value={u?.id} onChange={(e) => setUnit(Number((e.target as HTMLSelectElement).value))}>{d.units.map((x) => <option value={x.id}>{x.kind === 'ship' ? '⚓ ' : ''}{L(x.name)} · {num(x.cost)}</option>)}</select>
        <label>{ship ? t('x_w_squadrons') : t('x_w_regiments')} <input type="number" min={1} max={100} value={count} onChange={(e) => setCount(Math.max(1, Math.min(100, Number((e.target as HTMLInputElement).value) || 1)))} /></label>
        <Tip content={<div><TipHead name={t('x_w_spread')} hint={t('x_w_spread_hint')} /></div>}><label class="has-tip">{t('x_w_spread')} <input type="number" min={1} max={30} value={spread} onChange={(e) => setSpread(Math.max(1, Math.min(30, Number((e.target as HTMLInputElement).value) || 1)))} /> {t('x_w_places')}</label></Tip>
        <Btn small={false} cls="gold" disabled={k ? null : why ?? 'nothing to do'} tip={() => u && <RaiseTip d={d} u={u} k={k} want={count} menEach={menEach} pool={pool} plan={plan} />} onClick={raise}>{tf('x_w_raise_btn', { n: k })}</Btn>
      </div>
    </Section>
    <Section title={<Tip content={<div><TipHead name={t('x_w_levy_head')} hint={t('x_w_levy_hint')} /></div>}><span class="has-tip">{t('x_w_levy_head')}</span></Tip>} id="works-levy">
      <table class="tbl"><thead><tr><th>{t('location')}</th><th>{t('province')}</th><th class="r">{t('men')}</th><th class="r">{t('x_w_harbour')}</th></tr></thead>
        <tbody>{shown.map(([l, mp, h]) => <tr class={`click ${places.includes(l) ? 'me' : ''}`} onClick={() => selectLoc(l)}>
          <td>{locLabel(d, l)}</td><td class="muted">{placeName(d.provs[prov.get(l) ?? -1] ?? '')}</td>
          <Tip tag="td" class="r has-tip" content={<div><TipHead name={t('x_w_levy_head')} value={`+${num(mp)}`} hint={t('x_w_levy_hint')} /></div>}>+{num(mp)}</Tip>
          <td class="r">{h < 0 ? <span class="muted">{t('x_w_inland')}</span> : h > 0 ? `⚓ ${h}` : <span class="muted">{t('x_w_no_harbour')}</span>}</td>
        </tr>)}</tbody></table>
      {levy.length > shown.length && <a class="more" onClick={() => setAll(true)}>{t('more')} ({levy.length - shown.length})</a>}
    </Section>
    <Section title={<>{t('x_w_recruits')} <span class="muted">({d.recruits.length})</span></>} id="works-recruits">
      {!d.recruits.length ? <div class="muted small">{t('x_w_recruits_empty')}</div> : <table class="tbl"><tbody>{d.recruits.map((r) => {
        const U = UNITS[r.type]; const done = 1 - r.left / Math.max(1, r.total);
        return <tr>
          <td><Place d={d} l={r.loc} /></td><td>{L(U.name)}</td><td class="r">{num(r.men)} {U.kind === 'ship' ? t('ships') : t('men')}</td>
          <td class="w-prog"><Bar value={done} max={1} color="#3a5a80" tip={<div><TipHead name={t('x_w_progress')} value={`${num(done * 100)} %`} /><div class="muted small">{daysText(r.left)}</div></div>} /></td>
          <td class="r muted small">{daysText(r.left)}</td>
          <td class="r"><Btn tip={() => <RefundTip paid={r.refund * 2} label="price" refund={r.refund} hint={t('x_w_cancel_recruit_hint')} />} onClick={() => sendOrders([{ t: 'cancel', kind: 'recruit', loc: r.loc, item: r.type, nth: r.nth } as Cmd], 'click').then(refresh)}>{t('cancel')} · +{num(r.refund)}</Btn></td>
        </tr>;
      })}</tbody></table>}
    </Section>
  </>;
}
function RaiseTip({ d, u, k, want, menEach, pool, plan }: { d: WorksV; u: WorksV['units'][0]; k: number; want: number; menEach: number; pool: number; plan: number[] }) {
  const ship = u.kind === 'ship';
  const per = new Map<number, number>(); for (const l of plan) per.set(l, (per.get(l) ?? 0) + 1);
  return <div>
    <TipHead name={`${L(u.name)} × ${k}`} value={num(u.cost * k)} hint={t('x_w_spread_hint')} />
    <div class="breakdown">
      <div class="bd-row"><span>{t('x_w_per_unit')} ({num(u.per)} {ship ? t('ships') : t('men')})</span><span>{num(u.cost, 1)}</span></div>
      <div class="bd-row"><span>× {k}{k < want ? ` (${want})` : ''}</span><span class="neg">{num(u.cost * k)}</span></div>
      <div class="bd-row"><span>{t('x_w_men_needed')}</span><span class={menEach * k > pool ? 'neg' : ''}>{num(menEach * k)} / {num(pool)} {ship ? t('sailors') : t('manpower')}</span></div>
      <div class="bd-row"><span>{t('x_w_training')}</span><span>{u.days} {t('days')}</span></div>
      <div class="bd-row bd-total"><span>{t('x_w_left_over')}</span><span>{num(d.treasury - u.cost * k)}</span></div>
    </div>
    {per.size > 0 && <div class="small w-placelist"><b>{t('x_w_where')}:</b> {[...per].map(([l, c]) => `${locLabel(d, l)} ×${c}`).join(', ')}</div>}
  </div>;
}

// ---------------------------------------------------------------- orders for a province or area (location panel)
/** Build, convert and assimilate across the province or area of a location, as one batch of ordinary orders. */
export function ScopeOrders({ loc }: { loc: number }) {
  return <Section title={t('x_w_scope')} id="loc-scope" open={false}
    right={<a class="more" onClick={() => openPanel('works')}>{t('x_w_overview')}</a>}>
    <ScopeBody loc={loc} />
  </Section>;
}
function ScopeBody({ loc }: { loc: number }) {
  const [scope, setScope] = useState<'province' | 'area'>('province');
  const [b, setB] = useState(-1);
  const [d, refresh] = useQuery<any>({ q: 'scope', loc, scope }, [loc, scope], 2000);
  if (!d) return <div class="muted">{t('loading')}…</div>;
  const types: { id: number; name: I18n; months: number; spots: Spot[] }[] = d.types.map((x: any) => ({ ...x, spots: [...x.spots].sort(bySpot) }));
  types.sort((a, c) => payback(a.spots[0]) - payback(c.spots[0]) || a.id - c.id);
  const x = types.find((y) => y.id === b) ?? types[0];
  const p = x ? pick(x.spots, BUILDINGS[x.id]?.id === 'admin' ? 1 : Infinity, d.treasury) : null;
  return <div class="w-scope">
    <Tabs tabs={[['province', t('province')], ['area', t('area')]]} value={scope} onChange={(v) => { setScope(v); setB(-1); }} />
    <div class="muted small">{placeName(d.name)}: {tf('x_w_scope_ours', { mine: d.mine, total: d.total })}</div>
    {!x ? <div class="muted small">{t('x_w_scope_none')}</div> : <div class="act-row">
      <select value={x.id} onChange={(e) => setB(Number((e.target as HTMLSelectElement).value))}>
        {types.map((y) => <option value={y.id}>{L(y.name)} ({y.spots.length})</option>)}
      </select>
      <Btn disabled={p!.chosen.length ? null : 'not enough gold'} tip={() => <BatchTip x={x} p={p!} of={x.spots.length} d={d} hint={t('x_w_scope_build_hint')} />}
        onClick={() => sendOrders(p!.chosen.map(([l]) => ({ t: 'build', loc: l, building: x.id }) as Cmd)).then(refresh)}>{tf('x_w_scope_build', { k: p!.chosen.length })}</Btn>
    </div>}
    {d.agents.map((a: any) => <AgentRow d={d} a={a} refresh={refresh} />)}
  </div>;
}
function AgentRow({ d, a, refresh }: { d: any; a: { kind: 'faith' | 'culture'; spots: [number, number, number][]; label: I18n[] }; refresh: () => void }) {
  const chosen: [number, number, number][] = []; let left = d.treasury;
  for (const sp of a.spots) { if (chosen.length >= d.freeAgents) break; if (sp[1] <= left) { chosen.push(sp); left -= sp[1]; } }
  const cost = chosen.reduce((p, sp) => p + sp[1], 0);
  const why = !a.spots.length ? 'nothing to do' : !d.freeAgents ? 'no free preachers or officials' : !chosen.length ? 'not enough gold' : null;
  const name = a.kind === 'faith' ? t('x_w_other_faith') : t('x_w_other_culture');
  const tip = (): ComponentChildren => <div>
    <TipHead name={a.kind === 'faith' ? t('convert') : t('assimilate')} value={num(cost)} hint={t('x_w_scope_send_hint')} />
    <div class="breakdown">
      <div class="bd-row"><span>{name}</span><span>{a.spots.length}</span></div>
      <div class="bd-row"><span>{t('x_w_free_agents')}</span><span>{d.freeAgents} / {d.slots}</span></div>
      <div class="bd-row bd-total"><span>{t('x_w_total_cost')}</span><span class="neg">{num(cost)}</span></div>
    </div>
    {chosen.length > 0 && <div class="small w-placelist">{chosen.slice(0, 10).map((sp) => `${locLabel(d, sp[0])} (${L(a.label[a.spots.indexOf(sp)])}, ${num(sp[1])})`).join(', ')}</div>}
  </div>;
  return <div class="act-row">
    <span class="k">{name}: <b>{a.spots.length}</b>{!a.spots.length && <span class="muted"> · {t('x_w_all_ours')}</span>}</span>
    <Btn disabled={why} tip={tip} onClick={() => sendOrders(chosen.map(([l]) => ({ t: 'agent', loc: l, kind: a.kind }) as Cmd), 'click').then(refresh)}>{tf('x_w_scope_send', { k: chosen.length })}</Btn>
  </div>;
}
