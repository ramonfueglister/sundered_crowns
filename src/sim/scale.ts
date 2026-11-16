// The scale of the world: it is a diorama, and the simulation counts what the diorama shows (Ramon, 14 November 2026:
// "nein simulation nimmt auch verkleinerte menge"; one factor for people, goods and money, "finde ich gut").
//
// One head of the simulation stands for SCALE people of the time; a harvest or a stock of goods is counted for those
// heads. The land is not scaled: a place keeps its hectares, as the land of the world graphic keeps its kilometres.
// The rules of the economy are fitted to sources in people of the time (England 1300: 4.72 million), so a system
// that applies such a rule turns heads into people of the time first (`ofTime`) and its result back (`toHeads`).

/** People of the time that one head of the simulation stands for. */
export const SCALE = 100;

/** The people of the time that `heads` of the simulation stand for. */
export const ofTime = (heads: number): number => heads * SCALE;

/** The heads of the simulation for `people` of the time (also for goods counted for them). */
export const toHeads = (people: number): number => people / SCALE;
