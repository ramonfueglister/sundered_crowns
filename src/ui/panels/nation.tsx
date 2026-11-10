// Foreign realm panel: ruler, standing, relations both ways, diplomacy with predicted answers, war and espionage.
import { useEffect, useState } from 'preact/hooks';
import { sim, view, nations } from '../../game/client';
import { selectedNation, playerId, openPanel } from '../store';
import type { WarGoal } from '../../sim/types';
import { Parts, TipHead } from './explain';
import { TradeRelations } from './tradediplo';
import { charName, charFull, relName, houseName, AiLogSection, TraitChip } from './people';
import { Panel, Section, Row, NLink, NList, Btn, Empty, Reasons, Effects, useQuery, act, t, L, lang, num, signed, pct, Tip, Coa, realm, useRealm, reasonLabel, flyToLoc, placeName, LocName, namesVersion } from './common';
import { errText } from '../i18n';

const PROPOSALS = ['alliance', 'marriage', 'guarantee', 'access', 'trade', 'vassalize', 'demand', 'improve'];
// (fabricating a claim is an agent's work: it is listed once, under espionage)
const UNILATERAL = ['gift', 'insult', 'break_alliance', 'rival', 'unrival', 'cancel_access', 'excommunicate'];
export const GOALS: WarGoal['type'][] = ['conquest', 'throne', 'faith', 'trade', 'subjugate', 'reconquest', 'independence', 'humiliate'];
const SPY = ['fabricate', 'slander', 'support_rebels', 'steal_tech'];

export const govName = (g: string) => { const v = t(`gov_${g}`); return v === `gov_${g}` ? g.replace(/_/g, ' ') : v; };
export const rankName = (r: string) => { const v = t(`rank_${r}`); return v === `rank_${r}` ? r.replace(/_/g, ' ') : v; };
const SKILLS = ['skill_gov', 'skill_dip', 'skill_mil'];

