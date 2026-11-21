// What the world's clock in the top bar (TimeControl.tsx) says of its speeds, and its keys: space pauses, + and −
// change the speed; while a replay runs, space pauses the replay and Escape ends it. Kept apart from the component
// so that they can be tested without a page.
import { me, setTime, world } from '../net/client';
import { SPEEDS } from '../net/protocol';
import { lang, t } from './i18n';
import { replayClock, stopReplay, toggleReplay } from './replay';

/** Seconds as the time control says them: "4 min", "2 s", "0.25 s" (in German as in Switzerland, de-CH). */
const secondsText = (ms: number) =>
  ms >= 60_000
    ? `${Math.round(ms / 60_000)} min`
    : `${(ms / 1000).toLocaleString(lang.value === 'de' ? 'de-CH' : 'en-GB', { maximumFractionDigits: 2 })} s`;
/** What a speed of the world's clock means, for its tooltip. */
export function speedText(speed: number, secondsPerDay: number) {
  const v = SPEEDS[speed - 1];
  return v === 'own'
    ? t('time_speed_own', { s: secondsText(secondsPerDay * 1000) })
    : v === 0
      ? t('time_speed_max')
      : t('time_speed_ms', { s: secondsText(v) });
}

/** The keys of the clock; what is typed into a field is not for the clock. Who may not change the time (`me.time`, see
 *  server/world.ts) can still pause and end a replay, which runs in the browser only. */
export function timeKey(e: KeyboardEvent) {
  // (a cast: the target of a key is an element of the page, or nothing)
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
}
