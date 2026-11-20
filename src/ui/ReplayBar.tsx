// The bar of the border replay (replay.ts) at the bottom of the screen.
import { fmtDate } from '../sim/calendar';
import { lang, t } from './i18n';
import { IconClose, IconPause, IconPlay } from './icons';
import {
  REPLAY_SPEEDS,
  replayClock,
  replayError,
  replayLoading,
  replaySpeed,
  seekReplay,
  stopReplay,
  toggleReplay,
} from './replay';

/** The replay's bar at the bottom while it plays (replay.ts): play and pause, the timeline, the date, the speed and back to the world. */
export function ReplayBar() {
  const c = replayClock.value,
    err = replayError.value;
  if (replayLoading.value)
    return (
      <div class="replay-bar pnl">
        <span class="muted">{t('replay_loading')}</span>
      </div>
    );
  if (err && !c)
    return (
      <div class="replay-bar pnl">
        <span class="neg">{t('replay_failed', { why: err })}</span>
        <button type="button" class="close" title={t('close')} aria-label={t('close')} onClick={() => stopReplay()}>
          <IconClose />
        </button>
      </div>
    );
  if (!c) return null;
  const date = fmtDate(Math.floor(c.day), c.startYear, lang.value),
    first = fmtDate(c.from, c.startYear, lang.value),
    last = fmtDate(c.to, c.startYear, lang.value);
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would bring its own border, padding and least width into the bar; the group role names the controls the same
    <div class="replay-bar pnl" role="group" aria-label={t('replay')}>
      <button
        type="button"
        class="tool"
        aria-label={t(c.playing ? 'replay_pause' : 'replay_play')}
        title={`${t(c.playing ? 'replay_pause' : 'replay_play')} (${t('key')} ␣)`}
        onClick={() => toggleReplay()}
      >
        {c.playing ? <IconPause /> : <IconPlay />}
      </button>
      <span class="replay-date">{date}</span>
      <input
        class="replay-line"
        type="range"
        min={c.from}
        max={c.to}
        step={1}
        value={Math.floor(c.day)}
        aria-label={t('replay_timeline')}
        title={`${first} – ${last}`}
        onInput={(e) => seekReplay(Number((e.target as HTMLInputElement).value))}
      />
      <div class="replay-speed" role="radiogroup" aria-label={t('replay_speed')}>
        {REPLAY_SPEEDS.map((f, k) => (
          // biome-ignore lint/a11y/useSemanticElements: a button in the radio role keeps the look of the other small buttons; a native radio input would need a label round its text
          <button
            type="button"
            key={k}
            role="radio"
            aria-checked={c.speed === k + 1}
            class={`btn small${c.speed === k + 1 ? ' gold' : ''}`}
            onClick={() => replaySpeed(k + 1)}
          >{`${f < 1 ? `1/${1 / f}` : f}×`}</button>
        ))}
      </div>
      <button
        type="button"
        class="close"
        title={`${t('replay_stop')} (Esc)`}
        aria-label={t('replay_stop')}
        onClick={() => stopReplay()}
      >
        <IconClose />
      </button>
    </div>
  );
}
