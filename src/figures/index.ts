// The people of the world: small figures of a tenth-block kit, in the estates and trades of 1356, walking the streets
// of the towns and working the fields. See README.md.
//
// kit.ts      the parts every figure is made of, near and far
// estates.ts  what each estate and trade wears, carries and does
// crowd.ts    where the figures of a piece of the world stand and go (runs in the world's web workers; the first far
//             step's are in worldprobe/crowd.ts)
// people.ts   the persons of the 30 great cities who walk in their towns, fetched from the world server (workers;
//             the main thread fetches them again once a day of the world: src/people/town_rolls.ts)
// aims.ts     where in its town a person stands, walks, goes to market and to worship, and the person's figures there
// farmers.ts  the farmers among the persons at work on the furlongs of their town
// material.ts how they are drawn and moved, all in the vertex stage
// stage.ts    the figures on the stage: near or far kit, and whether anything walks
// schedule.ts which of a person's figures the plan of the day puts on the stage at the world's hour (main thread)
//
// index.ts exports only what runs in a worker; the stage takes stage.ts directly.
export { type Figures, type SettledGround, type Town, type Where, crowd, figuresOf, gathered, placer } from './crowd';
export {
  type PlacePeopleList,
  type TownPerson,
  FIGURE_FROM_AGE,
  loadTownPeople,
  setPlacePeople,
  townPeople,
} from './people';
export { ESTATES, Mode } from './estates';
export { fieldHands, lotOf, placeHands } from './farmers';
export { HEIGHT, MICRO, buildKit, FAR_PARTS, NEAR_PARTS } from './kit';
