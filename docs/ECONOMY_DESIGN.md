# Economy design

The economy is designed together with Ramon, one topic at a time. A topic is built only once it is agreed here.
Status per topic: **open** (proposal on the table), **agreed** (ready to build), **built**.

| # | Topic | Status |
|---|---|---|
| 1 | Goods and estates | open |
| 2 | Needs | – |
| 3 | Production and firms | – |
| 4 | Markets and prices | – |
| 5 | Trade between markets | – |
| 6 | Money, the crown and taxes | – |

Principles (proposed with topic 1):
- Every number can be broken down in a tooltip.
- Deterministic and computed on the world server as systems over component arrays (docs/ARCHITECTURE.md).
- Players and the AI of realms without a player act through the same commands.

## 1. Goods and estates (open)

**Goods.** The map knows 28 natural resources (grain, livestock, fish, timber, wool, flax, cotton, furs, horses, honey,
salt, stone, iron ore, copper, tin, gold, silver, saltpeter, alum, amber, grapes, olives, dyes, silk, spices,
sugarcane, tobacco, coffee). Proposal: about 40 goods in three tiers:
- raw: the 28 from the map
- processed: flour, cloth, linen, leather, iron, planks, bricks, …
- finished and luxury: bread, beer, wine, clothing, tools, furniture, jewellery, fine cloth, …

**Estates.** One population group per estate in every place: peasants, labourers, artisans, burghers and merchants,
nobility, clergy. A group has its head count, its own money and a standard of living. About 15,000 places × 6 estates
≈ 90,000 groups.

**Money.** Proposal: a closed circulation. Every coin is held by someone (a group, a firm, a merchant, a crown); money
is created only by minting gold and silver. Wages, purchases, taxes and profits are transfers.

Open questions to Ramon:
1. About 40 goods, or leaner (~25) or deeper (~60)?
2. Are the six estates right, or are some missing (serfs, slaves, Jewish communities as their own estate, mercenaries)?
3. Closed circulation of money: yes or no?
4. Scale (raised by Ramon on 14 November: the simulation itself reckons with scaled-down quantities, as in a diorama).
   Proposal: one model rule for all quantities, e.g. 1 : 100 (Paris 258,825 → about 2,600 people, the whole map about 1.5 million;
   goods and money in the same proportion). Which factor: 1 : 100, 1 : 1,000, or a fixed size per place type?
