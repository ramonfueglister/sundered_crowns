// The Piazza San Marco of the reference image: the domed basilica, the bell tower, the Doge's palace. They are drawn
// to the reference, not yet to the buildings' measured plans or their state in 1356 (the campanile's present spire
// dates from about 1513 and the palace's waterfront wing was begun in 1340, both from memory and still to be checked).
import { Batch, rgb, shade } from '../../lookprobe/batch';
import { battlements, drum, dome } from '../core/solids';
import { hipRoof } from '../core/roofs';
import { SIDES, arch, pane, spread, wallOf } from '../core/wall';
import { BRICK, COPPER, FRAME, GOLD, LEAD, MARBLE, OPENING, PINK, STONE } from '../palette';

/** The bell tower: brick shaft, white belfry with arches, brick band with a clock, green spire. 4 × 4, about 27 high. */
export function campanile(): Batch {
  const b = new Batch(), h = 2;
  b.box(-h - 0.2, -1, -h - 0.2, h + 0.2, 0.9, h + 0.2, STONE, { foot: 0.8 });
  b.box(-h, 0.9, -h, h, 13.2, h, BRICK, { foot: 0.88 });
  for (const s of SIDES) {
    const w = wallOf(-h, -h, h, h, s);
    for (const t of [0.5, 1.5, 2.5, 3.5]) pane(b, w, t - 0.16, 1.4, t + 0.16, 12.8, shade(BRICK, 1.22));
    for (const t of [1, 2, 3]) pane(b, w, t - 0.12, 1.8, t + 0.12, 12.4, shade(BRICK, 0.8));
  }
  b.box(-h - 0.3, 13.2, -h - 0.3, h + 0.3, 13.7, h + 0.3, MARBLE);
  b.box(-h - 0.05, 13.7, -h - 0.05, h + 0.05, 17.0, h + 0.05, MARBLE, { foot: 0.92 });
  for (const s of SIDES) {
    const w = wallOf(-h - 0.05, -h - 0.05, h + 0.05, h + 0.05, s);
    for (const t of spread(w, 4, 0.35)) arch(b, w, t, 14.1, 0.3, 15.9, OPENING);
  }
  b.box(-h - 0.35, 17.0, -h - 0.35, h + 0.35, 17.45, h + 0.35, MARBLE);
  b.box(-h + 0.1, 17.45, -h + 0.1, h - 0.1, 19.4, h - 0.1, BRICK, { foot: 0.92 });
  for (const s of SIDES) { const w = wallOf(-h + 0.1, -h + 0.1, h - 0.1, h - 0.1, s); pane(b, w, 1.35, 17.85, 2.45, 18.95, MARBLE); pane(b, w, 1.5, 18.0, 2.3, 18.8, rgb(0xb0463a), 0.06); }
  b.box(-h - 0.2, 19.4, -h - 0.2, h + 0.2, 19.8, h + 0.2, MARBLE);
  hipRoof(b, -h - 0.05, -h - 0.05, h + 0.05, h + 0.05, 19.8, 6.0, COPPER);
  b.box(-0.14, 25.6, -0.14, 0.14, 27.0, 0.14, GOLD);
  b.box(-0.4, 26.3, -0.1, 0.4, 26.55, 0.1, GOLD);
  return b;
}

/** The domed church, 13 × 11, main front with five gilded portals on +z; five lead domes on drums, each with a cross. */
export function basilica(): Batch {
  const b = new Batch(), x0 = -6.5, x1 = 6.5, z0 = -5.5, z1 = 5.5, top = 5.8, wall = rgb(0xf4dcb8);
  b.box(x0, -1, z0, x1, top, z1, wall, { foot: 0.84 });
  const front = wallOf(x0, z0, x1, z1, 'pz'), dark = rgb(0x4a3f3a), mosaic = rgb(0xe2a83c), glass = rgb(0x4c5462);
  for (const [k, t] of spread(front, 5, 0.3).entries()) {
    const big = k === 2 ? 1.2 : 1;
    arch(b, front, t, 0, 1.05 * big, 2.5 * big, mosaic, 0.03);
    arch(b, front, t, 0, 0.66 * big, 2.0 * big, dark, 0.06);
    // the upper row: a gilded round gable over each portal, standing above the roof line
    arch(b, front, t, top - 2.4, 0.8 * big, top - 0.9, k % 2 ? glass : mosaic, 0.06);
    arch(b, front, t, top, 1.15 * big, top + 0.4, MARBLE, 0);
  }
  for (const t of spread(front, 6, -0.9)) {
    b.box(x0 + t - 0.22, -1, z1, x0 + t + 0.22, top + 1.5, z1 + 0.3, MARBLE, { foot: 0.92 });
    hipRoof(b, x0 + t - 0.3, z1 - 0.06, x0 + t + 0.3, z1 + 0.36, top + 1.5, 0.7, GOLD);
  }
  for (const s of ['px', 'nx', 'nz'] as const) {
    const w = wallOf(x0, z0, x1, z1, s);
    for (const t of spread(w, 5, 0.4)) { arch(b, w, t, 0.4, 0.75, 2.6, mosaic, 0.03); arch(b, w, t, 0.4, 0.5, 2.3, glass, 0.05); arch(b, w, t, 3.5, 0.42, 4.8, glass); }
  }
  b.box(x0 - 0.2, top, z0 - 0.2, x1 + 0.2, top + 0.3, z1 - 0.5, STONE);
  const domeAt = (cx: number, cz: number, rad: number, lift: number) => {
    const foot = top + 0.3 + lift;
    drum(b, cx, top + 0.3, cz, rad * 0.94, foot, MARBLE, 12, 0.9);
    for (let i = 0; i < 12; i += 2) { const am = ((i + 0.5) / 12) * Math.PI * 2; b.box(cx + Math.cos(am) * rad * 0.9 - 0.16, foot - lift * 0.75, cz + Math.sin(am) * rad * 0.9 - 0.16, cx + Math.cos(am) * rad * 0.9 + 0.16, foot - lift * 0.2, cz + Math.sin(am) * rad * 0.9 + 0.16, glass); }
    dome(b, cx, foot, cz, rad, LEAD, 1.2);
    const tip = foot + rad * 1.18;
    drum(b, cx, tip - 0.1, cz, 0.24, tip + 0.6, MARBLE, 6);
    b.box(cx - 0.09, tip + 0.6, cz - 0.09, cx + 0.09, tip + 1.9, cz + 0.09, MARBLE);
    b.box(cx - 0.09, tip + 1.3, cz - 0.4, cx + 0.09, tip + 1.5, cz + 0.4, MARBLE, { bottom: true });
  };
  domeAt(0, 0, 3.8, 3.2); domeAt(-4.3, 0, 2.3, 1.5); domeAt(4.3, 0, 2.3, 1.5); domeAt(0, -3.4, 2.3, 1.5); domeAt(0, 3.3, 2.3, 1.5);
  return b;
}

