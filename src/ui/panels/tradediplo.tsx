// Trade with a foreign realm in its panel (spec points 27, 54): goods exchanged, tariffs both ways, what a trade
// agreement changes, and an embargo (declare or lift) with what it would cost each side.
import './trade.css';
import { Section, Row, Btn, useQuery, act, t, L, num, pct, Tip } from './common';
import { TipHead } from './explain';
import { StakesTip } from './trade';

export function TradeRelations({ target, refresh }: { target: number; refresh: () => void }) {
  const [d, again] = useQuery<any>({ q: 'trel', target }, [target], 2500);
  if (!d) return null;
  const done = () => { again(); refresh(); };
  const blockWhy = d.allied ? 'not against an ally' : d.within ? 'not within our realm' : null;
  return <Section title={t('tr_trade_with')} id="nat-trade">
    <div class="trade-rel">
      <Row k={t('tr_goods_month')} v={num(d.goods, 0)} tip={<div><TipHead name={t('tr_goods_month')} value={num(d.goods, 1)} hint={t('tr_goods_month_hint')} />
        {d.items.length > 0 && <div class="breakdown">{d.items.map((x: any) => <div class="bd-row"><span>{L(x.name)}</span><span>{num(x.value, 1)}</span></div>)}</div>}</div>} />
      <Row k={t('tr_tariffs_both')} v={`${pct(d.theirTariff)} / ${pct(d.ourTariff)}`} tip={<div><TipHead name={t('tr_tariffs_both')} hint={t('tr_tariffs_both_hint')} />
        <div class="breakdown"><div class="bd-row"><span>{t('tr_their_tariff')}</span><span>{pct(d.theirBase)}{d.agreement ? ` × ${num(d.halved, 2)} = ${pct(d.theirTariff)}` : ''}</span></div>
          <div class="bd-row"><span>{t('tr_our_tariff_on')}</span><span>{pct(d.ourBase)}{d.agreement ? ` × ${num(d.halved, 2)} = ${pct(d.ourTariff)}` : ''}</span></div></div></div>} />
      <Row k={t('tr_agreement')} v={d.agreement ? <span class="pos">✔</span> : <span class="muted">—</span>} tip={<div><TipHead name={t('tr_agreement')} hint={t('tr_agreement_hint')} />
        <div class="breakdown"><div class="bd-row"><span>{t('tr_their_tariff')}</span><span>{pct(d.theirBase)} → {pct(d.theirBase * d.halved)}</span></div>
          <div class="bd-row"><span>{t('tr_our_tariff_on')}</span><span>{pct(d.ourBase)} → {pct(d.ourBase * d.halved)}</span></div>
          <div class="bd-row"><span>{t('tr_more_goods')}</span><span>× {num(d.volume, 2)}</span></div></div>{!d.agreement && <div class="muted">{t('tr_propose_where')}</div>}</div>} />
      <Row k={t('tr_embargo')} v={<span>{d.ours ? <b>{t('tr_we_embargo')}</b> : ''}{d.ours && d.theirs ? ' · ' : ''}{d.theirs ? <b class="neg">{t('tr_they_embargo')}</b> : ''}{!d.ours && !d.theirs ? <span class="muted">—</span> : ''}
        {' '}{d.ours
          ? <Btn tip={t('tr_lift_hint')} onClick={() => act({ t: 'diplo', target, action: 'lift_embargo' }).then(done)}>{t('tr_lift')}</Btn>
          : <Btn cls="danger" disabled={blockWhy} tip={() => <div><TipHead name={t('tr_declare_embargo')} hint={t('tr_embargo_hint')} /><StakesTip st={d.stakes} />{d.rival && <div class="muted">{t('tr_embargo_rival')}</div>}</div>} onClick={() => act({ t: 'diplo', target, action: 'embargo' }).then(done)}>{t('tr_declare_embargo')}</Btn>}</span>}
        tip={() => <StakesTip st={d.stakes} />} />
    </div>
  </Section>;
}
