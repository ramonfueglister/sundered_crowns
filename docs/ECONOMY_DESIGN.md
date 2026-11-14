# Economy design

The economy is designed together with Ramon, one topic at a time. A topic is built only once it is agreed here.
Status per topic: **open** (proposal on the table), **agreed** (ready to build), **built**.

| # | Topic | Status |
|---|---|---|
| 1 | Goods and estates | agreed (14 Nov 2026) |
| 2 | Needs | open |
| 3 | Production and firms | – |
| 4 | Markets and prices | – |
| 5 | Trade between markets | – |
| 6 | Money, the crown and taxes | – |

Principles (proposed with topic 1):
- Every number can be broken down in a tooltip.
- Deterministic and computed on the world server as systems over component arrays (docs/ARCHITECTURE.md).
- Players and the AI of realms without a player act through the same commands.

## 1. Goods and estates (agreed 14 November 2026)

- **Scale 1 : 100** for people, goods and money alike (a diorama): Paris starts with about 2,600 people instead of
  258,825, the whole map with about 1.5 million instead of 150 million. The interface shows these numbers as they are.
- **About 40 goods** in three tiers. Raw: the 28 resources of the map (grain, livestock, fish, timber, wool, flax,
  cotton, furs, horses, honey, salt, stone, iron ore, copper, tin, gold, silver, saltpeter, alum, amber, grapes, olives,
  dyes, silk, spices, sugarcane, tobacco, coffee). Processed: flour, cloth, linen, leather, iron, planks, bricks, … .
  Finished and luxury: bread, beer, wine, clothing, tools, furniture, jewellery, fine cloth, … . The exact list follows
  with topic 3 (production), where each good needs a maker.
- **Six estates** in every place, each a population group with head count, money and standard of living: peasants,
  labourers, artisans, burghers and merchants, nobility, clergy.
- **Closed circulation of money**: every coin is held by someone (a group, a firm, a merchant, a crown); money is
  created only by minting gold and silver and leaves only by wear and hoarding. Wages, purchases, taxes and profits are
  transfers between holders.

## 2. Needs (open)

**Three tiers per estate.** Every group wants, per head and month (in model units at 1 : 100):
- *Subsistence*: food, clothing, fuel.
- *Everyday*: drink, salt, household goods, tools, better clothing.
- *Luxury*: spices, fine cloth, wine, jewellery, books, … .
How much each estate wants of each tier differs: peasants mainly subsistence, burghers everyday, nobility and clergy
much luxury.

**Needs are categories, goods are substitutes.** "Food" can be met by bread, grain, fish or meat; "drink" by beer or
wine. Within a category a group buys the cheapest good per unit of benefit, weighted by preference: culture and faith
shape the weights (wine in the south, beer in the north, no wine where Islam forbids it), so the same price moves
different peoples differently.

**Buying order.** A group spends its money tier by tier: subsistence first, then everyday, then luxury; what is left is
saved. When money is short, luxury goes first; when goods are short, prices rise (topic 4) until the poorest drop out.

**Fulfilment and standard of living.** For each tier, fulfilment f = bought / wanted (0 … 1). Standard of living
S = f₁ · (0.5 + 0.3 · f₂ + 0.2 · f₃), so nothing makes up for hunger. S drives what later topics build on: growth and
deaths, unrest, and migration to better places.

Open questions to Ramon:
1. Three tiers, as above?
2. Categories with substitute goods, with preferences by culture and faith?
3. Standard of living as the lever for growth, unrest and migration?
