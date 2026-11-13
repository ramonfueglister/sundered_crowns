// World-unique historical moments. Each one fires only for the realm it belongs to, and only while the
// situation that made it possible still holds (the realms involved are alive, own the places named, etc.).
import type { EventDef, EvApi } from '../../systems/events';
import { H } from '../../systems/events';
import { isKey, owns, ownerOf, locByName, nationByKey, latin, protestant, monarchy, republic, settled, est, eraAtLeast, atWar, inc } from './util';

const alive = (e: EvApi, key: string) => !!nationByKey(e, key);
const idOf = (e: EvApi, key: string) => nationByKey(e, key)?.id ?? -1;
const neighbourKey = (e: EvApi, key: string) => H.neighbourNations(e).some((o) => e.s.nations[o].key === key);
const pope = (e: EvApi) => (e.s.papacy.holder >= 0 && e.s.nations[e.s.papacy.holder]?.alive ? e.s.papacy.holder : -1);

export const HISTORICAL_EVENTS: EventDef[] = [
  {
    id: 'jacquerie', art: 'revolt', major: true, once: true, minYear: 1358, maxYear: 1360,
    title: { en: 'The Jacquerie', de: 'Die Jacquerie' },
    text: {
      en: 'With the king a prisoner in England and the countryside stripped by soldiers and lords alike, the peasants of the Beauvaisis have risen. "Jacques Bonhomme", the nobles call them with contempt; now the Jacques burn castles and kill their lords. In Paris, the merchant provost Étienne Marcel is said to be in league with them.',
      de: 'Während der König in England gefangen ist und Söldner wie Herren das Land ausplündern, haben sich die Bauern des Beauvaisis erhoben. „Jacques Bonhomme“ nennen die Adligen sie verächtlich; nun brennen die Jacques Burgen nieder und erschlagen ihre Herren. In Paris soll der Kaufmannsvorsteher Étienne Marcel mit ihnen im Bunde stehen.',
    },
    mtth: 4,
    trigger: (e) => isKey(e, 'france') && owns(e, 'Paris'),
    setup: (e) => { e.ctx.loc = locByName(e.w, 'Paris'); return true; },
    options: [
      { label: { en: 'Let the nobles take their vengeance', de: 'Den Adel seine Rache nehmen lassen' }, effect: (e) => { e.fx.unrestAll(-5); e.fx.estate('magnates', 10); e.fx.estate('commons', -15); e.fx.estate('burghers', -6); e.fx.pop(e.ctx.loc, -0.02); e.fx.authority(5); }, ai: 0.7 },
      { label: { en: 'Proclaim a royal pardon for those who disperse', de: 'Allen, die heimkehren, königliche Gnade verkünden' }, effect: (e) => { e.fx.unrestAll(-3); e.fx.estate('commons', 6); e.fx.estate('magnates', -8); e.fx.mandate(4); }, ai: 0.4 },
    ],
  },
  {
    id: 'bretigny', art: 'court', major: true, once: true, minYear: 1360, maxYear: 1362,
    title: { en: 'The Peace of Brétigny', de: 'Der Friede von Brétigny' },
    text: {
      en: 'At Brétigny near Chartres the envoys of {nation} and {other} have agreed terms: King John of France is to be ransomed for three million gold crowns; Aquitaine, Ponthieu and Calais pass to the English crown in full sovereignty; in return the English king renounces his claim to the throne of France.',
      de: 'In Brétigny bei Chartres haben sich die Gesandten von {nation} und {other} geeinigt: König Johann von Frankreich wird für drei Millionen Goldkronen ausgelöst; Aquitanien, Ponthieu und Calais gehen in voller Souveränität an die englische Krone; dafür verzichtet der englische König auf seinen Anspruch auf den Thron Frankreichs.',
    },
    mtth: 3,
    trigger: (e) => isKey(e, 'england') && alive(e, 'france') && (owns(e, 'Calais') || owns(e, 'Bordeaux')),
    setup: (e) => { e.ctx.other = idOf(e, 'france'); return e.ctx.other >= 0; },
    options: [
      { label: { en: 'Seal the treaty and take the ransom', de: 'Den Vertrag besiegeln und das Lösegeld nehmen' }, effect: (e) => { e.fx.gold(6); e.fx.prestige(8); e.fx.warExhaustion(-10); e.fx.opinion(e.ctx.other, 15); e.fx.flag('bretigny'); }, ai: 0.8 },
      { label: { en: 'Never renounce the crown of France', de: 'Niemals auf die Krone Frankreichs verzichten' }, effect: (e) => { e.fx.prestige(4); e.fx.estate('magnates', 6); e.fx.warExhaustion(5); e.fx.opinion(e.ctx.other, -15); e.fx.myOpinion(e.ctx.other, -20, 10); }, ai: 0.2 },
    ],
  },
  {
    id: 'kings_ransom', art: 'court', major: true, once: true, minYear: 1360, maxYear: 1364,
    title: { en: 'The King’s Ransom', de: 'Das Lösegeld des Königs' },
    text: {
      en: 'Three million gold crowns are owed to the English for the return of the king. The estates of {nation} are summoned to grant new taxes: a hearth tax on every household, a tax on salt, a levy on the sale of wine. A new gold coin, the franc, is to be struck to mark the king’s freedom.',
      de: 'Drei Millionen Goldkronen schuldet man den Engländern für die Rückkehr des Königs. Die Stände von {nation} werden einberufen, um neue Steuern zu bewilligen: eine Herdsteuer auf jeden Haushalt, eine Salzsteuer, eine Abgabe auf den Weinverkauf. Eine neue Goldmünze, der Franc, soll zum Zeichen der Freiheit des Königs geprägt werden.',
    },
    mtth: 3,
    trigger: (e) => isKey(e, 'france') && alive(e, 'england'),
    setup: (e) => { e.ctx.other = idOf(e, 'england'); return e.ctx.other >= 0; },
    options: [
      { label: { en: 'Grant the taxes and pay', de: 'Die Steuern bewilligen und zahlen' }, effect: (e) => { e.fx.gold(-4); e.fx.estate('commons', -8); e.fx.mandate(8); e.fx.modifier('ransom_taxes', 10, { en: 'Ransom taxes', de: 'Lösegeldsteuern' }, { tax: 0.05, unrest: 2 }); }, ai: 0.7 },
      { label: { en: 'Pay slowly and rebuild the army', de: 'Langsam zahlen und das Heer neu aufbauen' }, effect: (e) => { e.fx.gold(-1.5); e.fx.opinion(e.ctx.other, -10); e.fx.manpower(0.1); e.fx.mandate(-4); }, ai: 0.4 },
    ],
  },
  {
    id: 'great_troubles', art: 'revolt', major: true, once: true, minYear: 1359, maxYear: 1370,
    title: { en: 'The Great Troubles', de: 'Die Große Unruhe' },
    text: {
      en: 'Since the murder of Khan Berdibeg the throne of Sarai has passed through a dozen hands in as many years. Emirs raise their own khans; the beklerbeg Mamai rules the western steppe in the name of puppets; the Russian princes watch and wait.',
      de: 'Seit der Ermordung Khan Berdibegs ist der Thron von Sarai in ebenso vielen Jahren durch ein Dutzend Hände gegangen. Emire erheben eigene Khane; der Beklerbeg Mamai beherrscht die westliche Steppe im Namen von Marionetten; die russischen Fürsten beobachten und warten.',
    },
    mtth: 12,
    trigger: (e) => isKey(e, 'golden_horde'),
    options: [
      { label: { en: 'Buy the emirs’ loyalty', de: 'Die Treue der Emire erkaufen' }, effect: (e) => { e.fx.gold(-3); e.fx.concord(-5); e.fx.estate('magnates', 10); }, ai: 0.5 },
      { label: { en: 'Strike down the rival khans', de: 'Die rivalisierenden Khane niederwerfen' }, effect: (e) => { e.fx.manpower(-0.1); e.fx.concord(-10); e.fx.authority(15); e.fx.estate('magnates', -8); }, ai: 0.5 },
    ],
  },
  {
    id: 'janissary_corps', art: 'battle', once: true, minYear: 1360, maxYear: 1400,
    title: { en: 'The New Soldiers', de: 'Die neuen Soldaten' },
    text: {
      en: 'The vizier proposes that one in five of the captives taken in war belong to the sultan, and that the boys among them be raised in the faith as the sultan’s own slaves: an infantry owing loyalty to no emir and no tribe, only to the throne. They are to be called the "new soldiers", yeni çeri.',
      de: 'Der Wesir schlägt vor, dass jeder fünfte Kriegsgefangene dem Sultan gehöre und die Knaben unter ihnen im Glauben als Sklaven des Sultans erzogen werden: ein Fußvolk, das keinem Emir und keinem Stamm verpflichtet ist, nur dem Thron. Man soll sie die „neuen Soldaten“ nennen, yeni çeri.',
    },
    mtth: 24,
    trigger: (e) => isKey(e, 'ottoman'),
    options: [
      { label: { en: 'Found the corps', de: 'Das Korps gründen' }, effect: (e) => { e.fx.gold(-2); e.fx.authority(15); e.fx.estate('magnates', -6); e.fx.modifier('janissaries', 200, { en: 'Janissary corps', de: 'Janitscharenkorps' }, { discipline: 0.08, morale: 0.05 }); }, ai: 0.9 },
      { label: { en: 'The beys’ horsemen are enough', de: 'Die Reiter der Beys genügen' }, effect: (e) => { e.fx.estate('magnates', 6); e.fx.manpower(0.05); }, ai: 0.1 },
    ],
  },
  {
    id: 'avignon_return', art: 'church', major: true, once: true, minYear: 1367, maxYear: 1377,
    title: { en: 'The Pope Returns to Rome', de: 'Der Papst kehrt nach Rom zurück' },
    text: {
      en: 'For seventy years the popes have lived at Avignon in the shadow of the French crown. Now a Sienese dyer’s daughter, Catherine, writes to the pope in burning words: return to Rome, to the tombs of the apostles, or answer for it before God. The French cardinals weep and refuse to follow.',
      de: 'Seit siebzig Jahren residieren die Päpste in Avignon im Schatten der französischen Krone. Nun schreibt eine Färberstochter aus Siena, Katharina, dem Papst mit glühenden Worten: Kehre nach Rom zurück, zu den Gräbern der Apostel, oder verantworte dich vor Gott. Die französischen Kardinäle weinen und weigern sich zu folgen.',
    },
    mtth: 24,
    trigger: (e) => e.n.id === pope(e) && e.s.papacy.seat === locByName(e.w, 'Avignon'),
    options: [
      { label: { en: 'Return to Rome', de: 'Nach Rom zurückkehren' }, effect: (e) => { const r = locByName(e.w, 'Rome'); if (r >= 0) e.s.papacy.seat = r; e.fx.prestige(10); e.fx.mandate(6); e.fx.estate('prelates', -4); const f = idOf(e, 'france'); if (f >= 0) e.fx.opinion(f, -15); }, ai: 0.8 },
      { label: { en: 'Stay at Avignon', de: 'In Avignon bleiben' }, effect: (e) => { e.fx.prestige(-5); e.fx.estate('prelates', 4); const f = idOf(e, 'france'); if (f >= 0) e.fx.opinion(f, 10); }, ai: 0.2 },
    ],
  },
  {
    id: 'ciompi', art: 'revolt', major: true, once: true, minYear: 1378, maxYear: 1380,
    title: { en: 'The Revolt of the Ciompi', de: 'Der Aufstand der Ciompi' },
    text: {
      en: 'The wool carders of Florence, the ciompi, who work for the great Arte della Lana but may join no guild, have stormed the Palazzo della Signoria. A carder named Michele di Lando sits in the seat of the Gonfaloniere, barefoot, with the banner of justice in his hand.',
      de: 'Die Wollkämmer von Florenz, die Ciompi, die für die große Arte della Lana arbeiten, aber keiner Zunft angehören dürfen, haben den Palazzo della Signoria gestürmt. Ein Wollkämmer namens Michele di Lando sitzt barfuß auf dem Stuhl des Gonfaloniere, das Banner der Gerechtigkeit in der Hand.',
    },
    mtth: 4,
    trigger: (e) => owns(e, 'Florence'),
    setup: (e) => { e.ctx.loc = locByName(e.w, 'Florence'); return true; },
    options: [
      { label: { en: 'Recognise the new guilds', de: 'Die neuen Zünfte anerkennen' }, effect: (e) => { e.fx.estate('commons', 12, 4); e.fx.estate('burghers', -10); e.fx.unrest(e.ctx.loc, -10); e.fx.concord(-4); }, ai: 0.4 },
      { label: { en: 'The great guilds close the city and starve them out', de: 'Die großen Zünfte sperren die Werkstätten und hungern sie aus' }, effect: (e) => { e.fx.estate('burghers', 10); e.fx.estate('commons', -12); e.fx.unrest(e.ctx.loc, 6); e.fx.dev(e.ctx.loc, -0.5); }, ai: 0.6 },
    ],
  },
  {
    id: 'kulikovo', art: 'battle', major: true, once: true, minYear: 1378, maxYear: 1385,
    title: { en: 'The Field of Snipes', de: 'Das Schnepfenfeld' },
    text: {
      en: 'The beklerbeg Mamai is marching on Moscow with Tatars, Genoese infantry from Caffa and the promise of Lithuanian help. The abbot Sergius of the Trinity monastery has blessed {ruler} and sent two monks to ride with the army. The princes of the Rus wait to see whether Moscow will dare to stand on the Don.',
      de: 'Der Beklerbeg Mamai marschiert mit Tataren, genuesischem Fußvolk aus Kaffa und dem Versprechen litauischer Hilfe auf Moskau. Abt Sergius vom Dreifaltigkeitskloster hat {ruler_acc} gesegnet und zwei Mönche mit dem Heer reiten lassen. Die Fürsten der Rus warten ab, ob Moskau es wagt, am Don standzuhalten.',
    },
    mtth: 12,
    trigger: (e) => isKey(e, 'moscow') && alive(e, 'golden_horde') && owns(e, 'Moscow'),
    setup: (e) => { e.ctx.other = idOf(e, 'golden_horde'); return e.ctx.other >= 0; },
    options: [
      { label: { en: 'Cross the Don and give battle', de: 'Den Don überschreiten und die Schlacht wagen' }, effect: (e) => { e.fx.manpower(-0.2); e.fx.prestige(15); e.fx.mandate(10); e.fx.estate('prelates', 8); e.fx.myOpinion(e.ctx.other, -30, 20); e.fx.modifier('kulikovo', 30, { en: 'Victor of the Don', de: 'Sieger am Don' }, { morale: 0.05, mandate: 5 }); }, ai: 0.8 },
      { label: { en: 'Pay the tribute once more', de: 'Noch einmal den Tribut zahlen' }, effect: (e) => { e.fx.gold(-3); e.fx.prestige(-5); e.fx.opinion(e.ctx.other, 15); }, ai: 0.2 },
    ],
  },
  {
    id: 'english_rising', art: 'revolt', major: true, once: true, minYear: 1381, maxYear: 1383,
    title: { en: 'The Great Rising', de: 'Der große Aufstand' },
    text: {
      en: 'A third poll tax in four years was the last straw. The commons of Kent and Essex have marched on London under Wat Tyler, opened the prisons, burned the Savoy palace and beheaded the archbishop. The hedge priest John Ball preaches to them: "When Adam delved and Eve span, who was then the gentleman?" They ask the young king for the end of bondage.',
      de: 'Eine dritte Kopfsteuer in vier Jahren war zu viel. Die Gemeinen von Kent und Essex sind unter Wat Tyler auf London marschiert, haben die Gefängnisse geöffnet, den Savoy-Palast niedergebrannt und den Erzbischof enthauptet. Der Heckenprediger John Ball predigt ihnen: „Als Adam grub und Eva spann, wo war denn da der Edelmann?“ Sie verlangen vom jungen König das Ende der Leibeigenschaft.',
    },
    mtth: 4,
    trigger: (e) => isKey(e, 'england') && owns(e, 'London'),
    setup: (e) => { e.ctx.loc = locByName(e.w, 'London'); return true; },
    options: [
      { label: { en: 'Promise them charters of freedom, then revoke them', de: 'Ihnen Freibriefe versprechen und sie dann widerrufen' }, effect: (e) => { e.fx.unrest(e.ctx.loc, -10); e.fx.estate('magnates', 8); e.fx.estate('commons', -10); e.fx.mandate(-3); e.fx.authority(10); }, ai: 0.6 },
      { label: { en: 'Abolish the poll tax and keep the charters', de: 'Die Kopfsteuer abschaffen und die Freibriefe halten' }, effect: (e) => { e.fx.unrestAll(-6); e.fx.estate('commons', 15); e.fx.estate('magnates', -12); e.fx.value(1, -10); e.fx.gold(-2); }, ai: 0.4 },
    ],
  },
  {
    id: 'krewo_lithuania', art: 'wedding', major: true, once: true, minYear: 1384, maxYear: 1388,
    title: { en: 'A Crown for Baptism', de: 'Eine Krone für die Taufe' },
    text: {
      en: 'The lords of Poland offer the Grand Duke the hand of their young queen Jadwiga and the crown of Poland, if he and all his pagan people accept Latin baptism, bind Lithuania to the Polish crown for ever, and recover the lands Poland has lost. The meeting at Krėva will decide the fate of the east.',
      de: 'Die Herren Polens bieten dem Großfürsten die Hand ihrer jungen Königin Hedwig und die Krone Polens an, wenn er und sein ganzes heidnisches Volk die lateinische Taufe annehmen, Litauen für immer an die polnische Krone binden und die verlorenen Länder Polens zurückgewinnen. Das Treffen in Krėva wird über das Schicksal des Ostens entscheiden.',
    },
    mtth: 6,
    trigger: (e) => isKey(e, 'lithuania') && e.n.faith === H.faith('baltic_old') && alive(e, 'poland'),
    setup: (e) => { e.ctx.other = idOf(e, 'poland'); return e.ctx.other >= 0; },
    options: [
      { label: { en: 'Accept baptism and the crown', de: 'Taufe und Krone annehmen' }, effect: (e) => { e.fx.convertRealm(H.faith('latin')); e.fx.faithAt(e.n.capital, H.faith('latin')); e.fx.opinion(e.ctx.other, 40, 30); e.fx.myOpinion(e.ctx.other, 30, 30); e.fx.prestige(15); e.fx.estate('prelates', 10, 10); e.fx.concord(-8); e.fx.flag('union_krewo'); const t = idOf(e, 'teutonic_order'); if (t >= 0) e.fx.opinion(t, -20); }, ai: 0.85 },
      { label: { en: 'Turn instead to Moscow and the Orthodox', de: 'Sich stattdessen Moskau und den Orthodoxen zuwenden' }, effect: (e) => { e.fx.convertRealm(H.faith('orthodox')); e.fx.faithAt(e.n.capital, H.faith('orthodox')); e.fx.opinion(e.ctx.other, -15); e.fx.concord(-5); const m = idOf(e, 'moscow'); if (m >= 0) e.fx.opinion(m, 20); }, ai: 0.1 },
      { label: { en: 'Keep the old gods', de: 'Bei den alten Göttern bleiben' }, effect: (e) => { e.fx.concord(5); e.fx.estate('magnates', 6); e.fx.opinion(e.ctx.other, -20); }, ai: 0.1 },
    ],
  },
  {
    id: 'krewo_poland', art: 'wedding', once: true, minYear: 1384, maxYear: 1388,
    title: { en: 'The Queen’s Marriage', de: 'Die Heirat der Königin' },
    text: {
      en: 'The lords of Little Poland favour the pagan Grand Duke of Lithuania as husband for the young queen: his baptism would bring a whole people to the Church and his armies would turn against the Teutonic Order. The queen herself is betrothed to an Austrian duke and is said to weep.',
      de: 'Die Herren Kleinpolens wollen den heidnischen Großfürsten von Litauen als Gemahl der jungen Königin: Seine Taufe brächte ein ganzes Volk zur Kirche, und seine Heere würden sich gegen den Deutschen Orden wenden. Die Königin selbst ist einem österreichischen Herzog versprochen und soll weinen.',
    },
    mtth: 6,
    trigger: (e) => isKey(e, 'poland') && alive(e, 'lithuania') && nationByKey(e, 'lithuania')!.faith === H.faith('baltic_old'),
    setup: (e) => { e.ctx.other = idOf(e, 'lithuania'); return e.ctx.other >= 0; },
    options: [
      { label: { en: 'Send envoys to Krėva', de: 'Gesandte nach Krėva schicken' }, effect: (e) => { e.fx.opinion(e.ctx.other, 30, 20); e.fx.myOpinion(e.ctx.other, 30, 20); e.fx.estate('magnates', 8); e.fx.prestige(5); const a = idOf(e, 'austria'); if (a >= 0) e.fx.opinion(a, -15); }, ai: 0.9 },
      { label: { en: 'Honour the Austrian betrothal', de: 'Das österreichische Verlöbnis ehren' }, effect: (e) => { const a = idOf(e, 'austria'); if (a >= 0) e.fx.opinion(a, 20); e.fx.estate('magnates', -8); e.fx.mandate(3); }, ai: 0.1 },
    ],
  },
  {
    id: 'kosovo', art: 'battle', major: true, once: true, minYear: 1386, maxYear: 1392,
    title: { en: 'The Field of Blackbirds', de: 'Das Amselfeld' },
    text: {
      en: 'Sultan Murad has crossed into Serbia with the whole Ottoman host. Prince Lazar has called on his kinsmen and on Tvrtko of Bosnia; the armies will meet on the Field of Blackbirds on Saint Vitus’ day. The songs already say that Lazar was offered an earthly kingdom or a heavenly one, and chose the heavenly.',
      de: 'Sultan Murad ist mit dem ganzen osmanischen Heer in Serbien eingefallen. Fürst Lazar hat seine Verwandten und Tvrtko von Bosnien zu Hilfe gerufen; die Heere werden am Veitstag auf dem Amselfeld aufeinandertreffen. Schon sagen die Lieder, Lazar sei ein irdisches oder ein himmlisches Reich angeboten worden, und er habe das himmlische gewählt.',
    },
    mtth: 12,
    trigger: (e) => isKey(e, 'serbia') && alive(e, 'ottoman') && (neighbourKey(e, 'ottoman') || ownerOf(e, 'Adrianople') === idOf(e, 'ottoman')),
    setup: (e) => { e.ctx.other = idOf(e, 'ottoman'); return e.ctx.other >= 0; },
    options: [
      { label: { en: 'Choose the heavenly kingdom: give battle', de: 'Das himmlische Reich wählen: die Schlacht annehmen' }, effect: (e) => { e.fx.manpower(-0.35); e.fx.prestige(15); e.fx.mandate(10); e.fx.estate('prelates', 10); e.fx.myOpinion(e.ctx.other, -30, 30); e.fx.modifier('kosovo_memory', 100, { en: 'Memory of Kosovo', de: 'Erinnerung an das Amselfeld' }, { morale: 0.05, concord: 3 }); }, ai: 0.8 },
      { label: { en: 'Choose the earthly kingdom: offer vassalage', de: 'Das irdische Reich wählen: Vasallität anbieten' }, effect: (e) => { e.fx.gold(-2); e.fx.prestige(-10); e.fx.opinion(e.ctx.other, 30); e.fx.estate('magnates', -6); }, ai: 0.2 },
    ],
  },
  {
    id: 'kalmar_union', art: 'coronation', major: true, once: true, minYear: 1395, maxYear: 1402,
    title: { en: 'The Union of Kalmar', de: 'Die Kalmarer Union' },
    text: {
      en: 'Queen Margaret, who rules Denmark and Norway and has driven the German king out of Sweden, has gathered the councils of the three kingdoms at Kalmar. Her great-nephew Eric of Pomerania is to be crowned king of all three. The Swedish lords want their own laws and their own castles guaranteed.',
      de: 'Königin Margarethe, die Dänemark und Norwegen regiert und den deutschen König aus Schweden vertrieben hat, hat die Räte der drei Reiche in Kalmar versammelt. Ihr Großneffe Erich von Pommern soll zum König aller drei gekrönt werden. Die schwedischen Herren wollen ihre eigenen Gesetze und Burgen verbürgt sehen.',
    },
    mtth: 6,
    trigger: (e) => isKey(e, 'denmark') && alive(e, 'norway') && alive(e, 'sweden'),
    setup: (e) => { e.ctx.other = idOf(e, 'sweden'); return e.ctx.other >= 0; },
    options: [
      { label: { en: 'Crown Eric and guarantee Swedish laws', de: 'Erich krönen und die schwedischen Gesetze verbürgen' }, effect: (e) => { e.fx.prestige(12); e.fx.opinion(e.ctx.other, 25, 25); const no = idOf(e, 'norway'); if (no >= 0) e.fx.opinion(no, 25, 25); e.fx.estate('magnates', -4); e.fx.flag('kalmar_union'); e.fx.modifier('kalmar_union', 60, { en: 'Union of Kalmar', de: 'Kalmarer Union' }, { mandate: 4, trade: 0.03 }); }, ai: 0.8 },
      { label: { en: 'One king, one law: Danish rule', de: 'Ein König, ein Gesetz: dänische Herrschaft' }, effect: (e) => { e.fx.prestige(8); e.fx.authority(15); e.fx.opinion(e.ctx.other, -15, 25); e.fx.flag('kalmar_union'); }, ai: 0.3 },
    ],
  },
  {
    id: 'timur_envoys', art: 'court', major: true, oncePer: true, minYear: 1393, maxYear: 1404,
    title: { en: 'The Envoys of the Lame Conqueror', de: 'Die Gesandten des lahmen Eroberers' },
    text: {
      en: 'Envoys of Timur, Lord of the Fortunate Conjunction, who has razed Isfahan and Delhi and built towers of skulls, have arrived at the court of {ruler}. They bring a robe of honour and a letter: strike coins and read the Friday prayer in his name, or see your cities made into pasture.',
      de: 'Gesandte Timurs, des Herrn der glücklichen Konjunktion, der Isfahan und Delhi geschleift und Türme aus Schädeln errichtet hat, sind am Hof von {ruler} eingetroffen. Sie bringen ein Ehrengewand und einen Brief: Präge Münzen und lies das Freitagsgebet in seinem Namen, oder sieh deine Städte zu Weideland werden.',
    },
    mtth: 12,
    trigger: (e) => isKey(e, 'ottoman', 'mamluk', 'golden_horde', 'jalayirid', 'georgia', 'kara_koyunlu', 'ak_koyunlu', 'muzaffarid', 'kart', 'karaman', 'trebizond') && e.n.capital >= 0 && e.w.lon[e.n.capital] > 25,
    options: [
      { label: { en: 'Defy him', de: 'Ihm trotzen' }, effect: (e) => { e.fx.prestige(5); e.fx.modifier('timur_wrath', 8, { en: 'Wrath of Timur', de: 'Zorn Timurs' }, { concord: -8, tax: -0.05 }); e.fx.manpower(-0.1); e.fx.devastate(H.randomLoc(e), 0.4); }, ai: (e) => (isKey(e, 'ottoman', 'mamluk') ? 0.6 : 0.3) },
      { label: { en: 'Submit and send gifts', de: 'Sich unterwerfen und Geschenke senden' }, effect: (e) => { e.fx.gold(-3); e.fx.prestige(-8); e.fx.mandate(-5); }, ai: 0.6 },
    ],
  },
  {
    id: 'tannenberg', art: 'battle', major: true, once: true, minYear: 1409, maxYear: 1412,
    title: { en: 'The Great War against the Order', de: 'Der Große Krieg gegen den Orden' },
    text: {
      en: 'The Teutonic Knights have seized Samogitia again and the Grand Master has sent two naked swords to the camp of {ruler}, as a challenge. The Polish and Lithuanian hosts, Tatars and Czech mercenaries with them, stand between the villages of Grunwald and Tannenberg.',
      de: 'Der Deutsche Orden hat Schamaiten erneut besetzt, und der Hochmeister hat zwei blanke Schwerter als Herausforderung in das Lager von {ruler} gesandt. Die polnischen und litauischen Heere, mit Tataren und tschechischen Söldnern, stehen zwischen den Dörfern Grünfelde und Tannenberg.',
    },
    mtth: 6,
    trigger: (e) => isKey(e, 'poland') && alive(e, 'teutonic_order') && neighbourKey(e, 'teutonic_order'),
    setup: (e) => { e.ctx.other = idOf(e, 'teutonic_order'); return e.ctx.other >= 0; },
    options: [
      { label: { en: 'Accept the swords and attack', de: 'Die Schwerter annehmen und angreifen' }, effect: (e) => { e.fx.manpower(-0.15); e.fx.prestige(15); e.fx.mandate(5); e.fx.myOpinion(e.ctx.other, -40, 20); e.fx.modifier('grunwald', 30, { en: 'Victors of Grunwald', de: 'Sieger von Grunwald' }, { morale: 0.05 }); }, ai: 0.8 },
      { label: { en: 'Negotiate through the King of Bohemia', de: 'Über den König von Böhmen verhandeln' }, effect: (e) => { e.fx.prestige(-3); e.fx.gold(1); e.fx.opinion(e.ctx.other, 10); }, ai: 0.2 },
    ],
  },
  {
    id: 'council_constance', art: 'church', major: true, once: true, minYear: 1414, maxYear: 1418,
    title: { en: 'The Council of Constance', de: 'Das Konzil von Konstanz' },
    text: {
      en: 'At Constance on the lake, cardinals, bishops, doctors, princes, merchants and two thousand courtesans have gathered for the greatest council of the age. Three men claim to be pope. The council, as host and protector, may depose all three and elect a fourth, and with him reunite Christendom.',
      de: 'In Konstanz am See haben sich Kardinäle, Bischöfe, Doktoren, Fürsten, Kaufleute und zweitausend Kurtisanen zum größten Konzil des Zeitalters versammelt. Drei Männer beanspruchen das Papstamt. Das Konzil, unter seinem Gastgeber und Schutzherrn, kann alle drei absetzen und einen vierten wählen und mit ihm die Christenheit wieder vereinen.',
    },
    mtth: 6,
    trigger: (e) => latin(e) && e.s.papacy.schism && (e.s.empire.emperor === e.n.id || owns(e, 'Konstanz')),
    setup: (e) => { e.ctx.loc = locByName(e.w, 'Konstanz'); return true; },
    options: [
      { label: { en: 'Depose all three and elect one pope', de: 'Alle drei absetzen und einen Papst wählen' }, effect: (e) => { e.s.papacy.schism = false; e.s.papacy.reformPressure = Math.max(0, e.s.papacy.reformPressure - 15); e.fx.prestige(15); e.fx.mandate(6); e.fx.estate('prelates', 6); e.fx.gold(-2); e.fx.chronicle({ en: 'The Council of Constance ended the schism of the popes.', de: 'Das Konzil von Konstanz beendete die Kirchenspaltung.' }, e.ctx.loc); }, ai: 0.9 },
      { label: { en: 'Back one claimant and let the others rage', de: 'Einen Anwärter unterstützen und die anderen toben lassen' }, effect: (e) => { e.fx.prestige(3); e.fx.authority(10); e.s.papacy.reformPressure += 5; }, ai: 0.1 },
    ],
  },
  {
    id: 'hus_burned', art: 'fire', major: true, once: true, minYear: 1415, maxYear: 1418,
    title: { en: 'The Burning of Master Jan', de: 'Die Verbrennung des Magisters Jan' },
    text: {
      en: 'Master Jan Hus went to Constance under the emperor’s safe-conduct to defend his teaching. The council condemned him as a heretic and burned him; his ashes were thrown into the Rhine. Four hundred and fifty lords of {nation} have sealed a letter of protest, and Prague is in uproar.',
      de: 'Magister Jan Hus ging unter dem Geleitbrief des Kaisers nach Konstanz, um seine Lehre zu verteidigen. Das Konzil verurteilte ihn als Ketzer und verbrannte ihn; seine Asche wurde in den Rhein gestreut. Vierhundertfünfzig Herren von {nation} haben einen Protestbrief besiegelt, und Prag ist in Aufruhr.',
    },
    mtth: 4,
    trigger: (e) => owns(e, 'Prague') && latin(e),
    setup: (e) => { e.ctx.loc = locByName(e.w, 'Prague'); return true; },
    options: [
      { label: { en: 'Protect the Hussite preachers', de: 'Die hussitischen Prediger schützen' }, effect: (e) => { e.fx.estate('magnates', 6); e.fx.estate('commons', 8); e.fx.estate('prelates', -12); e.fx.opinion(pope(e), -20); e.fx.flag('hussite_sympathy'); }, ai: 0.5 },
      { label: { en: 'Obey the council and restore the bishops', de: 'Dem Konzil gehorchen und die Bischöfe wieder einsetzen' }, effect: (e) => { e.fx.estate('prelates', 8); e.fx.unrest(e.ctx.loc, 15); e.fx.unrestAll(5); e.fx.concord(-8); }, ai: 0.5 },
    ],
  },
  {
    id: 'defenestration', art: 'revolt', major: true, once: true, minYear: 1419, maxYear: 1424,
    title: { en: 'Out of the Windows', de: 'Aus den Fenstern' },
    text: {
      en: 'A procession led by the preacher Jan Želivský stormed the New Town Hall of Prague and threw the councillors from the windows onto the pikes below. The commons of the towns and the Taborites in the south demand the Four Articles: free preaching, the chalice for all, a poor clergy, and punishment of mortal sin.',
      de: 'Eine vom Prediger Jan Želivský angeführte Prozession stürmte das Neustädter Rathaus in Prag und warf die Ratsherren aus den Fenstern auf die Spieße darunter. Die Gemeinen der Städte und die Taboriten im Süden fordern die Vier Artikel: freie Predigt, den Kelch für alle, eine arme Geistlichkeit und die Bestrafung der Todsünden.',
    },
    mtth: 6,
    trigger: (e) => owns(e, 'Prague') && latin(e) && (e.n.flags.hussite_sympathy !== undefined || e.s.flags.ev_hus_burned !== undefined),
    setup: (e) => { e.ctx.loc = locByName(e.w, 'Prague'); return true; },
    options: [
      { label: { en: 'Accept the Four Articles', de: 'Die Vier Artikel annehmen' }, effect: (e) => { e.fx.convertRealm(H.faith('hussite')); e.fx.faithAt(e.ctx.loc, H.faith('hussite')); e.fx.estate('prelates', -30, -15); e.fx.estate('commons', 12, 5); e.fx.gold(4); e.fx.opinion(pope(e), -50, 30); e.fx.concord(-10); }, ai: 0.5 },
      { label: { en: 'Call the crusade against the heretics', de: 'Den Kreuzzug gegen die Ketzer ausrufen' }, effect: (e) => { e.fx.unrestAll(15); e.fx.estate('prelates', 10); e.fx.estate('commons', -10); e.fx.opinion(pope(e), 20); e.fx.concord(-15); }, ai: 0.5 },
    ],
  },
  {
    id: 'hussite_crusade_call', art: 'battle', oncePer: true, minYear: 1420, maxYear: 1436,
    title: { en: 'A Crusade against Bohemia', de: 'Ein Kreuzzug gegen Böhmen' },
    text: {
      en: 'The pope has proclaimed a crusade against the Hussite heretics of {other}, with full indulgence for all who take the cross. Twice already the crusaders have fled in panic when they heard the Hussite war-wagons and their hymn, "Ye who are the warriors of God".',
      de: 'Der Papst hat einen Kreuzzug gegen die hussitischen Ketzer von {other} ausgerufen, mit vollkommenem Ablass für alle, die das Kreuz nehmen. Schon zweimal sind die Kreuzfahrer in Panik geflohen, als sie die hussitischen Wagenburgen und ihren Choral hörten: „Die ihr Gottes Streiter seid“.',
    },
    mtth: 12,
    trigger: (e) => latin(e) && H.neighbourNations(e).some((o) => e.s.nations[o].faith === H.faith('hussite')),
    setup: (e) => { e.ctx.other = H.pickNeighbour(e, (o) => e.s.nations[o].faith === H.faith('hussite')); return e.ctx.other >= 0; },
    options: [
      { label: { en: 'Take the cross', de: 'Das Kreuz nehmen' }, effect: (e) => { e.fx.manpower(-0.08); e.fx.gold(-1); e.fx.prestige(4); e.fx.estate('prelates', 8); e.fx.opinion(pope(e), 15); e.fx.myOpinion(e.ctx.other, -25, 15); }, ai: 0.5 },
      { label: { en: 'Guard our own borders only', de: 'Nur die eigenen Grenzen schützen' }, effect: (e) => { e.fx.gold(-0.5); e.fx.modifier('border_watch', 10, { en: 'Watch on the Bohemian border', de: 'Wacht an der böhmischen Grenze' }, { fort_strength: 0.05 }); e.fx.estate('prelates', -4); e.fx.opinion(pope(e), -5); }, ai: 0.5 },
      { label: { en: 'Trade with the heretics quietly', de: 'Heimlich mit den Ketzern handeln' }, effect: (e) => { e.fx.gold(1); e.fx.estate('burghers', 4); e.fx.estate('prelates', -8); e.fx.opinion(e.ctx.other, 15); }, ai: 0.2 },
    ],
  },
  {
    id: 'printing_mainz', art: 'scholar', major: true, once: true, minYear: 1448, maxYear: 1460,
    title: { en: 'The Workshop at the Hof zum Gutenberg', de: 'Die Werkstatt im Hof zum Gutenberg' },
    text: {
      en: 'A Mainz goldsmith, Johannes Gensfleisch called Gutenberg, has cast letters from a hand mould in an alloy of lead and tin, set them in lines and pressed them with oil-based ink in a converted wine press. His Bible of forty-two lines is the wonder of the Frankfurt fair. His backer Fust now sues him for the debt.',
      de: 'Ein Mainzer Goldschmied, Johannes Gensfleisch genannt Gutenberg, hat Lettern mit einem Handgießinstrument aus einer Legierung von Blei und Zinn gegossen, sie zu Zeilen gesetzt und mit Ölfarbe in einer umgebauten Weinpresse gedruckt. Seine zweiundvierzigzeilige Bibel ist das Wunder der Frankfurter Messe. Sein Geldgeber Fust verklagt ihn nun wegen der Schulden.',
    },
    mtth: 12,
    trigger: (e) => owns(e, 'Mainz'),
    setup: (e) => { e.ctx.loc = locByName(e.w, 'Mainz'); return true; },
    options: [
      { label: { en: 'Pay his debts and make him a court printer', de: 'Seine Schulden bezahlen und ihn zum Hofdrucker machen' }, effect: (e) => { e.fx.gold(-1.5); e.fx.insight(10); e.fx.tech(1, 0.2); e.fx.prestige(6); e.fx.dev(e.ctx.loc, 0.5); }, ai: 0.8 },
      { label: { en: 'Let the courts decide; presses will spread anyway', de: 'Die Gerichte entscheiden lassen; die Pressen verbreiten sich ohnehin' }, effect: (e) => { e.fx.insight(4); e.fx.estate('burghers', 4); }, ai: 0.4 },
    ],
  },
  {
    id: 'orban_cannon', art: 'battle', once: true, minYear: 1450, maxYear: 1470,
    title: { en: 'The Founder Orban', de: 'Der Geschützgießer Urban' },
    text: {
      en: 'A Hungarian gun founder named Orban, who found the emperor in Constantinople unable to pay him, has come to {ruler}. He promises a bronze bombard so great that sixty oxen must draw it, throwing stones that will break even the walls of Theodosius.',
      de: 'Ein ungarischer Geschützgießer namens Urban, den der Kaiser in Konstantinopel nicht bezahlen konnte, ist zu {ruler} gekommen. Er verspricht eine bronzene Steinbüchse, so groß, dass sechzig Ochsen sie ziehen müssen, mit Kugeln, die selbst die Mauern des Theodosius brechen werden.',
    },
    mtth: 12,
    trigger: (e) => isKey(e, 'ottoman') && ownerOf(e, 'Constantinople') !== e.n.id && ownerOf(e, 'Constantinople') >= 0,
    setup: (e) => { e.ctx.other = ownerOf(e, 'Constantinople'); return true; },
    options: [
      { label: { en: 'Pay him four times what he asks', de: 'Ihm das Vierfache seiner Forderung zahlen' }, effect: (e) => { e.fx.gold(-3); e.fx.tech(2, 0.15); e.fx.modifier('great_bombard', 30, { en: 'The great bombard', de: 'Die große Steinbüchse' }, { fire: 0.1, fort_strength: 0.05, siege: 3 }); e.fx.flag('great_bombard'); }, ai: 0.9 },
      { label: { en: 'Send him away', de: 'Ihn fortschicken' }, effect: (e) => { e.fx.gold(0.5); e.fx.estate('magnates', 2); }, ai: 0.1 },
    ],
  },
  {
    id: 'fall_constantinople', art: 'battle', major: true, once: true, minYear: 1400, maxYear: 1520,
    title: { en: 'The City Has Fallen', de: 'Die Stadt ist gefallen' },
    text: {
      en: 'Constantinople, the Queen of Cities, capital of the Romans for eleven hundred years, is in the hands of {ruler}. The last emperor died fighting on the walls. The great church of Holy Wisdom has heard its last Christian liturgy; the conqueror rides into it and orders it made a mosque. What now of its people, its Patriarch, and its trade?',
      de: 'Konstantinopel, die Königin der Städte, seit elfhundert Jahren Hauptstadt der Rhomäer, ist in der Hand von {ruler}. Der letzte Kaiser fiel kämpfend auf den Mauern. Die große Kirche der Heiligen Weisheit hat ihre letzte christliche Liturgie gehört; der Eroberer reitet hinein und befiehlt, sie zur Moschee zu machen. Was wird nun aus ihren Menschen, ihrem Patriarchen und ihrem Handel?',
    },
    mtth: 2,
    trigger: (e) => isKey(e, 'ottoman') && owns(e, 'Constantinople'),
    setup: (e) => { e.ctx.loc = locByName(e.w, 'Constantinople'); return true; },
    options: [
      { label: { en: 'Appoint a Patriarch and resettle the city', de: 'Einen Patriarchen einsetzen und die Stadt neu besiedeln' }, effect: (e) => { e.fx.prestige(25); e.fx.mandate(15); e.fx.pop(e.ctx.loc, 0.15); e.fx.dev(e.ctx.loc, 2); e.fx.unrest(e.ctx.loc, -10); e.fx.modifier('kayser_i_rum', 100, { en: 'Caesar of Rome', de: 'Kaiser von Rom' }, { mandate: 6, tolerance: 0.15, trade: 0.05 }); }, ai: 0.8 },
      { label: { en: 'Three days of plunder for the army', de: 'Drei Tage Plünderung für das Heer' }, effect: (e) => { e.fx.prestige(20); e.fx.gold(6); e.fx.devastate(e.ctx.loc, 0.5); e.fx.pop(e.ctx.loc, -0.2); e.fx.estate('magnates', 8); }, ai: 0.3 },
    ],
  },
  {
    id: 'wars_of_roses', art: 'battle', major: true, once: true, minYear: 1450, maxYear: 1480,
    title: { en: 'The White Rose and the Red', de: 'Die weiße und die rote Rose' },
    text: {
      en: 'The king of {nation} is pious, gentle and at times entirely absent in mind. His cousin the Duke of York, Protector during the king’s madness, has been dismissed by the queen’s party and gathers his retainers in the north. Every great lord of the realm now has to choose a badge.',
      de: 'Der König von {nation} ist fromm, sanft und zuweilen völlig geistesabwesend. Sein Vetter, der Herzog von York, Protektor während des Wahnsinns des Königs, ist von der Partei der Königin entlassen worden und sammelt seine Gefolgsleute im Norden. Jeder große Herr des Reiches muss sich nun für ein Abzeichen entscheiden.',
    },
    mtth: 12,
    trigger: (e) => isKey(e, 'england') && owns(e, 'London') && (e.n.mandate < 65 || e.n.concord < 15 || e.n.warExhaustion > 15 || !!e.n.regent),
    options: [
      { label: { en: 'Reconcile the factions at a Loveday', de: 'Die Parteien an einem Versöhnungstag aussöhnen' }, effect: (e) => { e.fx.gold(-1); e.fx.concord(-5); e.fx.estate('magnates', 6); e.fx.modifier('roses', 15, { en: 'Wars of the Roses', de: 'Rosenkriege' }, { concord: -8, mandate: -5 }); }, ai: 0.5 },
      { label: { en: 'Destroy the House of York', de: 'Das Haus York vernichten' }, effect: (e) => { e.fx.manpower(-0.1); e.fx.authority(15); e.fx.estate('magnates', -10, -5); e.fx.modifier('roses', 20, { en: 'Wars of the Roses', de: 'Rosenkriege' }, { concord: -12, manpower: -0.1 }); }, ai: 0.4 },
    ],
  },
  {
    id: 'reconquista_frontier', art: 'battle', cooldown: 15, minYear: 1356, maxYear: 1492,
    title: { en: 'The Frontier of Granada', de: 'Die Grenze von Granada' },
    text: {
      en: 'The castellans of the frontier report that Granadan horsemen raided the valleys near {loc} and carried off cattle and captives. The masters of the military orders want to strike back; the merchants of Seville would rather renew the truce and its tribute in gold.',
      de: 'Die Burgvögte der Grenze melden, granadinische Reiter hätten die Täler bei {loc} überfallen und Vieh und Gefangene fortgeführt. Die Meister der Ritterorden wollen zurückschlagen; die Kaufleute Sevillas würden lieber den Waffenstillstand und seinen Tribut in Gold erneuern.',
    },
    mtth: 60,
    trigger: (e) => latin(e) && alive(e, 'granada') && neighbourKey(e, 'granada'),
    setup: (e) => { e.ctx.other = idOf(e, 'granada'); const o = e.ctx.other; const ls = H.locs(e.s, e.n.id).filter((l) => { for (let j = e.w.adjStart[l]; j < e.w.adjStart[l + 1]; j++) { const v = e.w.adj[j]; if (v < e.w.L && e.s.loc.owner[v] === o) return true; } return false; }); e.ctx.loc = ls.length ? ls[0] : e.n.capital; return e.ctx.other >= 0; },
    options: [
      { label: { en: 'Unleash the military orders', de: 'Die Ritterorden losschlagen lassen' }, effect: (e) => { e.fx.manpower(-0.03); e.fx.prestige(4); e.fx.estate('magnates', 5); e.fx.estate('prelates', 4); e.fx.myOpinion(e.ctx.other, -10); e.fx.gold(0.5); }, ai: 0.6 },
      { label: { en: 'Renew the truce and the tribute', de: 'Waffenstillstand und Tribut erneuern' }, effect: (e) => { e.fx.gold(1.5); e.fx.estate('burghers', 4); e.fx.opinion(e.ctx.other, -5); e.fx.estate('magnates', -3); }, ai: 0.5 },
    ],
  },
  {
    id: 'fall_of_granada', art: 'coronation', major: true, once: true, minYear: 1470, maxYear: 1520,
    title: { en: 'The Keys of the Alhambra', de: 'Die Schlüssel der Alhambra' },
    text: {
      en: 'The last emir of Granada has handed the keys of the Alhambra to {ruler} and ridden south into the Alpujarras. Legend says he wept at the last pass and his mother told him to weep like a woman for what he could not defend like a man. The capitulations promise the Muslims of Granada their mosques, their laws and their property.',
      de: 'Der letzte Emir von Granada hat {ruler_dat} die Schlüssel der Alhambra übergeben und ist nach Süden in die Alpujarras geritten. Die Legende sagt, er habe am letzten Pass geweint, und seine Mutter habe ihm gesagt, er solle wie eine Frau beweinen, was er nicht wie ein Mann verteidigen konnte. Die Kapitulation verspricht den Muslimen Granadas ihre Moscheen, ihre Gesetze und ihren Besitz.',
    },
    mtth: 2,
    trigger: (e) => latin(e) && isKey(e, 'castile', 'aragon', 'portugal') && owns(e, 'Granada'),
    setup: (e) => { e.ctx.loc = locByName(e.w, 'Granada'); return true; },
    options: [
      { label: { en: 'Keep the capitulations', de: 'Die Kapitulation einhalten' }, effect: (e) => { e.fx.prestige(20); e.fx.mandate(10); e.fx.unrest(e.ctx.loc, -10); e.fx.estate('prelates', -4); e.fx.modifier('mudejar_granada', 30, { en: 'Capitulations of Granada', de: 'Kapitulation von Granada' }, { tolerance: 0.1, trade: 0.03 }); }, ai: 0.5 },
      { label: { en: 'Send the friars: baptism or exile', de: 'Die Mönche senden: Taufe oder Exil' }, effect: (e) => { e.fx.prestige(18); e.fx.estate('prelates', 12); e.fx.faithAt(e.ctx.loc, e.n.faith); e.fx.unrest(e.ctx.loc, 20); e.fx.pop(e.ctx.loc, -0.1); e.fx.opinion(pope(e), 15); }, ai: 0.5 },
    ],
  },
  {
    id: 'westphalia', art: 'court', major: true, oncePer: true, minYear: 1644, maxYear: 1660,
    title: { en: 'The Congress of Münster and Osnabrück', de: 'Der Kongress von Münster und Osnabrück' },
    text: {
      en: 'After thirty years of war that have left a third of the Empire dead, envoys of every power meet at Münster and Osnabrück. They propose that each prince may choose his realm’s faith, that subjects of another faith may worship privately, and that the princes of the Empire may make treaties as sovereigns. The envoys of {nation} await instructions.',
      de: 'Nach dreißig Jahren Krieg, die ein Drittel des Reiches dahingerafft haben, treffen sich Gesandte aller Mächte in Münster und Osnabrück. Sie schlagen vor, dass jeder Fürst den Glauben seines Landes wählen darf, Untertanen anderen Glaubens privat ihren Gottesdienst halten dürfen und die Reichsfürsten als Souveräne Verträge schließen dürfen. Die Gesandten von {nation} warten auf Weisungen.',
    },
    mtth: 24,
    trigger: (e) => e.n.isHRE && settled(e) && H.locs(e.s, e.n.id).length >= 3,
    options: [
      { label: { en: 'Sign the peace', de: 'Den Frieden unterzeichnen' }, effect: (e) => { e.fx.concord(10); e.fx.warExhaustion(-15); e.fx.authority(10); e.fx.value(3, 10); e.fx.modifier('westphalia', 50, { en: 'Peace of Westphalia', de: 'Westfälischer Friede' }, { tolerance: 0.15, concord: 3 }); }, ai: 0.85 },
      { label: { en: 'Hold out for better terms', de: 'Auf bessere Bedingungen warten' }, effect: (e) => { e.fx.prestige(3); e.fx.warExhaustion(5); e.fx.concord(-5); }, ai: 0.15 },
    ],
  },
  {
    id: 'declaration_of_rights', art: 'court', major: true, oncePer: true, minYear: 1680, maxYear: 1730,
    title: { en: 'A Declaration of Rights', de: 'Eine Erklärung der Rechte' },
    text: {
      en: 'The ruler of {nation} has dispensed with laws, kept a standing army in peacetime without consent, and favoured a faith the realm rejects. The great lords and the merchants have invited a foreign prince to defend their liberties. The assembly will accept a sovereign only with a Declaration of Rights: no tax, no army and no suspension of law without its consent.',
      de: 'Der Herrscher von {nation} hat Gesetze außer Kraft gesetzt, im Frieden ohne Zustimmung ein stehendes Heer gehalten und einen Glauben begünstigt, den das Reich ablehnt. Die großen Herren und die Kaufleute haben einen fremden Prinzen eingeladen, ihre Freiheiten zu verteidigen. Die Versammlung wird einen Souverän nur mit einer Erklärung der Rechte annehmen: keine Steuer, kein Heer und keine Aussetzung von Gesetzen ohne ihre Zustimmung.',
    },
    mtth: 48,
    trigger: (e) => monarchy(e) && protestant(e) && est(e, 'burghers').influence + est(e, 'magnates').influence > 55 && (e.n.mandate < 55 || e.n.concord < 0),
    options: [
      { label: { en: 'Accept the Declaration', de: 'Die Erklärung annehmen' }, effect: (e) => { e.fx.authority(-40); e.fx.concord(15); e.fx.mandate(15); e.fx.estate('burghers', 12, 5); e.fx.estate('magnates', 6); e.fx.modifier('bill_of_rights', 100, { en: 'Declaration of Rights', de: 'Erklärung der Rechte' }, { interest: -0.015, trade: 0.04, authority_gain: -0.15 }); }, ai: 0.7 },
      { label: { en: 'Fight for the crown’s prerogative', de: 'Für das Vorrecht der Krone kämpfen' }, effect: (e) => { e.fx.authority(15); e.fx.concord(-20); e.fx.estate('burghers', -12); e.fx.estate('magnates', -10); e.fx.unrestAll(8); }, ai: 0.3 },
    ],
  },
  {
    id: 'enlightenment_salons', art: 'scholar', oncePer: true, minYear: 1720, maxYear: 1795,
    title: { en: 'The Salons of {loc}', de: 'Die Salons von {loc}' },
    text: {
      en: 'In the drawing rooms of {loc}, hostesses of wit gather philosophers, mathematicians, abbés and noblemen every Tuesday. They discuss Newton, the separation of powers, the price of grain and the cruelty of judicial torture. An encyclopedia of all the arts and sciences is being prepared, and some of its articles are aimed at the government.',
      de: 'In den Salons von {loc} versammeln geistreiche Gastgeberinnen jeden Dienstag Philosophen, Mathematiker, Abbés und Adlige. Man spricht über Newton, die Gewaltenteilung, den Getreidepreis und die Grausamkeit der Folter. Eine Enzyklopädie aller Künste und Wissenschaften wird vorbereitet, und manche ihrer Artikel zielen auf die Regierung.',
    },
    mtth: 48,
    trigger: (e) => settled(e) && eraAtLeast(e, 2) && e.w.townSize[e.n.capital] >= 3,
    setup: (e) => { e.ctx.loc = e.n.capital; return true; },
    options: [
      { label: { en: 'Tolerate them; ideas are a nation’s ornament', de: 'Sie dulden; Ideen sind der Schmuck einer Nation' }, effect: (e) => { e.fx.insight(8); e.fx.tech(0, 0.1); e.fx.value(2, 8); e.fx.estate('prelates', -5); e.fx.modifier('salons', 40, { en: 'Age of salons', de: 'Zeitalter der Salons' }, { research: 0.05 }); }, ai: 0.7 },
      { label: { en: 'Ban the Encyclopedia', de: 'Die Enzyklopädie verbieten' }, effect: (e) => { e.fx.estate('prelates', 6); e.fx.authority(5); e.fx.value(2, -5); e.fx.insight(2); }, ai: 0.3 },
    ],
  },
  {
    id: 'revolution_crisis', art: 'revolt', major: true, oncePer: true, minYear: 1780, maxYear: 1810,
    title: { en: 'The Estates Are Summoned', de: 'Die Stände werden einberufen' },
    text: {
      en: 'The treasury of {nation} is bankrupt, bread has never been dearer, and pamphlets ask what the common people are: "Everything. What have they been until now? Nothing. What do they ask? To be something." The representatives of the commons have sworn not to separate until the realm has a constitution. A crowd has stormed the fortress-prison of {loc}.',
      de: 'Die Schatzkammer von {nation} ist bankrott, Brot war nie teurer, und Flugschriften fragen, was das gemeine Volk sei: „Alles. Was war es bisher? Nichts. Was verlangt es? Etwas zu sein.“ Die Vertreter der Gemeinen haben geschworen, nicht auseinanderzugehen, bis das Reich eine Verfassung hat. Eine Menge hat das Festungsgefängnis von {loc} gestürmt.',
    },
    mtth: 12,
    trigger: (e) => monarchy(e) && settled(e) && eraAtLeast(e, 2) && H.locs(e.s, e.n.id).length >= 10 && (e.n.treasury < 0 || e.n.debt > inc(e) * 12 || e.n.concord < -20) && H.avgUnrest(e) > 6,
    setup: (e) => { e.ctx.loc = e.n.capital; return true; },
    options: [
      { label: { en: 'Accept a constitution', de: 'Eine Verfassung annehmen' }, effect: (e) => { e.fx.authority(-60); e.fx.concord(10); e.fx.estate('burghers', 15, 10); e.fx.estate('commons', 10, 5); e.fx.estate('magnates', -15, -10); e.fx.estate('prelates', -10, -5); e.fx.flag('revolution', 1); e.fx.modifier('constitution', 100, { en: 'Constitutional monarchy', de: 'Konstitutionelle Monarchie' }, { tax: 0.06, unrest: -2, authority_gain: -0.2 }); }, ai: 0.5 },
      { label: { en: 'Call in the foreign regiments', de: 'Die fremden Regimenter herbeirufen' }, effect: (e) => { e.fx.authority(10); e.fx.concord(-25); e.fx.unrestAll(15); e.fx.estate('commons', -15); e.fx.estate('magnates', 6); e.fx.flag('revolution', 2); }, ai: 0.3 },
      { label: { en: 'Abolish privileges by decree from above', de: 'Die Vorrechte von oben per Erlass abschaffen' }, effect: (e) => { e.fx.authority(-20); e.fx.estate('magnates', -20, -10); e.fx.estate('prelates', -12, -5); e.fx.estate('commons', 12, 5); e.fx.gold(4); e.fx.unrestAll(-5); e.fx.flag('revolution', 3); }, ai: 0.4 },
    ],
  },
  {
    id: 'levee_en_masse', art: 'battle', major: true, oncePer: true, minYear: 1792, maxYear: 1815,
    title: { en: 'The Nation in Arms', de: 'Die Nation in Waffen' },
    text: {
      en: 'The enemies of {nation} are at the borders. A decree is proposed: from this moment until the enemy is driven out, all citizens are permanently requisitioned for the armies. Young men shall fight, married men forge arms and carry supplies, women make tents and serve in hospitals, children turn old linen into bandages.',
      de: 'Die Feinde von {nation} stehen an den Grenzen. Ein Erlass wird vorgeschlagen: Von diesem Augenblick an, bis der Feind vertrieben ist, stehen alle Bürger dauernd für die Heere bereit. Die jungen Männer sollen kämpfen, die verheirateten Waffen schmieden und Nachschub tragen, die Frauen Zelte nähen und in Lazaretten dienen, die Kinder altes Leinen zu Verbandszeug zupfen.',
    },
    mtth: 12,
    trigger: (e) => atWar(e) && settled(e) && eraAtLeast(e, 2) && (e.n.flags.revolution !== undefined || republic(e) || e.n.warExhaustion > 25),
    options: [
      { label: { en: 'Decree the mass levy', de: 'Die Massenaushebung verfügen' }, effect: (e) => { e.fx.manpower(0.5); e.fx.estate('commons', -6); e.fx.estate('magnates', -6); e.fx.mandate(5); e.fx.modifier('levee_en_masse', 15, { en: 'Nation in arms', de: 'Nation in Waffen' }, { manpower: 0.3, morale: 0.08, discipline: -0.03 }); }, ai: 0.7 },
      { label: { en: 'Fight with the regular army only', de: 'Nur mit dem stehenden Heer kämpfen' }, effect: (e) => { e.fx.estate('magnates', 4); e.fx.manpower(0.05); e.fx.gold(-1); }, ai: 0.3 },
    ],
  },
  {
    id: 'stralsund_peace', art: 'ship', major: true, once: true, minYear: 1368, maxYear: 1372,
    title: { en: 'The Peace of Stralsund', de: 'Der Friede von Stralsund' },
    text: {
      en: 'The towns of the Hanse, united in the Cologne Confederation, have burned Copenhagen and taken the fortresses of the Sound. Their terms: free trade throughout the kingdom, the castles of Scania for fifteen years, two-thirds of their revenues, and a voice in the choice of the next king.',
      de: 'Die Hansestädte, vereint in der Kölner Konföderation, haben Kopenhagen niedergebrannt und die Festungen am Sund eingenommen. Ihre Bedingungen: freier Handel im ganzen Königreich, die Burgen Schonens für fünfzehn Jahre, zwei Drittel ihrer Einkünfte und ein Mitspracherecht bei der Wahl des nächsten Königs.',
    },
    mtth: 12,
    trigger: (e) => isKey(e, 'denmark') && alive(e, 'lubeck') && (H.atWarWith(e.s, e.n.id, idOf(e, 'lubeck')) || e.year >= 1370),
    setup: (e) => { e.ctx.other = idOf(e, 'lubeck'); return e.ctx.other >= 0; },
    options: [
      { label: { en: 'Accept the terms', de: 'Die Bedingungen annehmen' }, effect: (e) => { e.fx.prestige(-10); e.fx.opinion(e.ctx.other, 30, 20); e.fx.warExhaustion(-10); e.fx.modifier('stralsund', 15, { en: 'Peace of Stralsund', de: 'Friede von Stralsund' }, { tax: -0.06, trade: 0.04 }); }, ai: 0.6 },
      { label: { en: 'Never: the Sound belongs to the crown', de: 'Niemals: Der Sund gehört der Krone' }, effect: (e) => { e.fx.prestige(5); e.fx.warExhaustion(8); e.fx.myOpinion(e.ctx.other, -20, 15); e.fx.opinion(e.ctx.other, -20, 15); e.fx.estate('burghers', -6); }, ai: 0.4 },
    ],
  },
];
