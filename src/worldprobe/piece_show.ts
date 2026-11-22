// How the pieces on the stage show, for pieces.ts: pieces that take the place of others dissolve in while those
// dissolve out, the next coarser step is laid into the picture as the view nears it, a piece that took the place of a
// coarser one settles from that step's shape to its own, a piece not shown yet is drawn once on none of the picture's
// dots so that its lists reach the graphics card first, and every piece is scaled and placed for the view's step.
import { SEA_Y } from '../lookprobe/layout';
import type { Stage } from '../lookprobe/stage';
import { CROWD_AT } from './crowd';
import type { Held } from './piece_arrival';
import { PIECE, type Spot, type View, outside } from './piece_sight';
import { keyOf } from './pyramid';
import { COARSEST, FARTHEST, NEAREST, reliefOf, stepOf } from './zoom';

/** pieces that take the place of others dissolve into the picture over this many milliseconds */
const DISSOLVE = 300;
/** the width at which each step gives way to the next coarser one */
const BORDER = Array.from({ length: COARSEST }, (_, s) => {
  let low = NEAREST,
    high = FARTHEST * 2;
  for (let k = 0; k < 60; k++) {
    const mid = Math.sqrt(low * high);
    if (stepOf(mid) > s) high = mid;
    else low = mid;
  }
  return high;
});
/**
 * The land of a far step glides to the shape of the next coarser step over the last stretch before their border,
 * from the border's width divided by this (glide.ts): so the border changes nothing on the land. A view at rest in
 * that stretch shows its one step, part of the way.
 */
const GLIDE = 1.6;
/** How far a piece of a step has glided to the shape of the coarser step in a view this wide, 0 … 1. */
export function glideOf(wide: number, step: number): number {
  if (step >= COARSEST) return 0;
  const t = Math.max(0, Math.min(1, 1 - Math.log(BORDER[step] / wide) / Math.log(GLIDE)));
  return t * t * (3 - 2 * t);
}
/** a piece that took the place of a coarser one comes from that step's shape to its own over this many milliseconds, once it has dissolved into the picture */
const SETTLE = 600;
/**
 * How far a piece has glided that took the place of a coarser one `since` milliseconds ago, when it was `by` short
 * of that step's shape: it begins as the coarser step has the land, stays so while it dissolves into the picture,
 * and then comes to `share`, which is what a view of its width asks for. Undefined once it is there.
 */
export function settleOf(share: number, by: number, since: number): number | undefined {
  const t = (since - DISSOLVE) / SETTLE;
  if (t >= 1) return undefined;
  const u = Math.max(0, t);
  return Math.min(1, share + by * (1 - u * u * (3 - 2 * u)));
}

/** what a look of the view has worked out, as the showing of the pieces needs it */
interface Look {
  v: View;
  /** the view a motion under way comes to rest at (`v` where there is none) */
  rest: View;
  step: number;
  /** the view's step has changed since the look before */
  stepped: boolean;
  /** the zoom has blended two far steps by the time their border is crossed: nothing dissolves there */
  seamless: boolean;
  /** the share of the picture's dots the next coarser step is laid into (zoom.ts `blendOf`), and its pieces there */
  blend: number;
  coarser: readonly Spot[];
  /** where the stage counts its blocks from, in its blocks */
  homeX: number;
  homeZ: number;
  /** the number of this look */
  looks: number;
}

interface Show {
  /**
   * Shows the pieces of `shown` (pyramid.ts `cover`) and lets the others go out; returns the pieces in the picture
   * and whether pictures must go on (something dissolves, settles or is drawn ahead).
   */
  show(look: Look, shown: ReadonlySet<Held>): { showing: Set<Held>; fading: boolean };
}

/**
 * The pieces of `held` on `stage`. `ahead`: the view moves (a tool that takes one picture shows the pieces at once);
 * `marginOf` gives the blocks of land around a piece of a step.
 */
