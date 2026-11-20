// The people of the world: small figures of a tenth-block kit, in the estates and trades of 1356, walking the streets
// of the towns and working the fields. See README.md.
//
// kit.ts      the parts every figure is made of, near and far
// estates.ts  what each estate and trade wears, carries and does
// crowd.ts    where the figures of a piece of the world stand and go (runs in the world's web workers; the first far
//             step's are in worldprobe/crowd.ts)
// people.ts   the persons of the 30 great cities who walk in their towns, fetched from the world server (workers)
// material.ts how they are drawn and moved, all in the vertex stage
// stage.ts    the figures on the stage: near or far kit, and whether anything walks
//
// index.ts exports only what runs in a worker; the stage takes stage.ts directly.
export { type Figures, type SettledGround, type Town, type Where, crowd, figuresOf, gathered, place } from './crowd';
export { type TownPerson, FIGURE_FROM_AGE, loadTownPeople, setPlacePeople, townPeople } from './people';
export { ESTATES, Mode } from './estates';
export { HEIGHT, MICRO, buildKit, FAR_PARTS, NEAR_PARTS } from './kit';
