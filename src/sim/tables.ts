// Which start years have the tables of 1356 of the economy (the calibration of the cities' economies).
// 1291 has its own realms and borders (public/data/setup_1291.json), its people before the plague and its own 30 cities
// with their persons (src/sim/content/cities.ts), but no economy of its own yet: until it has, it takes that of 1356 as
// a PLACEHOLDER (post-plague numbers for a pre-plague world: a known gap).
const PLACEHOLDER_1356 = new Set([1291]);

/** Whether a world starting in `year` uses the tables of 1356 (its own, or as placeholders). */
export const uses1356Tables = (year: number): boolean => year === 1356 || PLACEHOLDER_1356.has(year);
