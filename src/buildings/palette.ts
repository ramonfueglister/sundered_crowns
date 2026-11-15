// The colours of the buildings. Wall and roof colours of the south were taken from k-means palettes of the reference
// image (look probe calibration); the materials of other lands are first values, set by eye (an assumption, to be
// measured when each tradition gets its sources).
import { rgb } from '../lookprobe/batch';

export const WINDOW = rgb(0x3c3e48), WINDOW_WARM = rgb(0x4a3a34), DOOR = rgb(0x5a3a26), FRAME = rgb(0xfdf6ea), DORMER = rgb(0x4e3630);
export const SHUTTERS = [rgb(0x5f8a5a), rgb(0x8a5a3c), rgb(0x4f7a8a)];
/** the dark of openings high up (belfries, tower windows) */
export const OPENING = rgb(0x3d4650);
/** glass of church windows */
export const GLASS = rgb(0x46506a);

/** pale plaster of the houses of the reference image */
export const WALLS = [rgb(0xf8e6cc), rgb(0xf8e2bc), rgb(0xf8dcc2), rgb(0xf6dcae), rgb(0xf2d29c), rgb(0xf4d0b4), rgb(0xeccc9a), rgb(0xf4d8b8), rgb(0xf0c2a6), rgb(0xe2ccb6),
  rgb(0xf4ca84), rgb(0xf0c47a), rgb(0xf4d0ae), rgb(0xf8dcc8), rgb(0xf2ccb0)];
/** red tiles of the reference image */
export const ROOFS = [rgb(0xf0805c), rgb(0xe87656), rgb(0xf29068), rgb(0xe06a50), rgb(0xee9060), rgb(0xd86048)];

export const STONE = rgb(0xd8ccc0), BRICK = rgb(0xd0603c), MARBLE = rgb(0xfdf4ea), PINK = rgb(0xf6dccc);
/** a paler limestone, used for the great churches of the north */
export const STONE_PALE = rgb(0xe6dccc);
export const LEAD = rgb(0xd0ced4), COPPER = rgb(0x6fb078), GOLD = rgb(0xf4c440), SLATE = rgb(0x7c8494);
