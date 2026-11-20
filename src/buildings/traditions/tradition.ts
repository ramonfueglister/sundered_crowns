// What a building tradition says about its houses, read by the house grammar (houses/grammar.ts). Every value comes
// from the tradition's measure file under measures/ (with its source, or marked as an assumption there); lengths are
// in fine blocks (houses/style.ts VOXEL) unless the field says otherwise.
import type { RGB } from '../../lookprobe/batch';

/** The quay of a tradition: the wall to the water, its coping, the paving behind it, steps and mooring posts. */
export interface Quay {
  wall: RGB;
  coping: RGB;
  paving: RGB;
  post: RGB;
  /** a flight of water steps every so many blocks of straight quay, and a mooring post every so many */
  stepsEvery: readonly [number, number];
  postEvery: readonly [number, number];
}

export interface Tradition {
  quay: Quay;
  /** storey heights in fine blocks: the ground floor, the upper storeys, and the hall storey of a great house */
  ground: number;
  upper: number;
  noble: number;
  /** how many storeys a small house and a great house have: [lowest, highest] */
  storeys: readonly [number, number];
  greatStoreys: readonly [number, number];
  /** the walls' materials as seen from outside, the stone of sills, lintels and arches, the roof covering, the wood of doors and jetties */
  walls: readonly RGB[];
  stone: RGB;
  roof: RGB;
  wood: RGB;
  chimneyC: RGB;
  /** window and door openings [width, height]; the sill above the storey's floor; the spacing of the window axes */
  window: readonly [number, number];
  door: readonly [number, number];
  sill: number;
  bay: number;
  /** share of houses whose windows stand under pointed arches */
  arched: number;
  /** share of straight windows with open wooden shutters; share of upper storeys with washing on a line across the front */
  shutters: number;
  washing: number;
  /** upper storeys jettied out on wooden corbels: how far, from which storey (1 = first upper), share of houses */
  jetty: { out: number; from: number; share: number };
  /** roof pitch as rise over half the width [lowest, highest], and the share of houses with a roof terrace */
  pitch: readonly [number, number];
  altana: number;
  /** chimneys: height range in fine blocks, mean count per house */
  chimney: { height: readonly [number, number]; perHouse: number };
  /** plots in blocks: width and depth of small houses, width of great houses */
  plot: { width: readonly [number, number]; depth: readonly [number, number]; greatWidth: readonly [number, number] };
}
