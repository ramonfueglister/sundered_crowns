// Shared building blocks for all panels: frames, bars, nation links, throttled queries, command helper.
import { useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { sim, view, nations } from '../../game/client';
import type { Query } from '../../game/protocol';
import type { Command, CmdResult, I18n } from '../../sim/types';
import { playerId, selectedLoc, selectedNation, selectedArmies, panel, showToast, realmDialog } from '../store';
import { t, L, lang, errText, reason } from '../i18n';
import { deName } from '../../sim/content/names_de';
import { Tip, Breakdown, hideTip } from '../Tip';
import { num, signed, pct, rgb } from '../format';
import { sfx, type Sfx } from '../audio';
import { rendererRef } from '../MapView';
import { Coa } from './coa';
import { effectDef, workingEffects } from '../../sim/effects';
import { CLASSES, CLASS_NAME } from '../../sim/defs';

// refusals that name a realm (decisions.ts) show its German name in the German UI

// ---------------------------------------------------------------- commands
type DistOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
export type Cmd = DistOmit<Command, 'n'>;
/** The last successful command the player issued (used by the tutorial). */
export const lastCmd = signal<{ cmd: Cmd; at: number } | null>(null);

/** Send a command for the player's realm; shows a toast on failure and plays a sound on success. */
export async function act(c: Cmd, ok: Sfx | null = 'click', okText?: string): Promise<CmdResult> {
  const r = await sim().cmd({ ...c, n: playerId.value } as Command);
  if (r.ok) { if (ok) sfx(ok); if (okText) showToast(okText); lastCmd.value = { cmd: c, at: Date.now() }; }
  else {
    sfx('error'); showToast(errText(r.msg ?? r.err ?? 'failed'), 'err');
    // the assembly refused a tax rise or a war: show its vote, with bribes and concessions (panels/realmdialogs.tsx)
    if (/^the assembly refused/i.test(r.err ?? '') && c.t !== 'assembly') realmDialog.value = { kind: 'assembly', cmd: c };
  }
  return r;
}

// ---------------------------------------------------------------- queries
/**
 * Query the simulation and refresh on view ticks, at most every `every` ms.
 * Returns [data, refresh]. A null query disables it.
 */
export function useQuery<T = any>(q: Query | null, deps: any[], every = 500): [T | null, () => void] {
  const [data, setData] = useState<T | null>(null);
  const seq = useRef(0);
  const last = useRef(0);
  const qRef = useRef(q); qRef.current = q;
  const run = useCallback(() => {
    const cur = qRef.current; if (!cur) return;
    const my = ++seq.current; last.current = performance.now();
    sim().query<T>(cur).then((d) => { if (my === seq.current) setData(d); });
  }, []);
  useEffect(() => {
    setData(null); if (!q) return;
    run();
    // throttled to one query per `every` ms; a tick inside the window schedules one trailing query, so the panel still
    // shows the last state when the game pauses right after it
    let trail: ReturnType<typeof setTimeout> | null = null;
    const unsub = view.subscribe(() => {
      const wait = every - (performance.now() - last.current);
      if (wait <= 0) { run(); return; }
      if (!trail) trail = setTimeout(() => { trail = null; run(); }, wait);
    });
    return () => { unsub(); if (trail) clearTimeout(trail); };
  }, deps);
  return [data, run];
}

/** One shared realm query for all components that need it (outliner, panels). */
export const realm = signal<any>(null);
let realmUsers = 0, realmLast = 0, realmUnsub: (() => void) | null = null, realmSeq = 0;
export function refreshRealm() {
  if (playerId.value < 0) { realm.value = null; return; }
  const my = ++realmSeq; realmLast = performance.now();
  sim().query({ q: 'realm' }).then((d) => { if (my === realmSeq) realm.value = d; });
}
export function useRealm(every = 1000): any {
  useEffect(() => {
    if (realmUsers++ === 0) {
      refreshRealm();
      realmUnsub = view.subscribe(() => { if (performance.now() - realmLast >= every) refreshRealm(); });
    } else if (performance.now() - realmLast > 300) refreshRealm();
    return () => { if (--realmUsers === 0) { realmUnsub?.(); realmUnsub = null; } };
  }, []);
  return realm.value;
}

/** Location names, fetched once from the simulation and cached. */
const nameCache = new Map<number, string>();
const nameWait = new Map<number, Promise<string>>();
export const namesVersion = signal(0);
/** A place or province name in the current language (German exonyms where they exist). */
export function placeName(en: string | null | undefined): string { return lang.value === 'de' ? deName(en) : en ?? ''; }
export function locName(id: number): string {
  if (id < 0) return '—';
  const g = rendererRef.assets?.geo;
  const c = nameCache.get(id); if (c) return placeName(c);
  if (g?.loc?.name?.[id]) { nameCache.set(id, g.loc.name[id]); return placeName(g.loc.name[id]); }
  if (!nameWait.has(id)) nameWait.set(id, sim().query({ q: 'loc', loc: id }).then((d: any) => { const nm = d?.name ?? `#${id}`; nameCache.set(id, nm); namesVersion.value++; return nm; }));
  return '…';
}
export function LocName({ id, fly = true }: { id: number; fly?: boolean }) {
  void namesVersion.value;
  return <a class="lk" onClick={(e) => { e.stopPropagation(); selectLoc(id, fly); }}>{locName(id)}</a>;
}

// ---------------------------------------------------------------- selection helpers
export function flyToLoc(loc: number, zoom = 3) {
  const g = rendererRef.assets?.geo; const r = rendererRef.r;
  if (g && r && loc >= 0) r.flyTo(g.loc.x[loc], g.loc.y[loc], zoom);
}
export function selectLoc(loc: number, fly = true) {
  sfx('click'); selectedArmies.value = []; selectedLoc.value = loc;
  const o = view.value?.owner?.[loc] ?? -1; selectedNation.value = o;
  if (panel.value !== 'none' && panel.value !== 'peace') panel.value = 'none';
  if (fly) flyToLoc(loc);
}
export function selectNation(id: number) {
  sfx('click'); selectedLoc.value = -1; selectedArmies.value = [];
  if (id === playerId.value) { panel.value = 'government'; return; }
  selectedNation.value = id; panel.value = 'none';
}
export function selectArmy(id: number, fly = true) {
  const a = view.value?.armies.find((x) => x.id === id); if (!a) return;
  sfx('click'); selectedArmies.value = [id]; selectedLoc.value = -1;
  if (fly) flyToLoc(a.loc, 3.5);
}

// ---------------------------------------------------------------- small components
export function Panel({ title, sub, children, onClose, cls = '', coa, actions }: { title: ComponentChildren; sub?: ComponentChildren; children: ComponentChildren; onClose?: () => void; cls?: string; coa?: ComponentChildren; actions?: ComponentChildren }) {
  // a tooltip opened inside the panel must not outlive it (mouseleave never fires on unmount)
  useEffect(() => () => hideTip(), []);
  return <div class={`pnl ${cls}`} onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
    <div class="pnl-head">
      {coa && <div class="pnl-coa">{coa}</div>}
      <div class="pnl-titles"><h2>{title}</h2>{sub && <div class="pnl-sub">{sub}</div>}</div>
      {actions}
      {onClose && <button class="pnl-x" title={t('close')} onClick={() => { sfx('close'); onClose(); }}>✕</button>}
    </div>
    <div class="pnl-body">{children}</div>
  </div>;
}

export function Section({ title, children, right, open: open0 = true, id }: { title: ComponentChildren; children: ComponentChildren; right?: ComponentChildren; open?: boolean; id?: string }) {
  const key = id ? `sc.sec.${id}` : '';
  const [open, setOpen] = useState(() => { if (!key) return open0; try { const v = localStorage.getItem(key); return v === null ? open0 : v === '1'; } catch { return open0; } });
  const toggle = () => { const v = !open; setOpen(v); if (key) try { localStorage.setItem(key, v ? '1' : '0'); } catch { /* ignore */ } };
  return <div class={`sec ${open ? '' : 'closed'}`}>
    <h3 onClick={toggle}><span class="caret">{open ? '▾' : '▸'}</span>{title}{right && <span class="sec-r" onClick={(e) => e.stopPropagation()}>{right}</span>}</h3>
    {open && <div class="sec-body">{children}</div>}
  </div>;
}

/** label … value row; value gets a tooltip when `tip` is given. */
export function Row({ k, v, tip, cls = '' }: { k: ComponentChildren; v: ComponentChildren; tip?: ComponentChildren | (() => ComponentChildren); cls?: string }) {
  return <div class={`kv ${cls}`}><span class="k">{k}</span>{tip ? <Tip content={tip}><span class="v has-tip">{v}</span></Tip> : <span class="v">{v}</span>}</div>;
}

export function Bar({ value, max = 1, min = 0, color, label, tip, h = 8, mid }: { value: number; max?: number; min?: number; color?: string; label?: ComponentChildren; tip?: ComponentChildren | (() => ComponentChildren); h?: number; mid?: boolean }) {
  const f = Math.max(0, Math.min(1, (value - min) / Math.max(1e-9, max - min)));
  const inner = mid
    ? <div class="bar mid" style={{ height: h }}><div class="bar-fill" style={{ left: `${Math.min(f, 0.5) * 100}%`, width: `${Math.abs(f - 0.5) * 100}%`, background: color }} /><div class="bar-mid" /></div>
    : <div class="bar" style={{ height: h }}><div class="bar-fill" style={{ width: `${f * 100}%`, background: color }} /></div>;
  const body = <div class="bar-wrap">{label && <div class="bar-label">{label}</div>}{inner}</div>;
  return tip ? <Tip content={tip} tag="div">{body}</Tip> : body;
}

/** Coat of arms + short name of a nation; click opens it. */
export function NLink({ id, size = 18, name = true, full = false }: { id: number; size?: number; name?: boolean; full?: boolean }) {
  const n = nations.value[id];
  if (!n) return <span class="muted">—</span>;
  return <a class="nlink" onClick={(e) => { e.stopPropagation(); selectNation(id); }} title={L(n.name)}>
    <Coa coa={n.coa} color={n.color} size={size} />{name && <span>{L(full ? n.name : n.short)}</span>}
  </a>;
}
export function NList({ ids, size = 18, empty }: { ids: number[]; size?: number; empty?: string }) {
  if (!ids.length) return <span class="muted">{empty ?? t('none')}</span>;
  return <span class="nlist">{ids.map((i) => <NLink id={i} size={size} />)}</span>;
}

export function Btn({ children, onClick, disabled, tip, cls = '', small = true }: { children: ComponentChildren; onClick?: () => void; disabled?: boolean | string | null; tip?: ComponentChildren | (() => ComponentChildren); cls?: string; small?: boolean }) {
  const b = <button class={`btn ${small ? 'small' : ''} ${cls}`} disabled={!!disabled} onClick={(e) => { e.stopPropagation(); onClick?.(); }}>{children}</button>;
  const tipC = typeof disabled === 'string' && disabled ? <div><div>{tip && (typeof tip === 'function' ? (tip as any)() : tip)}</div><div class="neg">{errText(disabled)}</div></div> : tip;
  return tipC ? <Tip content={tipC} tag="span" class="btn-tip">{b}</Tip> : b;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, ComponentChildren][]; value: T; onChange: (v: T) => void }) {
  return <div class="tabs">{tabs.map(([k, lbl]) => <button class={value === k ? 'on' : ''} onClick={() => { sfx('page'); onChange(k); }}>{lbl}</button>)}</div>;
}