export function NationPanel({ nation }: { nation: number }) {
  const [d, refresh] = useQuery<any>({ q: 'nation', nation }, [nation], 1500);
  useRealm(2000);
  const close = () => { selectedNation.value = -1; };
  const n = nations.value[nation];
  if (!n) return null;
  if (!d) return <Panel title={L(n.name)} onClose={close} coa={<Coa coa={n.coa} color={n.color} size={48} />}><Empty>{t('loading')}…</Empty></Panel>;
  const pid = playerId.value;
  const rel = d.rel;
  const their = rel ? rel.theirOpinion.reduce((p: number, x: [string, number]) => p + x[1], 0) : 0;
  const ours = rel ? rel.ourOpinion.reduce((p: number, x: [string, number]) => p + x[1], 0) : 0;
  const me = pid >= 0 && pid !== nation ? nations.value[pid] : undefined;
  const ourMen = me ? (view.value?.armies ?? []).filter((a) => a.owner === pid && !a.fleet).reduce((p, a) => p + a.men, 0) : undefined;
  const ourShips = me ? (view.value?.armies ?? []).filter((a) => a.owner === pid && a.fleet).reduce((p, a) => p + a.men, 0) : undefined;
  return <Panel cls="nat-pnl" onClose={close} coa={<Coa coa={d.coa} color={d.color} size={52} />}
    title={L(d.name)} sub={<>{rankName(d.rank)} · {govName(d.gov)}{d.emperor && <> · <b>{t('emperor')}</b></>}{d.elector && <> · {t('elector')}</>}</>}>
    {!d.alive && <div class="neg">{t('fallen_realm')}</div>}
    <div class="ruler-box">
      <div>
        <div class="ruler-name">{d.ruler ? charName(d.ruler.name, d.ruler.female) : '—'}</div>
        {d.ruler?.dynasty && !d.ruler.name.includes(d.ruler.dynasty.slice(0, 5)) && <div class="muted small">{t('house_of')} {houseName(d.ruler.dynasty)}</div>}
        <div class="muted">{t('ruler')}{d.ruler && <> · <Tip content={<div><TipHead name={charFull(d.ruler.name, d.ruler.dynasty, d.ruler.female)} value={`${d.ruler.age} ${t('years_old')}`} hint={t('x_heir_hint')} /></div>}><span>{d.ruler.age} {t('years_old')}</span></Tip></>}</div>
        {d.ruler && <div class="skills">{d.ruler.skills.map((s: number, k: number) => <Tip content={<div><TipHead name={t(SKILLS[k])} value={s} hint={t(`x_skill${k}_fx`)} /></div>}><span class="skill"><i class={`sk sk${k}`} />{s}</span></Tip>)}</div>}
        {d.ruler?.traits?.length > 0 && <div class="chips">{d.ruler.traits.map((tr: string) => <TraitChip k={tr} ruler />)}</div>}
      </div>
      <div class="heir"><div class="muted">{t('heir')}</div><div>{d.heir ? <Tip content={<div><TipHead name={charName(d.heir.name, d.heir.female)} value={`${d.heir.age} ${t('years_old')}`} hint={t('x_heir_hint')} /></div>}><span>{charName(d.heir.name, d.heir.female)} <span class="muted">({d.heir.age})</span></span></Tip> : <span class="muted">{t('none')}</span>}</div></div>
    </div>
    <div class="loc-id">
      <Tip content={<div><TipHead name={placeName(d.capitalName)} hint={t('x_click_capital')} /></div>}><span class="chip" onClick={() => flyToLoc(d.capital)}><small>{t('capital')}</small><a class="lk">{placeName(d.capitalName)}</a></span></Tip>
      <Tip content={() => <div><TipHead name={L(d.faith)} hint={t('x_nat_faith_hint')} /><FaithTip m={d.faithMechanic} /></div>}><span class="chip"><small>{t('faith')}</small>{L(d.faith)}</span></Tip>
      <Tip content={<div><TipHead name={L(d.culture)} hint={t('x_nat_culture_hint')} /></div>}><span class="chip"><small>{t('culture')}</small>{L(d.culture)}</span></Tip>
    </div>
    <div class="grid2">
      <Row k={t('development')} v={num(d.dev)} tip={() => <Compare name={t('development')} theirs={d.dev} ours={me?.dev} hint={t('x_nat_dev_hint')} />} />
      <Row k={t('army')} v={`${num(d.men)} ${t('men')}`} tip={() => <Compare name={t('army')} theirs={d.men} ours={ourMen} hint={t('x_nat_army_hint')} />} />
      <Row k={t('fleet')} v={`${num(d.ships)} ${t('ships')}`} tip={() => <Compare name={t('fleet')} theirs={d.ships} ours={ourShips} hint={t('x_nat_fleet_hint')} />} />
      <Row k={t('prestige')} v={num(d.prestige)} tip={<div><TipHead name={t('prestige')} value={num(d.prestige)} hint={t('x_prestige_hint')} /><div class="muted">{t('x_prestige_events')}</div></div>} />
      <Row k={t('score')} v={num(d.score)} tip={() => <div><TipHead name={t('score')} value={num(d.score)} hint={t('x_score_hint')} /><Parts rows={d.scoreParts ?? []} total={(d.scoreParts ?? []).reduce((p: number, r: [string, number]) => p + r[1], 0)} fmt={(v) => num(v, 1)} /></div>} />
      <Row k={t('dread')} v={<span class={d.dread > 20 ? 'neg' : ''}>{num(d.dread)}</span>} tip={<div><TipHead name={t('dread')} value={num(d.dread, 1)} hint={t('dread_hint')} /><div class="muted">{t('x_dread_sources')}</div></div>} />
      <Row k={t('personality')} v={t(`pers_${d.personality}`)} tip={<div><TipHead name={t('personality')} value={t(`pers_${d.personality}`)} hint={t('x_personality_hint')} /></div>} />
    </div>
    {d.summary && <p class="summary small">{L(d.summary)}</p>}
    <Section title={t('relations')} id="nat-rel">
      <Row k={t('allies')} v={<NList ids={[...new Set(d.allies as number[])]} />} />
      <Row k={t('rivals')} v={<NList ids={d.rivals} />} />
      {d.overlord >= 0 && <Row k={t('overlord')} v={<NLink id={d.overlord} />} />}
      {d.subjects.length > 0 && <Row k={t('subjects')} v={<NList ids={d.subjects} />} />}
      {d.front.length > 0 && <Row k={t('common_front')} v={<NList ids={d.front} />} tip={t('front_hint')} />}
      {d.wars.length > 0 && <Row k={t('wars')} v={<span>{d.wars.map((id: number) => { const w = view.value?.wars.find((x) => x.id === id); return w ? <a class="lk block" onClick={() => openPanel('peace', { war: id })}>{L(w.name)}</a> : null; })}</span>} />}
    </Section>
    {rel && <>
      <Section title={t('opinion')} id="nat-op">
        <Row k={t('their_opinion')} v={<span class={their >= 0 ? 'pos' : 'neg'}>{signed(their)}</span>} tip={() => <Reasons title={t('their_opinion')} rows={rel.theirOpinion} />} />
        <Row k={t('our_opinion')} v={<span class={ours >= 0 ? 'pos' : 'neg'}>{signed(ours)}</span>} tip={() => <Reasons title={t('our_opinion')} rows={rel.ourOpinion} />} />
        <Row k={t('trust')} v={num(rel.trust)} tip={<div><TipHead name={t('trust')} value={num(rel.trust)} hint={t('trust_hint')} /></div>} />
        <Row k={t('treaties')} v={rel.treaties.length ? rel.treaties.map((x: string) => t(`treaty_${x}`)).join(', ') : t('none')} />
      </Section>
      {pid >= 0 && d.alive && <Diplomacy d={d} refresh={refresh} />}
      {pid >= 0 && d.alive && <TradeRelations target={d.id} refresh={refresh} />}
      {pid >= 0 && d.alive && !rel.atWar && <DeclareWar d={d} refresh={refresh} />}
      {pid >= 0 && d.alive && <Espionage d={d} />}
    </>}
    {d.alive && <AiLogSection d={d} />}
  </Panel>;
}

