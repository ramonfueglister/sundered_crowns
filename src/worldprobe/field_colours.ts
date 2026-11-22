// The colours of a field seen from afar (far_fields.ts), which the stage changes with the season from there
// (lookprobe/stage/season_look.ts).
import { type RGB, mix } from '../lookprobe/batch';
import { VINE_BODY, WHEAT_SIDE } from '../lookprobe/blocks';

/** a field from above: the tops of its crop with a little of their sides, and with more of them where it is no longer raised */
export const field = (crop: RGB, flat: boolean, side: RGB = WHEAT_SIDE) => mix(crop, side, flat ? 0.6 : 0.3),
  VINEYARD = mix(VINE_BODY, WHEAT_SIDE, 0.3);
export const tinted = (c: RGB, by: readonly [number, number, number]): RGB => [
  c[0] * by[0],
  c[1] * by[1],
  c[2] * by[2],
];
/**
 * The fields as the camera sees them from above, as a share of the colours far.ts gave them by eye: the rows of the
 * winter corn stand in each other's shade and creases, and the finest step's vineyards are not dark green but the
 * colour of their ground between the rows. The fallow's soil showed too pale and grey beside the finest step's stubble
 * in the grass. Measured against the mean of the finest step (mean.ts, `?mean=compare`) at Paris and in the Black
 * Forest; the spring corn on 22 November 2026 against the same ground at the first far step, which draws the finest
 * step's sheaves (Paris in the summer the pieces are built in, 1180 and 1220 blocks wide, either side of the border:
 * the mean of 20,453 dots of its fields the same within 1 % in red and green and 7 % in blue, in linear light).
 */
export const SEEN_WINTER = [0.84, 0.9, 0.9] as const,
  SEEN_SPRING = [0.8, 0.75, 0.72] as const,
  SEEN_VINES = [1.53, 1.1, 1.13] as const,
  SEEN_FALLOW = [0.99, 1.14, 0.76] as const;
