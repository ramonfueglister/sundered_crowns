// The view in motion, for view.ts: it closes on the width the wheel asked for, glides on after a drag, and flies to
// a place.
import { smooth } from '../lookprobe/batch';
import { NEAR, RIGHT } from '../lookprobe/layout';
import type { View } from './pieces';
import { NEAREST, elevationOf } from './zoom';

/** the view closes this share of the way to where the wheel sent it, and a glide loses this share of its speed, every millisecond */
const ZOOM_EASE = 1 / 90,
  GLIDE_EASE = 1 / 280;
/** below this many blocks a millisecond, as a share of the picture's width, the glide ends */
const GLIDE_END = 2e-5;
/** a flight to a place takes this many milliseconds, and rises on its way so that about half its way lies in the picture */
const FLIGHT = 1400,
  FLIGHT_SEES = 0.5;

/** the view's place: the place at the middle of the picture in the finest blocks, and how many of them lie across the picture */
export interface Place {
  x: number;
  z: number;
  wide: number;
}

/** what the motion needs of the view */
interface Moved {
  place: Place;
  /** a tool takes one picture: the view goes where it is sent at once */
  still: boolean;
  /** the widest view */
  farthest: number;
  /** the middle of the picture on the page */
  middle(): [number, number];
  /** the ground offset from the middle of the picture to a point of the page, in a view `across` finest blocks wide (default: the view's) */
  offset(px: number, py: number, across?: number): [number, number];
  /** shows the view as it is now, and tells the page where it is */
  look(): void;
  note(): void;
  /** moves the view by so many finest blocks to the right and towards the viewer */
  move(right: number, near: number): void;
  /** zooms so that the ground under a point of the page stays under it */
  zoom(to: number, px: number, py: number): void;
  /** the finest block of a place in degrees */
  blockOf(lon: number, lat: number): [number, number];
}

export interface Motion {
  /** the view a zoom or a flight under way will come to rest at: the pieces of that picture are built first (pieces.ts) */
  toward(): View['to'];
  /** Zooms by this factor about a point of the page (default: the middle of the picture). */
  zoomTo(factor: number, at?: [number, number]): void;
  /** Sets the view gliding so that it comes to rest this far on. */
  push(right: number, near: number): void;
  /** Flies to a place, to show `to` finest blocks across the picture there. */
  flyTo(lon: number, lat: number, to: number): void;
  /** Zooms to this width at once about a point of the page, as two fingers pinch. */
  pinch(to: number, px: number, py: number): void;
  /** Stops a glide and a flight: a pointer went down. */
  halt(): void;
  /** Lets the view glide on at this speed, in finest blocks a millisecond: a drag ended. */
  carry(right: number, near: number): void;
  /** Stops for good. */
  stop(): void;
}

export function createMotion(v: Moved): Motion {
  const { place, still, farthest } = v;
  let goal = place.wide,
    about = v.middle(),
    glide: [number, number] = [0, 0],
    last = -1,
    moving = false,
    gone = false;
  let flight: {
    x: number;
    z: number;
    wide: number;
    toX: number;
    toZ: number;
    toWide: number;
    rise: number;
    since: number;
  } | null = null;
  const step = (now: number) => {
    if (gone) return;
    // time is taken from the pictures alone: the first one of a motion only starts the clock
    const dt = last < 0 ? 0 : Math.min(50, now - last);
    last = now;
    if (flight) {
      flight.since += dt;
      const p = smooth(0, 1, flight.since / FLIGHT),
        f = flight;
      place.x = f.x + (f.toX - f.x) * p;
      place.z = f.z + (f.toZ - f.z) * p;
      place.wide = Math.min(farthest, f.wide * (f.toWide / f.wide) ** p * f.rise ** Math.sin(Math.PI * p));
      goal = place.wide;
      glide = [0, 0];
      if (p >= 1) flight = null;
      v.look();
      v.note();
    }
    const closing = Math.abs(Math.log(goal / place.wide)) > 1e-3,
      gliding = Math.hypot(...glide) > GLIDE_END * place.wide;
    if (closing) v.zoom(place.wide * (goal / place.wide) ** (1 - Math.exp(-dt * ZOOM_EASE)), ...about);
    else goal = place.wide;
    if (gliding) {
      v.move(glide[0] * dt, glide[1] * dt);
      const keep = Math.exp(-dt * GLIDE_EASE);
      glide = [glide[0] * keep, glide[1] * keep];
    } else glide = [0, 0];
    moving = closing || gliding || !!flight;
    if (moving) requestAnimationFrame(step);
    else last = -1;
  };
  const start = () => {
    if (!moving) {
      moving = true;
      requestAnimationFrame(step);
    }
  };
  return {
    toward() {
      if (flight) return { x: flight.toX, z: flight.toZ, wide: flight.toWide, elevation: elevationOf(flight.toWide) };
      if (Math.abs(Math.log(goal / place.wide)) <= 1e-3) return undefined;
      // the ground under the point the zoom is about stays under it
      const before = v.offset(...about),
        after = v.offset(...about, goal),
        right = before[0] - after[0],
        near = before[1] - after[1];
      return {
        x: place.x + right * RIGHT[0] + near * NEAR[0],
        z: place.z + right * RIGHT[1] + near * NEAR[1],
        wide: goal,
        elevation: elevationOf(goal),
      };
    },
    zoomTo(factor, at = v.middle()) {
      flight = null;
      goal = Math.min(farthest, Math.max(NEAREST, goal * factor));
      about = at;
      if (still) v.zoom(goal, ...at);
      else start();
    },
    push(right, near) {
      flight = null;
      if (still) v.move(right, near);
      else {
        glide = [glide[0] + right * GLIDE_EASE, glide[1] + near * GLIDE_EASE];
        start();
      }
    },
    flyTo(lon, lat, to) {
      const [toX, toZ] = v.blockOf(lon, lat),
        toWide = Math.min(farthest, Math.max(NEAREST, to));
      if (still) {
        place.x = toX;
        place.z = toZ;
        place.wide = goal = toWide;
        v.look();
        v.note();
        return;
      }
      flight = {
        x: place.x,
        z: place.z,
        wide: place.wide,
        toX,
        toZ,
        toWide,
        rise: Math.max(1, (Math.hypot(toX - place.x, toZ - place.z) * FLIGHT_SEES) / Math.max(place.wide, toWide)),
        since: 0,
      };
      start();
    },
    pinch(to, px, py) {
      goal = to;
      v.zoom(goal, px, py);
      goal = place.wide;
    },
    halt() {
      glide = [0, 0];
      flight = null;
    },
    carry(right, near) {
      glide = [right, near];
      start();
    },
    stop() {
      gone = true;
    },
  };
}
