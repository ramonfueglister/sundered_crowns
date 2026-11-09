// Wire protocol between the browser (OnlineClient) and the world server (server/main.ts).
// JSON text frames for everything except bulky typed arrays, which travel as binary frames (see BIN_*).
import type { Command, CmdResult, I18n, StandingOrders } from '../sim/types';
import type { ArmyLite, Legend, MapMode, NationLite, Query, TickView } from '../game/protocol';

export const PROTOCOL_VERSION = 2;

/** A tick on the wire: armies come whole only in a full view; daily ticks carry the armies that changed and the ids that are gone. */
export type WireTickView = Omit<TickView, 'owner' | 'ctrl' | 'snow' | 'armies'> & {
  armies?: ArmyLite[]; armyUpd?: ArmyLite[]; armyDel?: number[];
  /** changed fields of changed realms (a new realm comes whole) */
  nationUpd?: (Partial<NationLite> & { id: number })[];
};
/** Applies a tick's realm changes to the receiver's list; returns a new list when anything changed. */
export function applyNations(have: NationLite[], v: WireTickView): NationLite[] | undefined {
  if (v.nations) return v.nations;
  if (!v.nationUpd?.length) return undefined;
  const out = have.slice();
  for (const u of v.nationUpd) {
    const m: any = out[u.id] ? { ...out[u.id], ...u } : { ...u };
    for (const k in u) if ((u as any)[k] === null) m[k] = undefined;
    out[u.id] = m;
  }
  return out;
}
/** Applies a tick's army data to the receiver's copy (kept in server order) and returns the current list. */
export function applyArmies(have: Map<number, ArmyLite>, v: WireTickView): ArmyLite[] {
  if (v.armies) { have.clear(); for (const a of v.armies) have.set(a.id, a); }
  if (v.armyDel) for (const id of v.armyDel) have.delete(id);
  if (v.armyUpd) for (const a of v.armyUpd) have.set(a.id, a);
  return [...have.values()];
}

// ---------------- binary frames: [kind u8][pad u8 x3][len u32 LE][payload] ----------------
export const BIN_OWNERS = 1; // payload: Int16Array owner (N) followed by Int16Array ctrl (N)
export const BIN_COLORS = 2; // payload: Uint8Array rgba (4*N); mode index in byte 1
export const BIN_SNOW = 3;   // payload: Float32Array snow (L)
export const BIN_ROADS = 4;  // payload: Uint8Array road level per location (L)
export const MAP_MODE_LIST: MapMode[] = ['political', 'terrain', 'diplomatic', 'development', 'population', 'culture', 'faith', 'trade', 'unrest', 'control', 'goods', 'explored', 'prices', 'production', 'markets'];

export function encodeBinary(kind: number, payload: ArrayBufferView, extra = 0): Uint8Array {
  const out = new Uint8Array(8 + payload.byteLength);
  out[0] = kind; out[1] = extra;
  new DataView(out.buffer).setUint32(4, payload.byteLength, true);
  out.set(new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength), 8);
  return out;
}
export function decodeBinary(buf: ArrayBuffer | Uint8Array): { kind: number; extra: number; data: ArrayBuffer } {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const len = new DataView(u.buffer, u.byteOffset, u.byteLength).getUint32(4, true);
  const data = u.slice(8, 8 + len).buffer; // copy → aligned for typed array views
  return { kind: u[0], extra: u[1], data };
}

// ---------------- shared records ----------------
export interface WorldInfo {
  id: string; name: string; season: number; day: number; startYear: number;
  secondsPerDay: number; paused: boolean; nextDayAt: number; // epoch ms of the next tick (0 while paused)
  players: number; maxPlayers: number; online: number; seasonEndDay: number; startedAt: number; projectedEnd: number;
  dev: boolean; // server runs without Supabase (display-name login)
}
export interface FreeNation {
  id: number; key: string; name: I18n; short: I18n; color: [number, number, number]; coa: any;
  rank: string; dev: number; locs: number; capital: number; difficulty: number;
}
export interface SeatInfo { nation: number; key: string; joinedDay: number; protectedUntil: number; orders: StandingOrders }
export interface RosterEntry { nation: number; key: string; name: string; online: boolean }
export interface ChatMsg { id: number; at: number; day: number; from: string; fromName: string; fromNation: number; to: number | null; text: string; system?: boolean }
export type OfferAction = 'alliance' | 'marriage' | 'access' | 'trade' | 'guarantee';
export const OFFER_ACTIONS: OfferAction[] = ['alliance', 'marriage', 'access', 'trade', 'guarantee'];
export interface PlayerOffer { id: number; from: number; to: number; action: OfferAction; day: number; expires: number; text?: string }
export interface LeaderRow { rank: number; nation: number; key: string; name: I18n; score: number; player: string | null }
export interface EarnedAchievement { key: string; day: number; season: number }

