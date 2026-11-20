// Application shell: the world (WorldView) with the HUD (banner, value bar, map tools) and the panel of the selected place.
// For now everyone only watches the world (Ramon, 15 November 2026: "im moment nur zuschauer möglichkeit"): the game opens at
// once as an observer and offers no sign-in. The server still knows players (server/auth.ts) for later.
import { useEffect } from 'preact/hooks';
import { startMusic, musicKey } from '../audio/music';
import { connect, disconnect, refusal, status } from '../net/client';
import { lang, t } from './i18n';
import { IconDefs } from './icons';
import { selectedPlace } from './mapstate';
import { PlacePanel } from './PlacePanel';
import { RealmBanner } from './RealmBanner';
import { ReplayBar } from './ReplayBar';
import { LangSwitch } from './Settings';
import { TopBar } from './TopBar';
import { WorldView } from './WorldView';

export function App() {
  const st = status.value;
  // watch at once, as an observer
  useEffect(() => {
    connect({});
    return () => disconnect();
  }, []);
  return (
    <div class={`app lang-${lang.value}`}>
      <IconDefs />
      {st === 'refused' ? (
        <Refused />
      ) : (
        <>
          <WorldView />
          <Music />
          <TopBar />
          <RealmBanner />
          <ReplayBar />
          {st !== 'open' && <div class="notice">{st === 'connecting' ? t('connecting') : t('disconnected')}</div>}
          {selectedPlace.value >= 0 && <PlacePanel />}
        </>
      )}
    </div>
  );
}

/** Starts the background music with the game view and listens for M (on/off) and N (next piece). */
function Music() {
  useEffect(() => {
    startMusic();
    const key = (e: KeyboardEvent) => {
      if (musicKey(e)) e.preventDefault();
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);
  return null;
}

/** What the server said when it turned the game away (an old client after an update, too many connections). */
function Refused() {
  return (
    <div class="menu">
      <div class="menu-bg" />
      <div class="menu-box">
        <h1>{t('title')}</h1>
        <p class="muted">{t('tagline')}</p>
        {refusal.value && <p class="neg">{refusal.value}</p>}
        <button type="button" class="btn big gold" onClick={() => location.reload()}>
          {t('reload')}
        </button>
        <div class="menu-foot">
          <LangSwitch />
        </div>
      </div>
    </div>
  );
}
