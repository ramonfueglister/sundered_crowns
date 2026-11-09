// Foreign realm panel: ruler, standing, relations both ways, diplomacy with predicted answers, war and espionage.
import { useEffect, useState } from 'preact/hooks';
import { sim, view, nations } from '../../game/client';
import { selectedNation, playerId, openPanel } from '../store';
import type { WarGoal } from '../../sim/types';
import { Panel, Section, Row, NLink, NList, Btn, Empty, Reasons, Effects, useQuery, act, t, L, lang, num, signed, pct, Tip, Coa, realm, useRealm, reasonLabel, flyToLoc, placeName } from './common';

const PROPOSALS = ['alliance', 'marriage', 'guarantee', 'access', 'trade', 'vassalize', 'demand', 'improve'];
const UNILATERAL = ['gift', 'insult', 'break_alliance', 'fabricate', 'rival', 'unrival', 'cancel_access', 'excommunicate'];
export const GOALS: WarGoal['type'][] = ['conquest', 'throne', 'faith', 'trade', 'subjugate', 'reconquest', 'independence'];
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
  return <Panel cls="nat-pnl" onClose={close} coa={<Coa coa={d.coa} color={d.color} size={52} />}
    title={L(d.name)} sub={<>{rankName(d.rank)} · {govName(d.gov)}{d.emperor && <> · <b>{t('emperor')}</b></>}{d.elector && <> · {t('elector')}</>}</>}>
    {!d.alive && <div class="neg">{t('fallen_realm')}</div>}
    <div class="ruler-box">
      <div>
        <div class="ruler-name">{d.ruler ? <>{d.ruler.name} {d.ruler.dynasty}</> : '—'}</div>
        <div class="muted">{t('ruler')}{d.ruler && <> · {d.ruler.age} {t('years_old')}</>}</div>
        {d.ruler && <div class="skills">{d.ruler.skills.map((s: number, k: number) => <Tip content={t(SKILLS[k])}><span class="skill"><i class={`sk sk${k}`} />{s}</span></Tip>)}</div>}
        {d.ruler?.traits?.length > 0 && <div class="chips">{d.ruler.traits.map((tr: string) => <span class="chip">{traitName(tr)}</span>)}</div>}
      </div>
      <div class="heir"><div class="muted">{t('heir')}</div><div>{d.heir ? <>{d.heir.name} <span class="muted">({d.heir.age})</span></> : <span class="muted">{t('none')}</span>}</div></div>
    </div>
    <div class="grid2">
      <Row k={t('capital')} v={<a class="lk" onClick={() => flyToLoc(d.capital)}>{placeName(d.capitalName)}</a>} />
      <Row k={t('faith')} v={L(d.faith)} tip={() => <FaithTip m={d.faithMechanic} />} />
      <Row k={t('culture')} v={L(d.culture)} />
      <Row k={t('development')} v={num(d.dev)} />
      <Row k={t('army')} v={`${num(d.men)} ${t('men')}`} />
      <Row k={t('fleet')} v={`${num(d.ships)} ${t('ships')}`} />
      <Row k={t('prestige')} v={num(d.prestige)} />
      <Row k={t('score')} v={num(d.score)} />
      <Row k={t('dread')} v={<span class={d.dread > 20 ? 'neg' : ''}>{num(d.dread)}</span>} tip={t('dread_hint')} />
      <Row k={t('personality')} v={t(`pers_${d.personality}`)} />
    </div>
    {d.summary && <p class="summary small">{L(d.summary)}</p>}
    <Section title={t('relations')} id="nat-rel">
      <Row k={t('allies')} v={<NList ids={d.allies} />} />
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
        <Row k={t('trust')} v={num(rel.trust)} tip={t('trust_hint')} />
        <Row k={t('treaties')} v={rel.treaties.length ? rel.treaties.map((x: string) => t(`treaty_${x}`)).join(', ') : t('none')} />
      </Section>
      {pid >= 0 && d.alive && <Diplomacy d={d} refresh={refresh} />}
      {pid >= 0 && d.alive && !rel.atWar && <DeclareWar d={d} refresh={refresh} />}
      {pid >= 0 && d.alive && <Espionage d={d} />}
    </>}
  </Panel>;
}

