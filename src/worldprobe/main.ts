// World probe: the real world of 1356 in the look of the look probe, to travel through, from a single town to the
// whole continent. The world is built in pieces of PIECE × PIECE blocks around the place the camera looks at; pieces
// that leave the picture are dropped again. From farther away the same world is built from a coarser step of the map,
// with blocks twice as wide at every step, so that the picture always holds about the same number of blocks.
// Drag moves the picture, the wheel or two fingers zoom about the pointer, the arrow keys move, + and - zoom.
// Address options, besides those of the stage (see ../lookprobe/stage.ts): ?lon=12.1&lat=45.85 (the place at the middle),
// ?wide=190 (finest blocks across the picture), ?region=world (the cut of the world to show). The address follows the view.
import type * as THREE from 'three/webgpu';
import { smooth } from '../lookprobe/batch';
import { N, NEAR, RIGHT, SEA_Y, VIEW } from '../lookprobe/layout';
import { bakedSky, createStage, showError } from '../lookprobe/stage';
import type { PieceDone, PieceJob } from './piece.worker';
import { projectionOf } from './region';
import { blockOfCell, cellOfBlock } from './world';

const q = new URLSearchParams(location.search);
/** a number of the address; the equator and the meridian of Greenwich are places too, so 0 counts */
const num = (k: string, fallback: number) => { const v = Number(q.get(k) || NaN); return Number.isFinite(v) ? v : fallback; };
/** side of a piece in blocks; each is built on a ground of N blocks, so that it knows the land around it */
const PIECE = 200, MARGIN = (N - PIECE) / 2;
/** finest blocks across the picture: from a town filling it to the whole map */
const NEAREST = 90, FARTHEST = 32000;
/** the coarsest step of the map, and the blocks across the picture from which a step takes over from the finer one */
const STEPS = 7, STEP_FROM = 150;
/** pieces kept on the stage, beyond those in the picture */
const SPARE = 10;
/** the camera looks down as in the reference from near, and ever more steeply from afar, where the land is read as a map */
const FAR_ELEVATION = 58;
const elevationOf = (wide: number) => VIEW.elevation + (FAR_ELEVATION - VIEW.elevation) * smooth(Math.log2(400), Math.log2(8000), Math.log2(wide));

interface Shown { group: THREE.Group; step: number; px: number; pz: number }

