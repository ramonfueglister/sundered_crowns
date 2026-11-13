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
  xp?: number;       // a commander's experience of battle (systems/commanders.ts)
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
  // fix-econ: money that moved through the chest without being income or spending (loans taken and repaid, a bankrupt
  // crown's deficit written off, other movements found at the close); last month and the current month (systems/economy.ts)
  credit?: LedgerEntry; creditAcc?: LedgerEntry;
  history: { day: number; treasury: number; income: number; expense: number; manpower: number; locs: number; pop: number; dev: number; army?: number; score?: number }[];
  armyMaint: number; navyMaint: number; // 0.25..1 spending sliders
  // politics
  laws: Record<string, number>;     // law id -> option index
  reform?: { law: string; option: number; left: number }; // ongoing reform (days)
  values: number[];                 // society value axes -100..100
  estates: Estate[];
  council: Record<string, number>;  // office -> character id
  candidates?: number[];           // character ids at court who could be appointed to an office (missing in older saves)
  generals?: number[];             // the realm's generals and admirals, leading an army or not (systems/commanders.ts)
  aiLog?: AiLogEntry[];            // the AI's last decisions, newest last (systems/ai_log.ts; missing in older saves)
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
  // ---- realm pass (systems/government.ts): optional so that older saves load
  /** a privilege an estate demands, until a day (granted or refused by the ruler; refused when it lapses) */
  demand?: { estate: string; privilege: string; until: number } | null;
  /** candidates for the next election of the head of the realm (character ids), and whom the crown backs */
  electCands?: number[]; backed?: number;
}
/** One decision of the AI: the day, the command it gave (trimmed) and why, as a key of systems/ai_log.ts. */
export interface AiLogEntry { d: number; c: Partial<Command> & { t: Command['t'] }; y?: string }
export interface StandingOrders { defendOnly: boolean; balanceBudget: boolean; acceptPeaceBelow: number; autoBuild: boolean; autoRecruit: boolean }
export interface PlannedAction { day: number; cmd: Command }
export interface Modifier { id: string; until: number; label: I18n; effects: Record<string, number> }
export interface Loan { amount: number; rate: number; due: number; lender: string }

export interface Regiment { type: number; men: number; max?: number }  // ships: men = number of ships; max: full strength the regiment refills to (systems/military.ts reinforceMonth)
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
  prevLoc?: number;   // where the army came from on its last step (a river between the two makes an attack a river crossing)
}

export interface Battle {
  id: number; loc: number; day0: number; phase: number; days: number;
  att: number[]; def: number[];   // army ids
  attNation: number; defNation: number;
  lossA: number; lossD: number; startA: number; startD: number;
  log: string[]; naval: boolean; river: boolean;
  rep?: BattleRep;    // the report being written while the battle lasts (systems/military.ts)
}
/** One side of a battle report: commanders, troops by type at the start and end, the strength and its parts. */
export interface BattleSideRep {
  nation: number; rebels: boolean; armies: number[];
  generals: { name: string; skill: number }[];
  troops: { type: number; start: number; end: number }[];
  morale0: number; morale: number;          // average morale at the start and at the end
  parts: [string, number][];                // what made the side strong or weak on the first day (factors, product)
  mods: [string, number][];                 // unit-mix effects (cavalry in the open, pikes against horse, guns against walls)
  broke?: boolean; routed?: boolean;        // its morale broke (it retreated), and it was routed (extra losses in pursuit)
}
export interface BattleRep {
  id: number; loc: number; day0: number; day1: number; naval: boolean; river: boolean; terrain: string; snow: number; fort: number;
  att: BattleSideRep; def: BattleSideRep;
  days: { day: number; phase: number; lossA: number; lossD: number; moraleA: number; moraleD: number }[];
  lossA: number; lossD: number; pursuit: number; winner: 'att' | 'def' | ''; reasons: string[]; wars: number[];
}

export interface Siege { loc: number; nation: number; progress: number; days: number; garrison: number; breach: number; blockade: boolean; log: string[]; garrison0?: number; lastAssault?: number } // log: 'day:kind' entries (older saves: 'kind')

