// Messages between the UI thread and the simulation worker.
import type { Command, CmdResult, I18n, Notice, PendingEvent, ChronEntry } from '../sim/types';

export type ToWorker =
  | { type: 'init'; seed: number; year: number; player: number | null; save?: Uint8Array; devtools?: boolean; difficulty?: number; victory?: string[] }
  | { type: 'cmd'; id: number; cmd: Command }
  | { type: 'speed'; speed: number }            // 0 = paused, 1..5
  | { type: 'player'; player: number | null }   // choose / change the played realm
  | { type: 'query'; id: number; q: Query }
  | { type: 'save'; id: number }
  | { type: 'mapmode'; mode: MapMode; focus: number; palette?: 'normal' | 'cvd' }
  | { type: 'mapgood'; good: number }          // the good shown by the prices, production and markets map modes (-1: none)
  | { type: 'skip'; days: number };             // developer tools: run this many days at once (single player)

export type MapMode = 'political' | 'terrain' | 'diplomatic' | 'development' | 'population' | 'culture' | 'faith' | 'trade' | 'unrest' | 'control' | 'goods' | 'explored'
  | 'army_supply' // war pass: men each place feeds for the selected realm's armies
  | 'prices' | 'production' | 'markets'; // trade pass
export const MAP_MODES: MapMode[] = ['political', 'terrain', 'diplomatic', 'development', 'population', 'culture', 'faith', 'trade', 'unrest', 'control', 'goods', 'army_supply', 'prices', 'production', 'markets'];
/** Map modes that show one good (chosen in the legend); for 'markets' the good is optional. */
export const GOOD_MAP_MODES: MapMode[] = ['prices', 'production', 'markets'];

export type Query =
  | { q: 'loc'; loc: number }
  | { q: 'nation'; nation: number }
  | { q: 'ledger'; kind: 'nations' | 'markets' | 'wars' }
  | { q: 'market'; market: number }
  | { q: 'diplo'; target: number; action: string }
  | { q: 'peace'; war: number; to: number; terms: any[]; concede?: boolean }
  | { q: 'path'; army: number; to: number }
  | { q: 'realm' }           // full data for the player's realm panels (laws, estates, council, tech, doctrines, decisions)
  | { q: 'chronicle'; from?: number }
  | { q: 'timelapse' }
  | { q: 'endstats' }
  | { q: 'goals'; nation: number }  // goal tree of any realm with done/open state (nation selection, ambitions)
  | { q: 'eventFx'; pending: number } // what each option of a pending event of ours does (src/game/eventfx.ts)
  | { q: 'works' }                  // building and levy overview of our realm (src/game/worksview.ts)
  | { q: 'scope'; loc: number; scope: 'province' | 'area' } // orders for the province or area of a location
  | { q: 'gain'; loc: number; building: number }             // the estimate behind one place's building yield
  | { q: 'places'; locs: number[] }                           // province and area of locations (grouped peace demands)
  // war pass (src/game/warview.ts)
  | { q: 'declare'; target: number }                          // our justifications, and per war goal its cost and towns
  | { q: 'army'; army: number }                               // regiments, refill, supply, attrition and siege of an army of ours
  | { q: 'battle'; id: number }                               // one battle report
  | { q: 'battles'; war?: number }                            // the greatest battles of a war, or our latest
  | { q: 'war'; war: number }                                // the terms our side may demand in a war, and its battles
  // trade pass (src/game/tradeview.ts)
  | { q: 'tmarket'; market: number }                         // trade power, our merchants and goods of a market
  | { q: 'tmarkets' }                                        // the markets we know with our share and income
  | { q: 'tgood'; market: number; good: number }             // producers, consumers, price and its drivers of one good
  | { q: 'tpolicy' }                                         // tariff, agreements, embargoes and partners of our realm
  | { q: 'trel'; target: number }                            // trade between us and another realm
  | { q: 'expedition'; to?: number; fleet?: number }         // expedition targets and the plan for one
  | { q: 'companies' }                                      // our chartered companies and the charters open to us
  // ---- realm pass (src/game/realmview.ts): the Empire and the league, the great powers, the assembly, the government, a situation
  | { q: 'empire' }
  | { q: 'powers' }
  | { q: 'assembly'; kind: 'tax' | 'war'; cls?: number; rate?: number; target?: number; goal?: string; bribe?: string[]; concede?: string }
  | { q: 'govern' }
  | { q: 'situation'; id: string }
  // people pass (src/game/view.ts commandersView)
  | { q: 'commanders'; army: number }                        // who could lead one of our armies, and the price of a new general
  // ---- polish pass
  | { q: 'victory' }                                          // chosen victory conditions with our progress (src/game/endview.ts)
  | { q: 'history'; nations?: number[] }                      // yearly history of the player and the top realms (end screen graphs)
  | { q: 'devEvents' };                                       // every event id with its title (developer panel)

