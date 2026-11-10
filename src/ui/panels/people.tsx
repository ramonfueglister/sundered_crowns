// People of the realm: names in the reader's language (German regnal numbers and epithets), the ruling house
// (government tab), the choice of an army's commander (army panel) and what an AI realm did lately (nation panel).
import { localName } from '../../sim/content/names';
import { useEffect, useState } from 'preact/hooks';
import { view } from '../../game/client';
import { showToast } from '../store';
import { Section, Btn, NLink, act, t, L, num, signed, Tip, useQuery, fmtDateShort } from './common';
import { lang } from '../i18n';
import { TipHead, Parts } from './explain';
import { traitName } from './nation';

/** A person's name as the reader's language writes it ("Pedro I. der Grausame" in German). */
export function charName(name: string | null | undefined, female = false): string {
  if (!name) return '';
  return lang.value === 'de' ? localName(name, 'de', female) : name;
}
/** The house to show after a name: none when the name already carries it or a title ("Pedro, Infante of Portugal"). */
function houseOf(name: string, dynasty: string | undefined, own?: string): string {
  return dynasty && dynasty !== own && !/,| of | von /.test(name) && !name.includes(dynasty.slice(0, 5)) ? dynasty : '';
}
/** Name with the house when the name does not already carry it. */
export function charFull(name: string, dynasty: string | undefined, female = false): string {
  const n = charName(name, female), h = houseOf(name, dynasty);
  return h ? `${n} (${h})` : n;
}
/** How a member is related to the ruler, as a man or a woman. */
export function relName(rel: string, female: boolean): string {
  const k = `rel_${rel}_${female ? 'f' : 'm'}`; const v = t(k);
  return v === k ? t(`rel_${rel}`) : v;
}
const SK = ['skill_gov', 'skill_dip', 'skill_mil'];
function Skills({ s }: { s: number[] }) {
  return <span class="skills inline">{s.map((v, k) => <Tip content={<div><TipHead name={t(SK[k])} value={v} hint={t(`x_skill${k}_fx`)} /></div>}><span class="skill"><i class={`sk sk${k}`} />{v}</span></Tip>)}</span>;
}

// ---------------- the ruling house (government tab) ----------------
const HOW: Record<string, string> = { blood: 'claim_blood', descent: 'claim_descent', marriage: 'claim_marriage' };
export function DynastySection({ r }: { r: any }) {
  const d = r?.dynasty; if (!d) return null;
  return <Section title={<>{t('house_of')} {d.house}</>} id="gov-dynasty">
    <table class="tbl dyn-tbl"><tbody>
      {d.members.map((m: any) => <tr class={m.rel === 'ruler' ? 'sel' : ''}>
        <td><b>{charName(m.name, m.female)}</b>{houseOf(m.name, m.dynasty, d.house) && <small class="muted"> {houseOf(m.name, m.dynasty, d.house)}</small>}
          {m.heir && m.rel !== 'heir' && <small class="pos"> · {relName('heir', m.female)}</small>}</td>
        <td class="muted">{relName(m.rel, m.female)}</td>
        <td class="r"><Tip content={<div><TipHead name={charName(m.name, m.female)} value={`${m.age} ${t('years_old')}`} hint={t('x_member_age_hint')} /></div>}><span>{m.age}</span></Tip></td>
        <td><Skills s={m.skills} /></td>
        <td class="small">
          {m.spouse && <Tip content={<div><TipHead name={charName(m.spouse.name, m.spouse.female)} hint={t(m.spouse.alive ? 'x_spouse_hint' : 'x_spouse_dead_hint')} /></div>}><span class="muted">⚭ {charName(m.spouse.name, m.spouse.female)}{houseOf(m.spouse.name, m.spouse.dynasty, d.house) ? ` ${houseOf(m.spouse.name, m.spouse.dynasty, d.house)}` : ''}{!m.spouse.alive && ' †'}</span></Tip>}
          {m.abroad >= 0 && <span> · {t('at_court_of')} <NLink id={m.abroad} size={14} /></span>}
          {m.claims.length > 0 && <Tip content={<div><TipHead name={t('claims')} hint={t('x_claims_hint')} /></div>}><span> · {t('claim_on')} {m.claims.map((k: number) => <NLink id={k} size={14} />)}</span></Tip>}
          {m.traits.length > 0 && <span> · {m.traits.map((x: string) => traitName(x)).join(', ')}</span>}
        </td>
      </tr>)}
    </tbody></table>
    <div class="dyn-claimants">
      <Tip content={<div><TipHead name={t('if_house_dies')} hint={t('x_if_house_dies_hint')} /></div>}><b class="has-tip">{t('if_house_dies')}</b></Tip>{' '}
      {d.claimants.length ? d.claimants.map((c: any, k: number) => <span>{k > 0 && ', '}<NLink id={c.nation} size={14} />{c.name && <span class="muted"> ({charName(c.name)})</span>}{' '}
        <Tip content={<div><TipHead name={t(HOW[c.how])} value={c.rank} hint={t(`x_${HOW[c.how]}_hint`)} /></div>}><small class="chip">{t(HOW[c.how])}</small></Tip></span>)
        : <span class="muted">{t('no_claimants')}</span>}
    </div>
  </Section>;
}