export interface WarGoal { type: 'conquest' | 'throne' | 'faith' | 'independence' | 'coalition' | 'rebels' | 'trade' | 'reconquest' | 'subjugate' | 'civil_war' | 'humiliate'; target: number; locs: number[]; cb?: string }
export interface War {
  id: number; name: I18n; att: number[]; def: number[]; attLead: number; defLead: number;
  goal: WarGoal; start: number; score: number; // + favours attackers, -100..100
  battleScore: number; tickScore: number; battles: number; lossesA: number; lossesD: number;
  offers: PeaceOffer[];
  blockScore?: number; // war score from blockaded ports (systems/war.ts blockadeMonth)
  /** Every battle that moved this war's battle score (systems/war.ts warScoreEvent), newest last, at most BATTLE_LOG_KEPT;
   *  older ones are summed in battleLogRest, so the log and the rest always add up to battleScore. */
  battleLog?: WarBattle[]; battleLogRest?: { n: number; score: number };
}
/** One battle in a war's log: winner and loser realms, losses, the war score it moved (from the attackers' side, after
 *  the ±40 cap) and what it would have moved without the cap (systems/war.ts battleWorth); report: the full report,
 *  when one was kept. */
export interface WarBattle { day: number; loc: number; naval: boolean; win: number; lose: number; lossW: number; lossL: number; side: number; score: number; raw: number; report?: number } // side: the losing side's men before the battle
export interface PeaceTerm {
  type: 'cede' | 'gold' | 'release' | 'vassal' | 'break_alliance' | 'faith' | 'humiliate' | 'white_peace' | 'independence' | 'concession'
    | 'convert' | 'throne' | 'trade_rights' | 'end_embargo' | 'tariff_cut' | 'expel_merchants' | 'reparations' | 'end_rivalry';
  locs?: number[]; amount?: number; nation?: number; from?: number; to?: number; mode?: 'union' | 'claimant';
}
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
  merchants: Record<number, number>; // nation -> merchants placed here (systems/trade.ts)
  priceIndex: number;
  tierAcc?: Float64Array; // demand units per need tier (current month)
  // trade pass (systems/trade.ts): steering, and last month's trade for the panels and the AI
  steer?: Record<number, number>;   // nation -> 1 when its merchants here steer the trade to its home market
  tv?: number;                      // trade value earned here last month (margins of the goods exported from here)
  tin?: number;                     // trade steered in from other markets last month
  paid?: Record<number, number>;    // what each realm took here last month (own share and share of the trade steered in)
  steered?: Record<number, number>; // what each steering realm sent home from here last month
  deter?: number;                   // value of imports the ruler's tariff kept out last month
  // fix-econ: what of paid was each realm's share of this market's own trade, and the trade steered in by its source market
  own?: Record<number, number>; tinFrom?: Record<number, number>;
  // fix-econ: per good, what last month's clearing counted: the half of the stock offered with the month's goods, and
  // the people's demand (the rest of demand is workshops, households and armies)
  held?: Float32Array; dPeople?: Float32Array;
  deterBy?: Record<number, [number, number]>; // fix-econ: per good, [value kept out by the tariff, margin of that part]
}
export interface TradeFlow { from: number; to: number; good: number; qty: number; value: number; venture?: number /* the realm whose venture carried it */ }
/** A trading venture (systems/ventures.ts): a realm's merchant house carries one good from one market to another, as
 *  much as its loads of cargo space allow and the two markets bear. The figures after `since` are last month's. */
export interface Venture {
  n: number; good: number; from: number; to: number; loads: number; since: number;
  qty?: number; margin?: number; profit?: number; crown?: number; tolls?: number; bound?: VentureBound; idle?: number;
}
export type VentureBound = 'loads' | 'supply' | 'demand' | 'margin' | 'blocked';

export interface PendingEvent { id: number; event: string; nation: number; day: number; expires: number; ctx: Record<string, number> }
export interface ChronEntry {
  day: number; text: I18n; nation: number; kind: string; loc?: number;
  /** the other realms the entry concerns (every side of a war, both crowns of a union, both parties of a treaty) */
  also?: number[];
}
export interface Notice { id: number; day: number; nation: number; kind: string; text: I18n; loc?: number; army?: number; war?: number; event?: number; report?: number; reasons?: [string, number][]; reasonsTitle?: string /* UI text key heading the reasons (default: their answer) */ }

