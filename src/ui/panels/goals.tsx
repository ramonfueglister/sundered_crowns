// The realm's goals: the whole goal tree with live progress per condition (Goals & decisions), and the tracker under the
// outliner with up to three pinned goals. The data comes from src/game/view.ts goalsView (conditions evaluated by the
// simulation's own tests in src/sim/content/goals.ts); claiming a ready goal is the 'goal' command.
import './direction.css';
import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { nations } from '../../game/client';
import { playerId, openPanel, panelArg, showToast } from '../store';
import { Section, Bar, NLink, Btn, act, t, L, num, pct, Tip, realm, useRealm, selectLoc, placeName, refreshRealm } from './common';
import { TipHead } from './explain';
import { sfx } from '../audio';

export interface GoalV {
  id: string; name: { en: string; de: string }; flav: { en: string; de: string } | null; req: string[]; done: boolean; inherited?: boolean; open: boolean; ready: boolean;
  conds: { t: { en: string; de: string }; ok: boolean; cur?: number; max?: number; places?: { name: string; loc: number; owner: number }[] }[];
  rews: { en: string; de: string }[]; unlocks: string[]; depth: number; progress: number;
}

// ---------------------------------------------------------------- pins (per realm, kept in this browser)
const MAX_PINS = 3;
export const pins = signal<string[]>([]);
let pinKey = '';
function loadPins(key: string) {
  if (key === pinKey) return; pinKey = key;
  try { const v = JSON.parse(localStorage.getItem(`sc.pins.${key}`) || '[]'); pins.value = Array.isArray(v) ? v.slice(0, MAX_PINS) : []; } catch { pins.value = []; }
}
function savePins(v: string[]) { pins.value = v; try { localStorage.setItem(`sc.pins.${pinKey}`, JSON.stringify(v)); } catch { /* ignore */ } }
export function togglePin(id: string) {
  const cur = pins.value;
  if (cur.includes(id)) { savePins(cur.filter((x) => x !== id)); sfx('click'); return; }
  if (cur.length >= MAX_PINS) { showToast(t('x_pin_full'), 'err'); return; }
  savePins([...cur, id]); sfx('click');
}
function usePins() { const me = nations.value[playerId.value]; if (me) loadPins(me.key); return pins.value; }

/** Claim a goal whose conditions hold now (otherwise the next review grants it). */
export function claim(g: GoalV) { act({ t: 'goal', id: g.id }, 'bell', `${t('x_goal_claimed')}: ${L(g.name)}`).then(() => refreshRealm()); }