/** Their value next to ours, for the numbers of a foreign realm. */
function Compare({ name, theirs, ours, hint }: { name: string; theirs: number; ours?: number; hint: string }) {
  return <div><TipHead name={name} value={num(theirs)} hint={hint} />
    {ours !== undefined && <div class="breakdown"><div class="bd-row"><span>{t('x_ours')}</span><span>{num(ours)}</span></div><div class="bd-row bd-total"><span>{t('x_ratio')}</span><span class={theirs > ours ? 'neg' : 'pos'}>{ours > 0 ? `${num(theirs / ours, 2)} ×` : '—'}</span></div></div>}
  </div>;
}

export function traitName(k: string) { const v = t(`trait_${k}`); return v === `trait_${k}` ? k.replace(/_/g, ' ') : v; }

function Diplomacy({ d, refresh }: { d: any; refresh: () => void }) {
  const rel = d.rel; const p = view.value?.player;
  const [pred, setPred] = useState<Record<string, any>>({});
  const [gift, setGift] = useState(0);
  const allied = rel.treaties.includes('alliance'), married = rel.treaties.includes('marriage'), access = rel.treaties.includes('access');
  const proposals = PROPOSALS.filter((a) => !(a === 'alliance' && allied) && !(a === 'marriage' && married) && !(a === 'access' && access) && !(a === 'trade' && rel.treaties.includes('trade')) && !(a === 'guarantee' && rel.treaties.includes('guarantee')) && !(a !== 'improve' && rel.atWar));
  const unilateral = UNILATERAL.filter((a) => !(a === 'break_alliance' && !allied) && !(a === 'rival' && rel.rival) && !(a === 'unrival' && !rel.rival) && !(a === 'cancel_access' && !access) && !(a === 'excommunicate' && !rel.canExcommunicate));
  const key = proposals.join(',') + d.id;
  useEffect(() => {
    let live = true;
    Promise.all(proposals.map((a) => sim().query<any>({ q: 'diplo', target: d.id, action: a }).then((r) => [a, r] as const))).then((all) => { if (live) setPred(Object.fromEntries(all.filter((x) => x[1]))); });
    return () => { live = false; };
  }, [key, rel.trust, rel.theirOpinion.length]);
  const free = p ? p.envoys - p.envoysBusy : 0;
  const giftAmt = gift || Math.max(20, Math.round((p?.incomeBreak?.tax || 10) * 2));
  const actName = (a: string) => L(rel.actions.find((x: any) => x.id === a)?.name) || t(`act_${a}`);
  const pid = playerId.value;
  return <Section title={t('diplomacy')} id="nat-dip" right={<Tip content={t('envoys_hint')}><span class={free ? 'muted' : 'neg'}><i class="ic envoy sm" /> {free}/{p?.envoys ?? 0}</span></Tip>}>
    <div class="dip-list">{proposals.map((a) => {
      const pr = pred[a];
      const sum = pr ? (pr.reasons as [string, number][]).reduce((q, x) => q + x[1], 0) : 0;
      const row = <div class="dip-row">
        <span class="dname">{actName(a)}</span>
        {pr?.kind === 'gain' ? <Tip content={() => <><Reasons title={t('xp_improve_title')} rows={pr.reasons} total={pr.gain} />
            <div class="muted small">{t('xp_improve_hint').replace('{now}', signed(pr.now, 0)).replace('{cap}', String(pr.cap))}</div></>}>
          <span class="pred yes">{signed(pr.gain, 0)} {t('xp_opinion_short')}</span></Tip>
        : pr ? <Tip content={() => <><Reasons title={t('they_say')} rows={pr.reasons} total={sum} /><div class={pr.accept ? 'pos' : 'neg'}>{pr.accept ? t('would_accept') : t('would_refuse')}</div>
            {pr.again > 0 && <div class="muted small">{t('xp_refused_lately')}</div>}</>}>
          <span class={`pred ${pr.accept ? 'yes' : 'no'}`}>{pr.accept ? '✔' : '✘'} {pr.accept ? t('would_accept') : t('would_refuse')} <small>({signed(sum)})</small></span>
        </Tip> : <span class="pred">…</span>}
        <Btn disabled={free <= 0 ? 'all envoys are busy' : null} tip={t('envoy_travel')} onClick={() => act({ t: 'diplo', target: d.id, action: a }, 'page', t('envoy_sent')).then(refresh)}>{t('send')}</Btn>
      </div>;
      return a === 'marriage' && pr?.preview ? <>{row}<MarriagePreview p={pr.preview} us={pid} them={d.id} /></> : row;
    })}</div>
    <div class="dip-list uni">{unilateral.map((a) => <div class="dip-row">
      <span class="dname">{actName(a)}</span>
      {a === 'gift' ? <><select value={giftAmt} onChange={(e) => setGift(Number((e.target as HTMLSelectElement).value))}>{[1, 2, 4, 8].map((m) => { const v = Math.max(20, Math.round((p?.incomeBreak?.tax || 10) * 2 * m / 2)); return <option value={v}>{num(v)}</option>; })}</select>
        <Btn disabled={(p?.treasury ?? 0) < giftAmt ? 'not enough gold' : null} onClick={() => act({ t: 'diplo', target: d.id, action: 'gift', payload: { amount: giftAmt } }, 'coins').then(refresh)}>{t('send')}</Btn></>
        : <Btn cls={a === 'insult' || a === 'break_alliance' || a === 'rival' ? 'danger' : ''} tip={t(`acthint_${a}`)} onClick={() => act({ t: 'diplo', target: d.id, action: a }).then(refresh)}>{t('do')}</Btn>}
    </div>)}</div>
  </Section>;
}

