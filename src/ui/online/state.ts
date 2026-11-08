// Open/closed state of the online panel (shared by the menu button, the in-game HUD and the panels).
import { signal } from '@preact/signals';
export type OnlineTab = 'account' | 'world' | 'orders' | 'messages' | 'leaderboard' | 'achievements' | 'saves' | 'admin';
export const onlineOpen = signal(false);
export const onlineTab = signal<OnlineTab>('world');
export function openOnline(tab: OnlineTab = 'world') { onlineTab.value = tab; onlineOpen.value = true; }
