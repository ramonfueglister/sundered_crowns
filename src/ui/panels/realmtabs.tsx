// Diplomacy, military, knowledge, society and decisions tabs of the main panel.
import { GoalTree } from './goals';
import { useEffect, useState } from 'preact/hooks';
import { sim, view, nations } from '../../game/client';
import { playerId, openPanel, realmDialog } from '../store';
import { Section, Row, Bar, Btn, Empty, NLink, NList, Effects, LocName, useQuery, act, t, L, num, signed, pct, Tip, Breakdown, Reasons, realm, daysText, locName, namesVersion, selectArmy, selectLoc, fmtDateShort, Coa, placeName } from './common';
import { sfx } from '../audio';
import { EnvoysTip, PrestigeTip, DreadTip, ManpowerTip, WarExhaustionTip, ResearchTip, DoctrineTip, AgentsTip, ColoniesTip, TipHead, Parts } from './explain';
import { keyName } from '../TopBar';
import { errText } from '../i18n';
import { RecentBattles } from './war';
import { charName } from './people';

// ---------------------------------------------------------------- wars (shared)
/** Tooltip body: war score and its parts from the player's side. */
export function WarScoreTip({ w, pid }: { w: any; pid: number }) {
  const sign = w.def.includes(pid) ? -1 : 1; const p = w.parts;
  const total = w.score * sign;
  return <div>
    {p ? <Breakdown title={`${t('war_score')} · ${t('ws_us')}`} digits={1} total={total}
      rows={[[t('ws_battles'), p.battles * sign], [t('ws_occupation'), p.occupation * sign], [t('ws_capital'), p.capital * sign], [t('ws_ticking'), p.ticking * sign], [t('xw_ws_blockade'), (p.blockade ?? 0) * sign]]} />
      : <div><b>{t('war_score')}</b> {signed(total)}</div>}
    {p && Math.abs(p.battles + p.occupation + p.capital + p.ticking + (p.blockade ?? 0)) > 100 && <div class="muted">{t('ws_capped')}</div>}
    <div class="muted">{t('war_score_hint')}</div>
  </div>;
}

export function WarCard({ w, inPeace }: { w: any; inPeace?: boolean }) {
  const pid = playerId.value;
  const us = w.att.includes(pid) ? 'att' : w.def.includes(pid) ? 'def' : null;
  const sc = us === 'def' ? -w.score : w.score;
  const offers = w.offers.filter((o: any) => o.to === pid);
  return <div class="war-card">
    <div class="war-h"><b>{L(w.name)}</b>{us && <Tip content={() => <WarScoreTip w={w} pid={pid} />}><span class={`ws ${sc >= 0 ? 'pos' : 'neg'}`}>{signed(sc)}</span></Tip>}</div>
    <div class="war-sides">
      <div class="side"><NList ids={w.att} size={16} /></div>
      <div class="vs">⚔</div>
      <div class="side r"><NList ids={w.def} size={16} /></div>
    </div>
    <Tip tag="div" content={() => (us ? <WarScoreTip w={w} pid={pid} /> : <div><b>{t('war_score')}</b> {signed(w.score)}</div>)}><div class="ws-bar"><i style={{ left: '50%', width: `${Math.abs(w.score) / 2}%`, transform: w.score < 0 ? 'translateX(-100%)' : undefined, background: w.score >= 0 ? '#4d7a3a' : '#9b2a20' }} /><span class="ws-mid" /></div></Tip>
    {us && !inPeace && <div class="act-row">{offers.length > 0 && <Tip content={<div><TipHead name={t('incoming_offers')} value={offers.length} hint={t('x_offers_hint')} /></div>}><span class="badge">{offers.length} {t('offers')}</span></Tip>}<span class="spacer" /><Btn onClick={() => { sfx('open'); openPanel('peace', { war: w.id }); }}>{t('offer_peace')}…</Btn></div>}
  </div>;
}

