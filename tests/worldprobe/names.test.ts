// The names of the realms laid out over a picture (worldprobe/names.ts `layoutNames`, `nameSvg`): how large a name is
// written, how far it is spread, where it lies on the picture, and which of two names that run into each other stays.
// (map.test.ts checks one name along its curve and what is too small or outside.)
import { describe, expect, it } from 'vitest';
import { layoutNames, nameSvg } from '../../src/worldprobe/names';
import type { RealmName } from '../../src/worldprobe/realm_names';

/** a realm whose name runs straight from (x0, y) to (x1, y) on the map, `size` map pixels broad */
const realm = (
  realm: number,
  name: string,
  x0: number,
  x1: number,
  y: number,
  size: number,
): RealmName & { name: string } => ({
  realm,
  name,
  x: (x0 + x1) / 2,
  y,
  long: x1 - x0,
  broad: size,
  turn: 0,
  from: [x0, y],
  bend: [(x0 + x1) / 2, y],
  to: [x1, y],
  size,
});
/** a picture of 1000 × 800 pixels whose middle shows the map pixel (500, 400), a pixel to a map pixel */
const lay = (names: (RealmName & { name: string })[], squash = 1, h = 800) =>
  layoutNames(names, 1000, h, 500, 400, 1, squash);

describe('a name over the picture', () => {
  it('is as tall as its realm is broad, but no taller than the letters fit the curve, nor than a share of the picture', () => {
    // broad and long: as tall as it is broad
    expect(lay([realm(0, 'Bern', 200, 800, 400, 40)])[0].size).toBe(40);
    // a long name on a short curve: the letters must fit 0.84 of the curve's 200 pixels, at 0.46 of their height wide
    const long = lay([realm(0, 'Brandenburg-Ansbach', 400, 600, 400, 60)])[0];
    expect(long.size).toBeCloseTo((200 * 0.84) / (19 * 0.46), 0);
    // a vast realm on a low picture: never taller than 0.11 of the picture's height
    expect(lay([realm(0, 'Rus', 0, 1000, 400, 300)], 1, 300)[0].size).toBeCloseTo(33, 5);
  });

  it('spreads a short name over a long realm, but its letters stand no further apart than their height', () => {
    const [n] = lay([realm(0, 'Ulm', 100, 900, 400, 20)]);
    // three letters of 20 pixels at most 0.46 + 0.9 of their height apart, well short of 0.84 of the curve
    expect(n.length).toBe(Math.round(3 * 20 * (0.46 + 0.9)));
    const [m] = lay([realm(0, 'Braunschweig-Lüneburg', 300, 700, 400, 20)]);
    // a name whose letters at that spread would reach further fills 0.84 of its curve
    expect(m.size).toBe(20);
    expect(m.length).toBe(Math.round(400 * 0.84));
  });

  it('lies where its curve lies on the picture, squashed down it as the camera sees the ground', () => {
    const [flat] = lay([realm(0, 'Mailand', 300, 700, 500, 20)]),
      [squashed] = lay([realm(0, 'Mailand', 300, 700, 500, 20)], 0.5);
    expect(flat.d).toBe('M300.0 500.0Q500.0 500.0 700.0 500.0');
    expect(squashed.d).toBe('M300.0 450.0Q500.0 450.0 700.0 450.0');
  });

  it('is left out where it has no name', () => {
    expect(lay([realm(0, '', 200, 800, 400, 40)])).toEqual([]);
  });
});

describe('two names that run into each other', () => {
  it('keep the larger and leave out the smaller, and keep both where they lie apart', () => {
    const big = realm(1, 'Frankreich', 200, 800, 400, 40),
      small = realm(2, 'Burgund', 300, 700, 420, 20),
      far = realm(3, 'Navarra', 300, 700, 700, 20);
    expect(lay([small, big]).map((n) => n.realm)).toEqual([1]);
    expect(lay([small, big, far]).map((n) => n.realm)).toEqual([1, 3]);
    // names of the same size: the one laid first stays
    const twin = realm(4, 'Lothringen', 200, 800, 410, 40);
    expect(lay([big, twin]).map((n) => n.realm)).toEqual([1]);
  });

  it('keep apart by the points along them, not by their boxes alone', () => {
    // two curves whose boxes overlap, but which bend away from each other
    const up: RealmName & { name: string } = { ...realm(1, 'Kastilien', 200, 800, 400, 30), bend: [500, 100] },
      down: RealmName & { name: string } = { ...realm(2, 'Aragonien', 200, 800, 460, 30), bend: [500, 760] };
    expect(lay([up, down]).map((n) => n.realm)).toEqual([1, 2]);
  });
});

describe('a name as SVG', () => {
  it('writes its letters along its curve from the middle, and escapes what would break the markup', () => {
    const [n] = lay([realm(0, 'Bar & <Mosel>', 200, 800, 400, 30)]),
      svg = nameSvg(n, 'r0');
    expect(svg).toContain(`<path id="r0" d="${n.d}"/>`);
    expect(svg).toContain(`font-size="${n.size}" textLength="${n.length}"`);
    expect(svg).toContain('startOffset="50%" text-anchor="middle"');
    expect(svg).toContain('Bar &amp; &lt;Mosel>');
  });
});
