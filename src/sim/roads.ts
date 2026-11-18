// Travel on the ways of the world (public/data/roads_<year>.json, tools/roads/build_roads.ts; docs/wiki/strassen.md).
//
// How long a way takes follows from what travels on it and what kind of way it is, the same rule in every century:
// - The speeds of the means of travel on level ground are those of ORBIS (Scheidel, Meeks and Weiland 2012, p. 20):
//   an ox cart 12 km a day, a heavily loaded mule or a porter 20, a traveller on foot or a moderately loaded pack
//   animal 30, routine horseback 56, a fast carriage of the state post 67.
// - A cart needs a way built for wheels: on a track goods go by pack animal (ORBIS likewise bars vehicles from the
//   caravan tracks of the desert, p. 19). Which kinds a cart can use is a rule of the kind (`WHEELS`).
// - The effort of a way is its km weighted by the time a slope takes (`slopeTime`, Tobler's hiking function): a day's
//   travel covers as much effort as it covers km on the level. Tobler's function is measured on walkers; goods over
//   land go at a walker's pace, beside the cart or the pack animal (tools/roads/build_roads.ts lays the ways by the
//   cost of building them and measures them by this).
// - Off a way one goes at 3/5 of the speed on a path (Tobler 1993): a stretch of land without a way takes its straight
//   km, weighted by its slope, over `OFF_WAY`.
// - In winter an earth way turns to mud. ORBIS bars carts in winter from the passes of the Alps, Pyrenees and Taurus
//   (p. 21); how much slower they go on the earth ways of the lowland is not measured there. `WINTER` is an assumption.
// - A better kept way is faster for wheels: on the turnpikes of England coaches went about 2 miles an hour faster than
//   on other roads, and over half the miles of other roads were judged poor against under a quarter of turnpike miles
//   (Bogart, Rosevear and Shaw-Taylor 2026, "A better ride", Explorations in Economic History). Kept ways come with the
//   upkeep of the ways (the next step of the road system); the kinds of the start net are not kept ones yet.

/**
 * Tobler's hiking function: km an hour on a path at a slope (rise over run, uphill positive), 6·e^(−3.5·|s + 0.05|)
 * (Tobler 1993, "Three presentations on geographical analysis and modeling", NCGIA Technical Report 93-1). The fastest
 * pace is on a slight descent.
 */
export const toblerKmh = (slope: number) => 6 * Math.exp(-3.5 * Math.abs(slope + 0.05));
/** How much longer a km at this slope takes than a km on the level, in the mean of both ways (the ways have no direction). */
export function slopeTime(slope: number): number {
  const level = toblerKmh(0);
  return 0.5 * (level / toblerKmh(slope) + level / toblerKmh(-slope));
}
/** off a way one goes at this share of the speed on a path (Tobler 1993) */
export const OFF_WAY = 0.6;

/** the kinds of way, as in roads_<year>.json: 0 track, 1 road, 2 highway (src/worldprobe/roads.ts ROAD_KINDS) */
export const TRACK = 0, ROAD = 1, HIGHWAY = 2;
/** a cart can travel the kinds from this one on */
export const WHEELS = ROAD;

export const MEANS = {
  /** an ox cart (ORBIS) */
  cart: { kmPerDay: 12, wheels: true },
  /** a heavily loaded mule or a porter (ORBIS) */
  mule: { kmPerDay: 20, wheels: false },
  /** a traveller on foot, an army on the march, a moderately loaded pack animal (ORBIS) */
  foot: { kmPerDay: 30, wheels: false },
  /** routine horseback (ORBIS) */
  horse: { kmPerDay: 56, wheels: false },
  /** a fast carriage of the state post (ORBIS) */
  post: { kmPerDay: 67, wheels: true },
} as const;
export type Means = keyof typeof MEANS;

/** in the winter months (December to February) a way of this kind is travelled at this share of its summer speed: an assumption, mud on earth ways */
export const WINTER: readonly number[] = [0.6, 0.7, 0.8];
/** the months of winter on the northern half of the globe (0 January) */
export const isWinter = (month: number) => month === 11 || month <= 1;

/**
 * A way from one place of the map to the next: its kind, km and effort (km weighted by the time its slopes take),
 * and the km of the straight line between its ends (0 where the file does not say), so that the way's windings are
 * effort / straight.
 */
export interface Way { a: number; b: number; kind: number; km: number; effort: number; straight: number }

export function waysOf(between: readonly (readonly number[])[]): Way[] {
  return between.filter((e) => e.length >= 5).map(([a, b, kind, km, effort, straight = 0]) => ({ a, b, kind, km, effort, straight }));
}

/**
 * How much longer than the straight line between two neighbouring places goods travel: along a way, as much as the
 * way winds and climbs (effort over its straight line); without one, or where the way winds more than going across
 * the land, across the land at the speed off a way, with the time the slope between the two takes (`rise` in metres
 * over `km`). Goods go the quicker of the two.
 */
export function stretchOf(way: Way | undefined, km: number, rise: number): number {
  const across = km > 0 ? slopeTime(rise / (km * 1000)) / OFF_WAY : 1 / OFF_WAY;
  if (!way) return across;
  const winds = way.straight > 0 ? Math.max(1, way.effort / way.straight) : Math.max(1, way.effort / Math.max(way.km, 1e-9));
  return Math.min(winds, across);
}

/**
 * Days a means of travel takes along a way. Goods that go by cart change to pack animals on a track; a carriage
 * cannot travel a track at all and its riders go on horseback.
 */
export function daysOn(way: Way, means: Means, month = 6): number {
  let m: Means = means;
  if (MEANS[m].wheels && way.kind < WHEELS) m = means === 'cart' ? 'mule' : 'horse';
  const winter = isWinter(month) ? WINTER[Math.max(0, Math.min(WINTER.length - 1, way.kind))] : 1;
  return way.effort / (MEANS[m].kmPerDay * winter);
}

/** The ways of a year as the file has them (public/data/roads_<year>.json). */
export interface RoadsFile { year: number; between: readonly (readonly number[])[] }

/** The ways of the map as a lookup from a pair of places (smaller index first). */
export class WayNet {
  private byPair = new Map<number, Way>();
  /** `year`: the start year the net serves; `laid`: the year of the file it comes from (the latest at or before it) */
  constructor(ways: readonly Way[], private places: number, readonly year = 0, readonly laid = year) { for (const w of ways) this.byPair.set(this.key(w.a, w.b), w); }
  private key(a: number, b: number) { return a < b ? a * this.places + b : b * this.places + a; }
  /** the way between two neighbouring places, or undefined where none runs */
  between(a: number, b: number): Way | undefined { return this.byPair.get(this.key(a, b)); }
  get size() { return this.byPair.size; }
}
