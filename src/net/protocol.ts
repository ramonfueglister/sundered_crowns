// Messages between the browser and the world server (WebSocket, JSON; the map of owners goes as one binary frame).
import type { I18n } from '../sim/i18n';
import type { Command } from '../sim/commands';

export const PROTOCOL_VERSION = 1;

export interface WorldInfo {
  id: string; name: string; day: number; startYear: number; secondsPerDay: number; paused: boolean; players: number; maxPlayers: number;
}
export interface RealmInfo {
  id: number; key: string; name: I18n; short: I18n; adjective: I18n; color: number; capital: number; faith: number; places: number;
  /** display name of the player who rules it (null: the realm has no player) */
  ruler: string | null;
}
export interface PlaceDetail {
  id: number; name: string; nameDe: string; owner: number; terrain: string; resource: string; culture: I18n; faith: I18n; pop: number;
  /** the last grain harvest and what it was computed from (absent when the server is older than the client) */
  harvest?: HarvestDetail;
}
export interface HarvestDetail {
  /** kilocalories of food from arable farming in the year, and per head and day */
  kcal: number; perHeadDay: number;
  /** land productivity (index of potential calories per hectare and year; null: no data), land in hectares, people in agriculture */
  landYield: number | null; hectares: number; farmers: number;
}
export interface Me { uid: string; name: string; admin: boolean; realm: number }

export type ClientMsg =
  | { type: 'hello'; v: number; token?: string; name?: string }
  | { type: 'claim'; realm: number }
  | { type: 'abdicate' }
  | { type: 'cmd'; id: number; cmd: Command }
  | { type: 'place'; place: number };

export type ServerMsg =
  | { type: 'welcome'; me: Me; world: WorldInfo; realms: RealmInfo[] }
  | { type: 'tick'; day: number }
  | { type: 'world'; world: WorldInfo }
  | { type: 'realms'; realms: RealmInfo[] }
  | { type: 'me'; me: Me }
  | { type: 'owners'; changes: [number, number][] }
  | { type: 'result'; id: number; ok: boolean; err?: string }
  | { type: 'place'; detail: PlaceDetail }
  | { type: 'error'; code: string; message: string };

/** Binary frames: the first byte says what follows. */
export const BIN_OWNERS = 1;
export function encodeOwners(owner: Int16Array): Uint8Array {
  const out = new Uint8Array(2 + owner.byteLength);
  out[0] = BIN_OWNERS;
  out.set(new Uint8Array(owner.buffer, owner.byteOffset, owner.byteLength), 2);
  return out;
}
export function decodeBinary(b: ArrayBuffer): { kind: number; owner?: Int16Array } {
  const u = new Uint8Array(b);
  if (u[0] === BIN_OWNERS) return { kind: BIN_OWNERS, owner: new Int16Array(b.slice(2)) };
  return { kind: u[0] };
}