// ---------------------------------------------------------------- diplomacy
export function DiplomacyTab() {
  const pid = playerId.value; const v = view.value; const p = v?.player;
  const [me] = useQuery<any>(pid >= 0 ? { q: 'nation', nation: pid } : null, [pid], 2000);
  if (!me || !p || !v) return <Empty>{t('loading')}…</Empty>;
  const wars = v.wars.filter((w) => w.att.includes(pid) || w.def.includes(pid));
  return <div class="tab-dip">
    <div class="stat-cards">
      <Tip content={() => <EnvoysTip />}><div class="card"><div class="card-k">{t('envoys')}</div><div class="card-v"><i class="ic envoy" /> {p.envoys - p.envoysBusy}/{p.envoys}</div><div class="card-s muted">{t('x_free_total')}</div></div></Tip>
      <Tip content={() => <PrestigeTip />}><div class="card"><div class="card-k">{t('prestige')}</div><div class="card-v"><i class="ic prestige" /> {num(p.prestige)}</div><div class="card-s muted">{signed(realm.value?.explain?.prestige.monthly ?? 0, 2)} / {t('month')}</div></div></Tip>
      <Tip content={() => <DreadTip />}><div class="card"><div class="card-k">{t('dread')}</div><div class={`card-v ${p.dread > 20 ? 'neg' : ''}`}>{num(p.dread)}</div><div class="card-s muted">{me.front.length ? <span class="neg">{t('common_front')}</span> : t('no_front_short')}</div></div></Tip>
      <Tip content={<div><TipHead name={t('allies')} value={me.allies.length} hint={t('x_allies_hint')} /></div>}><div class="card"><div class="card-k">{t('allies')}</div><div class="card-v">{me.allies.length}</div><div class="card-s muted">{t('subjects')}: {me.subjects.length}</div></div></Tip>
    </div>
    <div class="cols2">
      <Section title={t('allies')} id="dip-allies"><RelList ids={me.allies} /></Section>
      <Section title={t('rivals')} id="dip-rivals"><RelList ids={me.rivals} /></Section>
    </div>
    {me.overlord >= 0 && <Section title={t('overlord')} id="dip-over"><RelList ids={[me.overlord]} /></Section>}
    <Section title={t('subjects')} id="dip-subj">{me.subjects.length ? <><div class="subj-row subj-head"><span>{t('x_subject')}</span><span class="ld">{t('liberty_desire')}</span><span /></div>{me.subjects.map((s: number) => <SubjectRow id={s} />)}</> : <div class="muted small">{t('none')}</div>}</Section>
    <Section title={t('common_front')} id="dip-front">
      {me.front.length ? <><div class="warn-box">{t('front_against_us')}</div><RelList ids={me.front} /></> : <div class="muted small">{t('no_front')}</div>}
    </Section>
    <Section title={t('wars')} id="dip-wars">{wars.length ? wars.map((w) => <WarCard w={w} />) : <div class="muted small">{t('at_peace')}</div>}</Section>
    <Section title={t('great_powers')} id="dip-gp" open={false}><RelList ids={v.ranking.filter((x) => x !== pid)} /></Section>
  </div>;
}
function RelList({ ids }: { ids: number[] }) {
  if (!ids.length) return <div class="muted small">{t('none')}</div>;
  return <div class="rel-list">{ids.map((id) => <RelRow id={id} />)}</div>;
}
function RelRow({ id }: { id: number }) {
  const n = nations.value[id]; if (!n) return null;
  return <div class="rel-row"><NLink id={id} size={20} /><Tip content={<div><TipHead name={L(n.name)} hint={t('x_click_realm')} /><div class="breakdown"><div class="bd-row"><span>{t('development')}</span><span>{num(n.dev)}</span></div><div class="bd-row"><span>{t('locations')}</span><span>{n.locs}</span></div><div class="bd-row"><span>{t('score')}</span><span>{num(n.score)}</span></div></div></div>}><span class="muted small">{num(n.dev)} {t('dev_short')}</span></Tip></div>;
}
function SubjectRow({ id }: { id: number }) {
  const [d] = useQuery<any>({ q: 'nation', nation: id }, [id], 5000);
  const sub = d?.subject;
  const ld = sub ? Math.round(sub.libertyDesire) : null;
  return <div class="subj-row">
    <NLink id={id} size={20} />
    {ld !== null ? <Tip content={() => <div><b>{t('liberty_desire')}</b> {ld}
      <Reasons title={`${t('liberty_drift')} ${num(sub.target)}`} rows={sub.parts} total={sub.target} />
      {sub.integrating && <div>{t('integrating_now')}: {num(sub.integration)} %</div>}
      <div class="muted">{t('liberty_hint')}</div></div>}><span class="ld"><Bar value={ld} max={100} color={ld > 50 ? '#9b2a20' : '#c08a2a'} /> {ld}</span></Tip> : <span class="muted">…</span>}
    <Btn tip={t('integrate_hint')} disabled={ld !== null && ld > 50 ? 'too restless' : null} onClick={() => act({ t: 'integrate', subject: id }, 'bell')}>{t('integrate')}</Btn>
  </div>;
}