// ---------------------------------------------------------------- pieces
const fmtCount = (v: number | undefined) => (v === undefined ? '' : Math.abs(v) >= 100 ? num(v) : num(v, Number.isInteger(v) ? 0 : 1));
/** One condition: met or not, its text, and a progress bar for counted conditions; places are listed with their holders. */
function Cond({ c, compact = false }: { c: GoalV['conds'][number]; compact?: boolean }) {
  const pid = playerId.value;
  const tip = () => <div>
    <TipHead name={L(c.t)} value={c.max !== undefined ? `${fmtCount(c.cur)} / ${fmtCount(c.max)}` : c.ok ? '✔' : '✘'} hint={t('x_goal_conds_hint')} />
    <div class="breakdown">
      {c.max !== undefined && <><div class="bd-row"><span>{t('x_cond_now')}</span><span>{fmtCount(c.cur)}</span></div><div class="bd-row"><span>{t('x_cond_need')}</span><span>{fmtCount(c.max)}</span></div>
        <div class="bd-row bd-total"><span>{t('x_cond_progress')}</span><span>{pct(Math.max(0, Math.min(1, (c.cur ?? 0) / Math.max(1e-9, c.max))))}</span></div></>}
      {c.places?.map((p) => <div class="bd-row"><span>{placeName(p.name)}</span><span class={p.owner === pid ? 'pos' : 'neg'}>{p.owner === pid ? t('x_held_ours') : p.owner >= 0 ? L(nations.value[p.owner]?.short) : t('x_unowned')}</span></div>)}
    </div>
  </div>;
  return <li class={`gcond ${c.ok ? 'ok' : ''}`}>
    <Tip content={tip} tag="div" class="gcond-h"><span class="gcond-ic">{c.ok ? '✔' : '○'}</span><span class="gcond-t">{L(c.t)}</span>
      {c.max !== undefined && <span class="gcond-n">{fmtCount(c.cur)} / {fmtCount(c.max)}</span>}</Tip>
    {c.max !== undefined && !c.ok && <Bar value={c.cur ?? 0} max={c.max} h={4} color="#b8913f" />}
    {!compact && c.places && c.places.length > 1 && <div class="gplaces">{c.places.map((p) => <a class={`gplace ${p.owner === pid ? 'held' : ''}`} onClick={() => p.loc >= 0 && selectLoc(p.loc)}>
      {p.owner >= 0 && p.owner !== pid && <NLink id={p.owner} size={11} name={false} />}{placeName(p.name)}</a>)}</div>}
  </li>;
}
/** Overall progress with what makes it up (each condition's part). */
function ProgressTip({ g }: { g: GoalV }) {
  return <div><TipHead name={L(g.name)} value={pct(g.progress)} hint={t('x_goal_progress_hint')} />
    <div class="breakdown">{g.conds.map((c) => <div class="bd-row"><span>{L(c.t)}</span><span class={c.ok ? 'pos' : ''}>{c.ok ? '✔' : c.max ? pct(Math.max(0, Math.min(1, (c.cur ?? 0) / c.max))) : '✘'}</span></div>)}
      <div class="bd-row bd-total"><span>Σ / {g.conds.length}</span><span>{pct(g.progress)}</span></div></div></div>;
}

function stateOf(g: GoalV): 'done' | 'ready' | 'open' | 'later' { return g.done ? 'done' : g.ready ? 'ready' : g.open ? 'open' : 'later'; }
const STATE_KEY = { done: 'x_goal_done', ready: 'x_goal_ready', open: 'x_goal_open', later: 'x_goal_locked' } as const;