/** What a royal marriage with this realm would bring today (systems/dynasty.ts marriagePreview): who weds whom, the
 *  claim it creates and on which throne, or that the treaty alone binds the houses; and who lives in their house. */
function MarriagePreview({ p, us, them }: { p: any; us: number; them: number }) {
  const m = p.match;
  const who = (c: any) => <b>{charName(c.name, c.female)}</b>;
  const role = (c: any) => <span class="muted">({relName(c.rel, c.female)}, {c.age})</span>;
  return <div class="dip-wed small" style={{ margin: '0 0 6px 10px' }}>
    {m ? <>
      <div>{t('xp_wed_if')}: {who(m.person)} {role(m.person)} <NLink id={m.realm} size={14} /> ⚭ {m.spouse ? <>{who(m.spouse)} {role(m.spouse)}</> : <span class="muted">{t(m.female ? 'xp_wed_unnamed_f' : 'xp_wed_unnamed_m')}</span>} <NLink id={m.house} size={14} /></div>
      <div class={m.realm === us ? 'pos' : 'neg'}>{m.realm === us ? t('xp_wed_claim_ours') : t('xp_wed_claim_theirs')}</div>
    </> : <div class="muted">{t('xp_wed_none')}</div>}
    {p.members.length > 0 && <div class="muted">{t('xp_wed_house')}: {p.members.map((x: any, k: number) => <span>{k > 0 && ', '}{charName(x.name, x.female)} ({relName(x.rel, x.female)}, {x.age}{x.wed ? ', ⚭' : ''})</span>)}</div>}
  </div>;
}

/** Our justifications against this realm, as the simulation sees them (src/sim/systems/war.ts casusBelliAll). */
const cbList = (d: any): string[] => d.rel?.cb ?? [];
function CbTip({ d }: { d: any }) {
  const cbs = cbList(d), theirs: string[] = d.rel?.theirCb ?? [], fab = d.rel?.fabricating;
  return <div>
    <div class="bd-title">{t('cb_all')}</div>
    {cbs.length ? cbs.map((c) => <div>✔ {t(`cb_${c}`)}</div>) : <div class="muted">{t('no_cb_short')}</div>}
    {fab && <div>{t('cb_in_progress')}: {num(Math.min(100, fab.progress / Math.max(1, fab.days) * 100))} %</div>}
    {theirs.length > 0 && <div class="neg">⚠ {t('cb_theirs')}: {theirs.map((c) => t(`cb_${c}`)).join(', ')}</div>}
  </div>;
}

