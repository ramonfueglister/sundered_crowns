// Key bindings (spec point 4): every keyboard shortcut of the game comes from this one table. The settings panel lets
// the player rebind each action (conflicts are shown, defaults can be restored); the bindings live in localStorage
// ('sc.keys'). The camera keys of the map (W A S D and the arrow keys, src/render/renderer.ts) are fixed and listed
// here so that a binding that collides with them is reported too.
import { signal } from '@preact/signals';
import type { MapMode } from '../game/protocol';

export type KeyGroup = 'time' | 'panels' | 'map' | 'view';
export interface KeyAction { id: string; group: KeyGroup; name: [string, string]; def: string; fixed?: boolean }

const MODE_NAMES: [MapMode, string, string][] = [
  ['political', 'Political map', 'Politische Karte'], ['terrain', 'Terrain map', 'Geländekarte'], ['diplomatic', 'Diplomatic map', 'Diplomatische Karte'],
  ['development', 'Development map', 'Entwicklungskarte'], ['population', 'Population map', 'Bevölkerungskarte'], ['culture', 'Culture map', 'Kulturkarte'],
  ['faith', 'Faith map', 'Glaubenskarte'], ['trade', 'Trade map', 'Handelskarte'], ['unrest', 'Unrest map', 'Unruhekarte'], ['control', 'Control map', 'Kontrollkarte'],
  ['goods', 'Goods map', 'Güterkarte'],
];
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export const KEY_ACTIONS: KeyAction[] = [
  { id: 'pause', group: 'time', name: ['Pause / resume', 'Pause / weiter'], def: 'Space' },
  { id: 'faster', group: 'time', name: ['Faster', 'Schneller'], def: '+' },
  { id: 'slower', group: 'time', name: ['Slower', 'Langsamer'], def: '-' },
  { id: 'panel_economy', group: 'panels', name: ['Economy', 'Wirtschaft'], def: 'E' },
  { id: 'panel_government', group: 'panels', name: ['Rule', 'Herrschaft'], def: 'G' },
  { id: 'panel_diplomacy', group: 'panels', name: ['Diplomacy', 'Diplomatie'], def: 'Shift+D' },
  { id: 'panel_military', group: 'panels', name: ['Military', 'Militär'], def: 'M' },
  { id: 'panel_works', group: 'panels', name: ['Works', 'Bauten'], def: 'B' },
  { id: 'panel_knowledge', group: 'panels', name: ['Learning', 'Wissen'], def: 'K' },
  { id: 'panel_society', group: 'panels', name: ['Society and faith', 'Gesellschaft und Glaube'], def: 'U' },
  { id: 'panel_decisions', group: 'panels', name: ['Goals and decisions', 'Ziele und Beschlüsse'], def: 'J' },
  { id: 'panel_ledger', group: 'panels', name: ['Ledger', 'Übersicht'], def: 'L' },
  { id: 'panel_chronicle', group: 'panels', name: ['Chronicle', 'Chronik'], def: 'C' },
  { id: 'panel_victory', group: 'panels', name: ['Victory', 'Sieg'], def: 'V' },
  ...MODE_NAMES.map(([m, en, de], k): KeyAction => ({ id: `map_${m}`, group: 'map', name: [en, de], def: DIGITS[k] ?? '' })),
  { id: 'back', group: 'view', name: ['Close / back / menu', 'Schließen / zurück / Menü'], def: 'Escape' },
  { id: 'hide_ui', group: 'view', name: ['Hide the interface', 'Oberfläche ausblenden'], def: 'H' },
  { id: 'quick_save', group: 'view', name: ['Quick save', 'Schnellspeichern'], def: 'F5' },
  { id: 'dev', group: 'view', name: ['Developer tools', 'Entwicklerwerkzeuge'], def: 'F2' },
  // fixed: the map's camera keys (src/render/renderer.ts)
  { id: 'cam_up', group: 'view', name: ['Move the map up', 'Karte nach oben'], def: 'W', fixed: true },
  { id: 'cam_left', group: 'view', name: ['Move the map left', 'Karte nach links'], def: 'A', fixed: true },
  { id: 'cam_down', group: 'view', name: ['Move the map down', 'Karte nach unten'], def: 'S', fixed: true },
  { id: 'cam_right', group: 'view', name: ['Move the map right', 'Karte nach rechts'], def: 'D', fixed: true },
];
export const KEY_INDEX: Record<string, KeyAction> = Object.fromEntries(KEY_ACTIONS.map((a) => [a.id, a]));
export const KEY_GROUPS: [KeyGroup, string, string][] = [['time', 'Time', 'Zeit'], ['panels', 'Panels', 'Fenster'], ['map', 'Map modes', 'Kartenmodi'], ['view', 'View and system', 'Ansicht und System']];

