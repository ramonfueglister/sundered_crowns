import { useLayoutEffect, useRef, useEffect } from 'preact/hooks';
import { view, nations } from '../game/client';
import { sim } from '../game/client';
import { t, L, lang } from './i18n';
import { Tip } from './Tip';
import { num, signed, pct, rgb } from './format';
import { fmtDate } from '../sim/calendar';
import { openPanel, panel, lastSpeed, settings } from './store';
import { Coa } from './panels';
import { TreasuryTip, ManpowerTip, ConcordTip, MandateTip, AuthorityTip, PrestigeTip, InsightTip, EnvoysTip, WarExhaustionTip, InflationTip } from './panels/explain';
import { sfx } from './audio';
import { keyFor, keyLabel } from './keys';

const KEY_NAMES: Record<string, [string, string]> = {
  tax: ['Taxes', 'Steuern'], trade: ['Trade profits', 'Handelsgewinne'], tariffs: ['Tariffs', 'Zölle'], tribute: ['Tribute', 'Tribut'], contributions: ['War contributions', 'Kriegskontributionen'],
  army: ['Army upkeep', 'Heeresunterhalt'], navy: ['Navy upkeep', 'Flottenunterhalt'], fortresses: ['Fortresses', 'Festungen'], recruitment: ['Recruitment', 'Rekrutierung'], construction: ['Construction', 'Bauten'],
  graft: ['Graft', 'Veruntreuung'], court: ['Court', 'Hof'], splendour: ['Splendour of a full chest', 'Prachtentfaltung des vollen Schatzes'], interest: ['Interest', 'Zinsen'], mercenaries: ['Mercenaries', 'Söldner'], scholars: ['Scholars', 'Gelehrte'], agents: ['Preachers & officials', 'Prediger & Beamte'],
  colonists: ['Colonists', 'Kolonisten'], coinage: ['Coinage', 'Münzgewinn'], loans: ['Loans', 'Kredite'], subsidies: ['Subsidies', 'Subsidien'], gifts: ['Gifts', 'Geschenke'],
  company: ['Company profits', 'Kompaniegewinne'], charter: ['Company charters', 'Kompaniegründungen'], minting: ['Minting', 'Münzprägung'], loan_repay: ['Loan repayment', 'Kredittilgung'],
  refunds: ['Refunds of cancelled orders', 'Erstattungen abgebrochener Aufträge'],
  expeditions: ['Expeditions', 'Expeditionen'],
  // ---- truth pass: tax instruments, privateering, production methods
  // ---- realm pass: the imperial tax, gifts to the Powers, situation actions
  imperial_tax: ['Common Penny', 'Gemeiner Pfennig'], situations: ['Situations', 'Lagen'],
  land_tax: ['Land tax', 'Grundsteuer'], hearth_tax: ['Hearth tax', 'Herdsteuer'], excise: ['Excise', 'Akzise'], privateers: ['Privateering', 'Kaperei'], methods: ['Reorganised workshops', 'Umgestellte Werkstätten'],
  // ---- war pass: obligations of a peace and the refill of regiments
  reparations: ['War reparations', 'Kriegsentschädigung'], trade_privileges: ['Trade privileges', 'Handelsprivilegien'], reinforcements: ['Reinforcements', 'Verstärkungen'],
  // ---- fix-econ: event gold, generals' pay, the movements of the credit ledger (systems/economy.ts closeLedger)
  events: ['Events', 'Ereignisse'], generals: ['Generals', 'Feldherren'], written_off: ['Deficit written off (bankrupt)', 'Abgeschriebenes Defizit (Bankrott)'],
  other: ['Other movements', 'Sonstige Bewegungen'],
  landmark: ['Landmarks', 'Wahrzeichen'], espionage: ['Espionage', 'Spionage'], exactions: ['Exacted payments', 'Erpresste Zahlungen'],
  appease: ['Appeasing the estates', 'Beschwichtigung der Stände'], peace_gold: ['Gold from peace treaties', 'Gold aus Friedensverträgen'],
  privileges: ['Paid for privileges', 'Zahlungen für Privilegien'], church_lands: ['Seized church lands', 'Eingezogene Kirchengüter'],
  parias: ['Parias (yearly tribute)', 'Parias (Jahrestribut)'], inherited: ['Treasury taken over', 'Übernommener Staatsschatz'],
};
export const keyName = (k: string) => KEY_NAMES[k]?.[lang.value === 'de' ? 1 : 0] ?? k.replace(/_/g, ' ');