// ---------------------------------------------------------------- military
export function MilitaryTab() {
  const v = view.value; const p = v?.player; const pid = playerId.value; const r = realm.value;
  void namesVersion.value;
  if (!v || !p) return <Empty>{t('no_realm')}</Empty>;
  const mine = v.armies.filter((a) => a.owner === pid);
  const land = mine.filter((a) => !a.fleet), fleets = mine.filter((a) => a.fleet);
  const wars = v.wars.filter((w) => w.att.includes(pid) || w.def.includes(pid));
  const men = land.reduce((s, a) => s + a.men, 0), ships = fleets.reduce((s, a) => s + a.men, 0);
  const sieges = v.sieges.filter((s) => s.nation === pid);
  return <div class="tab-mil">
    <div class="stat-cards">
      <Tip content={() => <ManpowerTip />}><div class="card"><div class="card-k">{t('manpower')}</div><div class="card-v"><i class="ic men" /> {num(p.manpower)}</div><div class="card-s muted">/ {num(p.maxManpower)}</div></div></Tip>
      <Tip content={() => <SailorsTip />}><div class="card"><div class="card-k">{t('sailors')}</div><div class="card-v">{num(p.sailors)}</div><div class="card-s muted">/ {num(realm.value?.explain?.sailors.max ?? 0)}</div></div></Tip>
      <Tip content={() => <ForceTip list={land} fleet={false} />}><div class="card"><div class="card-k">{t('armies')}</div><div class="card-v">{num(men)}</div><div class="card-s muted">{land.length} {t('armies')}</div></div></Tip>
      <Tip content={() => <ForceTip list={fleets} fleet />}><div class="card"><div class="card-k">{t('fleets')}</div><div class="card-v">{num(ships)}</div><div class="card-s muted">{fleets.length} {t('fleets')}</div></div></Tip>
      <Tip content={() => <UpkeepTip />}><div class="card"><div class="card-k">{t('upkeep')}</div><div class="card-v neg">{num((p.expenseBreak.army ?? 0) + (p.expenseBreak.navy ?? 0), 1)}</div><div class="card-s muted">{t('x_per_month')}</div></div></Tip>
      <Tip content={() => <WarExhaustionTip />}><div class="card"><div class="card-k">{t('war_exhaustion')}</div><div class={`card-v ${p.warExhaustion > 20 ? 'neg' : ''}`}>{num(p.warExhaustion)}</div><div class="card-s muted">{signed(realm.value?.explain?.warExhaustion.monthly ?? 0, 2)} / {t('month')}</div></div></Tip>
    </div>
    <Section title={t('armies')} id="mil-armies">
      {land.length ? <table class="tbl"><thead><tr><th>{t('name')}</th><th>{t('location')}</th><th class="r">{t('men')}</th><th>{t('morale')}</th><th>{t('general')}</th><th>{t('status')}</th></tr></thead>
        <tbody>{land.map((a) => <tr class="click" onClick={() => selectArmy(a.id)}><td>{L(a.name)}{a.mercenary && <small class="muted"> ({t('mercenary')})</small>}</td><td>{locName(a.loc)}</td><td class="r"><Tip content={<div><TipHead name={L(a.name)} value={`${num(a.men)} ${a.fleet ? t('ships') : t('men')}`} hint={a.fleet ? t('x_fleet_men_hint') : t('x_army_men_hint')} /></div>}>{num(a.men)}</Tip></td><td><Bar value={a.morale} color="#4d7a3a" tip={<div><TipHead name={t('morale')} value={pct(a.morale)} hint={t('x_morale_hint')} /></div>} /></td><td>{charName(a.general) || <span class="muted">—</span>}</td>
          <td class="muted">{a.battle ? <span class="neg">{t('in_battle')}</span> : a.siege >= 0 ? t('besieging') : a.path.length ? <>→ {locName(a.path[a.path.length - 1])}</> : a.embarked ? t('embarked') : t('idle')}</td></tr>)}</tbody></table> : <div class="muted small">{t('no_armies')}</div>}
    </Section>
    <Section title={t('fleets')} id="mil-fleets">
      {fleets.length ? <table class="tbl"><thead><tr><th>{t('name')}</th><th>{t('location')}</th><th class="r">{t('ships')}</th><th>{t('status')}</th></tr></thead>
        <tbody>{fleets.map((a) => <tr class="click" onClick={() => selectArmy(a.id)}><td>{L(a.name)}</td><td>{locName(a.loc)}</td><td class="r"><Tip content={<div><TipHead name={L(a.name)} value={`${num(a.men)} ${a.fleet ? t('ships') : t('men')}`} hint={a.fleet ? t('x_fleet_men_hint') : t('x_army_men_hint')} /></div>}>{num(a.men)}</Tip></td><td class="muted">{a.battle ? t('in_battle') : a.path.length ? <>→ {locName(a.path[a.path.length - 1])}</> : t('idle')}</td></tr>)}</tbody></table> : <div class="muted small">{t('no_fleets')}</div>}
    </Section>
    <div class="cols2">
      <Section title={t('recruit_queue')} id="mil-queue">
        {r?.recruits?.length ? r.recruits.map((q: any) => <div class="kv"><span class="k">{L(q.unit)} · {num(q.men)}</span><span class="v"><a class="lk" onClick={() => selectLoc(q.loc)}>{placeName(q.name)}</a> · {daysText(q.left)}</span></div>) : <div class="muted small">{t('none')}</div>}
        <div class="muted small">{t('recruit_hint')}</div>
      </Section>
      <Section title={t('sieges')} id="mil-sieges">
        {sieges.length ? sieges.map((s) => <div class="kv"><span class="k"><LocName id={s.loc} /></span><span class="v"><Bar value={s.progress} max={4} color="#9b2a20" tip={<div><TipHead name={t('siege')} value={`${s.progress}/4`} hint={t('x_siege_hint')} /><div class="breakdown"><div class="bd-row"><span>{t('garrison')}</span><span>{num(s.garrison)}</span></div></div></div>} /> {s.progress}/4</span></div>) : <div class="muted small">{t('none')}</div>}
      </Section>
    </div>
    <Section title={t('wars')} id="mil-wars">{wars.length ? wars.map((w) => <WarCard w={w} />) : <div class="muted small">{t('at_peace')}</div>}</Section>
    <RecentBattles />
  </div>;
}

