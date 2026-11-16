// The world of 1291: its realms and borders (public/data/setup_1291.json), the people before the Black Death, and the
// tables of 1356 as placeholders (src/sim/tables.ts); a world of 1291 founded with the people of 1356 gets those of 1291
// by the upgrade 7 → 8.
import { describe, it, expect } from 'vitest';
import { newWorldState, loadSetup } from '../tools/sim/load';
import { upgradeState } from '../src/sim/upgrade';
import { STATE_VERSION } from '../src/sim/state';

const { s, w } = newWorldState(1291, 1291);
const s1291 = loadSetup(1291), s1356 = loadSetup(1356);
const sum = (a: ArrayLike<number | null>) => { let t = 0; for (let i = 0; i < a.length; i++) t += a[i] ?? 0; return t; };

describe('a world of 1291', () => {
  it('starts in 1291 with the realms of 1291', () => {
    expect(s.startYear).toBe(1291);
    expect(s.realmText.some((t) => t.key === 'greater_poland')).toBe(true);
    expect(s.realmText.some((t) => t.key === 'jerusalem')).toBe(true);
  });
  it('has more people than 1356 (before the plague) and keeps the placeholder tables', () => {
    expect(sum(s1291.pop)).toBeGreaterThan(sum(s1356.pop) * 1.05);
    expect(s.person.size).toBeGreaterThan(0);
    expect(s.economy.england?.year).toBe(1291);
  });
  it('takes the people of 1291 by the upgrade from 7', () => {
    const old = structuredClone(s);
    old.v = 7;
    for (let i = 0; i < old.place.pop.length; i++) old.place.pop[i] = Math.max(0, s1356.pop[i] ?? 0);
    const up = upgradeState(old, w, () => s1291);
    expect(up.v).toBe(STATE_VERSION);
    expect(Array.from(up.place.pop)).toEqual(Array.from(s.place.pop));
  });
});
