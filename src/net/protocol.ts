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
  /** the economy of the place's city (only the places with one of the 30 largest cities; absent when the world has
   *  no economies or the server is older than the client) */
  cityEconomy?: CityEconomyDetail;
}
/** The economy of a city on the day of its last computed period (src/sim/systems/economy.ts). Amounts are in pounds
 *  at the scale of the model; GDP and its uses are sums over the last 365 days. */
export interface CityEconomyDetail {
  /** the day of the world the figures reach, and the year of the starting position */
  day: number; baseYear: number;
  /** the model computes the city at this scale (0.01: one person of the model stands for a hundred) */
  scale: number;
  /** real GDP at the prices of the base year, and as an index with the starting position at 100 */
  realGdp: number; realGdpIndex: number;
  /** the price level of the last day, starting position 100: the mean price of the firms weighted by their output */
  priceToday: number;
  /** at the prices of the base year: consumption of households, purchases of the crown, investment (firms and
   *  dwellings), exports (what the merchants bought in the city for other cities), imports (what they sold in it) */
  consumption: number; crown: number; investment: number; exports: number; imports: number;
  /** persons at work (employees and the owners of firms) and workers without an employer */
  employed: number; unemployed: number;
  /** coin held by households and by firms, at current prices */
  coinHouseholds: number; coinFirms: number;
  /** why the economies stand still (absent while they run) */
  halted?: string;
}
export interface HarvestDetail {
  /** kilocalories of food from arable farming in the year, and per head and day */
  kcal: number; perHeadDay: number;
  /** land productivity of the whole place (index of potential calories per hectare and year; null: no data), land in hectares, people in agriculture */
  landYield: number | null; hectares: number; farmers: number;
  /** cultivated land (absent when the server is older than the client) */
  arable?: ArableDetail;
}
export interface ArableDetail {
  /** arable in hectares and as a share of the place's land */
  hectares: number; share: number;
  /** mean productivity of the arable (null: none) */
  landYield: number | null;
  /** the place cultivates all the land it can: more people get no more land */
  atLimit: boolean;
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