/** Normalises a combo: modifiers in a fixed order (Ctrl, Alt, Shift), letters upper case. '' = unbound. */
export function normCombo(c: string): string {
  if (!c) return '';
  const parts = c.split('+'); let key = parts.pop() ?? '';
  if (key === '' && c.endsWith('+')) { key = '+'; parts.pop(); } // "Shift++" or "+"
  const mods = new Set(parts.map((p) => p.trim().toLowerCase()));
  const out: string[] = [];
  if (mods.has('ctrl') || mods.has('control') || mods.has('meta')) out.push('Ctrl');
  if (mods.has('alt')) out.push('Alt');
  if (mods.has('shift')) out.push('Shift');
  if (key === ' ') key = 'Space'; else if (key === 'Esc') key = 'Escape'; else if (key.length === 1) key = key.toUpperCase();
  out.push(key);
  return out.join('+');
}
/** The combo of a key press (layout aware: the character the key types). */
export function comboOf(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean }): string {
  let key = e.key;
  if (key === ' ' || key === 'Spacebar') key = 'Space';
  if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') return '';
  const letter = key.length === 1 && /\p{L}/u.test(key);
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  // Shift only counts for letters and named keys: for "+" or "*" the character already says it
  if (e.shiftKey && (letter || key.length > 1)) mods.push('Shift');
  return normCombo([...mods, key].join('+') || key);
}

function load(): Record<string, string> {
  try { const o = JSON.parse(localStorage.getItem('sc.keys') || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; }
}
/** The player's changes against the defaults (action id → combo, '' = unbound). */
export const keyOverrides = signal<Record<string, string>>(load());
function store(o: Record<string, string>) { keyOverrides.value = o; try { localStorage.setItem('sc.keys', JSON.stringify(o)); } catch { /* ignore */ } }

/** The key of an action now ('' = none). */
export function keyFor(id: string, over = keyOverrides.value): string {
  const a = KEY_INDEX[id]; if (!a) return '';
  return a.fixed ? a.def : normCombo(over[id] ?? a.def);
}
export function bindKey(id: string, combo: string) {
  const a = KEY_INDEX[id]; if (!a || a.fixed) return;
  const c = normCombo(combo); const o = { ...keyOverrides.value };
  if (c === normCombo(a.def)) delete o[id]; else o[id] = c;
  store(o);
}
export function resetKey(id: string) { const o = { ...keyOverrides.value }; delete o[id]; store(o); }
export function resetAllKeys() { store({}); }

/** Actions that share a key: combo → action ids (only combos with two or more). */
export function keyConflicts(over = keyOverrides.value): Map<string, string[]> {
  const by = new Map<string, string[]>();
  for (const a of KEY_ACTIONS) { const c = keyFor(a.id, over); if (!c) continue; by.set(c, [...(by.get(c) ?? []), a.id]); }
  for (const [c, ids] of [...by]) if (ids.length < 2) by.delete(c);
  return by;
}
/** The action bound to a key press, if any (fixed camera keys are left to the map). */
export function actionFor(e: Parameters<typeof comboOf>[0], over = keyOverrides.value): string | null {
  const c = comboOf(e); if (!c) return null;
  for (const a of KEY_ACTIONS) if (!a.fixed && keyFor(a.id, over) === c) return a.id;
  // older habit: "=" (unshifted "+" on English keyboards) and the numeric keypad also change the speed
  if (c === '=' && keyFor('faster', over) === '+') return 'faster';
  return null;
}
/** Readable key name for tooltips ("Leertaste" for Space in German). */
export function keyLabel(combo: string, de: boolean): string {
  if (!combo) return '';
  return combo.split('+').map((p) => (de ? ({ Space: 'Leertaste', Escape: 'Esc', Ctrl: 'Strg', Shift: 'Umschalt' } as Record<string, string>)[p] ?? p : p === 'Escape' ? 'Esc' : p)).join('+').replace(/\+\+$/, '++');
}
