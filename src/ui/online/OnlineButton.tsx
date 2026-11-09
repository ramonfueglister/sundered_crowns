// Main-menu entry to the online world (accounts, worlds, cloud saves) and the in-game online HUD.
import { useEffect } from 'preact/hooks';
import { t } from '../i18n';
import { screen, showToast } from '../store';
import { L } from '../i18n';
import { ACHIEVEMENT_INDEX } from '../../online/achievements';
import { isOnline, heraldMsg, freshAchievements, offers, seat, catchUp } from '../../online/worldClient';
import { CatchUpWindow, catchUpOpen } from './CatchUpWindow';
import { OnlinePanel } from './OnlinePanel';
import { onlineOpen, openOnline } from './state';
import { WorldClock } from './WorldClock';
import { tt } from './strings';

/** Button for the main menu; opens the online panel as a modal. */
export function OnlineButton() {
  return <>
    <button class="btn" onClick={() => openOnline('world')}>{t('online')}</button>
    {onlineOpen.value && screen.value === 'menu' && <div class="modal-wrap" onClick={(e) => { if (e.target === e.currentTarget) onlineOpen.value = false; }}><OnlinePanel /></div>}
  </>;
}

/** In-game: world clock, quick buttons and the online panel. Renders nothing in single player. */
export function OnlineHud() {
  useEffect(() => { const m = heraldMsg.value; if (m) showToast(`${tt('herald')}: ${m.text}`); }, [heraldMsg.value?.at]);
  useEffect(() => { const f = freshAchievements.value; if (f.length) { showToast(`★ ${f.map((k) => L(ACHIEVEMENT_INDEX[k]?.name ?? k)).join(', ')}`); freshAchievements.value = []; } }, [freshAchievements.value.length]);
  if (!isOnline.value || screen.value !== 'game') return null;
  const incoming = offers.value.filter((o) => o.to === seat.value?.nation).length;
  return <>
    <div class="sc-hud wood">
      <WorldClock />
      <button class="btn small" onClick={() => openOnline('messages')}>{tt('messages')}{incoming ? <b class="sc-badge">{incoming}</b> : null}</button>
      <button class="btn small" onClick={() => openOnline('orders')}>{tt('orders')}</button>
      <button class="btn small" onClick={() => openOnline('world')}>{tt('open_online')}</button>
      {catchUp.value && <button class="btn small" title={tt('cu_open')} aria-label={tt('cu_open')} onClick={() => { catchUpOpen.value = true; }}>⟲</button>}
    </div>
    <CatchUpWindow />
    {onlineOpen.value && <div class="modal-wrap" onClick={(e) => { if (e.target === e.currentTarget) onlineOpen.value = false; }}><OnlinePanel /></div>}
  </>;
}
