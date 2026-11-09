// Main-thread side of the simulation: a typed wrapper around the worker with reactive signals for the UI.
import { signal, batch } from '@preact/signals';
import type { ToWorker, FromWorker, TickView, NationLite, MapMode, Legend, Query, LandmarkLite } from './protocol';
import type { Command, CmdResult, Notice, ChronEntry } from '../sim/types';

export const view = signal<TickView | null>(null);
export const nations = signal<NationLite[]>([]);
/** Landmarks and their stages (refreshed monthly). */
export const landmarks = signal<LandmarkLite[]>([]);
export const notices = signal<(Notice & { seen?: boolean })[]>([]);
export const chronicle = signal<ChronEntry[]>([]);
export const legend = signal<Legend | null>(null);
export const workerError = signal<string | null>(null);
export const ready = signal(false);

type Listener = (v: TickView) => void;
type ColorListener = (mode: MapMode, rgba: Uint8Array) => void;

export class SimClient {
  private w: Worker;
  private seq = 1;
  private waits = new Map<number, (v: any) => void>();
  onTick: Listener[] = [];
  onColors: ColorListener[] = [];
  L = 0; S = 0;
  constructor() {
    this.w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.w.onmessage = (e: MessageEvent<FromWorker>) => this.handle(e.data);
    this.w.onerror = (e) => { workerError.value = String(e.message || e); };
  }
  private send(m: ToWorker, tr: Transferable[] = []) { this.w.postMessage(m, tr); }
  private handle(m: FromWorker) {
    switch (m.type) {
      case 'ready': this.L = m.L; this.S = m.S; batch(() => { nations.value = m.nations; ready.value = true; }); this.waits.get(0)?.(true); this.waits.delete(0); break;
      case 'tick': {
        const v = m.view;
        batch(() => {
          if (v.nations) nations.value = v.nations;
          if (v.landmarks) landmarks.value = v.landmarks;
          if (v.notices.length) notices.value = [...notices.value, ...v.notices].slice(-120);
          if (v.chronicle.length) chronicle.value = [...chronicle.value, ...v.chronicle].slice(-600);
          view.value = v;
        });
        for (const f of this.onTick) f(v);
        break;
      }
      case 'colors': legend.value = m.legend; for (const f of this.onColors) f(m.mode, m.rgba); break;
      case 'cmdResult': case 'reply': this.waits.get(m.id)?.(m.type === 'reply' ? m.data : m.res); this.waits.delete(m.id); break;
      case 'saved': this.waits.get(m.id)?.(m.data); this.waits.delete(m.id); break;
      case 'error': console.error(m.message); workerError.value = m.message; break;
    }
  }
  init(opts: { seed: number; year: number; player: number | null; save?: Uint8Array; devtools?: boolean; difficulty?: number; victory?: string[] }): Promise<boolean> {
    ready.value = false; notices.value = []; chronicle.value = [];
    return new Promise((res) => { this.waits.set(0, res); this.send({ type: 'init', ...opts }); });
  }
  cmd(cmd: Command): Promise<CmdResult> { const id = this.seq++; return new Promise((res) => { this.waits.set(id, res); this.send({ type: 'cmd', id, cmd }); }); }
  query<T = any>(q: Query): Promise<T> { const id = this.seq++; return new Promise((res) => { this.waits.set(id, res); this.send({ type: 'query', id, q }); }); }
  save(): Promise<Uint8Array> { const id = this.seq++; return new Promise((res) => { this.waits.set(id, res); this.send({ type: 'save', id }); }); }
  speed(v: number) { this.send({ type: 'speed', speed: v }); }
  /** Developer tools: simulate this many days at once. */
  skip(days: number) { this.send({ type: 'skip', days }); }
  setPlayer(p: number | null) { this.send({ type: 'player', player: p }); }
  mapMode(mode: MapMode, focus: number, palette: 'normal' | 'cvd' = 'normal') { this.send({ type: 'mapmode', mode, focus, palette }); }
  /** The good the prices, production and markets map modes show (-1: none, for the markets mode). */
  mapGood(good: number) { this.send({ type: 'mapgood', good }); }
}

let _client: SimClient | null = null;
/** Swap the active client (the online world client replaces the local worker before the map mounts). */
export function setClient(c: SimClient | null) { _client = c; }
export function sim(): SimClient { return (_client ||= new SimClient()); }
