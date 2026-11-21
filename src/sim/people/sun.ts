// When the sun rises and sets at a place on a day of the world (people feature 12, the day plan): the work of the day
// ran from sunrise to sunset ("from sunrise to sunset" between Easter and St Michael, Nieuwpoort; not before sunrise,
// Saint-Omer: Stabel 2014, TSEG 11(4), pp. 38–41), and night work was forbidden in most crafts "because the light at
// night does not suffice" (Millett 1915 on the Livre des métiers of Paris). The hours are of local solar time: noon
// is when the sun stands highest.
//
// The sun's place by the approximate solar coordinates of the U.S. Naval Observatory (Astronomical Applications,
// "Approximate Solar Coordinates": mean anomaly, mean longitude, the equation of the centre and the obliquity), from
// the Julian day number, so the Julian calendar of the world (src/sim/calendar.ts) needs no correction; sunrise and
// sunset when the sun's centre is 0.833° below the horizon (refraction and the sun's radius, the same source).
const RAD = Math.PI / 180;
/** The sun's altitude at sunrise and sunset, in degrees (USNO). */
const HORIZON = -0.833;

/** The sun's declination at noon of the Julian day number `jdn`, in radians. */
function declination(jdn: number): number {
  const d = jdn - 2451545,
    g = (357.529 + 0.98560028 * d) * RAD,
    q = 280.459 + 0.98564736 * d,
    lambda = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD,
    eps = (23.439 - 0.00000036 * d) * RAD;
  return Math.asin(Math.sin(eps) * Math.sin(lambda));
}

/** The hours of sunrise and sunset (local solar time, 0 to 24) at latitude `lat` (degrees) on the Julian day number
 *  `jdn`; in the polar night both are 12, in the midnight sun 0 and 24. */
export function sunHours(jdn: number, lat: number): [number, number] {
  const phi = lat * RAD,
    delta = declination(jdn),
    cosH = (Math.sin(HORIZON * RAD) - Math.sin(phi) * Math.sin(delta)) / (Math.cos(phi) * Math.cos(delta));
  if (cosH >= 1) return [12, 12];
  if (cosH <= -1) return [0, 24];
  const h = Math.acos(cosH) / RAD / 15;
  return [12 - h, 12 + h];
}
