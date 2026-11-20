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
  storeys: [2, 3],
  greatStoreys: [3, 4],
  walls: hexes([0xe6d6bc, 0xdcc9a8, 0xeadfca, 0xd6c2a2, 0xe2cfb0]),
  stone: rgb(0xcdbb9c),
  roof: rgb(0x9a5a38),
  roofs: hexes([0x7e4a30, 0x8c5034, 0x9a4e32, 0x6c4630, 0x5e5c62, 0x86583a, 0xa05a3a, 0x535257]),
  wood: rgb(0x5a3a24),
  chimneyC: rgb(0xd8c8ac),
  arched: 0,
  shutters: 0.25,
  washing: 0.05,
  jetty: { ...VENICE.jetty, share: 0.35 },
  altana: 0,
  pitch: [1.15, 1.45],
  chimney: { height: [3, 5], perHouse: 1.3 },
  plot: { width: [m(5.5), m(8)], depth: [m(7), m(10)], greatWidth: [m(9), m(12)] },
  timber: { share: 0.8, c: rgb(0x3e2716) },
  plainChimney: true,
};
