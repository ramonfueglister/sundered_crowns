// Browser notifications (spec point 106, opt-in in the settings): while the game runs in a hidden tab, a war against
// us, a battle of ours and an event that waits for our choice raise a system notification. Works the same in single
// player and in the persistent world (both fill the same notice and view signals).
import { effect } from '@preact/signals';
import { notices, view } from '../game/client';
import { settings, playerId } from './store';
import { t, L } from './i18n';

const KINDS: Record<string, string> = { war: 'x_notify_war', coalition: 'x_notify_war', civil_war: 'x_notify_war', battle: 'x_notify_battle' };

function canNotify(): boolean {
  return settings.value.notify && typeof document !== 'undefined' && document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted';
}
function show(title: string, body: string, tag: string) {
  try { const n = new Notification(title, { body, tag, icon: '/favicon.svg' }); n.onclick = () => { window.focus(); n.close(); }; } catch { /* some browsers only allow notifications from a service worker */ }
}

let started = false;
/** Starts watching the notices and pending events (once). */
export function startNotifications() {
  if (started) return; started = true;
  let lastNotice = -1; let lastPending: Set<number> | null = null;
  effect(() => {
    const list = notices.value; const me = playerId.value;
    if (!list.length) { lastNotice = -1; return; } // a new game or world: start counting again
    // what is there when the game starts or loads is not news
    const fresh = lastNotice < 0 ? [] : list.filter((n) => n.id > lastNotice);
    lastNotice = Math.max(lastNotice, 0);
    if (list.length) lastNotice = Math.max(lastNotice, ...list.map((n) => n.id));
    if (!canNotify()) return;
    for (const n of fresh) {
      const k = KINDS[n.kind]; if (!k || (me >= 0 && n.nation !== me)) continue;
      // a war only when it is declared on us (the notice of a war we declare ourselves needs no alarm)
      if (n.kind === 'war' && n.war !== undefined && !view.peek()?.wars?.some((w) => w.id === n.war && w.def.includes(me))) continue;
      show(t(k), L(n.text), `sc-${n.kind}-${n.id}`);
    }
  });
  effect(() => {
    const v = view.value; if (!v) return;
    const ids = new Set<number>((v.pending ?? []).map((p: any) => p.id));
    const fresh = lastPending ? [...ids].filter((id) => !lastPending!.has(id)) : []; lastPending = ids;
    if (!fresh.length || !canNotify()) return;
    const p = (v.pending ?? []).find((x: any) => x.id === fresh[0]);
    show(t('x_notify_event'), p ? L(p.title) : '', `sc-event-${fresh[0]}`);
  });
}
