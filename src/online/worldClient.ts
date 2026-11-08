// OnlineClient: talks to the world server and exposes the same surface and the same signals as SimClient
// (src/game/client.ts), so the existing UI works unchanged when the game runs in an online world.
// The server is authoritative: the client never simulates, it only renders TickViews and sends Commands.
import { signal, batch, computed } from '@preact/signals';
import { view, nations, notices, chronicle, legend, workerError, ready } from '../game/client';
import type { Command, CmdResult } from '../sim/types';
import type { MapMode, Query, TickView } from '../game/protocol';
import {
  PROTOCOL_VERSION, BIN_OWNERS, BIN_COLORS, BIN_SNOW, MAP_MODE_LIST, decodeBinary,
  type ClientMsg, type ServerMsg, type WorldInfo, type SeatInfo, type FreeNation, type ChatMsg, type PlayerOffer, type RosterEntry,
  type EarnedAchievement, type LeaderRow, type OfferAction, type AdminAction,
} from './protocol';

const ENV: Record<string, string | undefined> = ((import.meta as any).env ?? {}) as any;
export const DEFAULT_WORLD_URL = ENV.VITE_WORLD_URL || 'ws://localhost:8787';

// ---------------- online-only signals (the shared game signals live in src/game/client.ts) ----------------
export type ConnState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';
export const connState = signal<ConnState>('idle');
export const onlineError = signal<string | null>(null);
export const me = signal<{ id: string; name: string; admin: boolean } | null>(null);
export const worldInfo = signal<WorldInfo | null>(null);
export const seat = signal<SeatInfo | null>(null);
export const freeNations = signal<FreeNation[]>([]);
export const chat = signal<ChatMsg[]>([]);
export const offers = signal<PlayerOffer[]>([]);
export const roster = signal<RosterEntry[]>([]);
export const earned = signal<EarnedAchievement[]>([]);
export const freshAchievements = signal<string[]>([]);
export const leaderboard = signal<{ season: number; rows: LeaderRow[]; final: boolean } | null>(null);
export const heraldMsg = signal<{ text: string; at: number } | null>(null);
export const queuedCmds = signal(0);
export const clockOffset = signal(0); // server time − local time (ms)
export const isOnline = computed(() => connState.value === 'open' || connState.value === 'reconnecting');
/** Milliseconds until the next in-game day on the world clock (null while paused or disconnected). */
export function msToNextDay(now = Date.now()): number | null {
  const w = worldInfo.value; if (!w || w.paused || !w.nextDayAt) return null;
  return Math.max(0, w.nextDayAt - (now + clockOffset.value));
}

type Listener = (v: TickView) => void;
type ColorListener = (mode: MapMode, rgba: Uint8Array) => void;
export interface OnlineAuth { token?: string | null; name?: string; getToken?: () => Promise<string | null> }

/** The public surface shared with SimClient (what the UI calls through sim()). */
export interface GameClient {
  onTick: Listener[]; onColors: ColorListener[]; L: number; S: number;
  init(opts?: any): Promise<boolean>;
  cmd(cmd: Command): Promise<CmdResult>;
  query<T = any>(q: Query): Promise<T>;
  save(): Promise<Uint8Array>;
  speed(v: number): void;
  setPlayer(p: number | null): void;
  mapMode(mode: MapMode, focus: number): void;
}

type WS = WebSocket;

export class OnlineClient implements GameClient {
  readonly online = true;
  onTick: Listener[] = []; onColors: ColorListener[] = [];
  L = 0; S = 0;
  private ws: WS | null = null;
  private seq = 1;
  private waits = new Map<number, (v: any) => void>();
  private cmdIds = new Set<number>();
  private owner: Int16Array | null = null; private ctrl: Int16Array | null = null; private snow: Float32Array | null = null;
  private ownersFresh = false;
  private readyWaiters: ((ok: boolean) => void)[] = [];
  private gotWelcome = false; private gotTick = false;
  private auth: OnlineAuth = {};
  private retry = 0; private stopRetry = false; private pingTimer: any = null;
  private lastMode: { mode: MapMode; focus: number } = { mode: 'political', focus: -1 };

  constructor(readonly url: string = DEFAULT_WORLD_URL, private WSImpl: { new (url: string): WS } = (globalThis as any).WebSocket) {
    if (!this.WSImpl) throw new Error('WebSocket is not available in this environment');
  }