export function Empty({ children }: { children: ComponentChildren }) { return <div class="empty">{children}</div>; }

// ---------------------------------------------------------------- effects & reasons
export function fxLabel(k: string): string {
  if (k.startsWith('exempt_')) { const c = CLASSES[Number(k.slice(7))]; return `${t('fx_exempt')}: ${c ? L(CLASS_NAME[c]) : k}`; }
  const v = t(`fx_${k}`);
  return v === `fx_${k}` ? k.replace(/^values\./, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : v;
}
/** An effect as the simulation applies it (src/sim/effects.ts): v is the raw value of the content, shown at its real
 *  size in its unit (percent, percentage points, points per month, a count, on/off, kilometres). */
export function fxValue(k: string, v: number): string {
  const d = effectDef(k);
  if (!d) return signed(v, Math.abs(v) < 1 ? 2 : 0);
  const x = v * (d.scale ?? 1), dg = (a: number) => (Math.abs(a) < 0.1 ? 2 : Math.abs(a) < 10 ? 1 : 0);
  let s: string;
  switch (d.unit) {
    case 'pct': case 'share': s = signed(x * 100, dg(x * 100)) + ' %'; break;
    case 'pp': s = signed(x * 100, dg(x * 100)) + ' ' + t('unit_pp'); break;
    case 'count': s = signed(x, 0); break;
    case 'flag': s = x > 0 ? t('fx_on') : t('fx_off'); break;
    case 'km': s = signed(x, 0) + ' km'; break;
    default: s = signed(x, dg(x));
  }
  return d.per ? `${s} ${t(d.per === 'month' ? 'unit_per_month' : 'unit_per_year')}` : s;
}
/** Only the effects the simulation reads, each at its real size; green when it helps the realm. */
export function Effects({ fx, title }: { fx: Record<string, number> | null | undefined; title?: ComponentChildren }) {
  const e = workingEffects(fx);
  if (!e.length) return title ? <div><div class="bd-title">{title}</div><div class="muted">{t('no_effects')}</div></div> : null;
  return <div class="fx">
    {title && <div class="bd-title">{title}</div>}
    {e.map(([k, x, d]) => { const good = d.unit === 'flag' ? true : d.bad ? x < 0 : x > 0; return <div class="bd-row"><span>{fxLabel(k)}</span><span class={good ? 'pos' : 'neg'}>{fxValue(k, fx![k])}</span></div>; })}
  </div>;
}

/** Reasons breakdown with a translated label for each key. */
export function Reasons({ rows, title, total }: { rows: [string, number][]; title?: string; total?: number }) {
  return <Breakdown title={title} rows={rows.map(([k, v]) => [reasonLabel(k), v])} total={total ?? rows.reduce((p, x) => p + x[1], 0)} digits={0} />;
}
export function reasonLabel(k: string): string {
  const v = t(`r_${k}`); if (v !== `r_${k}`) return v;
  const tr = t(k); if (tr !== k) return tr;
  return reason(k);
}

// ---------------------------------------------------------------- misc helpers
export const pid = () => playerId.value;
export function i18n(x: I18n | string | undefined | null) { return L(x); }
export function daysText(d: number) {
  if (d >= 60) return `${num(d / 30, d >= 300 ? 0 : 1)} ${t('months')}`;
  return `${Math.max(0, Math.round(d))} ${t('days')}`;
}
export function dateOf(day: number) {
  const v = view.value; if (!v) return '';
  return fmtDateShort(day, v.startYear);
}
import { dayToDate, MONTHS_EN, MONTHS_DE } from '../../sim/calendar';
/** German short month names as German writes them: short names in full, the others cut with a full stop. */
const MONTHS_DE_SHORT = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];
export function fmtDateShort(day: number, startYear: number) {
  const d = dayToDate(day, startYear);
  return lang.value === 'de' ? `${d.d}. ${MONTHS_DE_SHORT[d.m]} ${d.y}` : `${d.d} ${MONTHS_EN[d.m].slice(0, 3)} ${d.y}`;
}
export function Swatch({ c }: { c: number[] }) { return <span class="sw" style={{ background: rgb(c) }} />; }
export { num, signed, pct, rgb, Tip, Breakdown, t, L, lang, Coa };

