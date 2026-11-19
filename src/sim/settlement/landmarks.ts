// The landmarks of a town (settlement feature 5, docs/SETTLEMENT_DESIGN.md): which great buildings it has, how large
// they are and where they lie, and how far they are built in a year. Only arithmetic; src/sim/systems/landmarks.ts
// writes them into the land register.
//
// A town has the church of its see (a cathedral, an orthodox cathedral or its Friday mosque, after
// src/sim/content/landmarks_1291.json), the buildings known by name that stand in it, the convents of the mendicant
// orders a Latin town of its size had, and the residence of the ruler whose seat it is. A building known by name
// keeps its real place in the town: its real metres from the town's point, scaled as the town is (`URBAN`).
import { SCALE } from '../scale';

/** What a landmark is. */
export const LANDMARK_KIND = {
  /** the cathedral of a Latin archbishop or bishop */
  cathedral: 0,
  /** the cathedral of an orthodox (or other eastern) bishop */
  orthodox: 1,
  /** the Friday mosque of a Muslim town */
  mosque: 2,
  /** a convent of a mendicant order: its church and cloister */
  convent: 3,
  /** an abbey: its church and its cloister */
  abbey: 4,
  /** a castle: a ruler's residence or a fortress */
  castle: 5,
  /** a palace: a ruler's residence in a Muslim or Byzantine town */
  palace: 6,
  /** a church known by name that is no cathedral */
  church: 7,
  /** a monument of its own kind (a lighthouse, the Dome of the Rock, Great Zimbabwe) */
  monument: 8,
} as const;
export type LandmarkKind = (typeof LANDMARK_KIND)[keyof typeof LANDMARK_KIND];

/** How far the town of the world is drawn together against the real town: it has 1/SCALE of the people at the same
 *  density of houses (the houses are of their real size, settlement feature 1), so it is √(1/SCALE) as wide. A
 *  building known by name lies that much nearer the town's point than in the real town. OWN RULE, from the scale. */
export const URBAN = Math.sqrt(1 / SCALE);

/** The ground a landmark takes where its size is not known, in metres: the long side (east-west) and the short.
 *  PLACEHOLDER: about the middle of what the buildings known by name measure (landmarks_1291.json: Gothic cathedrals
 *  97–178 m long, the great mosques 80–175 m, abbey churches 106–187 m). */
export const SIZE_OF: Record<LandmarkKind, readonly [number, number]> = {
  [LANDMARK_KIND.cathedral]: [90, 32],
  [LANDMARK_KIND.orthodox]: [40, 30],
  [LANDMARK_KIND.mosque]: [60, 45],
  [LANDMARK_KIND.convent]: [60, 36],
  [LANDMARK_KIND.abbey]: [100, 60],
  [LANDMARK_KIND.castle]: [60, 50],
  [LANDMARK_KIND.palace]: [100, 70],
  [LANDMARK_KIND.church]: [50, 25],
  [LANDMARK_KIND.monument]: [40, 40],
};
/** an archbishop's cathedral, and the Friday mosque of a great town (BIG_TOWN people of the time and more), are
 *  larger. PLACEHOLDER, as SIZE_OF. */
export const SIZE_ARCH: readonly [number, number] = [130, 45], SIZE_GREAT_MOSQUE: readonly [number, number] = [100, 80];
export const BIG_TOWN = 50000;

/** The mendicant orders, in the order they came into the towns, and the people of the time from which a Latin
 *  town had a convent of each in 1291. The Franciscans (1209) and Dominicans (1216) were in nearly every town by
 *  then, the Carmelites (in the West from the 1240s) and the Augustinian hermits (1256) in the larger ones; Le Goff
 *  (1968) took the number of mendicant convents as the measure of a town's rank. PLACEHOLDER: the thresholds are not
 *  read from Le Goff or Emery (1962). */
export const ORDERS = [
  { id: 'franciscans', de: 'Franziskaner', en: 'Franciscans', from: 2000 },
  { id: 'dominicans', de: 'Dominikaner', en: 'Dominicans', from: 4000 },
  { id: 'augustinians', de: 'Augustiner-Eremiten', en: 'Augustinian hermits', from: 10000 },
  { id: 'carmelites', de: 'Karmeliter', en: 'Carmelites', from: 15000 },
] as const;

/** the orders that had a convent in a Latin town of `people` of the time (indices of ORDERS) */
export function ordersOf(people: number): number[] {
  return ORDERS.map((o, k) => (people >= o.from ? k : -1)).filter((k) => k >= 0);
}

/** How a landmark stands in `year`: not yet begun, being built (with the share built), standing, or a ruin. */
export const BUILT = { not_yet: 0, building: 1, standing: 2, ruin: 3 } as const;
/** the year a landmark has no year for (its building is not known, or it never fell) */
export const NO_YEAR = -32768;

export function builtIn(start: number, end: number, ruined: number, year: number): { state: number; share: number } {
  if (ruined !== NO_YEAR && year >= ruined) return { state: BUILT.ruin, share: 1 };
  if (start !== NO_YEAR && year < start) return { state: BUILT.not_yet, share: 0 };
  if (end !== NO_YEAR && start !== NO_YEAR && year < end) return { state: BUILT.building, share: Math.min(1, Math.max(0, (year - start) / Math.max(1, end - start))) };
  return { state: BUILT.standing, share: 1 };
}

/** The convents of a town lie at its edge, where the friars found ground (Le Goff 1968: the mendicants settled at
 *  the edge of the towns and in their suburbs): one after another round the town, from the east by the south.
 *  The bearing of the k-th, in radians from the east, clockwise as the plan's z runs south. */
export const edgeBearing = (k: number): number => (k * 2 * Math.PI) / 5 + Math.PI / 10;