// Main menu entries: icon, short label for narrow screens, keyboard shortcut (full name and shortcut in the tooltip).
const MENU = [
  { k: 'economy', icon: '⚖', key: 'E', main: true }, { k: 'government', icon: '♛', key: 'G', main: true }, { k: 'diplomacy', icon: '✉', key: 'Shift+D', main: true },
  { k: 'military', icon: '⚔', key: 'M', main: true }, { k: 'trade', icon: '⚓', key: '', main: false }, { k: 'explore', icon: '🧭', key: '', main: false }, { k: 'works', icon: '⚒', key: 'B', main: false }, { k: 'knowledge', icon: '⚗', key: 'K', main: false }, { k: 'society', icon: '✝', key: '', main: false },
  { k: 'empire', icon: '♚', key: '', main: false }, { k: 'decisions', icon: '⚑', key: '', main: false }, { k: 'ledger', icon: '▤', key: 'L', main: false }, { k: 'chronicle', icon: '❧', key: 'C', main: false },
  { k: 'victory', icon: '♕', key: 'V', main: false },
] as const;
const MAX_LEVEL = 5;
const SHORT: Record<string, [string, string]> = { victory: ['Victory', 'Sieg'], empire: ['Empire', 'Reich'], trade: ['Trade', 'Handel'], explore: ['Discovery', 'Entdeckung'], works: ['Works', 'Bauten'], government: ['Rule', 'Herrschaft'], society: ['Society', 'Glaube'], decisions: ['Goals', 'Ziele'], knowledge: ['Learning', 'Wissen'] };
const short = (k: string) => SHORT[k]?.[lang.value === 'de' ? 1 : 0] ?? t(k);
/** Full names of the panels (some differ from the generic word: "Herrschaft", "Goals & decisions"). */
export const panelName = (k: string) => { const v = t(`nav_${k}`); return v === `nav_${k}` ? t(k) : v; };

/**
 * The bar compacts itself until nothing overflows: 0 full labels, 1 short labels, 2 short labels only for the four main
 * entries, 3 icons only, 4 also without the realm name, 5 two rows (the realm's figures and ☰ above, the panels, the date
 * and the speeds below; the panels below the bar move down by its height, --tb-h). The level is a class set directly on the bar and tried synchronously
 * (no re-render per step); it is re-checked after every render (numbers grow) and starts again from 0 when the window,
 * the language or the UI scale changes.
 */