function DeclareWar({ d, refresh }: { d: any; refresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [pick, setGoal] = useState<WarGoal['type'] | null>(null);
  // our justifications and, per war goal, its price and the towns it is fought for (src/game/warview.ts declareView)
  const [dv] = useQuery<any>(open ? { q: 'declare', target: d.id } : null, [open, d.id], 1500);
  const cbs = cbList(d); const fabricating = !!d.rel?.fabricating;
  const goals: any[] = dv?.goals ?? [];
  const first = goals.find((g) => !g.refusal && !g.unjust) ?? goals.find((g) => !g.refusal);
  const goal = pick ?? first?.goal ?? 'conquest';
  const g = goals.find((x) => x.goal === goal);
  void namesVersion.value;
  return <Section title={t('declare_war')} id="nat-war" open={false}>
    {!open ? <div class="act-row"><Tip content={() => <CbTip d={d} />}><span class="muted">{cbs.length ? <>{t('casus_belli')}: <b>{cbs.map((c) => t(`cb_${c}`)).join(', ')}</b></> : t('no_cb_short')}</span></Tip><Btn cls="danger" onClick={() => setOpen(true)}>{t('declare_war')}…</Btn></div>
      : !dv ? <div class="muted">{t('loading')}…</div> : <div class="war-form">
        <label class="k">{t('xw_our_cbs')}</label>
        {dv.cbs.length ? <div class="xw-cbs">{dv.cbs.map((c: any) => <Tip content={<div><TipHead name={t(`cb_${c.kind}`)} hint={t(`xw_cbhint_${c.kind}`)} /><div class="bd-title">{t('xw_cb_allows')}</div>{c.goals.map((x: string) => <div>✔ {t(`goal_${x}`)}</div>)}</div>}>
          <div class="kv"><span class="k">✔ {t(`cb_${c.kind}`)}</span><span class="v muted small">{c.goals.map((x: string) => t(`goal_${x}`)).join(', ')}</span></div></Tip>)}</div>
          : <div class="muted small">{t('no_cb_short')}{fabricating && <> · {t('cb_fabricating')}</>}</div>}
        <label class="k">{t('war_goal')}</label>
        <div class="goal-grid">{goals.map((x) => <Tip tag="div" content={() => <GoalTip g={x} />}>
          <label class={`goal ${goal === x.goal ? 'on' : ''} ${x.refusal ? 'muted' : ''}`}><input type="radio" name="goal" checked={goal === x.goal} disabled={!!x.refusal} onChange={() => setGoal(x.goal)} />
            {t(`goal_${x.goal}`)} {x.refusal ? <small class="neg">✘</small> : x.unjust ? <small class="neg">⚠</small> : <small class="pos">✔</small>}</label></Tip>)}</div>
        <div class="muted small">{t(`goalhint_${goal}`)}</div>
        {g && <>
          {g.cb && !g.unjust && <div class="pos small">✔ {t('xw_justified_by')}: {t(`cb_${g.cb}`)}</div>}
          {g.locs.length > 0 && <div class="small xw-goal-locs"><span class="k">{t('xw_fought_for')}:</span> {g.locs.slice(0, 8).map((l: number, k: number) => <>{k > 0 && ', '}<LocName id={l} /></>)}{g.locs.length > 8 && <span class="muted"> +{g.locs.length - 8}</span>}</div>}
          <div class="small"><span class="k">{t('xw_terms_allowed')}:</span> <span class="muted">{g.terms.map((x: string) => t(`term_${x}`)).join(', ')}</span></div>
          {g.rows.length > 0 ? <div class="warn-box"><Tip content={() => <div><TipHead name={t('xw_decl_cost')} hint={t('xw_decl_cost_hint')} /><CostRows rows={g.rows} />{g.opinionYears > 0 && <div class="muted small">{t('xw_opinion_years').replace('{n}', String(g.opinionYears))}</div>}</div>}>
            <div><b>⚠ {g.unjust ? t('no_cb') : t('xw_decl_cost')}</b>{g.unjust && <div>{t('no_cb_hint')}</div>}<CostRows rows={g.rows} /></div></Tip></div>
            : <div class="pos small">{t('xw_no_decl_cost')}</div>}
          {g.truce && <div class="warn-box"><b>⚠ {t('truce_break')}</b><div>{t('truce_break_hint')}</div></div>}
          {g.ally && <div class="warn-box"><b>⚠ {t('ally_break')}</b></div>}
          {g.refusal && <div class="neg small">{errText(g.refusal)}</div>}
        </>}
        <div class="act-row"><Btn onClick={() => setOpen(false)}>{t('cancel')}</Btn><Btn cls="danger" disabled={g?.refusal ?? null} onClick={() => act({ t: 'declare', target: d.id, goal, locs: g?.locs ?? [] }, 'war', t('war_declared')).then((r) => { if (r.ok) { setOpen(false); refresh(); } })}>{t('declare_war')}</Btn></div>
      </div>}
  </Section>;
}
/** The price of a declaration, every row a loss (Dread grows, the rest falls). */
function CostRows({ rows }: { rows: [string, number][] }) {
  return <div class="breakdown">{rows.map(([k, v]) => <div class="bd-row"><span>{t(k)}</span><span class="neg">{signed(v, 0)}</span></div>)}</div>;
}
/** One war goal in the declaration: the justification that covers it or what declaring it without one costs. */
function GoalTip({ g }: { g: any }) {
  return <div><TipHead name={t(`goal_${g.goal}`)} hint={t(`goalhint_${g.goal}`)} />
    {g.refusal ? <div class="neg">{errText(g.refusal)}</div> : g.cb && !g.unjust ? <div class="pos">✔ {t('xw_justified_by')}: {t(`cb_${g.cb}`)}</div> : null}
    {!g.refusal && g.rows.length > 0 && <><div class="bd-title">{t('xw_decl_cost')}</div><CostRows rows={g.rows} /></>}
    <div class="muted small">{t('xw_terms_allowed')}: {g.terms.map((x: string) => t(`term_${x}`)).join(', ')}</div></div>;
}

function Espionage({ d }: { d: any }) {
  const r = realm.value; const p = view.value?.player;
  const mine = (r?.spies ?? []) as any[];
  const busy = mine.length >= 2;
  // what each operation costs against this realm, from the simulation (diplomacy.ts spyCost) with its parts
  const costOf = (a: string): { cost: number; parts: [string, number][] } => d.rel?.spyCosts?.[a] ?? { cost: 0, parts: [] };
  const here = mine.filter((s) => s.target === d.id);
  return <Section title={t('espionage')} id="nat-spy" open={false} right={<Tip content={<div><TipHead name={t('espionage')} value={`${mine.length}/2`} hint={t('x_spies_hint')} /></div>}><span class="muted has-tip">{mine.length}/2</span></Tip>}>
    {here.map((s) => <div class="kv"><span class="k">{t(`spy_${s.action}`)}</span><span class="v">{num((s.progress / Math.max(1, s.days)) * 100)} %</span></div>)}
    <div class="dip-list">{SPY.map((a) => <div class="dip-row">
      <Tip content={t(`spyhint_${a}`)}><span class="dname">{t(`spy_${a}`)}</span></Tip>
      <Tip content={() => <Reasons title={t('xp_spy_cost')} rows={costOf(a).parts} total={costOf(a).cost} />}><span class="muted small has-tip">{num(costOf(a).cost)} <i class="ic gold sm" /></span></Tip>
      <Btn disabled={busy ? 'all agents are busy' : here.some((s) => s.action === a) ? 'already under way' : (p?.treasury ?? 0) < costOf(a).cost ? 'not enough gold' : null} onClick={() => act({ t: 'spy', target: d.id, action: a }, 'click', t('spy_sent'))}>{t('do')}</Btn>
    </div>)}</div>
    <div class="muted small">{t('spy_risk')}</div>
  </Section>;
}
void lang; void pct; void reasonLabel;

/** The faith's own mechanic (src/sim/systems/faith.ts) and what it does for this realm at the moment. */
function FaithTip({ m }: { m: any }) {
  if (!m?.name) return null;
  return <div class="faith-tip">
    <div class="bd-title">{t('faith_mechanic')}: {L(m.name)}</div>
    <div class="muted small">{L(m.desc)}</div>
    {m.active?.length ? m.active.map((x: any) => <Effects title={L(x.label)} fx={x.effects} />) : <div class="muted small">{t('faith_mechanic_idle')}</div>}
  </div>;
}
