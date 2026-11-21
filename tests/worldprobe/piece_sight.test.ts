// Where the pieces of the world lie for a view (worldprobe/piece_sight.ts): how far a piece lies outside the picture,
// the pieces of a step about it, what a view asks for in which order, and what is built ahead while it rests.
import { describe, expect, it } from 'vitest';
import { NEAR, RIGHT } from '../../src/lookprobe/layout';
import {
  PIECE,
  RANK,
  RANK_KIND,
  type Spot,
  type View,
  type Wanted,
  aheadOf,
  beyond,
  near,
  outside,
  wantedOf,
} from '../../src/worldprobe/piece_sight';
import { keyOf } from '../../src/worldprobe/pyramid';
import { COARSEST, elevationOf, stepOf } from '../../src/worldprobe/zoom';

const viewOf = (wide: number, x = 51234, z = 48765): View => ({
  x,
  z,
  wide,
  aspect: 16 / 9,
  pixels: 1600,
  elevation: elevationOf(wide),
});
/** a view in the middle of the second far step, and its step */
const V = viewOf(2000),
  STEP = stepOf(V.wide);
const sideOf = (step: number) => PIECE * 2 ** step;
/** the kind of a rank (RANK), by the band it lies in */
const kindOf = (rank: number) =>
  // (Object.entries gives the keys as plain strings; these are RANK's own)
  (Object.entries(RANK) as [keyof typeof RANK, number][]).find(
    ([, base]) => rank >= base && rank < base + RANK_KIND,
  )?.[0];
const ofKind = (wanted: Wanted[], kind: keyof typeof RANK) => wanted.filter((w) => kindOf(w.rank) === kind);

describe('how far a square lies outside the picture', () => {
  it('is nothing for a square in the picture, and grows as far as the square lies beyond its edges', () => {
    expect(beyond(V, V.x, V.z, 100, 0)).toBe(0);
    // to the right of the picture: half its width and half the square's diagonal short of the distance
    const right = (d: number) => beyond(V, V.x + RIGHT[0] * d, V.z + RIGHT[1] * d, 100, 0);
    expect(right(5000)).toBeCloseTo(5000 - V.wide / 2 - 71, 6);
    expect(right(6000) - right(5000)).toBeCloseTo(1000, 6);
    // towards the viewer the picture reaches as deep as its height on the ground, seen from the camera's angle
    const deep = V.wide / V.aspect / Math.sin((V.elevation * Math.PI) / 180);
    expect(beyond(V, V.x + NEAR[0] * 9000, V.z + NEAR[1] * 9000, 100, 0)).toBeCloseTo(9000 - deep / 2 - 71, 6);
    // what stands on it leans into the picture
    expect(beyond(V, V.x + RIGHT[0] * 5000, V.z + RIGHT[1] * 5000, 100, 40)).toBeCloseTo(right(5000) - 40, 6);
  });

  it('is nothing for the piece under the middle of the picture, and grows with the pieces along a row', () => {
    const side = sideOf(STEP),
      px = Math.floor(V.x / side),
      pz = Math.floor(V.z / side);
    expect(outside(V, STEP, px, pz)).toBe(0);
    let last = 0;
    for (let k = 1; k < 12; k++) {
      const o = outside(V, STEP, px + k, pz);
      expect(o).toBeGreaterThanOrEqual(last);
      last = o;
    }
    expect(last).toBeGreaterThan(0);
  });
});

describe('the pieces of a step about the picture', () => {
  it('are all the pieces no farther outside it than asked, each once, under its key and with its distance', () => {
    for (const around of [0, 0.3 * V.wide]) {
      const list = near(V, STEP, around),
        side = sideOf(STEP);
      expect(new Set(list.map((p) => p.key)).size).toBe(list.length);
      for (const p of list) {
        expect(p.key).toBe(keyOf(STEP, p.px, p.pz));
        expect(p.out).toBe(outside(V, STEP, p.px, p.pz));
        expect(p.out).toBeLessThanOrEqual(around);
        expect(p.far).toBeCloseTo(Math.hypot((p.px + 0.5) * side - V.x, (p.pz + 0.5) * side - V.z), 6);
      }
      // none is left out: every piece of a wide square about the view that lies close enough is in the list
      const px0 = Math.floor(V.x / side),
        pz0 = Math.floor(V.z / side),
        keys = new Set(list.map((p) => p.key));
      let close = 0;
      for (let pz = pz0 - 30; pz <= pz0 + 30; pz++)
        for (let px = px0 - 30; px <= px0 + 30; px++)
          if (outside(V, STEP, px, pz) <= around) {
            close++;
            expect(keys.has(keyOf(STEP, px, pz))).toBe(true);
          }
      expect(close).toBe(list.length);
    }
    expect(near(V, STEP, 0.3 * V.wide).length).toBeGreaterThan(near(V, STEP, 0).length);
  });
});

