// Refusal texts of the simulation in both languages. Commands, decisions and reforms refuse with a short English text
// (CmdResult.err, DecisionDef.can); that text is the key here, and refusal() returns it in English and German so every
// client (worker, world server, tools) shows it in the player's language. Refusals that name a realm or an estate are
// returned as I18n by the simulation itself and pass through unchanged. tests/direction.test.ts checks that every
// refusal literal in src/sim has a German text.
import type { I18n } from './types';

export const REFUSAL_DE: Record<string, string> = {
  // the world server's refusals (server/world.ts)
  'You do not rule a realm here.': 'Du regierst hier kein Reich.', 'bad command': 'Ungültiger Befehl', 'command not allowed online': 'Dieser Befehl ist online nicht erlaubt',
  'command too large': 'Befehl zu groß', 'developer commands are for admins only': 'Entwicklerbefehle sind nur für Admins', 'no seat': 'Kein Sitz', 'not your realm': 'Nicht dein Reich',
  'too many orders for one day': 'Zu viele Befehle für einen Tag',
  'not enough gold': 'Nicht genug Gold', 'not enough manpower': 'Nicht genug Wehrkraft', 'not enough sailors': 'Nicht genug Seeleute', 'not enough Authority': 'Nicht genug Autorität', 'not enough insight': 'Nicht genug Einsicht',
  'not your army': 'Nicht dein Heer', 'not your location': 'Nicht dein Ort', 'occupied': 'Besetzt', 'in battle': 'In der Schlacht', 'no route': 'Kein Weg', 'embarked': 'Eingeschifft', 'retreating': 'Auf dem Rückzug',
  'need two armies': 'Zwei Heere nötig', 'too small': 'Zu klein', 'fully built': 'Voll ausgebaut', 'two works already under way here': 'Hier sind schon zwei Bauten im Gange', 'needs a larger town': 'Braucht eine größere Stadt',
  'one seat at a time': 'Nur ein Verwaltungssitz zugleich', 'not yet known': 'Noch unbekannt', 'needs a coast': 'Braucht eine Küste', 'needs a harbour': 'Braucht einen Hafen', 'unit not available': 'Truppe nicht verfügbar',
  'the realm is still settling': 'Das Reich ordnet sich noch', 'already at war': 'Schon im Krieg', 'subjects cannot declare wars': 'Untertanen können keinen Krieg erklären', 'the assembly refused to fund the war': 'Die Versammlung verweigert die Kriegsgelder',
  'no such war': 'Kein solcher Krieg', 'not in this war': 'Nicht in diesem Krieg', 'not an enemy': 'Kein Feind', 'negotiate with the war leader': 'Mit dem Kriegsführer verhandeln', 'wait before sending another offer': 'Warte, bevor du ein weiteres Angebot sendest',
  'refused': 'Abgelehnt', 'no such offer': 'Kein solches Angebot', 'all envoys are busy': 'Alle Gesandten sind unterwegs', 'already allied': 'Schon verbündet', 'already married': 'Schon verheiratet', 'at war': 'Im Krieg', 'invalid target': 'Ungültiges Ziel',
  'at most three rivals': 'Höchstens drei Rivalen', 'already fabricating': 'Wird schon fabriziert', 'all agents are busy': 'Alle Agenten sind beschäftigt', 'unknown action': 'Unbekannte Handlung', 'a reform is already under way': 'Eine Reform ist schon im Gange',
  'already in force': 'Bereits in Kraft', 'not yet possible in this era': 'In diesem Zeitalter noch nicht möglich', 'not possible for this government': 'Für diese Regierungsform nicht möglich', 'already granted': 'Bereits gewährt', 'not granted': 'Nicht gewährt',
  'too soon': 'Zu früh', 'the assembly met recently': 'Die Versammlung tagte erst kürzlich', 'bad class': 'Ungültiger Stand', 'doctrine complete': 'Doktrin vollendet', 'not yet in this era': 'Noch nicht in diesem Zeitalter', 'no free doctrine slot': 'Kein freier Doktrinplatz',
  'nothing left to learn': 'Nichts mehr zu lernen', 'already of our faith': 'Schon unseres Glaubens', 'already of our culture': 'Schon unserer Kultur', 'already working there': 'Dort ist schon jemand tätig', 'no free preachers or officials': 'Keine freien Prediger oder Beamten',
  'not land': 'Kein Land', 'already claimed': 'Schon beansprucht', 'unknown land': 'Unbekanntes Land', 'someone is already settling here': 'Hier siedelt schon jemand', 'no colonists available': 'Keine Kolonisten verfügbar', 'out of colonial range': 'Außerhalb der Kolonialreichweite',
  'no such person': 'Keine solche Person', 'no lender will extend more credit': 'Kein Geldgeber gewährt mehr Kredit', 'no loans': 'Keine Kredite', 'no such market': 'Kein solcher Markt', 'no merchants left': 'Keine Kaufleute mehr frei',
  'not your subject': 'Nicht dein Untertan', 'tributaries cannot be integrated': 'Tributpflichtige können nicht eingegliedert werden', 'colonial realms cannot be integrated': 'Kolonialreiche können nicht eingegliedert werden', 'our merchants are not ready (Commerce 12)': 'Unsere Kaufleute sind noch nicht so weit (Handel 12)', 'no charter available': 'Kein Freibrief verfügbar', 'already chartered': 'Bereits gegründet', 'we hold no harbour there': 'Wir besitzen dort keinen Hafen', 'must be a subject for ten years': 'Muss zehn Jahre Untertan sein', 'too restless': 'Zu unruhig',
  'bad slot': 'Ungültiger Platz', 'build more workshops first': 'Erst mehr Werkstätten bauen', 'unknown recipe': 'Unbekanntes Verfahren', 'need an army and a fleet': 'Heer und Flotte nötig', 'fleet must lie off the coast': 'Die Flotte muss vor der Küste liegen',
  'not enough ships': 'Nicht genug Schiffe', 'developer tools are disabled': 'Entwicklerwerkzeuge sind abgeschaltet', 'already taken': 'Bereits getroffen', 'unknown decision': 'Unbekannte Entscheidung', 'not enough favour with the Curia': 'Zu wenig Gunst bei der Kurie',
  'not of the Latin church': 'Nicht der lateinischen Kirche zugehörig', 'not in the same place': 'Nicht am selben Ort', 'select one army': 'Ein Heer wählen', 'select a location': 'Einen Ort wählen', 'select a realm': 'Ein Reich wählen', 'already under way': 'Bereits im Gange',
  'unknown office': 'Unbekanntes Amt', 'the ruler cannot hold an office': 'Der Herrscher kann kein Amt bekleiden', 'too young for office': 'Zu jung für ein Amt', 'already holds this office': 'Bekleidet dieses Amt bereits',
  'no terms': 'Keine Bedingungen', 'none': 'Keine', 'no such realm': 'Kein solches Reich', 'failed': 'Fehlgeschlagen', 'unknown': 'Unbekannt', 'invalid': 'Ungültig',
  // ---- UI pass (claude/ui-pass): reasons a decision is not yet possible (src/sim/content/decisions.ts)
  'only in the Age of Reason': 'Erst im Zeitalter der Vernunft', 'we are not sovereign': 'Wir sind nicht souverän', 'only from the Age of Print and Horizons': 'Erst ab dem Zeitalter von Druck und Horizonten',
  'need 20 Authority': 'Braucht 20 Autorität', 'need 30 Authority': 'Braucht 30 Autorität', 'need 50 Authority': 'Braucht 50 Autorität', 'need 60 Authority': 'Braucht 60 Autorität', 'need 80 Authority': 'Braucht 80 Autorität', 'need 100 Authority': 'Braucht 100 Autorität', 'need 50 Mandate': 'Braucht 50 Mandat', 'need 150 Authority': 'Braucht 150 Autorität', 'need 60 Mandate': 'Braucht 60 Mandat',
  'need Governance 10': 'Braucht Staatskunst 10', 'need Commerce & Learning 3': 'Braucht Handel & Gelehrsamkeit 3', 'need Commerce & Learning 10': 'Braucht Handel & Gelehrsamkeit 10', 'need Commerce & Learning 14': 'Braucht Handel & Gelehrsamkeit 14', 'need a harbour': 'Braucht einen Hafen',
  'we must know bills of exchange and double-entry bookkeeping': 'Wir müssen Wechselbriefe und doppelte Buchführung kennen', 'we are still in good standing with the Curia': 'Wir stehen noch in gutem Ansehen bei der Kurie',
  'too soon after the last foundation': 'Zu kurz nach der letzten Gründung', 'throw off the overlord first': 'Erst den Oberherrn abschütteln', 'the estates met recently': 'Die Stände tagten erst kürzlich',
  'our realm is too small for estates general': 'Unser Reich ist zu klein für Generalstände', 'our realm is too small for an admiralty': 'Unser Reich ist zu klein für eine Admiralität', 'our realm is too small for a trading company': 'Unser Reich ist zu klein für eine Handelskompanie',
  'our realm is too small for a progress': 'Unser Reich ist zu klein für eine Rundreise', 'our realm is too small for a code of laws': 'Unser Reich ist zu klein für ein Gesetzbuch',
  'our realm already has as many universities as it can sustain (one, and one more per 30 locations)': 'Unser Reich hat schon so viele Universitäten, wie es tragen kann (eine, und eine weitere je 30 Orte)',
  'our capital must reach development 15': 'Unsere Hauptstadt muss Entwicklung 15 erreichen', 'only from the Age of Confessions': 'Erst ab dem Zeitalter der Konfessionen', 'not while at war': 'Nicht während eines Krieges',
  'not enough gold (12 months of taxes)': 'Nicht genug Gold (12 Monatssteuern)', 'not before the Age of Print': 'Nicht vor dem Zeitalter des Drucks', 'no town large enough without a university': 'Keine ausreichend große Stadt ohne Universität',
  'no reformed church in or near our lands': 'Keine reformierte Kirche in oder nahe unserem Land', 'no need: the realm is calm and solvent': 'Nicht nötig: das Reich ist ruhig und zahlungsfähig',
  'most of our land must be of the Latin rite': 'Der Großteil unseres Landes muss dem lateinischen Ritus folgen', 'hold Moscow and Novgorod': 'Moskau und Nowgorod besitzen',
  'hold six of Cologne, Nuremberg, Hamburg, Berlin, Leipzig, Augsburg, Vienna, Munich, Mainz and Dresden': 'Sechs von Köln, Nürnberg, Hamburg, Berlin, Leipzig, Augsburg, Wien, München, Mainz und Dresden besitzen',
  'hold four of Rome, Milan, Naples, Florence, Venice and Turin': 'Vier von Rom, Mailand, Neapel, Florenz, Venedig und Turin besitzen',
  // ---- direction pass: refusals that had no German text yet, and the new batch and cancel commands
  'bad target': 'Ungültiges Ziel', 'unknown building': 'Unbekanntes Gebäude', 'unknown law': 'Unbekanntes Gesetz', 'unknown estate': 'Unbekannter Stand', 'unknown budget item': 'Unbekannter Haushaltsposten',
  'unknown command': 'Unbekannter Befehl', 'unknown dev action': 'Unbekannte Entwicklerhandlung', 'unknown option': 'Unbekannte Option', 'unknown branch': 'Unbekannter Wissenszweig', 'unknown doctrine': 'Unbekannte Doktrin',
  'unknown unit': 'Unbekannte Truppe', 'unknown landmark': 'Unbekanntes Wahrzeichen', 'already building': 'Wird schon gebaut', 'no such event': 'Kein solches Ereignis', 'unknown event': 'Unbekanntes Ereignis',
  'error': 'Fehler', 'not available': 'Nicht verfügbar', 'no siege': 'Keine Belagerung', 'assault repulsed': 'Sturm abgewehrt', 'we pay tribute to them': 'Wir zahlen ihnen Tribut',
  'need a fleet': 'Braucht eine Flotte', 'our navigators lack the knowledge (Commerce 6)': 'Unseren Seefahrern fehlt das Wissen (Handel 6)', 'choose a sea zone': 'Ein Seegebiet wählen',
  'cannot absorb another ruler': 'Kann keinen anderen Herrscher einverleiben', 'hold London and Edinburgh': 'London und Edinburgh besitzen', 'both crowns must exist': 'Beide Kronen müssen bestehen',
  'not before 1380': 'Nicht vor 1380', 'both crowns must be sovereign': 'Beide Kronen müssen souverän sein', 'not while they are at war': 'Nicht während sie im Krieg sind', 'the other crown must agree': 'Die andere Krone muss zustimmen',
  'relations are too poor': 'Die Beziehungen sind zu schlecht', 'the capital was moved recently': 'Die Hauptstadt wurde erst kürzlich verlegt', 'the capital is already our greatest town': 'Die Hauptstadt ist schon unsere größte Stadt',
  'the capital is still great enough': 'Die Hauptstadt ist noch groß genug', 'only from the Age of Confessions and Absolutism': 'Erst ab dem Zeitalter der Konfessionen und des Absolutismus',
  'the magnates are too powerful': 'Die Magnaten sind zu mächtig', 'hold three of Toledo, Zaragoza, Barcelona and Seville': 'Drei von Toledo, Saragossa, Barcelona und Sevilla besitzen',
  'nothing to do': 'Nichts zu tun', 'too many orders at once': 'Zu viele Befehle auf einmal', 'nothing under way': 'Nichts im Gange', 'not this kind of order': 'Nicht diese Art von Befehl',
  'no such goal': 'Kein solches Ziel', 'already achieved': 'Bereits erreicht', 'earlier goals come first': 'Erst die vorherigen Ziele', 'the conditions are not met': 'Die Bedingungen sind nicht erfüllt',
  // ---- truth pass (claude/truth-pass): production methods and tax instruments
  'unknown method': 'Unbekannte Produktionsweise', 'already in use': 'Bereits in Gebrauch', 'needs Commerce & Learning 6': 'Braucht Handel & Gelehrsamkeit 6', 'needs a manufactory': 'Braucht eine Manufaktur',
  'the workshops were reorganised recently': 'Die Werkstätten wurden erst kürzlich umgestellt',
  // ---- depth pass (claude/depth-pass): faith mechanics, AI budget and history, review fixes
  'already excommunicated': 'Schon gebannt', 'the pope cannot be excommunicated': 'Der Papst kann nicht gebannt werden', 'we are excommunicated ourselves': 'Wir sind selbst gebannt',
  'no other faith in our land': 'Kein anderer Glaube in unserem Land', 'little church land is left': 'Es ist kaum noch Kirchengut übrig',
  'the overlord forbids war among his tributaries': 'Der Oberherr duldet keinen Krieg unter seinen Tributpflichtigen',
  'no land of ours to win back': 'Sie halten kein Land von uns', 'they share our faith': 'Sie teilen unseren Glauben',
};

const NEED = /^need (\d+) (Authority|Mandate|Insight)$/;
const NEED_DE: Record<string, string> = { Authority: 'Autorität', Mandate: 'Mandat', Insight: 'Einsicht' };

/** A refusal in both languages: an I18n from the simulation passes through, a key is looked up (unknown keys stay English). */
export function refusal(e: string | I18n | null | undefined): I18n {
  if (!e) return { en: '', de: '' };
  if (typeof e !== 'string') return e;
  const en = e.charAt(0).toUpperCase() + e.slice(1);
  const de = REFUSAL_DE[e];
  if (de) return { en, de };
  const m = NEED.exec(e);
  if (m) return { en, de: `Braucht ${m[1]} ${NEED_DE[m[2]]}` };
  return { en, de: en };
}
/** True when refusal() knows a German text for this key (used by the content test). */
export function hasRefusalText(e: string): boolean { return !!REFUSAL_DE[e] || NEED.test(e); }
