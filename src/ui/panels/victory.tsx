// Victory (spec point 84) and the history of the game (spec point 85): the victory panel with the progress toward each
// chosen condition, the chooser on the select screen, and the line charts of the end screen.
import './polish.css';
import { useMemo, useState } from 'preact/hooks';
import { nations, sim, view } from '../../game/client';
import { settings, playerId, showToast } from '../store';
import { Section, Empty, NLink, Bar, Btn, Tip, t, L, lang, num, pct, useQuery, rgb } from './common';
import type { ChronEntry } from '../../sim/types';
import { chronInvolves } from '../../sim/ctx';
import { chronicleMarkdown, chronicleJson, exportName, downloadText, type ChronExport } from '../chronexport';
import { TipHead, Parts } from './explain';
import { VICTORY_KINDS, VICTORY_RULES, VICTORY_YEARS, type VictoryKind } from '../../sim/victoryRules';
import { cvdColorOf } from '../palette';

/** Text of a victory kind with its thresholds filled in. */
export function victoryDesc(kind: VictoryKind): string {
  const R = VICTORY_RULES as any;
  return t(`x_vic_desc_${kind}`).replace('{share}', pct(R[kind]?.share ?? 0)).replace('{lead}', num(R.learning.lead, 2)).replace('{stages}', String(R.learning.stages))
    .replace('{era}', String(R.learning.era + 1)).replace('{years}', String(VICTORY_YEARS));
}
export const victoryName = (kind: string) => { const v = t(`x_vic_${kind}`); return v === `x_vic_${kind}` ? kind : v; };
const fmtVal = (unit: string, v: number) => unit === 'share' ? pct(v, 1) : unit === 'ratio' ? `× ${num(v, 2)}` : num(v, 0);

// ---------------------------------------------------------------- the panel
interface Row { kind: VictoryKind; value: number; target: number; unit: 'share' | 'points' | 'ratio'; meets: boolean; missing: string[]; leader: number; leaderValue: number; holder: number; years: number; detail?: Record<string, number> }
interface Status { kinds: VictoryKind[]; years: number; rows: Row[]; endYear: number; ended: boolean; victory?: { nation: number; kind: string; day?: number } }

function RowTip({ r }: { r: Row }) {
  const unitHint = r.unit === 'share' ? t('x_vic_share_hint') : r.unit === 'ratio' ? t('x_vic_ratio_hint') : t('x_vic_points_hint');
  const conds: [string, boolean][] = conditionsOf(r);
  return <div>
    <TipHead name={victoryName(r.kind)} value={fmtVal(r.unit, r.value)} hint={victoryDesc(r.kind)} />
    <div class="breakdown">
      <div class="bd-row"><span>{t('x_vic_ours')}</span><span>{fmtVal(r.unit, r.value)}</span></div>
      <div class="bd-row"><span>{r.kind === 'score' ? t('x_vic_best') : t('x_vic_needed')}</span><span>{fmtVal(r.unit, r.target)}</span></div>
      {r.leader >= 0 && <div class="bd-row"><span>{t('x_vic_leader')}: {L(nations.value[r.leader]?.short)}</span><span>{fmtVal(r.unit, r.leaderValue)}</span></div>}
    </div>
    {r.kind === 'learning' && r.detail && <Parts title={t('x_vic_learning_points')} digits={0} rows={[['x_vic_tech', r.detail.tech], ['x_vic_innovations', r.detail.innovations * 2], ['x_vic_stages', r.detail.stages * 3]]} total={r.detail.points} />}
    {r.kind === 'learning' && r.detail && <div class="breakdown"><div class="bd-row"><span>{t('x_vic_second')}</span><span>{num(r.detail.second, 0)}</span></div><div class="bd-row bd-total"><span>{t('x_vic_ratio')}</span><span>× {num(r.value, 2)}</span></div></div>}
    {r.kind === 'commerce' && r.detail && <div class="breakdown"><div class="bd-row"><span>{t('x_vic_trade_income')}</span><span>{num(r.detail.income, 1)}</span></div><div class="bd-row"><span>{t('x_vic_trade_world')}</span><span>{num(r.detail.world, 1)}</span></div><div class="bd-row bd-total"><span>{t('x_vic_share')}</span><span>{pct(r.value, 1)}</span></div></div>}
    {conds.length > 0 && <div class="breakdown"><div class="bd-title">{t('x_vic_conditions')}</div>{conds.map(([k, ok]) => <div class="bd-row"><span>{t(`x_vic_c_${k}`)}</span><span class={ok ? 'pos' : 'neg'}>{ok ? '✓' : '✗'}</span></div>)}</div>}
    <div class="tip-hint">{unitHint}</div>
  </div>;
}
/** The parts of a condition, met or not (as the simulation checks them in systems/victory.ts). */
function conditionsOf(r: Row): [string, boolean][] {
  const parts: Record<VictoryKind, string[]> = { score: [], hegemony: ['share', 'independent'], learning: ['lead', 'stages', 'era', 'independent'], commerce: ['share', 'great_power', 'independent'], faith: ['share', 'leader', 'independent'] };
  return parts[r.kind].map((k) => [`${r.kind}_${k}`, !r.missing.includes(k)]);
}

