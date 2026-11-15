// The browser's connection to the world server. Holds what the server last told us as signals for the interface.
import { signal } from '@preact/signals';
import { PROTOCOL_VERSION, BIN_OWNERS, decodeBinary, type ClientMsg, type ServerMsg, type WorldInfo, type RealmInfo, type Me, type PlaceDetail } from './protocol';
import type { Command, CmdResult } from '../sim/commands';

export type Status = 'idle' | 'connecting' | 'open' | 'lost' | 'refused';
export const status = signal<Status>('idle');
export const refusal = signal<string | null>(null);
export const me = signal<Me | null>(null);
export const world = signal<WorldInfo | null>(null);
export const realms = signal<RealmInfo[]>([]);
/** owner of every place (replaced, not mutated, when it changes) */
export const owners = signal<Int16Array | null>(null);
export const placeInfo = signal<PlaceDetail | null>(null);

const ENV: Record<string, string | undefined> = ((import.meta as any).env ?? {}) as any;
export const worldUrl = ENV.VITE_WORLD_URL || 'ws://localhost:8787';

let ws: WebSocket | null = null;
let creds: { token?: string; name?: string } | null = null;
let retry = 0, retryTimer: ReturnType<typeof setTimeout> | null = null;
let nextCmd = 1;
const pending = new Map<number, (r: CmdResult) => void>();

function send(m: ClientMsg) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); }

export function connect(c: { token?: string; name?: string }) {
  creds = c; refusal.value = null; open();
}
export function disconnect() {
  creds = null; if (retryTimer) clearTimeout(retryTimer); retryTimer = null;
  ws?.close(); ws = null; status.value = 'idle'; me.value = null;
}

function open() {
  if (!creds) return;
  status.value = 'connecting';
  const sock = new WebSocket(worldUrl); ws = sock;
  sock.binaryType = 'arraybuffer';
  sock.onopen = () => { retry = 0; sock.send(JSON.stringify({ type: 'hello', v: PROTOCOL_VERSION, ...creds } satisfies ClientMsg)); };
  sock.onmessage = (ev) => {
    if (typeof ev.data !== 'string') { const b = decodeBinary(ev.data as ArrayBuffer); if (b.kind === BIN_OWNERS && b.owner) owners.value = b.owner; return; }
    let m: ServerMsg; try { m = JSON.parse(ev.data); } catch { return; }
    onMessage(m);
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    for (const [, f] of pending) f({ ok: false, err: 'connection lost' }); pending.clear();
    if (!creds || status.value === 'refused') return;
    status.value = 'lost';
    retryTimer = setTimeout(open, Math.min(30_000, 1000 * 2 ** retry++));
  };
}

function onMessage(m: ServerMsg) {
  switch (m.type) {
    case 'welcome': status.value = 'open'; me.value = m.me; world.value = m.world; realms.value = m.realms; return;
    case 'world': world.value = m.world; return;
    case 'tick': if (world.value) world.value = { ...world.value, day: m.day }; return;
    case 'realms': realms.value = m.realms; return;
    case 'me': me.value = m.me; return;
    case 'owners': { const o = owners.value?.slice(); if (!o) return; for (const [i, v] of m.changes) o[i] = v; owners.value = o; return; }
    case 'place': placeInfo.value = m.detail; return;
    case 'result': { const f = pending.get(m.id); pending.delete(m.id); f?.({ ok: m.ok, err: m.err }); return; }
    case 'error':
      if (m.code === 'auth' || m.code === 'version' || m.code === 'sessions') { status.value = 'refused'; refusal.value = m.message; creds = null; }
      else refusal.value = m.message;
      return;
  }
}

export const claim = (realm: number) => send({ type: 'claim', realm });
export const abdicate = () => send({ type: 'abdicate' });
export const askPlace = (place: number) => send({ type: 'place', place });
/** Sends a command; the answer comes when the world applies it at the next day. */
export function command(cmd: Omit<Command, 'realm'>): Promise<CmdResult> {
  const id = nextCmd++;
  return new Promise((res) => { pending.set(id, res); send({ type: 'cmd', id, cmd: { ...cmd, realm: -1 } as Command }); });
}