export function createShow(
  stage: Stage,
  held: Map<string, Held>,
  ahead: boolean,
  marginOf: (step: number) => number,
): Show {
  /** when the shares of the pieces laid in were last set */
  let mixed = 0;
  /** a piece of another step is scaled to the stage's blocks; all sink towards the sea's level as the view widens */
  const place = (h: Held, l: Look) => {
    const f = 2 ** (h.step - l.step),
      tall = f * reliefOf(l.v.wide, h.step);
    h.group.scale.set(f, tall, f);
    h.group.position.set(
      (h.px * PIECE - marginOf(h.step)) * f - l.homeX,
      SEA_Y * (1 - tall),
      (h.pz * PIECE - marginOf(h.step)) * f - l.homeZ,
    );
  };
  /**
   * The next coarser step is laid into the picture as the view nears its border, piece by piece as they are there: a
   * piece's share follows the zoom, and where the piece comes late it closes on it over the time of a dissolve.
   * Across a border the picture stays as it is: what was laid in is now the view's own step, or the other way round.
   * Returns whether a share is still on its way.
   */
  const layIn = (l: Look, now: number) => {
    const lay = new Set(l.blend > 0 ? l.coarser.map((p) => held.get(p.key)) : []),
      by = ahead && !l.stepped && mixed ? Math.min(50, now - mixed) / DISSOLVE : 1;
    mixed = now;
    let fading = false;
    for (const h of held.values()) {
      const goal = lay.has(h) ? l.blend : 0;
      h.laid = l.stepped ? goal : goal > h.laid ? Math.min(goal, h.laid + by) : Math.max(goal, h.laid - by);
      fading ||= h.laid !== goal;
    }
    return fading;
  };
  /**
   * Pieces that take the place of others (they lie over each other in the pyramid) dissolve in while those dissolve
   * out; what only comes into the picture or leaves it does so at once. `shown`: the pieces to show.
   */
  const handOver = (l: Look, shown: ReadonlySet<Held>, now: number) => {
    const coming = [...shown].filter((h) => !h.on),
      going = [...held.values()].filter((h) => h.on && !shown.has(h));
    if (l.seamless) {
      for (const h of [...coming, ...going]) {
        h.on = shown.has(h);
        h.fade = undefined;
      }
      return;
    }
    for (const h of coming) {
      const stood = ahead ? going.filter((g) => over(h, g)) : [];
      h.on = true;
      h.fade = stood.length ? { since: now, rising: true } : undefined;
      // (where the view has just crossed the border the piece is at that step's shape as it is, and nothing is to settle)
      const short = h.glides && stood.some((g) => g.step > h.step) ? 1 - glideOf(l.v.wide, h.step) : 0;
      h.settle = short > 0.02 ? { since: now, by: short } : undefined;
      if (h.settle) stage.probe.counts['pieces settled'] = (stage.probe.counts['pieces settled'] ?? 0) + 1;
    }
    for (const h of going) {
      h.on = false;
      h.fade = ahead && coming.some((c) => over(h, c)) ? { since: now, rising: false } : undefined;
    }
  };
  /**
   * A piece that has not been shown yet is drawn once on none of the picture's dots, so that its lists are on the
   * graphics card before it shows: one piece to a picture, and only a piece that lies in the picture or in the one
   * the view will come to rest at (a piece around the picture waits until the view comes to it: sent at once, twice
   * the megabytes went to the card in a zoom and back, half of them never to be seen). It stays so until the stage
   * has drawn a picture: a look is not a picture, pieces arrive and the view moves between two pictures, and each
   * brings a look. (Where the look after hid the piece again, it was never drawn, and all the pieces of a step sent
   * their lists in the picture that first showed them: measured on a Mac, 26 to 78 lists and 100 to 170 ms in one
   * picture, wherever pieces came fast, as they do from disk.) Returns whether a piece is drawn so or waits for it.
   */
  const warmUp = (l: Look) => {
    let warming = false;
    for (const h of held.values())
      if (h.warm !== undefined && h.warm >= 0) {
        if (stage.pictures() > h.warm) {
          h.warm = undefined;
          stage.whole(h.group, false);
        } else warming = true;
      }
    for (const h of held.values()) {
      if (
        h.warm !== -1 ||
        h.on ||
        h.fade ||
        h.laid > 0 ||
        (outside(l.v, h.step, h.px, h.pz) > 0 && outside(l.rest, h.step, h.px, h.pz) > 0)
      )
        continue;
      if (warming) return true;
      // (drawn whether it lies in the picture or not: the picture the view comes to rest at may reach beyond this one)
      h.warm = stage.pictures();
      stage.whole(h.group, true);
      warming = true;
    }
    return warming;
  };
  /** the share of a piece's dots that the coarser piece over it, of the step after the view's `step`, has taken */
  const taken = (h: Held, step: number) => {
    const k = 2 ** (step + 1 - h.step);
    return h.step <= step ? (held.get(keyOf(step + 1, Math.floor(h.px / k), Math.floor(h.pz / k)))?.laid ?? 0) : 0;
  };
  /**
   * Draws a piece that shows on its share of the picture's dots, glided and placed for the view; returns whether it
   * is still dissolving or settling.
   */
  const draw = (h: Held, l: Look, now: number, share: number) => {
    h.seen = l.looks;
    let fading = !!h.fade;
    // (a piece glides by the view's width: one that stands in for finer ones has not begun, one that the coarser
    // step is taking the place of has arrived; and one that came late for a coarser one comes from that one's shape)
    const settled = h.settle && settleOf(glideOf(l.v.wide, h.step), h.settle.by, now - h.settle.since);
    if (settled === undefined) h.settle = undefined;
    else fading = true;
    stage.glide(h.group, settled ?? glideOf(l.v.wide, h.step));
    // the figures of the last step that draws them go one by one over the same stretch, so that its border takes none
    // away at once (the finest step's stay: the first far step draws them too, crowd.ts)
    stage.thin(h.group, h.step >= CROWD_AT ? glideOf(l.v.wide, h.step) : 0);
    h.dots = [h.fade && !h.fade.rising ? share : 0, h.fade?.rising ? share : 1];
    // a piece laid in takes the first of the dots, as many as its share, and the view's own pieces under it the
    // rest (a piece that stands in for missing finer ones keeps all of its dots)
    const under = taken(h, l.step);
    // while the finer pieces dissolve into a piece that stood in for them, they take the last of the dots and leave it the first
    if (h.laid > 0 && !h.on) h.dots = [0, h.fade ? 1 - (1 - h.laid) * share : h.laid];
    else if (under > 0)
      h.dots = h.fade?.rising
        ? [1 - (1 - under) * share, 1]
        : [under + (1 - under) * h.dots[0], under + (1 - under) * h.dots[1]];
    stage.dissolve(h.group, ...h.dots);
    place(h, l);
    return fading;
  };
  return {
    show(l, shown) {
      const now = performance.now();
      let fading = layIn(l, now);
      handOver(l, shown, now);
      // (the pictures go on while pieces are drawn so, or wait for it)
      const warming = warmUp(l);
      const showing = new Set<Held>();
      for (const h of held.values()) {
        const share = h.fade ? Math.min(1, (now - h.fade.since) / DISSOLVE) : 1;
        if (share >= 1) h.fade = undefined;
        const shows = h.on || !!h.fade || h.laid > 0;
        if (shows && h.warm !== undefined) {
          h.warm = undefined;
          stage.whole(h.group, false);
        }
        h.group.visible = shows || (h.warm ?? -1) >= 0;
        if (!h.group.visible) continue;
        if (shows) {
          showing.add(h);
          fading = draw(h, l, now, share) || fading;
        } else {
          // drawn on none of the picture's dots, where it will lie
          stage.dissolve(h.group, 0, 0);
          place(h, l);
        }
      }
      return { showing, fading: fading || warming };
    },
  };
}

/** Whether pieces `a` and `b` lie over each other in the pyramid. */
function over(a: Held, b: Held): boolean {
  const [fine, wide] = a.step <= b.step ? [a, b] : [b, a],
    k = 2 ** (wide.step - fine.step);
  return Math.floor(fine.px / k) === wide.px && Math.floor(fine.pz / k) === wide.pz;
}
