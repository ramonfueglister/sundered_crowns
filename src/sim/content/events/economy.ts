// Money and trade: banks, mines, guilds, charters, coinage, fairs, the Hanse, spices, wool, printing, bookkeeping.
import type { EventDef } from '../../systems/events';
import { H } from '../../systems/events';
import { BI } from '../../defs';
import { bigTown, coastal, hasCoast, settled, rich, est, isKey, owns, locByName, latin, eraAtLeast, inc, nationByKey, atlantic, monarchy, atWar } from './util';

const HANSE = ['lubeck', 'hamburg', 'bremen', 'stralsund', 'visby', 'riga', 'dortmund', 'cologne', 'goslar'];

export const ECONOMY_EVENTS: EventDef[] = [
  {
    id: 'bank_failure', art: 'trade', major: true,
    title: { en: 'The Bank Has Failed', de: 'Die Bank ist zusammengebrochen' },
    text: {
      en: 'The great banking house that lent to {ruler} has closed its counters. Its partners have fled, its depositors storm the shutters, and its agents now demand immediate repayment of everything the crown owes, so as to save what can be saved.',
      de: 'Das große Bankhaus, das {ruler} Geld geliehen hat, hat seine Schalter geschlossen. Seine Teilhaber sind geflohen, die Einleger stürmen die Läden, und seine Faktoren verlangen nun die sofortige Rückzahlung aller Schulden der Krone, um zu retten, was zu retten ist.',
    },
    mtth: 200, cooldown: 40,
    trigger: (e) => e.s.day > 730 && (e.n.loans.length >= 2 || e.n.debt > inc(e) * 12),
    options: [
      { label: { en: 'Repay what we can, as a matter of honour', de: 'Zurückzahlen, was möglich ist, aus Ehre' }, effect: (e) => { e.fx.gold(-3); e.fx.prestige(3); e.fx.estate('burghers', 6); e.fx.modifier('good_credit', 15, { en: 'Good credit', de: 'Gute Kreditwürdigkeit' }, { interest: -0.01 }); }, ai: (e) => (rich(e, 5) ? 0.8 : 0.3) },
      { label: { en: 'Declare the debt void', de: 'Die Schuld für nichtig erklären' }, effect: (e) => { e.fx.gold(1); e.fx.prestige(-5); e.fx.estate('burghers', -12); e.fx.modifier('bad_credit', 15, { en: 'Ruined credit', de: 'Zerrütteter Kredit' }, { interest: 0.02 }); }, ai: 0.5 },
    ],
  },
  {
    id: 'silver_strike', art: 'trade',
    title: { en: 'Silver in the Hills near {loc}', de: 'Silber in den Bergen bei {loc}' },
    text: {
      en: 'A shepherd’s fire on an outcrop near {loc} melted out a glittering bead, and prospectors have since found a rich silver vein. Miners from Saxony and Bohemia are already arriving with their own laws and customs.',
      de: 'Das Feuer eines Hirten auf einem Felsvorsprung bei {loc} hat ein glitzerndes Kügelchen ausgeschmolzen, und Schürfer haben seither eine reiche Silberader gefunden. Bergleute aus Sachsen und Böhmen treffen bereits mit eigenen Rechten und Bräuchen ein.',
    },
    mtth: 400, cooldown: 50,
    trigger: (e) => settled(e) && H.randomLoc(e, (l) => e.w.terrain[l] === 3 || e.w.terrain[l] === 4) >= 0,
    setup: (e) => { e.ctx.loc = H.randomLoc(e, (l) => e.w.terrain[l] === 3 || e.w.terrain[l] === 4); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Claim it as a crown regale', de: 'Es als Bergregal der Krone beanspruchen' }, effect: (e) => { e.fx.building(e.ctx.loc, BI.mine, 1); e.fx.gold(2); e.fx.inflation(0.01); e.fx.estate('magnates', -4); e.fx.modifier('silver_mine', 20, { en: 'Silver mines', de: 'Silberbergwerke' }, { tax: 0.04 }); }, ai: 0.7 },
      { label: { en: 'Lease it to a merchant house', de: 'Es an ein Handelshaus verpachten' }, effect: (e) => { e.fx.building(e.ctx.loc, BI.mine, 1); e.fx.gold(4); e.fx.estate('burghers', 6); e.fx.pop(e.ctx.loc, 0.03); }, ai: 0.6 },
      { label: { en: 'Grant free mining rights to all comers', de: 'Allen Ankömmlingen Bergfreiheit gewähren' }, effect: (e) => { e.fx.pop(e.ctx.loc, 0.06); e.fx.dev(e.ctx.loc, 1); e.fx.estate('commons', 4); e.fx.gold(0.5); }, ai: 0.4 },
    ],
  },
  {
    id: 'guild_dispute', art: 'trade',
    title: { en: 'Journeymen against Masters', de: 'Gesellen gegen Meister' },
    text: {
      en: 'The journeymen weavers of {loc} have laid down their shuttles. They say the masters keep the guild closed to all but their own sons, and that a man may wait twenty years for the right to his own loom. The masters ask the crown to forbid the journeymen’s brotherhood.',
      de: 'Die Webergesellen von {loc} haben die Schiffchen niedergelegt. Sie sagen, die Meister hielten die Zunft für alle außer ihren eigenen Söhnen geschlossen, und ein Mann könne zwanzig Jahre auf das Recht an einem eigenen Webstuhl warten. Die Meister bitten die Krone, die Gesellenbruderschaft zu verbieten.',
    },
    mtth: 240, cooldown: 25,
    trigger: (e) => settled(e) && e.w.townSize[e.n.capital] >= 2,
    setup: (e) => { e.ctx.loc = bigTown(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Side with the masters', de: 'Sich auf die Seite der Meister stellen' }, effect: (e) => { e.fx.estate('burghers', 6); e.fx.estate('commons', -5); e.fx.unrest(e.ctx.loc, 5); }, ai: 0.6 },
      { label: { en: 'Open the guild to skilled journeymen', de: 'Die Zunft für tüchtige Gesellen öffnen' }, effect: (e) => { e.fx.estate('burghers', -6); e.fx.estate('commons', 5); e.fx.modifier('open_guild', 10, { en: 'Opened guilds', de: 'Geöffnete Zünfte' }, { production: 0.03 }); }, ai: 0.5 },
      { label: { en: 'Arbitrate and fine both sides', de: 'Schlichten und beide Seiten mit Bußen belegen' }, effect: (e) => { e.fx.gold(0.5); e.fx.authority(5); e.fx.estate('burghers', -2); e.fx.estate('commons', -2); }, ai: 0.5 },
    ],
  },
  {
    id: 'merchant_charter', art: 'trade',
    title: { en: 'Foreign Merchants Seek a Charter', de: 'Fremde Kaufleute bitten um ein Privileg' },
    text: {
      en: 'Merchants of {other} ask for a walled compound at {loc}, with their own warehouse, weighing house and court, freedom from local tolls, and the right to winter in the town. They will pay a handsome annual rent.',
      de: 'Kaufleute aus {other} bitten um einen ummauerten Hof in {loc} mit eigenem Lagerhaus, eigener Waage und eigenem Gericht, Freiheit von örtlichen Zöllen und dem Recht, in der Stadt zu überwintern. Sie zahlen dafür eine stattliche Jahresmiete.',
    },
    mtth: 200, cooldown: 25,
    trigger: (e) => settled(e) && hasCoast(e) && H.neighbourNations(e).length > 0,
    setup: (e) => { e.ctx.loc = H.randomLoc(e, (l) => !!e.w.coastal[l]); e.ctx.other = H.pickNeighbour(e, (o) => e.s.nations[o].gov.includes('republic') || e.s.nations[o].income.tax > inc(e)); return e.ctx.loc >= 0 && e.ctx.other >= 0; },
    options: [
      { label: { en: 'Grant the charter', de: 'Das Privileg gewähren' }, effect: (e) => { e.fx.gold(1); e.fx.opinion(e.ctx.other, 15); e.fx.estate('burghers', -5); e.fx.modifier('foreign_kontor', 20, { en: 'Foreign merchants’ compound', de: 'Fremder Kaufmannshof' }, { trade: 0.04 }); }, ai: 0.6 },
      { label: { en: 'Grant it, but without toll freedom', de: 'Es gewähren, aber ohne Zollfreiheit' }, effect: (e) => { e.fx.opinion(e.ctx.other, 5); e.fx.gold(0.5); e.fx.modifier('foreign_kontor', 15, { en: 'Foreign merchants’ compound', de: 'Fremder Kaufmannshof' }, { trade: 0.02 }); }, ai: 0.5 },
      { label: { en: 'Our own merchants come first', de: 'Unsere eigenen Kaufleute gehen vor' }, effect: (e) => { e.fx.estate('burghers', 6); e.fx.opinion(e.ctx.other, -10); }, ai: 0.4 },
    ],
  },
  {
    id: 'debasement', art: 'trade',
    title: { en: 'The Mint Master’s Suggestion', de: 'Der Vorschlag des Münzmeisters' },
    text: {
      en: 'The treasury of {nation} is empty. The master of the mint observes, quietly, that if the new pennies were struck with a little more copper and a little less silver, the crown could pay its debts with the same coins twice.',
      de: 'Die Schatzkammer von {nation} ist leer. Der Münzmeister bemerkt leise, wenn man die neuen Pfennige mit etwas mehr Kupfer und etwas weniger Silber prägte, könnte die Krone ihre Schulden mit denselben Münzen zweimal bezahlen.',
    },
    mtth: 120, cooldown: 20,
    trigger: (e) => settled(e) && e.n.treasury < inc(e) * 1 && (atWar(e) || e.n.loans.length > 0),
    options: [
      { label: { en: 'Strike the lighter coin', de: 'Die leichtere Münze prägen' }, effect: (e) => { e.fx.gold(3); e.fx.inflation(0.03); e.fx.estate('burghers', -8); e.fx.estate('commons', -4); }, ai: 0.5 },
      { label: { en: 'Keep the coin sound; borrow instead', de: 'Die Münze wertbeständig halten; lieber borgen' }, effect: (e) => { e.fx.gold(1.5); e.fx.estate('burghers', 3); e.fx.modifier('crown_borrowing', 5, { en: 'Heavy borrowing', de: 'Hohe Verschuldung' }, { interest: 0.01 }); }, ai: 0.5 },
      { label: { en: 'Melt down the plate of the court', de: 'Das Tafelsilber des Hofes einschmelzen' }, effect: (e) => { e.fx.gold(1); e.fx.prestige(-3); e.fx.estate('magnates', -2); e.fx.mandate(2); }, ai: 0.4 },
    ],
  },
  {
    id: 'champagne_fairs', art: 'trade', once: true, minYear: 1356, maxYear: 1400,
    title: { en: 'The Fairs of Champagne Wither', de: 'Die Champagnemessen verkümmern' },
    text: {
      en: 'Once all the merchants of Christendom met at Troyes, Provins, Lagny and Bar. Now Italian galleys sail straight to Bruges, war closes the roads, and the royal taxes drive the last Lombards away. The burghers of Troyes ask for new franchises to save their fair.',
      de: 'Einst trafen sich alle Kaufleute der Christenheit in Troyes, Provins, Lagny und Bar. Nun segeln italienische Galeeren geradewegs nach Brügge, der Krieg sperrt die Straßen, und die königlichen Steuern vertreiben die letzten Lombarden. Die Bürger von Troyes bitten um neue Freiheiten, um ihre Messe zu retten.',
    },
    mtth: 48,
    trigger: (e) => owns(e, 'Troyes'),
    setup: (e) => { e.ctx.loc = locByName(e.w, 'Troyes'); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Grant toll freedom to fair-goers', de: 'Messebesuchern Zollfreiheit gewähren' }, effect: (e) => { e.fx.gold(-1); e.fx.dev(e.ctx.loc, 0.5); e.fx.estate('burghers', 6); e.fx.modifier('fair_franchise', 15, { en: 'Fair franchises', de: 'Messefreiheiten' }, { trade: 0.03 }); }, ai: 0.6 },
      { label: { en: 'The fairs’ time is past', de: 'Die Zeit der Messen ist vorbei' }, effect: (e) => { e.fx.dev(e.ctx.loc, -0.5); e.fx.gold(0.5); e.fx.estate('burghers', -3); }, ai: 0.4 },
    ],
  },
  {
    id: 'hanse_privileges', art: 'ship',
    title: { en: 'The Hanse Demands Its Privileges', de: 'Die Hanse fordert ihre Privilegien' },
    text: {
      en: 'Envoys of the German Hanse have arrived from the Diet at Lübeck. They demand the confirmation of their old liberties in our ports: low tolls, their own courts, and the herring trade of the coast. Refuse, they say, and no Hanseatic cog will call at {loc} again.',
      de: 'Gesandte der Deutschen Hanse sind vom Hansetag in Lübeck eingetroffen. Sie verlangen die Bestätigung ihrer alten Freiheiten in unseren Häfen: niedrige Zölle, eigene Gerichte und den Heringshandel der Küste. Verweigert man es, sagen sie, wird keine hansische Kogge mehr {loc} anlaufen.',
    },
    mtth: 96, cooldown: 25, maxYear: 1600,
    trigger: (e) => settled(e) && !isKey(e, ...HANSE) && !e.n.isHRE && hasCoast(e) && e.n.capital >= 0 && e.w.lat[e.n.capital] > 50 && e.w.lon[e.n.capital] > -6 && e.w.lon[e.n.capital] < 32 && !!nationByKey(e, 'lubeck'),
    setup: (e) => { e.ctx.loc = H.randomLoc(e, (l) => !!e.w.coastal[l]); const lb = nationByKey(e, 'lubeck'); e.ctx.other = lb ? lb.id : -1; return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Confirm the privileges', de: 'Die Privilegien bestätigen' }, effect: (e) => { e.fx.opinion(e.ctx.other, 20); e.fx.estate('burghers', -6); e.fx.gold(0.5); e.fx.modifier('hanse_privileges', 20, { en: 'Hanseatic privileges', de: 'Hansische Privilegien' }, { trade: 0.04, tax: -0.02 }); }, ai: 0.6 },
      { label: { en: 'Favour Dutch and English merchants instead', de: 'Stattdessen holländische und englische Kaufleute begünstigen' }, effect: (e) => { e.fx.opinion(e.ctx.other, -20); e.fx.estate('burghers', 6); e.fx.modifier('hanse_embargo', 5, { en: 'Hanseatic embargo', de: 'Hansische Handelssperre' }, { trade: -0.04 }); }, ai: (e) => (e.year > 1500 ? 0.7 : 0.3) },
    ],
  },
  {
    id: 'spice_prices', art: 'trade',
    title: { en: 'Pepper Worth Its Weight in Silver', de: 'Pfeffer, mit Silber aufgewogen' },
    text: {
      en: 'The sultan in Cairo has raised the duties at Alexandria again, and the price of pepper, cinnamon and cloves in our markets has doubled. The merchants of {loc} ask {ruler} to back a venture to buy direct from the eastern ports.',
      de: 'Der Sultan in Kairo hat die Abgaben in Alexandria abermals erhöht, und der Preis für Pfeffer, Zimt und Nelken hat sich auf unseren Märkten verdoppelt. Die Kaufleute von {loc} bitten {ruler}, ein Unternehmen zu unterstützen, das unmittelbar in den östlichen Häfen einkauft.',
    },
    mtth: 120, cooldown: 20, minYear: 1400, maxYear: 1600,
    trigger: (e) => settled(e) && coastal(e) && e.n.capital >= 0 && e.w.lat[e.n.capital] < 46 && e.w.lon[e.n.capital] > -10 && e.w.lon[e.n.capital] < 30 && !isKey(e, 'mamluk'),
    setup: (e) => { e.ctx.loc = H.randomLoc(e, (l) => !!e.w.coastal[l]); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Invest in the venture', de: 'In das Unternehmen investieren' }, effect: (e) => { e.fx.gold(-2); e.fx.estate('burghers', 6); e.fx.modifier('spice_venture', 10, { en: 'Spice venture', de: 'Gewürzunternehmen' }, { trade: 0.05 }); }, ai: (e) => (rich(e, 4) ? 0.7 : 0.2) },
      { label: { en: 'Tax the spice sellers’ windfall', de: 'Den Gewinn der Gewürzhändler besteuern' }, effect: (e) => { e.fx.gold(1.5); e.fx.estate('burghers', -5); }, ai: 0.5 },
    ],
  },
  {
    id: 'mamluk_spice_duties', art: 'trade',
    title: { en: 'The Karimi Merchants', de: 'Die Karimi-Kaufleute' },
    text: {
      en: 'The great spice merchants of Cairo, the Karimi, have grown rich beyond measure on the trade from Aden to Alexandria. The emirs urge the sultan to make pepper a state monopoly; the merchants warn that the Franks will find another road.',
      de: 'Die großen Gewürzhändler Kairos, die Karimi, sind durch den Handel von Aden nach Alexandria über alle Maßen reich geworden. Die Emire drängen den Sultan, den Pfeffer zum Staatsmonopol zu machen; die Kaufleute warnen, die Franken würden einen anderen Weg finden.',
    },
    mtth: 60, oncePer: true, minYear: 1400, maxYear: 1500,
    trigger: (e) => isKey(e, 'mamluk') || (owns(e, 'Cairo') && owns(e, 'Alexandria')),
    options: [
      { label: { en: 'Make pepper a monopoly of the sultan', de: 'Den Pfeffer zum Monopol des Sultans machen' }, effect: (e) => { e.fx.gold(4); e.fx.estate('burghers', -10); e.fx.modifier('pepper_monopoly', 25, { en: 'Pepper monopoly', de: 'Pfeffermonopol' }, { tax: 0.05, trade: -0.04 }); }, ai: 0.6 },
      { label: { en: 'Leave the trade to the merchants', de: 'Den Handel den Kaufleuten überlassen' }, effect: (e) => { e.fx.estate('burghers', 6); e.fx.modifier('karimi_trade', 25, { en: 'Karimi trade', de: 'Karimi-Handel' }, { trade: 0.05 }); }, ai: 0.5 },
    ],
  },
  {
    id: 'wool_staple', art: 'trade',
    title: { en: 'The Wool Staple', de: 'Der Wollstapel' },
    text: {
      en: 'The wool of {nation} is the finest in Christendom, and the weavers of Flanders and Florence cannot do without it. The merchants propose that all wool for export pass through a single staple town, where the crown can count every sack and tax it.',
      de: 'Die Wolle von {nation} ist die feinste der Christenheit, und die Weber Flanderns und Florenz’ können nicht auf sie verzichten. Die Kaufleute schlagen vor, alle Ausfuhrwolle über eine einzige Stapelstadt zu leiten, wo die Krone jeden Sack zählen und besteuern kann.',
    },
    mtth: 60, oncePer: true, maxYear: 1600,
    trigger: (e) => isKey(e, 'england', 'castile', 'scotland') || owns(e, 'London') || owns(e, 'Burgos'),
    options: [
      { label: { en: 'Establish the staple', de: 'Den Stapel errichten' }, effect: (e) => { e.fx.gold(2); e.fx.estate('burghers', 5); e.fx.estate('magnates', -3); e.fx.modifier('wool_staple', 30, { en: 'Wool staple', de: 'Wollstapel' }, { tax: 0.04 }); }, ai: 0.7 },
      { label: { en: 'Weave it at home instead', de: 'Sie stattdessen im eigenen Land verweben' }, effect: (e) => { e.fx.gold(-1); e.fx.building(e.n.capital, BI.workshop, 1); e.fx.modifier('home_cloth', 30, { en: 'Native cloth industry', de: 'Heimisches Tuchgewerbe' }, { production: 0.05 }); }, ai: 0.5 },
    ],
  },
  {
    id: 'printing_shop', art: 'scholar',
    title: { en: 'A Printing House in {loc}', de: 'Eine Druckerei in {loc}' },
    text: {
      en: 'A journeyman from Mainz has opened a printing house in {loc}. In a week his press turns out more pages than a monastery scriptorium in a year: almanacs, grammars, indulgence letters and pamphlets. He asks for a privilege and freedom from the guild of scribes.',
      de: 'Ein Geselle aus Mainz hat in {loc} eine Druckerei eröffnet. In einer Woche liefert seine Presse mehr Seiten als eine Klosterschreibstube in einem Jahr: Kalender, Grammatiken, Ablassbriefe und Flugschriften. Er bittet um ein Privileg und Freiheit von der Zunft der Schreiber.',
    },
    mtth: 60, oncePer: true, minYear: 1460,
    trigger: (e) => settled(e) && (e.year > 1500 || (e.n.capital >= 0 && e.w.lon[e.n.capital] > -5 && e.w.lon[e.n.capital] < 25 && e.w.lat[e.n.capital] > 38)),
    setup: (e) => { e.ctx.loc = bigTown(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Grant the privilege', de: 'Das Privileg gewähren' }, effect: (e) => { e.fx.insight(6); e.fx.tech(1, 0.1); e.fx.estate('burghers', 4); e.fx.estate('prelates', -2); e.fx.modifier('printing_house', 30, { en: 'Printing houses', de: 'Druckereien' }, { research: 0.04 }); }, ai: 0.8 },
      { label: { en: 'Only under the bishop’s censorship', de: 'Nur unter bischöflicher Zensur' }, effect: (e) => { e.fx.insight(3); e.fx.estate('prelates', 4); e.fx.modifier('printing_house', 20, { en: 'Censored presses', de: 'Zensierte Pressen' }, { research: 0.02 }); }, ai: 0.5 },
    ],
  },
  {
    id: 'double_entry', art: 'scholar',
    title: { en: 'Debit and Credit', de: 'Soll und Haben' },
    text: {
      en: 'A clerk trained in the counting houses of Venice offers to keep the crown’s accounts in the Italian manner: every sum entered twice, on the left as debit and on the right as credit, so that the books must balance and every missing mark can be found.',
      de: 'Ein in den Kontoren Venedigs ausgebildeter Schreiber bietet an, die Rechnungen der Krone nach italienischer Art zu führen: jede Summe doppelt eingetragen, links als Soll und rechts als Haben, sodass die Bücher aufgehen müssen und jede fehlende Mark gefunden werden kann.',
    },
    mtth: 100, oncePer: true, minYear: 1380,
    trigger: (e) => settled(e) && (e.n.corruption > 0.03 || e.year > 1494) && (e.year > 1480 || (e.n.capital >= 0 && e.w.lat[e.n.capital] < 47 && e.w.lon[e.n.capital] > 6 && e.w.lon[e.n.capital] < 19)),
    options: [
      { label: { en: 'Reform the exchequer on this model', de: 'Die Rechenkammer nach diesem Vorbild reformieren' }, effect: (e) => { e.fx.gold(-1); e.fx.corruption(-0.04); e.fx.insight(4); e.fx.estate('magnates', -3); e.fx.modifier('double_entry', 40, { en: 'Double-entry accounts', de: 'Doppelte Buchführung' }, { corruption: -0.01, tax: 0.02 }); }, ai: 0.7 },
      { label: { en: 'Our tallies have served well enough', de: 'Unsere Kerbhölzer haben genügt' }, effect: (e) => { e.fx.estate('magnates', 2); e.fx.value(2, -2); }, ai: 0.3 },
    ],
  },
  {
    id: 'new_fair', art: 'trade',
    title: { en: 'A Fair for {loc}', de: 'Eine Messe für {loc}' },
    text: {
      en: 'The council of {loc} asks {ruler} for a charter to hold two great fairs a year, at Easter and Michaelmas, with the crown’s safe-conduct for every merchant on the roads and a court of piepowder to settle disputes on the spot.',
      de: 'Der Rat von {loc} bittet {ruler} um ein Privileg für zwei große Messen im Jahr, zu Ostern und zu Michaelis, mit dem Geleit der Krone für jeden Kaufmann auf den Straßen und einem Messegericht, das Streitigkeiten an Ort und Stelle schlichtet.',
    },
    mtth: 300, cooldown: 40,
    trigger: (e) => settled(e) && !H.atWar(e.s, e.n.id) && est(e, 'burghers').influence > 12,
    setup: (e) => { e.ctx.loc = bigTown(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Grant the charter and the safe-conduct', de: 'Privileg und Geleit gewähren' }, effect: (e) => { e.fx.gold(-0.5); e.fx.building(e.ctx.loc, BI.market, 1); e.fx.estate('burghers', 6); e.fx.dev(e.ctx.loc, 0.3); }, ai: 0.8 },
      { label: { en: 'One fair a year will do', de: 'Eine Messe im Jahr genügt' }, effect: (e) => { e.fx.estate('burghers', 2); e.fx.gold(0.5); }, ai: 0.4 },
    ],
  },
  {
    id: 'monte_di_pieta', art: 'church',
    title: { en: 'A Mount of Piety', de: 'Ein Berg der Frömmigkeit' },
    text: {
      en: 'Franciscan preachers in {loc} denounce the usurers and propose a charitable pawnshop, a monte di pietà, lending to the poor against pledges at a tiny rate. The Dominicans call even that rate a sin; the bankers call it unfair competition.',
      de: 'Franziskanische Prediger in {loc} prangern die Wucherer an und schlagen ein mildtätiges Pfandhaus vor, einen Monte di Pietà, der den Armen gegen Pfänder zu einem winzigen Zins leiht. Die Dominikaner nennen selbst diesen Zins eine Sünde; die Bankiers nennen es unlauteren Wettbewerb.',
    },
    mtth: 120, oncePer: true, minYear: 1462, maxYear: 1700,
    trigger: (e) => latin(e) && settled(e),
    setup: (e) => { e.ctx.loc = bigTown(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Found the Mount with crown money', de: 'Den Monte mit Geld der Krone gründen' }, effect: (e) => { e.fx.gold(-1.5); e.fx.estate('commons', 6); e.fx.estate('prelates', 3); e.fx.unrest(e.ctx.loc, -6); e.fx.modifier('monte_pieta', 30, { en: 'Mount of piety', de: 'Monte di Pietà' }, { unrest: -1 }); }, ai: 0.6 },
      { label: { en: 'Leave lending to the bankers', de: 'Das Leihen den Bankiers überlassen' }, effect: (e) => { e.fx.estate('burghers', 4); e.fx.estate('commons', -3); }, ai: 0.4 },
    ],
  },
  {
    id: 'river_tolls', art: 'trade',
    title: { en: 'Tolls on the River', de: 'Zölle auf dem Strom' },
    text: {
      en: 'Barge masters complain that between {loc} and the sea they must stop at a toll castle every few miles, each with its own lord, its own chain across the river and its own demands. They ask {ruler} to abolish the newer tolls; the lords who own them protest.',
      de: 'Schiffer klagen, dass sie zwischen {loc} und dem Meer alle paar Meilen an einer Zollburg halten müssen, jede mit eigenem Herrn, eigener Kette über den Fluss und eigenen Forderungen. Sie bitten {ruler}, die neueren Zölle abzuschaffen; die Herren, denen sie gehören, protestieren.',
    },
    mtth: 200, cooldown: 30,
    trigger: (e) => settled(e) && e.n.isHRE && est(e, 'burghers').influence > 10,
    setup: (e) => { e.ctx.loc = bigTown(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Abolish the newer tolls', de: 'Die neueren Zölle abschaffen' }, effect: (e) => { e.fx.estate('burghers', 8); e.fx.estate('magnates', -8); e.fx.modifier('free_river', 15, { en: 'Freer river trade', de: 'Freierer Flusshandel' }, { trade: 0.04 }); }, ai: 0.5 },
      { label: { en: 'Buy up a toll castle for the crown', de: 'Eine Zollburg für die Krone erwerben' }, effect: (e) => { e.fx.gold(-2); e.fx.modifier('crown_toll', 25, { en: 'Crown river toll', de: 'Kronflusszoll' }, { tax: 0.03 }); e.fx.estate('burghers', -2); }, ai: (e) => (rich(e, 4) ? 0.7 : 0.2) },
      { label: { en: 'Old rights are rights', de: 'Altes Recht ist Recht' }, effect: (e) => { e.fx.estate('magnates', 5); e.fx.estate('burghers', -4); }, ai: 0.4 },
    ],
  },
  {
    id: 'bourse', art: 'trade',
    title: { en: 'A Bourse for Merchants of All Nations', de: 'Eine Börse für Kaufleute aller Nationen' },
    text: {
      en: 'The merchants of {loc} who now trade in bills of exchange, shares of ships and futures in grain meet every day in the open street, rain or shine. They ask for a building with a courtyard and fixed hours, open "to merchants of every nation and tongue".',
      de: 'Die Kaufleute von {loc}, die nun mit Wechseln, Schiffsanteilen und Getreide auf Termin handeln, treffen sich täglich auf offener Straße, bei Regen wie bei Sonne. Sie bitten um ein Gebäude mit Innenhof und festen Stunden, offen „den Kaufleuten jeder Nation und Zunge“.',
    },
    mtth: 100, oncePer: true, minYear: 1500,
    trigger: (e) => settled(e) && eraAtLeast(e, 1) && est(e, 'burghers').influence > 17 && hasCoast(e),
    setup: (e) => { e.ctx.loc = bigTown(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Build the bourse', de: 'Die Börse bauen' }, effect: (e) => { e.fx.gold(-2); e.fx.estate('burghers', 8); e.fx.dev(e.ctx.loc, 0.5); e.fx.modifier('bourse', 50, { en: 'Bourse', de: 'Börse' }, { trade: 0.05, interest: -0.01 }); }, ai: 0.8 },
      { label: { en: 'Speculation is a vice', de: 'Spekulation ist ein Laster' }, effect: (e) => { e.fx.estate('prelates', 3); e.fx.estate('burghers', -4); }, ai: 0.2 },
    ],
  },
  {
    id: 'price_revolution', art: 'trade',
    title: { en: 'Everything Costs More', de: 'Alles wird teurer' },
    text: {
      en: 'Silver from the Indies has flooded Seville and from there all of Christendom. A pound of bread that cost a penny in our grandfathers’ time now costs four. Rentiers and lords living on fixed dues are ruined; merchants and tenant farmers grow rich.',
      de: 'Silber aus den Indien hat Sevilla und von dort die ganze Christenheit überschwemmt. Ein Pfund Brot, das zu Großvaters Zeiten einen Pfennig kostete, kostet nun vier. Rentner und Herren, die von festen Abgaben leben, sind ruiniert; Kaufleute und Pächter werden reich.',
    },
    mtth: 60, oncePer: true, minYear: 1545, maxYear: 1650,
    trigger: (e) => settled(e) && (e.s.priceLevel > 1.2 || (e.year > 1560 && e.n.capital >= 0 && e.w.lon[e.n.capital] < 30 && e.w.lon[e.n.capital] > -10)),
    options: [
      { label: { en: 'Raise the customary dues to match', de: 'Die herkömmlichen Abgaben anpassen' }, effect: (e) => { e.fx.gold(2); e.fx.estate('magnates', 6); e.fx.estate('commons', -8); e.fx.unrestAll(3); }, ai: 0.5 },
      { label: { en: 'Fix the price of bread by decree', de: 'Den Brotpreis per Erlass festsetzen' }, effect: (e) => { e.fx.estate('commons', 6); e.fx.estate('burghers', -6); e.fx.modifier('bread_price', 10, { en: 'Fixed bread prices', de: 'Festgesetzte Brotpreise' }, { production: -0.02, unrest: -2 }); }, ai: 0.5 },
      { label: { en: 'Let prices run', de: 'Die Preise laufen lassen' }, effect: (e) => { e.fx.inflation(0.02); e.fx.estate('burghers', 5); e.fx.estate('magnates', -5); }, ai: 0.4 },
    ],
  },
  {
    id: 'speculative_mania', art: 'trade', major: true,
    title: { en: 'A Mania for Shares', de: 'Ein Taumel um Anteile' },
    text: {
      en: 'Shares in a company promising fabulous profits from distant trade have risen tenfold in a season. Coachmen and duchesses buy alike; the coffee houses of {loc} trade paper until midnight. Some ministers hold shares themselves.',
      de: 'Anteile an einer Gesellschaft, die sagenhafte Gewinne aus fernem Handel verspricht, sind binnen einer Saison um das Zehnfache gestiegen. Kutscher und Herzoginnen kaufen gleichermaßen; die Kaffeehäuser von {loc} handeln Papiere bis Mitternacht. Manche Minister halten selbst Anteile.',
    },
    mtth: 150, oncePer: true, minYear: 1630, maxYear: 1815,
    trigger: (e) => settled(e) && eraAtLeast(e, 2) && est(e, 'burghers').influence > 17,
    setup: (e) => { e.ctx.loc = e.n.capital; return true; },
    options: [
      { label: { en: 'Let the market run and tax the gains', de: 'Den Markt laufen lassen und die Gewinne besteuern' }, effect: (e) => { e.fx.gold(3); e.fx.modifier('bubble_burst', 5, { en: 'After the crash', de: 'Nach dem Krach' }, { trade: -0.05, concord: -5 }); e.fx.estate('burghers', -6); }, ai: 0.4 },
      { label: { en: 'Forbid trading in unbacked shares', de: 'Den Handel mit ungedeckten Anteilen verbieten' }, effect: (e) => { e.fx.estate('burghers', -4); e.fx.authority(5); e.fx.corruption(-0.02); e.fx.prestige(2); }, ai: 0.6 },
    ],
  },
  {
    id: 'chartered_company', art: 'ship',
    title: { en: 'A Company for the Indies', de: 'Eine Kompanie für die Indien' },
    text: {
      en: 'The leading merchants of {nation} propose a joint-stock company with a royal charter: a monopoly of trade beyond the Cape, the right to make treaties, build forts and raise soldiers there, in return for a share of the profits to the crown.',
      de: 'Die führenden Kaufleute von {nation} schlagen eine Aktiengesellschaft mit königlichem Freibrief vor: ein Handelsmonopol jenseits des Kaps, das Recht, dort Verträge zu schließen, Forts zu bauen und Soldaten anzuwerben, gegen einen Gewinnanteil für die Krone.',
    },
    mtth: 72, oncePer: true, minYear: 1595,
    trigger: (e) => settled(e) && atlantic(e) && eraAtLeast(e, 1) && est(e, 'burghers').influence > 15,
    options: [
      { label: { en: 'Grant the charter', de: 'Den Freibrief gewähren' }, effect: (e) => { e.fx.gold(2); e.fx.estate('burghers', 10, 3); e.fx.modifier('indies_company', 60, { en: 'Chartered company', de: 'Privilegierte Handelskompanie' }, { trade: 0.06, colonial_range: 0.1 }); }, ai: 0.8 },
      { label: { en: 'Keep overseas trade in crown hands', de: 'Den Überseehandel in der Hand der Krone behalten' }, effect: (e) => { e.fx.estate('burghers', -6); e.fx.authority(10); e.fx.modifier('crown_trade', 30, { en: 'Crown overseas trade', de: 'Königlicher Überseehandel' }, { tax: 0.03 }); }, ai: 0.3 },
    ],
  },
  {
    id: 'salt_tax', art: 'trade',
    title: { en: 'A Tax on Salt', de: 'Eine Salzsteuer' },
    text: {
      en: 'The treasurer of {nation} proposes that all salt be sold only through crown warehouses at a fixed price. Every household needs salt for bread, butter and the winter’s meat; no one can avoid it, which is exactly the point.',
      de: 'Der Schatzmeister von {nation} schlägt vor, alles Salz nur noch über königliche Speicher zu einem festen Preis zu verkaufen. Jeder Haushalt braucht Salz für Brot, Butter und das Pökelfleisch des Winters; niemand kann ihm ausweichen, und genau darum geht es.',
    },
    mtth: 200, oncePer: true,
    trigger: (e) => settled(e) && monarchy(e) && (H.atWar(e.s, e.n.id) || e.n.treasury < inc(e) * 2),
    options: [
      { label: { en: 'Introduce the salt monopoly', de: 'Das Salzmonopol einführen' }, effect: (e) => { e.fx.gold(1); e.fx.estate('commons', -10); e.fx.unrestAll(3); e.fx.modifier('salt_tax', 40, { en: 'Salt tax', de: 'Salzsteuer' }, { tax: 0.06, unrest: 1 }); }, ai: 0.5 },
      { label: { en: 'Salt is the poor man’s spice; leave it be', de: 'Salz ist das Gewürz der Armen; man lasse es' }, effect: (e) => { e.fx.estate('commons', 4); e.fx.mandate(2); }, ai: 0.5 },
    ],
  },
  {
    id: 'smugglers', art: 'ship',
    title: { en: 'Smugglers on the Coast', de: 'Schmuggler an der Küste' },
    text: {
      en: 'Customs men report that whole villages around {loc} live by running wine, brandy and tobacco ashore at night. When a revenue cutter seized a cargo, the fishermen stoned its crew; the local gentry, who buy the brandy, look the other way.',
      de: 'Zöllner melden, dass ganze Dörfer um {loc} davon leben, nachts Wein, Branntwein und Tabak an Land zu schmuggeln. Als ein Zollkutter eine Ladung beschlagnahmte, steinigten die Fischer seine Besatzung; der Landadel, der den Branntwein kauft, schaut weg.',
    },
    mtth: 150, cooldown: 25, minYear: 1550,
    trigger: (e) => settled(e) && hasCoast(e) && e.n.tariff >= 0.05 && e.n.capital >= 0 && e.w.lat[e.n.capital] > 40,
    setup: (e) => { e.ctx.loc = H.randomLoc(e, (l) => !!e.w.coastal[l]); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Send dragoons along the coast', de: 'Dragoner an die Küste schicken' }, effect: (e) => { e.fx.gold(-1); e.fx.authority(5); e.fx.unrest(e.ctx.loc, 6); e.fx.modifier('coast_guard', 10, { en: 'Coast guard', de: 'Küstenwache' }, { tax: 0.02 }); }, ai: 0.5 },
      { label: { en: 'Lower the duties that make it pay', de: 'Die Zölle senken, die es lohnend machen' }, effect: (e) => { e.fx.estate('burghers', 4); e.fx.gold(-0.5); e.fx.modifier('lower_duties', 10, { en: 'Lowered duties', de: 'Gesenkte Zölle' }, { trade: 0.03 }); }, ai: 0.5 },
    ],
  },
];
