// The complete simulation state. Pure data (JSON + typed arrays) so it can be saved, hashed and diffed.
// Mechanic names used in the UI are our own: Concord (stability), Mandate (legitimacy), Authority (political capital),
// Powers of the Realm (internal power groups), Dread (expansion backlash), Common Front (coalition), Leagues, etc.

export type Lang = 'en' | 'de';
export interface I18n { en: string; de: string }

export interface Character {
  id: number; name: string; dynasty: string; female: boolean; born: number; // born: absolute year*1000+dayOfYear approx → we store birth day index (can be negative)
  skills: [number, number, number]; // governance, statecraft, generalship 0..6
  traits: string[];
  nation: number; alive: boolean; died?: number;
  spouse?: number; father?: number; mother?: number; children: number[];
  health: number;   // 0..1, falls with illness/age
  loyalty?: number; corruption?: number; ambition?: number; // for officials
  role?: 'ruler' | 'heir' | 'consort' | 'official' | 'general' | 'admiral' | 'explorer' | 'courtier' | 'clergy';
  claims?: number[]; // nations this character has a throne claim on
}

export interface LedgerEntry { [key: string]: number }

export interface Estate { // a Power of the Realm
  id: string; influence: number; contentment: number; privileges: string[];
}

export interface Nation {
  id: number; key: string; alive: boolean;
  name: I18n; short: I18n; adj: I18n; color: [number, number, number]; color2: [number, number, number];
  rank: string; gov: string; culture: number; faith: number; capital: number; // capital location
  coa: any;
  ruler: number; heir: number; consort: number; regent: number;
  dynasty: string;
  // core values
  treasury: number; debt: number; loans: Loan[]; manpower: number; maxManpower: number; sailors: number;
  concord: number;   // stability -100..100
  mandate: number;   // legitimacy 0..100
  authority: number; // political capital
  prestige: number;
  warExhaustion: number; // 0..100
  inflation: number;     // fraction
  corruption: number;    // 0..1
  adminCapacity: number; // land development the administration can integrate at full speed (systems/administration.ts)
  adminLoad?: number;    // development of land still being integrated, weighted by what is left to do
  duties?: { land: number; hearth: number; excise: number }; // tax instruments beside the class taxes (systems/duties.ts)
  // economy
  taxRate: number[];     // per class 0..0.5
  tariff: number;        // 0..0.5
  coinage: number;       // debasement 0..0.5
  income: LedgerEntry; expense: LedgerEntry; // last month
  incomeAcc: LedgerEntry; expenseAcc: LedgerEntry; // current month accumulators
  history: { day: number; treasury: number; income: number; expense: number; manpower: number; locs: number; pop: number; dev: number }[];
  armyMaint: number; navyMaint: number; // 0.25..1 spending sliders
  // politics
  laws: Record<string, number>;     // law id -> option index
  reform?: { law: string; option: number; left: number }; // ongoing reform (days)
  values: number[];                 // society value axes -100..100
  estates: Estate[];
  council: Record<string, number>;  // office -> character id
  candidates?: number[];           // character ids at court who could be appointed to an office (missing in older saves)
  // diplomacy
  overlord: number; subjectType: string | null; subjectSince: number; libertyDesire: number; integration: number;
  envoys: number; envoysBusy: number;
  rivals: number[];
  dread: number; // fear others have of this nation's expansion (Dread)
  personality: string; difficulty: number; summary: I18n;
  ai: boolean;
  // tech
  tech: [number, number, number]; techProgress: [number, number, number];
  doctrines: Record<string, number>; // group -> picks taken
  innovations: number[];             // adopted innovation ids
  era: number;
  // goals
  goalsDone: string[];
  // misc
  isHRE: boolean; elector: boolean; leagueMember: string[];
  excommunicated: boolean;
  knows: number;                // knowledge group index (shared explored map) or -1 own bitset
  flags: Record<string, number>; // generic flags / timers for events & situations
  standingOrders?: StandingOrders;
  playerId?: string | null;     // online world: owning account
  modifiers: Modifier[];
  score: number;
  stats: { battlesWon: number; battlesLost: number; locsGained: number; locsLost: number; warsWon: number };
  planned?: PlannedAction[]; // online: queued moves/constructions
}
export interface StandingOrders { defendOnly: boolean; balanceBudget: boolean; acceptPeaceBelow: number; autoBuild: boolean; autoRecruit: boolean }
export interface PlannedAction { day: number; cmd: Command }
export interface Modifier { id: string; until: number; label: I18n; effects: Record<string, number> }
export interface Loan { amount: number; rate: number; due: number; lender: string }