export interface Construction { loc: number; building: number; left: number; nation: number; cost: number; level?: number /* the level it builds, from 0 */; pace?: number /* days of work done a day: what the market supplies of the materials */ }
export interface Recruit { loc: number; nation: number; type: number; men: number; left: number; army: number }
export interface ConversionAgent { nation: number; loc: number; kind: 'faith' | 'culture'; progress: number }
export interface Colony { loc: number; nation: number; settlers: number; progress: number; started: number }
export interface Explorer {
  id: number; nation: number; loc: number; path: number[]; progress: number; fleet: boolean; char: number;
  // expeditions (systems/colonial.ts): target sea zone, start day, places charted, of them on land, realms met and goods seen
  to?: number; since?: number; found?: number; lands?: number; met?: number[]; goods?: number[];
}
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

export interface Empire {
  emperor: number; electors: number[]; authority: number; reforms: string[];
  /** a session of the diet: the reform proposed, the members' votes (cast by the player; the AI votes at the close) and the closing day */
  diet: { proposal: string; votesFor: number[]; votesAgainst: number[]; ends: number; by?: number } | null;
  lastElection: number; members: number[];
  // ---- realm pass (systems/empire.ts); optional so that older saves load (created when first needed)
  /** an open imperial election: candidates (realms), the votes cast so far (elector → candidate realm), closing day */
  election?: { opened: number; closes: number; candidates: number[]; votes: Record<number, number>; late: number } | null;
  /** favour bought with electors and diet members: `${candidate}>${voter}` → points (fades yearly) */
  favour?: Record<string, number>;
  /** what moved imperial authority this year and last, by cause (for the breakdown) */
  authLog?: Record<string, number>; authLast?: Record<string, number>;
  /** calls to the emperor to defend a member (war id, member, attacker, deadline, answer: 1 joined, -1 refused, 0 open;
   *  rows: the reasons he weighed when he answered) */
  calls?: { war: number; member: number; attacker: number; until: number; answer: number; rows?: [string | I18n, number][] }[];
  /** the emperor's orders to make peace between members (war id, deadline, answer as above) */
  orders?: { war: number; to: number; until: number; answer: number }[];
  /** member land last month (1 = held by a member): land lost to outsiders lowers authority */
  land?: Uint8Array;
  lastDiet?: number;
}
export interface Papacy { holder: number; seat: number; antipope: number; curiaFavour: Record<number, number>; schism: boolean; reformPressure: number; corruption: number }
export interface League {
  id: string; name: I18n; members: number[]; leader: number; strength: number; markets: number[];
  /** Calls to arms to human members (an AI member answers at once): join the defence of a member town, or stay out. */
  calls?: { war: number; member: number; attacker: number; to: number; until: number }[];
}

export interface Situation { id: string; active: boolean; progress: number; stage: number; started: number; ended?: number; outcome?: string; data: Record<string, any> }

