// PROTOTYPE (thread "Stadtgebäude mit KI-3D-Tools erzeugen", 20 Nov 2026): the houses of Paris around 1300 as in
// Ramon's reference picture of the Île de la Cité of that day (project files haeuser/referenz/paris_ramon_20nov.png,
// "so stelle ich mir das eher vor"): narrow houses each under its own steep gable turned to the street, a ground floor
// of pale limestone, timber-framed upper storeys, roofs of brown and red tiles and now and then slate, plain chimneys.
// Every value here is read off that picture and is an assumption until the tradition's sources are worked through
// (src/buildings/README.md, step 1).
import { type RGB, rgb } from '../../lookprobe/batch';
import { m } from '../houses/style';
import type { Tradition } from './tradition';
import { VENICE } from './venice';

const hexes = (a: readonly number[]): readonly RGB[] => a.map((h) => rgb(h));

export const PARIS: Tradition = {
  ...VENICE,
  // the lanes and squares paved with grey-rose stones, as the reference picture draws them (assumption)
  quay: { ...VENICE.quay, paving: rgb(0x7e6664), joint: 0.18 },
  storeys: [2, 3],
  greatStoreys: [3, 4],
  walls: hexes([0xd2b49c, 0xc8aa92, 0xd8bca4, 0xc4a48c, 0xceb098]),
  stone: rgb(0xe6d8c2),
  roof: rgb(0x9a5a38),
  // brown tiles most often, red and orange ones between them, and now and then slate, as the picture shows (assumption)
  roofs: hexes([
    0x5e3a2a, 0x7e4e36, 0x9e6242, 0x744832, 0x845238, 0xb06e4a, 0x8a3e30, 0xa04838, 0xb85a40, 0xa86a34, 0xc0783c,
    0xd08a4c, 0x5a4440, 0x5e5c62,
  ]),
  wood: rgb(0x5a3a24),
  chimneyC: rgb(0xd8c8ac),
  arched: 0,
  shutters: 0.25,
  washing: 0.05,
  jetty: { ...VENICE.jetty, share: 0.35 },
  altana: 0,
  pitch: [0.85, 1.05],
  chimney: { height: [3, 5], perHouse: 2 },
  dormers: 1,
  tileShades: [0.9, 0.15],
  plot: { width: [m(4.5), m(6.5)], depth: [m(6), m(8)], greatWidth: [m(9), m(12)] },
  timber: { share: 0.65, c: rgb(0x5e4838) },
  plainChimney: true,
};
