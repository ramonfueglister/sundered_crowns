// People of the realm: names in the reader's language (German regnal numbers and epithets), the ruling house
// (government tab), the choice of an army's commander (army panel) and what an AI realm did lately (nation panel).
import { localName, localHouse } from '../../sim/content/names';
import { view, nations } from '../../game/client';
import { Section, Btn, NLink, act, t, L, num, signed, Tip, useQuery, fmtDateShort, Effects } from './common';
import { RULER_TRAIT_FX, TRAITS_HEALTH } from '../../sim/content/traits';
import { lang } from '../i18n';
import { TipHead, Parts } from './explain';
import { traitName } from './nation';

/** A person's name as the reader's language writes it ("Pedro I. der Grausame" in German). */
/** ofHouse: the person belongs to a ruling house (ruler, heir, consort, a member or a member's spouse), whose given
 *  names German writes in their German form (content/names.ts localName). */
export function charName(name: string | null | undefined, female = false, ofHouse = false): string {
  if (!name) return '';
  return lang.value === 'de' ? localName(name, 'de', female, ofHouse) : name;
}
/** A house as the reader's language writes it ("Haus Luxemburg"). */
export function houseName(h: string | null | undefined): string { return localHouse(h ?? '', lang.value); }
/** What a trait does: its effects on the realm while its bearer rules (content/traits.ts, the modifier "The ruler's
 *  traits"), its effect on the bearer's life or in battle, or that it only describes the person. */
