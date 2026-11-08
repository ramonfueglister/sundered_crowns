import { view, nations } from '../game/client';
import { sim } from '../game/client';
import { t, L, lang } from './i18n';
import { Tip, Breakdown } from './Tip';
import { num, signed, pct, rgb } from './format';
import { fmtDate } from '../sim/calendar';
import { openPanel, panel, lastSpeed } from './store';
import { Coa } from './panels';
import { sfx } from './audio';

const KEY_NAMES: Record<string, [string, string]> = {
  tax: ['Taxes', 'Steuern'], trade: ['Trade profits', 'Handelsgewinne'], tariffs: ['Tariffs', 'Zölle'], tribute: ['Tribute', 'Tribut'], contributions: ['War contributions', 'Kriegskontributionen'],
  army: ['Army upkeep', 'Heeresunterhalt'], navy: ['Navy upkeep', 'Flottenunterhalt'], fortresses: ['Fortresses', 'Festungen'], recruitment: ['Recruitment', 'Rekrutierung'], construction: ['Construction', 'Bauten'],
  graft: ['Graft', 'Veruntreuung'], court: ['Court', 'Hof'], interest: ['Interest', 'Zinsen'], mercenaries: ['Mercenaries', 'Söldner'], scholars: ['Scholars', 'Gelehrte'], agents: ['Preachers & officials', 'Prediger & Beamte'],
  colonists: ['Colonists', 'Kolonisten'], coinage: ['Coinage', 'Münzgewinn'], loans: ['Loans', 'Kredite'], subsidies: ['Subsidies', 'Subsidien'], gifts: ['Gifts', 'Geschenke'],
};
export const keyName = (k: string) => KEY_NAMES[k]?.[lang.value === 'de' ? 1 : 0] ?? k.replace(/_/g, ' ');

export function TopBar() {
  const v = view.value; if (!v) return null;
  const p = v.player; const n = p ? nations.value[p.id] : null;
  const date = fmtDate(v.day, v.startYear, lang.value);
  const sp = v.speed;
  const setSp = (x: number) => { sfx('click'); if (x > 0) lastSpeed.value = x; sim().speed(x); };
  const net = p ? p.income - p.expense : 0;
  return <div class="topbar">
    {n && p && <button class="tb-flag" onClick={() => openPanel('government')}><Coa coa={n.coa} color={n.color} size={34} /><span class="tb-name">{L(n.short)}</span></button>}
    {p && <>
      <Tip content={() => <><Breakdown title={t('income')} rows={Object.entries(p.incomeBreak).map(([k, x]) => [keyName(k), x])} total={p.income} /><Breakdown title={t('expenses')} rows={Object.entries(p.expenseBreak).map(([k, x]) => [keyName(k), -x])} total={-p.expense} /></>}>
        <div class="stat" onClick={() => openPanel('economy')}><i class="ic gold" />{num(p.treasury)}<small class={net >= 0 ? 'pos' : 'neg'}>{signed(net)}</small></div>
      </Tip>
      <Tip content={<div><b>{t('manpower')}</b><div>{num(p.manpower)} / {num(p.maxManpower)}</div><div class="muted">{lang.value === 'de' ? 'Wehrfähige Bauern und Tagelöhner; erholt sich monatlich je nach Kontrolle.' : 'Able-bodied peasants and labourers; recovers monthly depending on control.'}</div><div>{t('sailors')}: {num(p.sailors)}</div></div>}>
        <div class="stat" onClick={() => openPanel('military')}><i class="ic men" />{num(p.manpower)}</div>
      </Tip>
      <Tip content={<div><b>{t('concord')}</b> {num(p.concord)}<div class="muted">{lang.value === 'de' ? 'Innerer Friede des Reiches. Niedrig: Unruhe, weniger Steuern, Aufstände.' : 'Internal peace of the realm. Low: unrest, lower taxes, revolts.'}</div></div>}>
        <div class={`stat ${p.concord < 0 ? 'neg' : ''}`} onClick={() => openPanel('government')}><i class="ic concord" />{num(p.concord)}</div>
      </Tip>
      <Tip content={<div><b>{t('mandate')}</b> {num(p.mandate)}<div class="muted">{lang.value === 'de' ? 'Wie rechtmäßig die Herrschaft erscheint. Wirkt auf Diplomatie, Eintracht und Thronfolge.' : 'How rightful the rule appears. Affects diplomacy, concord and succession.'}</div></div>}>
        <div class="stat" onClick={() => openPanel('government')}><i class="ic mandate" />{num(p.mandate)}</div>
      </Tip>
      <Tip content={<div><b>{t('authority')}</b> {num(p.authority)}<div class="muted">{lang.value === 'de' ? 'Politisches Kapital für Reformen, Ämter und Privilegien.' : 'Political capital for reforms, offices and privileges.'}</div></div>}>
        <div class="stat" onClick={() => openPanel('government')}><i class="ic authority" />{num(p.authority)}</div>
      </Tip>
      <Tip content={<div><b>{t('prestige')}</b> {num(p.prestige)}</div>}><div class="stat"><i class="ic prestige" />{num(p.prestige)}</div></Tip>
      <Tip content={<div><b>{t('insight')}</b> {num(p.insight)}<div class="muted">{lang.value === 'de' ? 'Wird für Doktrinen ausgegeben.' : 'Spent on doctrines.'}</div></div>}><div class="stat" onClick={() => openPanel('knowledge')}><i class="ic insight" />{num(p.insight)}</div></Tip>
      <Tip content={<div><b>{t('envoys')}</b> {p.envoys - p.envoysBusy} / {p.envoys}</div>}><div class="stat" onClick={() => openPanel('diplomacy')}><i class="ic envoy" />{p.envoys - p.envoysBusy}/{p.envoys}</div></Tip>
      {p.warExhaustion > 1 && <Tip content={<div><b>{t('war_exhaustion')}</b> {num(p.warExhaustion)}</div>}><div class="stat neg"><i class="ic exhaust" />{num(p.warExhaustion)}</div></Tip>}
      {p.inflation > 0.005 && <Tip content={<div><b>{t('inflation')}</b> {pct(p.inflation, 1)}</div>}><div class="stat neg">⚖ {pct(p.inflation, 1)}</div></Tip>}
    </>}
    <div class="tb-spacer" />
    <div class="tb-menu">
      {(['economy', 'government', 'diplomacy', 'military', 'knowledge', 'society', 'decisions', 'ledger', 'chronicle'] as const).map((k) => <button class={panel.value === k ? 'on' : ''} onClick={() => { sfx('open'); openPanel(k); }}>{t(k)}</button>)}
    </div>
    <div class="tb-date">
      <div class="date">{date}</div>
      <div class="speeds">
        <button class={sp === 0 ? 'on' : ''} onClick={() => setSp(0)} title={t('paused')}>⏸</button>
        {[1, 2, 3, 4, 5].map((x) => <button class={sp === x ? 'on' : ''} onClick={() => setSp(x)}>{'›'.repeat(x)}</button>)}
      </div>
      <Tip content={`${num(v.msPerDay, 1)} ms/day`}><div class="perf" /></Tip>
    </div>
    <button class="tb-gear" onClick={() => openPanel('pause')}>☰</button>
  </div>;
}
void rgb;
