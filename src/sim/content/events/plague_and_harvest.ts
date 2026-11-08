// Pestilence, harvests, weather and disasters.
import type { EventDef } from '../../systems/events';
import { H } from '../../systems/events';
import { BI } from '../../defs';
import { avgHarvest, plagueLoc, bigTown, isKey, locByName, owns, settled, rich, christian, latin, muslim, eraAtLeast, heir } from './util';

export const PLAGUE_AND_HARVEST_EVENTS: EventDef[] = [
  {
    id: 'plague_in_town', art: 'plague',
    title: { en: 'The Pestilence in {loc}', de: 'Die Pestilenz in {loc}' },
    text: {
      en: 'Swellings under the arm, black spots, death within three days: the great mortality has returned to {loc}. The town council begs {ruler} to decide before the sickness spreads along the roads.',
      de: 'Beulen unter den Achseln, schwarze Flecken, Tod binnen drei Tagen: Das große Sterben ist nach {loc} zurückgekehrt. Der Stadtrat fleht {ruler} an, zu entscheiden, bevor die Seuche sich entlang der Straßen ausbreitet.',
    },
    mtth: 6, cooldown: 6,
    trigger: (e) => plagueLoc(e, 0.15) >= 0,
    setup: (e) => { e.ctx.loc = plagueLoc(e, 0.15); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Close the gates and burn the bedding', de: 'Die Tore schließen und das Bettzeug verbrennen' }, effect: (e) => { e.fx.gold(-1); e.fx.unrest(e.ctx.loc, 8); e.fx.estate('burghers', -6); e.fx.pop(e.ctx.loc, 0.02); e.fx.authority(5); }, ai: 0.8 },
      { label: { en: 'Order processions and public prayer', de: 'Prozessionen und öffentliche Gebete anordnen' }, effect: (e) => { e.fx.estate('prelates', 6); e.fx.concord(3); e.fx.pop(e.ctx.loc, -0.02); }, ai: 0.6 },
      { label: { en: 'The court withdraws to the country', de: 'Der Hof zieht sich aufs Land zurück' }, effect: (e) => { e.fx.mandate(-4); e.fx.rulerHealth(0.05); e.fx.estate('commons', -5); }, ai: 0.3 },
    ],
  },
  {
    id: 'plague_physicians', art: 'scholar',
    title: { en: 'Physicians of the Schools', de: 'Ärzte der Hohen Schulen' },
    text: {
      en: 'Masters of medicine trained at Montpellier and Padua offer {ruler} a regimen against the pestilence: vinegar, smoke, the separation of the sick. They ask for a stipend and the right to open the dead.',
      de: 'In Montpellier und Padua ausgebildete Meister der Medizin bieten {ruler} eine Ordnung gegen die Pestilenz an: Essig, Rauch, die Absonderung der Kranken. Sie verlangen ein Gehalt und das Recht, Tote zu öffnen.',
    },
    mtth: 36, cooldown: 25,
    trigger: (e) => christian(e) && plagueLoc(e, 0.1) >= 0 && settled(e),
    options: [
      { label: { en: 'Grant the stipend and the dissections', de: 'Gehalt und Leichenöffnungen gewähren' }, effect: (e) => { e.fx.gold(-1.5); e.fx.insight(6); e.fx.tech(0, 0.05); e.fx.estate('prelates', -4); }, ai: 0.6 },
      { label: { en: 'The stipend, but no butchery of the dead', de: 'Das Gehalt, aber keine Schlachterei an Toten' }, effect: (e) => { e.fx.gold(-1); e.fx.insight(3); e.fx.estate('prelates', 2); }, ai: 0.7 },
      { label: { en: 'God sends the plague; God will lift it', de: 'Gott schickt die Seuche, Gott wird sie nehmen' }, effect: (e) => { e.fx.estate('prelates', 4); e.fx.value(2, -3); }, ai: 0.3 },
    ],
  },
  {
    id: 'labour_shortage', art: 'harvest',
    title: { en: 'Too Few Hands', de: 'Zu wenige Hände' },
    text: {
      en: 'Since the dying, fields lie fallow for want of reapers. Labourers wander from manor to manor and ask twice the old wage. The lords of {nation} demand a statute that fixes wages as they were before the mortality.',
      de: 'Seit dem Sterben liegen Felder brach, weil Schnitter fehlen. Tagelöhner ziehen von Hof zu Hof und verlangen den doppelten Lohn. Die Herren von {nation} fordern eine Satzung, die die Löhne festschreibt wie vor dem Sterben.',
    },
    mtth: 48, cooldown: 30, maxYear: 1500,
    trigger: (e) => settled(e) && (plagueLoc(e, 0.05) >= 0 || (e.n.flags.ev_plague_in_town || -9e9) > e.s.day - 365 * 3),
    options: [
      { label: { en: 'Proclaim a statute of labourers', de: 'Eine Arbeiterordnung erlassen' }, effect: (e) => { e.fx.estate('magnates', 8); e.fx.estate('commons', -10); e.fx.unrestAll(3); e.fx.authority(5); e.fx.modifier('labour_statute', 10, { en: 'Statute of labourers', de: 'Arbeiterordnung' }, { production: -0.03, unrest: 1 }); }, ai: 0.6 },
      { label: { en: 'Let the wages find their level', de: 'Die Löhne sich selbst finden lassen' }, effect: (e) => { e.fx.estate('commons', 8); e.fx.estate('magnates', -8); e.fx.value(1, -5); e.fx.modifier('free_wages', 10, { en: 'Rising wages', de: 'Steigende Löhne' }, { production: 0.04, tax: -0.03 }); }, ai: 0.5 },
    ],
  },
  {
    id: 'flagellants', art: 'church',
    title: { en: 'The Flagellants Arrive', de: 'Die Geißler kommen' },
    text: {
      en: 'A column of penitents in white hoods has reached {loc}, scourging their backs bloody and singing of the end of days. Crowds follow them; some preachers among them rail against the clergy and the Jews.',
      de: 'Ein Zug von Büßern in weißen Kapuzen hat {loc} erreicht. Sie geißeln sich die Rücken blutig und singen vom Ende der Zeiten. Die Menge folgt ihnen; einige ihrer Prediger wettern gegen den Klerus und die Juden.',
    },
    mtth: 60, cooldown: 30, maxYear: 1420,
    trigger: (e) => latin(e) && plagueLoc(e, 0.05) >= 0,
    setup: (e) => { e.ctx.loc = bigTown(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Disperse them and protect the Jewish quarter', de: 'Sie zerstreuen und das Judenviertel schützen' }, effect: (e) => { e.fx.estate('prelates', 4); e.fx.estate('commons', -4); e.fx.unrest(e.ctx.loc, 4); e.fx.authority(5); e.fx.modifier('protected_jews', 10, { en: 'Protected communities', de: 'Geschützte Gemeinden' }, { trade: 0.03, tolerance: 0.1 }); }, ai: 0.7 },
      { label: { en: 'Let them pass through in peace', de: 'Sie in Frieden durchziehen lassen' }, effect: (e) => { e.fx.estate('commons', 5); e.fx.estate('prelates', -6); e.fx.unrest(e.ctx.loc, 6); e.fx.concord(-2); }, ai: 0.4 },
    ],
  },
  {
    id: 'famine', art: 'harvest',
    title: { en: 'Hunger in the Land', de: 'Hunger im Land' },
    text: {
      en: 'Rain rotted the seed in the ground and the harvest has failed across {nation}. Bread prices have tripled; in the villages people grind acorns and bark. Grain is still stored in the crown’s and the monasteries’ barns.',
      de: 'Der Regen ließ die Saat im Boden faulen, und die Ernte ist in ganz {nation} missraten. Der Brotpreis hat sich verdreifacht; in den Dörfern mahlen die Leute Eicheln und Rinde. In den Scheunen der Krone und der Klöster lagert noch Getreide.',
    },
    mtth: 12, cooldown: 10,
    trigger: (e) => avgHarvest(e) < 0.72,
    options: [
      { label: { en: 'Open the royal granaries', de: 'Die königlichen Kornspeicher öffnen' }, effect: (e) => { e.fx.gold(-2); e.fx.estate('commons', 8); e.fx.concord(4); e.fx.unrestAll(-4); }, ai: (e) => (rich(e, 3) ? 1 : 0.3) },
      { label: { en: 'Make the abbeys share their stores', de: 'Die Abteien zur Abgabe ihrer Vorräte zwingen' }, effect: (e) => { e.fx.estate('prelates', -10); e.fx.estate('commons', 6); e.fx.unrestAll(-2); e.fx.authority(-5); }, ai: 0.6 },
      { label: { en: 'Forbid hoarding, but do nothing more', de: 'Das Horten verbieten, sonst nichts' }, effect: (e) => { e.fx.unrestAll(6); e.fx.estate('commons', -8); e.fx.manpower(-0.05); e.fx.authority(3); }, ai: 0.4 },
    ],
  },
  {
    id: 'bountiful_harvest', art: 'harvest',
    title: { en: 'A Year of Plenty', de: 'Ein Jahr des Überflusses' },
    text: {
      en: 'The barns of {nation} are full to the rafters and the price of rye has fallen by half. The reeves report that peasants are buying cloth and iron pots they have not afforded in years.',
      de: 'Die Scheunen von {nation} sind bis unters Dach gefüllt, und der Roggenpreis ist um die Hälfte gefallen. Die Amtleute berichten, dass die Bauern Tuch und eiserne Töpfe kaufen, die sie sich seit Jahren nicht leisten konnten.',
    },
    mtth: 36, cooldown: 15,
    trigger: (e) => avgHarvest(e) > 1.15,
    options: [
      { label: { en: 'Hold a harvest festival', de: 'Ein Erntefest feiern' }, effect: (e) => { e.fx.gold(-0.5); e.fx.concord(6); e.fx.estate('commons', 6); }, ai: 0.6 },
      { label: { en: 'Fill the crown granaries for lean years', de: 'Die Kornspeicher der Krone für magere Jahre füllen' }, effect: (e) => { e.fx.gold(-1); e.fx.modifier('full_granaries', 8, { en: 'Full granaries', de: 'Volle Kornspeicher' }, { unrest: -2, concord: 3 }); }, ai: 0.8 },
      { label: { en: 'Levy an extra tithe on the surplus', de: 'Einen Sonderzehnt auf den Überschuss erheben' }, effect: (e) => { e.fx.gold(2.5); e.fx.estate('commons', -8); }, ai: 0.4 },
    ],
  },
  {
    id: 'bitter_winter', art: 'storm',
    title: { en: 'The Bitter Winter', de: 'Der bittere Winter' },
    text: {
      en: 'The rivers of {nation} have frozen so hard that carts cross them. Birds drop dead from the trees, wine freezes in the casks, and the poor of {loc} burn their doors for warmth.',
      de: 'Die Flüsse von {nation} sind so hart gefroren, dass Fuhrwerke sie überqueren. Vögel fallen tot von den Bäumen, der Wein gefriert in den Fässern, und die Armen von {loc} verfeuern ihre Türen, um sich zu wärmen.',
    },
    mtth: 120, cooldown: 12,
    trigger: (e) => e.n.capital >= 0 && e.w.lat[e.n.capital] > 46 && (e.month <= 1 || e.month === 11) && (e.year >= 1550 && e.year <= 1720 ? true : e.s.loc.snow[e.n.capital] > 0.5),
    setup: (e) => { e.ctx.loc = bigTown(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Open the royal forests for firewood', de: 'Die königlichen Forste für Brennholz öffnen' }, effect: (e) => { e.fx.estate('commons', 6); e.fx.estate('magnates', -5); e.fx.gold(-0.5); e.fx.concord(2); }, ai: 0.7 },
      { label: { en: 'Alms for the poor of the towns', de: 'Almosen für die Armen der Städte' }, effect: (e) => { e.fx.gold(-1); e.fx.estate('burghers', 4); e.fx.estate('prelates', 3); e.fx.unrest(e.ctx.loc, -5); }, ai: 0.6 },
      { label: { en: 'Every household must endure', de: 'Jeder Haushalt muss es ertragen' }, effect: (e) => { e.fx.pop(e.ctx.loc, -0.02); e.fx.estate('commons', -6); e.fx.unrestAll(2); }, ai: 0.3 },
    ],
  },
  {
    id: 'frost_fair', art: 'trade',
    title: { en: 'A Fair upon the Ice', de: 'Ein Jahrmarkt auf dem Eis' },
    text: {
      en: 'The river at {loc} has frozen so thick that booths, ox roasts and even a printing press have been set up on the ice. Half the town is skating; the other half is selling things to them.',
      de: 'Der Fluss bei {loc} ist so dick gefroren, dass man Buden, Ochsenbratereien und sogar eine Druckerpresse auf dem Eis errichtet hat. Die halbe Stadt läuft Schlittschuh, die andere Hälfte verkauft ihr etwas.',
    },
    mtth: 90, oncePer: true, minYear: 1560, maxYear: 1815,
    trigger: (e) => e.n.capital >= 0 && e.w.lat[e.n.capital] > 49 && (e.month <= 1 || e.month === 11),
    setup: (e) => { e.ctx.loc = e.n.capital; return true; },
    options: [
      { label: { en: 'The crown takes stall fees', de: 'Die Krone erhebt Standgeld' }, effect: (e) => { e.fx.gold(1); e.fx.estate('burghers', -2); }, ai: 0.5 },
      { label: { en: '{ruler} goes skating with the people', de: '{ruler} läuft mit dem Volk Schlittschuh' }, effect: (e) => { e.fx.mandate(4); e.fx.prestige(2); e.fx.estate('commons', 4); }, ai: 0.8 },
    ],
  },
  {
    id: 'river_flood', art: 'storm',
    title: { en: 'Floodwaters at {loc}', de: 'Hochwasser bei {loc}' },
    text: {
      en: 'Weeks of rain have burst the river banks near {loc}. Mills are torn away, meadows lie under brown water, and cattle drift past the church tower. The peasants ask who will pay for new dykes.',
      de: 'Wochenlanger Regen hat bei {loc} die Flussufer gesprengt. Mühlen sind fortgerissen, Wiesen liegen unter braunem Wasser, und Vieh treibt am Kirchturm vorbei. Die Bauern fragen, wer neue Deiche bezahlen soll.',
    },
    mtth: 200, cooldown: 10,
    trigger: (e) => settled(e) && e.month >= 2 && e.month <= 7,
    setup: (e) => { e.ctx.loc = H.randomLoc(e, (l) => e.w.elev[l] < 200 && (e.w.terrain[l] === 1 || e.w.terrain[l] === 5 || e.w.terrain[l] === 0)); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Build proper dykes at crown expense', de: 'Ordentliche Deiche auf Kosten der Krone bauen' }, effect: (e) => { e.fx.gold(-2); e.fx.building(e.ctx.loc, BI.farm, 1); e.fx.estate('commons', 5); }, ai: (e) => (rich(e, 4) ? 0.9 : 0.2) },
      { label: { en: 'Remit this year’s dues', de: 'Die Abgaben dieses Jahres erlassen' }, effect: (e) => { e.fx.gold(-0.5); e.fx.devastate(e.ctx.loc, 0.15); e.fx.unrest(e.ctx.loc, -4); }, ai: 0.6 },
      { label: { en: 'Let the village repair it', de: 'Das Dorf soll es selbst richten' }, effect: (e) => { e.fx.devastate(e.ctx.loc, 0.3); e.fx.unrest(e.ctx.loc, 8); e.fx.dev(e.ctx.loc, -0.5); }, ai: 0.3 },
    ],
  },
  {
    id: 'grote_mandrenke', art: 'storm', major: true, once: true, minYear: 1362, maxYear: 1363,
    title: { en: 'The Great Drowning of Men', de: 'Die Große Mandränke' },
    text: {
      en: 'On the feast of Saint Marcellus a storm tide broke over the coasts of the North Sea. Whole parishes have vanished beneath the waves, and the rich trading town of Rungholt is gone as if it had never been.',
      de: 'Am Tag des heiligen Marcellus brach eine Sturmflut über die Küsten der Nordsee herein. Ganze Kirchspiele sind in den Wellen versunken, und die reiche Handelsstadt Rungholt ist verschwunden, als hätte es sie nie gegeben.',
    },
    mtth: 2,
    trigger: (e) => isKey(e, 'schleswig', 'denmark', 'east_frisia', 'holland', 'holstein_rendsburg', 'oldenburg') && e.month <= 2,
    setup: (e) => { e.ctx.loc = H.randomLoc(e, (l) => !!e.w.coastal[l]); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Raise new dykes, whatever the cost', de: 'Neue Deiche errichten, koste es, was es wolle' }, effect: (e) => { e.fx.gold(-3); e.fx.pop(e.ctx.loc, -0.1); e.fx.building(e.ctx.loc, BI.farm, 1); e.fx.estate('commons', 6); }, ai: 0.7 },
      { label: { en: 'Give the drowned land to the sea', de: 'Das ertrunkene Land dem Meer überlassen' }, effect: (e) => { e.fx.pop(e.ctx.loc, -0.15); e.fx.dev(e.ctx.loc, -1); e.fx.concord(-5); }, ai: 0.3 },
    ],
  },
  {
    id: 'elizabeth_flood', art: 'storm', major: true, once: true, minYear: 1421, maxYear: 1422,
    title: { en: 'The Saint Elizabeth Flood', de: 'Die Elisabethenflut' },
    text: {
      en: 'The dykes of the Grote Waard have given way in the November storms. Seventy villages around Dordrecht are under water; the survivors sit on the roofs of their churches and wait for boats.',
      de: 'Die Deiche der Grote Waard sind in den Novemberstürmen gebrochen. Siebzig Dörfer um Dordrecht stehen unter Wasser; die Überlebenden sitzen auf den Kirchendächern und warten auf Boote.',
    },
    mtth: 2,
    trigger: (e) => owns(e, 'Dordrecht') && e.month >= 9,
    setup: (e) => { e.ctx.loc = locByName(e.w, 'Dordrecht'); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Lend the dyke boards money to rebuild', de: 'Den Deichverbänden Geld zum Wiederaufbau leihen' }, effect: (e) => { e.fx.gold(-2); e.fx.devastate(e.ctx.loc, 0.3); e.fx.estate('burghers', 6); e.fx.estate('commons', 4); }, ai: 0.7 },
      { label: { en: 'Quarrel with the lords over who pays', de: 'Mit den Herren streiten, wer zahlt' }, effect: (e) => { e.fx.devastate(e.ctx.loc, 0.6); e.fx.pop(e.ctx.loc, -0.1); e.fx.authority(5); e.fx.estate('magnates', -4); }, ai: 0.3 },
    ],
  },
  {
    id: 'town_fire', art: 'fire',
    title: { en: 'Fire in {loc}', de: 'Feuer in {loc}' },
    text: {
      en: 'A baker’s oven, a dry wind and streets of timber and thatch: half of {loc} burned in a single night. The townsmen want to rebuild at once, but the master masons say: build in stone, or it will burn again.',
      de: 'Ein Backofen, ein trockener Wind und Gassen aus Fachwerk und Stroh: Die halbe Stadt {loc} ist in einer einzigen Nacht abgebrannt. Die Bürger wollen sofort wieder aufbauen, doch die Steinmetzmeister sagen: Baut in Stein, sonst brennt es wieder.',
    },
    mtth: 240, cooldown: 20,
    trigger: (e) => settled(e) && e.w.townSize[e.n.capital] >= 3,
    setup: (e) => { e.ctx.loc = bigTown(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Decree stone and tile, with crown loans', de: 'Stein und Ziegel vorschreiben, mit Kronkrediten' }, effect: (e) => { e.fx.gold(-2); e.fx.dev(e.ctx.loc, 0.5); e.fx.estate('burghers', 6); e.fx.authority(5); }, ai: (e) => (rich(e, 4) ? 0.9 : 0.3) },
      { label: { en: 'Rebuild quickly as before', de: 'Schnell wieder aufbauen wie zuvor' }, effect: (e) => { e.fx.dev(e.ctx.loc, -0.5); e.fx.estate('burghers', -2); }, ai: 0.6 },
      { label: { en: 'Hang the baker', de: 'Den Bäcker hängen' }, effect: (e) => { e.fx.dev(e.ctx.loc, -0.7); e.fx.estate('commons', -4); e.fx.authority(3); }, ai: 0.1 },
    ],
  },
  {
    id: 'locusts', art: 'harvest',
    title: { en: 'A Cloud of Locusts', de: 'Eine Heuschreckenwolke' },
    text: {
      en: 'A dark cloud came out of the east and settled on the fields around {loc}. When it rose again three days later, nothing green was left. The chroniclers call it a plague of Egypt.',
      de: 'Eine dunkle Wolke kam aus dem Osten und ließ sich auf den Feldern um {loc} nieder. Als sie drei Tage später wieder aufstieg, war nichts Grünes mehr übrig. Die Chronisten sprechen von einer ägyptischen Plage.',
    },
    mtth: 200, cooldown: 15,
    trigger: (e) => e.n.capital >= 0 && e.w.lat[e.n.capital] < 48 && e.w.lon[e.n.capital] > 10 && e.month >= 4 && e.month <= 8,
    setup: (e) => { e.ctx.loc = H.randomLoc(e, (l) => e.w.terrain[l] <= 1 || e.w.terrain[l] === 6); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Pay a bounty for every sack of locusts', de: 'Für jeden Sack Heuschrecken ein Kopfgeld zahlen' }, effect: (e) => { e.fx.gold(-1); e.fx.devastate(e.ctx.loc, 0.1); e.fx.estate('commons', 5); }, ai: 0.7 },
      { label: { en: 'Call the clergy to curse the swarm', de: 'Den Klerus rufen, den Schwarm zu verfluchen' }, effect: (e) => { e.fx.estate('prelates', 5); e.fx.devastate(e.ctx.loc, 0.25); e.fx.concord(1); }, ai: 0.5 },
    ],
  },
  {
    id: 'cattle_murrain', art: 'harvest',
    title: { en: 'Murrain among the Cattle', de: 'Viehseuche' },
    text: {
      en: 'Oxen and cows are dying in the byres of {loc}, their tongues swollen and their eyes running. Without oxen the ploughs stand still, and the butchers sell meat no one trusts.',
      de: 'In den Ställen von {loc} sterben Ochsen und Kühe mit geschwollenen Zungen und tränenden Augen. Ohne Ochsen stehen die Pflüge still, und die Metzger verkaufen Fleisch, dem niemand traut.',
    },
    mtth: 300, cooldown: 25,
    trigger: (e) => settled(e) && e.n.capital >= 0 && e.w.lat[e.n.capital] > 40,
    setup: (e) => { e.ctx.loc = H.randomLoc(e, (l) => e.w.terrain[l] <= 3); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Slaughter and burn the sick herds', de: 'Die kranken Herden schlachten und verbrennen' }, effect: (e) => { e.fx.gold(-1); e.fx.estate('commons', -3); e.fx.devastate(e.ctx.loc, 0.05); e.fx.authority(4); }, ai: 0.7 },
      { label: { en: 'Buy oxen from abroad for the villages', de: 'Für die Dörfer Ochsen im Ausland kaufen' }, effect: (e) => { e.fx.gold(-2); e.fx.estate('commons', 6); }, ai: (e) => (rich(e, 5) ? 0.8 : 0.2) },
      { label: { en: 'Leave it to the herdsmen', de: 'Es den Hirten überlassen' }, effect: (e) => { e.fx.devastate(e.ctx.loc, 0.2); e.fx.pop(e.ctx.loc, -0.01); }, ai: 0.3 },
    ],
  },
  {
    id: 'st_anthonys_fire', art: 'plague',
    title: { en: 'Saint Anthony’s Fire', de: 'Das Antoniusfeuer' },
    text: {
      en: 'In the villages around {loc} people are seized by a burning in their limbs; some dance until they collapse, others lose fingers and feet. The Antonine brothers say the cure is pilgrimage and clean bread. The rye of the last wet harvest is black with spurs.',
      de: 'In den Dörfern um {loc} befällt die Menschen ein Brennen in den Gliedern; manche tanzen, bis sie zusammenbrechen, anderen sterben Finger und Füße ab. Die Antoniter sagen, Heilung bringe Wallfahrt und reines Brot. Der Roggen der letzten nassen Ernte ist schwarz von Mutterkorn.',
    },
    mtth: 200, cooldown: 30, maxYear: 1700,
    trigger: (e) => christian(e) && e.n.capital >= 0 && e.w.lat[e.n.capital] > 44 && e.w.lat[e.n.capital] < 58 && avgHarvest(e) < 0.95,
    setup: (e) => { e.ctx.loc = H.randomLoc(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Endow an Antonine hospital', de: 'Ein Antoniterspital stiften' }, effect: (e) => { e.fx.gold(-1.5); e.fx.estate('prelates', 8); e.fx.building(e.ctx.loc, BI.church, 1); }, ai: 0.6 },
      { label: { en: 'Forbid the sale of spoiled rye', de: 'Den Verkauf von verdorbenem Roggen verbieten' }, effect: (e) => { e.fx.estate('burghers', -4); e.fx.pop(e.ctx.loc, 0.01); e.fx.insight(3); e.fx.authority(3); }, ai: 0.7 },
    ],
  },
  {
    id: 'sweating_sickness', art: 'plague',
    title: { en: 'The Sweating Sickness', de: 'Der Englische Schweiß' },
    text: {
      en: 'A new sickness strikes {loc}: a sudden chill, then a fever and a drenching sweat, and by evening the victim is dead. It falls on the young and the strong, on lords and clerks rather than the poor.',
      de: 'Eine neue Krankheit befällt {loc}: ein plötzlicher Schüttelfrost, dann Fieber und ein durchnässender Schweiß, und am Abend ist der Kranke tot. Sie trifft die Jungen und Kräftigen, Herren und Schreiber eher als die Armen.',
    },
    mtth: 48, cooldown: 12, minYear: 1485, maxYear: 1552,
    trigger: (e) => owns(e, 'London') || owns(e, 'York') || owns(e, 'Calais'),
    setup: (e) => { const l = locByName(e.w, 'London'); e.ctx.loc = e.s.loc.owner[l] === e.n.id ? l : bigTown(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Move the court from town to town', de: 'Den Hof von Ort zu Ort verlegen' }, effect: (e) => { e.fx.gold(-1); e.fx.rulerHealth(0.05); e.fx.authority(-5); e.fx.pop(e.ctx.loc, -0.02); }, ai: 0.7 },
      { label: { en: 'Stay and keep the government running', de: 'Bleiben und die Regierung aufrechterhalten' }, effect: (e) => { e.fx.rulerHealth(-0.15); e.fx.mandate(5); e.fx.pop(e.ctx.loc, -0.03); }, ai: 0.4 },
    ],
  },
  {
    id: 'earthquake', art: 'fire',
    title: { en: 'The Earth Shakes at {loc}', de: 'Die Erde bebt bei {loc}' },
    text: {
      en: 'Shortly after vespers the ground heaved beneath {loc}. Church towers fell into the streets, and fires from overturned hearths burned through the night. Survivors camp in the fields, afraid to go home.',
      de: 'Kurz nach der Vesper hob sich der Boden unter {loc}. Kirchtürme stürzten in die Gassen, und Feuer aus umgestürzten Herden brannten die ganze Nacht. Die Überlebenden lagern auf den Feldern und fürchten sich heimzukehren.',
    },
    mtth: 240, cooldown: 25,
    trigger: (e) => e.n.capital >= 0 && e.w.lat[e.n.capital] < 46 && e.w.lon[e.n.capital] > 8 && e.w.lon[e.n.capital] < 45,
    setup: (e) => { e.ctx.loc = H.randomLoc(e, (l) => e.w.terrain[l] === 3 || e.w.terrain[l] === 4 || e.w.townSize[l] >= 3); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Rebuild with crown funds', de: 'Mit Mitteln der Krone wieder aufbauen' }, effect: (e) => { e.fx.gold(-2); e.fx.devastate(e.ctx.loc, 0.2); e.fx.concord(3); e.fx.estate('burghers', 4); }, ai: 0.7 },
      { label: { en: 'A day of penance across the realm', de: 'Ein Bußtag im ganzen Reich' }, effect: (e) => { e.fx.devastate(e.ctx.loc, 0.4); e.fx.estate('prelates', 6); e.fx.dev(e.ctx.loc, -0.5); }, ai: 0.4 },
    ],
  },
  {
    id: 'basel_earthquake', art: 'fire', major: true, once: true, minYear: 1356, maxYear: 1357,
    title: { en: 'The Basel Earthquake', de: 'Das Basler Erdbeben' },
    text: {
      en: 'On Saint Luke’s day the earth shook the Upper Rhine. In Basel the cathedral choir collapsed and the fire that followed burned for eight days; dozens of castles in the Jura lie in ruins.',
      de: 'Am Lukastag erschütterte die Erde den Oberrhein. In Basel stürzte der Chor des Münsters ein, und das folgende Feuer brannte acht Tage lang; Dutzende Burgen im Jura liegen in Trümmern.',
    },
    mtth: 1,
    trigger: (e) => owns(e, 'Basel') && e.month >= 8,
    setup: (e) => { e.ctx.loc = locByName(e.w, 'Basel'); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Rebuild the walls and the cathedral', de: 'Mauern und Münster wieder aufbauen' }, effect: (e) => { e.fx.gold(-3); e.fx.devastate(e.ctx.loc, 0.3); e.fx.estate('prelates', 8); e.fx.estate('burghers', 6); e.fx.prestige(3); }, ai: 0.8 },
      { label: { en: 'Rebuild the walls first', de: 'Zuerst die Mauern' }, effect: (e) => { e.fx.gold(-1.5); e.fx.devastate(e.ctx.loc, 0.4); e.fx.building(e.ctx.loc, BI.fort, 1); e.fx.estate('prelates', -4); }, ai: 0.5 },
    ],
  },
  {
    id: 'drought', art: 'harvest',
    title: { en: 'The Wells Run Dry', de: 'Die Brunnen versiegen' },
    text: {
      en: 'Not a drop of rain since Easter. Around {loc} the wells are dry, the millstreams have stopped, and the shepherds drive their flocks into the hills in search of grass.',
      de: 'Seit Ostern kein Tropfen Regen. Um {loc} sind die Brunnen trocken, die Mühlbäche stehen still, und die Hirten treiben ihre Herden auf der Suche nach Gras in die Berge.',
    },
    mtth: 150, cooldown: 12,
    trigger: (e) => e.n.capital >= 0 && e.w.arid[e.n.capital] > 0.35 && e.month >= 5 && e.month <= 8,
    setup: (e) => { e.ctx.loc = H.randomLoc(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Dig new cisterns and channels', de: 'Neue Zisternen und Kanäle graben' }, effect: (e) => { e.fx.gold(-2); e.fx.building(e.ctx.loc, BI.farm, 1); e.fx.estate('commons', 5); }, ai: (e) => (rich(e, 4) ? 0.8 : 0.2) },
      { label: { en: 'Pray for rain', de: 'Um Regen beten' }, effect: (e) => { e.fx.devastate(e.ctx.loc, 0.2); e.fx.estate('prelates', 4); e.fx.concord(1); }, ai: (e) => (muslim(e) ? 0.7 : 0.5) },
    ],
  },
  {
    id: 'french_disease', art: 'plague',
    title: { en: 'The New Pox', de: 'Die neuen Blattern' },
    text: {
      en: 'Soldiers returning from the wars in Italy have brought home a new disease: sores, rotting flesh, madness at the end. Each nation names it after its neighbour. The bathhouses of {loc} are blamed.',
      de: 'Aus den italienischen Kriegen heimkehrende Söldner haben eine neue Krankheit mitgebracht: Geschwüre, faulendes Fleisch, am Ende Wahnsinn. Jedes Volk benennt sie nach seinem Nachbarn. Man gibt den Badestuben von {loc} die Schuld.',
    },
    mtth: 60, oncePer: true, minYear: 1495, maxYear: 1560,
    trigger: (e) => christian(e) && settled(e) && e.n.capital >= 0 && e.w.lon[e.n.capital] > -10 && e.w.lon[e.n.capital] < 30,
    setup: (e) => { e.ctx.loc = bigTown(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Close the bathhouses', de: 'Die Badestuben schließen' }, effect: (e) => { e.fx.estate('burghers', -4); e.fx.estate('prelates', 4); e.fx.unrest(e.ctx.loc, 3); e.fx.authority(3); }, ai: 0.7 },
      { label: { en: 'Fund hospitals for the incurables', de: 'Spitäler für Unheilbare stiften' }, effect: (e) => { e.fx.gold(-1); e.fx.estate('prelates', 3); e.fx.concord(2); e.fx.insight(2); }, ai: 0.6 },
    ],
  },
  {
    id: 'inoculation', art: 'scholar',
    title: { en: 'Inoculation against the Smallpox', de: 'Impfung gegen die Pocken' },
    text: {
      en: 'Travellers from Constantinople describe how the Turks scratch a little matter from a mild smallpox into the skin of healthy children, who then take only a light illness and are spared ever after. Physicians at the court of {ruler} propose to try it.',
      de: 'Reisende aus Konstantinopel berichten, wie die Türken gesunden Kindern ein wenig Eiter einer milden Pockenerkrankung in die Haut ritzen; sie erkranken nur leicht und bleiben fortan verschont. Die Leibärzte von {ruler} schlagen vor, es zu versuchen.',
    },
    mtth: 60, oncePer: true, minYear: 1721, maxYear: 1815,
    trigger: (e) => settled(e) && eraAtLeast(e, 2),
    options: [
      { label: { en: 'Inoculate the heir first, as an example', de: 'Zuerst den Thronfolger impfen, als Vorbild' }, effect: (e) => { e.fx.prestige(5); e.fx.insight(6); e.fx.modifier('inoculation', 30, { en: 'Inoculation', de: 'Pockenimpfung' }, { manpower: 0.05 }); const h = heir(e); if (h) h.health = Math.max(0, h.health - 0.05); }, ai: 0.6 },
      { label: { en: 'Allow it for those who wish', de: 'Es denen erlauben, die es wünschen' }, effect: (e) => { e.fx.insight(3); e.fx.modifier('inoculation', 20, { en: 'Inoculation', de: 'Pockenimpfung' }, { manpower: 0.03 }); }, ai: 0.8 },
      { label: { en: 'It is tempting Providence', de: 'Das heißt, die Vorsehung herauszufordern' }, effect: (e) => { e.fx.estate('prelates', 5); e.fx.value(2, -3); }, ai: 0.2 },
    ],
  },
];
