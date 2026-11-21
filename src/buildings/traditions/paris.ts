// PROTOTYPE (thread "Stadtgebäude mit KI-3D-Tools erzeugen", 20 Nov 2026): the houses of Paris around 1300 as in
// Ramon's reference picture of the Île de la Cité of that day (project files haeuser/referenz/paris_ramon_20nov.png,
// "so stelle ich mir das eher vor"): narrow houses each under its own steep gable turned to the street, a ground floor
// of pale limestone, timber-framed upper storeys, roofs of brown and red tiles and now and then slate, plain chimneys.
// Every value here is read off that picture and is an assumption until the tradition's sources are worked through
// (src/buildings/README.md, step 1). The colours, the window width, the tile shades and the shares of timber and jetties
// are the ones the Paris gauntlet's search found closest to the picture (tools/lookprobe/search_paris.py, 21 Nov 2026),
// unrounded: a share rounded by a thousandth flips a house's draw and so draws another town.
import { type RGB, rgb } from '../../lookprobe/batch';
import { m } from '../houses/style';
import type { Tradition } from './tradition';
import { VENICE } from './venice';

const hexes = (a: readonly number[]): readonly RGB[] => a.map((h) => rgb(h));

export const PARIS: Tradition = {
  ...VENICE,
  // the lanes and squares paved with grey-rose stones, as the reference picture draws them (assumption)
  quay: { ...VENICE.quay, paving: rgb(0x73625a), joint: 0.18, spread: 1.968 },
  storeys: [2, 3],
  greatStoreys: [3, 4],
  walls: hexes([0xf2c3a7, 0xe4b69a, 0xfacdb1, 0xdfb094, 0xecbea2]),
  stone: rgb(0xe8d7c3),
  roof: rgb(0x9a5a38),
  // brown tiles most often, red and orange-red ones between them (no ochre: the picture has none), now and then slate
  // (assumption)
  roofs: hexes([
    0x6b5039, 0x806143, 0x96734e, 0x795c40, 0x846445, 0xa47e55, 0x88543e, 0x985c45, 0xaa6c4c, 0xaa7547, 0xb7804a,
    0xc08c52, 0x69584c, 0x5e5c62,
  ]),
  wood: rgb(0x5a3a24),
  chimneyC: rgb(0xd8c8ac),
  arched: 0,
  shutters: 0.25,
  washing: 0.05,
  jetty: { ...VENICE.jetty, share: 0.533 },
  altana: 0,
  pitch: [0.85, 1.05],
  chimney: { height: [3, 5], perHouse: 2 },
  dormers: 1,
  tileShades: [0.811, 0.4],
  // narrow tall windows with pale green glass, as the picture draws them
  window: [1, 3],
  glass: rgb(0x6c8b6b),
  plot: { width: [m(4.5), m(6.5)], depth: [m(6), m(8)], greatWidth: [m(9), m(12)] },
  timber: { share: 0.989, c: rgb(0x664f4c), post: 0.883 },
  plainChimney: true,
  stoneGround: true,
};
