// The map mode the player has chosen, as in EU5's map modes: what the map shows. The modes sit in one menu of the top
// bar (Ramon, 19 November 2026: "gruppiere die bestehenden map modi in einem gemeinsamen menü"). It is kept in the
// browser, so that the game opens in the mode it was left in; where the browser keeps nothing it opens political.
// `rulers`: the land as in the political mode, and every ruler who holds a crown always shown, far out as a black dot
// where they live, near as their own figure in the colour of their realm.
import { signal } from '@preact/signals';
import type { MapMode as LandMode } from '../worldprobe/view';

export type MapMode = LandMode | 'rulers';
/** the modes in the order of the menu, each with its key */
export const MAP_MODES: readonly { mode: MapMode; key: string }[] = [
  { mode: 'political', key: '1' },
  { mode: 'terrain', key: '2' },
  { mode: 'rulers', key: '3' },
];
/** what the land is coloured by in a mode */
export const landOf = (mode: MapMode): LandMode => (mode === 'rulers' ? 'political' : mode);
const KEPT = 'sundered-crowns.map-mode';

const kept = (): MapMode => {
  try {
    const m = localStorage.getItem(KEPT);
    return MAP_MODES.some((x) => x.mode === m) ? (m as MapMode) : 'political';
  } catch {
    return 'political';
  }
};
export const mapMode = signal<MapMode>(kept());

export function setMapMode(mode: MapMode) {
  mapMode.value = mode;
  try {
    localStorage.setItem(KEPT, mode);
  } catch {
    /* the browser keeps nothing: the mode lasts as long as the page */
  }
}

/** The map mode keys: 1 political, 2 terrain, 3 rulers; what is typed into a field is not for the map. Returns whether the key was one. */
export function mapModeKey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (
    e.target instanceof HTMLElement &&
    (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
  )
    return false;
  const m = MAP_MODES.find((x) => x.key === e.key);
  if (!m) return false;
  setMapMode(m.mode);
  return true;
}
