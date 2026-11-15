// World probe: the real world of 1356 in the look of the look probe, to travel through. The world is built in pieces
// of PIECE × PIECE blocks around the place the camera looks at; pieces that leave the picture are dropped again.
// Drag moves the picture, the wheel zooms, the arrow keys move, + and - zoom.
// Address options, besides those of the stage (see ../lookprobe/stage.ts): ?lon=12.1&lat=45.85 (the place at the middle),
// ?wide=190 (blocks across the picture), ?region=europe (the cut of the world to show).
import type * as THREE from 'three/webgpu';
import { smooth } from '../lookprobe/batch';
import { N, NEAR, RIGHT, VIEW } from '../lookprobe/layout';
import { bakedSky, createStage, showError } from '../lookprobe/stage';
import type { PieceDone, PieceJob } from './piece.worker';
import { placeCell } from './region';
import { blockOfCell } from './world';

const q = new URLSearchParams(location.search), num = (k: string, fallback: number) => Number(q.get(k)) || fallback;
/** side of a piece in blocks; each is built on a ground of N blocks, so that it knows the land around it */
const PIECE = 200, MARGIN = (N - PIECE) / 2;
/** blocks across the picture: from a town filling it to a whole country */
const NEAREST = 90, FARTHEST = 600;
/** pieces kept on the stage, beyond those in the picture */
const SPARE = 10;
/** the camera looks down as in the reference when near, and more steeply from afar, where the picture is a map */
const elevationOf = (wide: number) => VIEW.elevation + (45 - VIEW.elevation) * smooth(220, FARTHEST, wide);

async function main() {
  const name = q.get('region') ?? 'europe', base = import.meta.env.BASE_URL, sky = bakedSky();
  const stage = await createStage({ fixed: true, tall: 70 }), status = document.querySelector<HTMLElement>('#status');
  // the place at the middle of the picture in world blocks; the stage counts from the piece it started in
  const [startX, startZ] = blockOfCell(...await placeCell(name, num('lon', 12.1), num('lat', 45.85), base));
  const homeX = Math.floor(startX / PIECE) * PIECE, homeZ = Math.floor(startZ / PIECE) * PIECE;
  let x = startX, z = startZ, wide = Math.min(FARTHEST, Math.max(NEAREST, num('wide', 190)));

  const shown = new Map<string, THREE.Group>(), asked = new Map<string, number>(), waiting: { key: string; px: number; pz: number }[] = [];
  const jobs = new Map<number, { key: string; worker: Worker }>(), idle: Worker[] = [];
  let nextId = 1, failed = '';
  const centreOf = (px: number, pz: number): [number, number] => [(px + 0.5) * PIECE, (pz + 0.5) * PIECE];
  /** how far a piece lies outside the picture, in blocks (0 inside) */
  const outside = (px: number, pz: number) => {
    const [cx, cz] = centreOf(px, pz), u = (cx - x) * RIGHT[0] + (cz - z) * RIGHT[1], v = (cx - x) * NEAR[0] + (cz - z) * NEAR[1];
    const deep = wide / (stage.canvas.clientWidth / stage.canvas.clientHeight) / Math.sin((elevationOf(wide) * Math.PI) / 180), reach = PIECE * 0.71 + 30;
    return Math.max(0, Math.abs(u) - wide / 2 - reach, Math.abs(v) - deep / 2 - reach);
  };
  const give = () => {
    // the piece nearest the middle of the picture first
    waiting.sort((a, b) => Math.hypot(...centreOf(b.px, b.pz).map((c, k) => c - [x, z][k])) - Math.hypot(...centreOf(a.px, a.pz).map((c, k) => c - [x, z][k])));
    while (idle.length && waiting.length) {
      const next = waiting.pop()!, worker = idle.pop()!, id = nextId++;
      if (outside(next.px, next.pz) > 0) { asked.delete(next.key); idle.push(worker); continue; }
      jobs.set(id, { key: next.key, worker }); asked.set(next.key, id);
      worker.postMessage({ id, piece: { ox: next.px * PIECE - MARGIN, oz: next.pz * PIECE - MARGIN, part: { x0: MARGIN, z0: MARGIN, x1: MARGIN + PIECE, z1: MARGIN + PIECE } }, region: name, base, bakedSky: sky } satisfies PieceJob);
    }
  };
  const look = () => {
    stage.aim(x - homeX, z - homeZ, wide, elevationOf(wide));
    const reach = Math.ceil((wide + FARTHEST) / PIECE) + 2, px0 = Math.floor(x / PIECE), pz0 = Math.floor(z / PIECE);
    let missing = 0;
    for (let pz = pz0 - reach; pz <= pz0 + reach; pz++) for (let px = px0 - reach; px <= px0 + reach; px++) {
      const key = `${px},${pz}`;
      if (outside(px, pz) > 0 || shown.has(key)) continue;
      missing++;
      if (!asked.has(key)) { asked.set(key, 0); waiting.push({ key, px, pz }); }
    }
    // pieces far outside the picture leave the stage, the farthest first
    const far = [...shown.keys()].map((key) => { const [px, pz] = key.split(',').map(Number); return { key, d: outside(px, pz) }; }).filter((p) => p.d > 0).sort((a, b) => b.d - a.d);
    for (const p of far.slice(0, Math.max(0, far.length - SPARE))) { stage.remove(shown.get(p.key)!); shown.delete(p.key); }
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
      else if (e.data.scene) {
        const [px, pz] = job.key.split(',').map(Number);
        shown.set(job.key, stage.add(e.data.scene, px * PIECE - MARGIN - homeX, pz * PIECE - MARGIN - homeZ));
        for (const [k2, v] of Object.entries(e.data.scene.counts)) stage.probe.counts[k2] = (stage.probe.counts[k2] ?? 0) + v;
      }
      look();
    };
    worker.onerror = (e) => { failed = e.message; look(); };
    idle.push(worker);
  }

  // moving the picture: a drag carries the ground with the pointer, the wheel zooms about the middle
  const canvas = stage.canvas, move = (right: number, near: number) => { x += right * RIGHT[0] + near * NEAR[0]; z += right * RIGHT[1] + near * NEAR[1]; look(); };
  const zoom = (factor: number) => { wide = Math.min(FARTHEST, Math.max(NEAREST, wide * factor)); look(); };
  const deepPerPixel = () => wide / canvas.clientWidth / Math.sin((elevationOf(wide) * Math.PI) / 180);
  let held: { x: number; y: number } | null = null;
  canvas.style.touchAction = 'none'; canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', (e) => { held = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
  canvas.addEventListener('pointermove', (e) => { if (!held) return; move(-(e.clientX - held.x) * (wide / canvas.clientWidth), -(e.clientY - held.y) * deepPerPixel()); held = { x: e.clientX, y: e.clientY }; });
  for (const up of ['pointerup', 'pointercancel'] as const) canvas.addEventListener(up, () => { held = null; canvas.style.cursor = 'grab'; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    const step = wide * 0.12;
    if (e.key === 'ArrowLeft' || e.key === 'a') move(-step, 0); else if (e.key === 'ArrowRight' || e.key === 'd') move(step, 0);
    else if (e.key === 'ArrowUp' || e.key === 'w') move(0, -step * 1.5); else if (e.key === 'ArrowDown' || e.key === 's') move(0, step * 1.5);
    else if (e.key === '+' || e.key === '=') zoom(0.8); else if (e.key === '-') zoom(1.25);
  });
  addEventListener('resize', look);
  look();
}
main().catch(showError);
