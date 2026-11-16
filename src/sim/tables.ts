// Which start years have the tables of 1356 (the 30 cities after Chandler, the calibration of England's economy).
// 1291 has its own realms and borders (public/data/setup_1291.json) but no researched population, cities or economy
// yet: until it has, it takes those of 1356 as PLACEHOLDERS (post-plague numbers for a pre-plague world: a known gap).
const PLACEHOLDER_1356 = new Set([1291]);

/** Whether a world starting in `year` uses the tables of 1356 (its own, or as placeholders). */
export const uses1356Tables = (year: number): boolean => year === 1356 || PLACEHOLDER_1356.has(year);
