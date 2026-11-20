// The top bar of the HUD: the clock, the map modes, the replay, the player's places and the settings menu.
import { useEffect, useRef, useState } from 'preact/hooks';
import { abdicate, status } from '../net/client';
import { type TextKey, L, num, t } from './i18n';
import { IconGear, IconPlaces, IconPolitical, IconReplay, IconRulers, IconTerrain } from './icons';
import { MAP_MODES, mapMode, mapModeKey, setMapMode } from './mapmode';
import { ARMS, myRealm } from './realms';
import { replay, replayClock, replayError, startReplay, stopReplay } from './replay';
import { LangSwitch, MusicSettings } from './Settings';
import { TimeControl } from './TimeControl';

const MODE_ICON = { political: IconPolitical, terrain: IconTerrain, rulers: IconRulers } as const;

/**
 * The map modes in the top bar, in one menu (Ramon, 19 November 2026: "gruppiere die bestehenden map modi in einem
 * gemeinsamen menü"): the button shows the mode shown, a click opens the list of all modes; keys 1, 2 and 3.
 */
function MapModes() {
  const now = mapMode.value,
    [open, setOpen] = useState(false),
    box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      else if (mapModeKey(e)) e.preventDefault();
    };
    // a click anywhere else closes the menu
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    addEventListener('keydown', key);
    addEventListener('pointerdown', away);
    return () => {
      removeEventListener('keydown', key);
      removeEventListener('pointerdown', away);
    };
  }, []);
  const Now = MODE_ICON[now];
  return (
    <div class="mapmodes" ref={box}>
      <button
        type="button"
        class="tool mode"
        aria-pressed="true"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('map_modes')}: ${t(`map_mode_${now}` as TextKey)}`}
        title={`${t('map_modes')}: ${t(`map_mode_${now}` as TextKey)}`}
        onClick={() => setOpen(!open)}
      >
        <Now />
        <span class="caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div class="modemenu" role="menu" aria-label={t('map_modes')}>
          {MAP_MODES.map(({ mode, key }) => {
            const Icon = MODE_ICON[mode],
              name = t(`map_mode_${mode}` as TextKey);
            return (
              <button
                type="button"
                key={mode}
                role="menuitemradio"
                aria-checked={now === mode}
                class="modeitem"
                title={t(`map_mode_${mode}_hint` as TextKey)}
                onClick={() => {
                  setMapMode(mode);
                  setOpen(false);
                }}
              >
                <Icon size={22} />
                <span>{name}</span>
                <kbd>{key}</kbd>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const mine = myRealm.value,
    open = status.value === 'open';
  const [menu, setMenu] = useState(false);
  // no texts in the bar but the date (Ramon, 16 November 2026): the clock top left, the map modes and the settings
  return (
    <header class="hud-top">
      <div class={`hud-values${mine ? ' ruled' : ''}`}>
        <TimeControl />
        <MapModes />
        <button
          type="button"
          class={`tool mode${replay.value ? ' on' : ''}`}
          aria-pressed={!!replayClock.value}
          aria-label={t(replayClock.value ? 'replay_stop' : 'replay')}
          disabled={!open && !replayClock.value}
          title={
            replayClock.value
              ? t('replay_stop')
              : `${t('replay')}\n${t('replay_hint')}${open ? '' : `\n${t('replay_offline')}`}`
          }
          onClick={() => {
            if (replayClock.value || replayError.value) stopReplay();
            else void startReplay();
          }}
        >
          <IconReplay />
        </button>
        {mine && (
          <span class="val" title={`${L(mine.name)}: ${num(mine.places)} ${t('places')}`}>
            <IconPlaces />
            <b>{num(mine.places)}</b>
          </span>
        )}
      </div>
      <button
        type="button"
        class="tb"
        title={t('settings')}
        aria-label={t('settings')}
        aria-expanded={menu}
        onClick={() => setMenu(!menu)}
      >
        <IconGear />
      </button>
      {menu && (
        // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: a click anywhere in the menu closes it; from the keyboard the settings button closes it
        <div class="hud-menu" onClick={() => setMenu(false)}>
          <MusicSettings />
          {/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: the click is only kept from closing the menu; the switch inside is a button */}
          <div class="music-row lang-row" onClick={(e) => e.stopPropagation()}>
            <span class="music-label">{t('language')}</span>
            <LangSwitch />
          </div>
          {mine && (
            <button type="button" class="menu-item danger" onClick={() => abdicate()}>
              {t('abdicate')}
            </button>
          )}
          {mine && ARMS[mine.key] && (
            <p class="credit">
              {t('arms_credit')}{' '}
              <a
                href="https://commons.wikimedia.org/wiki/File:Variant_war_flag_of_the_Serene_Republic_of_Venice.svg"
                target="_blank"
                rel="noreferrer"
              >
                Wikimedia Commons
              </a>
              ,{' '}
              <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">
                CC BY-SA 3.0
              </a>
            </p>
          )}
        </div>
      )}
    </header>
  );
}
