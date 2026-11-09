// The Empire & great powers panel (spec points 60 and 83): the emperor, the electors and the election with each
// elector's reasons, imperial authority with its causes, the reforms and the diet, calls for defence and orders to
// make peace, the League of the Northern Towns, and the ranking of the great powers with what the standing gives.
import { useState } from 'preact/hooks';
import { playerId } from '../store';
import { view } from '../../game/client';
import { Section, Row, Bar, Btn, Empty, NLink, NList, Effects, Tip, Tabs, useQuery, act, t, L, num, signed, fmtDateShort } from './common';
import { Parts, TipHead } from './explain';

type Row2 = [any, number];
const sum = (r: Row2[]) => r.reduce((p, x) => p + x[1], 0);
const date = (d: number) => fmtDateShort(d, view.value?.startYear ?? 1356);

export function EmpireTab() {
  const [tab, setTab] = useState<'empire' | 'powers'>('empire');
  return <div class="tab-empire">
    <Tabs tabs={[['empire', t('empire')], ['powers', t('x_gp_title')]]} value={tab} onChange={setTab} />
    {tab === 'empire' ? <EmpireView /> : <PowersView />}
  </div>;
}

function Reasons2({ rows, title, total }: { rows: Row2[]; title?: any; total?: number }) {
  return <Parts title={title} rows={rows} total={total ?? sum(rows)} digits={0} />;
}

