// The world to travel through, on a canvas: the real world of 1356 in the look of the look probe, from a single town
// to half the globe. It is a diorama of blocks, built in pieces around the place the camera looks at (pieces.ts);
// farther out the same world is seen from farther away, with less and less detail and relief, until it lies flat
// and the realms and their names show on it (realms.ts, names.ts). zoom.ts holds the rules of the change. To the
// east and west the world goes round the globe without an end; in the north and south the picture stops at its edge.
// Drag moves the picture and lets it glide on, the wheel or two fingers zoom about the pointer, the arrow keys move,
// + and - zoom. A click on the ground is told to the page as the event `world-click` (see `click` below).
// The probe's own page (main.ts) and the game (ui/WorldView.tsx) both show the world through this.
import { smooth } from '../lookprobe/batch';
import { NEAR, RIGHT, SEA_Y } from '../lookprobe/layout';
import { bakedSky, createStage } from '../lookprobe/stage';
import { createNames } from './names';
// the face of the realms' names (names.ts), bundled: no requests to a font service
import '@fontsource/eb-garamond/latin-500.css';
import '@fontsource/eb-garamond/latin-ext-500.css';
import { type Layout, createPieces } from './pieces';
import { createRealms } from './realms';
import type { RealmsNow } from './realms.worker';
import { projectionOf } from './region';
import { blockOfCell, cellOfBlock } from './land';
import { FARTHEST, NEAREST, creasesOf, elevationOf, realmsOf, reliefOf } from './zoom';

/** the view closes this share of the way to where the wheel sent it, and a glide loses this share of its speed, every millisecond */
const ZOOM_EASE = 1 / 90, GLIDE_EASE = 1 / 280;
/** a press that is let go within this many pixels and milliseconds is a click, not a drag */
const CLICK_REACH = 4, CLICK_TIME = 400;
/** a drag hands its speed over the last so many milliseconds to the glide; below this many blocks a millisecond, as a share of the picture's width, the glide ends */
const GLIDE_WINDOW = 90, GLIDE_END = 2e-5;
/** a flight to a place takes this many milliseconds, and rises on its way so that about half its way lies in the picture */
const FLIGHT = 1400, FLIGHT_SEES = 0.5;

/** What a click on the ground hit: the point in finest world blocks (y: blocks above the stage's floor as the land was built), the step the view is drawn in, and the place in degrees. */
export interface WorldClick { x: number; y: number; z: number; step: number; lon: number; lat: number }

export interface WorldViewOptions {
  /** the canvas to draw on (default: the page's first, filling the window) */
  canvas?: HTMLCanvasElement;
  /** the cut of the world to show */
  region?: string;
  /** the place at the middle of the picture, in degrees, and the finest blocks across the picture */
  lon: number; lat: number; wide: number;
  /** a tool takes one picture: the view is shown as asked for, at once, with nothing built ahead */
  still?: boolean;
  /** where the realms' names are written (default: the page's body) */
  names?: HTMLElement;
  /** told what the view is waiting for or failed at (empty: nothing) */
  status?(text: string): void;
  /** told where the view is, whenever it has changed */
  moved?(lon: number, lat: number, wide: number): void;
  /** told of a click on the ground, with a way to ask which place of the game map lies there (-1: none) */
  clicked?(hit: WorldClick, place: () => Promise<number>): void;
}

export interface WorldView {
  /** Flies to a place, to show `wide` finest blocks across the picture there. */
  flyTo(lon: number, lat: number, wide: number): void;
  /** Colours the far map by these realms from now on, in place of those the game sets up. */
  setRealms(now: RealmsNow): void;
  /** Picks a place of the game map out on the far map (counted from 0; -1: none). */
  choose(place: number): void;
  /** Stops the view and lets go of all it holds. */
  dispose(): void;
}