// ---------------------------------------------------------------- knowledge
export function KnowledgeTab() {
  const r = realm.value; const p = view.value?.player;
  if (!r || !p) return <Empty>{t('loading')}…</Empty>;
  const startedGroups = r.doctrines.filter((g: any) => g.taken > 0).length;
  const investCost = r.explain?.investCost ?? Math.max(25, (p.incomeBreak.tax || 10) * 2);
  return <div class="tab-know">
    <div class="era-box"><div class="era-k">{t('era')}</div><div class="era-v">{L(r.era?.name)}</div>
      <div class="era-steps">{r.eras.map((e: any, k: number) => <Tip content={<div><b>{L(e.name)}</b><div class="muted">{t('from_year')} {e.start} · {t('learning_level')} {e.tech}</div></div>}><span class={`era-step ${k <= p.era ? 'on' : ''}`}>{['I', 'II', 'III', 'IV'][k]}</span></Tip>)}</div>
    </div>
    <Section title={t('technology')} id="know-tech">
      <div class="branches">{r.tech.map((b: any, k: number) => { const months = b.rate > 0 ? (b.cost - b.progress) / b.rate : Infinity;
        return <div class={`branch ${r.focus === k ? 'focus' : ''}`}>
          <div class="br-h"><b>{L(b.name)}</b><Tip content={() => <ResearchTip k={k} />}><span class="br-lvl">{b.level}</span></Tip></div>
          <Bar value={b.progress} max={b.cost} color="#3a5a80" h={10} tip={() => <ResearchTip k={k} />} />
          <Tip tag="div" content={() => <ResearchTip k={k} />}><div class="br-meta muted small has-tip">{num(b.progress)} / {num(b.cost)} · {num(b.rate, 1)}/{t('month_short')} · {isFinite(months) ? `≈ ${num(months)} ${t('months')}` : '—'}</div></Tip>
          <div class="act-row">
            {r.focus === k ? <span class="tag">{t('focus')}</span> : <span />}
            <Btn tip={<div><TipHead name={r.focus === k ? t('invest') : t('set_focus')} hint={r.focus === k ? t('invest_hint') : t('x_focus_hint')} />{r.focus === k && <div class="breakdown"><div class="bd-row"><span>{t('cost')}</span><span>{num(investCost)}</span></div><div class="bd-row"><span>{t('progress')}</span><span class="pos">+{num(b.cost * 0.25)}</span></div></div>}{r.focus === k && (r.explain?.investUntil?.[k] ?? 0) > (view.value?.day ?? 0) && <div class="neg">{t('x_again_from')} {fmtDateShort(r.explain.investUntil[k], view.value?.startYear ?? 1356)}</div>}</div>}
              disabled={r.focus === k && ((r.explain?.investUntil?.[k] ?? 0) > (view.value?.day ?? 0) ? 'too soon' : (p.treasury < investCost ? 'not enough gold' : null))} onClick={() => act({ t: 'tech', branch: k }, 'page')}>{r.focus === k ? t('invest') : t('set_focus')}</Btn>
          </div>
        </div>; })}</div>
    </Section>
    <Section title={t('doctrines')} id="know-doc" right={<Tip content={() => <DoctrineTip />}><span class="muted has-tip">{t('insight')}: <b>{num(r.insight)}</b> · {t('cost')} {num(r.doctrineCost)} · {startedGroups}/{r.doctrineSlots} {t('slots')}</span></Tip>}>
      <div class="doctrines">{r.doctrines.map((g: any) => {
        const locked = g.era > p.era; const done = g.taken >= g.picks.length;
        const why = done ? 'doctrine complete' : locked ? 'not yet in this era' : !g.taken && startedGroups >= r.doctrineSlots ? 'no free doctrine slot' : r.insight < r.doctrineCost ? 'not enough insight' : null;
        return <div class={`doc ${locked ? 'locked' : ''} ${g.taken ? 'started' : ''}`}>
          <div class="doc-h"><Tip content={<div><b>{L(g.name)}</b><div class="muted">{L(g.desc)}</div><div>{t('era')}: {['I', 'II', 'III', 'IV'][g.era]}</div></div>}><b>{L(g.name)}</b></Tip><Tip content={<div><TipHead name={L(g.name)} value={`${g.taken}/${g.picks.length}`} hint={t('x_doc_group_hint')} /></div>}><span class="muted small">{g.taken}/{g.picks.length}</span></Tip></div>
          <div class="doc-picks">{g.picks.map((pk: any, i: number) => <Tip content={() => <div><Effects title={L(pk.name)} fx={pk.effects} />{pk.desc && <div class="muted">{L(pk.desc)}</div>}</div>}><span class={`pick ${i < g.taken ? 'on' : i === g.taken ? 'next' : ''}`}>{i + 1}</span></Tip>)}</div>
          {!done && <Btn disabled={why} tip={g.picks[g.taken] ? <div>{t('next')}: {L(g.picks[g.taken].name)}</div> : undefined} onClick={() => act({ t: 'doctrine', group: g.id }, 'bell')}>{t('take')}</Btn>}
        </div>; })}</div>
    </Section>
    <Section title={t('innovations')} id="know-inno">
      {r.innovations.length ? <div class="innos">{r.innovations.map((x: any) => <Tip content={<div><b>{L(x.name)}</b><div class="muted">{L(x.desc)}</div></div>}><div class={`inno ${x.adopted ? 'on' : x.reachedCapital ? 'near' : ''}`}><span>{x.adopted ? '✔' : x.reachedCapital ? '◐' : '○'}</span>{L(x.name)}</div></Tip>)}</div> : <div class="muted small">{t('no_innovations')}</div>}
      <div class="muted small">{t('innovation_hint')}</div>
    </Section>
  </div>;
}

