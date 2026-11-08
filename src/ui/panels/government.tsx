// Government tab: ruler, laws and reforms, Powers of the Realm, council, value axes, active modifiers.
import { useState } from 'preact/hooks';
import { view } from '../../game/client';
import { playerId } from '../store';
import { VALUES } from '../../sim/content/laws';
import { Section, Row, Bar, Btn, Empty, Effects, useQuery, act, t, L, num, signed, pct, Tip, fmtDateShort, realm, daysText } from './common';
import { traitName, govName, rankName } from './nation';

const SK = ['skill_gov', 'skill_dip', 'skill_mil'];
const estColor = (c: number) => (c < 30 ? '#a8331f' : c < 50 ? '#c08a2a' : '#4d8a3a');

export function GovernmentTab() {
  const r = realm.value; const p = view.value?.player; const pid = playerId.value;
  const [me] = useQuery<any>(pid >= 0 ? { q: 'nation', nation: pid } : null, [pid], 5000);
  if (!r || !p) return <Empty>{t('loading')}…</Empty>;
  return <div class="tab-gov">
    <div class="cols2">
      <Section title={t('ruler')} id="gov-ruler">
        <div class="ruler-big">
          <div class="ruler-name">{p.ruler}</div>
          <div class="muted">{p.rulerAge} {t('years_old')}{me && <> · {rankName(me.rank)} · {govName(me.gov)}</>}</div>
          {me?.ruler && <div class="skills">{me.ruler.skills.map((s: number, k: number) => <Tip content={t(SK[k])}><span class="skill"><i class={`sk sk${k}`} />{t(SK[k])} <b>{s}</b></span></Tip>)}</div>}
          {me?.ruler?.traits?.length > 0 && <div class="chips">{me.ruler.traits.map((x: string) => <span class="chip">{traitName(x)}</span>)}</div>}
          <Row k={t('heir')} v={p.heir} />
        </div>
      </Section>
      <Section title={t('standing')} id="gov-standing">
        <Row k={t('concord')} v={<span class={p.concord < 0 ? 'neg' : ''}>{signed(p.concord)}</span>} tip={<div><b>{t('concord')}</b><div class="muted">{t('concord_hint')}</div></div>} />
        <Bar value={p.concord} min={-100} max={100} mid color={p.concord < 0 ? '#a8331f' : '#4d8a3a'} />
        <Row k={t('mandate')} v={num(p.mandate)} tip={<div><b>{t('mandate')}</b><div class="muted">{t('mandate_hint')}</div></div>} />
        <Bar value={p.mandate} max={100} color="#7a2a7a" />
        <Row k={t('authority')} v={num(p.authority)} tip={<div><b>{t('authority')}</b><div class="muted">{t('authority_hint')}</div></div>} />
        <Row k={t('prestige')} v={num(p.prestige)} />
        <Row k={t('corruption')} v={pct(p.corruption, 1)} />
        <Row k={t('dread')} v={num(p.dread)} tip={t('dread_hint')} />
      </Section>
    </div>
    <Laws r={r} authority={p.authority} />
    <Estates r={r} />
    <div class="cols2">
      <Section title={t('council')} id="gov-council">
        {r.council.map((o: any) => <div class="council-row">
          <span class="k">{L(o.name)}</span>
          {o.char ? <Tip content={<div><b>{o.char.name}</b><div>{SK.map((k, i) => `${t(k)} ${o.char.skills[i]}`).join(' · ')}</div>{o.char.loyalty !== undefined && <div>{t('loyalty')}: {num(o.char.loyalty * (o.char.loyalty <= 1 ? 100 : 1))}</div>}{o.char.corruption !== undefined && <div>{t('corruption')}: {pct(o.char.corruption)}</div>}<div class="muted">{t('council_bonus')}: {signed(o.bonus * 100, 1)} %</div></div>}>
            <span class="v">{o.char.name} <small class="muted">({o.char.skills.join('/')})</small></span>
          </Tip> : <span class="v muted">{t('vacant')}</span>}
        </div>)}
        <div class="muted small">{t('council_hint')}</div>
      </Section>
      <Section title={t('values')} id="gov-values">
        {VALUES.map((a, k) => { const val = r.values[k] || 0; const fx = val < 0 ? a.effectsLow : a.effectsHigh; const s = Math.abs(val) / 100;
          return <Tip tag="div" content={() => <div><b>{L(val < 0 ? a.low : a.high)}</b> ({signed(val)})<Effects fx={Object.fromEntries(Object.entries(fx).map(([kk, x]) => [kk, x * s]))} /></div>}>
            <div class="axis"><span class={`ax-l ${val < -10 ? 'on' : ''}`}>{L(a.low)}</span><span class="ax-bar"><i class="ax-mid" /><i class="ax-dot" style={{ left: `${50 + val / 2}%` }} /></span><span class={`ax-r ${val > 10 ? 'on' : ''}`}>{L(a.high)}</span></div>
          </Tip>; })}
      </Section>
    </div>
    <Section title={t('modifiers')} id="gov-mods">
      {r.modifiers.length ? <div class="chips">{r.modifiers.map((m: any) => <Tip content={() => <div><Effects title={L(m.label)} fx={m.effects} />{m.until < 1e9 && <div class="muted">{t('until')} {fmtDateShort(m.until, view.value?.startYear ?? 1356)}</div>}</div>}><span class={`chip mod ${m.id.startsWith('doc_') ? 'doc' : m.id.startsWith('priv_') ? 'priv' : ''}`}>{L(m.label)}</span></Tip>)}</div> : <div class="muted small">{t('none')}</div>}
    </Section>
  </div>;
}

