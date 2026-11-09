// Peace negotiation: pick the enemy, compose terms, see the live evaluation, send or concede; answer offers.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { sim, view, nations } from '../../game/client';
import { playerId, panelArg, openPanel } from '../store';
import type { PeaceTerm } from '../../sim/types';
import { Section, Btn, Empty, NLink, NList, Reasons, act, t, L, num, signed, pct, Tip, locName, namesVersion, flyToLoc, useQuery, placeName } from './common';
import { WarCard, WarScoreTip } from './realmtabs';
import { TipHead } from './explain';
import { BattleList } from './war';

export function termText(x: PeaceTerm): string {
  switch (x.type) {
    case 'cede': return `${t('term_cede')}: ${(x.locs || []).map(locName).join(', ')}`;
    case 'release': return `${t('term_release')}: ${(x.locs || []).map(locName).join(', ')}`;
    case 'gold': return `${t('term_gold')}: ${num(x.amount || 0)}`;
    case 'convert': return `${t('term_convert')}: ${(x.locs || []).map(locName).join(', ')}`;
    case 'throne': return t(x.mode === 'claimant' ? 'term_throne_claimant' : 'term_throne_union');
    default: return t(`term_${x.type}`);
  }
}

/** Terms without towns that a war's goal may allow (systems/war.ts GOAL_TERMS); throne and towns are chosen apart. */
const FLAG_TERMS = ['vassal', 'faith', 'independence', 'humiliate', 'break_alliance', 'reparations', 'end_rivalry', 'trade_rights', 'end_embargo', 'tariff_cut', 'expel_merchants'];

/** What each term weighs: the price in war score (systems/war.ts termCost). */
function TermCosts({ terms, costs, total, title, hint }: { terms: PeaceTerm[]; costs?: number[]; total: number; title: string; hint: string }) {
  return <div><TipHead name={title} value={num(total)} hint={hint} />
    <div class="breakdown">{terms.map((x, i) => <div class="bd-row"><span>{termText(x)}</span><span>{num(costs?.[i] ?? 0)}</span></div>)}
      {!terms.length && <div class="bd-row muted"><span>{t('no_terms')}</span><span /></div>}
      <div class="bd-row bd-total"><span>Σ</span><span>{num(total)}</span></div></div>
    <div class="muted small">{t('x_term_costs')}</div>
  </div>;
}

/**
 * The places to demand or give, grouped by province (largest first): a province's box takes or drops all of its
 * places listed here, its name opens the list. Small lists stay open.
 */