// ---------------------------------------------------------------- society
export function SocietyTab() {
  const r = realm.value; const v = view.value; const pid = playerId.value;
  const [mix, setMix] = useState<{ faith: [string, number][]; culture: [string, number][]; total: number } | null>(null);
  useEffect(() => {
    let live = true; const o = v?.owner; if (!o || pid < 0) return;
    const locs: number[] = []; for (let i = 0; i < o.length; i++) if (o[i] === pid) locs.push(i);
    Promise.all(locs.slice(0, 400).map((l) => sim().query<any>({ q: 'loc', loc: l }))).then((ds) => {
      if (!live) return;
      const f = new Map<string, number>(), c = new Map<string, number>(); let tot = 0;
      for (const d of ds) { if (!d || d.sea || d.unknown) continue; const pop = d.pops.reduce((p: number, x: any) => p + x.pop, 0); tot += pop; const fk = L(d.faith), ck = L(d.culture); f.set(fk, (f.get(fk) || 0) + pop); c.set(ck, (c.get(ck) || 0) + pop); }
      setMix({ faith: [...f.entries()].sort((a, b) => b[1] - a[1]), culture: [...c.entries()].sort((a, b) => b[1] - a[1]), total: tot });
    });
    return () => { live = false; };
  }, [pid, Math.floor((v?.day ?? 0) / 90)]);
  if (!r || !v) return <Empty>{t('loading')}…</Empty>;
  const me = nations.value[pid];
  return <div class="tab-soc">
    <div class="cols2">
      <Section title={t('faiths_realm')} id="soc-faith">{mix ? <Mix rows={mix.faith} total={mix.total} /> : <Empty>{t('loading')}…</Empty>}</Section>
      <Section title={t('cultures_realm')} id="soc-cult">{mix ? <Mix rows={mix.culture} total={mix.total} /> : <Empty>{t('loading')}…</Empty>}</Section>
    </div>
    <div class="cols2">
      <Section title={t('agents')} id="soc-agents" right={<Tip content={() => <AgentsTip />}><span class="muted has-tip">{r.agents.length}/{r.agentSlots}</span></Tip>}>
        {r.agents.length ? r.agents.map((a: any) => <div class="kv"><span class="k">{a.kind === 'faith' ? '✝' : '✒'} <a class="lk" onClick={() => selectLoc(a.loc)}>{placeName(a.name)}</a></span><span class="v"><Bar value={a.progress} max={100} color="#3a5a80" /></span></div>) : <div class="muted small">{t('agents_none')}</div>}
      </Section>
      <Section title={t('colonies')} id="soc-col" right={<Tip content={() => <ColoniesTip />}><span class="muted has-tip">{r.colonies.length}/{r.colonySlots}</span></Tip>}>
        {r.colonies.length ? r.colonies.map((c: any) => <div class="kv"><span class="k"><a class="lk" onClick={() => selectLoc(c.loc)}>{placeName(c.name)}</a></span><span class="v">{num(c.settlers)} {t('settlers')} · <Bar value={c.progress} max={100} color="#4d7a3a" /></span></div>) : <div class="muted small">{r.colonySlots ? t('colonies_none') : t('colonies_locked')}</div>}
      </Section>
    </div>
    <Section title={t('situations')} id="soc-sit">
      {r.situations.filter((s: any) => s.active).length ? r.situations.filter((s: any) => s.active).map((s: any) => <div class="situation">
        <div class="sit-h"><b>{L(s.name)}</b>{s.stageName && <span class="tag">{L(s.stageName)}</span>}<span class="muted small">{t('since')} {fmtDateShort(s.started, v.startYear)}</span><Btn tip={t('x_sit_open_hint')} onClick={() => { realmDialog.value = { kind: 'situation', id: s.id }; }}>{t('x_sit_open')}</Btn></div>
        <div class="muted small">{L(s.desc)}</div>
        <Bar value={s.progress} max={100} color="#7a4e1c" tip={<div>{t('progress')}: {num(s.progress)}</div>} />
      </div>) : <div class="muted small">{t('no_situations')}</div>}
    </Section>
    <div class="cols2">
      <Section title={t('empire')} id="soc-emp">
        <Row k={t('emperor')} v={r.empire.emperor >= 0 ? <NLink id={r.empire.emperor} /> : '—'} />
        <Row k={t('imperial_authority')} v={num(r.empire.authority)} tip={<div><TipHead name={t('imperial_authority')} value={num(r.empire.authority)} hint={t('x_imperial_authority_hint')} /></div>} />
        <Bar value={r.empire.authority} max={100} color="#c9a24a" />
        <Row k={t('electors')} v={<NList ids={r.empire.electors} size={14} />} />
        {me && <div class="muted small">{nations.value[pid] && (r.empire.electors.includes(pid) ? t('you_elector') : '')}</div>}
        <Btn onClick={() => openPanel('empire')}>{t('x_emp_open')}</Btn>
      </Section>
      <Section title={t('papacy')} id="soc-pap">
        <Row k={t('holy_see')} v={r.papacy.holder >= 0 ? <NLink id={r.papacy.holder} /> : '—'} />
        <Row k={t('curia_favour')} v={num(r.papacy.favour)} tip={t('curia_hint')} />
        {r.papacy.schism && <div class="warn-box">{t('schism')}</div>}
      </Section>
    </div>
  </div>;
}
function Mix({ rows, total }: { rows: [string, number][]; total: number }) {
  const cols = ['#7a4e1c', '#3a5a80', '#9b2a20', '#4d7a3a', '#76306f', '#c08a2a', '#4a4a4a'];
  return <div class="mix">
    <div class="mix-bar">{rows.slice(0, 7).map(([, v], i) => <i style={{ width: `${(v / Math.max(1, total)) * 100}%`, background: cols[i] }} />)}</div>
    {rows.slice(0, 7).map(([k, v], i) => <Row k={<><span class="sw" style={{ background: cols[i] }} /> {k}</>} v={pct(v / Math.max(1, total))} tip={<div><TipHead name={k} value={pct(v / Math.max(1, total), 1)} /><div class="breakdown"><div class="bd-row"><span>{t('population')}</span><span>{num(v)}</span></div><div class="bd-row"><span>{t('x_of_realm')}</span><span>{num(total)}</span></div></div></div>} />)}
    {rows.length > 7 && <div class="muted small">+{rows.length - 7} {t('more')}</div>}
  </div>;
}

