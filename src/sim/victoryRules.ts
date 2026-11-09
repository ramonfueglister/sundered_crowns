// The kinds of victory and their thresholds (spec point 84), without dependencies so that the interface can show them
// (src/ui/panels/victory.tsx). The checks live in systems/victory.ts.
export const VICTORY_KINDS = ['score', 'hegemony', 'learning', 'commerce', 'faith'] as const;
export type VictoryKind = (typeof VICTORY_KINDS)[number];
/** Years a condition must be held without a break. */
export const VICTORY_YEARS = 10;
/** The thresholds of each condition (shown in the victory panel). */
export const VICTORY_RULES = {
  /** share of Europe's development held by the realm and its subjects (tributaries not counted) */
  hegemony: { share: 0.25 },
  /** learning points at least this multiple of the next realm's, and at least this many landmark stages and this era */
  learning: { lead: 1.25, stages: 6, era: 2 },
  /** share of all trade profits, tariffs and company profits in the world, as one of the great powers */
  commerce: { share: 0.2 },
  /** share of Europe's development whose people follow the realm's faith, and the realm leads that faith */
  faith: { share: 0.8 },
} as const;