/** Tiny SVG line chart. */
export function Spark({ data, w = 80, h = 20, color = '#7a4e1c', base }: { data: number[]; w?: number; h?: number; color?: string; base?: number }) {
  const d = data.filter((x) => isFinite(x));
  if (d.length < 2) return <svg class="spark" width={w} height={h} />;
  let lo = Math.min(...d), hi = Math.max(...d);
  if (base !== undefined) { lo = Math.min(lo, base); hi = Math.max(hi, base); }
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const x = (i: number) => (i / (d.length - 1)) * (w - 2) + 1, y = (v: number) => h - 1 - ((v - lo) / (hi - lo)) * (h - 2);
  const pts = d.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return <svg class="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
    {base !== undefined && <line x1={0} x2={w} y1={y(base)} y2={y(base)} stroke="#a08960" stroke-dasharray="2 2" stroke-width={0.8} />}
    <polyline points={pts} fill="none" stroke={color} stroke-width={1.3} stroke-linejoin="round" />
  </svg>;
}

export function Slider({ value, min, max, step = 0.01, onCommit, fmt, disabled }: { value: number; min: number; max: number; step?: number; onCommit: (v: number) => void; fmt?: (v: number) => string; disabled?: boolean }) {
  const [v, setV] = useState(value);
  const dragging = useRef(false);
  useEffect(() => { if (!dragging.current) setV(value); }, [value]);
  return <span class="slider">
    <input type="range" min={min} max={max} step={step} value={v} disabled={disabled}
      onPointerDown={() => { dragging.current = true; }}
      onInput={(e) => setV(Number((e.target as HTMLInputElement).value))}
      onChange={(e) => { dragging.current = false; const x = Number((e.target as HTMLInputElement).value); setV(x); onCommit(x); }} />
    <span class="slider-v">{fmt ? fmt(v) : num(v, 2)}</span>
  </span>;
}