async function main() {
  const name = q.get('region') ?? 'world', base = import.meta.env.BASE_URL, sky = bakedSky();
  const stage = await createStage({ fixed: true, tall: 70 }), status = document.querySelector<HTMLElement>('#status'), canvas = stage.canvas;
  const projection = await projectionOf(name, base);
  // the view: the place at the middle of the picture in the finest blocks, and how many of them lie across the picture
  let [x, z] = blockOfCell(...projection.cellOf(num('lon', 12.1), num('lat', 45.85))), wide = Math.min(FARTHEST, Math.max(NEAREST, num('wide', 190)));
  // the step the view is drawn in; its blocks are `coarse` finest blocks wide, and the stage counts them from `home`
  let step = -1, coarse = 1, homeX = 0, homeZ = 0;

  const shown = new Map<string, Shown>(), asked = new Set<string>(), waiting: { key: string; step: number; px: number; pz: number }[] = [];
  const jobs = new Map<number, { key: string; step: number; px: number; pz: number }>(), idle: Worker[] = [];
  let nextId = 1, failed = '';
  const aspect = () => canvas.clientWidth / canvas.clientHeight;
  /** how far a piece of the current step lies outside the picture, in its blocks (0 inside) */
  const outside = (px: number, pz: number) => {
    const cx = (px + 0.5) * PIECE - x / coarse, cz = (pz + 0.5) * PIECE - z / coarse, u = cx * RIGHT[0] + cz * RIGHT[1], v = cx * NEAR[0] + cz * NEAR[1];
    const across = wide / coarse, deep = across / aspect() / Math.sin((elevationOf(wide) * Math.PI) / 180), reach = PIECE * 0.71 + 30;
    return Math.max(0, Math.abs(u) - across / 2 - reach, Math.abs(v) - deep / 2 - reach);
  };
  /** puts a piece where it belongs in the blocks of the current step; a piece of another step is scaled to fit */
  const place = (p: Shown) => {
    const f = 2 ** (p.step - step);
    p.group.scale.setScalar(f);
    p.group.position.set((p.px * PIECE - MARGIN) * f - homeX, SEA_Y * (1 - f), (p.pz * PIECE - MARGIN) * f - homeZ);
  };
  const give = () => {
    // the piece nearest the middle of the picture first
    const far = (p: { px: number; pz: number }) => Math.hypot((p.px + 0.5) * PIECE - x / coarse, (p.pz + 0.5) * PIECE - z / coarse);
    waiting.sort((a, b) => far(b) - far(a));
    while (idle.length && waiting.length) {
      const next = waiting.pop()!;
      if (next.step !== step || outside(next.px, next.pz) > 0) { asked.delete(next.key); continue; }
      const worker = idle.pop()!, id = nextId++;
      jobs.set(id, next);
      worker.postMessage({ id, step, piece: { ox: next.px * PIECE - MARGIN, oz: next.pz * PIECE - MARGIN, part: { x0: MARGIN, z0: MARGIN, x1: MARGIN + PIECE, z1: MARGIN + PIECE } }, region: name, base, bakedSky: sky } satisfies PieceJob);
    }
  };
  const look = () => {
    const now = Math.max(0, Math.min(STEPS, Math.floor(Math.log2(wide / STEP_FROM))));
    if (now !== step) {
      step = now; coarse = 2 ** step; homeX = Math.floor(x / coarse / PIECE) * PIECE; homeZ = Math.floor(z / coarse / PIECE) * PIECE;
      for (const p of shown.values()) place(p);
    }
    const across = wide / coarse;
    stage.aim(x / coarse - homeX, z / coarse - homeZ, across, elevationOf(wide));
    const reach = Math.ceil(across / PIECE) + 3, px0 = Math.floor(x / coarse / PIECE), pz0 = Math.floor(z / coarse / PIECE);
    let missing = 0;
    for (let pz = pz0 - reach; pz <= pz0 + reach; pz++) for (let px = px0 - reach; px <= px0 + reach; px++) {
      const key = `${step}:${px},${pz}`;
      if (outside(px, pz) > 0 || shown.has(key)) continue;
      missing++;
      if (!asked.has(key)) { asked.add(key); waiting.push({ key, step, px, pz }); }
    }
    // the pieces of another step stay until the picture is whole again; of this step's, those far outside the
    // picture leave the stage, the farthest first
    const drop = (key: string) => { stage.remove(shown.get(key)!.group); shown.delete(key); };
    if (!missing) for (const [key, p] of shown) if (p.step !== step) drop(key);
    const far = [...shown].filter(([, p]) => p.step === step).map(([key, p]) => ({ key, d: outside(p.px, p.pz) })).filter((p) => p.d > 0).sort((a, b) => b.d - a.d);
    for (const p of far.slice(0, Math.max(0, far.length - SPARE))) drop(p.key);
    stage.busy = missing > 0 && !failed;
    if (stage.busy) stage.probe.ready = false;
    if (status) status.textContent = failed || (missing ? `Lade ${missing} ${missing === 1 ? 'Stück' : 'Stücke'} der Welt …` : '');
    give();
  };
  for (let k = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)); k > 0; k--) {
    const worker = new Worker(new URL('./piece.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<PieceDone>) => {
      const job = jobs.get(e.data.id)!;
      jobs.delete(e.data.id); asked.delete(job.key); idle.push(worker);
      if (e.data.error) failed = e.data.error;
      // a piece of a step the view has left is not put on the stage
      else if (e.data.scene && job.step === step) {
        const p: Shown = { group: stage.add(e.data.scene), step: job.step, px: job.px, pz: job.pz };
        place(p); shown.set(job.key, p);
        for (const [k2, v] of Object.entries(e.data.scene.counts)) stage.probe.counts[k2] = (stage.probe.counts[k2] ?? 0) + v;
      }
      look();
    };
    worker.onerror = (e) => { failed = e.message; look(); };
    idle.push(worker);
  }

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
  const zoom = (factor: number, px = innerWidth / 2, py = innerHeight / 2) => {
    const before = offset(px, py);
    wide = Math.min(FARTHEST, Math.max(NEAREST, wide * factor));
    const after = offset(px, py);
    move(before[0] - after[0], before[1] - after[1]);
  };
  // one pointer drags the ground along; two pinch it larger or smaller
  const held = new Map<number, { x: number; y: number }>();
  canvas.style.touchAction = 'none'; canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', (e) => { held.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
  canvas.addEventListener('pointermove', (e) => {
    const was = held.get(e.pointerId);
    if (!was) return;
    if (held.size === 2) {
      const other = [...held].find(([id]) => id !== e.pointerId)![1];
      zoom(Math.hypot(was.x - other.x, was.y - other.y) / Math.max(1, Math.hypot(e.clientX - other.x, e.clientY - other.y)), (e.clientX + other.x) / 2, (e.clientY + other.y) / 2);
    } else if (held.size === 1) {
      const a = offset(was.x, was.y), b = offset(e.clientX, e.clientY);
      move(a[0] - b[0], a[1] - b[1]);
    }
    held.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  for (const up of ['pointerup', 'pointercancel'] as const) canvas.addEventListener(up, (e) => { held.delete(e.pointerId); if (!held.size) canvas.style.cursor = 'grab'; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(Math.exp((e.deltaMode ? e.deltaY * 30 : e.deltaY) * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY); }, { passive: false });
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    const by = wide * 0.12;
    if (e.key === 'ArrowLeft' || e.key === 'a') move(-by, 0); else if (e.key === 'ArrowRight' || e.key === 'd') move(by, 0);
    else if (e.key === 'ArrowUp' || e.key === 'w') move(0, -by * 1.5); else if (e.key === 'ArrowDown' || e.key === 's') move(0, by * 1.5);
    else if (e.key === '+' || e.key === '=') zoom(0.8); else if (e.key === '-') zoom(1.25);
  });
  window.addEventListener('resize', look);
  look();
}
main().catch(showError);
