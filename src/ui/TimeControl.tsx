// The world's clock in the top bar: the date, pause and the speeds, and the keys for them.
import { useEffect } from 'preact/hooks';
import { me, setTime, world } from '../net/client';
import { SPEEDS } from '../net/protocol';
import { fmtDate } from '../sim/calendar';
import { lang, t } from './i18n';
import { IconCalendar, IconPause, IconPlay } from './icons';
import { replayClock, stopReplay, toggleReplay } from './replay';

/** Seconds as the time control says them: "4 min", "2 s", "0,25 s". */
const secondsText = (ms: number) =>
  ms >= 60_000
    ? `${Math.round(ms / 60_000)} min`
    : `${(ms / 1000).toLocaleString(lang.value === 'de' ? 'de-CH' : 'en-GB', { maximumFractionDigits: 2 })} s`;
/** What a speed of the world's clock means, for its tooltip. */
function speedText(speed: number, secondsPerDay: number) {
  const v = SPEEDS[speed - 1];
  return v === 'own'
    ? t('time_speed_own', { s: secondsText(secondsPerDay * 1000) })
    : v === 0
      ? t('time_speed_max')
      : t('time_speed_ms', { s: secondsText(v) });
}

/** The world's clock top left (Ramon, 19 November 2026: "zeit beschleunigung links oben", for debugging too): the date,
 *  pause and five speeds, as the grand strategy games have it. Space pauses, + and − change the speed. Who may not
 *  change the time (`me.time`, see server/world.ts) sees the clock as it runs. */
export function TimeControl() {
  const wi = world.value,
    may = !!me.value?.time,
    speed = wi?.speed ?? 1,
    paused = !!wi?.paused;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
      if (replayClock.value && (e.code === 'Space' || e.key === 'Escape')) {
        e.preventDefault();
        if (e.key === 'Escape') stopReplay();
        else toggleReplay();
        return;
      }
      const w = world.value;
      if (!me.value?.time || !w) return;
      const now = w.speed ?? 1;
      if (e.code === 'Space') {
        e.preventDefault();
        setTime({ paused: !w.paused });
      } else if (e.key === '+' || e.code === 'NumpadAdd') {
        e.preventDefault();
        setTime({ speed: Math.min(SPEEDS.length, now + 1) });
      } else if (e.key === '-' || e.code === 'NumpadSubtract') {
        e.preventDefault();
        setTime({ speed: Math.max(1, now - 1) });
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);
  const lock = may ? '' : `\n${t('time_locked')}`;
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would bring its own border, padding and least width into the bar; the group role names the controls the same
    <div class={`timectl${paused ? ' paused' : ''}`} role="group" aria-label={t('time_control')}>
      <span class="timectl-date" title={wi ? speedText(speed, wi.secondsPerDay) : ''}>
        <IconCalendar size={22} />
        <span>{wi ? fmtDate(wi.day, wi.startYear, lang.value) : '…'}</span>
        {paused && <small>{t('paused')}</small>}
      </span>
      <button
        type="button"
        class="tool timectl-pause"
        disabled={!may || !wi}
        aria-pressed={paused}
        aria-label={t(paused ? 'time_run' : 'time_pause')}
        title={`${t(paused ? 'time_run' : 'time_pause')} (${t('key')} ␣)${lock}`}
        onClick={() => setTime({ paused: !paused })}
      >
        {paused ? <IconPlay /> : <IconPause />}
      </button>
      <button
        type="button"
        class="timectl-step"
        disabled={!may || speed <= 1}
        aria-label={t('time_slower')}
        title={`${t('time_slower')} (−)${lock}`}
        onClick={() => setTime({ speed: speed - 1 })}
      >
        −
      </button>
      <div class="timectl-pips">
        {SPEEDS.map((_, k) => (
          <button
            type="button"
            key={k}
            class={`pip${k < speed ? ' on' : ''}`}
            disabled={!may || !wi}
            aria-pressed={k + 1 === speed}
            aria-label={t('time_speed', { n: k + 1 })}
            title={`${t('time_speed', { n: k + 1 })}: ${wi ? speedText(k + 1, wi.secondsPerDay) : ''}\n${t('time_keys')}${lock}`}
            onClick={() => setTime({ speed: k + 1, paused: false })}
          />
        ))}
      </div>
      <button
        type="button"
        class="timectl-step"
        disabled={!may || speed >= SPEEDS.length}
        aria-label={t('time_faster')}
        title={`${t('time_faster')} (+)${lock}`}
        onClick={() => setTime({ speed: speed + 1 })}
      >
        +
      </button>
    </div>
  );
}
