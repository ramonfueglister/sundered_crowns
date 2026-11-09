// Ledger (sortable comparison tables) and the Chronicle.
import { useState } from 'preact/hooks';
import { chronicle, view, nations } from '../../game/client';
import { playerId, openPanel } from '../store';
import { Btn, Empty, NLink, NList, Tabs, useQuery, t, L, num, signed, fmtDateShort, selectLoc, Tip, realm, useRealm } from './common';
import { Parts, TipHead } from './explain';
import { keyName } from '../TopBar';

type LKind = 'nations' | 'markets' | 'wars';
export function LedgerTab() {
  const [kind, setKind] = useState<LKind>('nations');
  const [rows] = useQuery<any[]>({ q: 'ledger', kind }, [kind], 3000);
  const [sort, setSort] = useState<{ k: string; d: number }>({ k: 'score', d: -1 });
  const pid = playerId.value;
  useRealm(3000);
  const cols: Record<LKind, [string, string, (r: any) => any][]> = {
    nations: [['name', t('realm'), (r) => L(r.name)], ['score', t('score'), (r) => r.score], ['dev', t('development'), (r) => r.dev], ['locs', t('locations'), (r) => r.locs], ['pop', t('population'), (r) => r.pop],
      ['army', t('army'), (r) => r.army], ['navy', t('fleet'), (r) => r.navy], ['income', t('income'), (r) => r.income], ['tech', t('technology'), (r) => r.tech], ['prestige', t('prestige'), (r) => r.prestige]],
    markets: [['name', t('market'), (r) => r.name], ['owner', t('owner'), (r) => L(nations.value[r.owner]?.short) || '—'], ['priceIndex', t('price_index'), (r) => r.priceIndex], ['top', t('main_goods'), (r) => r.top.map((g: any) => L(g)).join(', ')]],
    wars: [['name', t('war'), (r) => L(r.name)], ['att', t('attackers'), (r) => r.att.length], ['def', t('defenders'), (r) => r.def.length], ['score', t('war_score'), (r) => r.score]],
  };
  const cs = cols[kind];
  const getter = cs.find((c) => c[0] === sort.k)?.[2] ?? cs[1][2];
  const data = [...(rows ?? [])].sort((a, b) => { const x = getter(a), y = getter(b); return (typeof x === 'string' ? String(x).localeCompare(String(y)) : x - y) * sort.d; });
  const hint = (k: string) => { const h = t(`x_col_${kind}_${k}`); return h === `x_col_${kind}_${k}` ? null : h; };
  const head = (k: string, label: string) => { const h = hint(k); const th = <th class={`sortable ${sort.k === k ? 'on' : ''} ${k === 'name' || k === 'top' || k === 'owner' ? '' : 'r'}`} onClick={() => setSort({ k, d: sort.k === k ? -sort.d : k === 'name' ? 1 : -1 })}>{label}{sort.k === k ? (sort.d < 0 ? ' ▾' : ' ▴') : ''}</th>;
    return h ? <Tip tag="th" content={<div><TipHead name={label} hint={h} /></div>} class={`sortable ${sort.k === k ? 'on' : ''} ${k === 'name' || k === 'top' || k === 'owner' ? '' : 'r'}`} onClick={() => setSort({ k, d: sort.k === k ? -sort.d : k === 'name' ? 1 : -1 })}>{label}{sort.k === k ? (sort.d < 0 ? ' ▾' : ' ▴') : ''}</Tip> : th; };
  return <div class="tab-ledger">
    <Tabs tabs={[['nations', t('realms')], ['markets', t('markets')], ['wars', t('wars')]]} value={kind} onChange={(k) => { setKind(k); setSort({ k: k === 'markets' ? 'priceIndex' : 'score', d: -1 }); }} />
    {!rows ? <Empty>{t('loading')}…</Empty> : <div class="tbl-wrap"><table class="tbl ledger">
      <thead><tr><th class="r">#</th>{cs.map(([k, l]) => head(k, l))}</tr></thead>
      <tbody>{data.slice(0, 250).map((r, i) => kind === 'nations' ? <Tip tag="tr" class={r.id === pid ? 'me' : ''} content={() => <LedgerRowTip r={r} rank={i + 1} />}>
        <td class="r muted">{i + 1}</td>
        <td><NLink id={r.id} size={16} /></td><td class="r">{num(r.score)}</td><td class="r">{num(r.dev)}</td><td class="r">{r.locs}</td><td class="r">{num(r.pop)}</td><td class="r">{num(r.army)}</td><td class="r">{num(r.navy)}</td><td class="r">{num(r.income)}</td><td class="r">{r.tech}</td><td class="r">{num(r.prestige)}</td>
      </Tip> : <tr>
        <td class="r muted">{i + 1}</td>
        {kind === 'markets' && <><td>{r.name}</td><td>{r.owner >= 0 ? <NLink id={r.owner} size={14} /> : '—'}</td><td class={`r ${r.priceIndex > 1.2 ? 'neg' : r.priceIndex < 0.85 ? 'pos' : ''}`}><Tip content={<div><TipHead name={t('price_index')} value={num(r.priceIndex, 2)} hint={t('x_col_markets_priceIndex')} /></div>}>{num(r.priceIndex, 2)}</Tip></td><td class="small">{r.top.map((g: any) => L(g)).join(', ')}</td></>}
        {kind === 'wars' && <><td><a class="lk" onClick={() => (r.att.includes(pid) || r.def.includes(pid)) && openPanel('peace', { war: r.id })}>{L(r.name)}</a></td><td><NList ids={r.att.slice(0, 5)} size={14} /></td><td><NList ids={r.def.slice(0, 5)} size={14} /></td><td class={`r ${r.score >= 0 ? 'pos' : 'neg'}`}><Tip content={<div><TipHead name={t('war_score')} value={signed(r.score)} hint={t('x_col_wars_score')} />{r.parts && <Parts rows={Object.entries(r.parts).map(([k, v]) => [`ws_${k}`, v as number])} />}</div>}>{signed(r.score)}</Tip></td></>}
      </tr>)}</tbody>
    </table></div>}
  </div>;
}

