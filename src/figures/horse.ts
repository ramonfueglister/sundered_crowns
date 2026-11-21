// A ruler on the way, riding (the map mode of the rulers, src/people/rulers_mode.ts and worldprobe/view_riders.ts):
// a horse and its rider in the parts of the figures' kit (kit.ts), drawn by the figures' material (material.ts).
// The horse's legs swing about their own tops (Joint.ForeL … HindR); the rider sits still in the saddle.
//
// Front is -z, the hooves stand at y = 0, units are micro voxels as in kit.ts. The horse is drawn in the proportion
// of the figures: a man of 12 micro voxels stands for 1.70 m (kit.ts HEIGHT), so a horse of 14 hands, 1.42 m at the
// withers, is 10. Horses of medieval England were "often below 14.2 hands high", and 15 hands "very rare indeed"
// (Ameen et al., International Journal of Osteoarchaeology, January 2022, as the University of Exeter reports it).
import { Joint, P, type Part, Slot } from './kit';

/**
 * Where the tops of the fore and the hind legs lie, in blocks before (-) and behind the middle of the horse: they
 * swing about these points at the height of the hip (kit.ts HIP, five micro voxels: the horse's legs are as long).
 */
export const FORE_Z = -0.36,
  HIND_Z = 0.36;

/** From the hooves to the top of the crown, in blocks. */
export const RIDER_HEIGHT = 1.93;

/**
 * The horse and its rider. The legs go by the amble, both legs of one side together: the gait of the palfrey, the
 * riding horse of a journey, which "rather than trotting, usually possessed a smooth, ambling gait" (Bennett 1998,
 * Conquerors: The Roots of New World Horsemanship, cited so by Wikipedia "Palfrey"). The colours: the horse's coat
 * is the figure's load colour, mane, tail and hair the hair colour, the rider's garment and the horse's cloth the
 * garment colour (the realm's), the crown the headwear colour.
 */