export type FromWorker =
  | { type: 'ready'; L: number; S: number; nations: NationLite[] }
  | { type: 'tick'; view: TickView }
  | { type: 'cmdResult'; id: number; res: CmdResult }
  | { type: 'reply'; id: number; data: any }
  | { type: 'saved'; id: number; data: Uint8Array }
  | { type: 'colors'; mode: MapMode; rgba: Uint8Array; legend: Legend }
  | { type: 'error'; message: string };

export interface Legend { title: I18n; items: { color: string; label: I18n | string }[]; good?: number; goodOptional?: boolean }

export interface NationLite {
  id: number; key: string; alive: boolean; name: I18n; short: I18n; adj: I18n; color: [number, number, number];
  capital: number; rank: string; gov: string; score: number; overlord: number; faith: number; culture: number; coa: any;
  ruler: string; difficulty: number; summary: I18n; dev: number; locs: number; personality: string; player: boolean;
}

export interface ArmyLite {
  id: number; owner: number; loc: number; x: number; y: number; men: number; fleet: boolean; morale: number; path: number[];
  siege: number; battle: number; rebels: boolean; name: I18n | string; general: string; embarked: boolean; mercenary: boolean;
  /** share of the way to path[0] already marched (0..1) */
  prog?: number;
}

export interface PlayerView {
  id: number; treasury: number; income: number; expense: number; manpower: number; maxManpower: number; sailors: number;
  concord: number; mandate: number; authority: number; prestige: number; warExhaustion: number; inflation: number; corruption: number;
  dread: number; envoys: number; envoysBusy: number; insight: number; tech: number[]; techProgress: number[]; era: number;
  incomeBreak: Record<string, number>; expenseBreak: Record<string, number>; ruler: string; rulerAge: number; heir: string;
  atWar: boolean; taxRate: number[]; armyMaint: number; navyMaint: number; tariff: number; coinage: number; loans: number; debt: number;
  stats: Record<string, number>;
  homeMarket: number;                              // market of the capital (-1 without a capital)
  merchants: { used: number; cap: number };
  electionCloses?: number;                         // an imperial election this realm must still vote in closes that day (realm pass)
  asks?: number;                                   // offers of mediation and calls of the league awaiting this realm's answer (realm pass)
}

/** War score parts from the attackers' side, before the ±100 cap (src/sim/systems/war.ts scoreParts). */
export interface WarScoreParts { battles: number; occupation: number; capital: number; ticking: number; blockade: number }

/** a trade route between two market hubs last month: the goods go from a to b; value in gold, the main good */
export interface TradeFlowLite { a: number; b: number; value: number; good: number }
/** a market hub with the value of the goods that passed through it last month */
export interface TradeHubLite { hub: number; name: I18n; value: number }
export interface LandmarkLite { id: string; loc: number; name: I18n; kind: string; tier: number; max: number; holder: number; work: number }

export interface TickView {
  day: number; startYear: number; speed: number; ended: boolean; victory?: { nation: number; kind: string };
  owner?: Int16Array; ctrl?: Int16Array;          // sent only when changed
  ownerChanges?: { loc: number; order: number }[]; changeOrigin?: number;
  nations?: NationLite[];                          // refreshed monthly
  armies: ArmyLite[];
  player: PlayerView | null;
  notices: Notice[];                               // new since last tick
  pending: (PendingEvent & { title: I18n; text: I18n; options: { label: I18n; hint?: I18n }[]; art?: string })[];
  wars: { id: number; name: I18n; att: number[]; def: number[]; attLead: number; defLead: number; score: number; parts: WarScoreParts; caps?: WarScoreParts; offers: { from: number; to: number; terms: any[]; concede?: boolean; idx: number }[] }[];
  sieges: { loc: number; nation: number; progress: number; need: number; garrison: number }[]; // need: steps that take the town (4, 3 under blockade)
  battles: { id: number; loc: number; att: number; def: number; lossA: number; lossD: number; startA: number; startD: number; phase: number }[];
  chronicle: ChronEntry[];                         // new entries
  snow?: Float32Array;                             // monthly
  roads?: Uint8Array;                              // monthly: road level per location (0..3)
  landmarks?: LandmarkLite[];                      // monthly
  trade?: { flows: TradeFlowLite[]; hubs: TradeHubLite[] }; // monthly: the largest trade routes and the markets
  explored?: Uint8Array;                           // monthly: 1 = known to the player's people (absent in observer mode)
  ranking: number[];
  msPerDay: number;
}
