// The stage's lights as numbers, apart from the stage itself (which needs the renderer): the strengths and
// directions the stage sets its lights by, and how brightly a surface facing a given way is lit by them. A worker
// that reckons what a piece of the world looks like from afar (worldprobe/mean.ts) reads them here.
import { NEAR, RIGHT, VIEW } from './layout';

/** strengths of the far view's lights (a Lambert surface facing a light returns this share), and where they stand */
export const RIG = { sun: 0.9, sunElevation: 48, sunTurn: 12, side: 0.78, sky: 0.36, bounce: 0.12, fill: 0.1, fillTurn: 180 + VIEW.turn, fillElevation: 20 } as const;

/**
 * The creases and corners of the far view (stage/picture.ts draws them by three's GTAONode): how far they reach in the
 * stage's blocks, how deep they are drawn, how far behind a point something may lie and still darken it, and the
 * colour the deepest crease keeps.
 */
export const CREASES = { reach: 2.0, depth: 1.2, thickness: 4, colour: 0x44485a } as const;

const rad = (deg: number) => (deg * Math.PI) / 180;
/** a direction on the ground given by its share to the right of the picture and towards its back, raised by `elev` */
export function towards(turn: number, elev: number): [number, number, number] {
  const right = Math.cos(rad(turn)) * Math.cos(rad(elev)), back = Math.sin(rad(turn)) * Math.cos(rad(elev));
  return [RIGHT[0] * right - NEAR[0] * back, Math.sin(rad(elev)), RIGHT[1] * right - NEAR[1] * back];
}
/** towards the sun, the only light that casts shadows */
export const SUN = towards(RIG.sunTurn, RIG.sunElevation);
const SIDE = towards(0, 0), FILL = towards(RIG.fillTurn, RIG.fillElevation);
const facing = (n: readonly [number, number, number], l: readonly [number, number, number]) => Math.max(0, n[0] * l[0] + n[1] * l[1] + n[2] * l[2]);

/** How brightly the sun alone lights a surface that faces `n` (unit length) and lies in no shadow: what a cast shadow takes away. */
export const sunlit = (n: readonly [number, number, number]) => RIG.sun * facing(n, SUN);

/** How brightly the far view's lights light a surface that faces `n` (unit length) and lies in no shadow: sun, side light, fill, and the sky above with the ground's light from below. */
export const litness = (n: readonly [number, number, number]) => RIG.sun * facing(n, SUN) + RIG.side * facing(n, SIDE) + RIG.fill * facing(n, FILL) + RIG.sky * (0.5 + 0.5 * n[1]) + RIG.bounce * (0.5 - 0.5 * n[1]);
