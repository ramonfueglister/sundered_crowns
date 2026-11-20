// PROTOTYPE (thread "Stadtgebäude mit KI-3D-Tools erzeugen", 20 Nov 2026): the houses of an Italian coast town as in
// Ramon's reference picture of that day (research/sim_city on his Mac): smooth plaster in ochre, rose and cream,
// hip roofs of coppi with a deep overhang, green shutters on every window, arcades of round arches on the ground
// floor, three and four storeys. Not yet from a measure file: every value here is read off that picture and is an
// assumption until the tradition's sources are worked through (src/buildings/README.md, step 1).
import { type RGB, rgb } from '../../lookprobe/batch';
import { VENICE } from './venice';
import type { Tradition } from './tradition';

const WALLS: readonly RGB[] = [0xe2c79a, 0xd9b48a, 0xe8cfae, 0xdcae94, 0xc9a77e, 0xeadbc0, 0xd8a98c].map((h) => rgb(h));

export const COAST: Tradition = {
  ...VENICE,
  storeys: [3, 4],
  walls: WALLS,
  stone: rgb(0xe9dfcb),
  roof: rgb(0xc8643a),
  chimneyC: rgb(0xd9c7a8),
  arched: 0,
  shutters: 0.95,
  shutterC: rgb(0x2f5a3a),
  washing: 0.08,
  jetty: { ...VENICE.jetty, share: 0 },
  altana: 0,
  pitch: [0.42, 0.55],
  chimney: { height: [3, 4], perHouse: 1.6 },
  hipped: 0.9,
  arcade: 0.45,
  plaster: true,
};
