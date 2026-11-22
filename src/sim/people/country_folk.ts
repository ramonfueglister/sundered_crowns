// The country folk of a town: the families of the villages round a town who till the land its economy needs.
//
// The economy of a town is England in 1356 at the town's size (data/economy/england_1356.json), and 57.2 % of
// England's labour force worked in agriculture. That share is the whole realm's: Broadberry, Campbell and van Leeuwen
// (2013, When did Britain industrialise?, Explorations in Economic History 50(1), accepted manuscript pp. 4 to 5 and
// table 1, p. 28) weight the occupations of the poll tax of 1381 by "urban 10%, semi-rural 10%, rural 80%". The people
// of a town after Chandler are the people inside the town. In a town the same paper counts 12 of 749 men with an
// occupation in agriculture (Coventry, muster rolls of 1522, table 2A, p. 29; Hulton 1999).
//
// So a town's persons are its townsfolk, of whom the share of Coventry works the land, and the persons who work the
// rest of the land its economy needs live in the villages round it: as many as make the economy's share of
// agriculture with the townsfolk. OWN RULE: the villages hold only the farmers the town's economy needs and their
// families, at the age and household structure of the town (src/sim/systems/people.ts), not the crafts of a village.

/** The share of a town's workers who work in agriculture: Coventry 1522, 12 of 749 men with a known occupation
 *  (Broadberry, Campbell and van Leeuwen 2013, table 2A, p. 29). */
export const TOWN_AGRICULTURE = 12 / 749;

/** The share of the labour force in agriculture of the calibration table in use (`inputs.labour_share[0]`), set when
 *  a World is built (src/sim/world.ts), as the participation rates are (src/sim/systems/work.ts). */
export const agricultureLabour = { share: NaN };

/** The persons of the villages round a town of `town` persons: with the same share of workers among them, the
 *  workers of town and villages together work in agriculture at the share `share`, those of the town at
 *  `TOWN_AGRICULTURE`: v + a·t = L·(v + t), so v = t·(L − a)/(1 − L). */
export function countryFolk(town: number, share = agricultureLabour.share): number {
  if (!(share >= 0 && share < 1)) throw new Error(`no world has been built: the share of agriculture is ${share}`);
  return Math.max(0, Math.round((town * (share - TOWN_AGRICULTURE)) / (1 - share)));
}