export function traitName(k: string) { const v = t(`trait_${k}`); return v === `trait_${k}` ? k.replace(/_/g, ' ') : v; }

function Diplomacy({ d, refresh }: { d: any; refresh: () => void }) {
  const rel = d.rel; const p = view.value?.player;
  const [pred, setPred] = useState<Record<string, { accept: boolean; reasons: [string, number][] }>>({});
  const [gift, setGift] = useState(0);
  const allied = rel.treaties.includes('alliance'), married = rel.treaties.includes('marriage'), access = rel.treaties.includes('access');
  const proposals = PROPOSALS.filter((a) => !(a === 'alliance' && allied) && !(a === 'marriage' && married) && !(a === 'access' && access) && !(a === 'trade' && rel.treaties.includes('trade')) && !(a === 'guarantee' && rel.treaties.includes('guarantee')) && !(a !== 'improve' && rel.atWar));
  const unilateral = UNILATERAL.filter((a) => !(a === 'break_alliance' && !allied) && !(a === 'rival' && rel.rival) && !(a === 'unrival' && !rel.rival) && !(a === 'cancel_access' && !access) && !(a === 'fabricate' && rel.atWar) && !(a === 'excommunicate' && !rel.canExcommunicate));
  const key = proposals.join(',') + d.id;
  useEffect(() => {
    let live = true;
    Promise.all(proposals.map((a) => sim().query<any>({ q: 'diplo', target: d.id, action: a }).then((r) => [a, r] as const))).then((all) => { if (live) setPred(Object.fromEntries(all.filter((x) => x[1]))); });
    return () => { live = false; };
  }, [key, rel.trust, rel.theirOpinion.length]);
  const free = p ? p.envoys - p.envoysBusy : 0;
  const giftAmt = gift || Math.max(20, Math.round((p?.incomeBreak?.tax || 10) * 2));
  const actName = (a: string) => L(rel.actions.find((x: any) => x.id === a)?.name) || t(`act_${a}`);
  return <Section title={t('diplomacy')} id="nat-dip" right={<Tip content={t('envoys_hint')}><span class={free ? 'muted' : 'neg'}><i class="ic envoy sm" /> {free}/{p?.envoys ?? 0}</span></Tip>}>
    <div class="dip-list">{proposals.map((a) => {
      const pr = pred[a];
      const sum = pr ? pr.reasons.reduce((s, x) => s + x[1], 0) : 0;
      return <div class="dip-row">
        <span class="dname">{actName(a)}</span>
        {pr ? <Tip content={() => <><Reasons title={t('they_say')} rows={pr.reasons} total={sum} /><div class={pr.accept ? 'pos' : 'neg'}>{pr.accept ? t('would_accept') : t('would_refuse')}</div></>}>
          <span class={`pred ${pr.accept ? 'yes' : 'no'}`}>{pr.accept ? '✔' : '✘'} {pr.accept ? t('would_accept') : t('would_refuse')} <small>({signed(sum)})</small></span>
        </Tip> : <span class="pred">…</span>}
        <Btn disabled={free <= 0 ? 'all envoys are busy' : null} tip={t('envoy_travel')} onClick={() => act({ t: 'diplo', target: d.id, action: a }, 'page', t('envoy_sent')).then(refresh)}>{t('send')}</Btn>
      </div>;
    })}</div>
    <div class="dip-list uni">{unilateral.map((a) => <div class="dip-row">
      <span class="dname">{actName(a)}</span>
      {a === 'gift' ? <><select value={giftAmt} onChange={(e) => setGift(Number((e.target as HTMLSelectElement).value))}>{[1, 2, 4, 8].map((m) => { const v = Math.max(20, Math.round((p?.incomeBreak?.tax || 10) * 2 * m / 2)); return <option value={v}>{num(v)}</option>; })}</select>
        <Btn disabled={(p?.treasury ?? 0) < giftAmt ? 'not enough gold' : null} onClick={() => act({ t: 'diplo', target: d.id, action: 'gift', payload: { amount: giftAmt } }, 'coins').then(refresh)}>{t('send')}</Btn></>
        : <Btn cls={a === 'insult' || a === 'break_alliance' || a === 'rival' ? 'danger' : ''} tip={t(`acthint_${a}`)} onClick={() => act({ t: 'diplo', target: d.id, action: a }).then(refresh)}>{t('do')}</Btn>}
    </div>)}</div>
  </Section>;
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
  const [goal, setGoal] = useState<WarGoal['type']>('conquest');
  const cbs = cbList(d); const fabricating = !!d.rel?.fabricating;
  const truce = d.rel.treaties.includes('truce'), allied = d.rel.treaties.includes('alliance');
  const me = nations.value[playerId.value];
  const goals = GOALS.filter((g) => (g === 'independence' ? me?.overlord === d.id : true) && (g === 'subjugate' ? true : true));
  return <Section title={t('declare_war')} id="nat-war" open={false}>
    {!open ? <div class="act-row"><Tip content={() => <CbTip d={d} />}><span class="muted">{cbs.length ? <>{t('casus_belli')}: <b>{cbs.map((c) => t(`cb_${c}`)).join(', ')}</b></> : t('no_cb_short')}</span></Tip><Btn cls="danger" onClick={() => setOpen(true)}>{t('declare_war')}…</Btn></div>
      : <div class="war-form">
        <label class="k">{t('war_goal')}</label>
        <div class="goal-grid">{goals.map((g) => <label class={`goal ${goal === g ? 'on' : ''}`}><input type="radio" name="goal" checked={goal === g} onChange={() => setGoal(g)} />{t(`goal_${g}`)}</label>)}</div>
        <div class="muted small">{t(`goalhint_${goal}`)}</div>
        {!cbs.length && goal !== 'independence' && <div class="warn-box"><b>⚠ {t('no_cb')}</b><div>{t('no_cb_hint')}</div>{fabricating && <div class="muted">{t('cb_fabricating')}</div>}</div>}
        {truce && <div class="warn-box"><b>⚠ {t('truce_break')}</b><div>{t('truce_break_hint')}</div></div>}
        {allied && <div class="warn-box"><b>⚠ {t('ally_break')}</b></div>}
        <div class="act-row"><Btn onClick={() => setOpen(false)}>{t('cancel')}</Btn><Btn cls="danger" onClick={() => act({ t: 'declare', target: d.id, goal }, 'war', t('war_declared')).then((r) => { if (r.ok) { setOpen(false); refresh(); } })}>{t('declare_war')}</Btn></div>
      </div>}
  </Section>;
}

function Espionage({ d }: { d: any }) {
  const r = realm.value; const p = view.value?.player;
  const mine = (r?.spies ?? []) as any[];
  const busy = mine.length >= 2;
  const cost = 30 * (r?.priceLevel ?? 1);
  const here = mine.filter((s) => s.target === d.id);
  return <Section title={t('espionage')} id="nat-spy" open={false} right={<span class="muted">{mine.length}/2</span>}>
    {here.map((s) => <div class="kv"><span class="k">{t(`spy_${s.action}`)}</span><span class="v">{num((s.progress / Math.max(1, s.days)) * 100)} %</span></div>)}
    <div class="dip-list">{SPY.map((a) => <div class="dip-row">
      <Tip content={t(`spyhint_${a}`)}><span class="dname">{t(`spy_${a}`)}</span></Tip>
      <span class="muted small">{num(cost)} <i class="ic gold sm" /></span>
      <Btn disabled={busy ? 'all agents are busy' : (p?.treasury ?? 0) < cost ? 'not enough gold' : here.some((s) => s.action === a) ? 'already under way' : null} onClick={() => act({ t: 'spy', target: d.id, action: a }, 'click', t('spy_sent'))}>{t('do')}</Btn>
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