function Laws({ r, authority }: { r: any; authority: number }) {
  const [openLaw, setOpen] = useState<string | null>(null);
  const groups: Record<string, any[]> = {};
  for (const l of r.laws) (groups[l.group] ||= []).push(l);
  const reform = r.reform;
  const rlaw = reform ? r.laws.find((l: any) => l.id === reform.law) : null;
  return <Section title={t('laws')} id="gov-laws" right={<span class="muted">{t('authority')}: <b>{num(authority)}</b></span>}>
    {reform && rlaw && <div class="reform-box"><b>{t('reform_under_way')}:</b> {L(rlaw.name)} → {L(rlaw.options[reform.option]?.name)} · {daysText(reform.left)}</div>}
    <div class="law-groups">{Object.entries(groups).map(([g, laws]) => <div class="law-group">
      <div class="lg-h">{t(`lawgroup_${g}`)}</div>
      {laws.map((l: any) => { const cur = l.options[l.current]; const open = openLaw === l.id;
        return <div class={`law ${open ? 'open' : ''}`}>
          <div class="law-h" onClick={() => setOpen(open ? null : l.id)}>
            <span class="law-n">{L(l.name)}</span>
            <Tip content={() => <div><Effects title={L(cur?.name)} fx={cur?.effects} />{cur?.desc && <div class="muted">{L(cur.desc)}</div>}</div>}><span class="law-c">{L(cur?.name)}</span></Tip>
            <span class="caret">{open ? '▾' : '▸'}</span>
          </div>
          {open && <div class="law-opts">{l.options.map((o: any, k: number) => {
            const isCur = k === l.current;
            const why = isCur ? 'already in force' : o.locked ? 'not yet possible in this era' : reform ? 'a reform is already under way' : authority < o.cost ? 'not enough Authority' : null;
            return <div class={`law-opt ${isCur ? 'cur' : ''} ${o.locked ? 'locked' : ''}`}>
              <Tip content={() => <div><Effects title={L(o.name)} fx={o.effects} />{o.desc && <div class="muted">{L(o.desc)}</div>}<EstReact e={o.estates} /></div>}><span class="lo-n">{isCur ? '● ' : ''}{L(o.name)}</span></Tip>
              <span class="lo-est"><EstIcons e={o.estates} /></span>
              {!isCur && <Btn disabled={why} tip={<div>{t('reform_cost')}: {num(o.cost)} {t('authority')}</div>} onClick={() => act({ t: 'law', law: l.id, option: k }, 'bell', t('reform_started'))}>{num(o.cost)}</Btn>}
            </div>;
          })}</div>}
        </div>; })}
    </div>)}</div>
  </Section>;
}