  /** Opens the connection and authenticates (Supabase token or, on a DEV server, a display name). */
  connect(auth: OnlineAuth): Promise<void> {
    this.auth = auth; this.stopRetry = false; onlineError.value = null;
    return new Promise((res, rej) => this.open(res, rej));
  }
  private async open(res?: () => void, rej?: (e: Error) => void) {
    connState.value = this.retry ? 'reconnecting' : 'connecting';
    const token = this.auth.getToken ? await this.auth.getToken().catch(() => null) : this.auth.token ?? null;
    let ws: WS;
    try { ws = new this.WSImpl(this.url); } catch (e: any) { connState.value = 'closed'; onlineError.value = String(e?.message ?? e); rej?.(e); return; }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    let settled = false;
    ws.onopen = () => { this.send({ type: 'hello', v: PROTOCOL_VERSION, token: token ?? undefined, name: this.auth.name }); };
    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data === 'string') {
        let m: ServerMsg; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.type === 'welcome' && !settled) { settled = true; this.retry = 0; res?.(); }
        if (m.type === 'error' && (m.code === 'auth' || m.code === 'version' || m.code === 'sessions') && !settled) { settled = true; this.stopRetry = true; rej?.(new Error(m.message)); }
        this.handle(m);
      } else this.handleBinary(ev.data as ArrayBuffer);
    };
    ws.onclose = (ev: CloseEvent) => {
      clearInterval(this.pingTimer); this.pingTimer = null;
      if (this.ws !== ws) return;
      this.ws = null;
      // pending requests cannot be answered any more
      for (const [id, f] of this.waits) f(this.cmdIds.has(id) ? { ok: false, err: 'connection lost' } : null);
      this.waits.clear(); this.cmdIds.clear(); queuedCmds.value = 0;
      if (!settled) { settled = true; rej?.(new Error(ev.reason || 'could not reach the world server')); }
      if (this.stopRetry || ev.code === 4003 || ev.code === 4001 || ev.code === 4002) { connState.value = 'closed'; return; }
      connState.value = 'reconnecting';
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(5, this.retry++));
      setTimeout(() => { if (!this.stopRetry) this.open(); }, delay);
    };
    ws.onerror = () => { /* onclose follows */ };
    this.pingTimer = setInterval(() => this.send({ type: 'ping', t: Date.now() }), 20_000);
  }
  disconnect() {
    this.stopRetry = true; const ws = this.ws; this.ws = null;
    clearInterval(this.pingTimer); this.pingTimer = null;
    try { ws?.close(1000, 'bye'); } catch { /* ignore */ }
    connState.value = 'closed'; ready.value = false; this.gotWelcome = this.gotTick = false;
  }
  private send(m: ClientMsg) { const ws = this.ws; if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }

  private isReady() {
    // ready once the world state has arrived, and (with a seat) once the view is that of our own realm
    return this.gotWelcome && this.gotTick && (!seat.value || view.value?.player?.id === seat.value.nation);
  }
  private markReady() {
    if (!this.isReady()) return;
    ready.value = true;
    for (const f of this.readyWaiters.splice(0)) f(true);
  }
  private handle(m: ServerMsg) {
    switch (m.type) {
      case 'welcome':
        this.L = m.L; this.S = m.S; this.gotWelcome = true; this.gotTick = false;
        batch(() => { me.value = m.user; worldInfo.value = m.world; seat.value = m.seat; nations.value = m.nations; connState.value = 'open'; notices.value = []; chronicle.value = []; });
        if (this.lastMode.mode !== 'political') this.send({ type: 'mapmode', mode: this.lastMode.mode, focus: this.lastMode.focus });
        break;
      case 'world': worldInfo.value = m.world; break;
      case 'free': freeNations.value = m.nations; break;
      case 'seat': seat.value = m.seat; break;
      case 'tick': this.onTickMsg(m); break;
      case 'queued': queuedCmds.value = this.cmdIds.size; break;
      case 'cmdResult': { const f = this.waits.get(m.id); this.waits.delete(m.id); this.cmdIds.delete(m.id); queuedCmds.value = this.cmdIds.size; f?.(m.res); break; }
      case 'reply': { const f = this.waits.get(m.id); this.waits.delete(m.id); f?.(m.data); break; }
      case 'legend': legend.value = m.legend; break;
      case 'chat': chat.value = [...chat.value, ...m.msgs].slice(-200); break;
      case 'offers': offers.value = m.offers; break;
      case 'roster': roster.value = m.roster; break;
      case 'achievements': earned.value = m.earned; if (m.fresh.length) freshAchievements.value = [...freshAchievements.value, ...m.fresh]; break;
      case 'leaderboard': leaderboard.value = { season: m.season, rows: m.rows, final: m.final }; break;
      case 'season': leaderboard.value = { season: m.ended, rows: m.rows, final: true }; heraldMsg.value = { text: `Season ${m.ended} has ended. Season ${m.started} begins.`, at: Date.now() }; seat.value = null; break;
      case 'broadcast': heraldMsg.value = { text: m.text, at: m.at }; break;
      case 'pong': clockOffset.value = m.server - (m.t + Date.now()) / 2; break;
      case 'kicked': this.stopRetry = true; onlineError.value = m.reason; break;
      case 'error': {
        if (m.id !== undefined && this.waits.has(m.id)) { const f = this.waits.get(m.id)!; this.waits.delete(m.id); const wasCmd = this.cmdIds.delete(m.id); f(wasCmd ? { ok: false, err: m.message } : null); queuedCmds.value = this.cmdIds.size; }
        else onlineError.value = m.message;
        break;
      }
    }
  }
  private onTickMsg(m: Extract<ServerMsg, { type: 'tick' }>) {
    const d = m.ownerDelta;
    if (d && d.length && this.owner && this.ctrl) {
      const o = new Int16Array(this.owner), c = new Int16Array(this.ctrl); // new arrays: the map compares by reference
      for (let i = 0; i < d.length; i += 3) { o[d[i]] = d[i + 1]; c[d[i]] = d[i + 2]; }
      this.owner = o; this.ctrl = c; this.ownersFresh = true;
    }
    const v: TickView = { ...(m.view as TickView), owner: this.owner ?? undefined, ctrl: this.ctrl ?? undefined, snow: this.snow ?? undefined };
    this.snow = null; this.ownersFresh = false;
    batch(() => {
      if (v.nations) nations.value = v.nations;
      if (v.notices.length) notices.value = [...notices.value, ...v.notices].slice(-120);
      if (v.chronicle.length) chronicle.value = [...chronicle.value, ...v.chronicle].slice(-600);
      view.value = v;
      workerError.value = null;
    });
    for (const f of this.onTick) f(v);
    this.gotTick = true; this.markReady();
  }
  private handleBinary(buf: ArrayBuffer) {
    const { kind, extra, data } = decodeBinary(buf);
    if (kind === BIN_OWNERS) { const all = new Int16Array(data); const N = all.length / 2; this.owner = all.slice(0, N); this.ctrl = all.slice(N); this.ownersFresh = true; }
    else if (kind === BIN_SNOW) this.snow = new Float32Array(data);
    else if (kind === BIN_COLORS) { const rgba = new Uint8Array(data); const mode = MAP_MODE_LIST[extra] ?? 'political'; for (const f of this.onColors) f(mode, rgba); }
  }

  // ---------------- SimClient surface ----------------
  /** Resolves once the world state has arrived (call connect() first). Single-player options are ignored. */
  init(_opts?: any): Promise<boolean> {
    if (ready.value && this.isReady()) return Promise.resolve(true);
    return new Promise((res) => this.readyWaiters.push(res));
  }
  /** Commands are queued by the server and applied at the start of the next in-game day; resolves with the result then. */
  cmd(cmd: Command): Promise<CmdResult> {
    if (!this.ws) return Promise.resolve({ ok: false, err: 'not connected to the world' });
    const id = this.seq++; this.cmdIds.add(id); queuedCmds.value = this.cmdIds.size;
    return new Promise((res) => { this.waits.set(id, res); this.send({ type: 'cmd', id, cmd }); });
  }
  query<T = any>(q: Query): Promise<T> {
    if (!this.ws) return Promise.resolve(null as T);
    const id = this.seq++; return new Promise((res) => { this.waits.set(id, res); this.send({ type: 'query', id, q }); });
  }
  save(): Promise<Uint8Array> { return Promise.reject(new Error('Online worlds are saved by the world server.')); }
  speed(_v: number) { /* the world clock runs on the server */ }
  setPlayer(_p: number | null) { /* seats are taken with join() */ }
  mapMode(mode: MapMode, focus: number) { this.lastMode = { mode, focus }; this.send({ type: 'mapmode', mode, focus }); }

  // ---------------- online actions ----------------
  requestFree() { this.send({ type: 'free' }); }
  join(nation: number) { this.send({ type: 'join', nation }); }
  leave() { this.send({ type: 'leave' }); }
  say(text: string, to?: number) { this.send({ type: 'chat', text, to }); }
  offer(to: number, action: OfferAction, text?: string) { this.send({ type: 'offer', to, action, text }); }
  answerOffer(offer: number, accept: boolean) { this.send({ type: 'offer_answer', offer, accept }); }
  requestLeaderboard() { this.send({ type: 'leaderboard' }); }
  admin(action: AdminAction, extra: { uid?: string; nation?: number; text?: string; secondsPerDay?: number; cmd?: Command; release?: boolean } = {}) { this.send({ type: 'admin', action, ...extra }); }
}

let _online: OnlineClient | null = null;
export function onlineClient(url = DEFAULT_WORLD_URL): OnlineClient { if (!_online || _online.url !== url) _online = new OnlineClient(url); return _online; }
export function currentOnlineClient(): OnlineClient | null { return _online; }
