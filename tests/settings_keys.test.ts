// Settings of the polish pass (spec point 4): key bindings from one table with conflicts, defaults and the camera keys
// of the map, and the colour-blind realm palette that keeps neighbours apart for red-green colour blindness.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KEY_ACTIONS, keyFor, bindKey, resetKey, resetAllKeys, keyConflicts, actionFor, comboOf, normCombo, keyLabel, keyOverrides } from '../src/ui/keys';
import { CVD_PALETTE, CVD_MIN_DIST, cvdDistance, realmNeighbours, assignCvdColors, cvdRealmColors } from '../src/ui/palette';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { readFileSync } from 'node:fs';

vi.setConfig({ testTimeout: 120_000 });

describe('key bindings', () => {
  beforeEach(() => resetAllKeys());

  it('the defaults have no conflicts and every action has a unique id', () => {
    expect(new Set(KEY_ACTIONS.map((a) => a.id)).size).toBe(KEY_ACTIONS.length);
    expect(keyConflicts().size).toBe(0);
    expect(keyFor('pause')).toBe('Space');
    expect(keyFor('panel_diplomacy')).toBe('Shift+D');
    expect(keyFor('map_political')).toBe('1');
  });

  it('combos are normalised and read from key presses as the player types them', () => {
    expect(normCombo('shift+d')).toBe('Shift+D');
    expect(normCombo('alt+ctrl+x')).toBe('Ctrl+Alt+X');
    expect(normCombo('Shift++')).toBe('Shift++');
    expect(comboOf({ key: 'd', shiftKey: true })).toBe('Shift+D');
    expect(comboOf({ key: '+', shiftKey: true })).toBe('+'); // the character already says Shift
    expect(comboOf({ key: ' ' })).toBe('Space');
    expect(comboOf({ key: 'Shift', shiftKey: true })).toBe(''); // a modifier alone waits for the key
    expect(comboOf({ key: 'F5', ctrlKey: true })).toBe('Ctrl+F5');
  });

  it('rebinding finds the conflict, also with the fixed camera keys, and resets', () => {
    bindKey('panel_economy', 'w');
    expect(keyFor('panel_economy')).toBe('W');
    const c = keyConflicts();
    expect(c.get('W')).toEqual(['panel_economy', 'cam_up']);
    bindKey('panel_military', 'L');
    expect(keyConflicts().get('L')).toEqual(['panel_military', 'panel_ledger']);
    // the fixed camera keys cannot be rebound
    bindKey('cam_up', 'Q'); expect(keyFor('cam_up')).toBe('W');
    resetKey('panel_economy'); expect(keyFor('panel_economy')).toBe('E'); expect(keyConflicts().has('W')).toBe(false);
    // binding back to the default leaves no override behind
    bindKey('panel_military', 'm'); expect(keyOverrides.value.panel_military).toBeUndefined();
    resetAllKeys(); expect(keyOverrides.value).toEqual({}); expect(keyConflicts().size).toBe(0);
  });

  it('a key press finds its action; an unbound action is not reached', () => {
    expect(actionFor({ key: 'e' })).toBe('panel_economy');
    expect(actionFor({ key: 'D', shiftKey: true })).toBe('panel_diplomacy');
    expect(actionFor({ key: 'd' })).toBe(null); // the camera key belongs to the map
    expect(actionFor({ key: '=' })).toBe('faster');
    bindKey('panel_economy', 'Ctrl+E');
    expect(actionFor({ key: 'e' })).toBe(null);
    expect(actionFor({ key: 'e', ctrlKey: true })).toBe('panel_economy');
    bindKey('hide_ui', '');
    expect(keyFor('hide_ui')).toBe(''); expect(actionFor({ key: 'h' })).toBe(null);
  });

  it('labels in German', () => {
    expect(keyLabel('Space', true)).toBe('Leertaste');
    expect(keyLabel('Ctrl+Shift+S', true)).toBe('Strg+Umschalt+S');
    expect(keyLabel('Escape', false)).toBe('Esc');
  });
});

describe('colour-blind palette', () => {
  it('the palette itself has no two colours that look the same', () => {
    let close = 0;
    for (let a = 0; a < CVD_PALETTE.length; a++) for (let b = a + 1; b < CVD_PALETTE.length; b++) if (cvdDistance(CVD_PALETTE[a], CVD_PALETTE[b]) < 0.03) close++;
    expect(close).toBe(0);
  });

  it('neighbouring realms of the 1356 map stay apart, and the colours are stable', () => {
    const w = loadWorld(); const s = createGame(w, loadSetup(1356), loadHubs(), 1, { player: [] });
    const geo = JSON.parse(readFileSync(new URL('../public/data/geo.json', import.meta.url), 'utf8'));
    const nb = realmNeighbours(s.loc.owner, geo);
    const realms = [...new Set(Array.from(s.loc.owner.subarray(0, w.L)).filter((o) => o >= 0))];
    const col = assignCvdColors(realms, nb);
    let pairs = 0, bad = 0;
    for (const [a, set] of nb) for (const b of set) if (a < b) { pairs++; if (cvdDistance(CVD_PALETTE[col.get(a)!], CVD_PALETTE[col.get(b)!]) < CVD_MIN_DIST) bad++; }
    expect(pairs).toBeGreaterThan(500);
    expect(bad).toBe(0);
    expect(assignCvdColors(realms, nb)).toEqual(col);
    const bytes = cvdRealmColors(s.loc.owner, geo, s.nations.length);
    expect(bytes.length).toBe(s.nations.length * 3);
    expect(cvdRealmColors(s.loc.owner, geo, s.nations.length)).toEqual(bytes);
  });
});