// ---------------------------------------------------------------- decisions
export function DecisionsTab() {
  const r = realm.value;
  if (!r) return <Empty>{t('loading')}…</Empty>;
  const ds = r.decisions as any[];
  const ok = ds.filter((d) => !d.why), no = ds.filter((d) => d.why);
  const card = (d: any) => <div class={`decision ${d.why ? 'blocked' : 'ready'}`}>
    <div class="dec-h"><b>{L(d.name)}</b>{d.why ? <span class="neg small">✘ {errText(d.why)}</span> : <span class="pos small">✔ {t('possible')}</span>}</div>
    <div class="dec-b"><div class="dec-d">{L(d.desc)}</div><Btn small={false} disabled={d.why} cls={d.why ? '' : 'gold'} onClick={() => act({ t: 'decision', id: d.id }, 'bell', t('decision_taken'))}>{t('enact')}</Btn></div>
  </div>;
  return <div class="tab-dec">
    <GoalTree goals={r.goals ?? []} />
    <Section title={<>{t('x_decisions')} <Tip content={<div><TipHead name={t('x_decisions')} value={`${ok.length} / ${ds.length}`} hint={t('x_decisions_hint')} /></div>}><small>({ok.length} {t('possible')})</small></Tip></>} id="dec-list">
      {!ds.length && <Empty>{t('no_decisions')}</Empty>}
      {ok.map(card)}{no.map(card)}
    </Section>
  </div>;
}

