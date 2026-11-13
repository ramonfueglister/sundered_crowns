// The hooks through which the Empire and the assemblies weigh in on a war (see warHooks). No run-time imports.
import type { GameState, War, WarGoal } from '../types';
import type { World } from '../world';

/** The bodies of the realm that weigh in on a war: the Empire's peace and the assemblies before it is declared, the
 *  emperor's defence and the league after. Set by systems/empire.ts, so that war.ts does not import it. The hooks live in
 *  this module of their own, which imports nothing at run time: the Empire sets them while its module loads, and
 *  war.ts may be still loading then (war.ts reaches the economy, the economy the military and diplomacy, and those
 *  the Empire). */
export const warHooks: {
  veto?: (s: GameState, w: World, a: number, b: number, goal: WarGoal['type']) => string | null;
  /** The same refusal without side effects (no assembly is held): the AI drops the targets it would be refused. */
  check?: (s: GameState, w: World, a: number, b: number, goal: WarGoal['type']) => string | null;
  declared?: (s: GameState, w: World, war: War) => void;
  /** A realm joined the attackers of a war (an ally's call): the emperor attacking a member pays in authority. */
  joined?: (s: GameState, w: World, war: War, n: number) => void;
  /** Who the Empire's bodies would send to the defence of b (the emperor, the circles, the league), for predictSides. */
  predict?: (s: GameState, w: World, a: number, b: number, goal: WarGoal['type'], att: number[], def: number[]) => { id: number; role: 'emperor' | 'league' | 'circle'; odds: number | null }[];
} = {};
