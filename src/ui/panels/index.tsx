// In-game UI panels. App.tsx and TopBar.tsx import exactly these exports.
import './panels.css';
import { panel, screen } from '../store';
import * as store from '../store';
import * as client from '../../game/client';
import { saveNow } from '../saves';
import { Panel, t, useRealm } from './common';
import { EconomyTab } from './economy';
import { GovernmentTab } from './government';
import { DiplomacyTab, MilitaryTab, KnowledgeTab, SocietyTab, DecisionsTab } from './realmtabs';
import { LedgerTab, ChronicleTab } from './records';
import { PeaceTab } from './peace';
import { WorksTab } from './works';
import { BattleTab } from './war';
import { TradeTab } from './trade';
import { ExploreTab } from './explore';
import { EmpireTab } from './empire';
import { panelName } from '../TopBar';
import { SettingsPanel, SavesPanel, PausePanel, DevPanel, EndScreen, loadAndPlay } from './system';

export { Coa } from './coa';
export { LocationPanel } from './location';
export { NationPanel } from './nation';
export { ArmyPanel, Outliner } from './army';
export { Notices, EventModal, Legend } from './overlay';
export { Tutorial } from './tutorial';
export { GoalTracker } from './goals';
export { RealmDialogs } from './realmdialogs';
export { charName } from './people';
export { SettingsPanel, SavesPanel, EndScreen };
export { OnlineButton } from '../online/OnlineButton';

export async function quickSave() { await saveNow(); }

const TABS: Record<string, () => any> = {
  economy: EconomyTab, government: GovernmentTab, diplomacy: DiplomacyTab, military: MilitaryTab, knowledge: KnowledgeTab,
  society: SocietyTab, decisions: DecisionsTab, ledger: LedgerTab, chronicle: ChronicleTab, peace: PeaceTab, works: WorksTab,
  battle: BattleTab,
  trade: TradeTab, explore: ExploreTab,
  empire: EmpireTab,
};
const TITLES: Record<string, string> = { peace: 'offer_peace', battle: 'xw_battle_report' };

/** The big left panel; switches on the `panel` signal. */
export function MainPanel() {
  const p = panel.value;
  useRealm(1000);
  if (p === 'none') return null;
  const close = () => { panel.value = 'none'; };
  if (p === 'pause') return <div class="modal-fixed"><PausePanel /></div>;
  if (p === 'settings') return <div class="modal-fixed" onClick={close}><div onClick={(e) => e.stopPropagation()}><SettingsPanel /></div></div>;
  if (p === 'saves') return <div class="modal-fixed" onClick={close}><div onClick={(e) => e.stopPropagation()}><SavesPanel onLoad={(id) => loadAndPlay(id)} /></div></div>;
  if (p === 'dev') return <DevPanel />;
  const Tab = TABS[p];
  if (!Tab) return null;
  return <Panel title={TITLES[p] ? t(TITLES[p]) : panelName(p)} cls={`main-pnl tab-${p}`} onClose={close}><Tab /></Panel>;
}

// test hook for browser automation in development builds
if (import.meta.env?.DEV && typeof window !== 'undefined') (window as any).__sc = { store, sim: client.sim, client, screen };