function EmpireView() {
  const pid = playerId.value;
  const [e, refresh] = useQuery<any>({ q: 'empire' }, [pid], 800);
  if (!e) return <Empty>{t('loading')}…</Empty>;
  const doAct = async (c: any) => { await act(c); refresh(); };
  const thisYear: Row2[] = Object.entries(e.thisYear).map(([k, v]) => [k, v as number]);
  const lastYear: Row2[] = Object.entries(e.lastYear).map(([k, v]) => [k, v as number]);
  return <div>
    <div class="cols2">
      <Section title={t('emperor')} id="emp-emperor">
        <Row k={t('emperor')} v={e.emperor >= 0 ? <NLink id={e.emperor} /> : '—'} />
        <Row k={t('imperial_authority')} v={num(e.authority)} tip={() => <div>
          <TipHead name={t('imperial_authority')} value={num(e.authority)} hint={t('x_emp_auth_hint')} />
          <Parts title={t('x_emp_monthly')} rows={e.drift} total={e.driftSum} digits={2} />
          {thisYear.length > 0 && <Parts title={t('x_emp_this_year')} rows={thisYear} total={sum(thisYear)} digits={1} />}
          {lastYear.length > 0 && <Parts title={t('x_emp_last_year')} rows={lastYear} total={sum(lastYear)} digits={1} />}
        </div>} />
        <Bar value={e.authority} max={100} color="#c9a24a" />
        <Tip content={<Effects title={t('x_emp_crown_gives')} fx={e.crown} />}><div class="muted small has-tip">{t('x_emp_crown_gives')} ⓘ</div></Tip>
        {Object.keys(e.member).length > 0 && <Tip content={<Effects title={t('x_emp_member_gets')} fx={e.member} />}><div class="muted small has-tip">{t('x_emp_member_gets')} ⓘ</div></Tip>}
        <Row k={t('x_emp_members')} v={e.members.length} tip={<NList ids={e.members} size={14} />} />
        <div class="muted small">{e.isEmperor ? t('x_emp_you_emperor') : e.elector ? t('you_elector') : e.isMember ? t('x_emp_you_member') : t('x_emp_not_member')}</div>
      </Section>
      <Section title={t('x_el_title')} id="emp-election" right={e.election ? <span class="tag">{t('x_el_open')} {date(e.election.closes)}</span> : <span class="muted small">{t('x_el_last')} {date(e.lastElection)}</span>}>
        <div class="muted small">{e.election ? t('x_el_open_hint') : t('x_el_next_hint')}</div>
        {e.candidates.map((c: any) => <div class="kv"><span class="k"><NLink id={c.id} /></span><span class="v">{c.votes} / {e.electors.length} {e.elector && e.election && <Btn disabled={e.election.myVote === c.id ? t('x_el_voted') : null} onClick={() => doAct({ t: 'empire', action: 'vote', target: c.id })}>{t('x_el_vote')}</Btn>}</span></div>)}
        <div class="sub-h">{t('electors')}</div>
        {e.electorViews.map((x: any) => <div class="kv"><span class="k"><NLink id={x.id} size={14} /></span><span class="v">
          <Tip content={() => <div>{x.choice >= 0 ? <Reasons2 title={t('x_el_why')} rows={x.rows} /> : <div class="muted">{t('x_el_undecided')}</div>}{x.forMe && <Reasons2 title={t('x_el_for_us')} rows={x.forMe} />}</div>}>
            <span class="has-tip">→ {x.choice >= 0 ? <NLink id={x.choice} size={14} /> : '?'}</span>
          </Tip>
          {e.isMember && !x.human && x.id !== pid && <Btn tip={<div>{t('x_el_campaign_hint')}<div class="muted">{t('cost')}: {num(e.campaignCost)} · {t('x_el_gifts')} {x.favour}/60</div></div>} onClick={() => doAct({ t: 'empire', action: 'campaign', target: x.id })}>{t('x_el_campaign')}</Btn>}
        </span></div>)}
      </Section>
    </div>
    <Section title={t('x_diet_title')} id="emp-diet" right={e.diet ? <span class="tag">{t('x_diet_session')} {date(e.diet.ends)}</span> : null}>
      <div class="reforms">{e.reformList.map((r: any, i: number) => <Tip content={<div><TipHead name={L(r.name)} value={`${t('x_diet_needs')} ${r.cost}`} /><div>{L(r.desc)}</div></div>}>
        <div class={`kv ${r.passed ? 'pos' : ''}`}><span class="k">{i + 1}. {L(r.name)}</span><span class="v">{r.passed ? '✓' : e.next?.id === r.id ? `${t('x_diet_next')} · ${r.cost}` : r.cost}</span></div>
      </Tip>)}</div>
      {e.next && <>
        <Row k={t('x_diet_tally')} v={<span>{num(e.dietTally.yes)} : {num(e.dietTally.no)} / {num(e.dietTally.total)} {e.dietTally.passes ? '✓' : '✗'}</span>}
          tip={() => <div><TipHead name={t('x_diet_tally')} hint={t('x_diet_rule')} />{e.dietTally.votes.map((v: any) => <div class="kv"><span class="k"><NLink id={v.id} size={12} /></span><span class="v">{v.v > 0 ? t('yes') : v.v < 0 ? t('no') : '?'} ×{v.weight}</span></div>)}</div>} />
        {e.isMember && e.next.stance.length > 0 && <Row k={t('x_diet_our_stance')} v={signed(sum(e.next.stance), 0)} tip={() => <Reasons2 title={L(e.next.name)} rows={e.next.stance} />} />}
        <div class="btn-row">
          {e.isEmperor && !e.diet && <Btn disabled={e.dietReady ? `${t('x_diet_ready')} ${date(e.dietReady)}` : e.authority < e.next.cost ? t('x_diet_need_auth') : null} onClick={() => doAct({ t: 'empire', action: 'summon_diet' })}>{t('x_diet_summon')}</Btn>}
          {e.diet && e.isMember && <><Btn disabled={e.diet.mine === 1 ? t('x_el_voted') : null} onClick={() => doAct({ t: 'empire', action: 'diet_vote', yes: true })}>{t('x_diet_for')}</Btn><Btn disabled={e.diet.mine === -1 ? t('x_el_voted') : null} onClick={() => doAct({ t: 'empire', action: 'diet_vote', yes: false })}>{t('x_diet_against')}</Btn></>}
          {e.diet && e.isEmperor && <span class="muted small">{t('x_diet_lobby_hint')}</span>}
        </div>
      </>}
    </Section>
    {(e.calls.length > 0 || e.orders.length > 0 || e.internalWars.length > 0) && <Section title={t('x_emp_peace_title')} id="emp-peace">
      {e.calls.map((c: any) => <div class="kv"><span class="k">{t('x_emp_call')}: <NLink id={c.attacker} size={14} /> → <NLink id={c.member} size={14} /></span><span class="v">
        <Tip content={() => <Reasons2 title={t('x_emp_ai_would')} rows={c.rows} />}><span class="has-tip muted">{date(c.until)}</span></Tip>
        {e.isEmperor && <><Btn onClick={() => doAct({ t: 'empire', action: 'defend', war: c.war })}>{t('x_emp_defend')}</Btn><Btn onClick={() => doAct({ t: 'empire', action: 'refuse', war: c.war })}>{t('x_emp_refuse')}</Btn></>}
      </span></div>)}
      {e.orders.map((o: any) => <div class="kv"><span class="k">{t('x_emp_order')}: <NLink id={o.to} size={14} /></span><span class="v">
        <Tip content={() => <Reasons2 title={t('x_emp_obey_why')} rows={o.rows} />}><span class="has-tip muted">{date(o.until)}</span></Tip>
        {o.to === pid && <><Btn onClick={() => doAct({ t: 'empire', action: 'comply', war: o.war, yes: true })}>{t('x_emp_obey')}</Btn><Btn onClick={() => doAct({ t: 'empire', action: 'comply', war: o.war, yes: false })}>{t('x_emp_defy')}</Btn></>}
      </span></div>)}
      {e.internalWars.map((x: any) => <div class="kv"><span class="k">{L(x.name)}</span><span class="v">{e.isEmperor && <Btn disabled={x.ordered ? t('x_emp_ordered') : null} tip={t('x_emp_order_hint')} onClick={() => doAct({ t: 'empire', action: 'order_peace', war: x.id })}>{t('x_emp_order_peace')}</Btn>}</span></div>)}
    </Section>}
    {e.league && <Section title={L(e.league.name)} id="emp-league">
      <div class="muted small">{t('x_league_hint')}</div>
      <Row k={t('x_league_leader')} v={e.league.leader >= 0 ? <NLink id={e.league.leader} /> : '—'} />
      <Row k={t('x_emp_members')} v={e.league.members.length} tip={<NList ids={e.league.members} size={14} />} />
      <NList ids={e.league.members.slice(0, 16)} size={14} />
      <Tip content={<Effects title={t('x_league_gives')} fx={e.league.effects} />}><div class="muted small has-tip">{t('x_league_gives')} ⓘ</div></Tip>
      <div class="btn-row">
        {e.league.member ? <Btn onClick={() => doAct({ t: 'league', action: 'leave' })}>{t('x_league_leave')}</Btn>
          : <Btn disabled={e.league.eligible ? null : t('x_league_not_eligible')} onClick={() => doAct({ t: 'league', action: 'join' })}>{t('x_league_join')}</Btn>}
      </div>
    </Section>}
  </div>;
}

