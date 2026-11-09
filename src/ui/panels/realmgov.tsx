// Government panel additions (spec points 36, 39 and 95): how this form of government chooses its head, the next
// choice and its candidates with each Power's preference, the demand a Power presses, and what the assembly decides.
import { playerId, realmDialog } from '../store';
import { view } from '../../game/client';
import { Section, Row, Btn, Empty, Effects, Tip, useQuery, act, t, L, num, pct, fmtDateShort } from './common';
import { Parts, TipHead } from './explain';

type Row2 = [any, number];
const sum = (r: Row2[]) => r.reduce((p, x) => p + x[1], 0);
const date = (d: number) => fmtDateShort(d, view.value?.startYear ?? 1356);
const SK = ['x_gov_sk0', 'x_gov_sk1', 'x_gov_sk2'];

export function RealmGovernment() {
  const pid = playerId.value;
  const [g, refresh] = useQuery<any>({ q: 'govern' }, [pid], 1500);
  if (!g) return <Empty>{t('loading')}…</Empty>;
  const doAct = async (c: any) => { await act(c); refresh(); };
  const partyName = (c: any) => (c.party === 'crown' ? t('x_gov_party_crown') : c.party === 'incumbent' ? t('x_gov_party_incumbent') : L(c.partyName));
  return <div class="cols2">
    <Section title={t('x_gov_head_title')} id="gov-head">
      <div class="small">{t(`x_gov_proc_${g.process}`)}</div>
      {g.process === 'republic' && <>
        <Row k={t('x_gov_next_election')} v={date(g.nextElection)} tip={t('x_gov_term_hint').replace('{y}', String(g.termYears)).replace('{n}', String(g.termLimit))} />
        <Row k={t('x_gov_term')} v={`${g.term} / ${g.termLimit}`} />
      </>}
      {g.lastMargin !== undefined && g.process !== 'heredity' && <Row k={t('x_gov_last_margin')} v={`${g.lastMargin} %`} tip={t('x_gov_margin_hint')} />}
      {g.process === 'heredity' ? <Row k={t('heir')} v={g.heirName ?? '—'} tip={t('x_gov_heredity_hint')} /> : <>
        <div class="sub-h">{t('x_gov_candidates')}</div>
        {g.candidates.map((c: any) => <div class={`kv ${c.id === g.winner ? 'pos' : ''}`}>
          <span class="k"><Tip content={() => <div><TipHead name={c.name} value={`${c.age} ${t('years_old')}`} hint={c.dynasty} />{c.skills && <div>{c.skills.map((v: number, k: number) => <span class="chip">{t(SK[k])} {v}</span>)}</div>}<div class="muted">{partyName(c)}</div></div>}>
            <span class="has-tip">{c.name}</span></Tip> <span class="muted small">({partyName(c)})</span></span>
          <span class="v"><Tip content={() => <div><TipHead name={t('x_gov_support')} value={pct(c.share / 100, 0)} hint={t('x_gov_support_hint')} />
            {c.by.map((b: any) => <Parts title={`${L(b.name)} (${t('x_gov_weight')} ${num(b.weight)})`} rows={b.rows} total={sum(b.rows)} digits={0} />)}
            {!c.by.length && <div class="muted">{t('x_gov_no_support')}</div>}</div>}><span class="has-tip">{pct(c.share / 100, 0)}</span></Tip>
            <Btn disabled={g.backed === c.id ? t('x_gov_backed') : null} tip={t('x_gov_back_hint')} onClick={() => doAct({ t: 'govern', action: 'back', char: c.id })}>{t('x_gov_back')}</Btn></span>
        </div>)}
      </>}
    </Section>
    <Section title={t('x_asm_title')} id="gov-assembly">
      <Row k={t('x_asm_tax_level')} v={pct(g.taxLevel, 1)} tip={t('x_asm_tax_level_hint')} />
      <Row k={t('x_asm_tax_ceiling')} v={g.taxVote ? pct(g.taxCeiling, 1) : t('x_asm_no_vote')} tip={t('x_asm_ceiling_hint')} />
      <Row k={t('x_asm_war_vote')} v={g.warVote ? t('yes') : t('no')} tip={t('x_asm_war_vote_hint')} />
      {g.taxVote && <Btn onClick={() => { realmDialog.value = { kind: 'assembly', cmd: { t: 'tax', cls: -1, rate: Math.min(0.5, Math.round(((g.taxCeiling ?? 0.1) + 0.02) * 200) / 200) } }; }}>{t('x_asm_ask_taxes')}</Btn>}
      {g.snubs.length > 0 && <div class="warn-box small">{t('x_asm_snubbed_hint')}</div>}
      {g.demand && <div class="warn-box">
        <TipHead name={t('x_dem_title')} value={date(g.demand.until)} hint={`${L(g.demand.estateName)}: ${L(g.demand.privName)}`} />
        <Effects fx={g.demand.effects} />
        {g.demand.resent && Object.keys(g.demand.resent).length > 0 && <div class="muted small">{t('x_dem_resent')}: {Object.entries(g.demand.resent).map(([k, v]) => `${t(`x_estate_${k}`)} ${v}`).join(', ')}</div>}
        <div class="btn-row"><Btn onClick={() => doAct({ t: 'govern', action: 'grant_demand' })}>{t('x_dem_grant')}</Btn><Btn tip={t('x_dem_refuse_hint')} onClick={() => doAct({ t: 'govern', action: 'refuse_demand' })}>{t('x_dem_refuse')}</Btn></div>
      </div>}
    </Section>
  </div>;
}
