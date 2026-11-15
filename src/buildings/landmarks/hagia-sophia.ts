// The Great Church of Constantinople, drawn to its main masses, not yet to its measured plan.
import { Batch, rgb, shade } from '../../lookprobe/batch';
import { drum, dome } from '../core/solids';
import { SIDES, arch, pane, spread, wallOf } from '../core/wall';
import { DOOR, GLASS, GOLD, LEAD } from '../palette';

/**
 * The Great Church of Constantinople, 18 × 16: the square nave under its wide shallow dome on a ring of windows, half
 * domes before and behind it, the heavy buttress towers at the sides, small domes at the corners. No minarets in 1356.
 */
export function hagiaSophia(): Batch {
  const b = new Batch(), wallC = rgb(0xe8b89a), pale = rgb(0xf2d2b6), body = 6.4, cube = 10.6;
  b.box(-9, -1, -8, 9, body, 8, wallC, { foot: 0.84, top: LEAD });
  b.box(-5.6, body, -5.6, 5.6, cube, 5.6, pale, { top: LEAD });
  for (const sd of SIDES) {
    const low = wallOf(-9, -8, 9, 8, sd), high = wallOf(-5.6, -5.6, 5.6, 5.6, sd);
    for (let y = 1.0; y < body - 0.4; y += 1.1) pane(b, low, 0, y, low.len, y + 0.14, shade(wallC, 0.88), 0.02);
    for (const t of spread(low, 8, 0.6)) { arch(b, low, t, 0.9, 0.42, 2.4, GLASS); arch(b, low, t, 3.6, 0.42, 5.2, GLASS); }
    // the great arch of each side of the nave, filled with rows of windows
    arch(b, high, 5.6, body + 0.2, 4.4, body + 0.3, shade(pale, 0.9), 0.03);
    for (const t of spread(high, 7, 1.6)) arch(b, high, t, body + 0.6, 0.3, body + 1.7, GLASS, 0.06);
    for (const t of spread(high, 5, 2.6)) arch(b, high, t, body + 2.3, 0.3, body + 3.2, GLASS, 0.06);
  }
  // buttress towers at the sides, half domes at the ends
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * 7.6 - 1.3, body, sz * 3.4 - 1.3, sx * 7.6 + 1.3, cube - 0.6, sz * 3.4 + 1.3, wallC, { top: LEAD });
  for (const sz of [-1, 1]) { dome(b, 0, body, sz * 5.9, 4.6, LEAD, 0.9, 14, 4); for (const sx of [-1, 1]) dome(b, sx * 6.6, body, sz * 5.6, 2.1, LEAD, 0.8, 10, 3); }
  drum(b, 0, cube, 0, 5.3, cube + 1.3, pale, 20, 0.94);
  for (let i = 0; i < 20; i++) { const a = ((i + 0.5) / 20) * Math.PI * 2, x = Math.cos(a) * 5.25, z = Math.sin(a) * 5.25; b.box(x - 0.24, cube + 0.25, z - 0.24, x + 0.24, cube + 1.1, z + 0.24, GLASS); }
  dome(b, 0, cube + 1.3, 0, 5.5, LEAD, 0.62, 20, 5);
  b.box(-0.1, cube + 4.6, -0.1, 0.1, cube + 6.2, 0.1, GOLD); b.box(-0.5, cube + 5.5, -0.1, 0.5, cube + 5.7, 0.1, GOLD, { bottom: true });
  // the narthex with the doors at the +z end
  b.box(-7, -1, 8, 7, 3.6, 10, shade(wallC, 0.97), { foot: 0.84, top: LEAD });
  for (const t of spread(wallOf(-7, 8, 7, 10, 'pz'), 5, 0.8)) arch(b, wallOf(-7, 8, 7, 10, 'pz'), t, 0, 0.6, 1.7, DOOR);
  return b;
}
