// Life at court: feasts, regencies, favourites, plots, heirs, madness, tournaments, orders, patronage.
import type { EventDef, EvApi } from '../../systems/events';
import { H } from '../../systems/events';
import { BI } from '../../defs';
import { chance } from '../../rng';
import { christian, monarchy, settled, rich, ruler, rulerAge, heir, heirAge, est, bigTown, eraAtLeast } from './util';

const heirSkill = (e: EvApi, k: 0 | 1 | 2, d: number) => { const h = heir(e); if (h) h.skills[k] = Math.max(0, Math.min(6, h.skills[k] + d)); };
const heirTrait = (e: EvApi, t: string) => { const h = heir(e); if (h && !h.traits.includes(t)) h.traits.push(t); };

export const COURT_EVENTS: EventDef[] = [
  {
    id: 'court_feast', title: { en: 'A Great Feast', de: 'Ein großes Fest' }, art: 'court',
    text: { en: 'The nobles of {nation} expect {ruler} to hold a feast worthy of the crown.', de: 'Die Adligen von {nation} erwarten von {ruler} ein Fest, das der Krone würdig ist.' },
    mtth: 120, cooldown: 15,
    trigger: (e) => e.n.treasury > (e.n.income.tax || 10) * 3,
    options: [
      { label: { en: 'Spare no expense', de: 'Keine Kosten scheuen' }, effect: (e) => { e.fx.gold(-2); e.fx.estate('magnates', 10); e.fx.prestige(3); }, ai: 0.8 },
      { label: { en: 'A modest table will do', de: 'Eine bescheidene Tafel genügt' }, effect: (e) => { e.fx.estate('magnates', -5); }, ai: 0.5 },
    ],
  },
  {
    id: 'peasant_grievances', title: { en: 'Peasant Grievances', de: 'Klagen der Bauern' }, art: 'revolt',
    text: { en: 'Peasants around {loc} complain of heavy dues and threaten to stop work.', de: 'Bauern um {loc} klagen über schwere Abgaben und drohen, die Arbeit niederzulegen.' },
    mtth: 72, cooldown: 10,
    trigger: (e) => H.avgUnrest(e) > 12,
    setup: (e) => { e.ctx.loc = H.randomLoc(e, (l) => e.s.loc.unrest[l] > 10); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Lower their dues', de: 'Abgaben senken' }, effect: (e) => { e.fx.unrest(e.ctx.loc, -15); e.fx.estate('commons', 8); e.fx.estate('magnates', -5); e.fx.gold(-0.5); }, ai: 0.9 },
      { label: { en: 'Send the bailiffs', de: 'Die Vögte schicken' }, effect: (e) => { e.fx.unrest(e.ctx.loc, 10); e.fx.estate('magnates', 4); e.fx.authority(5); }, ai: 0.6 },
    ],
  },
  {
    id: 'regency_council', art: 'court',
    title: { en: 'The Regent’s Ambition', de: 'Der Ehrgeiz des Regenten' },
    text: {
      en: 'While {ruler} is still a child, the regent governs {nation}. Now the regent asks the council for the great seal, the right to name castellans and a pension from the crown lands. The young ruler’s uncles object loudly.',
      de: 'Solange {ruler} noch ein Kind ist, regiert der Regent {nation}. Nun verlangt der Regent vom Rat das große Siegel, das Recht, Burgvögte zu ernennen, und eine Rente aus dem Krongut. Die Onkel des jungen Herrschers erheben lauten Einspruch.',
    },
    mtth: 12, cooldown: 6,
    trigger: (e) => !!e.n.regent && monarchy(e),
    options: [
      { label: { en: 'Give the regent a free hand', de: 'Dem Regenten freie Hand lassen' }, effect: (e) => { e.fx.authority(10); e.fx.estate('magnates', -8); e.fx.corruption(0.02); }, ai: 0.4 },
      { label: { en: 'Govern through a council of regency', de: 'Durch einen Regentschaftsrat regieren' }, effect: (e) => { e.fx.estate('magnates', 8, 2); e.fx.authority(-5); e.fx.concord(4); }, ai: 0.7 },
      { label: { en: 'Let the estates of the realm decide', de: 'Die Stände des Reiches entscheiden lassen' }, effect: (e) => { e.fx.estate('burghers', 6, 2); e.fx.estate('prelates', 4); e.fx.authority(-10); e.fx.mandate(3); }, ai: 0.4 },
    ],
  },
  {
    id: 'royal_favourite', art: 'court',
    title: { en: 'The Favourite', de: 'Der Günstling' },
    text: {
      en: 'A handsome young knight of low birth has won the heart and the ear of {ruler}. He now hands out offices, mocks the old lords with nicknames, and has been given an earldom. The magnates demand his banishment.',
      de: 'Ein schöner junger Ritter niederer Herkunft hat das Herz und das Ohr von {ruler} gewonnen. Er vergibt nun Ämter, verspottet die alten Herren mit Spottnamen und hat eine Grafschaft erhalten. Die Magnaten verlangen seine Verbannung.',
    },
    mtth: 300, cooldown: 30,
    trigger: (e) => monarchy(e) && rulerAge(e) > 18 && !e.n.regent,
    options: [
      { label: { en: 'Banish him to save the peace', de: 'Ihn verbannen, um den Frieden zu wahren' }, effect: (e) => { e.fx.estate('magnates', 8); e.fx.mandate(-3); e.fx.authority(-10); }, ai: 0.6 },
      { label: { en: 'Defy the lords and keep him', de: 'Den Herren trotzen und ihn behalten' }, effect: (e) => { e.fx.estate('magnates', -12); e.fx.concord(-8); e.fx.authority(10); e.fx.corruption(0.02); e.fx.modifier('favourite', 5, { en: 'Royal favourite', de: 'Königlicher Günstling' }, { authority_gain: 0.1, concord: -5 }); }, ai: 0.3 },
      { label: { en: 'Marry him into a great house', de: 'Ihn in ein großes Haus einheiraten lassen' }, effect: (e) => { e.fx.gold(-1); e.fx.estate('magnates', -3); e.fx.prestige(-2); }, ai: 0.4 },
    ],
  },
  {
    id: 'assassination_plot', art: 'court', major: true,
    title: { en: 'A Plot against {ruler}', de: 'Eine Verschwörung gegen {ruler}' },
    text: {
      en: 'A cook arrested with a phial of poison has named his masters under questioning: lords of the council who hold that {nation} would be better ruled by someone else. The letters found in his lodgings bear seals that {ruler} knows well.',
      de: 'Ein Koch, den man mit einem Giftfläschchen ergriffen hat, hat im Verhör seine Auftraggeber genannt: Herren des Rates, die meinen, {nation} wäre unter einem anderen besser regiert. Die in seiner Unterkunft gefundenen Briefe tragen Siegel, die {ruler} gut kennt.',
    },
    mtth: 120, cooldown: 20,
    trigger: (e) => settled(e) && (e.n.concord < -10 || e.n.mandate < 35 || est(e, 'magnates').contentment < 30),
    options: [
      { label: { en: 'Public trials and executions', de: 'Öffentliche Prozesse und Hinrichtungen' }, effect: (e) => { e.fx.authority(15); e.fx.estate('magnates', -10, -3); e.fx.concord(-3); e.fx.mandate(4); }, ai: 0.6 },
      { label: { en: 'Pardon them in exchange for oaths', de: 'Sie gegen Eide begnadigen' }, effect: (e) => { e.fx.estate('magnates', 8); e.fx.concord(4); e.fx.mandate(-3); e.fx.authority(-5); }, ai: 0.5 },
      { label: { en: 'Burn the letters and watch them', de: 'Die Briefe verbrennen und sie beobachten' }, effect: (e) => { e.fx.authority(5); e.fx.gold(-0.5); e.fx.modifier('watchful', 5, { en: 'Watchful court', de: 'Wachsamer Hof' }, { concord: 2 }); }, ai: 0.4 },
    ],
  },
  {
    id: 'heir_education', art: 'scholar',
    title: { en: 'The Education of the Heir', de: 'Die Erziehung des Thronfolgers' },
    text: {
      en: 'The heir of {nation} is old enough for serious schooling. Three candidates present themselves as tutor: a famous master of arms, a learned cleric who teaches Latin and law, and a widely travelled diplomat.',
      de: 'Der Thronfolger von {nation} ist alt genug für ernsthaften Unterricht. Drei Bewerber bieten sich als Erzieher an: ein berühmter Waffenmeister, ein gelehrter Geistlicher, der Latein und Recht lehrt, und ein weitgereister Diplomat.',
    },
    mtth: 12, cooldown: 12,
    trigger: (e) => { const a = heirAge(e); return a >= 7 && a <= 14 && monarchy(e); },
    options: [
      { label: { en: 'The master of arms', de: 'Der Waffenmeister' }, effect: (e) => { heirSkill(e, 2, 1); e.fx.gold(-0.5); e.fx.estate('magnates', 4); }, ai: 0.5 },
      { label: { en: 'The learned cleric', de: 'Der gelehrte Geistliche' }, effect: (e) => { heirSkill(e, 0, 1); e.fx.gold(-0.5); e.fx.estate('prelates', 4); }, ai: 0.6 },
      { label: { en: 'The diplomat', de: 'Der Diplomat' }, effect: (e) => { heirSkill(e, 1, 1); e.fx.gold(-1); e.fx.prestige(2); }, ai: 0.5 },
    ],
  },
  {
    id: 'restless_heir', art: 'court',
    title: { en: 'The Restless Heir', de: 'Der ungeduldige Thronfolger' },
    text: {
      en: 'The heir of {nation} is a grown man with no lands of his own and a household of hot-blooded young knights. He demands a duchy, a command, or a seat in the council; at taverns his companions toast the day he will rule.',
      de: 'Der Thronfolger von {nation} ist ein erwachsener Mann ohne eigenes Land, mit einem Gefolge heißblütiger junger Ritter. Er fordert ein Herzogtum, ein Kommando oder einen Sitz im Rat; in den Schenken trinken seine Gefährten auf den Tag, an dem er herrschen wird.',
    },
    mtth: 72, cooldown: 15,
    trigger: (e) => { const a = heirAge(e); return a >= 20 && a <= 40 && monarchy(e) && rulerAge(e) > 45; },
    options: [
      { label: { en: 'Grant him an apanage', de: 'Ihm eine Apanage gewähren' }, effect: (e) => { e.fx.gold(-1); e.fx.authority(-10); e.fx.concord(3); heirSkill(e, 0, 1); }, ai: 0.6 },
      { label: { en: 'Give him a command on the frontier', de: 'Ihm ein Kommando an der Grenze geben' }, effect: (e) => { heirSkill(e, 2, 1); e.fx.estate('magnates', 3); e.fx.manpower(-0.02); }, ai: 0.6 },
      { label: { en: 'Keep him on a short leash', de: 'Ihn an der kurzen Leine halten' }, effect: (e) => { e.fx.authority(5); e.fx.concord(-5); heirTrait(e, 'paranoid'); }, ai: 0.3 },
    ],
  },
  {
    id: 'royal_madness', art: 'court', major: true,
    title: { en: 'The Ruler’s Madness', de: 'Der Wahnsinn des Herrschers' },
    text: {
      en: 'Riding through a forest in summer heat, {ruler} suddenly drew a sword and struck down four men of the escort, crying treason. Since then the ruler believes at times to be made of glass. The princes of the blood circle the throne.',
      de: 'Beim Ritt durch einen Wald in der Sommerhitze zog {ruler} plötzlich das Schwert und erschlug vier Männer des eigenen Geleits, unter dem Ruf, man sei verraten. Seither glaubt der Herrscher zeitweise, aus Glas zu sein. Die Prinzen von Geblüt umkreisen den Thron.',
    },
    mtth: 600, cooldown: 50,
    trigger: (e) => monarchy(e) && rulerAge(e) > 22 && !e.n.regent && !(ruler(e)?.traits.includes('paranoid')) && !!ruler(e) && (ruler(e)!.health < 0.8 || ruler(e)!.traits.some((t) => t === 'sickly' || t === 'cruel' || t === 'rash' || t === 'weak_willed')),
    options: [
      { label: { en: 'Govern through a council of princes', de: 'Durch einen Rat der Prinzen regieren' }, effect: (e) => { e.fx.rulerTrait('paranoid'); e.fx.rulerSkill(0, -1); e.fx.estate('magnates', 10, 4); e.fx.authority(-20); e.fx.mandate(-5); }, ai: 0.6 },
      { label: { en: 'Hide it; the consort will rule in the ruler’s name', de: 'Es verbergen; die Gemahlin regiert im Namen des Herrschers' }, effect: (e) => { e.fx.rulerTrait('paranoid'); e.fx.rulerSkill(1, -1); e.fx.mandate(-10); e.fx.concord(-5); }, ai: 0.4 },
      { label: { en: 'Send for pilgrims, physicians and sorcerers', de: 'Pilger, Ärzte und Zauberer holen lassen' }, effect: (e) => { e.fx.rulerTrait('paranoid'); e.fx.gold(-1.5); e.fx.rulerHealth(-0.1); e.fx.estate('prelates', 3); }, ai: 0.3 },
    ],
  },
  {
    id: 'tournament', art: 'battle',
    title: { en: 'A Great Tournament', de: 'Ein großes Turnier' },
    text: {
      en: 'Heralds have proclaimed a tournament at {loc}. Knights of {nation} and from abroad will joust before the stands; {ruler} is expected to break a lance in person.',
      de: 'Herolde haben ein Turnier in {loc} ausgerufen. Ritter aus {nation} und aus der Fremde werden vor den Tribünen tjostieren; man erwartet, dass {ruler} selbst eine Lanze bricht.',
    },
    mtth: 150, cooldown: 12, maxYear: 1600,
    trigger: (e) => christian(e) && monarchy(e) && !H.atWar(e.s, e.n.id) && rich(e, 3) && rulerAge(e) > 16 && rulerAge(e) < 50,
    setup: (e) => { e.ctx.loc = e.n.capital; return true; },
    options: [
      { label: { en: '{ruler} rides in the lists', de: '{ruler} reitet in den Schranken' }, hint: { en: 'There is a small chance of a grievous wound.', de: 'Es besteht eine geringe Gefahr schwerer Verwundung.' }, effect: (e) => { e.fx.gold(-1.5); e.fx.prestige(6); e.fx.estate('magnates', 8); e.fx.rulerSkill(2, 1); if (chance(e.s.rng, 0.1)) e.fx.rulerHealth(-0.4); }, ai: 0.6 },
      { label: { en: 'Preside from the royal box', de: 'Aus der königlichen Loge den Vorsitz führen' }, effect: (e) => { e.fx.gold(-1.5); e.fx.prestige(3); e.fx.estate('magnates', 5); }, ai: 0.6 },
      { label: { en: 'Cancel it; a waste of good horses', de: 'Es absagen; eine Verschwendung guter Pferde' }, effect: (e) => { e.fx.estate('magnates', -5); e.fx.gold(0.5); }, ai: 0.2 },
    ],
  },
  {
    id: 'chivalric_order', art: 'coronation',
    title: { en: 'An Order of Knighthood', de: 'Ein Ritterorden der Krone' },
    text: {
      en: 'Following the example of the Garter and the Star, the heralds propose that {ruler} found an order of knighthood for the first lords of {nation}: twenty-four companions, a chapel, a collar and an oath of loyalty to the sovereign of the order.',
      de: 'Nach dem Vorbild des Hosenbandordens und des Sternenordens schlagen die Herolde vor, dass {ruler} einen Ritterorden für die ersten Herren von {nation} stiftet: vierundzwanzig Gefährten, eine Kapelle, eine Ordenskette und ein Treueid auf den Souverän des Ordens.',
    },
    mtth: 150, oncePer: true, maxYear: 1700,
    trigger: (e) => christian(e) && monarchy(e) && e.n.prestige > 10 && rich(e, 4),
    options: [
      { label: { en: 'Found the order with great ceremony', de: 'Den Orden mit großer Feierlichkeit stiften' }, effect: (e) => { e.fx.gold(-2); e.fx.prestige(10); e.fx.estate('magnates', 6); e.fx.modifier('chivalric_order', 40, { en: 'Royal order of knighthood', de: 'Königlicher Ritterorden' }, { morale: 0.03, mandate: 3 }); }, ai: 0.8 },
      { label: { en: 'Not now', de: 'Nicht jetzt' }, effect: (e) => { e.fx.gold(0.2); e.fx.estate('magnates', -2); }, ai: 0.2 },
    ],
  },
  {
    id: 'humanist_patron', art: 'scholar',
    title: { en: 'A Humanist Seeks a Patron', de: 'Ein Humanist sucht einen Gönner' },
    text: {
      en: 'A scholar who reads Cicero as if he were a living friend has come to {ruler}. He offers to write letters in Latin that will astonish foreign courts, to search monasteries for lost classical manuscripts, and to compose a history of {nation} worthy of Livy.',
      de: 'Ein Gelehrter, der Cicero liest, als sei er ein lebender Freund, ist zu {ruler} gekommen. Er bietet an, Briefe in einem Latein zu schreiben, das fremde Höfe in Staunen versetzt, in Klöstern nach verlorenen antiken Handschriften zu suchen und eine Geschichte von {nation} zu verfassen, die des Livius würdig ist.',
    },
    mtth: 120, cooldown: 20, minYear: 1380, maxYear: 1650,
    trigger: (e) => christian(e) && settled(e) && (e.year > 1450 || (e.n.capital >= 0 && e.w.lat[e.n.capital] < 47 && e.w.lon[e.n.capital] > 6 && e.w.lon[e.n.capital] < 19)),
    options: [
      { label: { en: 'Make him court secretary', de: 'Ihn zum Hofsekretär machen' }, effect: (e) => { e.fx.gold(-1); e.fx.insight(5); e.fx.prestige(3); e.fx.value(2, 3); }, ai: 0.7 },
      { label: { en: 'Commission only the history', de: 'Nur die Geschichte in Auftrag geben' }, effect: (e) => { e.fx.gold(-0.5); e.fx.mandate(4); }, ai: 0.5 },
      { label: { en: 'Send him on his way', de: 'Ihn seiner Wege schicken' }, effect: (e) => { e.fx.value(2, -2); e.fx.authority(2); }, ai: 0.2 },
    ],
  },
  {
    id: 'artist_commission', art: 'court',
    title: { en: 'The Painter’s Proposal', de: 'Der Vorschlag des Malers' },
    text: {
      en: 'A master painter whose altarpieces are spoken of across Christendom offers {ruler} a great work: a cycle of frescoes in the palace at {loc}, showing the deeds of the dynasty among the heroes of antiquity.',
      de: 'Ein Malermeister, dessen Altarbilder in der ganzen Christenheit gerühmt werden, bietet {ruler} ein großes Werk an: einen Freskenzyklus im Palast zu {loc}, der die Taten der Dynastie unter den Helden der Antike zeigt.',
    },
    mtth: 150, cooldown: 25, minYear: 1400,
    trigger: (e) => christian(e) && settled(e) && rich(e, 4),
    setup: (e) => { e.ctx.loc = e.n.capital; return true; },
    options: [
      { label: { en: 'Commission the full cycle', de: 'Den ganzen Zyklus in Auftrag geben' }, effect: (e) => { e.fx.gold(-3); e.fx.prestige(8); e.fx.mandate(3); e.fx.dev(e.ctx.loc, 0.3); }, ai: 0.6 },
      { label: { en: 'A portrait of {ruler} will do', de: 'Ein Bildnis von {ruler} genügt' }, effect: (e) => { e.fx.gold(-0.7); e.fx.prestige(3); }, ai: 0.6 },
    ],
  },
  {
    id: 'court_astrologer', art: 'scholar',
    title: { en: 'The Stars Have Spoken', de: 'Die Sterne haben gesprochen' },
    text: {
      en: 'The court astrologer has cast the nativity of {ruler} against the coming conjunction of Saturn and Jupiter. He announces great danger in the months ahead, unless the ruler avoids water, travel and the advice of red-haired men.',
      de: 'Der Hofastrologe hat das Horoskop von {ruler} gegen die kommende Konjunktion von Saturn und Jupiter gestellt. Er verkündet große Gefahr in den kommenden Monaten, es sei denn, der Herrscher meide Wasser, Reisen und den Rat rothaariger Männer.',
    },
    mtth: 300, cooldown: 25, maxYear: 1700,
    trigger: (e) => settled(e) && monarchy(e),
    options: [
      { label: { en: 'Heed the stars', de: 'Den Sternen folgen' }, effect: (e) => { e.fx.authority(-8); e.fx.rulerHealth(0.05); e.fx.modifier('heed_stars', 1, { en: 'Heeding the stars', de: 'Den Sternen folgend' }, { concord: 2 }); }, ai: 0.5 },
      { label: { en: 'Reward him and ignore him', de: 'Ihn belohnen und nicht beachten' }, effect: (e) => { e.fx.gold(-0.3); e.fx.prestige(1); }, ai: 0.6 },
      { label: { en: 'Dismiss the charlatan', de: 'Den Scharlatan entlassen' }, effect: (e) => { e.fx.value(2, 3); e.fx.estate('prelates', 2); e.fx.insight(1); }, ai: 0.4 },
    ],
  },
  {
    id: 'ruler_illness', art: 'court',
    title: { en: 'The Physicians Disagree', de: 'Die Ärzte sind uneins' },
    text: {
      en: '{ruler} has been feverish for a week. The Galenist physicians want to bleed and purge; a Jewish doctor from the town recommends rest, broth and fresh air; the confessor recommends the last rites, just in case.',
      de: '{ruler} fiebert seit einer Woche. Die galenischen Ärzte wollen zur Ader lassen und abführen; ein jüdischer Arzt aus der Stadt empfiehlt Ruhe, Brühe und frische Luft; der Beichtvater empfiehlt sicherheitshalber die Sterbesakramente.',
    },
    mtth: 240, cooldown: 12,
    trigger: (e) => rulerAge(e) > 45 && settled(e) && christian(e),
    options: [
      { label: { en: 'Bleed and purge', de: 'Aderlass und Abführen' }, effect: (e) => { e.fx.rulerHealth(-0.1); e.fx.estate('prelates', 1); e.fx.gold(-0.2); }, ai: 0.4 },
      { label: { en: 'Rest and broth', de: 'Ruhe und Brühe' }, effect: (e) => { e.fx.rulerHealth(0.1); e.fx.authority(-5); }, ai: 0.7 },
      { label: { en: 'Govern from the sickbed', de: 'Vom Krankenbett aus regieren' }, effect: (e) => { e.fx.rulerHealth(-0.15); e.fx.mandate(4); e.fx.authority(5); }, ai: 0.3 },
    ],
  },
  {
    id: 'corrupt_chancellor', art: 'court',
    title: { en: 'The Chancellor’s Accounts', de: 'Die Rechnungen des Kanzlers' },
    text: {
      en: 'Auditors have found that the chancellor of {nation} has farmed out crown tolls to his own kinsmen and pocketed the difference for years. He is clever, indispensable and has the goodwill of half the council.',
      de: 'Rechnungsprüfer haben festgestellt, dass der Kanzler von {nation} jahrelang Kronzölle an seine eigenen Verwandten verpachtet und die Differenz eingesteckt hat. Er ist klug, unentbehrlich und genießt das Wohlwollen des halben Rates.',
    },
    mtth: 120, cooldown: 20,
    trigger: (e) => settled(e) && e.n.corruption > 0.08,
    options: [
      { label: { en: 'Arrest him and seize his estates', de: 'Ihn verhaften und seine Güter einziehen' }, effect: (e) => { e.fx.gold(2); e.fx.corruption(-0.05); e.fx.estate('magnates', -5); e.fx.authority(5); }, ai: 0.6 },
      { label: { en: 'Make him repay quietly', de: 'Ihn still zurückzahlen lassen' }, effect: (e) => { e.fx.gold(1); e.fx.corruption(-0.02); }, ai: 0.6 },
      { label: { en: 'He is too useful to lose', de: 'Er ist zu nützlich, um ihn zu verlieren' }, effect: (e) => { e.fx.corruption(0.03); e.fx.authority(5); e.fx.estate('burghers', -4); }, ai: 0.2 },
    ],
  },
  {
    id: 'sumptuary_law', art: 'trade',
    title: { en: 'Silk on the Backs of Shopkeepers', de: 'Seide auf dem Rücken der Krämer' },
    text: {
      en: 'The lords of {nation} complain that the wives of mere merchants now wear sable, cloth of gold and pointed shoes as long as a knight’s. They ask {ruler} to fix by law what each rank may wear.',
      de: 'Die Herren von {nation} klagen, dass die Frauen einfacher Kaufleute nun Zobel, Goldbrokat und Schnabelschuhe so lang wie die eines Ritters tragen. Sie bitten {ruler}, gesetzlich festzulegen, was jeder Stand tragen darf.',
    },
    mtth: 300, cooldown: 40, maxYear: 1700,
    trigger: (e) => settled(e) && monarchy(e) && est(e, 'burghers').influence > 15,
    options: [
      { label: { en: 'Issue a sumptuary ordinance', de: 'Eine Kleiderordnung erlassen' }, effect: (e) => { e.fx.estate('magnates', 6); e.fx.estate('burghers', -6); e.fx.authority(3); e.fx.modifier('sumptuary', 15, { en: 'Sumptuary ordinance', de: 'Kleiderordnung' }, { trade: -0.02 }); }, ai: 0.5 },
      { label: { en: 'Tax luxury instead', de: 'Stattdessen den Luxus besteuern' }, effect: (e) => { e.fx.gold(1.5); e.fx.estate('burghers', -3); e.fx.estate('magnates', 2); }, ai: 0.6 },
      { label: { en: 'Let them wear what they can pay for', de: 'Sie tragen lassen, was sie bezahlen können' }, effect: (e) => { e.fx.estate('burghers', 5); e.fx.estate('magnates', -5); e.fx.value(6, 3); }, ai: 0.3 },
    ],
  },
  {
    id: 'chronicle_of_reign', art: 'scholar',
    title: { en: 'A Chronicle of the Reign', de: 'Eine Chronik der Regierung' },
    text: {
      en: 'A monk-chronicler asks {ruler} for access to the chancery rolls so that he may write the deeds of the reign for posterity. He is honest, which is both his merit and his danger.',
      de: 'Ein Mönchschronist bittet {ruler} um Zugang zu den Kanzleirollen, um die Taten der Regierung für die Nachwelt aufzuschreiben. Er ist ehrlich, und das ist zugleich sein Verdienst und seine Gefahr.',
    },
    mtth: 400, cooldown: 40,
    trigger: (e) => settled(e) && monarchy(e) && rulerAge(e) > 30,
    options: [
      { label: { en: 'Open the archives to him', de: 'Ihm die Archive öffnen' }, effect: (e) => { e.fx.insight(3); e.fx.prestige(e.n.prestige > 0 ? 4 : -2); e.fx.estate('prelates', 2); }, ai: 0.6 },
      { label: { en: 'Hire a court poet to write it instead', de: 'Stattdessen einen Hofdichter damit beauftragen' }, effect: (e) => { e.fx.gold(-0.5); e.fx.mandate(5); }, ai: 0.5 },
    ],
  },
  {
    id: 'hunting_accident', art: 'court',
    title: { en: 'Thrown at the Hunt', de: 'Sturz bei der Jagd' },
    text: {
      en: 'During a boar hunt in the royal forest, the horse of {ruler} stumbled on a root and threw its rider into a ditch. The huntsmen carried {ruler} back on a litter of spears.',
      de: 'Bei einer Wildschweinjagd im königlichen Forst strauchelte das Pferd von {ruler} über eine Wurzel und warf seinen Reiter in einen Graben. Die Jäger trugen {ruler_acc} auf einer Trage aus Spießen zurück.',
    },
    mtth: 400, cooldown: 20,
    trigger: (e) => settled(e) && monarchy(e) && rulerAge(e) > 16 && rulerAge(e) < 65,
    options: [
      { label: { en: 'Make light of it in public', de: 'Es in der Öffentlichkeit herunterspielen' }, effect: (e) => { e.fx.rulerHealth(-0.15); e.fx.mandate(3); }, ai: 0.6 },
      { label: { en: 'Rest until fully healed', de: 'Ruhen, bis alles verheilt ist' }, effect: (e) => { e.fx.rulerHealth(-0.05); e.fx.authority(-10); }, ai: 0.5 },
      { label: { en: 'Hang the forester who failed to clear the path', de: 'Den Förster hängen, der den Weg nicht freigeräumt hat' }, effect: (e) => { e.fx.rulerHealth(-0.1); e.fx.estate('commons', -3); e.fx.authority(3); }, ai: 0.1 },
    ],
  },
  {
    id: 'bastard_claim', art: 'court',
    title: { en: 'The Bastard’s Petition', de: 'Die Bitte des Bastards' },
    text: {
      en: 'A young man with the dynasty’s nose and chin has arrived at court with a letter in the hand of the late father of {ruler}. He asks for recognition, a title and a place in the order of succession.',
      de: 'Ein junger Mann mit der Nase und dem Kinn der Dynastie ist mit einem Brief von der Hand des verstorbenen Vaters von {ruler} am Hof erschienen. Er bittet um Anerkennung, einen Titel und einen Platz in der Thronfolge.',
    },
    mtth: 400, cooldown: 40,
    trigger: (e) => monarchy(e) && rulerAge(e) > 18,
    options: [
      { label: { en: 'Recognise him and give him a command', de: 'Ihn anerkennen und ihm ein Kommando geben' }, effect: (e) => { e.fx.manpower(0.02); e.fx.mandate(-4); e.fx.estate('magnates', 3); e.fx.prestige(1); }, ai: 0.5 },
      { label: { en: 'A pension and a quiet life in a cloister', de: 'Eine Rente und ein stilles Leben im Kloster' }, effect: (e) => { e.fx.gold(-0.5); e.fx.estate('prelates', 2); }, ai: 0.6 },
      { label: { en: 'Deny him and expel him', de: 'Ihn verleugnen und ausweisen' }, effect: (e) => { e.fx.mandate(2); e.fx.modifier('pretender_abroad', 10, { en: 'A pretender abroad', de: 'Ein Thronanwärter im Ausland' }, { concord: -3 }); }, ai: 0.3 },
    ],
  },
  {
    id: 'envoy_insult', art: 'court',
    title: { en: 'An Insolent Envoy', de: 'Ein unverschämter Gesandter' },
    text: {
      en: 'At a banquet the envoy of {other} refused to yield precedence to our nobles, and when pressed, remarked loudly that {nation} had more sheep than knights. The court waits to see how {ruler} will answer.',
      de: 'Bei einem Bankett weigerte sich der Gesandte von {other}, unseren Edelleuten den Vortritt zu lassen, und bemerkte, als man ihn bedrängte, laut, {nation} habe mehr Schafe als Ritter. Der Hof wartet ab, wie {ruler} antworten wird.',
    },
    mtth: 300, cooldown: 20,
    trigger: (e) => settled(e) && H.neighbourNations(e).length > 0,
    setup: (e) => { e.ctx.other = H.pickNeighbour(e); return e.ctx.other >= 0; },
    options: [
      { label: { en: 'Expel the envoy', de: 'Den Gesandten ausweisen' }, effect: (e) => { e.fx.prestige(3); e.fx.myOpinion(e.ctx.other, -15); e.fx.opinion(e.ctx.other, -15); e.fx.estate('magnates', 3); }, ai: 0.5 },
      { label: { en: 'Answer with wit and a gift of fine wool', de: 'Mit Witz und einem Geschenk feiner Wolle antworten' }, effect: (e) => { e.fx.gold(-0.3); e.fx.opinion(e.ctx.other, 10); e.fx.prestige(1); }, ai: 0.6 },
      { label: { en: 'Ignore it', de: 'Es übergehen' }, effect: (e) => { e.fx.prestige(-2); e.fx.authority(3); }, ai: 0.3 },
    ],
  },
  {
    id: 'grand_palace', art: 'court', major: true,
    title: { en: 'A Palace Worthy of the Crown', de: 'Ein Palast, der Krone würdig' },
    text: {
      en: 'The architects of {ruler} have drawn plans for a new residence outside {loc}: a palace with a thousand windows, gardens to the horizon and apartments for every great family of {nation}, who would be expected to live at court under the ruler’s eye.',
      de: 'Die Baumeister von {ruler} haben Pläne für eine neue Residenz vor {loc} gezeichnet: einen Palast mit tausend Fenstern, Gärten bis zum Horizont und Wohnungen für jede große Familie von {nation}, von der man erwartet, unter den Augen des Herrschers bei Hofe zu leben.',
    },
    mtth: 120, oncePer: true, minYear: 1620,
    trigger: (e) => monarchy(e) && eraAtLeast(e, 2) && rich(e, 12) && e.n.authority > 80,
    setup: (e) => { e.ctx.loc = e.n.capital; return true; },
    options: [
      { label: { en: 'Build it, whatever it costs', de: 'Ihn bauen, koste es, was es wolle' }, effect: (e) => { e.fx.gold(-10); e.fx.prestige(15); e.fx.authority(20); e.fx.estate('magnates', -5, -8); e.fx.dev(e.ctx.loc, 1); e.fx.modifier('court_palace', 50, { en: 'The great palace', de: 'Der große Palast' }, { authority_gain: 0.1, mandate: 4 }); }, ai: 0.6 },
      { label: { en: 'A smaller hunting lodge', de: 'Ein kleineres Jagdschloss' }, effect: (e) => { e.fx.gold(-3); e.fx.prestige(4); e.fx.estate('magnates', 3); }, ai: 0.5 },
    ],
  },
  {
    id: 'philosopher_at_court', art: 'scholar',
    title: { en: 'A Philosopher at Court', de: 'Ein Philosoph bei Hofe' },
    text: {
      en: 'A celebrated writer, banned at home for his satires on priests and ministers, offers to come to {loc} and correspond with {ruler} on government, toleration and the sciences. His presence would make the court famous; his pen spares no one.',
      de: 'Ein gefeierter Schriftsteller, der daheim wegen seiner Satiren auf Priester und Minister verboten ist, bietet an, nach {loc} zu kommen und mit {ruler} über Regierung, Toleranz und die Wissenschaften zu korrespondieren. Seine Anwesenheit würde den Hof berühmt machen; seine Feder verschont niemanden.',
    },
    mtth: 120, oncePer: true, minYear: 1720,
    trigger: (e) => settled(e) && monarchy(e) && eraAtLeast(e, 2),
    setup: (e) => { e.ctx.loc = e.n.capital; return true; },
    options: [
      { label: { en: 'Invite him and grant him a pension', de: 'Ihn einladen und ihm eine Pension gewähren' }, effect: (e) => { e.fx.gold(-1); e.fx.prestige(6); e.fx.insight(8); e.fx.estate('prelates', -6); e.fx.value(2, 6); }, ai: 0.6 },
      { label: { en: 'Correspond with him, but from afar', de: 'Mit ihm korrespondieren, aber aus der Ferne' }, effect: (e) => { e.fx.insight(3); e.fx.prestige(2); }, ai: 0.6 },
      { label: { en: 'Ban his books here too', de: 'Seine Bücher auch hier verbieten' }, effect: (e) => { e.fx.estate('prelates', 6); e.fx.value(2, -4); e.fx.authority(3); }, ai: 0.2 },
    ],
  },
  {
    id: 'consort_patronage', art: 'wedding',
    title: { en: 'The Consort’s Household', de: 'Der Hofstaat der Gemahlin' },
    text: {
      en: 'The consort of {ruler} has gathered a household of learned ladies, musicians and confessors, and wishes to endow a college at {loc} in her own name. The treasurer grumbles at the cost of her court.',
      de: 'Die Gemahlin von {ruler} hat einen Hofstaat aus gelehrten Damen, Musikern und Beichtvätern um sich versammelt und möchte in {loc} in eigenem Namen ein Kolleg stiften. Der Schatzmeister murrt über die Kosten ihres Hofes.',
    },
    mtth: 200, cooldown: 25, minYear: 1380,
    trigger: (e) => christian(e) && monarchy(e) && !!e.n.consort && !!e.s.chars[e.n.consort]?.alive && !!e.s.chars[e.n.consort]?.female && rich(e, 3),
    setup: (e) => { e.ctx.loc = bigTown(e); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Support her foundation', de: 'Ihre Stiftung unterstützen' }, effect: (e) => { e.fx.gold(-2); e.fx.insight(4); e.fx.building(e.ctx.loc, BI.church, 1); e.fx.prestige(3); }, ai: 0.6 },
      { label: { en: 'Trim her household', de: 'Ihren Hofstaat beschneiden' }, effect: (e) => { e.fx.gold(0.5); e.fx.mandate(-2); e.fx.estate('prelates', -2); }, ai: 0.4 },
    ],
  },
  {
    id: 'court_fool', art: 'court',
    title: { en: 'The Fool Speaks Plainly', de: 'Der Narr spricht offen' },
    text: {
      en: 'Before the whole court the jester of {ruler} sang a ditty about a lion who taxed the sheep until they had no wool, then wondered why he was cold. Some laughed; the treasurer did not.',
      de: 'Vor dem ganzen Hof sang der Narr von {ruler} ein Liedchen von einem Löwen, der die Schafe besteuerte, bis sie keine Wolle mehr hatten, und sich dann wunderte, warum ihn fror. Manche lachten; der Schatzmeister nicht.',
    },
    mtth: 300, cooldown: 30, maxYear: 1700,
    trigger: (e) => monarchy(e) && settled(e) && H.avgUnrest(e) > 3,
    options: [
      { label: { en: 'Laugh, and lighten the hearth tax', de: 'Lachen und die Herdsteuer senken' }, effect: (e) => { e.fx.estate('commons', 6); e.fx.gold(-1); e.fx.unrestAll(-2); }, ai: 0.5 },
      { label: { en: 'Laugh, and change nothing', de: 'Lachen und nichts ändern' }, effect: (e) => { e.fx.mandate(1); e.fx.prestige(1); }, ai: 0.6 },
      { label: { en: 'Have him whipped', de: 'Ihn auspeitschen lassen' }, effect: (e) => { e.fx.authority(3); e.fx.prestige(-2); e.fx.estate('commons', -2); }, ai: 0.1 },
    ],
  },
];