function VictoryRowView({ r, me }: { r: Row; me: number }) {
  const ours = r.holder === me && me >= 0;
  const left = r.holder >= 0 ? Math.max(0, VICTORY_YEARS - r.years) : VICTORY_YEARS;
  const max = r.kind === 'score' ? Math.max(1, r.target) : r.unit === 'ratio' ? Math.max(r.target * 1.2, r.value) : Math.max(r.target, r.value, 1e-9);
  return <div class={`vic-row ${r.meets ? 'meets' : ''}`}>
    <div class="vic-head"><b>{victoryName(r.kind)}</b>{r.meets && <span class="pos small">✓ {t('x_vic_met')}</span>}<span class="spacer" />
      <Tip content={<RowTip r={r} />}><span class="vic-val has-tip">{fmtVal(r.unit, r.value)} <span class="muted">/ {fmtVal(r.unit, r.target)}</span></span></Tip></div>
    <div class="muted small">{victoryDesc(r.kind)}</div>
    <Bar value={r.value} max={max} h={9} color={r.meets ? 'var(--p-pos)' : undefined} tip={() => <RowTip r={r} />} />
    <div class="vic-foot small">
      {r.leader >= 0 && <span>{t('x_vic_leader')}: <NLink id={r.leader} size={14} /> <span class="muted">{fmtVal(r.unit, r.leaderValue)}</span></span>}
      {r.kind !== 'score' && (r.holder >= 0
        ? <Tip content={<div><TipHead name={t('x_vic_holding')} value={`${num(r.years, 1)} / ${VICTORY_YEARS}`} hint={t('x_vic_holding_hint')} /><div class="breakdown"><div class="bd-row"><span>{t('x_vic_held')}</span><span>{num(r.years, 1)} {t('x_vic_years')}</span></div><div class="bd-row"><span>{t('x_vic_left')}</span><span>{num(left, 1)} {t('x_vic_years')}</span></div></div></div>}>
          <span class={`has-tip ${ours ? 'pos' : 'neg'}`}>{ours ? t('x_vic_we_hold') : <><NLink id={r.holder} size={14} /> {t('x_vic_holds')}</>} · {num(r.years, 1)} / {VICTORY_YEARS} {t('x_vic_years')}</span></Tip>
        : <span class="muted">{t('x_vic_nobody')}</span>)}
    </div>
  </div>;
}

export function VictoryTab() {
  const [st] = useQuery<Status>({ q: 'victory' }, [], 2000);
  const me = playerId.value;
  if (!st) return <Empty>{t('loading')}…</Empty>;
  const others = VICTORY_KINDS.filter((k) => !st.kinds.includes(k));
  return <div class="tab-victory">
    {st.victory && st.ended && <div class="vic-ended"><NLink id={st.victory.nation} size={28} full /> <span>{endingText(st.victory, me)}</span></div>}
    <div class="muted small">{t('x_vic_intro').replace('{years}', String(VICTORY_YEARS)).replace('{end}', String(st.endYear))}</div>
    {st.rows.map((r) => <VictoryRowView r={r} me={me} />)}
    {others.length > 0 && <div class="muted small vic-off">{t('x_vic_not_chosen')}: {others.map(victoryName).join(', ')}</div>}
    <Section title={t('x_hist_title')} id="vic-hist" open={false}><HistoryCharts /></Section>
  </div>;
}

/** How the game ended, in one sentence. */
export function endingText(v: { nation: number; kind: string; day?: number }, me: number): string {
  const n = nations.value[v.nation]; const name = n ? L(n.short) : '?';
  const key = v.kind === 'score' ? 'x_end_by_score' : 'x_end_by_condition';
  const txt = t(key).replace('{realm}', name).replace('{kind}', victoryName(v.kind)).replace('{years}', String(VICTORY_YEARS));
  return v.nation === me ? `${txt} ${t('x_end_we_won')}` : txt;
}

