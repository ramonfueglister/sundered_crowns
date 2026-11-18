// People feature 6 (docs/PEOPLE_DESIGN.md): who wants work looks for a part in the economy. A part goes only to a
// person who wants one by the rule of the founding (src/sim/systems/work.ts), and a part that finds nobody in its
// town is offered to the towns within reach (offersOn, src/sim/systems/moves.ts).
import { describe, it, expect } from 'vitest';
import { newWorldState } from '../tools/sim/load';
import { ageOn } from '../src/sim/systems/people';
import { deathsTo, settleEstates, estatesOf, seekersIn } from '../src/sim/systems/deaths';
import { birthsTo, weddingsOn } from '../src/sim/systems/families';
import { movesTo, offersOn, noMoves } from '../src/sim/systems/moves';
import { ROLE, participation, wantsWork } from '../src/sim/systems/work';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { ALIVE } from '../src/sim/state';

describe('who wants work looks for a part', () => {
  const { s, w } = newWorldState(1291, 1291), P = s.person.cols, F = s.family.cols;
  const living = (id: number) => s.person.alive[id] && P.died[id] === ALIVE && P.dies[id] !== ALIVE;
  const towns = () => { const t = new Set<number>(); for (let id = 0; id < s.person.size; id++) if (living(id)) t.add(F.place[P.family[id]]); return [...t]; };
  const shares = (day: number) => { let men = 0, menPart = 0, women = 0, womenPart = 0;
    for (let id = 0; id < s.person.size; id++) { if (!living(id)) continue; const a = ageOn(P.born[id], day); if (a < 20 || a >= 60) continue;
      if (P.sex[id] === 1) { men++; if (P.role[id] !== ROLE.none) menPart++; } else { women++; if (P.role[id] !== ROLE.none) womenPart++; } }
    return { men: menPart / men, women: womenPart / women }; };

  it('the rates are those of the calibration table, and the draw is the person\'s own', () => {
    expect(participation).toEqual({ men: 0.971, women: 0.430 });
    expect(wantsWork(1, 7, false, true, 0)).toBe(true); // a woman without a husband always
    expect(wantsWork(1, 7, false, false, 0)).toBe(false);
    expect(wantsWork(1, 7, true, false, 0)).toBe(wantsWork(1, 7, true, true, 1));
  });
  it('at the founding everybody who wants a part has one', () => {
    let n = 0; for (const t of towns()) n += seekersIn(s, t, 0).length;
    expect(n).toBe(0);
    expect(estatesOf(s).length).toBe(0);
    const at = shares(0); expect(at.men).toBeGreaterThan(0.95); expect(at.women).toBeLessThan(0.47);
  });
  it('over 30 years the men keep their parts and the women do not take them over, parts that wait are taken from other towns, and a saved world goes on the same', () => {
    const moved = noMoves(); let copy = s, checked = 0;
    for (let y = 1; y <= 30; y++) {
      if (y === 21) copy = decodeState(encodeState(s));
      for (let mo = 1; mo <= 12; mo++) {
        const d = Math.round((y - 1 + mo / 12) * 365.25);
        deathsTo(s, d); movesTo(s, w, d, moved); birthsTo(s, d); weddingsOn(s, d); settleEstates(s, d);
        // who takes an offer: lived in another town, wanted a part and had none, could move
        const before = estatesOf(s), was = new Map<number, number>();
        const free = new Set<number>(); if (y % 10 === 0 && before.length) for (const t of towns()) for (const id of seekersIn(s, t, d)) { free.add(id); was.set(id, t); }
        const took = offersOn(s, w, d, moved);
        if (free.size) {
          const after = new Set(estatesOf(s).map((e) => e.dead));
          for (const e of before) { if (after.has(e.dead)) continue;
            expect(P.role[e.dead]).toBe(ROLE.none);
            let heir = -1; for (const id of free) if (P.role[id] !== ROLE.none && F.place[P.family[id]] === e.place && was.get(id) !== e.place) { heir = id; free.delete(id); break; }
            expect(heir).toBeGreaterThanOrEqual(0);
            const a = ageOn(P.born[heir], d); expect(a).toBeGreaterThanOrEqual(15); expect(a).toBeLessThan(60);
            checked++; }
          expect(before.length - after.size).toBe(took);
        }
        if (copy !== s) { deathsTo(copy, d); movesTo(copy, w, d); birthsTo(copy, d); weddingsOn(copy, d); settleEstates(copy, d); offersOn(copy, w, d); }
      }
    }
    expect(hashState(copy)).toBe(hashState(s));
    expect(moved.work).toBeGreaterThan(1000); expect(checked).toBeGreaterThan(20);
    const at = shares(Math.round(30 * 365.25));
    expect(at.men).toBeGreaterThan(0.9); expect(at.women).toBeLessThan(0.62); // the table: 97.1 % and 43.0 %
    // a part belongs to a living person of its town, or waits
    const waits = new Set(estatesOf(s).map((e) => e.dead));
    for (let id = 0; id < s.person.size; id++) if (s.person.alive[id] && P.role[id] !== ROLE.none && P.died[id] !== ALIVE && P.dies[id] !== ALIVE) expect(waits.has(id)).toBe(true);
  }, 240_000);
});