/** Everything about one realm of the ledger: score in parts, largest incomes, levels of knowledge. */
function LedgerRowTip({ r, rank }: { r: any; rank: number }) {
  const parts: [string, number][] = r.scoreParts ?? [];
  return <div class="tip-cols">
    <div><TipHead name={L(r.name)} value={`#${rank}`} hint={t('x_ledger_row_hint')} />
      <Parts title={`${t('score')} ${num(r.score)}`} rows={parts} total={parts.reduce((p, x) => p + x[1], 0)} fmt={(v) => num(v, 1)} /></div>
    <div><Parts title={`${t('income')} ${num(r.income, 1)}`} rows={(r.incomeTop ?? []).map(([k, x]: [string, number]) => [keyName(k), x])} fmt={(v) => num(v, 1)} />
      <div class="breakdown"><div class="bd-title">{t('technology')} {r.tech}</div>{(r.techs ?? []).map((lv: number, k: number) => <div class="bd-row"><span>{realm.value?.tech?.[k] ? L(realm.value.tech[k].name) : k + 1}</span><span>{lv}</span></div>)}</div></div>
  </div>;
}

const CH_ICON: Record<string, string> = { war: '⚔', peace: '☮', battle: '⚔', siege: '♜', event: '✦', doctrine: '✎', great_power: '♛', ruler: '♔', succession: '♔', tech: '✎', era: '⌛', colony: '⚓', discovery: '⚓', revolt: '🔥', faith: '✝', reform: '§' };
export function ChronicleTab() {
  const [own, setOwn] = useState(true);
  const [lim, setLim] = useState(150);
  const pid = playerId.value; const v = view.value;
  const all = chronicle.value;
  const list = all.filter((e) => !own || pid < 0 || e.nation === pid).slice().reverse();
  return <div class="tab-chron">
    <div class="act-row"><label class="chk"><input type="checkbox" checked={own} onChange={(e) => setOwn((e.target as HTMLInputElement).checked)} /> {t('own_realm_only')}</label><span class="spacer" /><span class="muted small">{list.length} {t('entries')}</span></div>
    {!list.length && <Empty>{t('chronicle_empty')}</Empty>}
    <div class="chron">{list.slice(0, lim).map((e) => <div class={`chron-e ${e.loc !== undefined ? 'click' : ''}`} onClick={() => e.loc !== undefined && selectLoc(e.loc)}>
      <span class="ch-date">{v ? fmtDateShort(e.day, v.startYear) : ''}</span>
      <span class="ch-ic">{CH_ICON[e.kind] ?? '•'}</span>
      {e.nation >= 0 && <NLink id={e.nation} size={14} name={false} />}
      <span class="ch-t">{L(e.text)}</span>
    </div>)}</div>
    {list.length > lim && <div class="act-row"><Btn onClick={() => setLim(lim + 200)}>{t('more')}</Btn></div>}
  </div>;
}
