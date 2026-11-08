// World clock for online play: in-game date plus a countdown to the next day. Usable in the top bar.
import { useEffect, useState } from 'preact/hooks';
import { worldInfo, msToNextDay, isOnline, queuedCmds } from '../../online/worldClient';
import { view } from '../../game/client';
import { fmtDate } from '../../sim/calendar';
import { lang } from '../i18n';
import { tt, fmtDuration } from './strings';

export function WorldClock({ compact = false }: { compact?: boolean }) {
  const [, setT] = useState(0);
  useEffect(() => { const h = setInterval(() => setT((x) => x + 1), 250); return () => clearInterval(h); }, []);
  const w = worldInfo.value; if (!w || !isOnline.value) return null;
  const day = view.value?.day ?? w.day;
  const left = msToNextDay();
  const frac = left === null ? 0 : 1 - left / Math.max(1, w.secondsPerDay * 1000);
  return <div class={`sc-clock ${compact ? 'compact' : ''}`} title={`${w.name} · ${tt('season')} ${w.season}`}>
    <span class="sc-clock-date">{fmtDate(day, w.startYear, lang.value)}</span>
    {left === null ? <span class="sc-clock-paused">{tt('paused')}</span>
      : <span class="sc-clock-next">{tt('next_day')} {fmtDuration(left)}<span class="sc-clock-bar"><i style={{ width: `${Math.round(frac * 100)}%` }} /></span></span>}
    {queuedCmds.value > 0 && <span class="sc-clock-queued" title={tt('queued')}>⧗ {queuedCmds.value}</span>}
  </div>;
}