function LocPicks({ cands, sel, owner, onChange }: { cands: number[]; sel: number[]; owner?: ArrayLike<number>; onChange: (s: number[]) => void }) {
  const key = cands.join(',');
  const [pl] = useQuery<any>({ q: 'places', locs: cands }, [key], 600000);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const groups = useMemo(() => {
    const prov = new Map<number, number>((pl?.rows ?? []).map((r: number[]) => [r[0], r[1]]));
    const m = new Map<number, number[]>();
    for (const l of cands) { const p = prov.get(l) ?? -1; if (!m.has(p)) m.set(p, []); m.get(p)!.push(l); }
    return [...m].sort((a, b) => b[1].length - a[1].length || a[0] - b[0]);
  }, [pl, key]);
  const set = new Set(sel);
  const few = cands.length <= 40;
  const flip = (p: number) => { const o = new Set(open); if (o.has(p)) o.delete(p); else o.add(p); setOpen(o); };
  const all = (ls: number[], on: boolean) => onChange(on ? [...new Set([...sel, ...ls])] : sel.filter((x) => !ls.includes(x)));
  return <>
    <div class="act-row small lp-all"><a class="lk" onClick={() => onChange([...cands])}>{t('x_pc_all')}</a><a class="lk" onClick={() => onChange([])}>{t('x_pc_none')}</a>
      <Tip content={<div><TipHead name={t('x_pc_groups')} value={`${sel.length} / ${cands.length}`} hint={t('x_pc_groups_hint')} /></div>}><span class="muted has-tip">{sel.length} / {cands.length}</span></Tip></div>
    <div class="loc-picks">{groups.map(([p, ls]) => {
      const k = ls.filter((l) => set.has(l)).length; const shown = few || open.has(p);
      return <div class="lp-group">
        <div class={`lp lp-prov ${k ? 'on' : ''}`}>
          <input type="checkbox" checked={k === ls.length} ref={(el) => { if (el) el.indeterminate = k > 0 && k < ls.length; }} onChange={() => all(ls, k < ls.length)} />
          <span onClick={() => flip(p)}>{few ? '' : shown ? '▾ ' : '▸ '}{p >= 0 && pl ? placeName(pl.provs[p]) : pl ? t('x_pc_other') : `${t('loading')}…`}</span>
          <span class="muted small">{k}/{ls.length}</span>
        </div>
        {shown && ls.map((l) => <label class={`lp lp-loc ${set.has(l) ? 'on' : ''}`}><input type="checkbox" checked={set.has(l)} onChange={() => onChange(set.has(l) ? sel.filter((x) => x !== l) : [...sel, l])} /><span onDblClick={() => flyToLoc(l)}>{locName(l)}</span><NLink id={owner?.[l] ?? -1} size={12} name={false} /></label>)}
      </div>;
    })}</div>
  </>;
}

export function PeaceTab() {
  const v = view.value; const pid = playerId.value;
  const warId = panelArg.value?.war;
  const w = v?.wars.find((x) => x.id === warId);
  const mine = (v?.wars ?? []).filter((x) => x.att.includes(pid) || x.def.includes(pid));
  if (!w) return <div>{mine.length ? <><div class="muted">{t('choose_war')}</div>{mine.map((x) => <div class="act-row"><a class="lk" onClick={() => openPanel('peace', { war: x.id })}>{L(x.name)}</a></div>)}</> : <Empty>{t('no_war')}</Empty>}</div>;
  return <>
    {mine.length > 1 && <div class="seg war-pick">{mine.map((x) => <button class={x.id === w.id ? 'on' : ''} onClick={() => openPanel('peace', { war: x.id })}>{L(x.name)}</button>)}</div>}
    <PeaceInner key={w.id} w={w} />
  </>;
}

