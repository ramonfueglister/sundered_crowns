// The four house styles the map uses today. They are placeholders: SOUTH is measured on the reference image, the other
// three are first values set by eye (assumptions, no source). Each will be replaced by a tradition with its own sourced
// parameter file, one region at a time.
import { rgb } from '../../lookprobe/batch';
import { type HouseStyle, m } from '../houses/style';
import { BRICK, ROOFS, SLATE, WALLS } from '../palette';

/** the houses of the reference image: pale plaster under low roofs of red tiles (pitch measured on the reference) */
export const SOUTH: HouseStyle = { walls: WALLS, roofs: ROOFS, pitch: [0.26, 0.36], maxRise: m(2.1), gables: 0.3 };

/** the brick and plaster of the north, under steep roofs that mostly end in gables (assumption) */
export const NORTH: HouseStyle = {
  walls: [
    BRICK,
    rgb(0xc8684a),
    rgb(0xdc7a56),
    rgb(0xd6694a),
    rgb(0xf6ecdc),
    rgb(0xf2e2c4),
    rgb(0xe6d2b4),
    rgb(0xdccfc0),
  ],
  roofs: [rgb(0xd05a3c), rgb(0xc24e36), rgb(0xb84a34), rgb(0xdc6a48), SLATE, rgb(0x9a6a4c)],
  pitch: [0.75, 1.05],
  maxRise: m(4.9),
  gables: 0.85,
};

/** the timber houses of the Rus under shingle roofs (assumption) */
export const TIMBER: HouseStyle = {
  walls: [rgb(0xc09a6c), rgb(0xb48a5c), rgb(0xcaa87c), rgb(0xa87e54), rgb(0xd4b68c)],
  roofs: [rgb(0x9a7a5c), rgb(0x8a6c50), rgb(0xa88868), rgb(0x8c8478)],
  pitch: [0.6, 0.9],
  maxRise: m(4.0),
  gables: 0.9,
};

/** the whitewashed and earthen houses of the lands of Islam, with terrace roofs (assumption) */
export const TERRACE: HouseStyle = {
  walls: [rgb(0xfaf2e2), rgb(0xf6e8cc), rgb(0xf0dcb8), rgb(0xe8cea2), rgb(0xf4e4c8), rgb(0xe2c498)],
  roofs: [rgb(0xe8cea2)],
  pitch: [0, 0],
  maxRise: 0,
  gables: 0,
  flat: true,
};