export interface ReplayLog { seed: number; year: number; player: number | null; difficulty?: number; devtools?: boolean; victory?: string[]; log: [number, Command | { t: '__player'; player: number | null }][] }
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
  ended: boolean; victory?: { nation: number; kind: string; day?: number };
  /** polish pass: the kinds of victory chosen at the start (systems/victory.ts; absent: score only) and who holds each condition since when */
  victoryKinds?: string[];
  victoryHold?: Record<string, { nation: number; since: number }>;
  /** polish pass: events of absent online players that the court decided after the deadline (newest last, capped) */
  autoEvents?: { nation: number; day: number; event: string; title: I18n; option: I18n; loc?: number }[];
  flags: Record<string, number>;
  /** chartered overseas trade companies: a direct route between an overseas market and the home market */
  ventures?: Venture[];
  companies?: { nation: number; market: number; home: number; since: number; name: { en: string; de: string }; income?: number }[];
  /** Single player: how the game was started and every command with the day it was given, so it can be replayed. */
  replay?: ReplayLog;
  playerNations: number[]; // nations controlled by humans
  observer: boolean;
  aiDisabled: number[];
  difficulty: number;
  timelapse: { day: number; owners: Uint16Array }[]; // yearly snapshots of location owners for timelapse
  /** landmarks: stage reached, building work (finish day or 0) and the realm that last held each */
  landmarks?: { id: string; loc: number; tier: number; work: number; holder: number }[];
  /** reports of the last battles (every battle a human realm fought in, and the great ones), newest last */
  battleReports?: BattleRep[];
  /** great powers (systems/powers.ts): yearly scores of the last 11 years, requests for protection, interventions */
  powers?: {
    scores: Record<number, number[]>; petitions: { from: number; to: number; until: number }[]; log: { day: number; gp: number; war: number; kind: string; side: number }[];
    /** Mediation offered to a human war leader (an AI leader answers at once): accept for a white peace, or refuse. */
    offers?: { gp: number; war: number; to: number; until: number }[];
  };
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
  | { t: 'explore'; n: number; fleet: number; to: number }  // fleet 0: fit out a new squadron in our best harbour
  | { t: 'spy'; n: number; target: number; action: string }
  | { t: 'office'; n: number; office: string; char: number }
  | { t: 'loan'; n: number; take: boolean; amount: number }
  | { t: 'merchant'; n: number; market: number; amount: number; steer?: boolean } // merchants kept in a market; steer: send its trade home
  | { t: 'venture'; n: number; from: number; to: number; good: number; loads: number } // open, resize (loads) or close (loads 0) a trading venture
  | { t: 'integrate'; n: number; subject: number }
  | { t: 'orders'; n: number; orders: StandingOrders }
  | { t: 'decision'; n: number; id: string }
  | { t: 'workshop'; n: number; loc: number; slot: number; recipe: number }
  | { t: 'method'; n: number; loc: number; method: number }
  | { t: 'embark'; n: number; army: number; fleet: number }
  | { t: 'assault'; n: number; army: number }                 // storm the walls of the place the army besieges (systems/military.ts assault)
  | { t: 'scorch'; n: number; loc: number }                   // scorched earth in our own land before an invader (systems/military.ts scorchEarth)
  | { t: 'goal'; n: number; id: string }                       // claim a goal whose conditions hold now
  | { t: 'cancel'; n: number; kind: 'build' | 'recruit'; loc: number; item: number; nth?: number } // stop a construction or a levy (item: building or unit; nth: which of the realm's orders for that place and item, in queue order from 0; without it the newest)
  | { t: 'batch'; n: number; cmds: Command[] }                  // many build / recruit / agent orders at once (province, area, realm)
  | { t: 'dev'; n: number; action: string; payload?: any } // developer tools (single player / admin only)
  // ---- realm pass: the Empire, the league, great powers, assemblies, elections, situations
  | { t: 'empire'; n: number; action: 'vote' | 'campaign' | 'defend' | 'refuse' | 'order_peace' | 'comply' | 'summon_diet' | 'diet_vote' | 'ask_help'; target?: number; war?: number; yes?: boolean }
  | { t: 'league'; n: number; action: 'join' | 'leave' | 'answer_call'; war?: number; yes?: boolean }
  | { t: 'powers'; n: number; action: 'intervene' | 'mediate' | 'seek_protection' | 'protect' | 'decline' | 'accept_mediation' | 'refuse_mediation'; target?: number; war?: number }
  | { t: 'assembly'; n: number; kind: 'tax' | 'war'; cls?: number; rate?: number; duty?: string; value?: number; target?: number; goal?: WarGoal['type']; bribe?: string[]; concede?: string }
  | { t: 'govern'; n: number; action: 'back' | 'grant_demand' | 'refuse_demand'; char?: number }
  | { t: 'situation'; n: number; id: string; action: string; target?: number };

/** err: the refusal as an English key (src/sim/refusals.ts gives both languages); msg: set when the refusal names a realm or an estate. */
export interface CmdResult { ok: boolean; err?: string; msg?: I18n; done?: number }