function PeaceInner({ w }: { w: any }) {
  const v = view.value!; const pid = playerId.value;
  void namesVersion.value;
  const ourSide: number[] = w.att.includes(pid) ? w.att : w.def;
  const theirSide: number[] = w.att.includes(pid) ? w.def : w.att;
  const lead = pid === w.attLead || pid === w.defLead;
  const enemyLead = w.att.includes(pid) ? w.defLead : w.attLead;
  const enemies = lead ? theirSide : [enemyLead];
  const [to, setTo] = useState(enemyLead);
  const [concede, setConcede] = useState(false);
  const [sel, setSel] = useState<number[]>([]);
  const [release, setRelease] = useState(false);
  const [gold, setGold] = useState(0);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [white, setWhite] = useState(false);
  const [ev, setEv] = useState<any>(null);
  const [convert, setConvert] = useState(false);
  const [throne, setThrone] = useState<'' | 'union' | 'claimant'>('');
  const seq = useRef(0);
  // what this war's goal lets our side demand, the occupied towns that fit it, and its battles (src/game/warview.ts warView)
  const [wv] = useQuery<any>({ q: 'war', war: w.id }, [w.id], 2500);
  const allowed = new Set<string>(wv?.allowed ?? []);
  const fits = useMemo(() => new Set<number>(wv?.fits ?? []), [wv?.fits?.join(',')]);
  const takeLand = concede || !wv || ['cede', 'release', 'convert'].some((k) => allowed.has(k));
  // candidate locations: for demands, the enemy side's land we occupy; for concessions, our land they occupy
  const cands = useMemo(() => {
    const o = v.owner, c = v.ctrl; if (!o || !c) return [] as number[];
    const owners = new Set(concede ? ourSide : theirSide);
    const holders = new Set(concede ? theirSide : ourSide);
    const out: number[] = []; for (let i = 0; i < o.length; i++) if (owners.has(o[i]) && holders.has(c[i]) && (concede || !wv || fits.has(i))) out.push(i);
    return out;
  }, [v.day, concede, to, fits]);
  useEffect(() => { setSel((s) => s.filter((x) => cands.includes(x))); }, [cands.join(',')]);
  const terms: PeaceTerm[] = useMemo(() => {
    if (white) return [{ type: 'white_peace' }];
    const out: PeaceTerm[] = [];
    if (sel.length && takeLand) out.push(convert && !concede ? { type: 'convert', locs: sel } : release && !concede ? { type: 'release', locs: sel } : { type: 'cede', locs: sel, to: concede ? to : pid });
    if (gold > 0) out.push({ type: 'gold', amount: gold });
    for (const k of FLAG_TERMS) if (flags[k]) out.push({ type: k as any });
    if (throne && !concede) out.push({ type: 'throne', mode: throne });
    return out;
  }, [white, sel.join(','), release, convert, throne, gold, flags, concede, to, takeLand]);
  const key = JSON.stringify([to, concede, terms]);
  useEffect(() => {
    let alive = true; const my = ++seq.current;
    const run = () => sim().query<any>({ q: 'peace', war: w.id, to, terms, concede }).then((r) => { if (alive && my === seq.current) setEv(r); });
    run(); const h = setInterval(run, 1500);
    return () => { alive = false; clearInterval(h); };
  }, [key]);
  const send = () => act({ t: 'peace', war: w.id, to, terms, concede }, 'peace', t('peace_sent')).then((r) => { if (r.ok) openPanel('none'); });
  const offers = w.offers.filter((o: any) => o.to === pid);
  const toggle = (k: string) => { setWhite(false); setFlags({ ...flags, [k]: !flags[k] }); };
  const golds = [0, 25, 50, 100, 200, 400, 800, 1500];
  return <div class="tab-peace">
    <WarCard w={w} inPeace />
    {wv && <div class="xw-goal small"><Tip content={<div><TipHead name={t(`goal_${wv.goal}`)} hint={t(`goalhint_${wv.goal}`)} /><div class="muted small">{t('xw_terms_allowed')}: {wv.allowed.filter((x: string) => x !== 'concession').map((x: string) => t(`term_${x}`)).join(', ')}</div></div>}>
      <span class="has-tip"><span class="k">{t('war_goal')}:</span> <b>{t(`goal_${wv.goal}`)}</b></span></Tip>{wv.cb && <span class="muted"> · {t('casus_belli')}: {t(`cb_${wv.cb}`)}</span>}
      {wv.goalLocs.length > 0 && <span class="muted"> · {t('xw_fought_for')}: {wv.goalLocs.slice(0, 6).map(locName).join(', ')}{wv.goalLocs.length > 6 ? ` +${wv.goalLocs.length - 6}` : ''}</span>}</div>}
    {offers.length > 0 && <Section title={t('incoming_offers')} id="pc-offers">
      {offers.map((o: any) => <div class="offer">
        <div><NLink id={o.from} /> {o.concede ? t('offers_concession') : t('demands')}:</div>
        <ul>{o.terms.length ? o.terms.map((x: PeaceTerm) => <li>{termText(x)}</li>) : <li>{t('term_white_peace')}</li>}</ul>
        <div class="act-row"><span class="spacer" /><Btn onClick={() => act({ t: 'peace_answer', war: w.id, offer: o.idx, accept: false }, 'click')}>{t('decline')}</Btn><Btn cls="gold" onClick={() => act({ t: 'peace_answer', war: w.id, offer: o.idx, accept: true }, 'peace', t('peace_made'))}>{t('accept')}</Btn></div>
      </div>)}
    </Section>}
    <Section title={t('negotiate')} id="pc-neg">
      <div class="act-row">
        <span class="k">{t('negotiate_with')}</span>
        {enemies.map((e) => <button class={`chip-btn ${to === e ? 'on' : ''}`} onClick={() => setTo(e)}><NLink id={e} size={16} /></button>)}
        {!lead && <span class="muted small">{t('not_leader_hint')}</span>}
      </div>
      <div class="seg wide"><button class={!concede ? 'on' : ''} onClick={() => { setConcede(false); setSel([]); }}>{t('we_demand')}</button><button class={concede ? 'on' : ''} onClick={() => { setConcede(true); setSel([]); setFlags({}); }}>{t('we_concede')}</button></div>
      <div class="terms">
        <div class="term-block">
          <div class="sub-h">{concede ? t('give_locations') : t('take_locations')} <Tip content={<div><TipHead name={concede ? t('give_locations') : t('take_locations')} value={cands.length} hint={concede ? t('x_cands_concede_hint') : t('x_cands_demand_hint')} /></div>}><span class="muted small">({cands.length})</span></Tip></div>
          {!takeLand ? <div class="muted small">{t('xw_no_land_terms')}</div> : cands.length ? <LocPicks cands={cands} sel={sel} owner={v.owner} onChange={(x) => { setWhite(false); setSel(x); }} />
            : <div class="muted small">{concede ? t('no_lost_locations') : t('no_occupied')}</div>}
          {!concede && sel.length > 0 && allowed.has('release') && <label class="chk"><input type="checkbox" checked={release} onChange={(e) => { setRelease((e.target as HTMLInputElement).checked); setConvert(false); }} /> {t('release_instead')}</label>}
          {!concede && sel.length > 0 && allowed.has('convert') && <Tip content={<div><TipHead name={t('term_convert')} hint={t('xw_convert_hint')} /></div>}><label class="chk"><input type="checkbox" checked={convert} onChange={(e) => { setConvert((e.target as HTMLInputElement).checked); setRelease(false); }} /> {t('xw_convert_instead')}</label></Tip>}
        </div>
        <div class="term-block">
          <div class="sub-h">{t('other_terms')}</div>
          <div class="act-row"><span class="k">{concede ? t('pay_gold') : t('term_gold')}</span><select value={gold} onChange={(e) => { setWhite(false); setGold(Number((e.target as HTMLSelectElement).value)); }}>{golds.map((g) => <option value={g}>{g ? num(g) : '—'}</option>)}</select></div>
          {!concede && <>
            {FLAG_TERMS.filter((k) => allowed.has(k) && !(k === 'faith' && wv?.sameFaith)).map((k) => {
              // a whole realm takes our faith only where faithTermFits allows it: the box stays, greyed, with the reason
              const off = k === 'faith' && !wv?.faith?.fit;
              return <Tip tag="div" content={<div><TipHead name={t(`term_${k}`)} hint={t(`xw_termhint_${k}`)} />{k === 'faith' && wv?.faith && <FaithFitTip f={wv.faith} />}</div>}>
                <label class={`chk${off ? ' muted' : ''}`}><input type="checkbox" disabled={off} checked={!off && !!flags[k]} onChange={() => toggle(k)} /> {t(`term_${k}`)}</label></Tip>;
            })}
            {allowed.has('throne') && wv?.throne && <Tip tag="div" content={<div><TipHead name={t('term_throne')} hint={t('xw_termhint_throne')} /></div>}><div class="act-row"><span class="k">{t('term_throne')}</span><select value={throne} onChange={(e) => { setWhite(false); setThrone((e.target as HTMLSelectElement).value as any); }}>
              <option value="">—</option><option value="union">{t('term_throne_union')}</option><option value="claimant">{t('term_throne_claimant')}</option></select></div></Tip>}
          </>}
          <label class="chk"><input type="checkbox" checked={white} onChange={(e) => { const x = (e.target as HTMLInputElement).checked; setWhite(x); if (x) { setSel([]); setGold(0); setFlags({}); setThrone(''); } }} /> {t('term_white_peace')}</label>
        </div>
      </div>
      <div class={`peace-eval ${ev ? (ev.accept ? 'yes' : 'no') : ''}`}>
        {ev ? <>
          <div class="pe-h">{ev.accept ? <b class="pos">✔ {t('would_accept')}</b> : <b class="neg">✘ {t('would_refuse')}</b>}
            {!concede && ev.warScore !== undefined && <span class="muted"><Tip content={() => <WarScoreTip w={w} pid={pid} />}><span class="has-tip">{t('war_score')} {signed(ev.warScore)}</span></Tip> · <Tip content={() => <TermCosts terms={terms} costs={ev.costs} total={ev.cost} title={t('demands_cost')} hint={t('x_demands_cost_hint')} />}><span class="has-tip">{t('demands_cost')} {num(ev.cost)}</span></Tip></span>}
            {concede && <Tip content={() => <TermCosts terms={terms} costs={ev.costs} total={ev.cost} title={t('concession_value')} hint={t('x_concession_hint')} />}><span class="muted has-tip">{t('concession_value')} {num(ev.cost)}</span></Tip>}
          </div>
          {ev.reasons?.length > 0 && <Reasons title={t('x_their_answer')} rows={ev.reasons} total={ev.score} />}
          {ev.cond && <div class={`pe-cond small ${ev.cond.ok ? 'pos' : 'neg'}`}>{ev.cond.ok ? '✔' : '✘'} {t('x_peace_cond')}: {signed(ev.cond.have, 0)} / {signed(ev.cond.need, 0)}</div>}
          {ev.reasons?.length > 0 && <div class="muted small">{t(ev.cond ? 'x_peace_accept_hint' : 'x_peace_accept_hint_white')}</div>}
        </> : <span class="muted">…</span>}
      </div>
      <div class="act-row"><span class="muted small">{terms.map(termText).join(' · ') || t('no_terms')}</span><span class="spacer" />
        <Btn small={false} cls={concede ? 'danger' : 'gold'} disabled={!terms.length && !concede ? 'no terms' : null} onClick={send}>{concede ? t('offer_concession') : t('send_offer')}</Btn></div>
    </Section>
    <div class="muted small">{t('allies_in_war')}: <NList ids={ourSide.filter((x) => x !== pid)} size={14} /></div>
    <Section title={t('xw_great_battles')} id="pc-battles" open={false}><BattleList rows={wv?.battles ?? null} /></Section>
    {void nations.value}
  </div>;
}

/** The rule for a whole realm's change of faith (faithTermFits) with the numbers it weighs. */
function FaithFitTip({ f }: { f: { fit: string | null; weight: number; people: number; oldFaith: boolean } }) {
  const mark = (ok: boolean) => <span class={ok ? 'pos' : 'muted'}>{ok ? '✔' : '✘'}</span>;
  return <div class="breakdown">
    <div class="bd-row"><span>{t('xw_faith_weight')} <span class="muted">({t('xw_faith_weight_need')})</span></span><span>{pct(f.weight)} {mark(f.weight <= 1 / 3)}</span></div>
    <div class="bd-row"><span>{t('xw_faith_people')} <span class="muted">({t('xw_faith_people_need')})</span></span><span>{pct(f.people)} {mark(f.people > 0.5)}</span></div>
    <div class="bd-row"><span>{t('xw_faith_old')}</span><span>{mark(f.oldFaith)}</span></div>
    <div class={`bd-row bd-total ${f.fit ? 'pos' : 'neg'}`}><span>{f.fit ? t(`xw_faith_fit_${f.fit}`) : t('xw_faith_unfit')}</span><span /></div>
  </div>;
}
