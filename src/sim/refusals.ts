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
  // ---- war pass (claude/war-pass): war goals, peace terms, assaults and scorched earth
  'they are not our overlord': 'Sie sind nicht unser Oberherr', 'they hold no market': 'Sie halten keinen Markt',
  'that term does not fit the war goal': 'Diese Bedingung passt nicht zum Kriegsziel', 'that town does not fit the war goal': 'Dieser Ort passt nicht zum Kriegsziel',
  'they have no throne to give': 'Sie haben keinen Thron zu vergeben', 'our merchants were expelled from this market': 'Unsere Kaufleute wurden aus diesem Markt ausgewiesen',
  'no siege here': 'Hier gibt es keine Belagerung', 'the siege works are not ready': 'Die Belagerungswerke sind noch nicht bereit',
  'the troops need time before another assault': 'Die Truppen brauchen Zeit vor dem nächsten Sturm', 'already scorched': 'Schon verbrannt',
  'no enemy army near': 'Kein feindliches Heer in der Nähe',
  'invalid war goal': 'Ungültiges Kriegsziel', 'the freed realm is not their subject': 'Das befreite Reich ist nicht ihr Untertan',
  'their realm is too great to change its faith': 'Ihr Reich ist zu groß, um seinen Glauben zu wechseln',
  // ---- trade pass (claude/trade-pass): merchants, embargoes, expeditions and companies
  'we do not know this market': 'Diesen Markt kennen wir nicht', 'an embargo shuts our merchants out': 'Eine Handelssperre hält unsere Kaufleute fern',
  'too far from our home market': 'Zu weit von unserem Heimatmarkt', 'our merchants collect at home': 'Im Heimatmarkt sammeln unsere Kaufleute selbst',
  'no trade route home': 'Kein Handelsweg nach Hause', 'already under embargo': 'Schon mit einer Handelssperre belegt', 'not against an ally': 'Nicht gegen einen Verbündeten',
  'not within our realm': 'Nicht innerhalb unseres Reiches', 'no embargo to lift': 'Keine Handelssperre aufzuheben',
  'an ocean voyage needs Commerce 10': 'Eine Ozeanfahrt braucht Handel & Gelehrsamkeit 10', 'an ocean voyage needs the Age of Print and Horizons': 'Eine Ozeanfahrt braucht das Zeitalter von Druck und Horizonten',
  'two expeditions are already at sea': 'Schon zwei Expeditionen sind auf See',
  // ---- integration of the war and trade passes
  'a peace treaty forbids it': 'Ein Friedensvertrag verbietet es',
  // ---- realm pass (claude/realm-pass): the Empire and the league, great powers, assembly and government, situations
  'allied with the attackers': 'Mit den Angreifern verbündet', 'already a member': 'Schon Mitglied', 'already asked': 'Schon angefragt', 'already backed': 'Schon unterstützt',
  'already in this war': 'Schon in diesem Krieg', 'already ordered': 'Schon befohlen', 'already under their protection': 'Schon unter ihrem Schutz', 'at war with a member': 'Im Krieg mit einem Mitglied',
  'at war with them': 'Im Krieg mit ihnen', 'every reform has passed': 'Alle Reformen sind beschlossen', 'great powers protect themselves': 'Großmächte schützen sich selbst',
  'no call is pending': 'Kein Hilferuf offen', 'no demand is pending': 'Keine Forderung offen', 'no election is under way': 'Es findet keine Wahl statt', 'no order is pending': 'Kein Befehl offen',
  'no such league': 'Kein solcher Bund', 'no such request': 'Keine solche Bitte', 'no such situation': 'Keine solche Lage', 'no such target': 'Kein solches Ziel',
  'none of our places hold this faith': 'Keiner unserer Orte hängt diesem Glauben an', 'not a candidate': 'Kein Kandidat', 'not a great power': 'Keine Großmacht',
  'not a member of the Empire': 'Kein Glied des Reiches', 'not a member': 'Kein Mitglied', 'not a war between members': 'Kein Krieg zwischen Gliedern', 'not a war between realms': 'Kein Krieg zwischen Reichen',
  'not an elector': 'Kein Kurfürst', 'not enough imperial authority': 'Nicht genug Reichsautorität', 'not enough prestige': 'Nicht genug Ansehen', 'not possible at this stage': 'In dieser Phase nicht möglich',
  'not while the war is fought': 'Nicht während des Krieges', 'only Atlantic realms can do this': 'Nur atlantische Reiche können das', 'only Christian realms can do this': 'Nur christliche Reiche können das',
  'only a great power can do this': 'Nur eine Großmacht kann das', 'only free towns of the northern coasts may join': 'Nur freie Städte der nördlichen Küsten dürfen beitreten',
  'only kings and the emperor can do this': 'Nur Könige und der Kaiser können das', 'only monarchies can do this': 'Nur Monarchien können das', 'only realms of the Latin Church can do this': 'Nur Reiche der lateinischen Kirche können das',
  'only the French crown can do this': 'Nur die französische Krone kann das', 'only the Horde can do this': 'Nur die Horde kann das', 'only the emirate can do this': 'Nur das Emirat kann das',
  'only the emperor can do this': 'Nur der Kaiser kann das', 'only the two crowns can do this': 'Nur die beiden Kronen können das', 'subjects cannot do this': 'Untertanen können das nicht', 'subjects cannot join': 'Untertanen können nicht beitreten',
  'the Perpetual Peace forbids war between members': 'Der Ewige Landfriede verbietet Krieg zwischen Gliedern', 'the assembly refused the new taxes': 'Die Versammlung verweigerte die neuen Steuern',
  'the crown is hereditary': 'Die Krone ist erblich', 'the crown passes by inheritance': 'Die Krone geht durch Erbfolge über', 'the diet is already in session': 'Der Reichstag tagt bereits',
  'the diet is not in session': 'Der Reichstag tagt nicht', 'the diet met recently': 'Der Reichstag tagte erst kürzlich', 'the emperor is a party to this war': 'Der Kaiser ist Partei in diesem Krieg',
  'the situation has ended': 'Die Lage ist beendet', 'they cannot be swayed further': 'Sie lassen sich nicht weiter umstimmen', 'they declined to protect us': 'Sie lehnten ab, uns zu schützen',
  'too far from the frontier': 'Zu weit von der Grenze', 'unknown privilege': 'Unbekanntes Privileg', 'we asked them recently': 'Wir haben sie erst kürzlich gefragt',
  'we have a treaty with their enemies': 'Wir haben einen Vertrag mit ihren Feinden', 'we have a truce with the attackers': 'Wir haben einen Waffenstillstand mit den Angreifern',
  'we offered mediation recently': 'Wir boten erst kürzlich Vermittlung an',
  // ---- realm pass, review fixes: the Horde's actions, mediation offers and the league's calls to arms
  'no effect now': 'Zurzeit ohne Wirkung', 'a Horde held by a player does not break apart': 'Eine Horde in Spielerhand zerbricht nicht',
  'no mediation is offered': 'Keine Vermittlung angeboten', 'no call of the league is pending': 'Kein Ruf des Bundes offen',
  'the war is over': 'Der Krieg ist vorbei', 'too exhausted by war': 'Zu kriegsmüde',
  // ---- people pass: commanders ----
  'cannot lead an army': 'Kann kein Heer führen',
  // ---- polish pass (claude/polish-pass): developer tools
  'the event cannot happen now': 'Das Ereignis kann jetzt nicht eintreten',
  // ---- fix-people
  'they refused us recently': 'Sie haben uns erst kürzlich abgewiesen',
  'no abler candidate at court': 'Niemand am Hof wäre fähiger',
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