export interface Regiment { type: number; men: number }  // ships: men = number of ships
export interface Army {
  id: number; owner: number; loc: number; name: I18n | string; // bilingual; older saves hold a plain English string
  regs: Regiment[];
  morale: number; // 0..1 current morale fraction
  general: number;  // character id or 0
  path: number[]; progress: number; // km progressed toward path[0]
  fleet: boolean; carrying: number[]; embarkedOn: number; // fleet: armies carried; army: fleet id or 0
  siege: number; // location under siege or -1
  battle: number; // battle id or 0
  rebels?: { faction: string; demand: string; target: number }; // rebel stack data
  mercenary?: boolean;
  supplyDeficit: number;
  retreating: boolean;
  lastMoveDay: number;
  orderDay?: number;  // day of the last AI march order (keeps a long march from being re-ordered)
  hostile?: boolean;  // natives / brigands attacking anyone
  mission?: string;   // AI hint
}

export interface Battle {
  id: number; loc: number; day0: number; phase: number; days: number;
  att: number[]; def: number[];   // army ids
  attNation: number; defNation: number;
  lossA: number; lossD: number; startA: number; startD: number;
  log: string[]; naval: boolean; river: boolean;
}

export interface Siege { loc: number; nation: number; progress: number; days: number; garrison: number; breach: number; blockade: boolean; log: string[] }

export interface WarGoal { type: 'conquest' | 'throne' | 'faith' | 'independence' | 'coalition' | 'rebels' | 'trade' | 'reconquest' | 'subjugate' | 'civil_war'; target: number; locs: number[] }
export interface War {
  id: number; name: I18n; att: number[]; def: number[]; attLead: number; defLead: number;
  goal: WarGoal; start: number; score: number; // + favours attackers, -100..100
  battleScore: number; tickScore: number; battles: number; lossesA: number; lossesD: number;
  offers: PeaceOffer[];
}
export interface PeaceTerm { type: 'cede' | 'gold' | 'release' | 'vassal' | 'break_alliance' | 'faith' | 'humiliate' | 'white_peace' | 'independence' | 'concession'; locs?: number[]; amount?: number; nation?: number; from?: number; to?: number }
export interface PeaceOffer { from: number; to: number; terms: PeaceTerm[]; day: number; expires: number; concede?: boolean }

export interface Relation {
  op: number;      // opinion of a towards b (directional; stored per ordered pair)
  trust: number;   // slower-moving trust
  mods: { id: string; v: number; until: number }[];
}
export interface Treaty { a: number; b: number; type: 'alliance' | 'marriage' | 'access' | 'guarantee' | 'trade' | 'truce' | 'tribute' | 'claim'; since: number; until: number }

export interface Envoy { from: number; to: number; action: string; arrive: number; payload?: any }

export interface Market {
  id: number; name: string; hub: number; // hub location
  price: Float64Array; supply: Float64Array; demand: Float64Array; stock: Float64Array;
  sAcc: Float64Array; dAcc: Float64Array; // accumulators for current month
  hist: Float32Array; // G * 120 months ring
  histPos: number;
  owner: number; // nation controlling the hub
  links: { to: number; cost: number; sea: boolean; ocean?: boolean }[];  // ocean: crosses an ocean, closed until the New World is reached
  flowOut: Float64Array; // per good, last month's net exports
  merchants: Record<number, number>; // nation -> steering strength
  priceIndex: number;
  tierAcc?: Float64Array; // demand units per need tier (current month)
}
export interface TradeFlow { from: number; to: number; good: number; qty: number; value: number }