const EST_ABBR: Record<string, string> = { magnates: '♜', prelates: '✝', burghers: '⚖', commons: '⚒' };
function EstIcons({ e }: { e: Record<string, number> }) {
  const xs = Object.entries(e || {}).filter(([, v]) => v);
  return <>{xs.map(([k, v]) => <span class={`est-ic ${v > 0 ? 'pos' : 'neg'}`} title={t(`est_${k}`)}>{EST_ABBR[k] ?? k[0]}{v > 0 ? '+' : ''}{v}</span>)}</>;
}
function EstReact({ e }: { e: Record<string, number> }) {
  const xs = Object.entries(e || {}).filter(([, v]) => v);
  if (!xs.length) return null;
  return <div><div class="bd-title">{t('estate_reactions')}</div>{xs.map(([k, v]) => <div class="bd-row"><span>{t(`est_${k}`)}</span><span class={v > 0 ? 'pos' : 'neg'}>{signed(v)} {t('contentment_short')}</span></div>)}</div>;
}

function Estates({ r }: { r: any }) {
  const p = view.value?.player;
  const appeaseCost = Math.max(20, (p?.incomeBreak?.tax || 10) * 1.5);
  return <Section title={t('estates')} id="gov-estates">
    <div class="estates">{r.estates.map((e: any) => <div class="estate">
      <div class="est-h"><span class="est-sym">{EST_ABBR[e.id]}</span><Tip content={<div><b>{L(e.name)}</b><div class="muted">{L(e.desc)}</div></div>}><b>{L(e.name)}</b></Tip></div>
      <Bar label={<>{t('influence')} <b>{num(e.influence)}</b></>} value={e.influence} max={100} color="#7a4e1c" tip={<div><b>{t('influence')}</b><div class="muted">{t('influence_hint')}</div></div>} />
      <Bar label={<>{t('contentment')} <b>{num(e.contentment)}</b></>} value={e.contentment} max={100} color={estColor(e.contentment)} tip={<div><b>{t('contentment')}</b><div class="muted">{t('contentment_hint')}</div></div>} />
      <div class="privs">{e.privileges.map((pr: any) => <div class={`priv ${pr.granted ? 'on' : ''}`}>
        <Tip content={() => <div><Effects title={L(pr.name)} fx={pr.effects} /><div class="muted">{pr.granted ? t('revoke_hint') : t('grant_hint')}</div></div>}><span class="pv-n">{pr.granted ? '✔ ' : ''}{L(pr.name)}</span></Tip>
        <Btn onClick={() => act({ t: 'estate', estate: e.id, action: pr.granted ? 'revoke' : 'grant', privilege: pr.id }, 'page')}>{pr.granted ? t('revoke') : t('grant')}</Btn>
      </div>)}</div>
      <div class="est-btns">
        <Btn tip={<div>{t('appease_hint')}<br />{t('cost')}: {num(appeaseCost)}</div>} disabled={(p?.treasury ?? 0) < appeaseCost ? 'not enough gold' : null} onClick={() => act({ t: 'estate', estate: e.id, action: 'appease' }, 'coins')}>{t('appease')}</Btn>
        <Btn tip={<div>{t('summon_hint')}<br />+{num(25 + e.influence * 0.3)} {t('authority')}</div>} onClick={() => act({ t: 'estate', estate: e.id, action: 'summon' }, 'bell')}>{t('summon')}</Btn>
      </div>
    </div>)}</div>
  </Section>;
}
