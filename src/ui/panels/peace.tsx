// Peace negotiation: pick the enemy, compose terms, see the live evaluation, send or concede; answer offers.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { sim, view, nations } from '../../game/client';
import { playerId, panelArg, openPanel } from '../store';
import type { PeaceTerm } from '../../sim/types';
import { Section, Btn, Empty, NLink, NList, Reasons, act, t, L, num, signed, Tip, locName, namesVersion, flyToLoc, useQuery, placeName } from './common';
import { WarCard, WarScoreTip } from './realmtabs';
import { TipHead } from './explain';

export function termText(x: PeaceTerm): string {
  switch (x.type) {
    case 'cede': return `${t('term_cede')}: ${(x.locs || []).map(locName).join(', ')}`;
    case 'release': return `${t('term_release')}: ${(x.locs || []).map(locName).join(', ')}`;
    case 'gold': return `${t('term_gold')}: ${num(x.amount || 0)}`;
    default: return t(`term_${x.type}`);
  }
}

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
  const seq = useRef(0);
  // candidate locations: for demands, the enemy side's land we occupy; for concessions, our land they occupy
  const cands = useMemo(() => {
    const o = v.owner, c = v.ctrl; if (!o || !c) return [] as number[];
    const owners = new Set(concede ? ourSide : theirSide);
    const holders = new Set(concede ? theirSide : ourSide);
    const out: number[] = []; for (let i = 0; i < o.length; i++) if (owners.has(o[i]) && holders.has(c[i])) out.push(i);
    return out;
  }, [v.day, concede, to]);
  useEffect(() => { setSel((s) => s.filter((x) => cands.includes(x))); }, [cands.join(',')]);
  const terms: PeaceTerm[] = useMemo(() => {
    if (white) return [{ type: 'white_peace' }];
    const out: PeaceTerm[] = [];
    if (sel.length) out.push(release && !concede ? { type: 'release', locs: sel } : { type: 'cede', locs: sel, to: concede ? to : pid });
    if (gold > 0) out.push({ type: 'gold', amount: gold });
    for (const k of ['vassal', 'humiliate', 'break_alliance']) if (flags[k]) out.push({ type: k as any });
    return out;
  }, [white, sel.join(','), release, gold, flags, concede, to]);
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
          {cands.length ? <LocPicks cands={cands} sel={sel} owner={v.owner} onChange={(x) => { setWhite(false); setSel(x); }} />
            : <div class="muted small">{concede ? t('no_lost_locations') : t('no_occupied')}</div>}
          {!concede && sel.length > 0 && <label class="chk"><input type="checkbox" checked={release} onChange={(e) => setRelease((e.target as HTMLInputElement).checked)} /> {t('release_instead')}</label>}
        </div>
        <div class="term-block">
          <div class="sub-h">{t('other_terms')}</div>
          <div class="act-row"><span class="k">{concede ? t('pay_gold') : t('term_gold')}</span><select value={gold} onChange={(e) => { setWhite(false); setGold(Number((e.target as HTMLSelectElement).value)); }}>{golds.map((g) => <option value={g}>{g ? num(g) : '—'}</option>)}</select></div>
          {!concede && <>
            <label class="chk"><input type="checkbox" checked={!!flags.vassal} onChange={() => toggle('vassal')} /> {t('term_vassal')}</label>
            <label class="chk"><input type="checkbox" checked={!!flags.humiliate} onChange={() => toggle('humiliate')} /> {t('term_humiliate')}</label>
            <label class="chk"><input type="checkbox" checked={!!flags.break_alliance} onChange={() => toggle('break_alliance')} /> {t('term_break_alliance')}</label>
          </>}
          <label class="chk"><input type="checkbox" checked={white} onChange={(e) => { const x = (e.target as HTMLInputElement).checked; setWhite(x); if (x) { setSel([]); setGold(0); setFlags({}); } }} /> {t('term_white_peace')}</label>
        </div>
      </div>
      <div class={`peace-eval ${ev ? (ev.accept ? 'yes' : 'no') : ''}`}>
        {ev ? <>
          <div class="pe-h">{ev.accept ? <b class="pos">✔ {t('would_accept')}</b> : <b class="neg">✘ {t('would_refuse')}</b>}
            {!concede && ev.warScore !== undefined && <span class="muted"><Tip content={() => <WarScoreTip w={w} pid={pid} />}><span class="has-tip">{t('war_score')} {signed(ev.warScore)}</span></Tip> · <Tip content={() => <TermCosts terms={terms} costs={ev.costs} total={ev.cost} title={t('demands_cost')} hint={t('x_demands_cost_hint')} />}><span class="has-tip">{t('demands_cost')} {num(ev.cost)}</span></Tip></span>}
            {concede && <Tip content={() => <TermCosts terms={terms} costs={ev.costs} total={ev.cost} title={t('concession_value')} hint={t('x_concession_hint')} />}><span class="muted has-tip">{t('concession_value')} {num(ev.cost)}</span></Tip>}
          </div>
          {ev.reasons?.length > 0 && <Reasons title={t('x_their_answer')} rows={ev.reasons} total={ev.score} />}
          {ev.reasons?.length > 0 && <div class="muted small">{t('x_peace_accept_hint')}</div>}
        </> : <span class="muted">…</span>}
      </div>
      <div class="act-row"><span class="muted small">{terms.map(termText).join(' · ') || t('no_terms')}</span><span class="spacer" />
        <Btn small={false} cls={concede ? 'danger' : 'gold'} disabled={!terms.length && !concede ? 'no terms' : null} onClick={send}>{concede ? t('offer_concession') : t('send_offer')}</Btn></div>
    </Section>
    <div class="muted small">{t('allies_in_war')}: <NList ids={ourSide.filter((x) => x !== pid)} size={14} /></div>
    {void nations.value}
  </div>;
}