function GoalCard({ g, all, hl, setHl, pinned }: { g: GoalV; all: Map<string, GoalV>; hl: string | null; setHl: (x: string | null) => void; pinned: boolean }) {
  const st = stateOf(g); const name = (id: string) => (all.get(id) ? L(all.get(id)!.name) : id);
  const h = hl ? all.get(hl) : null;
  const rel = !h ? '' : hl === g.id ? 'hl' : h.req.includes(g.id) ? 'hl-req' : h.unlocks.includes(g.id) ? 'hl-next' : 'dim';
  return <div id={`goal-${g.id}`} class={`goal-card ${st} ${rel}`} onMouseEnter={() => setHl(g.id)} onMouseLeave={() => setHl(null)}>
    <div class="gc-h"><b>{L(g.name)}</b>
      <span class="gc-right">
        {g.inherited ? <Tip content={<div><TipHead name={t('x_goal_inherited')} hint={t('x_goal_inherited_hint')} /></div>}><span class="gc-tag done muted">✔ {t('x_goal_inherited')}</span></Tip>
          : <Tip content={<div><TipHead name={t(STATE_KEY[st])} hint={t(`${STATE_KEY[st]}_hint`)} /></div>}><span class={`gc-tag ${st}`}>{st === 'done' ? '✔ ' : st === 'ready' ? '★ ' : ''}{t(STATE_KEY[st])}</span></Tip>}
        {!g.done && <Tip content={t(pinned ? 'x_unpin' : 'x_pin')}><button class={`pin ${pinned ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); togglePin(g.id); }}>📌</button></Tip>}
      </span></div>
    {!g.done && <Tip tag="div" content={() => <ProgressTip g={g} />}><Bar value={g.progress} h={5} color={g.ready ? '#4d8a3a' : '#b8913f'} /></Tip>}
    {g.flav && !g.done && <div class="gc-flav">{L(g.flav)}</div>}
    {!g.done && <ul class="gc-conds">{g.conds.map((c) => <Cond c={c} />)}</ul>}
    <Tip tag="div" content={<div><TipHead name={t('x_reward')} hint={t('x_reward_hint')} /></div>}><div class="gc-rew"><span class="muted">{t('x_reward')}:</span> {g.rews.map(L).join(', ')}</div></Tip>
    {g.req.length > 0 && !g.done && <div class="gc-link muted small">{t('x_goal_needs')}: {g.req.map((r) => <span class={all.get(r)?.done ? 'pos' : ''}>{all.get(r)?.done ? '✔ ' : ''}{name(r)}</span>).reduce((p: any[], x, i) => (i ? [...p, ', ', x] : [x]), [])}</div>}
    {g.unlocks.length > 0 && <div class="gc-link small">→ {t('x_goal_unlocks')}: {g.unlocks.map(name).join(', ')}</div>}
    {g.ready && <div class="act-row"><span class="muted small">{t('x_goal_ready_hint')}</span><span class="spacer" /><Btn cls="gold" onClick={() => claim(g)}>{t('x_goal_claim')}</Btn></div>}
  </div>;
}

/** All goals of the realm as a tree: one row of cards per step, each card naming what it needs and what it unlocks. */
export function GoalTree({ goals }: { goals: GoalV[] }) {
  const p = usePins();
  const [hl, setHl] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const all = new Map(goals.map((g) => [g.id, g]));
  // jump to a goal named by the tracker
  const arg = panelArg.value as { goal?: string } | null;
  useEffect(() => { if (!arg?.goal) return; const el = document.getElementById(`goal-${arg.goal}`); if (el) { el.scrollIntoView({ block: 'center' }); setHl(arg.goal); } }, [arg?.goal, goals.length]);
  if (!goals.length) return null;
  const done = goals.filter((g) => g.done).length, ready = goals.filter((g) => g.ready).length;
  const tiers: GoalV[][] = [];
  for (const g of goals) { if (g.done && !showDone) continue; (tiers[g.depth] ||= []).push(g); }
  const order = { ready: 0, open: 1, later: 2, done: 3 } as const;
  return <Section id="dec-goal-tree" title={<>{t('x_ambitions')} <Tip content={<div><TipHead name={t('x_ambitions')} value={`${done} / ${goals.length}`} hint={t('x_ambitions_hint')} /><div class="breakdown">
      <div class="bd-row"><span>{t('x_goal_done')}</span><span>{done}</span></div><div class="bd-row"><span>{t('x_goal_ready')}</span><span>{ready}</span></div>
      <div class="bd-row"><span>{t('x_goal_open')}</span><span>{goals.filter((g) => g.open && !g.ready).length}</span></div><div class="bd-row"><span>{t('x_goal_locked')}</span><span>{goals.filter((g) => !g.open && !g.done).length}</span></div></div></div>}><small>({done} / {goals.length})</small></Tip></>}
    right={<label class="small"><input type="checkbox" checked={showDone} onChange={() => setShowDone(!showDone)} /> {t('x_goals_show_done')}</label>}>
    <div class="goal-prog"><Bar value={done} max={goals.length} color="#b8913f" /></div>
    <div class="muted small">{t('x_goal_tree_hint')}</div>
    {tiers.map((row, d) => row && row.length ? <div class="goal-tier">
      <div class="gt-h">{t('x_goal_tier')} {d + 1}</div>
      <div class="gt-row">{row.slice().sort((a, b) => order[stateOf(a)] - order[stateOf(b)] || b.progress - a.progress).map((g) => <GoalCard g={g} all={all} hl={hl} setHl={setHl} pinned={p.includes(g.id)} />)}</div>
    </div> : null)}
  </Section>;
}

// ---------------------------------------------------------------- the tracker under the outliner
/** Up to three pinned goals (or, without pins, the open goals nearest to completion) with their next condition. */
export function GoalTracker() {
  const r = useRealm(1200);
  const p = usePins();
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('sc.tracker') !== '0'; } catch { return true; } });
  const goals: GoalV[] = r?.goals ?? [];
  useGoalHints(goals);
  if (playerId.value < 0 || !goals.length) return null;
  const byId = new Map(goals.map((g) => [g.id, g]));
  const pinned = p.map((id) => byId.get(id)).filter((g): g is GoalV => !!g && !g.done);
  const suggested = pinned.length ? [] : goals.filter((g) => g.open).sort((a, b) => Number(b.ready) - Number(a.ready) || b.progress - a.progress).slice(0, 3);
  const list = pinned.length ? pinned : suggested;
  const toggle = () => { const x = !open; setOpen(x); sfx('click'); try { localStorage.setItem('sc.tracker', x ? '1' : '0'); } catch { /* ignore */ } };
  return <div class={`goal-tracker ${open ? '' : 'shut'}`} onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
    <div class="ol-head" onClick={toggle}>
      <Tip content={<div><TipHead name={t('x_tracker')} value={`${goals.filter((g) => g.done).length} / ${goals.length}`} hint={t('x_tracker_hint')} /></div>}><span>{t('x_tracker')} {pinned.length ? `· ${pinned.length}/${MAX_PINS}` : ''}</span></Tip>
      <span>{open ? '▾' : '◂'}</span></div>
    {open && <div class="gt-body">
      {!pinned.length && <div class="muted small gt-sub">{t('x_tracker_suggested')}</div>}
      {list.map((g) => { const next = g.conds.find((c) => !c.ok);
        return <div class={`gt-item ${g.ready ? 'ready' : ''}`}>
          <div class="gt-top"><a class="gt-name" onClick={() => { sfx('open'); openPanel('decisions', { goal: g.id }); }}>{g.ready ? '★ ' : ''}{L(g.name)}</a>
            {pinned.length > 0 && <button class="gt-x" title={t('x_unpin')} onClick={() => togglePin(g.id)}>✕</button>}</div>
          <Tip tag="div" content={() => <ProgressTip g={g} />}><span class="ol-bar wide gt-bar"><i style={{ width: `${Math.round(g.progress * 100)}%`, background: g.ready ? '#8fd07a' : '#e2c376' }} /></span></Tip>
          {g.ready ? <div class="gt-next"><span class="pos">{t('x_goal_ready')}</span> <button class="gt-claim" onClick={() => claim(g)}>{t('x_goal_claim')}</button></div>
            : next && <Tip tag="div" content={<div><TipHead name={L(next.t)} value={next.max !== undefined ? `${fmtCount(next.cur)} / ${fmtCount(next.max)}` : '✘'} hint={t('x_goal_conds_hint')} /></div>}>
              <div class="gt-next">○ {L(next.t)}{next.max !== undefined && <b> {fmtCount(next.cur)}/{fmtCount(next.max)}</b>}</div></Tip>}
        </div>; })}
      {!list.length && <div class="muted small">{t('x_no_open_goals')}</div>}
    </div>}
  </div>;
}

/** A toast when a goal becomes achievable (every condition holds) and when a pinned goal is achieved; achieved pins are released. */
function useGoalHints(goals: GoalV[]) {
  const seen = useRef<{ key: string; ready: Set<string>; done: Set<string> } | null>(null);
  useEffect(() => {
    const me = nations.value[playerId.value]; if (!me || !goals.length) return;
    const ready = new Set(goals.filter((g) => g.ready).map((g) => g.id)), done = new Set(goals.filter((g) => g.done).map((g) => g.id));
    const prev = seen.current;
    if (prev && prev.key === me.key) {
      const fresh = goals.filter((g) => g.ready && !prev.ready.has(g.id));
      if (fresh.length) { sfx('bell'); showToast(`${t('x_goal_now_ready')}: ${fresh.map((g) => L(g.name)).join(', ')}`); }
      const got = goals.filter((g) => g.done && !prev.done.has(g.id) && pins.value.includes(g.id));
      if (got.length) {
        const next = got.flatMap((g) => g.unlocks).map((id) => goals.find((x) => x.id === id)).filter((x): x is GoalV => !!x && !x.done);
        showToast(`${t('x_goal_claimed')}: ${got.map((g) => L(g.name)).join(', ')}${next.length ? ` · ${t('x_goal_unlocks')}: ${next.map((g) => L(g.name)).join(', ')}` : ''}`);
        savePins(pins.value.filter((id) => !done.has(id)));
      }
    }
    seen.current = { key: me.key, ready, done };
  }, [goals]);
}
void realm;
