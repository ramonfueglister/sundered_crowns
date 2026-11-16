// The map mode the player has chosen, as in EU5's map mode buttons: what the land is coloured by. It is kept in the
// browser, so that the game opens in the mode it was left in; where the browser keeps nothing it opens political.
import { signal } from '@preact/signals';
import type { MapMode } from '../worldprobe/view';

/** the modes in the order of their buttons, each with its key */
export const MAP_MODES: readonly { mode: MapMode; key: string }[] = [{ mode: 'political', key: '1' }, { mode: 'terrain', key: '2' }];
const KEPT = 'sundered-crowns.map-mode';

const kept = (): MapMode => {
  try { const m = localStorage.getItem(KEPT); return MAP_MODES.some((x) => x.mode === m) ? (m as MapMode) : 'political'; } catch { return 'political'; }
};
export const mapMode = signal<MapMode>(kept());

export function setMapMode(mode: MapMode) {
  mapMode.value = mode;
  try { localStorage.setItem(KEPT, mode); } catch { /* the browser keeps nothing: the mode lasts as long as the page */ }
}

/** The map mode keys: 1 political, 2 terrain; what is typed into a field is not for the map. Returns whether the key was one. */
export function mapModeKey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) return false;
  const m = MAP_MODES.find((x) => x.key === e.key);
  if (!m) return false;
  setMapMode(m.mode);
  return true;
}