// ---------------- the commander of an army (army panel) ----------------
const pctS = (v: number) => `${signed(v * 100, 0)} %`;
export function CommanderPicker({ army }: { army: number }) {
  const [d, refresh] = useQuery<any>({ q: 'commanders', army }, [army], 2500);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setConfirm(false), [army]);
  if (!d) return <div class="cmd-pick muted">{t('loading')}…</div>;
  const pick = (char: number) => act({ t: 'general', army, char }, 'click').then(() => refresh());
  // raising a general costs real money: the price, what he may be worth and who commands now are shown before paying,
  // and the ablest commander free to appoint at no cost when he is worth as much as a new captain on average (d.free)
  const freeBest = d.free;
  const raise = () => act({ t: 'general', army, char: -1 }, null).then((r) => { if (r.ok && r.msg) showToast(L(r.msg)); setConfirm(false); refresh(); });
  return <div class="cmd-pick">
    <table class="tbl small"><thead><tr><th>{t('name')}</th><th class="r">{t('x_generalship')}</th><th class="r">{t('morale')}</th><th>{t('traits')}</th><th /></tr></thead>
      <tbody>{d.list.map((c: any) => <tr class={c.busy?.here ? 'sel' : ''}>
        <td><Tip content={<div><TipHead name={charName(c.name, c.female)} value={`${c.age} ${t('years_old')}`} hint={relName(c.rel, c.female)} /><Skills s={c.skills} />{c.xp > 0 && <div class="muted">{t('battles_xp')}: {c.xp}</div>}</div>}>
          <span>{charName(c.name, c.female)}</span></Tip>
          <div class="muted small">{relName(c.rel, c.female)} · {c.age}{c.busy && !c.busy.here && <> · {t('leads')} {L(c.busy.name)}</>}</div></td>
        <td class="r"><Tip content={<div><TipHead name={t('x_generalship')} value={num(c.skill, 1)} hint={t('x_generalship_hint')} /><Parts rows={c.parts.skill} total={c.skill} /></div>}><b>{num(c.skill, 1)}</b></Tip></td>
        <td class="r"><Tip content={<div><TipHead name={t('x_cmd_morale')} value={pctS(c.morale)} hint={t('x_cmd_morale_hint')} /><Parts rows={c.parts.morale} fmt={pctS} total={c.morale} /></div>}><span>{c.morale ? pctS(c.morale) : '—'}</span></Tip></td>
        <td>{c.traits.map((x: string) => <Tip content={<div><TipHead name={traitName(x)} hint={t(`ctrait_${x}_fx`) !== `ctrait_${x}_fx` ? t(`ctrait_${x}_fx`) : t('x_trait_no_battle')} /></div>}><span class="chip">{traitName(x)}</span></Tip>)}</td>
        <td>{c.busy?.here ? <span class="muted">{t('in_command')}</span> : <Btn onClick={() => pick(c.id)}>{t('appoint')}</Btn>}</td>
      </tr>)}</tbody></table>
    <div class="army-btns">
      <Btn cls={confirm ? 'on' : ''} disabled={d.treasury < d.cost ? 'not enough gold' : null} onClick={() => setConfirm(!confirm)}
        tip={() => <div><TipHead name={t('recruit_general')} value={num(d.cost)} hint={t('xfw_raise_hint')} /><Parts rows={d.costParts} total={d.cost} digits={0} bad /></div>}>{t('recruit_general')}… ({num(d.cost)})</Btn>
      <Btn tip={t('auto_general_hint')} onClick={() => pick(0)}>{t('appoint_ablest')}</Btn>
    </div>
    {confirm && <div class="warn-box xfw-raise">
      <div><b>{t('recruit_general')}</b>: {t('xfw_raise_cost').replace('{n}', num(d.cost)).replace('{p}', num(d.cost / Math.max(1, d.treasury) * 100))} <span class="muted">({t(d.costParts[0][0])})</span></div>
      <div>{t('xfw_raise_expect')}</div>
      <div>{d.current ? t('xfw_raise_vs').replace('{name}', charName(d.current.name, d.current.female)).replace('{n}', num(d.current.skill, 1)) : t('xfw_raise_none')}</div>
      {freeBest && <div class="act-row xfw-raise-free"><span class="pos">{t('xfw_raise_free').replace('{name}', charName(freeBest.name, freeBest.female)).replace('{n}', num(freeBest.skill, 1))}</span><span class="spacer" />
        <Btn onClick={() => { setConfirm(false); pick(freeBest.id); }}>{t('appoint')}</Btn></div>}
      <div class="act-row"><span class="spacer" /><Btn onClick={() => setConfirm(false)}>{t('cancel')}</Btn><Btn cls="gold" onClick={raise}>{t('xfw_raise_confirm').replace('{n}', num(d.cost))}</Btn></div>
    </div>}
  </div>;
}

// ---------------- what an AI realm did (nation panel) ----------------
export function AiLogSection({ d }: { d: any }) {
  if (!d?.aiLog) return null;
  const sy = view.value?.startYear ?? 1356;
  return <Section title={t('recent_decisions')} id="nat-ailog">
    {d.aiLog.length ? <ul class="ailog">{d.aiLog.map((e: any) => <li><span class="muted">{fmtDateShort(e.day, sy)}</span> {L(e.text)}</li>)}</ul> : <div class="muted">{t('none')}</div>}
  </Section>;
}
