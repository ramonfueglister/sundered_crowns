// The timber frame (colombage) of a storey: posts at the corners and between the window axes, rails along the storey
// at its foot and head and under its windows, and a foot brace at each corner, laid flat on the plastered infill as
// panes. PROTOTYPE (20 Nov 2026): the members follow
// Ramon's reference picture of Paris of that day (stored in the project's haeuser/referenz); their sizes are drawing
// values, not measured ones.
import { type Batch, type RGB, shade } from '../../lookprobe/batch';
import { type Wall, on, pane } from '../core/wall';
import { VOXEL as V } from './style';

const LIFT = 0.055;

/**
 * The frame of one storey from y to y + h (blocks) on wall `w`, as the reference picture draws it: a sill beam and a
 * plate along the storey, a rail under its windows `sill` above y, posts at the corners and half-way between the window
 * axes `axes`, and a foot brace at each corner from the post down to the sill beam; every member `width` fine blocks
 * wide. The rails lie a little deeper than the posts and braces, so that a brace meeting one does not flicker with it.
 */
export function timberFrame(
  b: Batch,
  w: Wall,
  y: number,
  h: number,
  axes: readonly number[],
  sill: number,
  c: RGB,
  width = 0.9,
) {
  const post = V * width,
    side = shade(c, 0.9),
    deep = LIFT * 0.7,
    y0 = y + post,
    y1 = y + sill - post;
  pane(b, w, 0, y, w.len, y0, c, deep);
  pane(b, w, 0, y + h - post, w.len, y + h, c, deep);
  pane(b, w, 0, y1, w.len, y + sill, c, deep);
  const ts = [post / 2, w.len - post / 2];
  for (let i = 1; i < axes.length; i++) ts.push((axes[i - 1] + axes[i]) / 2);
  for (const t of ts) pane(b, w, t - post / 2, y, t + post / 2, y + h, c, LIFT);
  const reach = Math.min(y1 - y0, w.len / 2 - post * 1.5),
    d = post * 0.75;
  if (reach < post) return;
  for (const q of [1, -1]) {
    const a = q > 0 ? post : w.len - post,
      pts = [
        on(w, a, y1, LIFT),
        on(w, a, y1 - d, LIFT),
        on(w, a + q * (reach - d), y0, LIFT),
        on(w, a + q * reach, y0, LIFT),
      ];
    // the brace at the far corner runs the other way round: reverse it to keep its front towards the street
    if (q < 0) pts.reverse();
    b.quad(pts[0], pts[1], pts[2], pts[3], side, w.n);
  }
}

/**
 * The frame in a gable of `rise` above y on wall `w` (the gable end of a roof, its apex in the middle): a king post
 * up to the ridge, a collar beam across at a little under half the rise, a tie beam at its foot and two struts between them;
 * its members `width` fine blocks wide.
 */
export function gableFrame(b: Batch, w: Wall, y: number, rise: number, c: RGB, width = 0.7) {
  const post = V * width,
    mid = w.len / 2,
    yc = y + rise * 0.42,
    reach = mid * (1 - 0.42) - post;
  pane(b, w, mid - post / 2, y, mid + post / 2, y + rise - post, c, LIFT);
  pane(b, w, mid - reach, yc - post / 2, mid + reach, yc + post / 2, c, LIFT);
  pane(b, w, post, y, w.len - post, y + post, c, LIFT);
  // two struts from the tie beam up to the foot of the collar beside the king post, as an upturned V
  const side = shade(c, 0.9),
    foot = mid - reach * 0.9,
    d = post * 0.75;
  for (const q of [-1, 1]) {
    const pts = [
      on(w, mid + q * (mid - foot), y + post, LIFT),
      on(w, mid + q * (mid - foot - d), y + post, LIFT),
      on(w, mid + q * post * 0.5, yc - post / 2, LIFT),
      on(w, mid + q * (post * 0.5 + d), yc - post / 2, LIFT),
    ];
    // keep the strut's front towards the street whichever way it leans
    if (q > 0) pts.reverse();
    b.quad(pts[0], pts[1], pts[2], pts[3], side, w.n);
  }
}
