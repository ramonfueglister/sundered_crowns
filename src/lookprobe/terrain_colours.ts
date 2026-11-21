// The colours of the ground's tops (terrain.ts): the land's palette, the tiled meadows, and the colour a column's top
// shows at each corner of the grid.
import { type RGB, fbm2, hash2, mix, noise2, rgb, shade, smooth } from './batch';
import { type GroundTraits, Mat, SUMMIT } from './layout';
import { type Corners, lightAt } from './terrain_light';

export const GRASS_A = rgb(0xb0c83c),
  GRASS_B = rgb(0xbcca3e);
const GRASS_DRY = rgb(0xd2c444),
  GRASS_DEEP = rgb(0x98b638);
const MEADOW_MID = rgb(0x9abf3d),
  MEADOW_DEEP = rgb(0x82ac37),
  TUFT = rgb(0x5f9030);
const ROAD = rgb(0xe0c6a4),
  PAVED = rgb(0xe4c6b4),
  PLAZA = rgb(0xecd6c6);
export const ISLE_STONE = rgb(0xf0d6bc);
export const ROCK_TOP_LOW = rgb(0xb4aaa6);
const ROCK_TOP_HIGH = rgb(0xfdfaf8);
/** the soil of the fields under their crops: the colour a field's top is pulled towards (`topColor`), at FIELD_SOIL */
export const SOIL_WHEAT = rgb(0xc4aa4c),
  SOIL_OATS = rgb(0x6c9634);
const SOIL_VINE = rgb(0x587a2a);
/** the fallow: stubble and weeds, grazed, shows through the grass this far */
export const SOIL_FALLOW = rgb(0xb0a060),
  FALLOW_SHOWS = 0.65;
const SHADED_SOIL = rgb(0x6a705c);
export const DIRT = rgb(0xa88a52);
/** how far a field's top takes its soil's colour; the fallow's takes FALLOW_SHOWS */
export const FIELD_SOIL = 0.85;
export const QUAY = rgb(0xdcc4b4);

/**
 * The meadows of the reference are tiled, not washed: flat patches of a few cells, each a step greener, darker or
 * drier than the next, and single dark tufts. Gives the colour a cell is pulled towards and how far, or null.
 */
export function meadowPatch(x: number, z: number): readonly [RGB, number] | null {
  if (hash2(x, z, 87) < 0.008) return [TUFT, 0.6];
  // slabs of three by two cells, every other column of slabs shifted; dry patches of two by two between them
  const col = Math.floor(x / 3),
    lot = hash2(col, Math.floor((z + col) / 2), 83);
  if (lot < 0.22) return [MEADOW_MID, 0.4];
  if (lot > 0.93) return [MEADOW_DEEP, 0.4];
  return hash2(Math.floor(x / 2), Math.floor((z + Math.floor(x / 2)) / 2), 85) < 0.2 ? [GRASS_DRY, 0.22] : null;
}

/** `wx`, `wz`: the point in world blocks, which the patterns of the ground are laid out in. */
export function topColor(t: GroundTraits, x: number, z: number, mat: number, wx = x, wz = z): RGB {
  if (mat === Mat.Rock) return t.summit(x, z) > SUMMIT ? ROCK_TOP_HIGH : ROCK_TOP_LOW;
  if (mat === Mat.Paved && !t.city(x, z)) return shade(ISLE_STONE, 0.94 + 0.1 * noise2(wx / 1.7, wz / 1.7, 6));
  if (mat === Mat.Paved)
    return shade(mix(PLAZA, PAVED, smooth(-1, 3, t.plaza(x, z))), 0.93 + 0.12 * noise2(wx / 2.3, wz / 2.3, 4));
  if (mat === Mat.Bed) return QUAY;
  const crop = mat === Mat.Soil ? t.crop(x, z, 0.6) : null;
  let c = mix(GRASS_A, GRASS_B, fbm2(wx / 11, wz / 11, 21));
  // sun-bleached blades between the green ones, changing from cell to cell: the lit meadows of the reference are
  // speckled yellow-green
  c = mix(c, GRASS_DRY, hash2(Math.round(wx), Math.round(wz), 23) * (0.12 + 0.2 * t.bleach(x, z)));
  c = mix(c, GRASS_DEEP, smooth(0.45, 0.75, fbm2(wx / 13, wz / 13, 25)) * 0.6);
  const tint = t.tint?.(x, z);
  if (tint) c = mix(c, shade(tint[0], 0.96 + 0.08 * hash2(Math.round(wx), Math.round(wz), 24)), tint[1]);
  if (crop)
    c =
      crop === 'fallow'
        ? mix(c, SOIL_FALLOW, FALLOW_SHOWS)
        : mix(c, crop === 'wheat' ? SOIL_WHEAT : crop === 'oats' ? SOIL_OATS : SOIL_VINE, FIELD_SOIL);
  // paths: soft edges, because the colour is taken at the corners and blended across each block
  const near = t.road(x, z),
    road = 1 - smooth(1.3, 2.0, near + (noise2(wx / 2, wz / 2, 27) - 0.5) * 0.9);
  // bare earth shows through in patches, mostly beside the paths
  const bare = smooth(0.6, 0.72, fbm2(wx / 6, wz / 6, 29) + 0.12 * smooth(7, 2, near));
  c = mix(c, DIRT, bare * 0.7);
  return t.city(x, z) ? PAVED : mix(c, ROAD, road * 0.92);
}

/** the colour of the ground at a corner of the grid; the answer given before, where the kind of ground is the same */
function groundColour(c: Corners, cx: number, cz: number, mat: number): RGB {
  const k = cz * c.side + cx;
  if (c.kindAt[k] !== mat) {
    c.kindAt[k] = mat;
    c.groundAt[k] = topColor(c.t, cx, cz, mat, cx + c.ox, cz + c.oz);
  }
  return c.groundAt[k];
}
/**
 * the colour of a column's top at one of its four corners: the column's height, kind of ground, grain, cover, rock top
 * and meadow patch are the column's own
 */
export function cornerColour(
  c: Corners,
  cx: number,
  cz: number,
  h: number,
  mat: number,
  grain: number,
  cover: ReturnType<NonNullable<GroundTraits['cover']>>,
  rockTop: RGB | null,
  patch: ReturnType<typeof meadowPatch>,
): RGB {
  // where less of the sky is seen the ground turns not only darker but cooler: red falls off faster than blue
  const l = lightAt(c, cx, cz, h + 0.02);
  if (cover && !(cover.share! < 1))
    return [cover.top[0] * grain * l ** 1.5, cover.top[1] * grain * l, cover.top[2] * grain * l ** 0.3];
  const smoothBase = rockTop ?? groundColour(c, cx, cz, mat),
    own = patch ? mix(smoothBase, patch[0], patch[1]) : smoothBase,
    base = cover ? mix(own, cover.top, cover.share!) : own;
  // under trees and between houses the grass gives way to dull, dark soil
  const tone = mat === Mat.Grass ? mix(base, SHADED_SOIL, Math.min(1, (1 - l) * 1.3)) : base;
  return [tone[0] * grain * l ** 1.5, tone[1] * grain * l, tone[2] * grain * l ** 0.3];
}
