// Government tab: ruler, laws and reforms, Powers of the Realm, council, value axes, active modifiers.
import { useState } from 'preact/hooks';
import { view } from '../../game/client';
import { playerId } from '../store';
import { VALUES } from '../../sim/content/laws';
import { Section, Row, Bar, Btn, Empty, Effects, useQuery, act, t, L, num, signed, pct, Tip, fmtDateShort, realm, daysText } from './common';
import { ConcordTip, MandateTip, AuthorityTip, PrestigeTip, CorruptionTip, DreadTip, EstateTip, TipHead, Parts } from './explain';
import { keyName } from '../TopBar';
import { traitName, govName, rankName } from './nation';

const SK = ['skill_gov', 'skill_dip', 'skill_mil'];

/** Arrow with the monthly change of a value (green when it moves the good way). */
function Trend({ d, bad = false, digits = 1 }: { d?: number; bad?: boolean; digits?: number }) {
  if (d === undefined || Math.abs(d) < 0.05) return null;
  const good = bad ? d < 0 : d > 0;
  return <span class={`trend ${good ? 'pos' : 'neg'}`}>{d > 0 ? '▲' : '▼'}{num(Math.abs(d), digits)}</span>;
}
/** A standing value: name, value, monthly trend and an optional bar, all explained by one tooltip. */
function Standing({ k, v, d, tip, cls = '', bad = false, children }: { k: string; v: any; d?: number; tip: () => any; cls?: string; bad?: boolean; children?: any }) {
  return <Tip tag="div" content={tip} class="standing has-tip">
    <div class="kv"><span class="k">{k}</span><span class={`v ${cls}`}>{v} <Trend d={d} bad={bad} /></span></div>
    {children}
  </Tip>;
}
const estColor = (c: number) => (c < 30 ? '#a8331f' : c < 50 ? '#c08a2a' : '#4d8a3a');

