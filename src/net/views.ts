// What the world server tells clients about the state (shared so that tests can check the same views).
import type { WorldState } from '../sim/state';
import type { World } from '../sim/world';
import type { PlaceDetail, RealmInfo } from './protocol';
import { TERRAINS, RESOURCES } from '../sim/geo';
import { ALL_CULTURES, cultureLabel, FAITHS } from '../sim/content/peoples';

export function realmInfos(s: WorldState, rulerName: (uid: string) => string | null): RealmInfo[] {
  const count = new Int32Array(s.realm.size);
  for (let i = 0; i < s.place.owner.length; i++) { const o = s.place.owner[i]; if (o >= 0) count[o]++; }
  const out: RealmInfo[] = [];
  for (let r = 0; r < s.realm.size; r++) {
    if (!s.realm.alive[r]) continue;
    const t = s.realmText[r], uid = s.ruler[r];
    out.push({
      id: r, key: t.key, name: t.name, short: t.short, adjective: t.adjective, color: s.realm.cols.color[r], capital: s.realm.cols.capital[r], faith: s.realm.cols.faith[r],
      places: count[r], ruler: uid ? (rulerName(uid) ?? '?') : null,
    });
  }
  return out;
}

export function placeDetail(s: WorldState, w: World, i: number): PlaceDetail | null {
  if (!Number.isInteger(i) || i < 0 || i >= w.L) return null;
  const f = FAITHS[s.place.faith[i]];
  return {
    id: i, name: w.names[i], nameDe: w.namesDe[i], owner: s.place.owner[i], terrain: TERRAINS[w.terrain[i]], resource: RESOURCES[w.resource[i]],
    culture: cultureLabel(ALL_CULTURES[s.place.culture[i]] ?? 'unknown'), faith: f ? f.name : { en: '?', de: '?' }, pop: Math.round(s.place.pop[i]),
  };
}
