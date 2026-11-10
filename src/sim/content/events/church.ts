// Faith and the churches: schism and councils, reformers, pilgrimages, relics, jubilees,
// Jewish communities, Islamic foundations and the Orthodox patriarchate.
import type { EventDef, EvApi } from '../../systems/events';
import { H } from '../../systems/events';
import { BI } from '../../defs';
import { pick } from '../../rng';
import { bigTown, christian, latin, muslim, protestant, faithIs, settled, rich, est, anyBuilding, locByName, isKey, monarchy } from './util';

const JUBILEES = [1390, 1400, 1423, 1450, 1475, 1500, 1525, 1550, 1575, 1600, 1625, 1650, 1675, 1700, 1725, 1750, 1775];
const pope = (e: EvApi) => (e.s.papacy.holder >= 0 && e.s.nations[e.s.papacy.holder]?.alive ? e.s.papacy.holder : -1);
const curia = (e: EvApi, v: number) => { if (latin(e)) e.s.papacy.curiaFavour[e.n.id] = Math.max(0, Math.min(100, (e.s.papacy.curiaFavour[e.n.id] || 0) + v)); };

export const CHURCH_EVENTS: EventDef[] = [
  {
    id: 'western_schism', art: 'church', major: true, once: true, minYear: 1378, maxYear: 1385,
    title: { en: 'Two Popes', de: 'Zwei Päpste' },
    text: {
      en: 'The cardinals who elected Urban VI in Rome under the threats of the Roman mob have fled to Fondi and declared the election void. They have chosen a second pope, who means to return to Avignon. Christendom must now ask which of the two is the true shepherd.',
      de: 'Die Kardinäle, die unter den Drohungen des römischen Volkes Urban VI. gewählt hatten, sind nach Fondi geflohen und haben die Wahl für nichtig erklärt. Sie haben einen zweiten Papst erhoben, der nach Avignon zurückkehren will. Die Christenheit muss nun fragen, welcher der beiden der wahre Hirte ist.',
    },
    mtth: 3,
    trigger: (e) => e.n.id === pope(e),
    options: [
      { label: { en: 'Excommunicate the antipope and his cardinals', de: 'Den Gegenpapst und seine Kardinäle bannen' }, effect: (e) => { e.s.papacy.schism = true; e.fx.authority(10); e.fx.prestige(-5); e.fx.estate('prelates', 6); e.fx.concord(-5); }, ai: 0.8 },
      { label: { en: 'Seek a settlement through a general council', de: 'Einen Ausgleich durch ein allgemeines Konzil suchen' }, effect: (e) => { e.s.papacy.schism = true; e.s.papacy.reformPressure += 10; e.fx.mandate(-5); e.fx.estate('prelates', -4); e.fx.insight(5); }, ai: 0.3 },
    ],
  },
  {
    id: 'schism_obedience', art: 'church',
    title: { en: 'Rome or Avignon?', de: 'Rom oder Avignon?' },
    text: {
      en: 'Envoys of both popes have come to the court of {ruler}, each bearing bulls, benefices and threats. The bishops of {nation} are divided; the university masters say a king who chooses wrongly imperils his soul and his realm.',
      de: 'Gesandte beider Päpste sind am Hof von {ruler} erschienen, jeder mit Bullen, Pfründen und Drohungen. Die Bischöfe von {nation} sind uneins; die Magister der Universität sagen, ein König, der falsch wählt, gefährde seine Seele und sein Reich.',
    },
    mtth: 12, oncePer: true, minYear: 1378, maxYear: 1418,
    trigger: (e) => latin(e) && e.s.papacy.schism && e.n.id !== pope(e) && settled(e),
    options: [
      { label: { en: 'Obey the Roman pope', de: 'Dem römischen Papst gehorchen' }, effect: (e) => { e.fx.flag('obedience', 1); e.fx.opinion(pope(e), 15); e.fx.estate('prelates', 4); curia(e, 10); const fr = e.s.nations.find((x) => x.key === 'france'); if (fr) e.fx.opinion(fr.id, -10); }, ai: (e) => (isKey(e, 'france', 'scotland', 'castile', 'aragon', 'navarre', 'naples') ? 0.2 : 0.8) },
      { label: { en: 'Obey the pope of Avignon', de: 'Dem Papst von Avignon gehorchen' }, effect: (e) => { e.fx.flag('obedience', 2); e.fx.opinion(pope(e), -15); const fr = e.s.nations.find((x) => x.key === 'france'); if (fr && fr.id !== e.n.id) e.fx.opinion(fr.id, 15); e.fx.estate('prelates', 2); e.fx.authority(5); }, ai: (e) => (isKey(e, 'france', 'scotland', 'castile', 'aragon', 'navarre', 'naples', 'savoy') ? 0.9 : 0.3) },
      { label: { en: 'Declare neutrality and keep the annates', de: 'Neutralität erklären und die Annaten behalten' }, effect: (e) => { e.fx.flag('obedience', 3); e.fx.gold(1.5); e.fx.estate('prelates', -8); e.fx.authority(8); curia(e, -10); }, ai: 0.3 },
    ],
  },
  {
    id: 'conciliar_movement', art: 'scholar',
    title: { en: 'Council above Pope', de: 'Konzil über Papst' },
    text: {
      en: 'Masters of Paris and Vienna argue that a general council of the Church stands above any pope and may depose him. Their tracts are read aloud in the cathedral chapters of {nation}, and the bishops ask {ruler} whether to send delegates.',
      de: 'Magister aus Paris und Wien lehren, ein allgemeines Konzil der Kirche stehe über jedem Papst und könne ihn absetzen. Ihre Traktate werden in den Domkapiteln von {nation} vorgelesen, und die Bischöfe fragen {ruler}, ob man Abgesandte schicken soll.',
    },
    mtth: 48, oncePer: true, minYear: 1395, maxYear: 1450,
    trigger: (e) => latin(e) && settled(e) && e.n.id !== pope(e) && (e.s.papacy.schism || e.s.papacy.reformPressure > 15),
    options: [
      { label: { en: 'Send a learned delegation', de: 'Eine gelehrte Gesandtschaft schicken' }, effect: (e) => { e.fx.gold(-1); e.fx.prestige(4); e.fx.insight(4); e.fx.opinion(pope(e), -5); e.s.papacy.reformPressure += 2; }, ai: 0.7 },
      { label: { en: 'Stand by the papal monarchy', de: 'Zur päpstlichen Monarchie stehen' }, effect: (e) => { e.fx.opinion(pope(e), 10); curia(e, 8); e.fx.estate('prelates', 3); e.fx.value(2, -2); }, ai: 0.5 },
    ],
  },
  {
    id: 'poor_preachers', art: 'church',
    title: { en: 'The Poor Preachers', de: 'Die armen Prediger' },
    text: {
      en: 'Wandering preachers in russet gowns are teaching in the market of {loc} that a priest in mortal sin cannot make the sacrament, that the Church should hold no lands, and that every man should read Scripture in his own tongue.',
      de: 'Wanderprediger in groben Kutten lehren auf dem Markt von {loc}, ein Priester in Todsünde könne kein Sakrament spenden, die Kirche solle kein Land besitzen und jeder solle die Schrift in seiner eigenen Sprache lesen.',
    },
    mtth: 120, cooldown: 25, minYear: 1370, maxYear: 1500,
    trigger: (e) => latin(e) && settled(e) && (e.s.papacy.schism || e.s.papacy.reformPressure > 10 || est(e, 'prelates').contentment > 60),
    setup: (e) => { e.ctx.loc = bigTown(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Hand them over to the bishops', de: 'Sie den Bischöfen ausliefern' }, effect: (e) => { e.fx.estate('prelates', 8); e.fx.estate('commons', -4); e.fx.unrest(e.ctx.loc, 4); curia(e, 5); }, ai: 0.7 },
      { label: { en: 'Let them preach; their words on church lands are useful', de: 'Sie predigen lassen; ihre Worte über Kirchengut sind nützlich' }, effect: (e) => { e.fx.estate('prelates', -8); e.fx.estate('commons', 5); e.fx.authority(10); e.fx.value(3, 4); }, ai: 0.3 },
    ],
  },
  {
    id: 'hussite_ideas', art: 'church',
    title: { en: 'The Chalice Crosses the Border', de: 'Der Kelch überschreitet die Grenze' },
    text: {
      en: 'Students returning from Prague and refugees from the wars in Bohemia bring the teachings of Master Jan Hus to {loc}: communion in both kinds, preaching in the common tongue, no simony. Some townsmen have painted a chalice on their doors.',
      de: 'Aus Prag heimkehrende Studenten und Flüchtlinge aus den böhmischen Kriegen bringen die Lehren des Magisters Jan Hus nach {loc}: das Abendmahl in beiderlei Gestalt, Predigt in der Volkssprache, keine Simonie. Manche Bürger haben einen Kelch an ihre Türen gemalt.',
    },
    mtth: 60, cooldown: 30, minYear: 1420, maxYear: 1500,
    trigger: (e) => latin(e) && H.neighbourNations(e).some((o) => e.s.nations[o].faith === H.faith('hussite') || e.s.nations[o].key === 'bohemia'),
    setup: (e) => { e.ctx.loc = bigTown(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Burn the books and banish the preachers', de: 'Die Bücher verbrennen und die Prediger verbannen' }, effect: (e) => { e.fx.estate('prelates', 6); e.fx.unrest(e.ctx.loc, 6); e.fx.authority(4); curia(e, 6); }, ai: 0.7 },
      { label: { en: 'Tolerate them quietly', de: 'Sie stillschweigend dulden' }, effect: (e) => { e.fx.estate('prelates', -6); e.fx.estate('burghers', 4); e.fx.value(3, 5); e.fx.unrest(e.ctx.loc, -2); }, ai: 0.3 },
    ],
  },
  {
    id: 'indulgence_seller', art: 'church',
    title: { en: 'The Indulgence Preacher', de: 'Der Ablassprediger' },
    text: {
      en: 'A Dominican with a great iron-bound chest has set up in {loc}: "As soon as the coin in the coffer rings, the soul from purgatory springs." The money is for a new basilica in Rome; a third is promised to {ruler}.',
      de: 'Ein Dominikaner mit einer großen eisenbeschlagenen Truhe hat sich in {loc} niedergelassen: „Sobald das Geld im Kasten klingt, die Seele aus dem Fegefeuer springt.“ Das Geld ist für eine neue Basilika in Rom bestimmt; ein Drittel ist {ruler_dat} versprochen.',
    },
    mtth: 72, cooldown: 20, minYear: 1450, maxYear: 1540,
    trigger: (e) => latin(e) && settled(e),
    setup: (e) => { e.ctx.loc = bigTown(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Take our third', de: 'Unser Drittel nehmen' }, effect: (e) => { e.fx.gold(2); e.fx.estate('prelates', 4); e.fx.estate('commons', -4); e.s.papacy.reformPressure += 2; curia(e, 5); }, ai: 0.7 },
      { label: { en: 'Forbid the preaching in our lands', de: 'Die Predigt in unseren Landen verbieten' }, effect: (e) => { e.fx.estate('prelates', -6); e.fx.estate('burghers', 4); e.fx.opinion(pope(e), -10); curia(e, -8); e.fx.authority(6); }, ai: 0.3 },
    ],
  },
  {
    id: 'vernacular_bible', art: 'scholar',
    title: { en: 'Scripture in Our Tongue', de: 'Die Schrift in unserer Sprache' },
    text: {
      en: 'A printer of {loc} has set the whole Bible in the language of {nation} and asks for a royal privilege against reprints. The bishops warn that unlearned readers will fall into error; the burghers have already ordered copies.',
      de: 'Ein Drucker in {loc} hat die ganze Bibel in der Sprache von {nation} gesetzt und bittet um ein königliches Privileg gegen Nachdrucke. Die Bischöfe warnen, ungelehrte Leser würden in Irrtum fallen; die Bürger haben schon Exemplare bestellt.',
    },
    mtth: 72, oncePer: true, minYear: 1460, maxYear: 1650,
    trigger: (e) => christian(e) && settled(e) && (anyBuilding(e, 'university') || e.year > 1520),
    setup: (e) => { e.ctx.loc = bigTown(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Grant the privilege', de: 'Das Privileg gewähren' }, effect: (e) => { e.fx.estate('burghers', 6); e.fx.estate('prelates', -6); e.fx.insight(6); e.fx.value(2, 5); e.fx.modifier('vernacular_bible', 20, { en: 'Bible in the vernacular', de: 'Bibel in der Volkssprache' }, { research: 0.03 }); }, ai: (e) => (protestant(e) ? 1 : 0.5) },
      { label: { en: 'Only with the bishops’ approval', de: 'Nur mit Billigung der Bischöfe' }, effect: (e) => { e.fx.estate('prelates', 4); e.fx.insight(2); }, ai: 0.6 },
      { label: { en: 'Confiscate the sheets', de: 'Die Bögen beschlagnahmen' }, effect: (e) => { e.fx.estate('prelates', 8); e.fx.estate('burghers', -8); e.fx.value(2, -4); curia(e, 6); }, ai: (e) => (protestant(e) ? 0 : 0.3) },
    ],
  },
  {
    id: 'reform_preacher', art: 'church', major: true,
    title: { en: 'A Preacher of Reform in {loc}', de: 'Ein Reformprediger in {loc}' },
    text: {
      en: 'A former monk preaches in {loc} that salvation comes by faith alone, that the pope is no lord over consciences, and that monks and nuns should leave their cloisters and marry. The churches are full; the bishop demands his arrest.',
      de: 'Ein ehemaliger Mönch predigt in {loc}, das Heil komme allein aus dem Glauben, der Papst sei kein Herr über die Gewissen, und Mönche und Nonnen sollten ihre Klöster verlassen und heiraten. Die Kirchen sind voll; der Bischof verlangt seine Verhaftung.',
    },
    mtth: 48, cooldown: 20, minYear: 1517, maxYear: 1620,
    trigger: (e) => latin(e) && settled(e) && e.n.capital >= 0 && e.w.lat[e.n.capital] > 43,
    setup: (e) => { e.ctx.loc = bigTown(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Arrest him and enforce the old faith', de: 'Ihn verhaften und den alten Glauben durchsetzen' }, effect: (e) => { e.fx.estate('prelates', 8); e.fx.unrest(e.ctx.loc, 8); e.fx.estate('burghers', -4); curia(e, 10); e.fx.opinion(pope(e), 10); }, ai: 0.6 },
      { label: { en: 'Grant him a safe conduct to debate', de: 'Ihm freies Geleit zur Disputation gewähren' }, effect: (e) => { e.fx.insight(4); e.fx.value(3, 4); e.fx.estate('prelates', -4); e.fx.estate('burghers', 4); }, ai: 0.5 },
      { label: { en: 'Embrace the evangelical cause', de: 'Sich der evangelischen Sache anschließen' }, effect: (e) => { e.fx.convertRealm(H.faith(e.n.capital >= 0 && e.w.lon[e.n.capital] < 8 && e.w.lat[e.n.capital] < 48 ? 'reformed' : 'evangelical')); e.fx.faithAt(e.ctx.loc, e.n.faith); e.fx.estate('prelates', -25, -10); e.fx.estate('burghers', 8); e.fx.gold(3); e.fx.concord(-15); e.fx.opinion(pope(e), -40, 20); }, ai: (e) => (e.n.isHRE && est(e, 'prelates').contentment < 45 ? 0.6 : 0.1) },
    ],
  },
  {
    id: 'dissolution_monasteries', art: 'church',
    title: { en: 'The Cloister Lands', de: 'Das Klostergut' },
    text: {
      en: 'Since the new teaching took hold, the cloisters of {nation} stand half empty. Their fields, mills and fishponds are still vast. The council of {ruler} proposes to take them for the crown; the preachers want them for schools and poor relief.',
      de: 'Seit die neue Lehre Fuß gefasst hat, stehen die Klöster von {nation} halb leer. Ihre Felder, Mühlen und Fischteiche sind noch immer gewaltig. Der Rat von {ruler} schlägt vor, sie für die Krone einzuziehen; die Prediger wollen sie für Schulen und Armenpflege.',
    },
    mtth: 24, oncePer: true, minYear: 1520, maxYear: 1700,
    trigger: (e) => protestant(e) && settled(e),
    options: [
      { label: { en: 'Seize them for the treasury', de: 'Sie für die Schatzkammer einziehen' }, effect: (e) => { e.fx.gold(6); e.fx.estate('prelates', -15); e.fx.estate('magnates', 6); e.fx.authority(15); e.fx.unrestAll(3); }, ai: 0.6 },
      { label: { en: 'Endow schools and hospitals', de: 'Schulen und Spitäler stiften' }, effect: (e) => { e.fx.gold(1); e.fx.estate('prelates', 2); e.fx.estate('commons', 6); e.fx.insight(6); e.fx.building(e.n.capital, BI.church, 1); }, ai: 0.5 },
      { label: { en: 'Sell them to the gentry', de: 'Sie an den Landadel verkaufen' }, effect: (e) => { e.fx.gold(4); e.fx.estate('magnates', 12, 3); e.fx.estate('prelates', -10); }, ai: 0.4 },
    ],
  },
  {
    id: 'monastery_foundation', art: 'church',
    title: { en: 'A Pious Foundation', de: 'Eine fromme Stiftung' },
    text: {
      en: 'A widowed noblewoman of {nation} wishes to found a house of prayer at {loc} for the souls of her husband and sons. She asks {ruler} to add crown land to her gift so that the foundation may be worthy.',
      de: 'Eine verwitwete Adlige aus {nation} möchte in {loc} ein Haus des Gebets für die Seelen ihres Gatten und ihrer Söhne stiften. Sie bittet {ruler}, Krongut zu ihrer Gabe hinzuzufügen, damit die Stiftung würdig sei.',
    },
    mtth: 300, cooldown: 30,
    trigger: (e) => christian(e) && !protestant(e) && settled(e),
    setup: (e) => { e.ctx.loc = H.randomLoc(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Add a generous grant of land', de: 'Eine großzügige Landschenkung hinzufügen' }, effect: (e) => { e.fx.gold(-1); e.fx.estate('prelates', 8); e.fx.building(e.ctx.loc, BI.church, 1); e.fx.mandate(3); }, ai: 0.7 },
      { label: { en: 'Bless it, but give nothing', de: 'Sie segnen, aber nichts geben' }, effect: (e) => { e.fx.estate('prelates', 1); e.fx.estate('magnates', -2); }, ai: 0.5 },
    ],
  },
  {
    id: 'royal_pilgrimage', art: 'church',
    title: { en: 'The Road to {loc}', de: 'Der Weg nach {loc}' },
    text: {
      en: '{ruler} has vowed a pilgrimage to {loc}. The councillors fear for the realm in the ruler’s absence and for the cost of the retinue; the confessor says a vow is a vow.',
      de: '{ruler} hat eine Wallfahrt nach {loc} gelobt. Die Räte fürchten um das Reich in Abwesenheit des Herrschers und um die Kosten des Gefolges; der Beichtvater sagt, Gelübde sei Gelübde.',
    },
    mtth: 200, cooldown: 30,
    trigger: (e) => christian(e) && !protestant(e) && settled(e) && !H.atWar(e.s, e.n.id) && rich(e, 3),
    setup: (e) => { const opts = ['Santiago de Compostela', 'Rome', 'Jerusalem'].map((x) => locByName(e.w, x)).filter((l) => l >= 0); if (e.n.faith === H.faith('orthodox')) { const k = locByName(e.w, 'Kiev'); if (k >= 0) opts.splice(0, opts.length, k); } e.ctx.loc = opts.length ? pick(e.s.rng, opts) : -1; return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Go in splendour', de: 'Mit Prunk reisen' }, effect: (e) => { e.fx.gold(-2); e.fx.prestige(6); e.fx.mandate(6); e.fx.estate('prelates', 6); e.fx.authority(-10); }, ai: 0.6 },
      { label: { en: 'Go as a humble penitent', de: 'Als demütiger Büßer reisen' }, effect: (e) => { e.fx.gold(-0.5); e.fx.mandate(4); e.fx.concord(3); e.fx.rulerHealth(-0.05); }, ai: 0.6 },
      { label: { en: 'Send a proxy with rich gifts', de: 'Einen Stellvertreter mit reichen Gaben senden' }, effect: (e) => { e.fx.gold(-1); e.fx.estate('prelates', 3); e.fx.mandate(-2); }, ai: 0.4 },
    ],
  },
  {
    id: 'hajj_ruler', art: 'church',
    title: { en: 'The Pilgrimage to Mecca', de: 'Die Pilgerfahrt nach Mekka' },
    text: {
      en: 'The scholars remind {ruler} that the Hajj is owed by every believer who is able. A caravan is being gathered; the ruler may go in person, send a lavish litter with alms for the poor of the holy cities, or fund wells along the pilgrim road.',
      de: 'Die Gelehrten erinnern {ruler} daran, dass jeder Gläubige, der dazu fähig ist, die Haddsch schuldet. Eine Karawane wird zusammengestellt; der Herrscher kann selbst reisen, eine prächtige Sänfte mit Almosen für die Armen der heiligen Städte schicken oder Brunnen entlang des Pilgerwegs stiften.',
    },
    mtth: 200, cooldown: 30,
    trigger: (e) => muslim(e) && !H.atWar(e.s, e.n.id) && rich(e, 3),
    options: [
      { label: { en: 'Make the pilgrimage in person', de: 'Die Pilgerfahrt selbst antreten' }, effect: (e) => { e.fx.gold(-2); e.fx.prestige(8); e.fx.mandate(8); e.fx.authority(-15); e.fx.rulerHealth(-0.05); }, ai: 0.5 },
      { label: { en: 'Send the mahmal with alms', de: 'Den Mahmal mit Almosen schicken' }, effect: (e) => { e.fx.gold(-1.5); e.fx.prestige(4); e.fx.estate('prelates', 6); }, ai: 0.7 },
      { label: { en: 'Endow wells and caravanserais', de: 'Brunnen und Karawansereien stiften' }, effect: (e) => { e.fx.gold(-2); e.fx.estate('burghers', 5); e.fx.estate('prelates', 3); e.fx.modifier('pilgrim_road', 15, { en: 'Pilgrim road', de: 'Pilgerweg' }, { trade: 0.04 }); }, ai: 0.5 },
    ],
  },
  {
    id: 'relic_found', art: 'church',
    title: { en: 'Bones beneath the Altar', de: 'Gebeine unter dem Altar' },
    text: {
      en: 'Masons repairing the old church at {loc} have found a lead casket with bones wrapped in silk and a parchment naming a martyr of the early Church. Already the sick are being carried to the spot.',
      de: 'Maurer, die die alte Kirche in {loc} ausbessern, haben einen Bleisarg mit in Seide gehüllten Gebeinen und einem Pergament gefunden, das einen Märtyrer der frühen Kirche nennt. Schon trägt man Kranke an die Stelle.',
    },
    mtth: 300, cooldown: 40, maxYear: 1650,
    trigger: (e) => christian(e) && !protestant(e) && settled(e),
    setup: (e) => { e.ctx.loc = H.randomLoc(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Build a shrine for the pilgrims', de: 'Einen Schrein für die Pilger errichten' }, effect: (e) => { e.fx.gold(-1); e.fx.building(e.ctx.loc, BI.church, 1); e.fx.dev(e.ctx.loc, 0.5); e.fx.estate('prelates', 6); }, ai: 0.8 },
      { label: { en: 'Have the bishop examine the bones', de: 'Den Bischof die Gebeine prüfen lassen' }, effect: (e) => { e.fx.insight(2); e.fx.estate('prelates', 2); e.fx.authority(3); }, ai: 0.4 },
    ],
  },
  {
    id: 'jubilee_year', art: 'church',
    title: { en: 'The Holy Year {year}', de: 'Das Heilige Jahr {year}' },
    text: {
      en: 'The pope has proclaimed a Holy Year: a full remission of sins for all who visit the basilicas of Rome. Thousands from {nation} are already on the roads south, and their purses go with them.',
      de: 'Der Papst hat ein Heiliges Jahr ausgerufen: vollkommenen Ablass für alle, die die Basiliken Roms besuchen. Tausende aus {nation} sind schon auf dem Weg nach Süden, und ihre Geldbeutel gehen mit ihnen.',
    },
    mtth: 10, cooldown: 9,
    trigger: (e) => latin(e) && settled(e) && JUBILEES.includes(e.year),
    options: [
      { label: { en: 'Encourage the pilgrims', de: 'Die Pilger ermutigen' }, effect: (e) => { e.fx.gold(-0.5); e.fx.estate('prelates', 5); e.fx.concord(4); curia(e, 8); }, ai: 0.7 },
      { label: { en: 'Forbid the export of coin with them', de: 'Die Ausfuhr von Münzen mit ihnen verbieten' }, effect: (e) => { e.fx.gold(0.5); e.fx.estate('commons', -3); e.fx.estate('prelates', -3); curia(e, -4); }, ai: 0.3 },
      { label: { en: 'Proclaim a jubilee indulgence at home', de: 'Einen Jubiläumsablass im eigenen Land verkünden' }, effect: (e) => { e.fx.gold(1); e.fx.estate('prelates', 2); e.fx.opinion(pope(e), -5); }, ai: 0.4 },
    ],
  },
  {
    id: 'jewish_charter', art: 'court',
    title: { en: 'A Charter for the Jewish Community', de: 'Ein Schutzbrief für die jüdische Gemeinde' },
    text: {
      en: 'The elders of the Jewish community of {loc} ask {ruler} to renew their charter: the right to build a synagogue, to keep their own courts, to lend and trade, and protection of their persons and property under the crown’s peace.',
      de: 'Die Ältesten der jüdischen Gemeinde von {loc} bitten {ruler}, ihren Schutzbrief zu erneuern: das Recht, eine Synagoge zu bauen, eigene Gerichte zu halten, zu leihen und zu handeln, und den Schutz von Leib und Gut unter dem Frieden der Krone.',
    },
    mtth: 300, cooldown: 40,
    trigger: (e) => settled(e) && e.n.faith !== H.faith('jewish') && e.w.townSize[e.n.capital] >= 2 && e.n.capital >= 0 && e.w.lon[e.n.capital] > -10 && e.w.lon[e.n.capital] < 45,
    setup: (e) => { e.ctx.loc = bigTown(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Renew the charter in full', de: 'Den Schutzbrief vollständig erneuern' }, effect: (e) => { e.fx.gold(1); e.fx.estate('prelates', -4); e.fx.modifier('jewish_charter', 25, { en: 'Jewish charter', de: 'Jüdischer Schutzbrief' }, { trade: 0.04, tolerance: 0.1, interest: -0.01 }); }, ai: 0.7 },
      { label: { en: 'Renew it for a heavy fee', de: 'Ihn gegen eine hohe Gebühr erneuern' }, effect: (e) => { e.fx.gold(3); e.fx.modifier('jewish_charter', 15, { en: 'Jewish charter', de: 'Jüdischer Schutzbrief' }, { trade: 0.02 }); }, ai: 0.5 },
      { label: { en: 'Let it lapse', de: 'Ihn auslaufen lassen' }, effect: (e) => { e.fx.estate('prelates', 3); e.fx.estate('burghers', -2); e.fx.value(3, -3); }, ai: 0.2 },
    ],
  },
  {
    id: 'expulsion_demand', art: 'revolt',
    title: { en: 'Agitation against the Jews', de: 'Hetze gegen die Juden' },
    text: {
      en: 'After a sermon in {loc} a mob has gathered before the Jewish quarter, repeating old slanders. Debtors of Jewish lenders and some clergy urge {ruler} to expel the community and cancel what is owed to them. The elders appeal to the crown that has taxed and protected them for generations.',
      de: 'Nach einer Predigt in {loc} hat sich vor dem Judenviertel ein Haufen versammelt, der alte Verleumdungen wiederholt. Schuldner jüdischer Geldverleiher und einige Geistliche drängen {ruler}, die Gemeinde zu vertreiben und die Schulden zu tilgen. Die Ältesten rufen die Krone an, die sie seit Generationen besteuert und beschützt hat.',
    },
    mtth: 200, cooldown: 50, maxYear: 1650,
    trigger: (e) => christian(e) && settled(e) && (e.n.flags.ev_jewish_charter !== undefined || e.n.modifiers.some((m) => m.id === 'protected_jews' || m.id === 'jewish_charter')) && H.avgUnrest(e) > 4,
    setup: (e) => { e.ctx.loc = bigTown(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Send soldiers to protect the quarter', de: 'Soldaten zum Schutz des Viertels schicken' }, effect: (e) => { e.fx.authority(5); e.fx.estate('commons', -4); e.fx.estate('prelates', -3); e.fx.unrest(e.ctx.loc, 4); e.fx.modifier('protected_jews', 15, { en: 'Protected communities', de: 'Geschützte Gemeinden' }, { trade: 0.03, tolerance: 0.1 }); }, ai: 0.7 },
      { label: { en: 'Protect them, but demand a special levy', de: 'Sie schützen, aber eine Sonderabgabe verlangen' }, effect: (e) => { e.fx.gold(2); e.fx.unrest(e.ctx.loc, 2); e.fx.estate('burghers', -2); }, ai: 0.5 },
      { label: { en: 'Order the expulsion', de: 'Die Vertreibung anordnen' }, hint: { en: 'A grave injustice: the realm loses its lenders, physicians and merchants for generations.', de: 'Ein schweres Unrecht: Das Reich verliert auf Generationen seine Geldgeber, Ärzte und Kaufleute.' }, effect: (e) => { e.fx.gold(2); e.fx.estate('prelates', 5); e.fx.estate('commons', 3); e.fx.removeModifier('jewish_charter'); e.fx.removeModifier('protected_jews'); e.fx.modifier('expelled_jews', 50, { en: 'Expelled communities', de: 'Vertriebene Gemeinden' }, { trade: -0.05, research: -0.03, interest: 0.01 }); e.fx.flag('expelled_jews'); }, ai: 0.15 },
    ],
  },
  {
    id: 'sephardi_refugees', art: 'ship',
    title: { en: 'Exiles from Sepharad', de: 'Vertriebene aus Sepharad' },
    text: {
      en: 'Ships crowded with Jewish families driven out of Spain and Portugal have put in at {loc}. They have lost almost everything, but among them are physicians, printers, weavers and merchants with kin in every port of the Mediterranean.',
      de: 'Schiffe voller jüdischer Familien, die aus Spanien und Portugal vertrieben wurden, haben in {loc} angelegt. Sie haben fast alles verloren, doch unter ihnen sind Ärzte, Drucker, Weber und Kaufleute mit Verwandten in jedem Hafen des Mittelmeers.',
    },
    mtth: 24, oncePer: true, minYear: 1492, maxYear: 1530,
    trigger: (e) => settled(e) && !isKey(e, 'castile', 'aragon', 'portugal') && !e.n.flags.expelled_jews && e.n.capital >= 0 && e.w.lon[e.n.capital] > -10 && e.w.lon[e.n.capital] < 40 && e.w.lat[e.n.capital] < 46,
    setup: (e) => { e.ctx.loc = H.randomLoc(e, (l) => !!e.w.coastal[l]); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Welcome them and grant them quarters', de: 'Sie willkommen heißen und ihnen Wohnstätten geben' }, effect: (e) => { e.fx.gold(-0.5); e.fx.pop(e.ctx.loc, 0.02); e.fx.estate('burghers', 3); e.fx.insight(4); e.fx.modifier('sephardi', 30, { en: 'Sephardic newcomers', de: 'Sephardische Zuwanderer' }, { trade: 0.05, research: 0.03 }); }, ai: (e) => (muslim(e) || isKey(e, 'venice', 'papal_states', 'ferrara', 'mantua') ? 0.9 : 0.6) },
      { label: { en: 'Allow them to stay for a fee', de: 'Ihnen gegen Gebühr den Aufenthalt erlauben' }, effect: (e) => { e.fx.gold(1); e.fx.modifier('sephardi', 15, { en: 'Sephardic newcomers', de: 'Sephardische Zuwanderer' }, { trade: 0.02 }); }, ai: 0.5 },
      { label: { en: 'Turn the ships away', de: 'Die Schiffe abweisen' }, effect: (e) => { e.fx.estate('prelates', 3); e.fx.prestige(-2); e.fx.value(3, -3); }, ai: 0.2 },
    ],
  },
  {
    id: 'waqf_foundation', art: 'church',
    title: { en: 'A Pious Endowment', de: 'Eine fromme Stiftung (Waqf)' },
    text: {
      en: 'A wealthy emir of {nation} wishes to place his estates near {loc} in waqf, so that their rents may forever support a madrasa, a hospital and a public fountain. Once endowed, the land can never be taxed or seized.',
      de: 'Ein reicher Emir von {nation} möchte seine Güter bei {loc} als Waqf stiften, damit ihre Erträge für immer eine Madrasa, ein Spital und einen öffentlichen Brunnen tragen. Einmal gestiftet, kann das Land nie mehr besteuert oder eingezogen werden.',
    },
    mtth: 150, cooldown: 25,
    trigger: (e) => muslim(e) && settled(e),
    setup: (e) => { e.ctx.loc = bigTown(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Confirm the endowment', de: 'Die Stiftung bestätigen' }, effect: (e) => { e.fx.building(e.ctx.loc, BI.church, 1); e.fx.estate('prelates', 8); e.fx.dev(e.ctx.loc, 0.5); e.fx.modifier('waqf', 20, { en: 'Great waqf', de: 'Großer Waqf' }, { tax: -0.02, unrest: -1 }); }, ai: 0.8 },
      { label: { en: 'Confirm it, but keep the land taxable', de: 'Sie bestätigen, das Land aber steuerpflichtig halten' }, effect: (e) => { e.fx.estate('prelates', -3); e.fx.estate('magnates', -3); e.fx.building(e.ctx.loc, BI.church, 1); e.fx.authority(5); }, ai: 0.4 },
    ],
  },
  {
    id: 'ulama_kanun', art: 'court',
    title: { en: 'The Jurists and the Sultan’s Law', de: 'Die Rechtsgelehrten und das Herrscherrecht' },
    text: {
      en: 'The chief qadi of {nation} protests that the ruler’s new decrees on land and taxes go beyond what the sacred law allows. Without a fatwa approving them, the jurists will not apply them in their courts.',
      de: 'Der oberste Kadi von {nation} protestiert, die neuen Erlasse des Herrschers über Land und Steuern gingen über das hinaus, was das heilige Gesetz erlaube. Ohne eine billigende Fatwa werden die Rechtsgelehrten sie in ihren Gerichten nicht anwenden.',
    },
    mtth: 150, cooldown: 25,
    trigger: (e) => muslim(e) && monarchy(e) && e.n.authority > 60,
    options: [
      { label: { en: 'Win the mufti over with gifts', de: 'Den Mufti mit Geschenken gewinnen' }, effect: (e) => { e.fx.gold(-1); e.fx.authority(5); e.fx.estate('prelates', 4); }, ai: 0.6 },
      { label: { en: 'Replace the qadi with a pliant man', de: 'Den Kadi durch einen gefügigen Mann ersetzen' }, effect: (e) => { e.fx.authority(10); e.fx.estate('prelates', -10); e.fx.mandate(-4); }, ai: 0.4 },
      { label: { en: 'Withdraw the decrees', de: 'Die Erlasse zurücknehmen' }, effect: (e) => { e.fx.authority(-15); e.fx.estate('prelates', 8); e.fx.concord(3); }, ai: 0.3 },
    ],
  },
  {
    id: 'union_of_florence', art: 'church', major: true,
    title: { en: 'The Union of the Churches', de: 'Die Union der Kirchen' },
    text: {
      en: 'At Florence the Emperor of the Romans and the Patriarch have signed a union with the Latin Church, in return for promises of a crusade against the Turks. When the delegates of {nation} returned, crowds cried that they had sold the faith. The monks of the great monasteries refuse to commemorate the pope.',
      de: 'In Florenz haben der Kaiser der Rhomäer und der Patriarch eine Union mit der lateinischen Kirche unterzeichnet, gegen das Versprechen eines Kreuzzugs gegen die Türken. Als die Abgesandten von {nation} zurückkehrten, riefen die Menschen, sie hätten den Glauben verkauft. Die Mönche der großen Klöster weigern sich, des Papstes zu gedenken.',
    },
    mtth: 6, oncePer: true, minYear: 1439, maxYear: 1450,
    trigger: (e) => e.n.faith === H.faith('orthodox') && settled(e),
    options: [
      { label: { en: 'Uphold the union for the sake of aid', de: 'Die Union um der Hilfe willen aufrechterhalten' }, effect: (e) => { e.fx.estate('prelates', -15); e.fx.concord(-10); e.fx.opinion(pope(e), 25, 15); e.fx.prestige(3); e.fx.flag('union_florence'); }, ai: (e) => (isKey(e, 'byzantium') ? 0.7 : 0.2) },
      { label: { en: 'Reject it and depose the unionist bishops', de: 'Sie verwerfen und die unierten Bischöfe absetzen' }, effect: (e) => { e.fx.estate('prelates', 12); e.fx.concord(5); e.fx.mandate(5); e.fx.opinion(pope(e), -10); }, ai: (e) => (isKey(e, 'moscow') ? 1 : 0.7) },
    ],
  },
  {
    id: 'patriarch_appeal', art: 'church',
    title: { en: 'A Letter from the Patriarch', de: 'Ein Brief des Patriarchen' },
    text: {
      en: 'The Ecumenical Patriarch writes to {ruler}: the Great Church is poor, the Turks press upon the City, and the monasteries of Athos need protectors. He asks for alms and promises to name {ruler} in the liturgy of Hagia Sophia.',
      de: 'Der Ökumenische Patriarch schreibt an {ruler}: Die Große Kirche ist arm, die Türken bedrängen die Stadt, und die Klöster des Athos brauchen Schutzherren. Er bittet um Almosen und verspricht, {ruler} in der Liturgie der Hagia Sophia zu nennen.',
    },
    mtth: 120, cooldown: 25,
    trigger: (e) => e.n.faith === H.faith('orthodox') && settled(e) && !isKey(e, 'byzantium') && rich(e, 2),
    options: [
      { label: { en: 'Send generous alms', de: 'Großzügige Almosen senden' }, effect: (e) => { e.fx.gold(-1.5); e.fx.mandate(5); e.fx.prestige(4); e.fx.estate('prelates', 6); }, ai: 0.7 },
      { label: { en: 'Ask instead for our own metropolitan to be raised', de: 'Stattdessen die Erhebung des eigenen Metropoliten verlangen' }, effect: (e) => { e.fx.authority(5); e.fx.estate('prelates', 3); e.fx.prestige(-1); }, ai: 0.4 },
    ],
  },
  {
    id: 'witch_accusation', art: 'revolt',
    title: { en: 'Accusations of Witchcraft', de: 'Hexereivorwürfe' },
    text: {
      en: 'After a hailstorm destroyed the vineyards at {loc}, the villagers have accused an old midwife and two widows of weather magic. The local court wants to proceed under torture; a Jesuit confessor warns that under torture anyone will confess anything.',
      de: 'Nachdem ein Hagelsturm die Weinberge bei {loc} vernichtet hat, beschuldigen die Dorfleute eine alte Hebamme und zwei Witwen des Wetterzaubers. Das Ortsgericht will mit der Folter vorgehen; ein jesuitischer Beichtvater warnt, unter der Folter gestehe jeder alles.',
    },
    mtth: 150, cooldown: 20, minYear: 1480, maxYear: 1700,
    trigger: (e) => christian(e) && settled(e) && e.n.capital >= 0 && e.w.lat[e.n.capital] > 42 && e.w.lon[e.n.capital] > -6 && e.w.lon[e.n.capital] < 25,
    setup: (e) => { e.ctx.loc = H.randomLoc(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Forbid torture and send it to a higher court', de: 'Die Folter verbieten und es vor ein höheres Gericht bringen' }, effect: (e) => { e.fx.authority(5); e.fx.estate('commons', -3); e.fx.value(2, 3); e.fx.unrest(e.ctx.loc, 3); }, ai: 0.6 },
      { label: { en: 'Let the local court proceed', de: 'Das Ortsgericht gewähren lassen' }, effect: (e) => { e.fx.estate('commons', 3); e.fx.estate('prelates', 2); e.fx.unrest(e.ctx.loc, -3); e.fx.pop(e.ctx.loc, -0.005); e.fx.value(2, -3); }, ai: 0.4 },
    ],
  },
  {
    id: 'jesuit_college', art: 'scholar',
    title: { en: 'The Fathers of the Society', de: 'Die Patres der Gesellschaft Jesu' },
    text: {
      en: 'The Society of Jesus asks permission to open a college at {loc}: free schooling in Latin, rhetoric and mathematics for the sons of {nation}, and confessors for the court. Their enemies say they serve only Rome.',
      de: 'Die Gesellschaft Jesu bittet um die Erlaubnis, in {loc} ein Kolleg zu eröffnen: kostenloser Unterricht in Latein, Rhetorik und Mathematik für die Söhne von {nation} und Beichtväter für den Hof. Ihre Feinde sagen, sie dienten nur Rom.',
    },
    mtth: 72, oncePer: true, minYear: 1545, maxYear: 1773,
    trigger: (e) => latin(e) && settled(e),
    setup: (e) => { e.ctx.loc = bigTown(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Grant them a building and lands', de: 'Ihnen ein Gebäude und Ländereien schenken' }, effect: (e) => { e.fx.gold(-1.5); e.fx.building(e.ctx.loc, BI.church, 1); e.fx.insight(5); e.fx.estate('prelates', 6); curia(e, 8); e.fx.modifier('jesuits', 25, { en: 'Jesuit colleges', de: 'Jesuitenkollegien' }, { research: 0.03, conversion: 0.15 }); }, ai: 0.7 },
      { label: { en: 'Refuse; our own clergy suffice', de: 'Ablehnen; unser eigener Klerus genügt' }, effect: (e) => { e.fx.estate('prelates', -2); e.fx.authority(4); }, ai: 0.3 },
    ],
  },
  {
    id: 'pietist_revival', art: 'church',
    title: { en: 'The Awakening', de: 'Die Erweckung' },
    text: {
      en: 'In barns and parlours across {nation}, people meet to pray, read Scripture and sing new hymns without a clergyman present. The preachers of the awakening care little for doctrine and much for a changed heart; the consistory calls it disorder.',
      de: 'In Scheunen und Stuben überall in {nation} kommen Menschen zusammen, um ohne Geistlichen zu beten, die Schrift zu lesen und neue Lieder zu singen. Den Erweckungspredigern liegt wenig an der Lehre und viel am bekehrten Herzen; das Konsistorium nennt es Unordnung.',
    },
    mtth: 96, oncePer: true, minYear: 1670, maxYear: 1800,
    trigger: (e) => protestant(e) && settled(e),
    options: [
      { label: { en: 'Let them meet; they found orphanages and schools', de: 'Sie gewähren lassen; sie gründen Waisenhäuser und Schulen' }, effect: (e) => { e.fx.estate('commons', 6); e.fx.estate('prelates', -4); e.fx.insight(4); e.fx.concord(3); }, ai: 0.7 },
      { label: { en: 'Forbid the conventicles', de: 'Die Konventikel verbieten' }, effect: (e) => { e.fx.estate('prelates', 6); e.fx.estate('commons', -4); e.fx.authority(4); }, ai: 0.4 },
    ],
  },
  {
    id: 'church_council_tax', art: 'church',
    title: { en: 'The Clergy Refuse the Subsidy', de: 'Der Klerus verweigert die Beihilfe' },
    text: {
      en: 'Citing the bull Clericis laicos and older canons, the bishops of {nation} refuse to pay the war subsidy {ruler} has asked of them. The Curia, they say, must consent to any tax on the Church.',
      de: 'Unter Berufung auf die Bulle Clericis laicos und ältere Kanones verweigern die Bischöfe von {nation} die Kriegsbeihilfe, die {ruler} von ihnen verlangt hat. Die Kurie, sagen sie, müsse jeder Steuer auf die Kirche zustimmen.',
    },
    mtth: 96, cooldown: 20, maxYear: 1600,
    trigger: (e) => latin(e) && H.atWar(e.s, e.n.id) && monarchy(e),
    options: [
      { label: { en: 'Seize their revenues until they pay', de: 'Ihre Einkünfte beschlagnahmen, bis sie zahlen' }, effect: (e) => { e.fx.gold(2.5); e.fx.estate('prelates', -12); curia(e, -15); e.fx.opinion(pope(e), -15); e.fx.authority(5); }, ai: 0.4 },
      { label: { en: 'Ask the pope for a crusading tithe', de: 'Den Papst um einen Kreuzzugszehnt bitten' }, effect: (e) => { e.fx.gold(1); e.fx.estate('prelates', 2); curia(e, -5); e.fx.authority(-5); }, ai: 0.6 },
      { label: { en: 'Respect their immunity', de: 'Ihre Immunität achten' }, effect: (e) => { e.fx.estate('prelates', 6); e.fx.warExhaustion(2); curia(e, 5); }, ai: 0.4 },
    ],
  },
];