function PowersView() {
  const pid = playerId.value;
  const [g, refresh] = useQuery<any>({ q: 'powers' }, [pid], 1500);
  if (!g) return <Empty>{t('loading')}…</Empty>;
  const doAct = async (c: any) => { await act(c); refresh(); };
  return <div>
    <Section title={t('x_gp_ranking')} id="gp-rank">
      <div class="muted small">{t('x_gp_hint')}</div>
      {g.ranking.map((x: any) => <div class={`kv ${x.gp ? 'pos' : ''}`}><span class="k">{x.rank}. <NLink id={x.id} size={14} />{x.gp && <span class="tag">{t('x_gp_badge')}</span>}{x.alarm && <span class="tag warn">{t('x_gp_alarm')}</span>}</span>
        <span class="v"><Tip content={() => <div><Parts title={t('x_gp_score_from')} rows={x.parts} total={x.score} digits={0} /><div class="muted">{t('x_gp_growth')}: {signed((x.growth - 1) * 100, 0)} % {x.growth >= g.rising ? `(${t('x_gp_rising')})` : ''}</div></div>}><span class="has-tip">{num(x.score)}</span></Tip></span></div>)}
    </Section>
    <div class="cols2">
      <Section title={t('x_gp_gives')} id="gp-gives">
        <Effects fx={g.effects} />
        <div class="small">{t('x_gp_gives_regard').replace('{n}', String(g.regard))}</div>
        <div class="small">{t('x_gp_gives_intervene')}</div>
        <div class="small">{t('x_gp_gives_alarm')}</div>
      </Section>
      <Section title={t('x_gp_protection')} id="gp-prot">
        {g.isGP ? <>
          <Row k={t('x_gp_protecting')} v={g.protecting.length} tip={<NList ids={g.protecting} size={14} />} />
          {g.petitions.map((p: any) => <div class="kv"><span class="k"><NLink id={p.from} size={14} /> {t('x_gp_asks')}</span><span class="v">
            <Tip content={() => <Reasons2 title={t('x_gp_ai_would')} rows={p.rows} />}><span class="has-tip muted">{date(p.until)}</span></Tip>
            <Btn onClick={() => doAct({ t: 'powers', action: 'protect', target: p.from })}>{t('x_gp_protect')}</Btn><Btn onClick={() => doAct({ t: 'powers', action: 'decline', target: p.from })}>{t('x_gp_decline')}</Btn>
          </span></div>)}
          {!g.petitions.length && <div class="muted small">{t('x_gp_no_petitions')}</div>}
        </> : g.protectors.map((p: any) => <div class="kv"><span class="k"><NLink id={p.id} size={14} /></span><span class="v">
          <Tip content={() => <Reasons2 title={t('x_gp_would_protect')} rows={p.rows} />}><span class={`has-tip ${sum(p.rows) > 0 ? 'pos' : 'neg'}`}>{signed(sum(p.rows), 0)}</span></Tip>
          {p.has ? <span class="tag">{t('x_gp_protected')}</span> : <Btn disabled={p.asked ? t('x_gp_asked') : null} onClick={() => doAct({ t: 'powers', action: 'seek_protection', target: p.id })}>{t('x_gp_seek')}</Btn>}
        </span></div>)}
      </Section>
    </div>
    <Section title={t('x_gp_wars')} id="gp-wars">
      {g.wars.length ? g.wars.map((x: any) => <div class="kv"><span class="k"><NLink id={x.att} size={14} /> ⚔ <NLink id={x.def} size={14} /></span><span class="v">
        <Tip content={() => <Reasons2 title={t('x_gp_threat')} rows={x.threat} />}><span class={`has-tip ${sum(x.threat) > 0 ? 'neg' : 'muted'}`}>{sum(x.threat) > 0 ? t('x_gp_threatened') : t('x_gp_balanced')}</span></Tip>
        {g.isGP && !x.mine && <><Btn tip={() => <Reasons2 title={t('x_gp_ai_would')} rows={x.intervene ?? []} />} onClick={() => doAct({ t: 'powers', action: 'intervene', war: x.id })}>{t('x_gp_intervene')}</Btn>
          <Btn tip={() => <Reasons2 title={t('x_gp_would_accept')} rows={x.mediation ?? []} />} onClick={() => doAct({ t: 'powers', action: 'mediate', war: x.id })}>{t('x_gp_mediate')}</Btn></>}
      </span></div>) : <div class="muted small">{t('none')}</div>}
    </Section>
    {g.log.length > 0 && <Section title={t('x_gp_log')} id="gp-log">
      {g.log.map((l: any) => <div class="kv small"><span class="k">{date(l.day)} <NLink id={l.gp} size={12} /></span><span class="v">{t(`x_gp_log_${l.kind}`)} <NLink id={l.side} size={12} /></span></div>)}
    </Section>}
  </div>;
}
