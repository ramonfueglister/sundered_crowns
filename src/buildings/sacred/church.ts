// Parish churches: the village church of the south with its square tower, and the church of the north with a spire.
import { Batch, type Rnd, rgb, shade } from '../../lookprobe/batch';
import { gableRoof, hipRoof } from '../core/roofs';
import { SIDES, arch, pane, spread, wallOf } from '../core/wall';
import { BRICK, COPPER, DOOR, MARBLE, OPENING, ROOFS, SLATE, STONE, WALLS, WINDOW } from '../palette';
import { NORTH } from '../traditions/house-styles';

/** A village church: nave along z with a gable roof, a square tower at its -z end. */
export function church(r: Rnd): Batch {
  const b = new Batch(), wallC = r.pick([MARBLE, WALLS[0], WALLS[6]]), roofC = r.pick(ROOFS), th = r.range(9.5, 12);
  b.box(-2.6, -1, -3, 2.6, 4.2, 5, wallC, { foot: 0.84 });
  gableRoof(b, -2.9, -3.3, 2.9, 5.3, 4.2, 2.2, roofC, wallC, 4);
  const front = wallOf(-2.6, -3, 2.6, 5, 'pz');
  arch(b, front, 2.6, 0, 0.6, 1.5, DOOR); arch(b, front, 2.6, 3.3, 0.45, 3.5, WINDOW);
  for (const s of ['px', 'nx'] as const) { const w = wallOf(-2.6, -3, 2.6, 5, s); for (const t of spread(w, 3, 0.6)) arch(b, w, t, 1.3, 0.32, 2.5, WINDOW); }
  b.box(-1.5, -1, -5.6, 1.5, th, -2.6, wallC, { foot: 0.86 });
  for (const s of SIDES) arch(b, wallOf(-1.5, -5.6, 1.5, -2.6, s), 1.5, th - 2.3, 0.42, th - 1.2, OPENING);
  b.box(-1.7, th, -5.8, 1.7, th + 0.25, -2.4, shade(roofC, 0.74));
  hipRoof(b, -1.7, -5.8, 1.7, -2.4, th + 0.25, 2.8, roofC);
  return b;
}

/** A parish church of the north: a brick or stone nave under a steep roof, a tower with a tall spire at its -z end. 6 × 11. */
export function spireChurch(r: Rnd): Batch {
  const b = new Batch(), wallC = r.pick([BRICK, rgb(0xc8684a), STONE, rgb(0xe6d8c4)]), roofC = r.pick(NORTH.roofs), th = r.range(8.5, 10.5), spire = r.chance(0.5) ? COPPER : SLATE;
  b.box(-2.6, -1, -3, 2.6, 4.6, 5, wallC, { foot: 0.84 });
  gableRoof(b, -2.9, -3.3, 2.9, 5.3, 4.6, 3.6, roofC, wallC, 5);
  const front = wallOf(-2.6, -3, 2.6, 5, 'pz');
  arch(b, front, 2.6, 0, 0.6, 1.4, DOOR); arch(b, front, 2.6, 2.6, 0.5, 5.2, WINDOW);
  for (const s of ['px', 'nx'] as const) { const w = wallOf(-2.6, -3, 2.6, 5, s); for (const t of spread(w, 4, 0.5)) arch(b, w, t, 1.1, 0.26, 3.5, WINDOW); }
  b.box(-1.6, -1, -5.8, 1.6, th, -2.6, wallC, { foot: 0.86 });
  for (const s of SIDES) { const w = wallOf(-1.6, -5.8, 1.6, -2.6, s); arch(b, w, 1.6, th - 2.4, 0.4, th - 1.0, OPENING); pane(b, w, 0, th - 0.3, w.len, th, shade(wallC, 1.1), 0.02); }
  hipRoof(b, -1.75, -5.95, 1.75, -2.45, th, r.range(6, 8), spire);
  return b;
}