export interface PendingEvent { id: number; event: string; nation: number; day: number; expires: number; ctx: Record<string, number> }
export interface ChronEntry { day: number; text: I18n; nation: number; kind: string; loc?: number }
export interface Notice { id: number; day: number; nation: number; kind: string; text: I18n; loc?: number; army?: number; war?: number; event?: number }

export interface Construction { loc: number; building: number; left: number; nation: number; cost: number }
export interface Recruit { loc: number; nation: number; type: number; men: number; left: number; army: number }
export interface ConversionAgent { nation: number; loc: number; kind: 'faith' | 'culture'; progress: number }
export interface Colony { loc: number; nation: number; settlers: number; progress: number; started: number }
export interface Explorer { id: number; nation: number; loc: number; path: number[]; progress: number; fleet: boolean; char: number }
export interface Spy { nation: number; target: number; action: string; progress: number; days: number }

export interface LocState {
  owner: Int16Array; ctrl: Int16Array; core: Int16Array; // core: nation with established rule (integration complete)
  culture: Uint8Array; faith: Uint8Array; minCulture: Uint8Array; minFaith: Uint8Array; minShare: Float32Array;
  pop: Float32Array;     // L*C
  wealth: Float32Array;  // L*C savings per capita
  sol: Float32Array;     // L*C standard of living 0..1 (needs fulfilment)
  employed: Float32Array; // L*C employment rate
  literacy: Float32Array; dev: Float32Array; control: Float32Array; integ: Float32Array; unrest: Float32Array;
  devast: Float32Array; harvest: Float32Array; buildings: Uint8Array; // L*B levels
  workshop: Uint8Array;  // L*3 recipe index+1 (0 none)
  method: Uint8Array;    // production method per location
  garrison: Float32Array; occTimer: Float32Array; plague: Float32Array; // plague intensity 0..1
  market: Uint8Array;
  fortZone: Int16Array; // nation whose fort projects ZOC here (-1 none) – recomputed
  income: Float32Array; // tax income last month per location
  snow: Float32Array;   // current snow cover 0..1 (climate model)
  colonist: Int16Array; // nation colonising this location, -1
  migr: Float32Array;   // people who moved in (+) or out (−) last month (systems/administration.ts)
  migrBal: Float32Array; // newcomers (+) or leavers (−) of the last decades as a share of the peasants and labourers, fading (crowding)
}

export interface Empire { emperor: number; electors: number[]; authority: number; reforms: string[]; diet: { proposal: string; votesFor: number[]; votesAgainst: number[]; ends: number } | null; lastElection: number; members: number[] }
export interface Papacy { holder: number; seat: number; antipope: number; curiaFavour: Record<number, number>; schism: boolean; reformPressure: number; corruption: number }
export interface League { id: string; name: I18n; members: number[]; leader: number; strength: number; markets: number[] }

export interface Situation { id: string; active: boolean; progress: number; stage: number; started: number; ended?: number; outcome?: string; data: Record<string, any> }

export interface ReplayLog { seed: number; year: number; player: number | null; difficulty?: number; devtools?: boolean; log: [number, Command | { t: '__player'; player: number | null }][] }
export interface GameState {
  v: number; seed: number; startYear: number; day: number; rng: number[];
  nextId: number;
  loc: LocState;
  nations: Nation[];
  chars: Record<number, Character>;
  armies: Army[]; battles: Battle[]; sieges: Siege[];
  wars: War[];
  rel: Record<string, Relation>;   // `${a}>${b}`
  treaties: Treaty[];
  envoys: Envoy[];
  markets: Market[]; flows: TradeFlow[];
  constructions: Construction[]; recruits: Recruit[]; agents: ConversionAgent[]; colonies: Colony[]; explorers: Explorer[]; spies: Spy[];
  explored: Record<number, Uint8Array>; // knowledge group/nation -> bitset over N locations
  empire: Empire; papacy: Papacy; leagues: League[];
  situations: Situation[];
  innovations: { id: number; key: string; origin: number; day: number; reached: Uint8Array }[]; // reached: per location bitmask 0/1
  pending: PendingEvent[];
  chronicle: ChronEntry[];
  notices: Notice[];
  ranking: number[];      // great power ranking (top nations)
  priceLevel: number;     // global price index (money supply)
  silverStock: number;    // money in circulation (abstract)
  ended: boolean; victory?: { nation: number; kind: string };
  flags: Record<string, number>;
  /** chartered overseas trade companies: a direct route between an overseas market and the home market */
  companies?: { nation: number; market: number; home: number; since: number; name: { en: string; de: string } }[];
  /** Single player: how the game was started and every command with the day it was given, so it can be replayed. */
  replay?: ReplayLog;
  playerNations: number[]; // nations controlled by humans
  observer: boolean;
  aiDisabled: number[];
  difficulty: number;
  timelapse: { day: number; owners: Uint16Array }[]; // yearly snapshots of location owners for timelapse
  /** landmarks: stage reached, building work (finish day or 0) and the realm that last held each */
  landmarks?: { id: string; loc: number; tier: number; work: number; holder: number }[];
}

