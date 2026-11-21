// The browser's connection to the world server. Holds what the server last told us as signals for the interface.
import { signal } from '@preact/signals';
import {
  PROTOCOL_VERSION,
  SPEEDS,
  BIN_OWNERS,
  decodeBinary,
  type ClientMsg,
  type ServerMsg,
  type WorldInfo,
  type RealmInfo,
  type Me,
  type PlaceDetail,
  type TalkLine,
} from './protocol';
import type { Command, CmdResult } from '../sim/commands';

type Status = 'idle' | 'connecting' | 'open' | 'lost' | 'refused';
export const status = signal<Status>('idle');
export const refusal = signal<string | null>(null);
export const me = signal<Me | null>(null);
export const world = signal<WorldInfo | null>(null);
export const realms = signal<RealmInfo[]>([]);
/** owner of every place (replaced, not mutated, when it changes) */
export const owners = signal<Int16Array | null>(null);
export const placeInfo = signal<PlaceDetail | null>(null);
/** When the world's day began here and when the world was paused (performance.now(); 0: not yet, not paused), for
 *  the hour of the world (worldHour). */
let dayBegan = 0,
  pausedAt = 0;

// Vite puts the build's settings on import.meta.env; under Node (the server and the tools) there is none
const ENV: Record<string, string | undefined> = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
export const worldUrl = ENV.VITE_WORLD_URL || 'ws://localhost:8787';

let ws: WebSocket | null = null;
let creds: { token?: string; name?: string } | null = null;
let retry = 0,
  retryTimer: ReturnType<typeof setTimeout> | null = null;
let nextCmd = 1;
const pending = new Map<number, (r: CmdResult) => void>();
let nextTalk = 1;
const talks = new Map<number, { onText: (t: string) => void; end: (err?: string) => void }>();

function send(m: ClientMsg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
}

export function connect(c: { token?: string; name?: string }) {
  creds = c;
  refusal.value = null;
  open();
}
export function disconnect() {
  creds = null;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  ws?.close();
  ws = null;
  status.value = 'idle';
  me.value = null;
}

function open() {
  if (!creds) return;
  status.value = 'connecting';
  const sock = new WebSocket(worldUrl);
  ws = sock;
  sock.binaryType = 'arraybuffer';
  sock.onopen = () => {
    retry = 0;
    sock.send(JSON.stringify({ type: 'hello', v: PROTOCOL_VERSION, ...creds } satisfies ClientMsg));
  };
  sock.onmessage = (ev) => {
    if (typeof ev.data !== 'string') {
      const b = decodeBinary(ev.data as ArrayBuffer);
      if (b.kind === BIN_OWNERS && b.owner) owners.value = b.owner;
      return;
    }
    let m: ServerMsg;
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    onMessage(m);
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    for (const [, f] of pending) f({ ok: false, err: 'connection lost' });
    pending.clear();
    for (const [, t] of talks) t.end('Die Verbindung zum Server ist abgerissen.');
    talks.clear();
    if (!creds || status.value === 'refused') return;
    status.value = 'lost';
    retryTimer = setTimeout(open, Math.min(30_000, 1000 * 2 ** retry++));
  };
}

function onMessage(m: ServerMsg) {
  switch (m.type) {
    case 'welcome':
      status.value = 'open';
      me.value = m.me;
      notePause(m.world.paused);
      world.value = m.world;
      realms.value = m.realms;
      return;
    case 'world':
      notePause(m.world.paused);
      world.value = m.world;
      return;
    case 'tick':
      dayBegan = performance.now();
      if (world.value) world.value = { ...world.value, day: m.day };
      return;
    case 'realms':
      realms.value = m.realms;
      return;
    case 'me':
      me.value = m.me;
      return;
    case 'owners': {
      const o = owners.value?.slice();
      if (!o) return;
      for (const [i, v] of m.changes) o[i] = v;
      owners.value = o;
      return;
    }
    case 'place':
      placeInfo.value = m.detail;
      return;
    case 'talk': {
      const t = talks.get(m.id);
      if (!t) return;
      if (m.text) t.onText(m.text);
      if (m.done || m.err) {
        talks.delete(m.id);
        t.end(m.err);
      }
      return;
    }
    case 'result': {
      const f = pending.get(m.id);
      pending.delete(m.id);
      f?.({ ok: m.ok, err: m.err });
      return;
    }
    case 'error':
      if (m.code === 'auth' || m.code === 'version' || m.code === 'sessions') {
        status.value = 'refused';
        refusal.value = m.message;
        creds = null;
      } else refusal.value = m.message;
      return;
  }
}

export const claim = (realm: number) => send({ type: 'claim', realm });
export const abdicate = () => send({ type: 'abdicate' });
export const askPlace = (place: number) => send({ type: 'place', place });
/** Pauses or runs the world, or sets its speed (only for whom `me.time` allows; the server says the new clock to all). */
export const setTime = (t: { paused?: boolean; speed?: number }) => send({ type: 'time', ...t });
/** Keeps the time of a pause, and moves the day's beginning on by the pause when the world goes on. */
function notePause(paused: boolean) {
  const now = performance.now();
  if (paused && !pausedAt) pausedAt = now;
  else if (!paused && pausedAt) {
    if (dayBegan) dayBegan += now - pausedAt;
    pausedAt = 0;
  }
}

/** How long a day of the world lasts at its speed, in real milliseconds (0: as fast as the server can reckon). */
export function dayLength(w: WorldInfo): number {
  const speed = SPEEDS[(w.speed ?? 1) - 1];
  return speed === 'own' ? w.secondsPerDay * 1000 : speed;
}
/** The hour of the world's day (0 to 24), by the time since the day began here and the world's pace (people feature
 *  12: the day plan); null before the first day here, and at the last speed, where a day has no hours to see. */
export function worldHour(now = performance.now()): number | null {
  const w = world.value;
  if (!w || !dayBegan) return null;
  const ms = dayLength(w);
  if (!ms) return null;
  return Math.min(0.999, ((pausedAt || now) - dayBegan) / ms) * 24;
}

/** Sends a command; the answer comes when the world applies it at the next day. */
export function command(cmd: Omit<Command, 'realm'>): Promise<CmdResult> {
  const id = nextCmd++;
  return new Promise((res) => {
    pending.set(id, res);
    send({ type: 'cmd', id, cmd: { ...cmd, realm: -1 } as Command });
  });
}
/** Says the conversation so far to the person `person` (a uid), the player's newest line last; `onText` gets the
 *  answer in pieces, and the promise ends with the answer or rejects with the reason there is none (server/talk). */
export function talk(person: number, lines: TalkLine[], onText: (t: string) => void): Promise<void> {
  if (ws?.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Keine Verbindung zum Server.'));
  const id = nextTalk++;
  return new Promise((res, rej) => {
    talks.set(id, { onText, end: (err) => (err ? rej(new Error(err)) : res()) });
    send({ type: 'talk', id, person, lines });
  });
}
