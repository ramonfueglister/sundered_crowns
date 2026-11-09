# Gap audit (2026-11-09)

This is an independent, code-verified audit against the 120-point spec, written after Ramon judged the game "not even close" to the reference genre level. It deliberately leaves out areas that were being reworked at the same time:
- faith mechanics, AI spending and historical plausibility (claude/depth-pass);
- breakdown tooltips, panel polish and onboarding (claude/ui-pass);
- 3D map, figures, weather, roads, battle and siege visuals (claude/game-foundation, claude/models-pass).

Status values: open, fixed (commit) or in progress (branch).

| # | Spec | Gap | Size | Status |
|---|------|-----|------|--------|
| 1 | 57, 58, 61 | Wars need no preparation. A free rivalry is a casus belli. The player's declare sends no target locations, so their war score runs on worse rules than the AI's. Goals other than conquest only change the war's name. The peace panel offers no faith, throne or trade terms. The blockade war-score event is empty. | M | open |
| 2 | 22, 108, 58 | Everything is managed one location at a time across 15,220 locations. There are no province- or realm-level build or recruit actions. Peace demands are a flat list capped at 120. There is no box selection for armies. | L | open |
| 3 | 67, 69, 90 | Battles and sieges are a black box. The `lastBattle` summary with reasons is thrown away and the siege log never reaches the UI. `assault()` is never called. Morale and `enemyKinds` are unused in battle. | M | open |
| 4 | 82 | There are 195 goals, but no goals tab and no progress text; the player only sees a notice once a goal is achieved. | S-M | open |
| 5 | 37, 38 | A ruler who died in battle was never succeeded. | S | fixed (characterDies, tests/succession.test.ts) |
| 6 | 79 | Of 376 event options, only 2 have hints, so choices are blind. Option effects should be described automatically. | M | open |
| 7 | 36, 40, 21, 46, 18 | 20 effect keys that nothing reads are still shown as bonuses. Several laws, values, traditions and production methods do nothing, and `adminCapacity` is never read. | M | fixed (truth pass): every effect key is in the registry `src/sim/effects.ts` and read through `lawEffect` only, with no double counting. `tests/effects_wired.test.ts` checks the content against the registry and greps each reader. Group traditions apply. Office succession elects the ablest official. Production methods can be switched (command `method`, AI, location panel). Administrative capacity limits integration. Effect tooltips show only working effects, at their real size. Review fixes: the test now also collects keys with computed values (ternaries, `-x`, calls), scans `administration.ts` (only `adminInfo`'s view object is left out), strips comments before looking for a reader, and checks every key the effect table meets in a new game plus two simulated years. |
| 8 | 41, 86 | Council offices: chancellor, treasurer and marshal have no effect, although the UI shows a bonus. Advisors do not affect research. | S | fixed (truth pass): the treasurer raises tax yield and steals less the abler he is. The chancellor speeds envoys and improves opinion, answers and relations. The marshal adds discipline, morale and faster recruitment. Each office speeds research in its branch. All of this shows in the breakdown tooltips; tests are in `tests/truth_mechanics.test.ts`. |
| 9 | 47, 48, 27, 54 | Merchants barely matter (`shareOut` ignores them). Trade flows are never shown. The trade legend is empty. The price, production and supply map modes are missing. Embargo is never set. | L | open |
| 10 | 91, 94 | The player has no UI for explore or charter. Companies and exploration are AI only. | S-M | open |
| 11 | 17, 65, 66, 70 | `riverCrossing()` always returns false. Scorched earth and blockade flags are never set. Supply and attrition are invisible. | M | open |
| 12 | 60, 83 | The Empire and great powers have no consequences: excommunication, the diet, imperial authority, elector votes, leagues (no Hanse) and interventions are all unused. | L | open |
| 13 | 36, 39, 95 | Government forms and estates are shallow: republics hold no elections and the diet does not approve taxes. `war_vote` binds only the AI. The estate-crisis notice shows raw ids. | M-L | open |
| 14 | 81 | Situations are only progress bars, with no participants and no player actions. | M | open |
| 15 | 43, 44, 50, 76 | There is no migration. Conquered land pays in full at once because integration does not affect income. There are few tax instruments and no budget forecast. | M | fixed (truth pass): peasants and labourers migrate monthly toward better living (fewer across borders, none across a front). Taxes, levies and manpower scale with integration (×0.3 to ×1). Conquest resets control to at most 30 %. New tax instruments: land tax, hearth tax and excise, each with estate resentment, unrest, AI use and a slider. The economy panel has a 12-month budget forecast. Review fixes: land that returns to its own crown (end of a civil war, crown land passed to its colonial realm) keeps its integration and control, and annexed or united land is not capped at 30 % control; over-extension slows integration once (through the share of the capacity, never below a quarter), not a second time through control; legal exemptions (nobility, clergy, free towns) also apply to the three duties, the land tax of exempt lords falls on the peasants and the commons resent it, and the privilege "Exemption from the hearth tax" now frees the nobles of it; arrivals crowd a place (its pull falls with the share of newcomers), so migration moves a few percent and then dies down instead of draining poorer land; saves from before the truth pass load (save version 2). |
| 16 | 99, 95 | The AI never uses espionage, conversion, privileges, offices, merchants, tariffs, coinage or assaults. | M | open |
| 17 | 37, 38, 68 | Characters are generic: 10 English general names, no commander picker, and consorts all come from "noble house". | M | open |
| 18 | 104-106 | Online: no server-side fog of war, no moderation, and no catch-up summary for returning players. | M-L | open |
| 19 | 84, 85 | There is only a score victory. The end screen has no graphs and the chronicle cannot be exported. | S-M | open |
| 20 | 4, 110 | Settings lack key bindings, a colour-blind palette and resolution scaling. The dev panel is thin. | S-M | open |

The full report with file:line evidence is in the session's audit agent output. It is summarised here so that later work can be checked off against it.