export async function createWorldView(o: WorldViewOptions): Promise<WorldView> {
  const name = o.region ?? 'world', base = import.meta.env.BASE_URL, still = o.still ?? false;
  const stage = await createStage({ fixed: true, tall: 70, canvas: o.canvas }), canvas = stage.canvas;
  const projection = await projectionOf(name, base);
  // the view: the place at the middle of the picture in the finest blocks, and how many of them lie across the picture
  let [x, z] = blockOfCell(...projection.cellOf(o.lon, o.lat)), wide = Math.min(FARTHEST, Math.max(NEAREST, o.wide));
  const pieces = createPieces(stage, { region: name, base, bakedSky: bakedSky(), ahead: !still, changed: () => look() });
  const realms = createRealms(stage, { region: name, base, map: projection.map, cells: projection.cells, round: projection.round, rows: projection.rows, ahead: !still, changed: () => look() }), names = createNames(o.names);
  const middle = (): [number, number] => { const box = canvas.getBoundingClientRect(); return [box.left + box.width / 2, box.top + box.height / 2]; };

  /** how the stage is laid out for the view, as of the last look */
  let laid: Layout = { step: 0, coarse: 1, homeX: 0, homeZ: 0 };
  const look = () => {
    const elevation = elevationOf(wide), aspect = canvas.clientWidth / canvas.clientHeight, squash = Math.sin((elevation * Math.PI) / 180);
    // north and south of the world there is nothing: the picture stops at its edge (the map's rows run with the picture's)
    const [u, v] = cellOfBlock(x, z), half = Math.min(projection.rows, wide / aspect / squash) / 2, held = Math.min(projection.rows - half, Math.max(half, v));
    if (held !== v) [x, z] = blockOfCell(u, held);
    const view = { x, z, wide, aspect, pixels: canvas.clientWidth, elevation };
    const at = pieces.look(view), missing = at.missing + realms.look(view, at), failed = pieces.failed || realms.failed;
    stage.aim(x / at.coarse - at.homeX, z / at.coarse - at.homeZ, wide / at.coarse, elevation);
    stage.creases(creasesOf(wide)); laid = at;
    const box = canvas.getBoundingClientRect();
    names.show(realms.names, box, (u - realms.lap) / projection.cells, held / projection.cells, (box.width / wide) * projection.cells, squash, realmsOf(wide));
    stage.busy = missing > 0 && !failed;
    if (stage.busy) stage.probe.ready = false;
    o.status?.(failed || (still && missing ? `Lade ${missing} ${missing === 1 ? 'Stück' : 'Stücke'} der Welt …` : ''));
  };
  const note = () => { if (o.moved) { const [lon, lat] = projection.placeOf(...cellOfBlock(x, z)); o.moved(lon, lat, wide); } };

  /** ground offset from the middle of the picture to a point of the page, in finest blocks to the right and towards the viewer */
  const offset = (px: number, py: number): [number, number] => {
    const box = canvas.getBoundingClientRect(), perPixel = wide / box.width;
    return [(px - box.left - box.width / 2) * perPixel, ((py - box.top - box.height / 2) * perPixel) / Math.sin((elevationOf(wide) * Math.PI) / 180)];
  };
  const move = (right: number, near: number) => { x += right * RIGHT[0] + near * NEAR[0]; z += right * RIGHT[1] + near * NEAR[1]; look(); note(); };
  /** zooms so that the ground under a point of the page stays under it */
  const zoom = (to: number, px: number, py: number) => {
    const before = offset(px, py);
    wide = Math.min(FARTHEST, Math.max(NEAREST, to));
    const after = offset(px, py);
    move(before[0] - after[0], before[1] - after[1]);
  };

  // the view in motion: it closes on the width the wheel asked for, glides on after a drag, and flies to a place
  let goal = wide, about = middle(), glide: [number, number] = [0, 0], last = -1, moving = false, gone = false;
  let flight: { x: number; z: number; wide: number; toX: number; toZ: number; toWide: number; rise: number; since: number } | null = null;
  const step = (now: number) => {
    if (gone) return;
    // time is taken from the pictures alone: the first one of a motion only starts the clock
    const dt = last < 0 ? 0 : Math.min(50, now - last); last = now;
    if (flight) {
      flight.since += dt;
      const p = smooth(0, 1, flight.since / FLIGHT), f = flight;
      x = f.x + (f.toX - f.x) * p; z = f.z + (f.toZ - f.z) * p;
      wide = Math.min(FARTHEST, f.wide * (f.toWide / f.wide) ** p * f.rise ** Math.sin(Math.PI * p)); goal = wide; glide = [0, 0];
      if (p >= 1) flight = null;
      look(); note();
    }
    const closing = Math.abs(Math.log(goal / wide)) > 1e-3, gliding = Math.hypot(...glide) > GLIDE_END * wide;
    if (closing) zoom(wide * (goal / wide) ** (1 - Math.exp(-dt * ZOOM_EASE)), ...about); else goal = wide;
    if (gliding) { move(glide[0] * dt, glide[1] * dt); const keep = Math.exp(-dt * GLIDE_EASE); glide = [glide[0] * keep, glide[1] * keep]; } else glide = [0, 0];
    moving = closing || gliding || !!flight;
    if (moving) requestAnimationFrame(step); else last = -1;
  };
  const set = () => { if (!moving) { moving = true; requestAnimationFrame(step); } };
  const zoomTo = (factor: number, at = middle()) => {
    flight = null;
    goal = Math.min(FARTHEST, Math.max(NEAREST, goal * factor)); about = at;
    if (still) zoom(goal, ...at); else set();
  };
  /** sets the view gliding so that it comes to rest this far on */
  const push = (right: number, near: number) => { flight = null; if (still) move(right, near); else { glide = [glide[0] + right * GLIDE_EASE, glide[1] + near * GLIDE_EASE]; set(); } };
  const flyTo = (lon: number, lat: number, to: number) => {
    // the place on the lap round the globe nearest the view
    const [u, v] = projection.cellOf(lon, lat), [here] = cellOfBlock(x, z), lap = Number.isFinite(projection.round) ? Math.round((here - u) / projection.round) * projection.round : 0;
    const [toX, toZ] = blockOfCell(u + lap, v), toWide = Math.min(FARTHEST, Math.max(NEAREST, to));
    if (still) { x = toX; z = toZ; wide = goal = toWide; look(); note(); return; }
    flight = { x, z, wide, toX, toZ, toWide, rise: Math.max(1, (Math.hypot(toX - x, toZ - z) * FLIGHT_SEES) / Math.max(wide, toWide)), since: 0 };
    set();
  };

  /**
   * Tells the page that the ground was clicked: the event `world-click` on the window, whose detail holds the point in
   * finest world blocks (x, z; y in blocks above the stage's floor as the land was built, before the relief was
   * scaled), the step the view is drawn in and the place in degrees. Who wants to know what stands there listens for it.
   */
  const click = (px: number, py: number) => {
    const hit = stage.pick(px, py), tall = reliefOf(wide, laid.step);
    if (!hit) return;
    const wx = (hit[0] + laid.homeX) * laid.coarse, wz = (hit[2] + laid.homeZ) * laid.coarse, [u, v] = cellOfBlock(wx, wz), [lon, lat] = projection.placeOf(u, v);
    const detail: WorldClick = { x: wx, y: (hit[1] - SEA_Y * (1 - tall)) / tall, z: wz, step: laid.step, lon, lat };
    window.dispatchEvent(new CustomEvent('world-click', { detail }));
    o.clicked?.(detail, () => realms.placeAt(u, v));
  };
  // one pointer drags the ground along; two pinch it larger or smaller
  const held = new Map<number, { x: number; y: number }>(), trail: { t: number; right: number; near: number }[] = [];
  let pressed = { x: 0, y: 0, t: 0, alone: false };
  canvas.style.touchAction = 'none'; canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', (e) => { pressed = { x: e.clientX, y: e.clientY, t: performance.now(), alone: held.size === 0 }; held.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; glide = [0, 0]; flight = null; trail.length = 0; });
  canvas.addEventListener('pointermove', (e) => {
    const was = held.get(e.pointerId);
    if (!was) return;
    if (held.size === 2) {
      const other = [...held].find(([id]) => id !== e.pointerId)![1];
      goal = wide * (Math.hypot(was.x - other.x, was.y - other.y) / Math.max(1, Math.hypot(e.clientX - other.x, e.clientY - other.y)));
      zoom(goal, (e.clientX + other.x) / 2, (e.clientY + other.y) / 2); goal = wide;
    } else if (held.size === 1) {
      const a = offset(was.x, was.y), b = offset(e.clientX, e.clientY);
      move(a[0] - b[0], a[1] - b[1]);
      trail.push({ t: performance.now(), right: a[0] - b[0], near: a[1] - b[1] });
    }
    held.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  for (const up of ['pointerup', 'pointercancel'] as const) canvas.addEventListener(up, (e) => {
    held.delete(e.pointerId);
    if (held.size) { pressed.alone = false; return; }
    canvas.style.cursor = 'grab';
    if (up === 'pointerup' && pressed.alone && Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) <= CLICK_REACH && performance.now() - pressed.t <= CLICK_TIME) click(e.clientX, e.clientY);
    // the drag's speed over its last moments carries the view on
    const now = performance.now(), recent = trail.filter((p) => now - p.t <= GLIDE_WINDOW);
    if (!still && recent.length > 1) { glide = [recent.reduce((s, p) => s + p.right, 0) / GLIDE_WINDOW, recent.reduce((s, p) => s + p.near, 0) / GLIDE_WINDOW]; set(); }
  });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomTo(Math.exp((e.deltaMode ? e.deltaY * 30 : e.deltaY) * (e.ctrlKey ? 0.01 : 0.0015)), [e.clientX, e.clientY]); }, { passive: false });
  const key = (e: KeyboardEvent) => {
    // what is typed into a field of the page is not for the map
    if (e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) return;
    const by = wide * 0.12;
    if (e.key === 'ArrowLeft' || e.key === 'a') push(-by, 0); else if (e.key === 'ArrowRight' || e.key === 'd') push(by, 0);
    else if (e.key === 'ArrowUp' || e.key === 'w') push(0, -by * 1.5); else if (e.key === 'ArrowDown' || e.key === 's') push(0, by * 1.5);
    else if (e.key === '+' || e.key === '=') zoomTo(0.8); else if (e.key === '-') zoomTo(1.25);
  };
  window.addEventListener('keydown', key);
  // the canvas may change its size without the window doing so
  const sized = new ResizeObserver(() => { window.dispatchEvent(new Event('resize')); });
  if (o.canvas) sized.observe(canvas);
  window.addEventListener('resize', look);
  look();
  return {
    flyTo,
    setRealms(now) { realms.set(now); },
    choose(place) { realms.choose(place); },
    dispose() {
      gone = true;
      window.removeEventListener('keydown', key); window.removeEventListener('resize', look); sized.disconnect();
      pieces.dispose(); realms.dispose(); names.remove(); stage.dispose();
    },
  };
}
