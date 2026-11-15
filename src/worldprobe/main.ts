// World probe: the real world of 1356 in the look of the look probe, to travel through, from a single town to the
// whole map. Up close it is a diorama of blocks, built in pieces around the place the camera looks at (pieces.ts);
// farther out it sinks into the flat painted map that lies under it at every distance (paper.ts), on which the realms
// and their names show from the width of a country on (names.ts). zoom.ts holds the rules of the change.
// Drag moves the picture and lets it glide on, the wheel or two fingers zoom about the pointer, the arrow keys move,
// + and - zoom.
// Address options, besides those of the stage (see ../lookprobe/stage.ts): ?lon=12.1&lat=45.85 (the place at the middle),
// ?wide=190 (finest blocks across the picture), ?region=world (the cut of the world to show). The address follows the view.
import { NEAR, RIGHT } from '../lookprobe/layout';
import { bakedSky, createStage, showError } from '../lookprobe/stage';
import { createNames } from './names';
import { createPaper } from './paper';
import { createPieces } from './pieces';
import { projectionOf } from './region';
import { blockOfCell, cellOfBlock } from './land';
import { FARTHEST, NEAREST, creasesOf, elevationOf, realmsOf } from './zoom';

const q = new URLSearchParams(location.search);
/** a number of the address; the equator and the meridian of Greenwich are places too, so 0 counts */
const num = (k: string, fallback: number) => { const v = Number(q.get(k) || NaN); return Number.isFinite(v) ? v : fallback; };
/** the view closes this share of the way to where the wheel sent it, and a glide loses this share of its speed, every millisecond */
const ZOOM_EASE = 1 / 90, GLIDE_EASE = 1 / 280;
/** a drag hands its speed over the last so many milliseconds to the glide; below this many blocks a millisecond, as a share of the picture's width, the glide ends */
const GLIDE_WINDOW = 90, GLIDE_END = 2e-5;

async function main() {
  const name = q.get('region') ?? 'world', base = import.meta.env.BASE_URL;
  // a picture of fixed size is taken by a tool: it shows the view as asked for, at once
  const still = q.has('w');
  const stage = await createStage({ fixed: true, tall: 70 }), status = document.querySelector<HTMLElement>('#status'), canvas = stage.canvas;
  const projection = await projectionOf(name, base);
  // the view: the place at the middle of the picture in the finest blocks, and how many of them lie across the picture
  let [x, z] = blockOfCell(...projection.cellOf(num('lon', 12.1), num('lat', 45.85))), wide = Math.min(FARTHEST, Math.max(NEAREST, num('wide', 190)));
  const pieces = createPieces(stage, { region: name, base, bakedSky: bakedSky(), ahead: !still, changed: () => look() });
  const paper = createPaper(stage, { region: name, base, ahead: !still, changed: () => look() }), names = createNames();

  const look = () => {
    const elevation = elevationOf(wide), view = { x, z, wide, aspect: canvas.clientWidth / canvas.clientHeight, pixels: canvas.clientWidth, elevation };
    const at = pieces.look(view), missing = at.missing + paper.look(view, at), failed = pieces.failed || paper.failed;
    stage.aim(x / at.coarse - at.homeX, z / at.coarse - at.homeZ, wide / at.coarse, elevation);
    stage.creases(creasesOf(wide));
    const [u, v] = cellOfBlock(x, z), box = canvas.getBoundingClientRect();
    names.show(paper.names, box, u / projection.cells, v / projection.cells, (box.width / wide) * projection.cells, Math.sin((elevation * Math.PI) / 180), realmsOf(wide));
    stage.busy = missing > 0 && !failed;
    if (stage.busy) stage.probe.ready = false;
    if (status) status.textContent = failed || (still && missing ? `Lade ${missing} ${missing === 1 ? 'Stück' : 'Stücke'} der Welt …` : '');
  };

  // the address follows the view, a moment after it has come to rest
  let noted = 0;
  const note = () => {
    clearTimeout(noted);
    noted = window.setTimeout(() => {
      const [lon, lat] = projection.placeOf(...cellOfBlock(x, z)), to = new URLSearchParams(location.search);
      to.set('lon', lon.toFixed(3)); to.set('lat', lat.toFixed(3)); to.set('wide', String(Math.round(wide)));
      history.replaceState(null, '', `${location.pathname}?${to}`);
    }, 400);
  };
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

  // the view in motion: it closes on the width the wheel asked for, and glides on after a drag
  let goal = wide, about: [number, number] = [innerWidth / 2, innerHeight / 2], glide: [number, number] = [0, 0], last = 0, moving = false;
  const step = (now: number) => {
    const dt = Math.min(50, now - last); last = now;
    const closing = Math.abs(Math.log(goal / wide)) > 1e-3, gliding = Math.hypot(...glide) > GLIDE_END * wide;
    if (closing) zoom(wide * (goal / wide) ** (1 - Math.exp(-dt * ZOOM_EASE)), ...about); else goal = wide;
    if (gliding) { move(glide[0] * dt, glide[1] * dt); const keep = Math.exp(-dt * GLIDE_EASE); glide = [glide[0] * keep, glide[1] * keep]; } else glide = [0, 0];
    moving = closing || gliding;
    if (moving) requestAnimationFrame(step);
  };
  const set = () => { if (!moving) { moving = true; last = performance.now(); requestAnimationFrame(step); } };
  const zoomTo = (factor: number, px = innerWidth / 2, py = innerHeight / 2) => {
    goal = Math.min(FARTHEST, Math.max(NEAREST, goal * factor)); about = [px, py];
    if (still) zoom(goal, px, py); else set();
  };
  /** sets the view gliding so that it comes to rest this far on */
  const push = (right: number, near: number) => { if (still) move(right, near); else { glide = [glide[0] + right * GLIDE_EASE, glide[1] + near * GLIDE_EASE]; set(); } };

  // one pointer drags the ground along; two pinch it larger or smaller
  const held = new Map<number, { x: number; y: number }>(), trail: { t: number; right: number; near: number }[] = [];
  canvas.style.touchAction = 'none'; canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', (e) => { held.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; glide = [0, 0]; trail.length = 0; });
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
    if (held.size) return;
    canvas.style.cursor = 'grab';
    // the drag's speed over its last moments carries the view on
    const now = performance.now(), recent = trail.filter((p) => now - p.t <= GLIDE_WINDOW);
    if (!still && recent.length > 1) { glide = [recent.reduce((s, p) => s + p.right, 0) / GLIDE_WINDOW, recent.reduce((s, p) => s + p.near, 0) / GLIDE_WINDOW]; set(); }
  });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomTo(Math.exp((e.deltaMode ? e.deltaY * 30 : e.deltaY) * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY); }, { passive: false });
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    const by = wide * 0.12;
    if (e.key === 'ArrowLeft' || e.key === 'a') push(-by, 0); else if (e.key === 'ArrowRight' || e.key === 'd') push(by, 0);
    else if (e.key === 'ArrowUp' || e.key === 'w') push(0, -by * 1.5); else if (e.key === 'ArrowDown' || e.key === 's') push(0, by * 1.5);
    else if (e.key === '+' || e.key === '=') zoomTo(0.8); else if (e.key === '-') zoomTo(1.25);
  });
  window.addEventListener('resize', look);
  look();
}
main().catch(showError);
