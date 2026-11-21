// PROTOTYPE (thread "Stadtgebäude mit KI-3D-Tools erzeugen", 20 Nov 2026): the houses of Paris around 1300 as in
// Ramon's reference picture of the Île de la Cité of that day (project files haeuser/referenz/paris_ramon_20nov.png,
// "so stelle ich mir das eher vor"): narrow houses each under its own steep gable turned to the street, a ground floor
// of pale limestone, timber-framed upper storeys, roofs of brown and red tiles and now and then slate, plain chimneys.
// Every value here is read off that picture and is an assumption until the tradition's sources are worked through
// (src/buildings/README.md, step 1). The colours, the window width, the tile shades and the shares of timber and jetties
// are the ones the Paris gauntlet's search found closest to the picture (tools/lookprobe/search_paris.py, 21 Nov 2026).
import { type RGB, rgb } from '../../lookprobe/batch';
import { m } from '../houses/style';
import type { Tradition } from './tradition';
import { VENICE } from './venice';

const hexes = (a: readonly number[]): readonly RGB[] => a.map((h) => rgb(h));

export const PARIS: Tradition = {
  ...VENICE,
  // the lanes and squares paved with grey-rose stones, as the reference picture draws them (assumption)
  quay: { ...VENICE.quay, paving: rgb(0x73635a), joint: 0.18, spread: 1.33 },
  storeys: [2, 3],
  greatStoreys: [3, 4],
  walls: hexes([0xf7c6a8, 0xeebea0, 0xfccdaf, 0xebba9c, 0xf3c3a5]),
  stone: rgb(0xe6d8c2),
  roof: rgb(0x9a5a38),
  // brown tiles most often, red and orange-red ones between them (no ochre: the picture has none), now and then slate
  // (assumption)
  roofs: hexes([
    0x6e523a, 0x836344, 0x99754f, 0x7c5e41, 0x876646, 0xa78056, 0x8b563f, 0x9b5e46, 0xad6e4d, 0xad7748, 0xba824b,
    0xc38e53, 0x6c5a4d, 0x5e5c62,
  ]),
  wood: rgb(0x5a3a24),
  chimneyC: rgb(0xd8c8ac),
  arched: 0,
  shutters: 0.25,
  washing: 0.05,
  jetty: { ...VENICE.jetty, share: 0.46 },
  altana: 0,
  pitch: [0.85, 1.05],
  chimney: { height: [3, 5], perHouse: 2 },
  dormers: 1,
  tileShades: [0.81, 0.4],
  // narrow tall windows with pale green glass, as the picture draws them
  window: [1, 3],
  glass: rgb(0x748a6b),
  plot: { width: [m(4.5), m(6.5)], depth: [m(6), m(8)], greatWidth: [m(9), m(12)] },
  timber: { share: 1, c: rgb(0x664f4c) },
  plainChimney: true,
};
