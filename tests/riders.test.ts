// A ruler on the way rides it (step C of the people's road map): which rulers ride and where to
// (src/people/rulers_mode.ts legOn, ridersOn), and the horse and rider they are drawn as (src/figures/horse.ts).
import { describe, expect, it } from 'vitest';
import { FORE_Z, HIND_Z, RIDER_HEIGHT, RIDER_PARTS } from '../src/figures/horse';
import { HIP, Joint, MICRO, Slot } from '../src/figures/kit';
import type { RulerOnMap } from '../src/net/people';
import { legOn, ridersOn, whereOn } from '../src/people/rulers_mode';

// three places on a line of longitude, a degree apart
const loc = { lon: [7, 7, 7], lat: [50, 51, 52] };
const ruler = (track: RulerOnMap['track']): RulerOnMap => ({
  uid: 7,
  name: 'Adolf',
  house: 'Nassau',
  female: false,
  place: 0,
  crowns: [{ id: 1, name: 'Reich', color: 0xd4b030 }],
  track,
});
// stays at place 0 until day 10, rides to 1 by day 12, stays there until day 20, rides to 2 by day 21
const adolf = ruler({ day: [5, 10, 12, 20, 21], place: [0, 0, 1, 1, 2] });

describe('the leg of the way a ruler is on', () => {
  it('is none while the ruler stays, before the way and after it', () => {
    expect(legOn(adolf, 4)).toBe(-1);
    expect(legOn(adolf, 7)).toBe(-1);
    expect(legOn(adolf, 15)).toBe(-1);
    expect(legOn(adolf, 22)).toBe(-1);
    expect(legOn(ruler(undefined), 11)).toBe(-1);
  });
  it('is the place reached last where the next place is another one', () => {
    expect(legOn(adolf, 10)).toBe(1);
    expect(legOn(adolf, 11.5)).toBe(1);
    expect(legOn(adolf, 20.5)).toBe(3);
  });
});

describe('the riders', () => {
  it('are the rulers on a leg of their way, in the colour of their first crown', () => {
    expect(ridersOn([adolf], loc, { day: 15, pace: 1 }).size).toBe(0);
    const r = ridersOn([adolf], loc, { day: 11, pace: 0.1 }).get(7);
    expect(r?.color).toBe(0xd4b030);
    expect(r?.lat).toBeCloseTo(50.5, 6);
  });
  it('ride on for the seconds ahead, to where the way has them then', () => {
    const r = ridersOn([adolf], loc, { day: 11, pace: 0.1 }).get(7)!;
    expect(r.seconds).toBe(5);
    expect([r.toLon, r.toLat]).toEqual(whereOn(adolf, loc, 11.5));
  });
  it('ride no farther than the end of their leg, where the way may turn', () => {
    const r = ridersOn([adolf], loc, { day: 11.8, pace: 1 }).get(7)!;
    expect(r.seconds).toBeCloseTo(0.2, 6);
    expect(r.toLat).toBeCloseTo(51, 6);
  });
  it('stand in a paused world, facing the next place', () => {
    const r = ridersOn([adolf], loc, { day: 11, pace: 0 }).get(7)!;
    expect(r.seconds).toBe(0);
    expect([r.toLon, r.toLat]).toEqual([7, 51]);
  });
});

describe('the horse and its rider', () => {
  const legs = RIDER_PARTS.filter((p) => p.joint >= Joint.ForeL);
  it('swing each leg about its own top, at the height of the hip', () => {
    expect(legs.length).toBe(8);
    for (const p of legs) {
      const fore = p.joint === Joint.ForeL || p.joint === Joint.ForeR,
        middle = ((p.from[2] + p.to[2]) / 2) * MICRO;
      expect(middle).toBeCloseTo(fore ? FORE_Z : HIND_Z, 1);
      if (p.slot === Slot.Load) expect(p.to[1] * MICRO).toBeCloseTo(HIP, 1);
    }
  });
  it('stands a horse of 14 hands at the withers, in the figures proportion, and is as tall as said', () => {
    // a man of 12 micro voxels stands for 1.70 m (kit.ts HEIGHT): 1.42 m are 10
    expect(RIDER_PARTS.find((p) => p.from[2] === -5)?.to[1]).toBe(10);
    expect(Math.max(...RIDER_PARTS.map((p) => p.to[1])) * MICRO).toBeCloseTo(RIDER_HEIGHT, 6);
  });
  it('wears the realm in the garment and the horse cloth, and nothing it folds away', () => {
    expect(RIDER_PARTS.filter((p) => p.slot === Slot.Tunic).length).toBeGreaterThan(3);
    for (const p of RIDER_PARTS) expect([p.load ?? 0, p.variant ?? -1]).toEqual([0, -1]);
  });
});