export const RIDER_PARTS: readonly Part[] = [
  // the legs, each with its hoof, on the joint of its side
  ...(
    [
      [-1.8, -4.2, Joint.ForeL],
      [0.6, -4.2, Joint.ForeR],
      [-1.8, 3, Joint.HindL],
      [0.6, 3, Joint.HindR],
    ] as const
  ).flatMap(([x, z, leg]) => [
    P(x, 0.6, z, x + 1.2, 5.2, z + 1.2, Slot.Load, leg),
    P(x - 0.05, 0, z - 0.05, x + 1.25, 0.6, z + 1.25, Slot.Shoes, leg),
  ]),
  // the barrel, the neck rising forward, the head with its muzzle, ears and eyes
  P(-2, 5, -5, 2, 10, 5, Slot.Load, Joint.Body),
  P(-1.1, 8.8, -6.6, 1.1, 12.8, -4, Slot.Load, Joint.Body),
  P(-0.9, 11.8, -9.4, 0.9, 14, -6, Slot.Load, Joint.Body),
  P(-0.75, 11.2, -9.8, 0.75, 12.4, -7.8, Slot.Load, Joint.Body),
  P(-0.8, 14, -6.7, -0.3, 14.9, -6.1, Slot.Load, Joint.Body),
  P(0.3, 14, -6.7, 0.8, 14.9, -6.1, Slot.Load, Joint.Body),
  P(-0.95, 13, -7.9, 0.95, 13.4, -7.4, Slot.Shoes, Joint.Body),
  // the mane along the back of the neck, and the tail
  P(-0.4, 9.4, -4.4, 0.4, 13.4, -3.6, Slot.Hair, Joint.Body),
  P(-0.5, 4.2, 5, 0.5, 9.6, 6, Slot.Hair, Joint.Body),
  P(-0.6, 8.8, 4.6, 0.6, 10, 5.6, Slot.Hair, Joint.Body),
  // the cloth over the horse's back and flanks, in the realm's colour, the saddle on it, and the reins
  P(-2.15, 6, -3.6, 2.15, 10.25, 3.6, Slot.Tunic, Joint.Body),
  P(-1.6, 10, -1.8, 1.6, 10.6, 1.8, Slot.Belt, Joint.Body),
  P(-1.6, 10.6, 1.4, 1.6, 11.6, 1.9, Slot.Belt, Joint.Body),
  P(-1.05, 12.4, -8.6, -0.95, 12.6, -2.8, Slot.Belt, Joint.Body),
  P(0.95, 12.4, -8.6, 1.05, 12.6, -2.8, Slot.Belt, Joint.Body),
  // the rider's legs astride: thighs forward over the saddle, the lower legs down the flanks, and the shoes
  P(-2.7, 10, -2.2, -1.4, 11.4, 0.6, Slot.Legs, Joint.Body),
  P(1.4, 10, -2.2, 2.7, 11.4, 0.6, Slot.Legs, Joint.Body),
  P(-2.7, 7, -2.2, -1.7, 10.2, -1, Slot.Legs, Joint.Body),
  P(1.7, 7, -2.2, 2.7, 10.2, -1, Slot.Legs, Joint.Body),
  P(-2.75, 6.4, -2.7, -1.65, 7.2, -1, Slot.Shoes, Joint.Body),
  P(1.65, 6.4, -2.7, 2.75, 7.2, -1, Slot.Shoes, Joint.Body),
  // the body in its garment, the skirt spread over the saddle, the belt
  P(-2.3, 10.6, -1.3, 2.3, 15.2, 1.3, Slot.Tunic, Joint.Body),
  P(-2.5, 9.6, -1.6, 2.5, 11.2, 1.8, Slot.Tunic, Joint.Body),
  P(-2.4, 12, -1.4, 2.4, 12.6, 1.4, Slot.Belt, Joint.Body),
  // the arms down to the elbows, the forearms forward to the reins, the hands
  P(-3.3, 12.6, -1, -2.3, 15, 0.6, Slot.Tunic, Joint.Body),
  P(2.3, 12.6, -1, 3.3, 15, 0.6, Slot.Tunic, Joint.Body),
  P(-3.3, 12.4, -2.8, -2.3, 13.3, -0.8, Slot.Tunic, Joint.Body),
  P(2.3, 12.4, -2.8, 3.3, 13.3, -0.8, Slot.Tunic, Joint.Body),
  P(-3.2, 12.3, -3.4, -2.4, 13.2, -2.8, Slot.Skin, Joint.Body),
  P(2.4, 12.3, -3.4, 3.2, 13.2, -2.8, Slot.Skin, Joint.Body),
  // the head as the figures have it (kit.ts NEAR_PARTS), and a crown: a band with four points
  P(-1.5, 15.2, -1.5, 1.5, 18.2, 1.5, Slot.Skin, Joint.Head),
  P(-1.1, 16.6, -1.62, -0.5, 17.1, -1.4, Slot.Shoes, Joint.Head),
  P(0.5, 16.6, -1.62, 1.1, 17.1, -1.4, Slot.Shoes, Joint.Head),
  P(-0.25, 16, -1.8, 0.25, 16.7, -1.4, Slot.Skin, Joint.Head),
  P(-1.6, 15.8, 0.6, 1.6, 18.3, 1.6, Slot.Hair, Joint.Head),
  P(-1.65, 17.8, -1.65, 1.65, 18.5, 1.65, Slot.Headwear, Joint.Head),
  P(-0.35, 18.5, -1.75, 0.35, 19.3, -1.45, Slot.Headwear, Joint.Head),
  P(-0.35, 18.5, 1.45, 0.35, 19.3, 1.75, Slot.Headwear, Joint.Head),
  P(-1.75, 18.5, -0.35, -1.45, 19.3, 0.35, Slot.Headwear, Joint.Head),
  P(1.45, 18.5, -0.35, 1.75, 19.3, 0.35, Slot.Headwear, Joint.Head),
];