function useCompaction(dep: string) {
  const ref = useRef<HTMLDivElement>(null);
  const level = useRef(0), lastDep = useRef('');
  const fit = (reset: boolean) => {
    const el = ref.current; if (!el) return;
    const apply = (l: number) => { for (let i = 0; i <= MAX_LEVEL; i++) el.classList.toggle(`tb-l${i}`, i === l); };
    let l = reset ? 0 : level.current;
    apply(l);
    while (el.scrollWidth > el.clientWidth + 1 && l < MAX_LEVEL) apply(++l);
    level.current = l;
    document.documentElement.style.setProperty('--tb-h', `${el.offsetHeight}px`);
  };
  useEffect(() => { const f = () => fit(true); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  useLayoutEffect(() => { const reset = lastDep.current !== dep; lastDep.current = dep; fit(reset); });
  return ref;
}

export function TopBar() {
  const ref = useCompaction(`${lang.value}|${settings.value.uiScale}|${view.value?.player?.id ?? -1}`);
  const v = view.value; if (!v) return null;
  const p = v.player; const n = p ? nations.value[p.id] : null;
  const date = fmtDate(v.day, v.startYear, lang.value);
  const sp = v.speed;
  const setSp = (x: number) => { sfx('click'); if (x > 0) lastSpeed.value = x; sim().speed(x); };
  const net = p ? p.income - p.expense : 0;
  return <div class="topbar" ref={ref}>
    {n && p && <button class="tb-flag" title={L(n.name)} onClick={() => openPanel('government')}><Coa coa={n.coa} color={n.color} size={34} /><span class="tb-name">{L(n.short)}</span></button>}
    {p && <>
      <Tip content={() => <TreasuryTip />}>
        <div class="stat" onClick={() => openPanel('economy')}><i class="ic gold" />{num(p.treasury)}<small class={net >= 0 ? 'pos' : 'neg'}>{signed(net)}</small></div>
      </Tip>
      <Tip content={() => <ManpowerTip />}>
        <div class="stat" onClick={() => openPanel('military')}><i class="ic men" />{num(p.manpower)}</div>
      </Tip>
      <Tip content={() => <ConcordTip />}>
        <div class={`stat ${p.concord < 0 ? 'neg' : ''}`} onClick={() => openPanel('government')}><i class="ic concord" />{num(p.concord)}</div>
      </Tip>
      <Tip content={() => <MandateTip />}>
        <div class="stat" onClick={() => openPanel('government')}><i class="ic mandate" />{num(p.mandate)}</div>
      </Tip>
      <Tip content={() => <AuthorityTip />}>
        <div class="stat" onClick={() => openPanel('government')}><i class="ic authority" />{num(p.authority)}</div>
      </Tip>
      <Tip content={() => <PrestigeTip />}><div class="stat" onClick={() => openPanel('diplomacy')}><i class="ic prestige" />{num(p.prestige)}</div></Tip>
      <Tip content={() => <InsightTip />}><div class="stat" onClick={() => openPanel('knowledge')}><i class="ic insight" />{num(p.insight)}</div></Tip>
      <Tip content={() => <EnvoysTip />}><div class="stat" onClick={() => openPanel('diplomacy')}><i class="ic envoy" />{p.envoys - p.envoysBusy}/{p.envoys}</div></Tip>
      {p.warExhaustion > 1 && <Tip content={() => <WarExhaustionTip />}><div class="stat neg" onClick={() => openPanel('military')}><i class="ic exhaust" />{num(p.warExhaustion)}</div></Tip>}
      {p.inflation > 0.005 && <Tip content={() => <InflationTip />}><div class="stat neg" onClick={() => openPanel('economy')}><i class="ic inflation" />{pct(p.inflation, 1)}</div></Tip>}
    </>}
    <div class="tb-spacer" />
    <div class="tb-break" />
    <div class="tb-menu">
      {MENU.map(({ k, icon, main }) => { const key = keyLabel(keyFor(`panel_${k}`), lang.value === 'de'); return <Tip content={<div><b>{panelName(k)}</b>{key && <span class="muted"> ({key})</span>}</div>}>
        <button class={`${panel.value === k ? 'on' : ''} ${main ? 'main' : ''}`} aria-label={panelName(k)} onClick={() => { sfx('open'); openPanel(k); }}>
          <span class="tb-ic" aria-hidden="true">{icon}</span><span class="tb-lbl tb-full">{panelName(k)}</span><span class="tb-lbl tb-short">{short(k)}</span>
        </button>
      </Tip>; })}
    </div>
    <div class="tb-date">
      <div class="date">{date}</div>
      <div class="speeds">
        <button class={sp === 0 ? 'on' : ''} onClick={() => setSp(0)} title={`${t('paused')} (${keyLabel(keyFor('pause'), lang.value === 'de')})`}>⏸</button>
        {[1, 2, 3, 4, 5].map((x) => <button class={sp === x ? 'on' : ''} onClick={() => setSp(x)} title={`${t('speed')} ${x} (${keyLabel(keyFor('faster'), lang.value === 'de')} / ${keyLabel(keyFor('slower'), lang.value === 'de')})`}>{'›'.repeat(x)}</button>)}
      </div>
    </div>
    <button class="tb-gear" onClick={() => openPanel('pause')} title={`${t('paused')} (${keyLabel(keyFor('back'), lang.value === 'de')})`}>☰</button>
  </div>;
}
void rgb;

