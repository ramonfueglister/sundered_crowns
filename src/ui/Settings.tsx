// The controls of the settings menu (TopBar): the music and the language.
import { lang, setLang, t } from './i18n';
import { musicMuted, musicVolume, musicWaiting, nowPlaying, setMuted, setVolume, skip } from '../audio/music';

/** Music settings in the settings menu: on/off, volume, the piece now playing and the next one. */
export function MusicSettings() {
  const off = musicMuted.value;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: the click is only kept from closing the menu (TopBar); the controls inside are buttons and inputs, which take the keyboard themselves
    <div class="music-set" onClick={(e) => e.stopPropagation()}>
      <div class="music-row">
        <span class="music-label">{t('music')}</span>
        <button
          type="button"
          class="btn small"
          aria-pressed={!off}
          title={`${t(off ? 'music_on' : 'music_off')} (M)`}
          onClick={() => setMuted(!off)}
        >
          {t(off ? 'music_on' : 'music_off')}
        </button>
      </div>
      <input
        class="music-vol"
        type="range"
        min={0}
        max={100}
        step={1}
        value={musicVolume.value}
        aria-label={t('music_volume')}
        title={`${t('music_volume')}: ${musicVolume.value}`}
        onInput={(e) => setVolume(Number((e.target as HTMLInputElement).value))}
      />
      <div class="music-row">
        <small class="music-now">
          {off ? t('music_is_off') : musicWaiting.value ? t('music_waiting') : (nowPlaying.value ?? '…')}
        </small>
        {!off && (
          <button
            type="button"
            class="btn small"
            title={`${t('music_next')} (N)`}
            aria-label={t('music_next')}
            onClick={() => skip()}
          >
            »
          </button>
        )}
      </div>
    </div>
  );
}

export function LangSwitch() {
  return (
    <button type="button" class="btn small" onClick={() => setLang(lang.value === 'de' ? 'en' : 'de')}>
      {lang.value === 'de' ? 'EN' : 'DE'}
    </button>
  );
}
