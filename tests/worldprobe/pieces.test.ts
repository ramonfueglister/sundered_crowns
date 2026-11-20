import { describe, expect, it } from 'vitest';
import { glideOf, settleOf } from '../../src/worldprobe/pieces';
import { stepOf } from '../../src/worldprobe/zoom';

describe('the glide of a far piece', () => {
  it('has not begun in the middle of its step and has arrived at the border to the coarser one', () => {
    for (let step = 2; step < 7; step++) {
      // (the widest view of the step, to a thousandth)
      let border = 400;
      while (stepOf(border * 1.001) <= step) border *= 1.001;
      expect(glideOf(border / 1.7, step)).toBe(0);
      expect(glideOf(border, step)).toBeGreaterThan(0.99);
      expect(glideOf(border * 1.5, step)).toBe(1);
      let last = 0;
      for (let wide = border / 1.6; wide <= border; wide *= 1.01) {
        const g = glideOf(wide, step);
        expect(g).toBeGreaterThanOrEqual(last);
        last = g;
      }
    }
  });
});

describe('a piece that took the place of a coarser one', () => {
  it('shows as that one has the land while it dissolves in, then comes to its own shape and stays there', () => {
    // (a view whose width asks for none of the glide: the piece came a whole glide short of the coarser shape)
    expect(settleOf(0, 1, 0)).toBe(1);
    expect(settleOf(0, 1, 300)).toBe(1);
    let last = 1;
    for (let since = 300; since < 900; since += 20) {
      const g = settleOf(0, 1, since)!;
      expect(g).toBeLessThanOrEqual(last);
      last = g;
    }
    expect(last).toBeLessThan(0.01);
    expect(settleOf(0, 1, 900)).toBeUndefined();
    expect(settleOf(0, 1, 5000)).toBeUndefined();
  });
  it('is never further from the shape the view asks for than it was when it came, and never past the coarser shape', () => {
    // (the view zooms on while the piece settles: it follows the view's width, from where it was)
    for (const by of [0.1, 0.5, 1])
      for (const share of [0, 0.3, 0.9, 1])
        for (let since = 0; since < 900; since += 50) {
          const g = settleOf(share, by, since)!;
          expect(g).toBeGreaterThanOrEqual(share);
          expect(g).toBeLessThanOrEqual(Math.min(1, share + by));
        }
  });
});