// ---------------- client → server ----------------
export type ClientMsg =
  | { type: 'hello'; v: number; token?: string; name?: string }
  | { type: 'free' }
  | { type: 'join'; nation: number }
  | { type: 'leave' }
  | { type: 'cmd'; id: number; cmd: Command }
  | { type: 'query'; id: number; q: Query }
  | { type: 'mapmode'; mode: MapMode; focus: number }
  | { type: 'mapgood'; good: number }
  | { type: 'chat'; text: string; to?: number }
  | { type: 'offer'; to: number; action: OfferAction; text?: string }
  | { type: 'offer_answer'; offer: number; accept: boolean }
  | { type: 'leaderboard' }
  | { type: 'admin'; action: AdminAction; uid?: string; nation?: number; text?: string; secondsPerDay?: number; cmd?: Command; release?: boolean }
  | { type: 'ping'; t: number };
export type AdminAction = 'kick' | 'pause' | 'resume' | 'speed' | 'broadcast' | 'dev' | 'release' | 'snapshot' | 'end_season';

// ---------------- server → client ----------------
export type ServerMsg =
  | { type: 'welcome'; user: { id: string; name: string; admin: boolean }; world: WorldInfo; seat: SeatInfo | null; L: number; S: number; nations: NationLite[] }
  | { type: 'world'; world: WorldInfo }
  | { type: 'free'; nations: FreeNation[] }
  | { type: 'seat'; seat: SeatInfo | null }
  | { type: 'tick'; view: WireTickView; ownerDelta?: number[] } // ownerDelta: flat [loc, owner, ctrl, ...]
  | { type: 'queued'; id: number; day: number }
  | { type: 'cmdResult'; id: number; res: CmdResult }
  | { type: 'reply'; id: number; data: any }
  | { type: 'legend'; mode: MapMode; legend: Legend }
  | { type: 'chat'; msgs: ChatMsg[] }
  | { type: 'offers'; offers: PlayerOffer[] }
  | { type: 'roster'; roster: RosterEntry[] }
  | { type: 'achievements'; earned: EarnedAchievement[]; fresh: string[] }
  | { type: 'leaderboard'; season: number; rows: LeaderRow[]; final: boolean }
  | { type: 'season'; ended: number; started: number; rows: LeaderRow[] }
  | { type: 'broadcast'; text: string; at: number }
  | { type: 'error'; code: string; message: string; id?: number }
  | { type: 'kicked'; reason: string }
  | { type: 'pong'; t: number; server: number };

export const DEFAULT_ORDERS: StandingOrders = { defendOnly: true, balanceBudget: true, acceptPeaceBelow: 25, autoBuild: true, autoRecruit: true };
export function sanitizeOrders(o: any): StandingOrders {
  const b = (v: any, d: boolean) => (typeof v === 'boolean' ? v : d);
  const num = Number(o?.acceptPeaceBelow);
  return {
    defendOnly: b(o?.defendOnly, DEFAULT_ORDERS.defendOnly), balanceBudget: b(o?.balanceBudget, DEFAULT_ORDERS.balanceBudget),
    acceptPeaceBelow: Number.isFinite(num) ? Math.max(0, Math.min(100, Math.round(num))) : DEFAULT_ORDERS.acceptPeaceBelow,
    autoBuild: b(o?.autoBuild, DEFAULT_ORDERS.autoBuild), autoRecruit: b(o?.autoRecruit, DEFAULT_ORDERS.autoRecruit),
  };
}