/**
 * The palace, 9 × 24 (the long front along z, facing +x), 9.4 high: an arcade of wide arches, a loggia of narrow ones, a
 * pink wall with a few tall windows, slim battlements, a court inside.
 */
export function palace(): Batch {
  const b = new Batch(), x0 = -4.5, x1 = 4.5, z0 = -12, z1 = 12, top = 9.4, dark = rgb(0x3e3c44), shadow = rgb(0x6c6870), wing = 3.0, roof = rgb(0xb4b6c4);
  b.box(x0, -1, z0, x1, top, z0 + wing, PINK, { foot: 0.9, top: roof });
  b.box(x0, -1, z1 - wing, x1, top, z1, PINK, { foot: 0.9, top: roof });
  b.box(x0, -1, z0 + wing, x0 + wing, top, z1 - wing, PINK, { foot: 0.9, top: roof });
  b.box(x1 - wing, -1, z0 + wing, x1, top, z1 - wing, PINK, { foot: 0.9, top: roof });
  b.box(x0 + wing, -1, z0 + wing, x1 - wing, 0.05, z1 - wing, STONE);
  for (const s of SIDES) {
    const w = wallOf(x0, z0, x1, z1, s);
    pane(b, w, 0, 0, w.len, 5.2, MARBLE, 0.02);
    for (const t of spread(w, Math.round(w.len / 1.9), 0.15)) arch(b, w, t, 0, 0.76, 2.2, shadow, 0.05);
    pane(b, w, 0, 2.72, w.len, 2.98, shade(MARBLE, 0.86), 0.06);
    for (const t of spread(w, Math.round(w.len / 0.95), 0.12)) arch(b, w, t, 3.15, 0.24, 4.55, shadow, 0.05);
    pane(b, w, 0, 5.0, w.len, 5.26, shade(MARBLE, 0.86), 0.06);
    // the pink wall: a pattern of paler and deeper diamonds, pointed windows, a balcony in the middle of the long
    // fronts, a row of putlog holes under the battlements
    for (let k = 0; k < w.len / 1.2 - 0.5; k++) pane(b, w, k * 1.2 + 0.35, 5.6 + (k % 2) * 2.5, k * 1.2 + 0.85, 6.1 + (k % 2) * 2.5, shade(PINK, k % 3 ? 1.08 : 0.92), 0.02);
    for (const t of spread(w, Math.max(3, Math.round(w.len / 3)), 0.9)) { arch(b, w, t, 6.3, 0.5, 7.95, FRAME, 0.05); arch(b, w, t, 6.42, 0.36, 7.85, dark, 0.07); }
    if (w.len > 12) { pane(b, w, w.len / 2 - 1, 6.0, w.len / 2 + 1, 6.3, MARBLE, 0.25); arch(b, w, w.len / 2, 6.3, 0.8, 8.4, FRAME, 0.06); arch(b, w, w.len / 2, 6.3, 0.6, 8.25, dark, 0.08); }
    for (let t = 0.7; t < w.len - 0.4; t += 1.25) pane(b, w, t - 0.08, 8.55, t + 0.08, 8.71, shade(PINK, 0.62), 0.02);
    pane(b, w, 0, top - 0.25, w.len, top, MARBLE, 0.05);
  }
  battlements(b, x0, z0, x1, z1, top, MARBLE, 0.32, 0.9, 0.95);
  return b;
}
