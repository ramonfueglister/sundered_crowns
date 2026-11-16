// The scale of the world: it is a diorama, and the simulation counts what the diorama shows (Ramon, 14 November 2026:
// "nein simulation nimmt auch verkleinerte menge"; one factor for people, goods and money, "finde ich gut").
//
// The world has a hundredth of the people of the real world of its time. Every person of the simulation is one person
// (Ramon, 16 November 2026: "eine person steht nicht für 100 menschen ... wir haben das bloss abgeleitet von den
// realen daten"): the number of people of a place is derived from the real data divided by SCALE, and a harvest or a
// stock of goods is what those people have. The land is not scaled: a place keeps its hectares, as the land of the
// world graphic keeps its kilometres. The rules of the economy are fitted to real data (England 1300: 4.72 million
// people), so a system applies such a rule to the real number the diorama's people were derived from (`ofTime`) and
// scales its result back (`toHeads`); per person nothing changes.

/** The real world of the time has this many times the people of the world. */
export const SCALE = 100;

/** The real number of people that `people` of the world were derived from. */
export const ofTime = (people: number): number => people * SCALE;

/** The people of the world derived from `people` of the real world of the time (also goods counted for them). */
export const toHeads = (people: number): number => people / SCALE;
