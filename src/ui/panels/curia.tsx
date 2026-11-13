// The Curia panel (spec points 60 and 78): the pope and the country he comes from, our favour with its yearly gain,
// the College of Cardinals with each bloc's leaning in a conclave (and our vote and gifts), and what we can ask of
// Rome: a red hat, indulgences, a crusade.
import { playerId } from '../store';
import { view } from '../../game/client';
import { Section, Row, Bar, Btn, Empty, NLink, Effects, Tip, useQuery, act, t, L, num, signed, fmtDateShort } from './common';
import { errText } from '../i18n';
import { showToast } from '../store';
import { Parts, TipHead } from './explain';
import { fill } from './empire';

type Row2 = [any, number];
const sum = (r: Row2[]) => r.reduce((p, x) => p + x[1], 0);
const date = (d: number) => fmtDateShort(d, view.value?.startYear ?? 1356);
const Why = ({ rows, title }: { rows: Row2[]; title?: any }) => <Parts title={title} rows={rows} total={sum(rows)} digits={0} />;

export function CuriaTab() {
  const pid = playerId.value;
  const [c, refresh] = useQuery<any>({ q: 'curia' }, [pid], 1000);
  if (!c) return <Empty>{t('loading')}…</Empty>;
  const doAct = async (cmd: any, ok?: string) => { const r = await act(cmd, 'click', ok); if (r.ok && r.msg) showToast(L(r.msg)); refresh(); };
  const cr = c.crusade;
  return <div class="tab-curia">
    <div class="cols2">
      <Section title={t('x_cu_pope')} id="cu-pope">
        <Row k={t('holy_see')} v={c.holder >= 0 ? <NLink id={c.holder} /> : '—'} tip={t('x_cu_holder_hint')} />
        {c.seatName && <Row k={t('x_cu_seat')} v={L(c.seatName)} />}
        <Row k={t('x_cu_patron')} v={c.patron < 0 ? '—' : c.curial ? t('x_cu_curial') : <NLink id={c.patron} />}
          tip={<div><TipHead name={t('x_cu_patron')} hint={t('x_cu_patron_hint')} /><Effects title={t('x_cu_patron_gives')} fx={c.patronEffects} /></div>} />
        <Row k={t('x_cu_last_conclave')} v={date(c.lastConclave)} />
        <Row k={t('x_cu_corruption')} v={num(c.corruption)} tip={t('x_cu_corruption_hint')} />
        <Bar value={c.corruption} max={100} color="#7a4e1c" />
        <Row k={t('x_cu_reform')} v={num(c.reformPressure)} tip={t('x_cu_reform_hint')} />
        {c.schism && <div class="warn-box">{t('schism')}</div>}
      </Section>
      <Section title={t('curia_favour')} id="cu-favour">
        {!c.latin ? <div class="muted small">{t('x_cu_not_latin')}</div> : <>
          <Row k={t('curia_favour')} v={num(c.favour)} tip={() => <div><TipHead name={t('curia_favour')} value={num(c.favour)} hint={t('x_cu_favour_hint')} /><Parts title={t('x_cu_favour_year')} rows={c.gain} total={sum(c.gain)} digits={2} /></div>} />
          <Bar value={c.favour} max={100} color="#d8c36a" />
          {c.excommunicated && <div class="warn-box">{t('x_cu_banned')}</div>}
          <Row k={t('x_cu_our_hats')} v={`${c.college.mine}`} tip={() => <div><TipHead name={t('x_cu_our_hats')} hint={fill('x_cu_share_hint', { n: c.college.share })} /><Why title={t('x_cu_claim')} rows={c.college.claim} /></div>} />
        </>}
      </Section>
    </div>

    <Section title={t('x_cu_conclave')} id="cu-conclave" right={c.conclave ? <span class="tag">{fill('x_cu_round', { r: c.conclave.round, n: c.conclave.rounds })} · {date(c.conclave.closes)}</span> : null}>
      <div class="muted small">{c.conclave ? fill('x_cu_conclave_open', { need: c.need, cast: c.cast }) : t('x_cu_conclave_if')}</div>
      {c.candidates.map((x: any) => <div class="kv"><span class="k">{x.id === c.holder ? <span>{t('x_cu_curial_cap')} (<NLink id={x.id} size={14} />)</span> : <NLink id={x.id} />}</span><span class="v">
        {x.votes} / {c.cast}
        {c.conclave && c.college.mine > 0 && <Btn disabled={c.conclave.myVote === x.id ? t('x_el_voted') : null} onClick={() => doAct({ t: 'curia', action: 'vote', target: x.id }, t('x_cu_ok_vote'))}>{t('x_el_vote')}</Btn>}
      </span></div>)}
    </Section>

    <Section title={fill('x_cu_college', { n: c.college.size, seats: c.college.seats })} id="cu-college">
      <div class="muted small">{t('x_cu_college_hint')}</div>
      {c.blocs.map((b: any) => <div class="kv"><span class="k"><NLink id={b.id} size={14} /> <span class="muted small">×{b.hats}</span></span><span class="v">
        <Tip content={() => <div>{b.human ? <div class="muted">{b.choice >= 0 ? t('x_cu_they_voted') : t('x_el_undecided')}</div> : <Why title={t('x_cu_why')} rows={b.rows} />}{b.forMe && <Why title={t('x_el_for_us')} rows={b.forMe} />}</div>}>
          <span class="has-tip">→ {b.choice >= 0 ? (b.choice === c.holder ? t('x_cu_curial') : <NLink id={b.choice} size={14} />) : '?'}</span>
        </Tip>
        {c.latin && c.simony.candidate && b.id !== pid && !b.human && <Btn disabled={b.giftRefusal ? errText(b.giftRefusal) : null}
          tip={<div>{t('x_cu_simony_hint')}<div class="muted">{t('cost')}: {num(c.simony.cost)} · {t('x_el_gifts')} {b.gifts}/{c.simony.max}</div></div>}
          onClick={() => doAct({ t: 'curia', action: 'simony', target: b.id }, fill('x_ok_gift', { f: Math.min(c.simony.max, b.gifts + c.simony.step) }))}>{t('x_el_campaign')}</Btn>}
      </span></div>)}
    </Section>

    {c.latin && <Section title={t('x_cu_ask')} id="cu-ask">
      <div class="kv"><span class="k">{t('x_cu_red_hat')}</span><span class="v">
        <Btn disabled={c.redHat.refusal ? (c.redHat.refusal === 'too soon' ? `${t('x_again_from')} ${date(c.redHat.again)}` : errText(c.redHat.refusal)) : null}
          tip={<div>{fill('x_cu_red_hat_hint', { years: c.redHat.years })}<div class="muted">{t('cost')}: {num(c.redHat.gold)} · {t('curia_favour')} −{c.redHat.favour}</div></div>}
          onClick={() => doAct({ t: 'curia', action: 'red_hat' }, t('x_cu_ok_red_hat'))}>{t('x_cu_buy')}</Btn>
      </span></div>
      <div class="kv"><span class="k">{t('x_cu_indulgence')}</span><span class="v">
        <Btn disabled={c.indulgence.refusal ? (c.indulgence.refusal === 'too soon' ? `${t('x_again_from')} ${date(c.indulgence.again)}` : errText(c.indulgence.refusal)) : null}
          tip={<div>{fill('x_cu_indulgence_hint', { years: c.indulgence.years, corr: c.indulgence.corruption, reform: Math.round(c.indulgence.reform * 100) })}<div class="muted">+{num(c.indulgence.gold)} · {t('curia_favour')} −{c.indulgence.favour}</div></div>}
          onClick={() => doAct({ t: 'curia', action: 'indulgence' }, fill('x_cu_ok_indulgence', { g: num(c.indulgence.gold) }))}>{t('x_cu_sell')}</Btn>
      </span></div>
      <div class="sub-h">{t('x_cu_crusade')}</div>
      <div class="muted small">{fill('x_cu_crusade_hint', { years: cr.years, morale: Math.round(cr.morale * 100), gap: cr.gap, f: cr.favour })}</div>
      {cr.active ? <Row k={t('x_cu_crusade_now')} v={<span><NLink id={cr.active.target} /> <span class="muted small">({t('x_cu_until')} {date(cr.active.until)}, <NLink id={cr.active.by} size={12} />)</span></span>} />
        : cr.refusal ? <div class="muted small">{cr.refusal === 'too soon' && cr.last !== null ? `${t('x_again_from')} ${date(cr.last + cr.gap * 365)}` : errText(cr.refusal)}</div>
        : cr.targets.length ? cr.targets.map((x: any) => <div class="kv"><span class="k"><NLink id={x.id} size={14} /></span><span class="v">
          <Btn disabled={x.refusal ? errText(x.refusal) : null} onClick={() => doAct({ t: 'curia', action: 'crusade', target: x.id }, t('x_cu_ok_crusade'))}>{t('x_cu_proclaim')} (−{cr.favour})</Btn>
        </span></div>) : <div class="muted small">{t('x_cu_no_targets')}</div>}
      <div class="muted small">{t('x_cu_excommunicate_hint')} {signed(-50, 0)}</div>
    </Section>}
  </div>;
}
