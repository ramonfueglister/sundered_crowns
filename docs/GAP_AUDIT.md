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
| 7 | 36, 40, 21, 46, 18 | 20 effect keys that nothing reads are still shown as bonuses. Several laws, values, traditions and production methods do nothing, and `adminCapacity` is never read. | M | open |
| 8 | 41, 86 | Council offices: chancellor, treasurer and marshal have no effect, although the UI shows a bonus. Advisors do not affect research. | S | open |
| 9 | 47, 48, 27, 54 | Merchants barely matter (`shareOut` ignores them). Trade flows are never shown. The trade legend is empty. The price, production and supply map modes are missing. Embargo is never set. | L | open |
| 10 | 91, 94 | The player has no UI for explore or charter. Companies and exploration are AI only. | S-M | open |
| 11 | 17, 65, 66, 70 | `riverCrossing()` always returns false. Scorched earth and blockade flags are never set. Supply and attrition are invisible. | M | open |
| 12 | 60, 83 | The Empire and great powers have no consequences: excommunication, the diet, imperial authority, elector votes, leagues (no Hanse) and interventions are all unused. | L | open |
| 13 | 36, 39, 95 | Government forms and estates are shallow: republics hold no elections and the diet does not approve taxes. `war_vote` binds only the AI. The estate-crisis notice shows raw ids. | M-L | open |
| 14 | 81 | Situations are only progress bars, with no participants and no player actions. | M | open |
| 15 | 43, 44, 50, 76 | There is no migration. Conquered land pays in full at once because integration does not affect income. There are few tax instruments and no budget forecast. | M | open |
| 16 | 99, 95 | The AI never uses espionage, conversion, privileges, offices, merchants, tariffs, coinage or assaults. | M | open |
| 17 | 37, 38, 68 | Characters are generic: 10 English general names, no commander picker, and consorts all come from "noble house". | M | open |
| 18 | 104-106 | Online: no server-side fog of war, no moderation, and no catch-up summary for returning players. | M-L | open |
| 19 | 84, 85 | There is only a score victory. The end screen has no graphs and the chronicle cannot be exported. | S-M | open |
| 20 | 4, 110 | Settings lack key bindings, a colour-blind palette and resolution scaling. The dev panel is thin. | S-M | open |

The full report with file:line evidence is in the session's audit agent output. It is summarised here so that later work can be checked off against it.