export function GovernmentTab() {
  const r = realm.value; const p = view.value?.player; const pid = playerId.value;
  const [me] = useQuery<any>(pid >= 0 ? { q: 'nation', nation: pid } : null, [pid], 5000);
  if (!r || !p) return <Empty>{t('loading')}…</Empty>;
  const ex = r.explain;
  return <div class="tab-gov">
    <div class="cols2">
      <Section title={t('ruler')} id="gov-ruler">
        <div class="ruler-big">
          <div class="ruler-name">{p.ruler}</div>
          <div class="muted">{p.rulerAge} {t('years_old')}{me && <> · {rankName(me.rank)} · {govName(me.gov)}</>}</div>
          {me?.ruler && <div class="skills">{me.ruler.skills.map((s: number, k: number) => <Tip content={<div><TipHead name={t(SK[k])} value={s} /><div class="muted">{t(`x_skill${k}_fx`)}</div></div>}><span class="skill"><i class={`sk sk${k}`} />{t(SK[k])} <b>{s}</b></span></Tip>)}</div>}
          {me?.ruler?.traits?.length > 0 && <div class="chips">{me.ruler.traits.map((x: string) => <span class="chip">{traitName(x)}</span>)}</div>}
          <Row k={t('heir')} v={<>{p.heir}{me?.heir && <span class="muted"> · {me.heir.age} {t('years_old')}</span>}</>} tip={t('x_heir_hint')} />
        </div>
      </Section>
      <Section title={t('standing')} id="gov-standing">
        <Standing k={t('concord')} v={signed(p.concord)} cls={p.concord < 0 ? 'neg' : ''} d={ex?.concord.monthly} tip={() => <ConcordTip />}>
          <Bar value={p.concord} min={-100} max={100} mid color={p.concord < 0 ? '#a8331f' : '#4d8a3a'} />
        </Standing>
        <Standing k={t('mandate')} v={num(p.mandate)} d={ex?.mandate.monthly} tip={() => <MandateTip />}><Bar value={p.mandate} max={100} color="#7a2a7a" /></Standing>
        <Standing k={t('authority')} v={num(p.authority)} d={ex?.authority.monthly} tip={() => <AuthorityTip />} />
        <Standing k={t('prestige')} v={num(p.prestige)} d={ex?.prestige.monthly} tip={() => <PrestigeTip />} />
        <Standing k={t('corruption')} v={pct(p.corruption, 1)} cls={p.corruption > 0.1 ? 'neg' : ''} d={ex ? ex.corruption.monthly * 100 : undefined} bad tip={() => <CorruptionTip />} />
        <Standing k={t('dread')} v={num(p.dread)} cls={p.dread > 20 ? 'neg' : ''} d={ex?.dread.monthly} bad tip={() => <DreadTip />} />
      </Section>
    </div>
    <Laws r={r} authority={p.authority} />
    <Estates r={r} />
    <div class="cols2">
      <Council r={r} authority={p.authority} />
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

/** Council: current officials and, per office, the candidates at court who could replace them. */
function Council({ r, authority }: { r: any; authority: number }) {
  const [openOff, setOpen] = useState<string | null>(null);
  const cands: any[] = r.candidates ?? [];
  const cost = r.officeCost ?? 10;
  const person = (c: any, office: any, bonus: number) => <div>
    <b>{c.name}</b>{c.age !== undefined && <span class="muted"> · {c.age} {t('years_old')}</span>}
    <div>{SK.map((k, i) => <span class={i === office.skill ? 'hl' : ''}>{t(k)} {c.skills[i]}{i < 2 ? ' · ' : ''}</span>)}</div>
    {c.traits?.length > 0 && <div class="muted">{c.traits.map((x: string) => traitName(x)).join(', ')}</div>}
    {c.loyalty !== undefined && <div>{t('loyalty')}: {num(c.loyalty)}</div>}
    {c.corruption !== undefined && <div>{t('corruption')}: {pct(c.corruption)}</div>}
    <Parts title={`${t('council_bonus')}: ${L(OFFICE_FX[office.effect] ?? { en: office.effect, de: office.effect })}`} rows={[['x_office_skill', (c.skills[office.skill] / 6) * 10], ['x_corruption', -(c.skills[office.skill] / 6) * 10 * (c.corruption ?? 0)]]} total={bonus * 100} fmt={(v) => `${signed(v, 1)} %`} />
  </div>;
  return <Section title={t('council')} id="gov-council" right={<Tip content={() => <AuthorityTip />}><span class="muted has-tip">{t('authority')}: <b>{num(authority)}</b></span></Tip>}>
    {r.council.map((o: any) => { const open = openOff === o.id;
      return <div class={`council-office ${open ? 'open' : ''}`}>
        <div class="council-row">
          <span class="k">{L(o.name)}</span>
          {o.char ? <Tip content={() => person(o.char, o, o.bonus)}>
            <span class="v">{o.char.name} <small class="muted">({o.char.skills.join('/')}) · {signed(o.bonus * 100, 1)} %</small></span>
          </Tip> : <span class="v muted">{t('vacant')}</span>}
          <Btn tip={t('appoint_hint').replace('{n}', String(cost))} onClick={() => setOpen(open ? null : o.id)}>{open ? t('cancel') : o.char ? t('replace_official') : t('appoint')}</Btn>
        </div>
        {open && <div class="council-cands">
          {cands.length ? [...cands].sort((a, b) => (b.bonus?.[o.id] ?? 0) - (a.bonus?.[o.id] ?? 0)).map((c) => {
            const bonus = c.bonus?.[o.id] ?? 0; const better = bonus - (o.bonus ?? 0);
            return <div class="cand-row">
              <Tip content={() => person(c, o, bonus)}><span class="cand-n">{c.name}{c.kin && <small class="muted"> ({t('kin')})</small>}</span></Tip>
              <span class="cand-sk muted">{c.age} · {c.skills.map((x: number, i: number) => i === o.skill ? <b>{x}</b> : String(x)).reduce((acc: any[], x: any, i: number) => (i ? [...acc, '/', x] : [x]), [])}</span>
              <span class={`cand-b ${better > 0.0005 ? 'pos' : better < -0.0005 ? 'neg' : 'muted'}`}>{signed(bonus * 100, 1)} %</span>
              <Btn disabled={authority < cost ? 'not enough Authority' : null} tip={<div>{t('appoint_hint').replace('{n}', String(cost))}</div>}
                onClick={() => act({ t: 'office', office: o.id, char: c.id }, 'bell', `${t('appointed')}: ${c.name}`).then((res) => { if (res.ok) setOpen(null); })}>{t('appoint')}</Btn>
            </div>;
          }) : <div class="muted small">{t('no_candidates')}</div>}
        </div>}
      </div>; })}
    <div class="muted small">{t('council_hint')}</div>
  </Section>;
}
const OFFICE_FX: Record<string, { en: string; de: string }> = {
  diplomacy: { en: 'diplomacy', de: 'Diplomatie' }, tax: { en: 'taxes', de: 'Steuern' }, discipline: { en: 'discipline', de: 'Disziplin' },
  conversion: { en: 'conversion', de: 'Bekehrung' }, spy: { en: 'espionage', de: 'Spionage' },
};

function Laws({ r, authority }: { r: any; authority: number }) {
  const [openLaw, setOpen] = useState<string | null>(null);
  const groups: Record<string, any[]> = {};
  for (const l of r.laws) (groups[l.group] ||= []).push(l);
  const reform = r.reform;
  const rlaw = reform ? r.laws.find((l: any) => l.id === reform.law) : null;
  return <Section title={t('laws')} id="gov-laws" right={<Tip content={() => <AuthorityTip />}><span class="muted has-tip">{t('authority')}: <b>{num(authority)}</b></span></Tip>}>
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
              {!isCur && <Btn disabled={why} tip={<div><TipHead name={t('reform_cost')} value={`${num(o.cost)} ${t('authority')}`} /><Parts rows={[['x_base', 40], ['x_reform_steps', o.cost - 40]]} total={o.cost} digits={0} bad /><div class="muted">{t('x_reform_time')}</div></div>} onClick={() => act({ t: 'law', law: l.id, option: k }, 'bell', t('reform_started'))}>{num(o.cost)}</Btn>}
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
  const p = view.value?.player; const ex = r.explain; const day = view.value?.day ?? 0;
  const appeaseCost = ex?.appeaseCost ?? Math.max(20, (p?.incomeBreak?.tax || 10) * 1.5);
  const appUntil = (id: string) => ex?.estates?.find((q: any) => q.id === id)?.appeaseUntil ?? 0;
  return <Section title={t('estates')} id="gov-estates">
    <div class="estates">{r.estates.map((e: any) => <div class="estate">
      <div class="est-h"><span class="est-sym">{EST_ABBR[e.id]}</span><Tip content={<div><b>{L(e.name)}</b><div class="muted">{L(e.desc)}</div></div>}><b>{L(e.name)}</b></Tip></div>
      <Bar label={<>{t('influence')} <b>{num(e.influence)}</b></>} value={e.influence} max={100} color="#7a4e1c" tip={() => <EstateTip e={e} kind="influence" />} />
      <Bar label={<>{t('contentment')} <b>{num(e.contentment)} <Trend d={ex?.estates?.find((q: any) => q.id === e.id)?.contentMonthly} /></b></>} value={e.contentment} max={100} color={estColor(e.contentment)} tip={() => <EstateTip e={e} kind="contentment" />} />
      <div class="privs">{e.privileges.map((pr: any) => <div class={`priv ${pr.granted ? 'on' : ''}`}>
        <Tip content={() => <div><Effects title={L(pr.name)} fx={pr.effects} /><div class="muted">{pr.granted ? t('revoke_hint') : t('grant_hint')}</div></div>}><span class="pv-n">{pr.granted ? '✔ ' : ''}{L(pr.name)}</span></Tip>
        <Btn onClick={() => act({ t: 'estate', estate: e.id, action: pr.granted ? 'revoke' : 'grant', privilege: pr.id }, 'page')}>{pr.granted ? t('revoke') : t('grant')}</Btn>
      </div>)}</div>
      <div class="est-btns">
        <Btn tip={<div>{t('appease_hint')}<div class="breakdown"><div class="bd-row"><span>{t('cost')}</span><span>{num(appeaseCost)} = max(20, 1,5 × {keyName('tax')})</span></div><div class="bd-row"><span>{t('contentment')}</span><span class="pos">+12</span></div></div>{appUntil(e.id) > day && <div class="neg">{t('x_again_from')} {fmtDateShort(appUntil(e.id), view.value?.startYear ?? 1356)}</div>}</div>}
          disabled={appUntil(e.id) > day ? 'too soon' : (p?.treasury ?? 0) < appeaseCost ? 'not enough gold' : null} onClick={() => act({ t: 'estate', estate: e.id, action: 'appease' }, 'coins')}>{t('appease')}</Btn>
        <Btn tip={<div>{t('summon_hint')}<div class="breakdown"><div class="bd-row"><span>{t('authority')}</span><span class="pos">+{num(25 + e.influence * 0.3)} = 25 + 0,3 × {t('influence')}</span></div><div class="bd-row"><span>{t('contentment')}</span><span class="neg">−8</span></div><div class="bd-row"><span>{t('influence')}</span><span>+4</span></div></div>{(ex?.assemblyUntil ?? 0) > day && <div class="neg">{t('x_again_from')} {fmtDateShort(ex.assemblyUntil, view.value?.startYear ?? 1356)}</div>}</div>}
          disabled={(ex?.assemblyUntil ?? 0) > day ? 'the assembly met recently' : null} onClick={() => act({ t: 'estate', estate: e.id, action: 'summon' }, 'bell')}>{t('summon')}</Btn>
      </div>
    </div>)}</div>
  </Section>;
}
