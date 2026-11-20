// The pointer and the keys on the world, for view.ts: one pointer drags the ground along and lets it glide on, two
// pinch it larger or smaller, the wheel zooms about the pointer, the arrow keys move and + and - zoom. A press let go
// at once is a click; where the pointer rests over the ground the page is told (`world-hover`).
import type { Motion, Place } from './view_motion';

/** a press that is let go within this many pixels and milliseconds is a click, not a drag */
const CLICK_REACH = 4,
  CLICK_TIME = 400;
/** a drag hands its speed over the last so many milliseconds to the glide */
const GLIDE_WINDOW = 90;
/** the pointer resting over the ground is looked up at most this often, in milliseconds (a ray through the ground costs) */
const HOVER_EVERY = 90;

/** What a click on the ground hit: the point in finest world blocks (y: blocks above the stage's floor as the land was built), the step the view is drawn in, and the place in degrees. */
export interface WorldClick {
  x: number;
  y: number;
  z: number;
  step: number;
  lon: number;
  lat: number;
}
/** Where the pointer rests over the ground (`world-hover`): the point as a click's, and the pointer on the page. */
export interface WorldHover extends WorldClick {
  px: number;
  py: number;
}

/** what the pointer needs of the view */
interface Pointed {
  place: Readonly<Place>;
  /** a tool takes one picture: a drag does not glide on */
  still: boolean;
  motion: Motion;
  /** the step the view is drawn in */
  step(): number;
  /** the ground offset from the middle of the picture to a point of the page, in finest blocks to the right and towards the viewer */
  offset(px: number, py: number): [number, number];
  /** moves the view by so many finest blocks to the right and towards the viewer */
  move(right: number, near: number): void;
  /** what lies on the ground under a point of the page, if anything */
  groundAt(px: number, py: number): { at: WorldClick } | null;
  /** the ground was clicked at a point of the page */
  click(px: number, py: number): void;
}

interface Pointer {
  /** The view moved: where the pointer rests over the ground is looked up anew. */
  hover(): void;
  /** Tells the page that the pointer no longer rests over the ground. */
  hoverOff(): void;
  /** Stops listening to the keys. */
  dispose(): void;
}

/** Listens to the pointer on `canvas` and to the keys of the window. */
export function createPointer(canvas: HTMLCanvasElement, v: Pointed): Pointer {
  const { place, still, motion } = v;
  /**
   * Tells the page where the pointer rests over the ground: the event `world-hover` on the window, whose detail is
   * the point as a click's and the pointer on the page (WorldHover), or null when the pointer left the ground, a
   * button went down or the view is drawn coarser than its finest step (nothing small stands there to point at).
   * Looked up at most every HOVER_EVERY milliseconds, and anew when the view moves under a pointer at rest.
   */
  let pointer: { x: number; y: number } | null = null,
    hoverWait = 0,
    hovering = false;
  const hoverOff = () => {
    clearTimeout(hoverWait);
    hoverWait = 0;
    if (hovering) {
      hovering = false;
      window.dispatchEvent(new CustomEvent('world-hover', { detail: null }));
    }
  };
  const hover = () => {
    if (hoverWait || !pointer) return;
    hoverWait = window.setTimeout(() => {
      hoverWait = 0;
      const g = pointer && !held.size && v.step() === 0 ? v.groundAt(pointer.x, pointer.y) : null;
      if (!g) {
        hoverOff();
        return;
      }
      hovering = true;
      window.dispatchEvent(
        new CustomEvent('world-hover', { detail: { ...g.at, px: pointer!.x, py: pointer!.y } satisfies WorldHover }),
      );
    }, HOVER_EVERY);
  };
  // one pointer drags the ground along; two pinch it larger or smaller
  const held = new Map<number, { x: number; y: number }>(),
    trail: { t: number; right: number; near: number }[] = [];
  let pressed = { x: 0, y: 0, t: 0, alone: false };
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', (e) => {
    hoverOff();
    pressed = { x: e.clientX, y: e.clientY, t: performance.now(), alone: held.size === 0 };
    held.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
    motion.halt();
    trail.length = 0;
  });
  canvas.addEventListener('pointermove', (e) => {
    const was = held.get(e.pointerId);
    if (e.pointerType === 'mouse') pointer = { x: e.clientX, y: e.clientY };
    if (!was) {
      hover();
      return;
    }
    if (held.size === 2) {
      const other = [...held].find(([id]) => id !== e.pointerId)![1];
      motion.pinch(
        place.wide *
          (Math.hypot(was.x - other.x, was.y - other.y) /
            Math.max(1, Math.hypot(e.clientX - other.x, e.clientY - other.y))),
        (e.clientX + other.x) / 2,
        (e.clientY + other.y) / 2,
      );
    } else if (held.size === 1) {
      const a = v.offset(was.x, was.y),
        b = v.offset(e.clientX, e.clientY);
      v.move(a[0] - b[0], a[1] - b[1]);
      trail.push({ t: performance.now(), right: a[0] - b[0], near: a[1] - b[1] });
    }
    held.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  canvas.addEventListener('pointerleave', () => {
    pointer = null;
    hoverOff();
  });
  for (const up of ['pointerup', 'pointercancel'] as const)
    canvas.addEventListener(up, (e) => {
      held.delete(e.pointerId);
      if (held.size) {
        pressed.alone = false;
        return;
      }
      canvas.style.cursor = 'grab';
      if (
        up === 'pointerup' &&
        pressed.alone &&
        Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) <= CLICK_REACH &&
        performance.now() - pressed.t <= CLICK_TIME
      )
        v.click(e.clientX, e.clientY);
      // the drag's speed over its last moments carries the view on
      const now = performance.now(),
        recent = trail.filter((p) => now - p.t <= GLIDE_WINDOW);
      if (!still && recent.length > 1)
        motion.carry(
          recent.reduce((s, p) => s + p.right, 0) / GLIDE_WINDOW,
          recent.reduce((s, p) => s + p.near, 0) / GLIDE_WINDOW,
        );
    });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      motion.zoomTo(Math.exp((e.deltaMode ? e.deltaY * 30 : e.deltaY) * (e.ctrlKey ? 0.01 : 0.0015)), [
        e.clientX,
        e.clientY,
      ]);
    },
    { passive: false },
  );
  const key = (e: KeyboardEvent) => {
    // what is typed into a field of the page is not for the map
    if (
      e.target instanceof HTMLElement &&
      (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
    )
      return;
    const by = place.wide * 0.12;
    if (e.key === 'ArrowLeft' || e.key === 'a') motion.push(-by, 0);
    else if (e.key === 'ArrowRight' || e.key === 'd') motion.push(by, 0);
    else if (e.key === 'ArrowUp' || e.key === 'w') motion.push(0, -by * 1.5);
    else if (e.key === 'ArrowDown' || e.key === 's') motion.push(0, by * 1.5);
    else if (e.key === '+' || e.key === '=') motion.zoomTo(0.8);
    else if (e.key === '-') motion.zoomTo(1.25);
  };
  window.addEventListener('keydown', key);
  return {
    hover,
    hoverOff,
    dispose: () => window.removeEventListener('keydown', key),
  };
}
