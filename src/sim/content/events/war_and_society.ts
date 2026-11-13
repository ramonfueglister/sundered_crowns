// War and its people: companies, revolts, condottieri, deserters, widows, veterans, engineers, gunners, raiders.
import type { EventDef } from '../../systems/events';
import { H } from '../../systems/events';
import { BI } from '../../defs';
import { bigTown, settled, rich, est, inc, atWar, monarchy, republic, eraAtLeast, christian } from './util';

export const WAR_AND_SOCIETY_EVENTS: EventDef[] = [
  {
    id: 'unpaid_company', art: 'battle',
    title: { en: 'The Company Wants Its Pay', de: 'Die Kompanie will ihren Sold' },
    text: {
      en: 'The captains of a hired company have ridden into the courtyard of {ruler} with their banners rolled. Four months’ pay is owed. Until it is paid, they say, their men will feed themselves from the villages around {loc}.',
      de: 'Die Hauptleute einer angeworbenen Kompanie sind mit eingerollten Bannern in den Hof von {ruler} geritten. Vier Monatssolde stehen aus. Bis sie bezahlt sind, sagen sie, werden sich ihre Männer aus den Dörfern um {loc} ernähren.',
    },
    mtth: 24, cooldown: 6,
    trigger: (e) => atWar(e) && e.s.armies.some((a) => a.owner === e.n.id && a.mercenary) && e.n.treasury < inc(e) * 2,
    setup: (e) => { e.ctx.loc = H.randomLoc(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Pay them, whatever it takes', de: 'Sie bezahlen, um jeden Preis' }, effect: (e) => { e.fx.gold(-2); e.fx.estate('burghers', -3); e.fx.modifier('paid_up', 2, { en: 'Paid companies', de: 'Bezahlte Kompanien' }, { morale: 0.05 }); }, ai: 0.6 },
      { label: { en: 'Promise them the plunder of the next town', de: 'Ihnen die Plünderung der nächsten Stadt versprechen' }, effect: (e) => { e.fx.prestige(-2); e.fx.modifier('plunder_promise', 2, { en: 'Promised plunder', de: 'Versprochene Beute' }, { morale: 0.03 }); e.fx.unrest(e.ctx.loc, 4); }, ai: 0.5 },
      { label: { en: 'Refuse; let them do their worst', de: 'Ablehnen; sollen sie ihr Schlimmstes tun' }, effect: (e) => { e.fx.devastate(e.ctx.loc, 0.35); e.fx.unrest(e.ctx.loc, 10); e.fx.estate('commons', -6); e.fx.modifier('mutiny', 2, { en: 'Mutinous companies', de: 'Meuternde Kompanien' }, { morale: -0.1 }); }, ai: 0.2 },
    ],
  },
  {
    id: 'free_company', art: 'battle',
    title: { en: 'A Free Company in {loc}', de: 'Eine freie Kompanie in {loc}' },
    text: {
      en: 'Now that the princes have made peace, their soldiers have not gone home. A band of routiers under an English captain has taken a castle near {loc} and holds the whole county to ransom: so many marks a month, or the barns burn.',
      de: 'Seit die Fürsten Frieden geschlossen haben, sind ihre Soldaten nicht heimgekehrt. Eine Rotte von Söldnern unter einem englischen Hauptmann hat eine Burg bei {loc} besetzt und erpresst die ganze Grafschaft: so und so viele Mark im Monat, oder die Scheunen brennen.',
    },
    mtth: 96, cooldown: 15, maxYear: 1450,
    trigger: (e) => !atWar(e) && settled(e) && e.n.capital >= 0 && e.w.lon[e.n.capital] > -5 && e.w.lon[e.n.capital] < 16 && e.w.lat[e.n.capital] > 40 && e.w.lat[e.n.capital] < 50,
    setup: (e) => { e.ctx.loc = H.randomLoc(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Buy them off and send them to Italy', de: 'Sie auskaufen und nach Italien schicken' }, effect: (e) => { e.fx.gold(-2); e.fx.unrest(e.ctx.loc, -3); e.fx.prestige(-1); }, ai: 0.6 },
      { label: { en: 'Muster the knights and storm the castle', de: 'Die Ritter aufbieten und die Burg stürmen' }, effect: (e) => { e.fx.manpower(-0.05); e.fx.prestige(4); e.fx.estate('magnates', 4); e.fx.devastate(e.ctx.loc, 0.1); }, ai: 0.5 },
      { label: { en: 'Hire them ourselves', de: 'Sie selbst in Sold nehmen' }, effect: (e) => { e.fx.gold(-1); e.fx.manpower(0.05); e.fx.estate('commons', -3); }, ai: 0.4 },
    ],
  },
  {
    id: 'peasant_rising', art: 'revolt', major: true,
    title: { en: 'The Commons Rise', de: 'Die Gemeinen erheben sich' },
    text: {
      en: 'Beaten down by war taxes, plunder and the arrogance of their lords, the peasants of {loc} have taken up scythes and flails. Manor houses burn; the bailiffs have been hanged from their own gates. Their leaders say they are loyal to {ruler}, but not to the lords.',
      de: 'Niedergedrückt von Kriegssteuern, Plünderung und dem Hochmut ihrer Herren haben die Bauern von {loc} zu Sensen und Dreschflegeln gegriffen. Herrenhäuser brennen; die Vögte hängen an ihren eigenen Toren. Ihre Anführer sagen, sie seien {ruler} treu, nicht aber den Herren.',
    },
    mtth: 36, cooldown: 20,
    trigger: (e) => settled(e) && H.avgUnrest(e) > 18 && (e.n.warExhaustion > 15 || est(e, 'commons').contentment < 30),
    setup: (e) => { let b = -1, bu = -1; for (const l of H.locs(e.s, e.n.id)) if (e.s.loc.unrest[l] > bu) { bu = e.s.loc.unrest[l]; b = l; } e.ctx.loc = b; return b >= 0; },
    options: [
      { label: { en: 'Crush them with the knights', de: 'Sie mit den Rittern niederwerfen' }, effect: (e) => { e.fx.devastate(e.ctx.loc, 0.3); e.fx.pop(e.ctx.loc, -0.04); e.fx.unrest(e.ctx.loc, -10); e.fx.estate('magnates', 8); e.fx.estate('commons', -12); e.fx.authority(5); }, ai: 0.6 },
      { label: { en: 'Meet them and grant charters', de: 'Sie empfangen und Freibriefe gewähren' }, effect: (e) => { e.fx.unrest(e.ctx.loc, -20); e.fx.estate('commons', 12); e.fx.estate('magnates', -10); e.fx.value(1, -6); e.fx.authority(-10); }, ai: 0.4 },
      { label: { en: 'Promise, then revoke when they disperse', de: 'Versprechen und widerrufen, sobald sie abziehen' }, effect: (e) => { e.fx.unrest(e.ctx.loc, -8); e.fx.mandate(-6); e.fx.estate('commons', -6); e.fx.estate('magnates', 4); }, ai: 0.4 },
    ],
  },
  {
    id: 'wool_workers_revolt', art: 'revolt',
    title: { en: 'The Little People of {loc}', de: 'Das kleine Volk von {loc}' },
    text: {
      en: 'The wool carders, dyers and fullers of {loc}, who may not form guilds of their own and are paid in debased coin, have seized the town hall. They demand guilds of their own, a voice on the council, and an end to the wool masters’ courts.',
      de: 'Die Wollkämmer, Färber und Walker von {loc}, die keine eigenen Zünfte bilden dürfen und in schlechter Münze bezahlt werden, haben das Rathaus besetzt. Sie fordern eigene Zünfte, eine Stimme im Rat und ein Ende der Gerichte der Wollherren.',
    },
    mtth: 120, cooldown: 25,
    trigger: (e) => settled(e) && (republic(e) || est(e, 'burghers').influence > 30) && H.avgUnrest(e) > 6,
    setup: (e) => { e.ctx.loc = bigTown(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Grant them guilds and seats', de: 'Ihnen Zünfte und Sitze gewähren' }, effect: (e) => { e.fx.estate('commons', 10, 3); e.fx.estate('burghers', -10); e.fx.unrest(e.ctx.loc, -12); e.fx.concord(-3); }, ai: 0.4 },
      { label: { en: 'Let the great guilds restore order', de: 'Die großen Zünfte die Ordnung wiederherstellen lassen' }, effect: (e) => { e.fx.estate('burghers', 8); e.fx.estate('commons', -8); e.fx.unrest(e.ctx.loc, -4); e.fx.pop(e.ctx.loc, -0.01); }, ai: 0.6 },
    ],
  },
  {
    id: 'condottiere_offer', art: 'battle',
    title: { en: 'A Condottiere’s Contract', de: 'Der Vertrag eines Condottiere' },
    text: {
      en: 'A famous captain of fortune offers {nation} a condotta: a thousand lances and as many crossbowmen for one year, at a price that would buy a small city. His rivals say he never fights a battle he could win by waiting; his friends say he never loses one.',
      de: 'Ein berühmter Söldnerführer bietet {nation} eine Condotta an: tausend Lanzen und ebenso viele Armbrustschützen für ein Jahr, zu einem Preis, für den man eine kleine Stadt kaufen könnte. Seine Rivalen sagen, er schlage nie eine Schlacht, die er durch Warten gewinnen könne; seine Freunde sagen, er verliere nie eine.',
    },
    mtth: 48, cooldown: 10, maxYear: 1550,
    trigger: (e) => settled(e) && e.n.capital >= 0 && e.w.lat[e.n.capital] < 46.5 && e.w.lat[e.n.capital] > 37 && e.w.lon[e.n.capital] > 7 && e.w.lon[e.n.capital] < 19 && (atWar(e) || H.neighbourNations(e).some((o) => H.atWarWith(e.s, o, e.n.id))),
    options: [
      { label: { en: 'Sign the condotta', de: 'Die Condotta unterzeichnen' }, effect: (e) => { e.fx.gold(-3); e.fx.manpower(0.15); e.fx.modifier('condotta', 2, { en: 'Condotta', de: 'Condotta' }, { morale: 0.08, discipline: 0.05 }); e.fx.estate('burghers', -3); }, ai: (e) => (rich(e, 4) ? 0.8 : 0.2) },
      { label: { en: 'Hire half the company', de: 'Die halbe Kompanie anwerben' }, effect: (e) => { e.fx.gold(-1.5); e.fx.manpower(0.07); }, ai: 0.5 },
      { label: { en: 'Trust our own militia', de: 'Unserer eigenen Miliz vertrauen' }, effect: (e) => { e.fx.estate('commons', 3); e.fx.manpower(0.03); e.fx.estate('burghers', 2); }, ai: 0.3 },
    ],
  },
  {
    id: 'deserters', art: 'battle',
    title: { en: 'Deserters in the Forests', de: 'Deserteure in den Wäldern' },
    text: {
      en: 'Weary of hunger, fever and unpaid service, hundreds of soldiers have slipped away from the army of {nation}. They now live as robbers in the woods around {loc}, waylaying merchants and stealing cattle.',
      de: 'Müde von Hunger, Fieber und unbezahltem Dienst haben sich Hunderte Soldaten vom Heer von {nation} davongestohlen. Sie leben nun als Räuber in den Wäldern um {loc}, überfallen Kaufleute und stehlen Vieh.',
    },
    mtth: 48, cooldown: 10,
    trigger: (e) => atWar(e) && e.n.warExhaustion > 20,
    setup: (e) => { e.ctx.loc = H.randomLoc(e, (l) => e.w.terrain[l] === 2 || e.w.terrain[l] === 3); if (e.ctx.loc < 0) e.ctx.loc = H.randomLoc(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Proclaim an amnesty for those who return', de: 'Eine Amnestie für Rückkehrer verkünden' }, effect: (e) => { e.fx.manpower(0.03); e.fx.authority(-5); e.fx.unrest(e.ctx.loc, -3); }, ai: 0.6 },
      { label: { en: 'Hunt them down and hang them', de: 'Sie jagen und aufhängen' }, effect: (e) => { e.fx.manpower(-0.02); e.fx.authority(5); e.fx.unrest(e.ctx.loc, -6); e.fx.modifier('harsh_discipline', 3, { en: 'Harsh discipline', de: 'Harte Manneszucht' }, { discipline: 0.03, morale: -0.02 }); }, ai: 0.5 },
      { label: { en: 'Leave it to the villages', de: 'Es den Dörfern überlassen' }, effect: (e) => { e.fx.devastate(e.ctx.loc, 0.15); e.fx.unrest(e.ctx.loc, 6); e.fx.warExhaustion(-2); }, ai: 0.2 },
    ],
  },
  {
    id: 'war_widows', art: 'church',
    title: { en: 'The Widows’ Petition', de: 'Die Bittschrift der Witwen' },
    text: {
      en: 'Women from the villages around {loc} whose husbands and sons fell in the last war have come to court. They cannot pay the heriot on their dead men’s holdings, and the lords are taking their land. They ask {ruler} for justice.',
      de: 'Frauen aus den Dörfern um {loc}, deren Männer und Söhne im letzten Krieg gefallen sind, sind an den Hof gekommen. Sie können den Sterbfall für die Güter ihrer Toten nicht bezahlen, und die Herren nehmen ihnen das Land. Sie bitten {ruler} um Gerechtigkeit.',
    },
    mtth: 60, cooldown: 15,
    trigger: (e) => !atWar(e) && e.n.warExhaustion > 8 && settled(e),
    setup: (e) => { e.ctx.loc = H.randomLoc(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Remit the dues and confirm their tenure', de: 'Die Abgaben erlassen und ihren Besitz bestätigen' }, effect: (e) => { e.fx.gold(-0.5); e.fx.estate('commons', 8); e.fx.estate('magnates', -5); e.fx.concord(3); e.fx.warExhaustion(-3); }, ai: 0.7 },
      { label: { en: 'A pension from the treasury', de: 'Eine Pension aus der Schatzkammer' }, effect: (e) => { e.fx.gold(-1.5); e.fx.estate('commons', 5); e.fx.mandate(3); e.fx.warExhaustion(-2); }, ai: 0.5 },
      { label: { en: 'The lords’ courts must decide', de: 'Die Herrengerichte sollen entscheiden' }, effect: (e) => { e.fx.estate('magnates', 4); e.fx.estate('commons', -6); }, ai: 0.3 },
    ],
  },
  {
    id: 'veteran_settlement', art: 'harvest',
    title: { en: 'Land for the Veterans', de: 'Land für die Veteranen' },
    text: {
      en: 'The war is over and thousands of discharged soldiers wander the roads of {nation}, with no trade but killing. The marshal proposes to settle them on waste and border land around {loc} in return for service in the militia.',
      de: 'Der Krieg ist vorbei, und Tausende entlassene Soldaten ziehen über die Straßen von {nation}, ohne ein anderes Handwerk als das Töten. Der Marschall schlägt vor, sie auf Ödland und Grenzland um {loc} anzusiedeln, gegen Dienst in der Landwehr.',
    },
    mtth: 60, cooldown: 20,
    trigger: (e) => !atWar(e) && e.n.warExhaustion > 5 && e.n.warExhaustion < 40 && settled(e),
    setup: (e) => { let b = -1, bd = 1e9; for (const l of H.locs(e.s, e.n.id)) if (e.s.loc.dev[l] < bd) { bd = e.s.loc.dev[l]; b = l; } e.ctx.loc = b; return b >= 0; },
    options: [
      { label: { en: 'Settle them as military colonists', de: 'Sie als Wehrbauern ansiedeln' }, effect: (e) => { e.fx.gold(-1); e.fx.pop(e.ctx.loc, 0.05); e.fx.dev(e.ctx.loc, 0.5); e.fx.manpower(0.05); e.fx.estate('commons', 3); }, ai: 0.7 },
      { label: { en: 'Pay them off and send them home', de: 'Sie abfinden und heimschicken' }, effect: (e) => { e.fx.gold(-1.5); e.fx.unrestAll(-2); e.fx.warExhaustion(-3); }, ai: 0.5 },
      { label: { en: 'Let them find work where they can', de: 'Sollen sie Arbeit finden, wo sie können' }, effect: (e) => { e.fx.unrestAll(3); e.fx.estate('commons', -3); }, ai: 0.2 },
    ],
  },
  {
    id: 'fortress_engineer', art: 'battle',
    title: { en: 'The Engineer’s Bastions', de: 'Die Bastionen des Ingenieurs' },
    text: {
      en: 'An Italian military engineer shows {ruler} his drawings: low, thick walls of earth faced with brick, angled bastions so that no ditch is hidden from the guns. The high old towers of {loc}, he says, would not stand a week against modern cannon.',
      de: 'Ein italienischer Kriegsbaumeister zeigt {ruler} seine Zeichnungen: niedrige, dicke Erdwälle mit Ziegelverkleidung, spitzwinklige Bastionen, damit kein Graben vor den Geschützen verborgen bleibt. Die hohen alten Türme von {loc}, sagt er, würden modernen Kanonen keine Woche standhalten.',
    },
    mtth: 100, oncePer: true, minYear: 1480,
    trigger: (e) => settled(e) && eraAtLeast(e, 1) && rich(e, 4),
    setup: (e) => { e.ctx.loc = e.n.capital; return true; },
    options: [
      { label: { en: 'Rebuild the walls of {loc} in the new manner', de: 'Die Mauern von {loc} nach neuer Art umbauen' }, effect: (e) => { e.fx.gold(-5); e.fx.building(e.ctx.loc, BI.fort, 1); e.fx.modifier('trace_italienne', 50, { en: 'Bastioned fortresses', de: 'Bastionierte Festungen' }, { fort_strength: 0.15 }); e.fx.insight(3); }, ai: 0.7 },
      { label: { en: 'Hire him to teach our masons', de: 'Ihn anstellen, um unsere Maurer zu lehren' }, effect: (e) => { e.fx.gold(-1.5); e.fx.modifier('trace_italienne', 30, { en: 'Bastioned fortresses', de: 'Bastionierte Festungen' }, { fort_strength: 0.07 }); }, ai: 0.5 },
    ],
  },
  {
    id: 'gunpowder_master', art: 'battle',
    title: { en: 'The Master Gunner', de: 'Der Büchsenmeister' },
    text: {
      en: 'A master gunner from the Low Countries offers to cast great bombards for {ruler}: iron hoops on a barrel as wide as a man, throwing stones that break any wall. He needs bronze, saltpetre, an armoury and a guarantee that he will not be burned for sorcery.',
      de: 'Ein Büchsenmeister aus den Niederlanden bietet an, für {ruler} große Steinbüchsen zu gießen: eiserne Reifen um ein Rohr, so weit wie ein Mann, die Steinkugeln werfen, die jede Mauer brechen. Er braucht Bronze, Salpeter, ein Zeughaus und die Zusicherung, nicht als Zauberer verbrannt zu werden.',
    },
    mtth: 100, oncePer: true, minYear: 1370, maxYear: 1550,
    trigger: (e) => settled(e) && rich(e, 3),
    options: [
      { label: { en: 'Build him an armoury', de: 'Ihm ein Zeughaus bauen' }, effect: (e) => { e.fx.gold(-3); e.fx.tech(2, 0.1); e.fx.modifier('bombards', 40, { en: 'Royal artillery train', de: 'Königlicher Geschützpark' }, { fire: 0.08 }); }, ai: 0.7 },
      { label: { en: 'Buy a few guns from him and send him off', de: 'Ihm einige Büchsen abkaufen und ihn wegschicken' }, effect: (e) => { e.fx.gold(-1); e.fx.modifier('bombards', 15, { en: 'A few bombards', de: 'Einige Steinbüchsen' }, { fire: 0.03 }); }, ai: 0.5 },
      { label: { en: 'Knights win wars, not smoke', de: 'Ritter gewinnen Kriege, nicht Rauch' }, effect: (e) => { e.fx.estate('magnates', 5); e.fx.modifier('chivalry', 10, { en: 'Chivalric pride', de: 'Ritterstolz' }, { cavalry: 0.03 }); }, ai: 0.2 },
    ],
  },
  {
    id: 'drill_reform', art: 'battle',
    title: { en: 'Pike, Shot and Drill', de: 'Pike, Schuss und Drill' },
    text: {
      en: 'The colonels of {nation} quarrel over a new treatise on war. It says that soldiers should be drilled daily in companies, taught to fire by ranks and to wheel at the drum, and that captains should be paid by the crown, not by their men.',
      de: 'Die Obristen von {nation} streiten über eine neue Kriegsschrift. Sie verlangt, die Soldaten täglich in Kompanien zu drillen, sie gliedweise feuern und auf den Trommelschlag schwenken zu lassen, und die Hauptleute von der Krone statt von ihren Männern zu besolden.',
    },
    mtth: 100, oncePer: true, minYear: 1590,
    trigger: (e) => settled(e) && eraAtLeast(e, 1),
    options: [
      { label: { en: 'Adopt the new drill', de: 'Den neuen Drill einführen' }, effect: (e) => { e.fx.gold(-2); e.fx.estate('magnates', -5); e.fx.modifier('new_drill', 50, { en: 'Modern drill', de: 'Moderner Drill' }, { discipline: 0.06, army_cost: 0.03 }); e.fx.tech(2, 0.05); }, ai: 0.7 },
      { label: { en: 'Our old ways serve us', de: 'Unsere alten Bräuche genügen' }, effect: (e) => { e.fx.estate('magnates', 4); e.fx.gold(0.5); }, ai: 0.3 },
    ],
  },
  {
    id: 'war_subsidy_refused', art: 'court',
    title: { en: 'No Taxes without Redress', de: 'Keine Steuern ohne Abhilfe' },
    text: {
      en: 'Summoned to grant a war subsidy, the assembly of {nation} has answered with a list of grievances: purveyors who take without paying, judges who sell justice, foreign favourites at court. They will vote no money until each is remedied.',
      de: 'Zur Bewilligung einer Kriegssteuer einberufen, hat die Ständeversammlung von {nation} mit einer Liste von Beschwerden geantwortet: Hoflieferanten, die nehmen, ohne zu zahlen, Richter, die Recht verkaufen, fremde Günstlinge bei Hofe. Sie wird kein Geld bewilligen, bis allem abgeholfen ist.',
    },
    mtth: 48, cooldown: 15,
    trigger: (e) => atWar(e) && monarchy(e) && (est(e, 'burghers').influence + est(e, 'magnates').influence > 60) && e.n.treasury < inc(e) * 4,
    options: [
      { label: { en: 'Redress the grievances', de: 'Den Beschwerden abhelfen' }, effect: (e) => { e.fx.gold(3); e.fx.authority(-15); e.fx.estate('burghers', 6); e.fx.estate('magnates', 4); e.fx.corruption(-0.02); }, ai: 0.6 },
      { label: { en: 'Dissolve the assembly and levy by decree', de: 'Die Versammlung auflösen und per Erlass erheben' }, effect: (e) => { e.fx.gold(2); e.fx.authority(10); e.fx.estate('burghers', -10); e.fx.estate('magnates', -6); e.fx.concord(-8); }, ai: 0.3 },
      { label: { en: 'Fight on without the subsidy', de: 'Ohne die Steuer weiterkämpfen' }, effect: (e) => { e.fx.warExhaustion(4); e.fx.estate('burghers', 2); }, ai: 0.3 },
    ],
  },
  {
    id: 'noble_ransom', art: 'battle',
    title: { en: 'A Ransom for a Count', de: 'Lösegeld für einen Grafen' },
    text: {
      en: 'Among the prisoners of our last victory is a count of {other}, a cousin of their ruler. His family offers a great ransom; our own knights who took him expect their share; and some advise holding him as a pledge for a good peace.',
      de: 'Unter den Gefangenen unseres letzten Sieges ist ein Graf aus {other}, ein Vetter ihres Herrschers. Seine Familie bietet ein großes Lösegeld; unsere eigenen Ritter, die ihn gefangen nahmen, erwarten ihren Anteil; und manche raten, ihn als Pfand für einen guten Frieden zu behalten.',
    },
    mtth: 60, cooldown: 10,
    trigger: (e) => atWar(e) && e.n.stats.battlesWon > (e.n.flags.ransom_bw || 0),
    setup: (e) => { e.n.flags.ransom_bw = e.n.stats.battlesWon; const w = e.s.wars.find((x) => x.att.includes(e.n.id) || x.def.includes(e.n.id)); if (!w) return false; e.ctx.other = w.att.includes(e.n.id) ? w.defLead : w.attLead; return e.ctx.other >= 0 && e.ctx.other !== e.n.id; },
    options: [
      { label: { en: 'Take the ransom', de: 'Das Lösegeld nehmen' }, effect: (e) => { e.fx.gold(2); e.fx.estate('magnates', -3); e.fx.opinion(e.ctx.other, 5); }, ai: 0.6 },
      { label: { en: 'Let the knights keep the ransom', de: 'Den Rittern das Lösegeld lassen' }, effect: (e) => { e.fx.estate('magnates', 8); e.fx.prestige(2); }, ai: 0.5 },
      { label: { en: 'Hold him as a pledge', de: 'Ihn als Pfand behalten' }, effect: (e) => { e.fx.opinion(e.ctx.other, -10); e.fx.modifier('noble_hostage', 3, { en: 'Noble hostage', de: 'Adelige Geisel' }, { concord: 2 }); e.fx.prestige(3); }, ai: 0.3 },
    ],
  },
  {
    id: 'town_under_siege', art: 'battle',
    title: { en: 'Hunger in Besieged {loc}', de: 'Hunger im belagerten {loc}' },
    text: {
      en: 'The garrison of {loc} has eaten its horses and now the rats. The burghers beg the commander to surrender before the town is stormed and sacked; the commander asks {ruler} whether to hold.',
      de: 'Die Besatzung von {loc} hat ihre Pferde gegessen und nun die Ratten. Die Bürger flehen den Befehlshaber an, sich zu ergeben, bevor die Stadt gestürmt und geplündert wird; der Befehlshaber fragt {ruler}, ob er halten soll.',
    },
    mtth: 6, cooldown: 3,
    trigger: (e) => atWar(e) && e.s.sieges.some((sg) => sg.days > 60 && e.s.loc.owner[sg.loc] === e.n.id && sg.nation !== e.n.id),
    setup: (e) => { const sg = e.s.sieges.find((x) => x.days > 60 && e.s.loc.owner[x.loc] === e.n.id && x.nation !== e.n.id); if (!sg) return false; e.ctx.loc = sg.loc; e.ctx.other = sg.nation; return true; },
    options: [
      { label: { en: 'Hold to the last man', de: 'Bis zum letzten Mann halten' }, effect: (e) => { e.fx.prestige(3); e.fx.pop(e.ctx.loc, -0.04); e.fx.unrest(e.ctx.loc, 8); e.fx.modifier('heroic_defence', 2, { en: 'Heroic defence', de: 'Heldenhafte Verteidigung' }, { fort_strength: 0.1, morale: 0.03 }); }, ai: 0.6 },
      { label: { en: 'Smuggle in grain at any price', de: 'Um jeden Preis Getreide hineinschmuggeln' }, effect: (e) => { e.fx.gold(-1.5); e.fx.unrest(e.ctx.loc, -4); e.fx.modifier('relieved_siege', 1, { en: 'Supplies run in', de: 'Nachschub eingeschleust' }, { fort_strength: 0.08 }); }, ai: (e) => (rich(e, 3) ? 0.7 : 0.2) },
      { label: { en: 'Allow honourable terms', de: 'Ehrenvolle Bedingungen gestatten' }, effect: (e) => { e.fx.prestige(-3); e.fx.estate('burghers', 4); e.fx.warExhaustion(3); }, ai: 0.3 },
    ],
  },
  {
    id: 'steppe_raid', art: 'battle',
    title: { en: 'Raiders from the Steppe', de: 'Reiter aus der Steppe' },
    text: {
      en: 'Horsemen of {other} have swept through the borderlands around {loc}, burning villages and driving away thousands of captives for the slave markets of Caffa. The border lords ask for a line of forts and watchtowers.',
      de: 'Reiter aus {other} sind durch das Grenzland um {loc} gefegt, haben Dörfer niedergebrannt und Tausende Gefangene für die Sklavenmärkte von Kaffa fortgetrieben. Die Grenzherren bitten um eine Linie von Festungen und Wachtürmen.',
    },
    mtth: 60, cooldown: 6,
    trigger: (e) => settled(e) && H.neighbourNations(e).some((o) => e.s.nations[o].gov === 'nomadic_horde' || e.s.nations[o].key === 'crimea'),
    setup: (e) => { const o = H.pickNeighbour(e, (x) => e.s.nations[x].gov === 'nomadic_horde' || e.s.nations[x].key === 'crimea'); if (o < 0) return false; e.ctx.other = o; const ls = H.locs(e.s, e.n.id).filter((l) => { for (let j = e.w.adjStart[l]; j < e.w.adjStart[l + 1]; j++) { const v = e.w.adj[j]; if (v < e.w.L && e.s.loc.owner[v] === o) return true; } return false; }); e.ctx.loc = ls.length ? ls[0] : H.randomLoc(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Build a line of watchtowers', de: 'Eine Kette von Wachtürmen bauen' }, effect: (e) => { e.fx.gold(-2); e.fx.building(e.ctx.loc, BI.fort, 1); e.fx.pop(e.ctx.loc, -0.02); e.fx.estate('magnates', 3); }, ai: (e) => (rich(e, 3) ? 0.7 : 0.2) },
      { label: { en: 'Pay a tribute of furs and silver', de: 'Einen Tribut in Pelzen und Silber zahlen' }, effect: (e) => { e.fx.gold(-1); e.fx.prestige(-3); e.fx.opinion(e.ctx.other, 10); e.fx.pop(e.ctx.loc, -0.01); }, ai: 0.5 },
      { label: { en: 'Settle free frontiersmen on the border', de: 'Freie Grenzsiedler an der Grenze ansiedeln' }, effect: (e) => { e.fx.pop(e.ctx.loc, -0.03); e.fx.devastate(e.ctx.loc, 0.2); e.fx.manpower(0.04); e.fx.estate('commons', 3); e.fx.value(1, -3); }, ai: 0.4 },
    ],
  },
  {
    id: 'militia_muster', art: 'battle',
    title: { en: 'The General Muster', de: 'Die allgemeine Musterung' },
    text: {
      en: 'By ancient custom every free man of {nation} between sixteen and sixty must appear with bow, bill or pike at the muster. The commissioners report that half came with rusty weapons and a third did not come at all.',
      de: 'Nach altem Brauch muss jeder freie Mann von {nation} zwischen sechzehn und sechzig mit Bogen, Hellebarde oder Spieß zur Musterung erscheinen. Die Kommissare berichten, die Hälfte sei mit rostigen Waffen gekommen und ein Drittel überhaupt nicht.',
    },
    mtth: 300, cooldown: 30,
    trigger: (e) => settled(e) && !atWar(e) && christian(e),
    options: [
      { label: { en: 'Fine the absent and arm the rest', de: 'Die Fehlenden bestrafen und die Übrigen bewaffnen' }, effect: (e) => { e.fx.gold(-1); e.fx.manpower(0.08); e.fx.estate('commons', -4); e.fx.authority(3); }, ai: 0.6 },
      { label: { en: 'Order shooting practice every Sunday', de: 'Jeden Sonntag Schießübungen anordnen' }, effect: (e) => { e.fx.estate('prelates', -2); e.fx.modifier('sunday_butts', 15, { en: 'Sunday shooting practice', de: 'Sonntägliches Scheibenschießen' }, { fire: 0.04, manpower: 0.03 }); }, ai: 0.5 },
      { label: { en: 'Let the old custom lapse', de: 'Den alten Brauch einschlafen lassen' }, effect: (e) => { e.fx.estate('commons', 4); e.fx.manpower(-0.05); }, ai: 0.2 },
    ],
  },
  {
    id: 'army_plunders_own', art: 'revolt',
    title: { en: 'Our Own Army Plunders', de: 'Das eigene Heer plündert' },
    text: {
      en: 'Complaints pour in from {loc}: the soldiers quartered there have stripped the barns, broken the casks and dishonoured the farmers’ daughters. "Friend or foe," say the villagers, "the soldier is the same."',
      de: 'Aus {loc} häufen sich die Klagen: Die dort einquartierten Soldaten haben die Scheunen geleert, die Fässer zerschlagen und die Bauerntöchter geschändet. „Ob Freund oder Feind“, sagen die Dorfleute, „der Soldat ist derselbe.“',
    },
    mtth: 36, cooldown: 8,
    trigger: (e) => atWar(e) && e.s.armies.some((a) => a.owner === e.n.id && !a.fleet && e.s.loc.owner[a.loc] === e.n.id && a.supplyDeficit > 0),
    setup: (e) => { const a = e.s.armies.find((x) => x.owner === e.n.id && !x.fleet && e.s.loc.owner[x.loc] === e.n.id && x.supplyDeficit > 0); if (!a) return false; e.ctx.loc = a.loc; return true; },
    options: [
      { label: { en: 'Hang the worst offenders', de: 'Die schlimmsten Übeltäter hängen' }, effect: (e) => { e.fx.unrest(e.ctx.loc, -4); e.fx.estate('commons', 4); e.fx.modifier('army_justice', 2, { en: 'Strict military justice', de: 'Strenge Militärjustiz' }, { morale: -0.03, discipline: 0.03 }); }, ai: 0.6 },
      { label: { en: 'Compensate the villages', de: 'Die Dörfer entschädigen' }, effect: (e) => { e.fx.gold(-1); e.fx.unrest(e.ctx.loc, -6); e.fx.estate('commons', 3); }, ai: 0.5 },
      { label: { en: 'Soldiers must eat', de: 'Soldaten müssen essen' }, effect: (e) => { e.fx.devastate(e.ctx.loc, 0.2); e.fx.unrest(e.ctx.loc, 8); e.fx.estate('commons', -5); }, ai: 0.3 },
    ],
  },
];