void Coa; void signed;

/** Sailors: from labourers of coastal locations, harbours raise them. */
function SailorsTip() {
  const p = view.value?.player; const e = realm.value?.explain; if (!p) return null;
  return <div><TipHead name={t('sailors')} value={`${num(p.sailors)} / ${num(e?.sailors.max ?? 0)}`} hint={t('x_sailors_hint')} />
    {e && <div class="tip-drift"><span>{t('x_recovery')}</span><span class="pos">+{num(e.sailors.monthly)} {t('x_per_month')}</span></div>}</div>;
}
/** All armies or fleets with their strength. */
function ForceTip({ list, fleet }: { list: any[]; fleet: boolean }) {
  const total = list.reduce((p, a) => p + a.men, 0);
  return <div><TipHead name={t(fleet ? 'fleets' : 'armies')} value={num(total)} />
    <Parts rows={list.slice(0, 12).map((a) => [`${L(a.name)} · ${locName(a.loc)}`, a.men] as [string, number])} fmt={(v) => num(v)} total={total} />
    {list.length > 12 && <div class="muted">+{list.length - 12}</div>}</div>;
}
/** Upkeep of army and navy and what changes it. */
function UpkeepTip() {
  const p = view.value?.player; const e = realm.value?.explain; if (!p) return null;
  return <div><TipHead name={t('upkeep')} value={num((p.expenseBreak.army ?? 0) + (p.expenseBreak.navy ?? 0), 1)} />
    <Parts rows={[[keyName('army'), p.expenseBreak.army ?? 0], [keyName('navy'), p.expenseBreak.navy ?? 0], [keyName('fortresses'), p.expenseBreak.fortresses ?? 0]]} fmt={(v) => num(v, 1)} bad />
    <div class="breakdown"><div class="bd-row"><span>{t('army_maint')}</span><span>{pct(p.armyMaint)}</span></div><div class="bd-row"><span>{t('navy_maint')}</span><span>{pct(p.navyMaint)}</span></div></div>
    {e?.armyCost?.length > 0 && <Parts title={t('x_army_cost_mods')} rows={e.armyCost} fmt={(x) => `${signed(x * 100, 0)} %`} bad />}
    <div class="muted">{t('kh_army')}</div></div>;
}