export function TraitTip({ k, ruler, regency }: { k: string; ruler?: boolean; regency?: boolean }) {
  const fx = RULER_TRAIT_FX[k]; const h = TRAITS_HEALTH[k]; const c = t(`ctrait_${k}_fx`); const cmd = c !== `ctrait_${k}_fx`;
  return <div>
    <TipHead name={traitName(k)} />
    {fx ? <Effects fx={fx} title={t('xp_trait_ruling')} /> : !h && !cmd && <div class="muted">{t('xp_trait_descriptive')}</div>}
    {fx && ruler && <div class="muted small">{t(regency ? 'xp_trait_ruler_later' : 'xp_trait_ruler_now')}</div>}
    {h && <div class={h === 'bad' ? 'neg' : 'pos'}>{t(h === 'bad' ? 'xp_trait_health_bad' : 'xp_trait_health_good')}</div>}
    {cmd && <div class="muted">{c}</div>}
  </div>;
}
/** A trait as a chip with its tooltip (ruler: the bearer rules now, so the effects apply). */
export function TraitChip({ k, ruler, regency }: { k: string; ruler?: boolean; regency?: boolean }) {
  return <Tip content={() => <TraitTip k={k} ruler={ruler} regency={regency} />}><span class="chip has-tip">{traitName(k)}</span></Tip>;
}
/** Traits in a line of text, each with its tooltip. */
export function TraitList({ traits }: { traits: string[] }) {
  return <>{traits.map((x, i) => <>{i > 0 && ', '}<Tip content={() => <TraitTip k={x} />}><span class="has-tip">{traitName(x)}</span></Tip></>)}</>;
}
/** The house to show after a name: none when the name already carries it or a title ("Pedro, Infante of Portugal"). */
function houseOf(name: string, dynasty: string | undefined, own?: string): string {
  return dynasty && dynasty !== own && !/,| of | von /.test(name) && !name.includes(dynasty.slice(0, 5)) ? dynasty : '';
}
/** Name with the house when the name does not already carry it. */
export function charFull(name: string, dynasty: string | undefined, female = false, ofHouse = false): string {
  const n = charName(name, female, ofHouse), h = houseOf(name, dynasty);
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
  const who = (c: any) => charName(c.name, c.female, true);
  return <Section title={<>{t('house_of')} {houseName(d.house)}</>} id="gov-dynasty">
    {d.warn && <div class="warn-box"><b>⚠ {t(d.warn === 'none' ? (d.fallback?.kin ? 'xp_house_none_here' : 'xp_house_none') : 'xp_house_last')}</b>
      <div class="small">{d.warn === 'last' && d.line[0] ? `${who(d.line[0])}. ` : ''}{!d.fallback ? t('xp_house_then_native')
        : d.fallback.kin ? <>{t(d.fallback.female ? 'xp_house_then_kin_f' : 'xp_house_then_kin_m').replace('{p}', who(d.fallback))} <NLink id={d.fallback.nation} size={14} />{t('xp_house_then_kin_end')}</>
        // (the realm is named once: "Ludwig von Ungarn" gets only the arms of Hungary, not "von Ungarn" again)
        : who(d.fallback).includes(L(nations.value[d.fallback.nation]?.short)) ? <>{t('xp_house_then_claim').replace('{p}', who(d.fallback))} <NLink id={d.fallback.nation} size={14} name={false} />.</>
        : <>{t('xp_house_then_claim').replace('{p}', who(d.fallback))} (<NLink id={d.fallback.nation} size={14} />).</>}</div>
      <div class="muted small">{t('xp_house_secure')}</div></div>}
    {d.hereditary && d.line.length > 0 && <div class="small dyn-line"><Tip content={<div><TipHead name={t('xp_line')} hint={t('xp_line_hint')} /></div>}><b class="has-tip">{t('xp_line')}:</b></Tip>{' '}
      {d.line.map((c: any, k: number) => <span>{k > 0 && ' › '}{k + 1}. {who(c)} <span class="muted">({c.age})</span></span>)}</div>}
    <table class="tbl dyn-tbl"><tbody>
      {d.members.map((m: any) => <tr class={m.rel === 'ruler' ? 'sel' : ''}>
        <td><b>{charName(m.name, m.female, true)}</b>{houseOf(m.name, m.dynasty, d.house) && <small class="muted"> {houseName(houseOf(m.name, m.dynasty, d.house))}</small>}
          {m.heir && m.rel !== 'heir' && <small class="pos"> · {relName('heir', m.female)}</small>}</td>
        <td class="muted">{relName(m.rel, m.female)}</td>
        <td class="r"><Tip content={<div><TipHead name={charName(m.name, m.female, true)} value={`${m.age} ${t('years_old')}`} hint={t('x_member_age_hint')} /></div>}><span>{m.age}</span></Tip></td>
        <td><Skills s={m.skills} /></td>
        <td class="small">
          {m.spouse && <Tip content={<div><TipHead name={charName(m.spouse.name, m.spouse.female, true)} hint={t(m.spouse.alive ? 'x_spouse_hint' : 'x_spouse_dead_hint')} /></div>}><span class="muted">⚭ {charName(m.spouse.name, m.spouse.female, true)}{houseOf(m.spouse.name, m.spouse.dynasty, d.house) ? ` ${houseName(houseOf(m.spouse.name, m.spouse.dynasty, d.house))}` : ''}{!m.spouse.alive && ' †'}</span></Tip>}
          {m.abroad >= 0 && <span> · {t('at_court_of')} <NLink id={m.abroad} size={14} /></span>}
          {m.claims.length > 0 && <Tip content={<div><TipHead name={t('claims')} hint={t('x_claims_hint')} /></div>}><span> · {t('claim_on')} {m.claims.map((k: number) => <NLink id={k} size={14} />)}</span></Tip>}
          {m.traits.length > 0 && <span> · <TraitList traits={m.traits} /></span>}
        </td>
      </tr>)}
    </tbody></table>
    <div class="dyn-claimants">
      <Tip content={<div><TipHead name={t('if_house_dies')} hint={t('x_if_house_dies_hint')} /></div>}><b class="has-tip">{t('if_house_dies')}</b></Tip>{' '}
      {d.claimants.length ? d.claimants.map((c: any, k: number) => <span>{k > 0 && ', '}<NLink id={c.nation} size={14} />{c.name && <span class="muted"> ({charName(c.name, c.female, true)})</span>}{' '}
        <Tip content={<div><TipHead name={t(HOW[c.how])} value={c.rank} hint={t(`x_${HOW[c.how]}_hint`)} /></div>}><small class="chip">{t(HOW[c.how])}</small></Tip></span>)
        : <span class="muted">{t('no_claimants')}</span>}
    </div>
  </Section>;
}

// ---------------- the commander of an army (army panel) ----------------
const pctS = (v: number) => `${signed(v * 100, 0)} %`;
export function CommanderPicker({ army }: { army: number }) {
  const [d, refresh] = useQuery<any>({ q: 'commanders', army }, [army], 2500);
  if (!d) return <div class="cmd-pick muted">{t('loading')}…</div>;
  const pick = (char: number) => act({ t: 'general', army, char }, 'click').then(() => refresh());
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
      <Btn disabled={d.treasury < d.cost ? 'not enough gold' : null} onClick={() => pick(-1)}
        tip={() => <div><TipHead name={t('recruit_general')} value={num(d.cost)} hint={t('x_recruit_general_hint')} /><Parts rows={d.costParts} total={d.cost} digits={0} bad /></div>}>{t('recruit_general')} ({num(d.cost)})</Btn>
      <Btn tip={t('auto_general_hint')} onClick={() => pick(0)}>{t('appoint_ablest')}</Btn>
    </div>
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
