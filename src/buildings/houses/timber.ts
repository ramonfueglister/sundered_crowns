// The timber frame (colombage) of a storey: dark posts at the corners and between the window axes, a sill and a head
// rail along the storey, and a brace from each post towards its neighbour in the bays without a window, laid flat on
// the plastered infill as panes. PROTOTYPE (20 Nov 2026): the members follow Ramon's reference picture of Paris of
// that day (stored in the project's haeuser/referenz); their sizes are drawing values, not measured ones.
import { type Batch, type RGB, shade } from '../../lookprobe/batch';
import { type Wall, on, pane } from '../core/wall';
import { VOXEL as V } from './style';

const LIFT = 0.055;

/** The frame of one storey from y to y + h (blocks) on wall `w`, posts beside the window axes `axes` of `ww` fine blocks. */
export function timberFrame(b: Batch, w: Wall, y: number, h: number, axes: readonly number[], ww: number, c: RGB) {
  const post = V * 0.7,
    half = (ww * V) / 2 + V * 0.6,
    side = shade(c, 0.9);
  // the rails: a sill under the storey and a head under the next floor
  pane(b, w, 0, y, w.len, y + post, c, LIFT);
  pane(b, w, 0, y + h - post, w.len, y + h, c, LIFT);
  // posts at both corners, at both sides of every window, and half-way between two windows
  const ts = [post / 2, w.len - post / 2];
  axes.forEach((t, i) => {
    ts.push(t - half, t + half);
    if (i > 0) ts.push((axes[i - 1] + t) / 2);
  });
  for (const t of ts) pane(b, w, t - post / 2, y, t + post / 2, y + h, c, LIFT);
  // a brace in every bay between two posts that holds no window, from the foot of one post to the head of the next
  const sorted = [...new Set(ts.map((t) => Math.round(t * 1000) / 1000))].sort((a, b2) => a - b2);
  for (let i = 0; i + 1 < sorted.length; i++) {
    const t0 = sorted[i] + post / 2,
      t1 = sorted[i + 1] - post / 2;
    if (t1 - t0 < V * 1.2 || axes.some((t) => t > t0 && t < t1)) continue;
    // a middle rail across the bay, at the height of the window sills
    pane(b, w, t0, y + h * 0.42 - post / 2, t1, y + h * 0.42 + post / 2, c, LIFT);
    const up = i % 2 === 0,
      a = up ? t0 : t1,
      e = up ? t1 : t0,
      d = post * 0.75;
    const pts = [
      on(w, a, y + post, LIFT),
      on(w, a + (up ? d : -d), y + post, LIFT),
      on(w, e, y + h - post - d, LIFT),
      on(w, e, y + h - post, LIFT),
    ];
    // a brace that falls to the right runs the other way round: reverse it to keep its front towards the street
    if (!up) pts.reverse();
    b.quad(pts[0], pts[1], pts[2], pts[3], side, w.n);
  }
}

/**
 * The frame in a gable of `rise` above y on wall `w` (the gable end of a roof, its apex in the middle): a king post
 * up to the ridge, a collar beam across at a little under half the rise, and two struts from the collar to the post.
 */
export function gableFrame(b: Batch, w: Wall, y: number, rise: number, c: RGB) {
  const post = V * 0.7,
    mid = w.len / 2,
    yc = y + rise * 0.42,
    reach = mid * (1 - 0.42) - post;
  pane(b, w, mid - post / 2, y, mid + post / 2, y + rise - post, c, LIFT);
  pane(b, w, mid - reach, yc - post / 2, mid + reach, yc + post / 2, c, LIFT);
  pane(b, w, post, y, w.len - post, y + post, c, LIFT);
}
