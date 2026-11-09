// The tick: one call = one in-game day. Deterministic given state + commands; used by the worker and the world server.
import type { GameState, Command, CmdResult } from './types';
import type { World } from './world';
import { mkCtx, bump, DAY_EPOCH } from './ctx';
import { SYSTEMS } from './systems';
import { applyCommand } from './commands';
import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate';

export const SAVE_VERSION = 2;
export const END_YEAR = 1815;

export interface TickProfile { [system: string]: number }
export const PROFILE: TickProfile = {};
let profiling = false;
export function setProfiling(v: boolean) { profiling = v; for (const k in PROFILE) delete PROFILE[k]; }
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Numeric fields that start out as whole numbers and later take fractions. Writing a fraction once and putting
// the value back gives every object the final field layout up front, so optimised code is not thrown away
// each time one of these fields first takes a fraction in some realm. Values (and saves) are unchanged.
const NATION_NUM = ['treasury', 'debt', 'manpower', 'sailors', 'concord', 'mandate', 'authority', 'prestige', 'warExhaustion', 'inflation', 'armyMaint', 'libertyDesire', 'integration', 'dread', 'maxManpower', 'corruption', 'score'];
const ARMY_NUM = ['morale', 'progress', 'supplyDeficit'];
const SHAPED = new WeakSet<GameState>();
function widen(o: any, keys: string[]) { for (const k of keys) { const v = o[k]; if (typeof v === 'number' && Number.isInteger(v)) { o[k] = 0.5; o[k] = v; } } }
function shapeState(s: GameState) {
  for (const n of s.nations) widen(n, NATION_NUM);
  for (const a of s.armies) widen(a, ARMY_NUM);
  widen(s, ['priceLevel', 'silverStock']);
  SHAPED.add(s);
}

export function advanceDay(s: GameState, w: World) {
  if (s.ended) return;
  if (!SHAPED.has(s)) shapeState(s);
  s.day++;
  bump(); DAY_EPOCH.v++;
  const c = mkCtx(s, w);
  const firstOfMonth = c.date.d === 1;
  const newYear = firstOfMonth && c.date.m === 0;
  for (const sys of SYSTEMS) {
    const t0 = profiling ? now() : 0;
    sys.daily?.(c);
    if (firstOfMonth) sys.monthly?.(c);
    if (newYear) sys.yearly?.(c);
    if (profiling) PROFILE[sys.id] = (PROFILE[sys.id] || 0) + now() - t0;
  }
  if (c.date.y > END_YEAR) endGame(s);
}

function endGame(s: GameState) {
  s.ended = true;
  const best = s.nations.filter((n) => n.alive).sort((a, b) => b.score - a.score)[0];
  s.victory = { nation: best?.id ?? -1, kind: 'score' };
}

/** Commands are applied before the day ticks (in order). Results are returned for the UI. */
export function step(s: GameState, w: World, cmds: Command[]): CmdResult[] {
  const res = cmds.map((c) => applyCommand(s, w, c));
  advanceDay(s, w);
  return res;
}

// ---------------- save / load ----------------
type Enc = { __ta: string; d: string };
const TA: Record<string, any> = { Float32Array, Float64Array, Int16Array, Uint8Array, Uint16Array, Int32Array, Uint32Array };
function b64(u8: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');
  let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000) as any); return btoa(s);
}
function unb64(s: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
  const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u;
}
function replacer(_k: string, v: any) {
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
    const ta = v as any as Uint8Array;
    return { __ta: (v as any).constructor.name, d: b64(new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength)) } as Enc;
  }
  return v;
}
function reviver(_k: string, v: any) {
  if (v && typeof v === 'object' && typeof v.__ta === 'string') {
    const u = unb64(v.d); const C = TA[v.__ta];
    const copy = new Uint8Array(u.byteLength); copy.set(u);
    return new C(copy.buffer, 0, copy.byteLength / C.BYTES_PER_ELEMENT);
  }
  return v;
}
export function serialize(s: GameState): string { return JSON.stringify({ ...s, v: SAVE_VERSION }, replacer); }
export function deserialize(json: string): GameState {
  const s = JSON.parse(json, reviver) as GameState;
  DAY_EPOCH.v++; bump();
  return migrate(s);
}
function migrate(s: GameState): GameState {
  if (!s.v) s.v = 1;
  if (s.v < 2) {
    // version 2 (truth pass): migration, administrative load and the tax instruments
    const L = s.loc.owner.length;
    if (!s.loc.migr) s.loc.migr = new Float32Array(L);
    if (!s.loc.migrBal) s.loc.migrBal = new Float32Array(L);
    for (const n of s.nations) { n.duties ??= { land: 0, hearth: 0, excise: 0 }; n.adminLoad ??= 0; }
    s.v = 2;
  }
  // people pass (idempotent, whatever the version): generals, the AI's log, candidates at every court
  for (const n of s.nations) {
    n.aiLog ??= []; n.candidates ??= [];
    if (!n.generals) { n.generals = []; for (const a of s.armies) if (a.owner === n.id && a.general && a.general !== n.ruler && a.general !== n.heir && s.chars[a.general]) n.generals.push(a.general); }
  }
  return s;
}
export function saveBinary(s: GameState): Uint8Array { return gzipSync(strToU8(serialize(s)), { level: 6 }); }
export function loadBinary(b: Uint8Array): GameState { return deserialize(strFromU8(gunzipSync(b))); }

/** FNV-1a hash of the serialized state (determinism checks, desync detection). */
export function hashState(s: GameState): string {
  const str = serialize(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