export type Command =
  | { t: 'move'; n: number; army: number; to: number }
  | { t: 'merge'; n: number; armies: number[] }
  | { t: 'split'; n: number; army: number }
  | { t: 'recruit'; n: number; loc: number; unit: number; men: number }
  | { t: 'mercs'; n: number; loc: number; company: number }
  | { t: 'disband'; n: number; army: number }
  | { t: 'general'; n: number; army: number; char: number }
  | { t: 'build'; n: number; loc: number; building: number }
  | { t: 'landmark'; n: number; id: string }
  | { t: 'declare'; n: number; target: number; goal: WarGoal['type']; locs?: number[] }
  | { t: 'peace'; n: number; war: number; to: number; terms: PeaceTerm[]; concede?: boolean }
  | { t: 'peace_answer'; n: number; war: number; offer: number; accept: boolean }
  | { t: 'diplo'; n: number; action: string; target: number; payload?: any }
  | { t: 'law'; n: number; law: string; option: number }
  | { t: 'estate'; n: number; estate: string; action: string; privilege?: string }
  | { t: 'tax'; n: number; cls: number; rate: number }
  | { t: 'budget'; n: number; key: string; value: number }
  | { t: 'event'; n: number; pending: number; choice: number }
  | { t: 'tech'; n: number; branch: number }
  | { t: 'doctrine'; n: number; group: string }
  | { t: 'agent'; n: number; loc: number; kind: 'faith' | 'culture' }
  | { t: 'colonize'; n: number; loc: number }
  | { t: 'charter'; n: number; market: number }
  | { t: 'explore'; n: number; fleet: number; to: number }
  | { t: 'spy'; n: number; target: number; action: string }
  | { t: 'office'; n: number; office: string; char: number }
  | { t: 'loan'; n: number; take: boolean; amount: number }
  | { t: 'merchant'; n: number; market: number; amount: number }
  | { t: 'integrate'; n: number; subject: number }
  | { t: 'orders'; n: number; orders: StandingOrders }
  | { t: 'decision'; n: number; id: string }
  | { t: 'workshop'; n: number; loc: number; slot: number; recipe: number }
  | { t: 'method'; n: number; loc: number; method: number }
  | { t: 'embark'; n: number; army: number; fleet: number }
  | { t: 'goal'; n: number; id: string }                       // claim a goal whose conditions hold now
  | { t: 'cancel'; n: number; kind: 'build' | 'recruit'; loc: number; item: number; nth?: number } // stop a construction or a levy (item: building or unit; nth: which of the realm's orders for that place and item, in queue order from 0; without it the newest)
  | { t: 'batch'; n: number; cmds: Command[] }                  // many build / recruit / agent orders at once (province, area, realm)
  | { t: 'dev'; n: number; action: string; payload?: any }; // developer tools (single player / admin only)

/** err: the refusal as an English key (src/sim/refusals.ts gives both languages); msg: set when the refusal names a realm or an estate. */
export interface CmdResult { ok: boolean; err?: string; msg?: I18n; done?: number }
