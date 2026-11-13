// Main-thread side of the simulation: a typed wrapper around the worker with reactive signals for the UI.
import { signal, batch } from '@preact/signals';
import type { ToWorker, FromWorker, TickView, NationLite, MapMode, Legend, Query, LandmarkLite } from './protocol';
import type { Command, CmdResult, Notice, ChronEntry } from '../sim/types';
import { chronInvolves } from '../sim/ctx';

export const view = signal<TickView | null>(null);
export const nations = signal<NationLite[]>([]);
/** Landmarks and their stages (refreshed monthly). */
export const landmarks = signal<LandmarkLite[]>([]);
export const notices = signal<(Notice & { seen?: boolean })[]>([]);
/** The latest entries of the whole chronicle (world-wide, the last CHRON_WORLD). */
export const chronicle = signal<ChronEntry[]>([]);
/** Every entry that concerns the player's realm (sim/ctx.ts chronInvolves), kept apart from the world-wide cap: a busy
 *  world must not push the player's own history out of the chronicle panel. */
export const ownChronicle = signal<ChronEntry[]>([]);
const CHRON_WORLD = 600, CHRON_OWN = 6000;
let chronPlayer = -2;
/** Adds new chronicle entries (from a tick) for the player's realm `player`. */
export function addChronicle(list: ChronEntry[], player: number) {
  if (!list.length) return;
  chronicle.value = [...chronicle.value, ...list].slice(-CHRON_WORLD);
  const own = player >= 0 ? list.filter((e) => chronInvolves(e, player)) : [];
  if (own.length) ownChronicle.value = [...ownChronicle.value, ...own].slice(-CHRON_OWN);
}
/** Replaces both lists with a whole chronicle (a loaded game, another realm taken over). */
export function setChronicle(all: ChronEntry[], player: number) {
  batch(() => {
    chronicle.value = all.slice(-CHRON_WORLD);
    ownChronicle.value = player >= 0 ? all.filter((e) => chronInvolves(e, player)).slice(-CHRON_OWN) : [];
  });
}
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
        const pid = v.player?.id ?? -1;
        batch(() => {
          if (v.nations) nations.value = v.nations;
          if (v.landmarks) landmarks.value = v.landmarks;
          if (v.notices.length) notices.value = [...notices.value, ...v.notices].slice(-120);
          addChronicle(v.chronicle, pid);
          view.value = v;
        });
        // a game just started or loaded, or another realm taken: fetch the whole chronicle once (the worker answers in
        // order, so the answer holds every entry of the ticks before it, and later ticks bring only newer ones)
        if (pid !== chronPlayer) { chronPlayer = pid; this.query<ChronEntry[]>({ q: 'chronicle', from: 0 }).then((all) => { if (chronPlayer === pid && Array.isArray(all)) setChronicle(all, pid); }); }
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
    ready.value = false; notices.value = []; chronicle.value = []; ownChronicle.value = []; chronPlayer = -2;
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