describe('what a view asks for', () => {
  it('is only its own pieces in the picture when a tool takes one picture', () => {
    const { wanted, coarser } = wantedOf(V, STEP, V, STEP, false, 0);
    expect(coarser).toEqual([]);
    expect(wanted.map((w) => w.key).sort()).toEqual(
      near(V, STEP, 0)
        .map((p) => p.key)
        .sort(),
    );
    expect(wanted.every((w) => kindOf(w.rank) === 'own')).toBe(true);
  });

  it('lays the coarser step into the picture while it blends', () => {
    const { wanted, coarser } = wantedOf(V, STEP, V, STEP, false, 0.5);
    expect(coarser.map((p) => p.key)).toEqual(near(V, STEP + 1, 0).map((p) => p.key));
    expect(ofKind(wanted, 'coarser').map((w) => w.key)).toEqual(coarser.map((p) => p.key));
  });

  it('asks first for what stands in under the picture, then its own pieces, the coarser step, around it and every coarser step', () => {
    const { wanted } = wantedOf(V, STEP, V, STEP, true, 0);
    expect(wanted.every((w) => kindOf(w.rank) !== undefined)).toBe(true);
    const steps = (kind: keyof typeof RANK) => [...new Set(ofKind(wanted, kind).map((w) => w.step))].sort();
    expect(steps('standIn')).toEqual([STEP + 2]);
    expect(steps('own')).toEqual([STEP]);
    expect(steps('around')).toEqual([STEP]);
    expect(steps('coarser')).toEqual([STEP + 1]);
    expect(steps('under')).toEqual(Array.from({ length: COARSEST - STEP - 1 }, (_, k) => STEP + 2 + k));
    // in the middle of its step it does not yet ask for the finer one
    expect(ofKind(wanted, 'finer')).toEqual([]);
    // the pieces around the picture are those outside it, and within a kind the nearer comes first
    expect(ofKind(wanted, 'around').every((w) => outside(V, STEP, w.px, w.pz) > 0)).toBe(true);
    const side = sideOf(STEP);
    for (const w of ofKind(wanted, 'own'))
      expect(w.rank - RANK.own).toBeCloseTo(Math.hypot((w.px + 0.5) * side - V.x, (w.pz + 0.5) * side - V.z), 4);
    // of the coarser steps under the picture the coarsest comes first
    const under = ofKind(wanted, 'under'),
      first = (s: number) => Math.min(...under.filter((w) => w.step === s).map((w) => w.rank));
    for (let s = STEP + 2; s < COARSEST; s++) expect(first(s + 1)).toBeLessThan(first(s));
  });

  it('asks for the finer step last once the view comes near its border', () => {
    const border = 300 * 2 ** STEP,
      v = viewOf(border * 1.05),
      { wanted } = wantedOf(v, STEP, v, STEP, true, 0);
    expect(stepOf(v.wide)).toBe(STEP);
    const finer = ofKind(wanted, 'finer');
    expect(finer.length).toBeGreaterThan(0);
    expect(finer.every((w) => w.step === STEP - 1)).toBe(true);
  });

  it('asks before all else for the picture a motion will come to rest at', () => {
    const rest = viewOf(600, V.x + 20000, V.z),
      restStep = stepOf(rest.wide),
      { wanted } = wantedOf({ ...V, to: rest }, STEP, rest, restStep, true, 0);
    expect(ofKind(wanted, 'rest').map((w) => w.key)).toEqual(near(rest, restStep, 0).map((p) => p.key));
    expect([...new Set(ofKind(wanted, 'standIn').map((w) => w.step))]).toEqual([restStep + 2]);
  });
});

describe('what is built ahead while the view rests', () => {
  const steps = (list: Spot[]) => list.map((s) => s.step);
  it('is the coarser steps a wider view would show, the coarsest taken first from the end of the queue', () => {
    const ahead = aheadOf(V, STEP, () => true, 40);
    expect(ahead).toHaveLength(40);
    expect(ahead.every((s) => s.spare)).toBe(true);
    expect(ahead[ahead.length - 1].step).toBe(COARSEST);
    expect(steps(ahead)).toEqual([...steps(ahead)].sort((a, b) => a - b));
    expect(ahead.every((s) => s.step > STEP)).toBe(true);
  });

  it('is the finer step about the middle once the coarser are all there, the nearest taken first', () => {
    const ahead = aheadOf(V, STEP, (p) => p.step < STEP, 1000);
    expect(ahead.length).toBeGreaterThan(0);
    expect(ahead.every((s) => s.step === STEP - 1 && s.spare)).toBe(true);
    const side = sideOf(STEP - 1),
      far = ahead.map((s) => Math.hypot((s.px + 0.5) * side - V.x, (s.pz + 0.5) * side - V.z));
    expect(far).toEqual([...far].sort((a, b) => b - a));
  });

  it('is nothing at the finest step when nothing coarser is missing', () => {
    expect(aheadOf(viewOf(200), 0, () => false, 10)).toEqual([]);
  });
});
