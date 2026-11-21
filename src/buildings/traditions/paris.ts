// PROTOTYPE (thread "Stadtgebäude mit KI-3D-Tools erzeugen", 20 Nov 2026): the houses of Paris around 1300 as in
// Ramon's reference picture of the Île de la Cité of that day (project files haeuser/referenz/paris_ramon_20nov.png,
// "so stelle ich mir das eher vor"): narrow houses each under its own steep gable turned to the street, a ground floor
// of pale limestone, timber-framed upper storeys, roofs of brown and red tiles and now and then slate, plain chimneys.
// Every value here is read off that picture and is an assumption until the tradition's sources are worked through
// (src/buildings/README.md, step 1). The search of the Paris gauntlet (tools/lookprobe/search_paris.py) met its checks
// but not the eye (Ramon, 21 Nov 2026: "ich bin aber nicht happy"); the values were then set by eye beside the picture
// at the same scale that evening and checked against the gauntlet on four towns: steeper roofs without dormers, wider
// windows further apart, half the houses of stone, thick dark timbers, coarser tiles, small cobbles.
import { type RGB, rgb } from '../../lookprobe/batch';
import { m } from '../houses/style';
import type { Tradition } from './tradition';
import { VENICE } from './venice';

const hexes = (a: readonly number[]): readonly RGB[] => a.map((h) => rgb(h));

export const PARIS: Tradition = {
  ...VENICE,
  // the lanes and squares paved with small grey-rose cobbles, as the reference picture draws them (assumption)
  quay: { ...VENICE.quay, paving: rgb(0xa08880), joint: 0.18, spread: 2.5, slab: 1.5 },
  storeys: [2, 3],
  greatStoreys: [3, 4],
  walls: hexes([0xeec9b3, 0xe0bca5, 0xf6d3be, 0xdbb69f, 0xe8c4ae]),
  stone: rgb(0xe8d7c2),
  roof: rgb(0x9a5a38),
  // brown tiles most often, red and orange-red ones between them (no ochre: the picture has none), now and then slate
  // (assumption)
  roofs: hexes([
    0x5a3b30, 0x724c3b, 0x8a5d46, 0x6a4738, 0x774f3d, 0x99684d, 0x7b4035, 0x8c473d, 0x9f5744, 0x9f5f3f, 0xad6a42,
    0xb6754a, 0x5c4a3e, 0x5e5c62,
  ]),
  wood: rgb(0x5a3a24),
  chimneyC: rgb(0xd8c8ac),
  arched: 0,
  shutters: 0.25,
  washing: 0.05,
  jetty: { ...VENICE.jetty, share: 0.533 },
  altana: 0,
  // steep: the roofs rise about as high as the walls below them (assumption)
  pitch: [1.1, 1.35],
  chimney: { height: [3, 5], perHouse: 2 },
  // no dormers: the picture draws none
  dormers: 0,
  tileShades: [0.86, 0.3],
  // windows of two fine blocks with dark glass, two to a gable front, as the picture draws them
  window: [2, 3],
  bay: 6,
  glass: rgb(0x4a4a40),
  plot: { width: [m(4.5), m(6.5)], depth: [m(6), m(8)], greatWidth: [m(9), m(12)] },
  // about half the houses timber-framed above a stone ground floor, the others of stone throughout (assumption)
  timber: { share: 0.55, c: rgb(0x5a4038), post: 1.2 },
  plainChimney: true,
  stoneGround: true,
  ashlarSpread: 2.2,
};
