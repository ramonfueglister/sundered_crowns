// Seafaring and discovery: navigators, the African coast, a western route, the sea road to India,
// cartographers, new crops from across the Ocean, Muscovy beyond the Urals, natural philosophy.
import type { EventDef } from '../../systems/events';
import { H } from '../../systems/events';
import { BI } from '../../defs';
import { isKey, atlantic, hasCoast, settled, rich, eraAtLeast, newWorldKnown, christian, coastal, owns, nationByKey, muslim, est } from './util';

const IBERIAN_ATLANTIC = ['portugal', 'castile', 'aragon', 'england', 'france', 'genoa', 'scotland', 'brittany_montfort', 'holland', 'navarre'];

export const DISCOVERY_EVENTS: EventDef[] = [
  {
    id: 'navigators_school', art: 'ship',
    title: { en: 'A School of Navigators', de: 'Eine Schule der Seefahrer' },
    text: {
      en: 'A prince of the blood proposes to gather pilots, Jewish and Majorcan cartographers, astronomers and shipwrights at a cape facing the Ocean, to collect every rutter and chart, and to send out one ship each year a little further than the last.',
      de: 'Ein Prinz von Geblüt schlägt vor, an einem Kap über dem Ozean Lotsen, jüdische und mallorquinische Kartografen, Astronomen und Schiffbauer zu versammeln, jedes Segelhandbuch und jede Karte zu sammeln und jedes Jahr ein Schiff ein wenig weiter hinauszuschicken als das letzte.',
    },
    mtth: 60, oncePer: true, minYear: 1400, maxYear: 1550,
    trigger: (e) => settled(e) && atlantic(e) && christian(e),
    options: [
      { label: { en: 'Endow the school', de: 'Die Schule stiften' }, effect: (e) => { e.fx.gold(-3); e.fx.insight(6); e.fx.tech(1, 0.1); e.fx.value(4, 8); e.fx.modifier('navigators', 60, { en: 'School of navigators', de: 'Seefahrerschule' }, { colonial_range: 0.2 }); }, ai: (e) => (isKey(e, 'portugal') ? 1 : 0.6) },
      { label: { en: 'The Ocean is the edge of the world', de: 'Der Ozean ist das Ende der Welt' }, effect: (e) => { e.fx.value(4, -3); e.fx.estate('magnates', 2); }, ai: 0.2 },
    ],
  },
  {
    id: 'cape_bojador', art: 'ship', major: true, once: true, minYear: 1425, maxYear: 1460,
    title: { en: 'Beyond Cape Bojador', de: 'Jenseits von Kap Bojador' },
    text: {
      en: 'For years the captains of {ruler} turned back at Cape Bojador, where sailors said the sea boiled and no ship could return against the current. This year a squire sailed wide into the Ocean, came back with a sprig of rosemary from the far shore, and proved the fear false.',
      de: 'Jahrelang kehrten die Kapitäne von {ruler} am Kap Bojador um, wo, wie die Seeleute sagten, das Meer koche und kein Schiff gegen die Strömung zurückkehren könne. In diesem Jahr segelte ein Knappe weit in den Ozean hinaus, brachte einen Rosmarinzweig vom fernen Ufer mit und bewies, dass die Furcht grundlos war.',
    },
    mtth: 24,
    trigger: (e) => isKey(e, 'portugal') || (atlantic(e) && e.n.flags.ev_navigators_school !== undefined && e.year > 1440),
    options: [
      { label: { en: 'Press on down the coast', de: 'Weiter die Küste entlang vorstoßen' }, effect: (e) => { e.fx.gold(-1); e.fx.prestige(8); e.fx.modifier('african_coast', 40, { en: 'Charting the African coast', de: 'Kartierung der afrikanischen Küste' }, { colonial_range: 0.15, trade: 0.02 }); }, ai: 0.8 },
      { label: { en: 'Trade for gold and keep it secret', de: 'Um Gold handeln und es geheim halten' }, effect: (e) => { e.fx.gold(2); e.fx.estate('burghers', 4); }, ai: 0.4 },
    ],
  },
  {
    id: 'atlantic_islands', art: 'ship',
    title: { en: 'Islands in the Ocean Sea', de: 'Inseln im Ozeanischen Meer' },
    text: {
      en: 'A storm-driven caravel of {nation} has found an uninhabited island far out in the Ocean, covered in forest so dense that the settlers will have to burn it to plant. Pilots say there are more beyond.',
      de: 'Eine vom Sturm verschlagene Karavelle aus {nation} hat weit draußen im Ozean eine unbewohnte Insel gefunden, so dicht bewaldet, dass Siedler sie abbrennen müssen, um zu pflanzen. Die Lotsen sagen, dahinter lägen weitere.',
    },
    mtth: 60, oncePer: true, minYear: 1415, maxYear: 1520,
    trigger: (e) => settled(e) && atlantic(e) && e.n.capital >= 0 && e.w.lat[e.n.capital] < 45,
    options: [
      { label: { en: 'Grant captaincies to settlers', de: 'Siedlern Kapitanate verleihen' }, effect: (e) => { e.fx.gold(-1.5); e.fx.estate('magnates', 4); e.fx.modifier('island_settlers', 40, { en: 'Island captaincies', de: 'Inselkapitanate' }, { colonists: 1, colonial_growth: 0.1 }); }, ai: 0.7 },
      { label: { en: 'Plant sugar there with crown capital', de: 'Dort mit Kronkapital Zucker anbauen' }, effect: (e) => { e.fx.gold(-2); e.fx.estate('burghers', 5); e.fx.modifier('island_sugar', 40, { en: 'Island sugar', de: 'Inselzucker' }, { trade: 0.04 }); }, ai: 0.5 },
    ],
  },
  {
    id: 'western_route_proposal', art: 'ship', major: true,
    title: { en: 'The Mariner’s Enterprise', de: 'Das Unternehmen des Seefahrers' },
    text: {
      en: 'A Genoese mariner has laid before {ruler} a map, a copy of Ptolemy and a letter from a Florentine astronomer. The earth is smaller than the scholars say, he insists: sail west from the Canaries and in five weeks you reach Cipangu and the lands of the Great Khan. He asks for three ships, a title and a tenth of all he finds.',
      de: 'Ein genuesischer Seefahrer hat {ruler_dat} eine Karte, eine Ptolemäus-Ausgabe und einen Brief eines Florentiner Astronomen vorgelegt. Die Erde sei kleiner, als die Gelehrten sagen, beharrt er: Segle man von den Kanaren nach Westen, erreiche man in fünf Wochen Zipangu und die Länder des Großkhans. Er verlangt drei Schiffe, einen Titel und ein Zehntel von allem, was er findet.',
    },
    mtth: 36, oncePer: true, minYear: 1480, maxYear: 1530,
    trigger: (e) => !e.s.flags.west_route_found && (isKey(e, ...IBERIAN_ATLANTIC) || atlantic(e)) && settled(e) && christian(e),
    options: [
      { label: { en: 'Grant him three ships', de: 'Ihm drei Schiffe gewähren' }, effect: (e) => { e.fx.gold(-2); e.fx.worldFlag('west_route_found', e.s.day); e.fx.flag('west_route', 1); e.fx.prestige(10); e.fx.insight(5); e.fx.value(4, 10); e.fx.modifier('new_world_route', 80, { en: 'Route to the West', de: 'Westroute' }, { colonial_range: 0.4, colonists: 1 }); e.fx.chronicle({ en: `Ships of ${e.n.short.en} crossed the Ocean Sea to the west and found unknown lands.`, de: `Schiffe aus ${e.n.short.de} überquerten das Ozeanische Meer nach Westen und fanden unbekannte Länder.` }); }, ai: (e) => (isKey(e, 'castile', 'portugal', 'aragon') ? 0.9 : 0.5) },
      { label: { en: 'The scholars say his sums are wrong', de: 'Die Gelehrten sagen, seine Rechnung sei falsch' }, effect: (e) => { e.fx.gold(0.5); e.fx.insight(1); e.fx.value(4, -2); }, ai: 0.3 },
    ],
  },
  {
    id: 'cape_good_hope', art: 'storm', major: true, once: true, minYear: 1480, maxYear: 1520,
    title: { en: 'The Cape of Storms', de: 'Das Kap der Stürme' },
    text: {
      en: 'Driven south for thirteen days by a gale, the captain of {ruler} turned east and found no land; turning north, he struck a coast that ran north-east. He has rounded the end of Africa. The ruler names it the Cape of Good Hope, for the hope of India it opens.',
      de: 'Dreizehn Tage lang von einem Sturm nach Süden getrieben, wandte sich der Kapitän von {ruler} nach Osten und fand kein Land; als er nach Norden drehte, stieß er auf eine Küste, die nach Nordosten verlief. Er hat das Ende Afrikas umrundet. Der Herrscher nennt es Kap der Guten Hoffnung, wegen der Hoffnung auf Indien, die es eröffnet.',
    },
    mtth: 24,
    trigger: (e) => settled(e) && atlantic(e) && (e.n.flags.ev_cape_bojador !== undefined || (isKey(e, 'portugal') && e.year > 1485)),
    options: [
      { label: { en: 'Prepare a fleet for India', de: 'Eine Flotte für Indien rüsten' }, effect: (e) => { e.fx.gold(-2); e.fx.prestige(8); e.fx.flag('cape_route'); e.fx.modifier('cape_route', 60, { en: 'The Cape route', de: 'Die Kaproute' }, { colonial_range: 0.2 }); }, ai: 0.9 },
      { label: { en: 'Consolidate the Guinea trade first', de: 'Zuerst den Guineahandel festigen' }, effect: (e) => { e.fx.gold(1.5); e.fx.estate('burghers', 4); }, ai: 0.2 },
    ],
  },
  {
    id: 'india_sea_route', art: 'ship', major: true, once: true, minYear: 1490, maxYear: 1540,
    title: { en: 'The Sea Road to India', de: 'Der Seeweg nach Indien' },
    text: {
      en: 'After ten months at sea, with scurvy in the holds and half the crews dead, the fleet of {ruler} has anchored at Calicut. "We seek Christians and spices," the first man ashore told the astonished merchants. The pepper in the holds is worth sixty times the cost of the voyage.',
      de: 'Nach zehn Monaten auf See, mit Skorbut in den Laderäumen und der Hälfte der Mannschaften tot, hat die Flotte von {ruler} vor Calicut geankert. „Wir suchen Christen und Gewürze“, sagte der erste Mann an Land zu den verblüfften Kaufleuten. Der Pfeffer in den Laderäumen ist das Sechzigfache der Reisekosten wert.',
    },
    mtth: 24,
    trigger: (e) => e.n.flags.cape_route !== undefined && !!e.n.flags.cape_route,
    options: [
      { label: { en: 'Send armed fleets every year', de: 'Jedes Jahr bewaffnete Flotten senden' }, effect: (e) => { e.fx.worldFlag('india_route_known', e.s.day); e.fx.gold(5); e.fx.prestige(12); e.fx.estate('burghers', 6); e.fx.modifier('india_route', 100, { en: 'Sea road to India', de: 'Seeweg nach Indien' }, { trade: 0.1, colonial_range: 0.2 }); const v = nationByKey(e, 'venice'); if (v) e.fx.opinion(v.id, -20, 20); const m = nationByKey(e, 'mamluk'); if (m) e.fx.opinion(m.id, -25, 20); }, ai: 0.9 },
      { label: { en: 'Trade peacefully with the Zamorin', de: 'Friedlich mit dem Zamorin handeln' }, effect: (e) => { e.fx.worldFlag('india_route_known', e.s.day); e.fx.gold(3); e.fx.prestige(8); e.fx.modifier('india_route', 100, { en: 'Sea road to India', de: 'Seeweg nach Indien' }, { trade: 0.07 }); }, ai: 0.4 },
    ],
  },
  {
    id: 'spice_route_lost', art: 'trade', oncePer: true, minYear: 1500, maxYear: 1560,
    title: { en: 'Pepper in Lisbon', de: 'Pfeffer in Lissabon' },
    text: {
      en: 'Pepper now arrives in Antwerp by sea around Africa, cheaper than the Alexandria caravans can bring it. The spice merchants of {nation} see their warehouses fill with goods no one will buy at the old price.',
      de: 'Pfeffer kommt nun auf dem Seeweg um Afrika nach Antwerpen, billiger, als ihn die Karawanen von Alexandria liefern können. Die Gewürzhändler von {nation} sehen ihre Lager mit Waren füllen, die niemand mehr zum alten Preis kaufen will.',
    },
    mtth: 24,
    trigger: (e) => !!e.s.flags.india_route_known && (isKey(e, 'venice', 'genoa', 'mamluk', 'ragusa') || (muslim(e) && owns(e, 'Alexandria'))),
    options: [
      { label: { en: 'Cut prices and fight for the trade', de: 'Die Preise senken und um den Handel kämpfen' }, effect: (e) => { e.fx.gold(-2); e.fx.estate('burghers', 3); e.fx.modifier('spice_war', 20, { en: 'Spice price war', de: 'Gewürzpreiskrieg' }, { trade: -0.03 }); }, ai: 0.5 },
      { label: { en: 'Turn to other wares: silk, glass, books', de: 'Sich anderen Waren zuwenden: Seide, Glas, Bücher' }, effect: (e) => { e.fx.gold(-1); e.fx.building(e.n.capital, BI.workshop, 1); e.fx.modifier('new_wares', 30, { en: 'New manufactures', de: 'Neue Gewerbe' }, { production: 0.05, trade: -0.04 }); }, ai: 0.6 },
    ],
  },
  {
    id: 'cartographer', art: 'scholar',
    title: { en: 'A Map of the Whole World', de: 'Eine Karte der ganzen Welt' },
    text: {
      en: 'A cartographer of {loc} has drawn a map of the whole world on a projection of his own, with lines of latitude and longitude and the newly found coasts. He offers it to {ruler}, with the dedication, for a modest pension.',
      de: 'Ein Kartograf aus {loc} hat eine Karte der ganzen Welt in einer eigenen Projektion gezeichnet, mit Breiten- und Längengraden und den neu gefundenen Küsten. Er bietet sie {ruler_dat} samt Widmung gegen eine bescheidene Pension an.',
    },
    mtth: 150, cooldown: 30, minYear: 1450,
    trigger: (e) => settled(e) && christian(e) && hasCoast(e),
    setup: (e) => { e.ctx.loc = e.n.capital; return true; },
    options: [
      { label: { en: 'Grant the pension and print the map', de: 'Die Pension gewähren und die Karte drucken' }, effect: (e) => { e.fx.gold(-1); e.fx.insight(4); e.fx.prestige(2); e.fx.modifier('good_charts', 25, { en: 'Good charts', de: 'Gute Seekarten' }, { colonial_range: 0.1 }); }, ai: 0.7 },
      { label: { en: 'Lock it in the chancery as a state secret', de: 'Sie als Staatsgeheimnis in der Kanzlei verschließen' }, effect: (e) => { e.fx.gold(-0.5); e.fx.modifier('secret_charts', 25, { en: 'Secret charts', de: 'Geheime Seekarten' }, { colonial_range: 0.15 }); }, ai: 0.4 },
    ],
  },
  {
    id: 'caravel_design', art: 'ship',
    title: { en: 'A New Kind of Hull', de: 'Eine neue Art von Rumpf' },
    text: {
      en: 'The shipwrights of {loc} have built a three-masted vessel with square sails for running before the wind and a lateen sail for beating against it, a high castle aft and a hull built carvel-fashion, plank to plank. Captains say she can sail anywhere.',
      de: 'Die Schiffbauer von {loc} haben ein dreimastiges Schiff gebaut, mit Rahsegeln, um vor dem Wind zu laufen, und einem Lateinersegel, um gegen ihn zu kreuzen, mit hohem Achterkastell und kraweel beplanktem Rumpf, Planke an Planke. Die Kapitäne sagen, mit ihm könne man überallhin segeln.',
    },
    mtth: 100, oncePer: true, minYear: 1420, maxYear: 1560,
    trigger: (e) => settled(e) && coastal(e) && e.n.capital >= 0 && e.w.lon[e.n.capital] < 20,
    setup: (e) => { e.ctx.loc = e.n.capital; return true; },
    options: [
      { label: { en: 'Build the royal fleet on this model', de: 'Die königliche Flotte nach diesem Vorbild bauen' }, effect: (e) => { e.fx.gold(-2); e.fx.building(e.ctx.loc, BI.port, 1); e.fx.tech(1, 0.08); e.fx.value(4, 5); }, ai: 0.7 },
      { label: { en: 'Leave it to the merchants', de: 'Es den Kaufleuten überlassen' }, effect: (e) => { e.fx.gold(-0.3); e.fx.estate('burghers', 4); e.fx.modifier('merchant_hulls', 20, { en: 'Merchant carracks', de: 'Kaufmannskarracken' }, { trade: 0.03 }); }, ai: 0.5 },
    ],
  },
  {
    id: 'maize_arrives', art: 'harvest',
    title: { en: 'Indian Corn', de: 'Türkischer Weizen' },
    text: {
      en: 'Peasants around {loc} have begun to plant a tall grass from across the Ocean whose cobs carry hundreds of fat yellow grains. It yields twice what millet does and thrives where wheat fails. The priests are unsure whether it may be tithed.',
      de: 'Bauern um {loc} haben begonnen, ein hohes Gras von jenseits des Ozeans anzubauen, dessen Kolben Hunderte dicker gelber Körner tragen. Es bringt doppelt so viel wie Hirse und gedeiht, wo Weizen versagt. Die Priester sind unsicher, ob man es verzehnten darf.',
    },
    mtth: 72, oncePer: true, minYear: 1520,
    trigger: (e) => settled(e) && newWorldKnown(e) && e.n.capital >= 0 && e.w.lat[e.n.capital] < 48 && e.w.lon[e.n.capital] < 45,
    setup: (e) => { e.ctx.loc = e.n.capital; return true; },
    options: [
      { label: { en: 'Encourage it everywhere', de: 'Ihn überall fördern' }, effect: (e) => { e.fx.estate('commons', 5); e.fx.modifier('maize', 100, { en: 'Maize fields', de: 'Maisfelder' }, { production: 0.03, manpower: 0.03 }); }, ai: 0.8 },
      { label: { en: 'Tithe it like wheat', de: 'Ihn wie Weizen verzehnten' }, effect: (e) => { e.fx.estate('prelates', 5); e.fx.estate('commons', -3); e.fx.modifier('maize', 100, { en: 'Maize fields', de: 'Maisfelder' }, { production: 0.02 }); }, ai: 0.4 },
    ],
  },
  {
    id: 'potato_arrives', art: 'harvest',
    title: { en: 'The Earth Apple', de: 'Der Erdapfel' },
    text: {
      en: 'A botanist at court has grown a tuber from the Andes that the common people fear as poisonous, food for pigs and cause of leprosy. Yet one field of it feeds three times as many mouths as one of rye, and it lies safe underground when armies trample the grain.',
      de: 'Ein Botaniker bei Hofe hat eine Knolle aus den Anden gezogen, die das einfache Volk als giftig, als Schweinefutter und als Ursache des Aussatzes fürchtet. Doch ein Feld davon ernährt dreimal so viele Mäuler wie eines mit Roggen, und sie liegt sicher unter der Erde, wenn Heere das Korn zertrampeln.',
    },
    mtth: 72, oncePer: true, minYear: 1580,
    trigger: (e) => settled(e) && newWorldKnown(e) && e.n.capital >= 0 && e.w.lat[e.n.capital] > 44,
    options: [
      { label: { en: 'Order every village to plant it', de: 'Jedem Dorf den Anbau befehlen' }, effect: (e) => { e.fx.estate('commons', -4); e.fx.authority(5); e.fx.modifier('potatoes', 100, { en: 'Potato fields', de: 'Kartoffelfelder' }, { manpower: 0.06, unrest: -1 }); }, ai: 0.5 },
      { label: { en: 'Guard the royal potato field, so people steal it', de: 'Das königliche Kartoffelfeld bewachen, damit das Volk sie stiehlt' }, effect: (e) => { e.fx.gold(-0.5); e.fx.prestige(2); e.fx.modifier('potatoes', 100, { en: 'Potato fields', de: 'Kartoffelfelder' }, { manpower: 0.04 }); }, ai: 0.7 },
      { label: { en: 'A curiosity for the gardens', de: 'Eine Kuriosität für die Gärten' }, effect: (e) => { e.fx.prestige(1); e.fx.insight(1); }, ai: 0.2 },
    ],
  },
  {
    id: 'tobacco_craze', art: 'trade',
    title: { en: 'Drinking Smoke', de: 'Das Rauchtrinken' },
    text: {
      en: 'Sailors and soldiers have brought home the habit of "drinking" the smoke of a dried leaf from the Indies through clay pipes. The taverns of {nation} are full of it. Preachers call it the devil’s weed; the treasurer calls it a taxable commodity.',
      de: 'Seeleute und Soldaten haben die Gewohnheit heimgebracht, den Rauch eines getrockneten Blattes aus den Indien durch Tonpfeifen zu „trinken“. Die Schenken von {nation} sind voll davon. Prediger nennen es Teufelskraut; der Schatzmeister nennt es eine steuerbare Ware.',
    },
    mtth: 72, oncePer: true, minYear: 1570,
    trigger: (e) => settled(e) && newWorldKnown(e),
    options: [
      { label: { en: 'Make tobacco a crown monopoly', de: 'Den Tabak zum Kronmonopol machen' }, effect: (e) => { e.fx.gold(1); e.fx.estate('burghers', -4); e.fx.modifier('tobacco_monopoly', 50, { en: 'Tobacco monopoly', de: 'Tabakmonopol' }, { tax: 0.03 }); }, ai: 0.7 },
      { label: { en: 'Ban it as a filthy habit', de: 'Es als schmutzige Gewohnheit verbieten' }, effect: (e) => { e.fx.estate('prelates', 4); e.fx.estate('commons', -3); e.fx.authority(2); }, ai: (e) => (muslim(e) ? 0.6 : 0.2) },
    ],
  },
  {
    id: 'coffee_houses', art: 'trade',
    title: { en: 'The Coffee Houses', de: 'Die Kaffeehäuser' },
    text: {
      en: 'In {loc} a dozen coffee houses have opened, where for a penny anyone may sit, drink the black bitter brew, read the gazettes and argue about the government. The police report that much of the talk is seditious.',
      de: 'In {loc} haben ein Dutzend Kaffeehäuser eröffnet, in denen jeder für einen Pfennig sitzen, das schwarze bittere Gebräu trinken, die Zeitungen lesen und über die Regierung streiten kann. Die Polizei meldet, vieles von dem Gerede sei aufrührerisch.',
    },
    mtth: 72, oncePer: true, minYear: 1650,
    trigger: (e) => settled(e) && eraAtLeast(e, 2) && est(e, 'burghers').influence > 15,
    setup: (e) => { e.ctx.loc = e.n.capital; return true; },
    options: [
      { label: { en: 'License and tax them', de: 'Sie lizenzieren und besteuern' }, effect: (e) => { e.fx.gold(1); e.fx.estate('burghers', 4); e.fx.insight(3); e.fx.modifier('coffee_houses', 50, { en: 'Coffee houses', de: 'Kaffeehäuser' }, { research: 0.03, trade: 0.02 }); }, ai: 0.7 },
      { label: { en: 'Close them as nests of sedition', de: 'Sie als Brutstätten des Aufruhrs schließen' }, effect: (e) => { e.fx.estate('burghers', -6); e.fx.authority(5); e.fx.value(2, -3); }, ai: 0.3 },
    ],
  },
  {
    id: 'beyond_urals', art: 'ship', major: true, once: true, minYear: 1555, maxYear: 1640,
    title: { en: 'Beyond the Stone Belt', de: 'Jenseits des Steinernen Gürtels' },
    text: {
      en: 'The salt-boiling merchant house of the Stroganovs, which holds vast lands on the Kama, has hired a band of Cossacks under a hard old ataman. They propose to cross the Urals and break the khanate of Sibir, whose sable and squirrel pelts could fill the treasury of {ruler} for a century.',
      de: 'Das Salzsiederhaus der Stroganows, das riesige Ländereien an der Kama besitzt, hat eine Schar Kosaken unter einem harten alten Ataman angeworben. Sie schlagen vor, den Ural zu überqueren und das Khanat Sibir zu zerschlagen, dessen Zobel- und Eichhörnchenfelle die Schatzkammer von {ruler} für ein Jahrhundert füllen könnten.',
    },
    mtth: 24,
    trigger: (e) => isKey(e, 'moscow') || (e.n.faith === H.faith('orthodox') && owns(e, 'Moscow') && owns(e, 'Kazan')),
    options: [
      { label: { en: 'Bless the enterprise and send streltsy', de: 'Das Unternehmen segnen und Strelizen senden' }, effect: (e) => { e.fx.gold(-1); e.fx.manpower(-0.03); e.fx.prestige(10); e.fx.estate('burghers', 6); e.fx.modifier('siberian_furs', 100, { en: 'Siberian fur tribute', de: 'Sibirischer Pelztribut' }, { tax: 0.05, colonial_range: 0.3, colonists: 1 }); }, ai: 0.9 },
      { label: { en: 'Forbid it; the Tatars must not be provoked', de: 'Es verbieten; die Tataren dürfen nicht gereizt werden' }, effect: (e) => { e.fx.estate('burghers', -4); e.fx.authority(3); }, ai: 0.1 },
    ],
  },
  {
    id: 'northern_passage', art: 'storm',
    title: { en: 'A Passage through the Ice', de: 'Eine Durchfahrt durchs Eis' },
    text: {
      en: 'Merchant adventurers of {nation} wish to find a northern route to Cathay, round the top of the world, beyond the reach of the Iberian fleets. They ask {ruler} for a charter and two stout ships.',
      de: 'Kaufmannsabenteurer aus {nation} wollen einen nördlichen Weg nach Cathay finden, um den Scheitel der Welt herum, außer Reichweite der iberischen Flotten. Sie bitten {ruler} um einen Freibrief und zwei kräftige Schiffe.',
    },
    mtth: 72, oncePer: true, minYear: 1550, maxYear: 1700,
    trigger: (e) => settled(e) && hasCoast(e) && e.n.capital >= 0 && e.w.lat[e.n.capital] > 50 && e.w.lon[e.n.capital] < 15 && !isKey(e, 'moscow'),
    options: [
      { label: { en: 'Charter the voyage', de: 'Die Fahrt genehmigen' }, effect: (e) => { e.fx.gold(-1.5); e.fx.insight(3); const m = nationByKey(e, 'moscow'); if (m) { e.ctx.other = m.id; e.fx.opinion(m.id, 15); } e.fx.modifier('muscovy_company', 40, { en: 'Northern trading company', de: 'Nördliche Handelskompanie' }, { trade: 0.03 }); }, ai: 0.6 },
      { label: { en: 'Too much ice, too little gain', de: 'Zu viel Eis, zu wenig Gewinn' }, effect: (e) => { e.fx.gold(0.3); e.fx.value(4, -2); }, ai: 0.4 },
    ],
  },
  {
    id: 'natural_philosophers', art: 'scholar',
    title: { en: 'A Society for Natural Knowledge', de: 'Eine Gesellschaft für Naturerkenntnis' },
    text: {
      en: 'Gentlemen of {loc} meet weekly to make experiments with air pumps, prisms and the dissection of dogs. They take nothing on authority, they say, only on the evidence of the senses. They ask {ruler} for a royal charter and the right to print without censorship.',
      de: 'Herren aus {loc} treffen sich wöchentlich, um mit Luftpumpen, Prismen und dem Sezieren von Hunden zu experimentieren. Sie nähmen nichts auf Autorität hin, sagen sie, nur auf das Zeugnis der Sinne. Sie bitten {ruler} um einen königlichen Freibrief und das Recht, ohne Zensur zu drucken.',
    },
    mtth: 72, oncePer: true, minYear: 1640,
    trigger: (e) => settled(e) && eraAtLeast(e, 2),
    setup: (e) => { e.ctx.loc = e.n.capital; return true; },
    options: [
      { label: { en: 'Grant the charter', de: 'Den Freibrief gewähren' }, effect: (e) => { e.fx.insight(10); e.fx.tech(0, 0.1); e.fx.estate('prelates', -4); e.fx.prestige(4); e.fx.modifier('royal_society', 80, { en: 'Royal society of sciences', de: 'Königliche Akademie der Wissenschaften' }, { research: 0.06 }); }, ai: 0.8 },
      { label: { en: 'Their experiments are impious', de: 'Ihre Experimente sind gottlos' }, effect: (e) => { e.fx.estate('prelates', 5); e.fx.value(2, -5); }, ai: 0.2 },
    ],
  },
  {
    id: 'longitude_prize', art: 'ship',
    title: { en: 'The Problem of Longitude', de: 'Das Längengradproblem' },
    text: {
      en: 'After a fleet of {nation} ran onto rocks it believed a hundred miles away, the admiralty proposes a great prize for anyone who can find a ship’s longitude at sea: by the moons of Jupiter, by the moon’s distance from the stars, or by a clock that keeps true time through storms.',
      de: 'Nachdem eine Flotte aus {nation} auf Felsen lief, die sie hundert Meilen entfernt glaubte, schlägt die Admiralität einen großen Preis für jeden vor, der die Länge eines Schiffes auf See bestimmen kann: durch die Jupitermonde, durch den Abstand des Mondes zu den Sternen oder durch eine Uhr, die selbst im Sturm genau geht.',
    },
    mtth: 72, oncePer: true, minYear: 1700,
    trigger: (e) => settled(e) && atlantic(e) && eraAtLeast(e, 2),
    options: [
      { label: { en: 'Offer the prize', de: 'Den Preis ausloben' }, effect: (e) => { e.fx.gold(-2); e.fx.insight(6); e.fx.modifier('longitude', 60, { en: 'Marine chronometers', de: 'Schiffschronometer' }, { colonial_range: 0.2, trade: 0.02 }); }, ai: 0.8 },
      { label: { en: 'Our pilots manage well enough', de: 'Unsere Lotsen kommen gut genug zurecht' }, effect: (e) => { e.fx.gold(0.3); }, ai: 0.2 },
    ],
  },
  {
    id: 'voyage_of_science', art: 'ship',
    title: { en: 'A Voyage for Science', de: 'Eine Forschungsreise' },
    text: {
      en: 'Astronomers want to observe the passage of Venus across the sun from the far side of the world, to measure the distance of the sun itself. A naval captain offers to take them, along with botanists, painters and a sealed order to search for the great southern continent.',
      de: 'Astronomen wollen den Durchgang der Venus vor der Sonne von der anderen Seite der Welt beobachten, um den Abstand zur Sonne selbst zu messen. Ein Marinekapitän bietet an, sie mitzunehmen, zusammen mit Botanikern, Malern und einem versiegelten Befehl, nach dem großen Südkontinent zu suchen.',
    },
    mtth: 48, oncePer: true, minYear: 1760,
    trigger: (e) => settled(e) && atlantic(e) && eraAtLeast(e, 3) && rich(e, 4),
    options: [
      { label: { en: 'Fit out the expedition', de: 'Die Expedition ausrüsten' }, effect: (e) => { e.fx.gold(-2); e.fx.insight(8); e.fx.prestige(6); e.fx.modifier('pacific_charts', 50, { en: 'Charts of the far ocean', de: 'Karten des fernen Ozeans' }, { colonial_range: 0.3 }); }, ai: 0.8 },
      { label: { en: 'Navies are for war', de: 'Flotten sind für den Krieg da' }, effect: (e) => { e.fx.gold(0.5); e.fx.estate('magnates', 2); }, ai: 0.2 },
    ],
  },
];