// ---------------------------------------------------------------- the chooser on the select screen
export function VictoryChooser({ value, onChange }: { value: VictoryKind[]; onChange: (v: VictoryKind[]) => void }) {
  return <div class="vic-choose">
    {VICTORY_KINDS.map((k) => {
      const on = k === 'score' || value.includes(k);
      return <Tip content={<div><TipHead name={victoryName(k)} hint={victoryDesc(k)} />{k === 'score' && <div class="tip-hint">{t('x_vic_score_always')}</div>}</div>}>
        <button class={on ? 'on' : ''} disabled={k === 'score'} onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}>{on ? '☑' : '☐'} {victoryName(k)}</button>
      </Tip>;
    })}
  </div>;
}

// ---------------------------------------------------------------- history charts
export interface HPoint { y: number; dev: number; locs: number; treasury: number; income: number; army: number | null; score: number | null }
export interface HSeries { id: number; name: any; color: [number, number, number]; player: boolean; points: HPoint[] }
export interface HData { startYear: number; endYear: number; series: HSeries[] }
export const METRICS = ['dev', 'locs', 'treasury', 'income', 'army', 'score'] as const;
export type Metric = (typeof METRICS)[number];

const W = 640, H = 230, PAD = { l: 52, r: 12, t: 10, b: 24 };
/** A round step for the axis (1, 2, 5 × 10^k). */
function niceStep(span: number, n = 4): number {
  const raw = span / n; const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  const m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
const seriesColor = (s: HSeries) => (settings.value.palette === 'cvd' ? cvdColorOf(s.id) : s.color);

/** One metric over the whole game: a line per realm, the player's drawn heavier; hover shows every value of a year. */
export function HistoryChart({ data, metric }: { data: HData; metric: Metric }) {
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const geo = useMemo(() => {
    const y0 = data.startYear, y1 = Math.max(data.endYear, y0 + 1);
    let lo = 0, hi = 1;
    for (const s of data.series) for (const p of s.points) { const v = p[metric]; if (v === null || v === undefined) continue; lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const step = niceStep(hi - lo); lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const x = (y: number) => PAD.l + ((y - y0) / (y1 - y0)) * (W - PAD.l - PAD.r);
    const yv = (v: number) => H - PAD.b - ((v - lo) / Math.max(1e-9, hi - lo)) * (H - PAD.t - PAD.b);
    const ticks: number[] = []; for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
    const ystep = niceStep(y1 - y0, 6); const years: number[] = []; for (let y = Math.ceil(y0 / ystep) * ystep; y <= y1; y += ystep) years.push(y);
    return { y0, y1, x, yv, ticks, years };
  }, [data, metric]);
  const paths = data.series.map((s) => {
    let d = ''; let pen = false;
    for (const p of s.points) { const v = p[metric]; if (v === null || v === undefined) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${geo.x(p.y).toFixed(1)},${geo.yv(v).toFixed(1)}`; pen = true; }
    return { s, d };
  });
  // the player's line last, so that it lies on top
  paths.sort((a, b) => Number(a.s.player) - Number(b.s.player) || Number(a.s.id === focus) - Number(b.s.id === focus));
  const onMove = (e: MouseEvent) => {
    const svg = e.currentTarget as SVGSVGElement; const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / Math.max(1, r.width)) * W;
    const y = Math.round(geo.y0 + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (geo.y1 - geo.y0));
    setHover(Math.max(geo.y0, Math.min(geo.y1, y)));
  };
  const at = (s: HSeries, y: number) => { let best: HPoint | null = null; for (const p of s.points) { if (p.y > y) break; best = p; } return best && best.y >= y - 1 ? best[metric] : null; };
  const rows = hover === null ? [] : data.series.map((s) => ({ s, v: at(s, hover) })).filter((x) => x.v !== null).sort((a, b) => (b.v as number) - (a.v as number));
  const fmt = (v: number) => metric === 'income' ? num(v, 1) : num(v, 0);
  const tipLeft = hover !== null && geo.x(hover) > W * 0.6;
  return <div class="hist-chart">
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={t(`x_hist_${metric}`)}>
      {geo.ticks.map((v) => <g><line x1={PAD.l} x2={W - PAD.r} y1={geo.yv(v)} y2={geo.yv(v)} class={v === 0 ? 'hc-zero' : 'hc-grid'} /><text x={PAD.l - 6} y={geo.yv(v) + 4} class="hc-lbl" text-anchor="end">{num(v, 0)}</text></g>)}
      {geo.years.map((y) => <text x={geo.x(y)} y={H - 6} class="hc-lbl" text-anchor="middle">{y}</text>)}
      {paths.map(({ s, d }) => <path d={d} fill="none" stroke={rgb(seriesColor(s))} stroke-width={s.player ? 3 : focus === s.id ? 2.6 : 1.8} stroke-linejoin="round" stroke-linecap="round" opacity={focus !== null && focus !== s.id && !s.player ? 0.35 : 1} class={s.player ? 'hc-me' : ''} />)}
      {hover !== null && <line x1={geo.x(hover)} x2={geo.x(hover)} y1={PAD.t} y2={H - PAD.b} class="hc-cross" />}
      {hover !== null && rows.map(({ s, v }) => <circle cx={geo.x(hover)} cy={geo.yv(v as number)} r={s.player ? 4 : 3} fill={rgb(seriesColor(s))} class="hc-dot" />)}
    </svg>
    {hover !== null && rows.length > 0 && <div class={`hc-tip ${tipLeft ? 'left' : ''}`} style={{ left: `${(geo.x(hover) / W) * 100}%` }}>
      <div class="bd-title">{hover} · {t(`x_hist_${metric}`)}</div>
      {rows.map(({ s, v }) => <div class={`bd-row ${s.player ? 'me' : ''}`}><span><span class="sw" style={{ background: rgb(seriesColor(s)) }} />{L(s.name)}</span><span>{fmt(v as number)}</span></div>)}
    </div>}
    <div class="hc-legend">{data.series.map((s) => { const last = [...s.points].reverse().find((p) => p[metric] !== null && p[metric] !== undefined); return <span class={`hc-key ${s.player ? 'me' : ''}`} onMouseEnter={() => setFocus(s.id)} onMouseLeave={() => setFocus(null)}>
      <span class="sw" style={{ background: rgb(seriesColor(s)) }} />{L(s.name)} <span class="muted">{last ? fmt(last[metric] as number) : '—'}</span></span>; })}</div>
  </div>;
}

/** The charts with a choice of metric (end screen, victory panel). */
export function HistoryCharts({ extra = [] }: { extra?: number[] }) {
  const [metric, setMetric] = useState<Metric>('dev');
  const [data] = useQuery<HData>({ q: 'history', nations: extra }, [extra.join(',')], 10_000);
  if (!data) return <Empty>{t('loading')}…</Empty>;
  if (!data.series.some((s) => s.points.length > 1)) return <Empty>{t('x_hist_empty')}</Empty>;
  return <div class="hist">
    <div class="seg wide hist-metrics">{METRICS.map((m) => <Tip content={<div><TipHead name={t(`x_hist_${m}`)} hint={t(`x_hist_${m}_hint`)} /></div>}><button class={metric === m ? 'on' : ''} onClick={() => setMetric(m)}>{t(`x_hist_${m}`)}</button></Tip>)}</div>
    <HistoryChart data={data} metric={metric} />
    <div class="muted small">{t('x_hist_hint')}</div>
  </div>;
}

// ---------------------------------------------------------------- chronicle export
/** Fetch the full chronicle (the client keeps only the latest entries). */
export async function fullChronicle(): Promise<ChronEntry[]> { return (await sim().query<ChronEntry[]>({ q: 'chronicle', from: 0 })) ?? []; }

/** Buttons that save the chronicle as Markdown (in the chosen language) or as JSON (both languages). */
export function ChronicleExport({ own = false, ending }: { own?: boolean; ending?: string }) {
  const [busy, setBusy] = useState(false);
  const run = async (kind: 'md' | 'json') => {
    if (busy) return; setBusy(true);
    try {
      const entries = await fullChronicle(); const v = view.value;
      const x: ChronExport = { entries, startYear: v?.startYear ?? 1356, endDay: v?.day ?? 0, lang: lang.value === 'de' ? 'de' : 'en', player: playerId.value, own, ending,
        nations: nations.value.map((n) => ({ id: n.id, name: n.name, short: n.short })) };
      downloadText(exportName(x, kind), kind === 'md' ? chronicleMarkdown(x) : chronicleJson(x), kind === 'md' ? 'text/markdown' : 'application/json');
      const n = own && x.player >= 0 ? entries.filter((e) => chronInvolves(e, x.player)).length : entries.length;
      showToast(t('x_chron_exported').replace('{n}', String(n)));
    } catch { showToast(t('x_chron_export_failed'), 'err'); } finally { setBusy(false); }
  };
  const tip = (k: 'md' | 'json') => <div><TipHead name={t(`x_chron_export_${k}`)} hint={t(`x_chron_export_${k}_hint`)} />{own && <div class="tip-hint">{t('x_chron_export_own')}</div>}</div>;
  return <span class="chron-export">
    <Btn disabled={busy} tip={tip('md')} onClick={() => run('md')}>⤓ Markdown</Btn>
    <Btn disabled={busy} tip={tip('json')} onClick={() => run('json')}>⤓ JSON</Btn>
  </span>;
}
