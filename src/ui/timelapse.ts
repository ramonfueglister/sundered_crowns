// Timelapse (point 35): plays the yearly owner snapshots on the map, optionally recording the map canvas as a WebM
// video that the player can download.
import { signal } from '@preact/signals';
import { sim, view, nations } from '../game/client';
import { rendererRef } from './MapView';
import { showToast } from './store';
import { t } from './i18n';

export const timelapse = signal<{ i: number; n: number; year: number; recording: boolean } | null>(null);
let stop = false;

export function stopTimelapse() { stop = true; }

export async function playTimelapse(record = false) {
  if (timelapse.value) return;
  const frames: { day: number; owners: Uint16Array }[] = await sim().query({ q: 'timelapse' });
  const r = rendererRef.r; if (!r || !frames?.length) { showToast(t('timelapse_unavailable'), 'err'); return; }
  const v = view.value; const ns = nations.value;
  const cols = new Uint8Array(ns.length * 3); ns.forEach((n, k) => cols.set(n.color, k * 3));
  // recording: every year is rendered (map and names) into a canvas of its own, which is filmed
  let rec: MediaRecorder | null = null; const chunks: Blob[] = []; let lastData = 0;
  let film: HTMLCanvasElement | null = null, track: (MediaStreamTrack & { requestFrame?: () => void }) | null = null;
  if (record) {
    film = document.createElement('canvas') as HTMLCanvasElement & { captureStream?: (fps: number) => MediaStream };
    film.width = 1280; film.height = 720;
    const type = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'].find((x) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(x));
    const cs = (film as any).captureStream as ((fps: number) => MediaStream) | undefined;
    if (!cs || !type) { showToast(t('timelapse_no_video'), 'err'); return; }
    const stream = cs.call(film, 0); track = stream.getVideoTracks()[0] as any;
    rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 });
    rec.ondataavailable = (e) => { if (e.data.size) { chunks.push(e.data); lastData = performance.now(); } };
    rec.start(500);
  }
  // the film runs at 10 frames a second: each frame copies the map and its names as they are on screen
  let ticker: ReturnType<typeof setInterval> | null = null, year = 0, filmed = 0;
  if (film) {
    const g = film.getContext('2d')!;
    const compose = () => {
      const map = r.element, names = r.overlayElement;
      const k = Math.max(film!.width / map.width, film!.height / map.height);
      const w = map.width * k, h = map.height * k, x = (film!.width - w) / 2, y = (film!.height - h) / 2;
      g.fillStyle = '#1c1812'; g.fillRect(0, 0, film!.width, film!.height);
      g.drawImage(map, x, y, w, h);
      if (names) g.drawImage(names, x, y, w, h);
      if (year) {
        g.fillStyle = 'rgba(30, 22, 12, 0.72)'; g.fillRect(24, 24, 150, 58);
        g.fillStyle = '#f3e6c4'; g.font = '600 40px Georgia, serif'; g.textBaseline = 'middle'; g.fillText(String(year), 40, 54);
      }
      track?.requestFrame?.(); filmed++;
    };
    // drawn right after the map's own frame, while its picture is still current
    ticker = setInterval(() => requestAnimationFrame(compose), 100);
  }
  stop = false;
  const startYear = v?.startYear ?? 1356;
  await new Promise<void>((done) => {
    let i = 0;
    const step = () => {
      if (stop || i >= frames.length) {
        if (!rec || stop) { done(); return; }
        // a video holds the last year a moment: at least 15 more frames (slow machines draw fewer per second)
        // and until the encoder has handed over data written after the last year (it can lag behind on a busy machine)
        const until = filmed + 15, t0 = performance.now();
        const hold = () => ((filmed >= until && lastData > t0) || performance.now() - t0 > 30_000 ? done() : setTimeout(hold, 100));
        hold(); return;
      }
      const o = new Int16Array(frames[i].owners.length); for (let k = 0; k < o.length; k++) o[k] = frames[i].owners[k] - 1;
      r.setPolitical(o, o, cols);
      year = startYear + Math.round(frames[i].day / 365.25);
      timelapse.value = { i, n: frames.length, year, recording: !!rec };
      i++;
      const shown = filmed;
      const next = () => (!rec || filmed >= shown + 2 ? step() : setTimeout(next, 50));
      setTimeout(next, 250);
    };
    step();
  });
  // back to the present
  const now = view.value ?? v;
  if (now?.owner && now.ctrl) r.setPolitical(now.owner, now.ctrl, cols);
  timelapse.value = null;
  if (ticker) clearInterval(ticker);
  if (rec) {
    await new Promise<void>((done) => { rec!.onstop = () => done(); rec!.stop(); });
    const blob = new Blob(chunks, { type: 'video/webm' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `sundered-crowns-${startYear}-${timelapseEndYear(frames, startYear)}.webm`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    showToast(t('timelapse_saved'));
  }
}
const timelapseEndYear = (f: { day: number }[], y0: number) => y0 + Math.round((f[f.length - 1]?.day ?? 0) / 365.25);
