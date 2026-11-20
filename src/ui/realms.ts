// The realms as the HUD needs them: by id, the one the player rules, and which have a drawn coat of arms.
import { computed } from '@preact/signals';
import { me, realms } from '../net/client';
import type { RealmInfo } from '../net/protocol';

export const realmById = computed(() => {
  const m = new Map<number, RealmInfo>();
  for (const r of realms.value) m.set(r.id, r);
  return m;
});

/** The realm the player rules (undefined: none). */
export const myRealm = computed(() => {
  const m = me.value;
  return m && m.realm >= 0 ? realmById.value.get(m.realm) : undefined;
});

/** Realms with a drawn coat of arms; the others show their initial. */
export const ARMS: Record<string, string> = { venice: '/ui/arms/venice.svg' };
