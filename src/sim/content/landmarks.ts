// Landmarks: famous buildings of the age. Each stands in one location, gives its holder a national bonus that grows
// with every stage of building, and makes that place worth fighting over. Some are finished in 1356, some are still
// building sites (the cathedral of Cologne, the dome of Florence) that a realm can complete.
import type { I18n } from '../types';

export interface LandmarkDef {
  id: string;
  name: I18n;
  desc: I18n;
  place: string;                    // location name on the map
  kind: 'church' | 'mosque' | 'palace' | 'fortress';
  built: number;                    // stage reached by 1 January 1356 (0 = a building site)
  max: number;                      // highest stage
  fx: Record<string, number>;       // national effects per stage
  prestige: number;                 // prestige per month per stage
}

export const LANDMARKS: LandmarkDef[] = [
  { id: 'hagia_sophia', place: 'Constantinople', kind: 'church', built: 2, max: 3, prestige: 0.12,
    name: { en: 'Hagia Sophia', de: 'Hagia Sophia' }, desc: { en: 'The Church of Holy Wisdom, for nine centuries the greatest dome in Christendom.', de: 'Die Kirche der Heiligen Weisheit, seit neun Jahrhunderten die größte Kuppel der Christenheit.' },
    fx: { mandate_gain: 0.03, conversion: 0.05, trade: 0.03 } },
  { id: 'alhambra', place: 'Granada', kind: 'palace', built: 2, max: 3, prestige: 0.08,
    name: { en: 'The Alhambra', de: 'Die Alhambra' }, desc: { en: 'The red palace of the Nasrid emirs above Granada, its courts still growing under Yusuf I and Muhammad V.', de: 'Der rote Palast der Nasriden-Emire über Granada, dessen Höfe unter Yusuf I. und Muhammad V. noch wachsen.' },
    fx: { concord_gain: 0.04, tax: 0.03, fort_strength: 0.05 } },
  { id: 'notre_dame', place: 'Paris', kind: 'church', built: 3, max: 3, prestige: 0.1,
    name: { en: 'Notre-Dame de Paris', de: 'Notre-Dame de Paris' }, desc: { en: 'The cathedral on the island of the Seine, finished at last in 1345.', de: 'Die Kathedrale auf der Seine-Insel, 1345 endlich vollendet.' },
    fx: { mandate_gain: 0.02, research: 0.03, concord_gain: 0.02 } },
  { id: 'kremlin', place: 'Moscow', kind: 'fortress', built: 1, max: 3, prestige: 0.06,
    name: { en: 'The Kremlin', de: 'Der Kreml' }, desc: { en: 'The fortress of the princes of Moscow, still of oak; white stone walls are planned.', de: 'Die Festung der Moskauer Fürsten, noch aus Eichenholz; Mauern aus weißem Stein sind geplant.' },
    fx: { fort_strength: 0.1, manpower: 0.06, mandate_gain: 0.02 } },
  { id: 'st_marks', place: 'Venice', kind: 'church', built: 2, max: 3, prestige: 0.08,
    name: { en: "St Mark's Basilica", de: 'Markusdom' }, desc: { en: 'The golden church of the Republic, beside the Doge’s palace.', de: 'Die goldene Kirche der Republik neben dem Dogenpalast.' },
    fx: { trade: 0.06, naval: 0.05 } },
  { id: 'cologne_cathedral', place: 'Cologne', kind: 'church', built: 0, max: 3, prestige: 0.1,
    name: { en: 'Cologne Cathedral', de: 'Kölner Dom' }, desc: { en: 'Begun in 1248 for the relics of the Three Kings; only the choir stands. Whoever finishes it will be remembered.', de: '1248 für die Reliquien der Heiligen Drei Könige begonnen; nur der Chor steht. Wer ihn vollendet, wird nicht vergessen.' },
    fx: { conversion: 0.04, mandate_gain: 0.03, trade: 0.02 } },
  { id: 'st_peters', place: 'Rome', kind: 'church', built: 1, max: 3, prestige: 0.12,
    name: { en: "St Peter's Basilica", de: 'Petersdom' }, desc: { en: 'The old basilica over the apostle’s tomb, neglected while the popes sit in Avignon.', de: 'Die alte Basilika über dem Grab des Apostels, vernachlässigt, solange die Päpste in Avignon sitzen.' },
    fx: { mandate_gain: 0.03, conversion: 0.05 } },
  { id: 'papal_palace', place: 'Avignon', kind: 'palace', built: 2, max: 3, prestige: 0.08,
    name: { en: 'Palace of the Popes', de: 'Papstpalast' }, desc: { en: 'The fortress-palace of the popes on the Rhône.', de: 'Der Festungspalast der Päpste an der Rhône.' },
    fx: { tax: 0.04, mandate_gain: 0.02 } },
  { id: 'st_vitus', place: 'Prague', kind: 'church', built: 1, max: 3, prestige: 0.08,
    name: { en: 'St Vitus Cathedral', de: 'Veitsdom' }, desc: { en: 'Charles IV’s new cathedral on the castle hill, begun in 1344.', de: 'Karls IV. neue Kathedrale auf dem Burgberg, 1344 begonnen.' },
    fx: { research: 0.04, tax: 0.02, mandate_gain: 0.02 } },
  { id: 'wawel', place: 'Kraków', kind: 'fortress', built: 1, max: 3, prestige: 0.06,
    name: { en: 'Wawel Castle', de: 'Wawel' }, desc: { en: 'The royal castle and cathedral of the Polish kings on the Vistula.', de: 'Burg und Kathedrale der polnischen Könige an der Weichsel.' },
    fx: { concord_gain: 0.03, fort_strength: 0.06 } },
  { id: 'canterbury', place: 'Canterbury', kind: 'church', built: 2, max: 3, prestige: 0.07,
    name: { en: 'Canterbury Cathedral', de: 'Kathedrale von Canterbury' }, desc: { en: 'Seat of the primate of England and shrine of St Thomas, goal of countless pilgrims.', de: 'Sitz des Primas von England und Schrein des heiligen Thomas, Ziel unzähliger Pilger.' },
    fx: { mandate_gain: 0.02, conversion: 0.04, trade: 0.02 } },
  { id: 'santiago', place: 'Santiago de Compostela', kind: 'church', built: 2, max: 3, prestige: 0.08,
    name: { en: 'Cathedral of Santiago', de: 'Kathedrale von Santiago' }, desc: { en: 'The tomb of St James at the end of the great pilgrim road.', de: 'Das Grab des heiligen Jakobus am Ende des großen Pilgerwegs.' },
    fx: { trade: 0.03, conversion: 0.04, mandate_gain: 0.02 } },
  { id: 'holy_sepulchre', place: 'Jerusalem', kind: 'church', built: 2, max: 3, prestige: 0.12,
    name: { en: 'Church of the Holy Sepulchre', de: 'Grabeskirche' }, desc: { en: 'The church over Golgotha and the empty tomb, shared uneasily by the Christian rites.', de: 'Die Kirche über Golgatha und dem leeren Grab, unruhig geteilt von den christlichen Riten.' },
    fx: { conversion: 0.05, mandate_gain: 0.03 } },
  { id: 'al_azhar', place: 'Cairo', kind: 'mosque', built: 2, max: 3, prestige: 0.1,
    name: { en: 'Al-Azhar', de: 'Al-Azhar' }, desc: { en: 'Mosque and school of Cairo, the first seat of learning of the Islamic world.', de: 'Moschee und Lehranstalt Kairos, die erste Stätte der Gelehrsamkeit der islamischen Welt.' },
    fx: { research: 0.05, conversion: 0.03 } },
  { id: 'aachen', place: 'Aachen', kind: 'church', built: 2, max: 3, prestige: 0.07,
    name: { en: 'Palatine Chapel of Aachen', de: 'Aachener Pfalzkapelle' }, desc: { en: 'Charlemagne’s chapel, where the kings of the Romans are crowned.', de: 'Karls des Großen Kapelle, in der die römischen Könige gekrönt werden.' },
    fx: { mandate_gain: 0.03, concord_gain: 0.02 } },
  { id: 'florence_duomo', place: 'Florence', kind: 'church', built: 1, max: 3, prestige: 0.09,
    name: { en: 'Santa Maria del Fiore', de: 'Santa Maria del Fiore' }, desc: { en: 'Florence’s cathedral, its walls rising; no one yet knows how to raise the dome.', de: 'Der Dom von Florenz, dessen Mauern wachsen; noch weiß niemand, wie die Kuppel zu wölben ist.' },
    fx: { research: 0.04, trade: 0.03 } },
  { id: 'marienburg', place: 'Marienburg', kind: 'fortress', built: 2, max: 3, prestige: 0.06,
    name: { en: 'Castle of Marienburg', de: 'Marienburg' }, desc: { en: 'The brick fortress of the Teutonic Order’s grand master, the largest castle of the age.', de: 'Die Backsteinfestung des Hochmeisters des Deutschen Ordens, die größte Burg ihrer Zeit.' },
    fx: { fort_strength: 0.12, morale: 0.03 } },
  { id: 'westminster', place: 'London', kind: 'church', built: 2, max: 3, prestige: 0.08,
    name: { en: 'Westminster Abbey', de: 'Westminster Abbey' }, desc: { en: 'Abbey of the coronations and royal tombs of England, beside the king’s palace and his exchequer.', de: 'Abtei der Krönungen und Königsgräber Englands, neben dem Palast des Königs und seiner Schatzkammer.' },
    fx: { tax: 0.03, concord_gain: 0.02, mandate_gain: 0.02 } },
  { id: 'mezquita', place: 'Córdoba', kind: 'church', built: 2, max: 3, prestige: 0.07,
    name: { en: 'Great Mosque of Córdoba', de: 'Mezquita von Córdoba' }, desc: { en: 'The forest of arches of the caliphs, a cathedral since 1236.', de: 'Der Säulenwald der Kalifen, seit 1236 eine Kathedrale.' },
    fx: { research: 0.03, conversion: 0.03, trade: 0.02 } },
  { id: 'umayyad_mosque', place: 'Damascus', kind: 'mosque', built: 2, max: 3, prestige: 0.08,
    name: { en: 'Great Mosque of Damascus', de: 'Umayyaden-Moschee' }, desc: { en: 'The mosque of the Umayyad caliphs, with its golden mosaics of paradise.', de: 'Die Moschee der Umayyaden-Kalifen mit ihren goldenen Mosaiken des Paradieses.' },
    fx: { conversion: 0.04, trade: 0.03 } },
  { id: 'krak', place: 'Krak des Chevaliers', kind: 'fortress', built: 2, max: 3, prestige: 0.05,
    name: { en: 'Krak des Chevaliers', de: 'Krak des Chevaliers' }, desc: { en: 'The crusaders’ mountain fortress over the Homs gap, in Mamluk hands since 1271.', de: 'Die Bergfestung der Kreuzfahrer über der Senke von Homs, seit 1271 in mamlukischer Hand.' },
    fx: { fort_strength: 0.1, manpower: 0.05 } },
  { id: 'alcazar_seville', place: 'Seville', kind: 'palace', built: 1, max: 3, prestige: 0.07,
    name: { en: 'Alcázar of Seville', de: 'Alcázar von Sevilla' }, desc: { en: 'The royal palace of Seville, which King Pedro is rebuilding in the Moorish style.', de: 'Der Königspalast von Sevilla, den König Pedro im maurischen Stil neu errichten lässt.' },
    fx: { trade: 0.04, tax: 0.02 } },
];

/** Cost of the next stage in gold (before the price level). */
export const landmarkCost = (def: LandmarkDef, tier: number) => 3000 * (tier + 1) * (def.kind === 'fortress' ? 0.8 : 1);
export const LANDMARK_MONTHS = 36;
