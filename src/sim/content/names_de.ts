// German forms of place names. The map data carries one historical name per place (mostly the English or local form);
// German players read the established German exonyms instead. Unlisted names stay as they are.
export const PLACE_DE: Record<string, string> = {
  // cities
  Cologne: 'Köln', Vienna: 'Wien', Venice: 'Venedig', Milan: 'Mailand', Florence: 'Florenz', Naples: 'Neapel', Rome: 'Rom',
  Lisbon: 'Lissabon', Prague: 'Prag', Warsaw: 'Warschau', Moscow: 'Moskau', Constantinople: 'Konstantinopel', Munich: 'München',
  Nuremberg: 'Nürnberg', Brussels: 'Brüssel', Antwerp: 'Antwerpen', Bruges: 'Brügge', Geneva: 'Genf', Genoa: 'Genua',
  Kraków: 'Krakau', Strasbourg: 'Straßburg', Lucerne: 'Luzern', Copenhagen: 'Kopenhagen', Belgrade: 'Belgrad', Buda: 'Ofen',
  Athens: 'Athen', Cairo: 'Kairo', Alexandria: 'Alexandria', Damascus: 'Damaskus', Baghdad: 'Bagdad', Algiers: 'Algier',
  Saragossa: 'Saragossa', Zaragoza: 'Saragossa', Córdoba: 'Córdoba', Hanover: 'Hannover', Brunswick: 'Braunschweig',
  Mantua: 'Mantua', Padua: 'Padua', Rhodes: 'Rhodos', Trento: 'Trient', Adrianople: 'Adrianopel', Thessalonica: 'Thessaloniki',
  Smyrna: 'Smyrna', Nicosia: 'Nikosia', Kiev: 'Kiew', Novgorod: 'Nowgorod', Pskov: 'Pskow', Tver: 'Twer', Ryazan: 'Rjasan',
  Smolensk: 'Smolensk', Kazan: 'Kasan', Vilnius: 'Wilna', Vilna: 'Wilna', Poznań: 'Posen', Gniezno: 'Gnesen', Toruń: 'Thorn',
  Olomouc: 'Olmütz', Brno: 'Brünn', 'České Budějovice': 'Budweis', 'Hradec Králové': 'Königgrätz', Plzeň: 'Pilsen',
  Ljubljana: 'Laibach', Zagreb: 'Agram', Bratislava: 'Pressburg', Sopron: 'Ödenburg', Győr: 'Raab', Esztergom: 'Gran',
  Pécs: 'Fünfkirchen', Kassa: 'Kaschau', Košice: 'Kaschau', Kolozsvár: 'Klausenburg', 'Cluj': 'Klausenburg', Sibiu: 'Hermannstadt',
  Brașov: 'Kronstadt', Timișoara: 'Temeswar', Liège: 'Lüttich', Leuven: 'Löwen', Mechelen: 'Mecheln', 'The Hague': 'Den Haag',
  Nijmegen: 'Nimwegen', Arnhem: 'Arnheim', Maastricht: 'Maastricht', Metz: 'Metz', Nancy: 'Nancy', Besançon: 'Bisanz',
  Mulhouse: 'Mülhausen', Colmar: 'Colmar', Turin: 'Turin', Verona: 'Verona', Trieste: 'Triest', Gorizia: 'Görz', Aquileia: 'Aquileja',
  Bolzano: 'Bozen', Merano: 'Meran', Brixen: 'Brixen', Constance: 'Konstanz', Ratisbon: 'Regensburg', Passau: 'Passau',
  Gdańsk: 'Danzig', Wrocław: 'Breslau', Szczecin: 'Stettin', Kaliningrad: 'Königsberg', Tallinn: 'Reval', Tartu: 'Dorpat',
  Seville: 'Sevilla', Corunna: 'La Coruña', Majorca: 'Mallorca', Minorca: 'Menorca', Sicily: 'Sizilien',
  Sardinia: 'Sardinien', Corsica: 'Korsika', Crete: 'Kreta', Cyprus: 'Zypern', Malta: 'Malta', Jerusalem: 'Jerusalem',
  Antioch: 'Antiochia', Aleppo: 'Aleppo', Tripoli: 'Tripolis', Acre: 'Akkon', Jaffa: 'Jaffa', Trebizond: 'Trapezunt',
  Caffa: 'Kaffa', Tana: 'Tana', Sarai: 'Sarai', Astrakhan: 'Astrachan', Tabriz: 'Täbris', Mecca: 'Mekka', Medina: 'Medina',
  Carthage: 'Karthago', Fez: 'Fès', Marrakesh: 'Marrakesch', Timbuktu: 'Timbuktu', Avignon: 'Avignon', Rheims: 'Reims',
  Dunkirk: 'Dünkirchen', Calais: 'Calais', Dover: 'Dover', Edinburgh: 'Edinburgh', Dublin: 'Dublin', Bergen: 'Bergen',
  Gothenburg: 'Göteborg', Uppsala: 'Uppsala', Turku: 'Åbo', Vyborg: 'Wiborg', Narva: 'Narwa', Polotsk: 'Polozk', Vitebsk: 'Witebsk',
  Lviv: 'Lemberg', Lwów: 'Lemberg', Przemyśl: 'Przemyśl', Lublin: 'Lublin', Płock: 'Plock', Elbląg: 'Elbing', Malbork: 'Marienburg',
  Chełmno: 'Kulm', Kołobrzeg: 'Kolberg', Legnica: 'Liegnitz', Opole: 'Oppeln', Racibórz: 'Ratibor', Cieszyn: 'Teschen',
  Opava: 'Troppau', Cheb: 'Eger', 'Karlovy Vary': 'Karlsbad', 'Kutná Hora': 'Kuttenberg', Jihlava: 'Iglau', Znojmo: 'Znaim', Žatec: 'Saaz',
  Litoměřice: 'Leitmeritz', Bautzen: 'Bautzen', Görlitz: 'Görlitz', Frankfurt: 'Frankfurt', Ghent: 'Gent',
  // lands, used inside province names
  Normandy: 'Normandie', Flanders: 'Flandern', Burgundy: 'Burgund', Brittany: 'Bretagne', Bohemia: 'Böhmen', Moravia: 'Mähren',
  Silesia: 'Schlesien', Bavaria: 'Bayern', Swabia: 'Schwaben', Saxony: 'Sachsen', Austria: 'Österreich', Styria: 'Steiermark',
  Carinthia: 'Kärnten', Carniola: 'Krain', Tyrol: 'Tirol', Franconia: 'Franken', Thuringia: 'Thüringen', Hesse: 'Hessen',
  Westphalia: 'Westfalen', Pomerania: 'Pommern', Prussia: 'Preußen', Livonia: 'Livland', Courland: 'Kurland', Estonia: 'Estland',
  Lithuania: 'Litauen', Poland: 'Polen', Hungary: 'Ungarn', Transylvania: 'Siebenbürgen', Wallachia: 'Walachei', Moldavia: 'Moldau',
  Serbia: 'Serbien', Bosnia: 'Bosnien', Croatia: 'Kroatien', Dalmatia: 'Dalmatien', Albania: 'Albanien', Bulgaria: 'Bulgarien',
  Macedonia: 'Makedonien', Thrace: 'Thrakien', Thessaly: 'Thessalien', Morea: 'Morea', Epirus: 'Epirus', Greece: 'Griechenland',
  Anatolia: 'Anatolien', Syria: 'Syrien', Egypt: 'Ägypten', Arabia: 'Arabien', Persia: 'Persien', Armenia: 'Armenien', Georgia: 'Georgien',
  Crimea: 'Krim', Lombardy: 'Lombardei', Tuscany: 'Toskana', Piedmont: 'Piemont', Savoy: 'Savoyen', Calabria: 'Kalabrien',
  Apulia: 'Apulien', Castile: 'Kastilien', Aragon: 'Aragonien', Catalonia: 'Katalonien', Navarre: 'Navarra',
  Andalusia: 'Andalusien', Galicia: 'Galicien', Portugal: 'Portugal', England: 'England', Scotland: 'Schottland', Ireland: 'Irland',
  Wales: 'Wales', Cornwall: 'Cornwall', Denmark: 'Dänemark', Norway: 'Norwegen', Sweden: 'Schweden', Finland: 'Finnland',
  Iceland: 'Island', Holland: 'Holland', Zeeland: 'Seeland', Frisia: 'Friesland', Brabant: 'Brabant', Hainaut: 'Hennegau',
  Luxembourg: 'Luxemburg', Lorraine: 'Lothringen', Alsace: 'Elsass', Champagne: 'Champagne', Picardy: 'Picardie', Gascony: 'Gascogne',
  Guyenne: 'Guyenne', Languedoc: 'Languedoc', Provence: 'Provence', Dauphiné: 'Dauphiné', Auvergne: 'Auvergne', Anjou: 'Anjou',
  'Île-de-France': 'Île-de-France', Morocco: 'Marokko', Tunisia: 'Tunesien', Libya: 'Libyen', Nubia: 'Nubien', Ethiopia: 'Äthiopien',
  Byzantine: 'Byzantinisches', Mamluk: 'Mamlukisches', Marinid: 'Marinidisches', Ottoman: 'Osmanisches',
  Dobruja: 'Dobrudscha', Gazaria: 'Gasarien',
};
const PREFIX: [RegExp, string][] = [
  [/^Kingdom of /, 'Königreich '], [/^Emirate of /, 'Emirat '], [/^Duchy of /, 'Herzogtum '], [/^County of /, 'Grafschaft '],
  [/^Archbishopric of /, 'Erzbistum '], [/^Bishopric of /, 'Bistum '], [/^Imperial City of /, 'Reichsstadt '], [/^Signoria of /, 'Signoria '],
  [/^Principality of /, 'Fürstentum '], [/^Margraviate of /, 'Markgrafschaft '], [/^Sultanate of /, 'Sultanat '], [/^Lordship of /, 'Herrschaft '],
  [/^Republic of /, 'Republik '], [/^Grand Duchy of /, 'Großherzogtum '], [/^Isle of /, 'Insel '], [/ Sultanate$/, '-Sultanat'],
];
// ---- fix-people: seas, gulfs and straits, and the realms of the Levant, in German ("Atlantic Ocean (North) 3" →
// "Atlantischer Ozean (Nord) 3", "Venetian Crete" → "Venezianisches Kreta", "Despotate of the Morea" → "Despotat Morea")
const WATER_DE: Record<string, string> = {
  'Adriatic Sea': 'Adriatisches Meer', 'Aegean Sea': 'Ägäisches Meer', 'Alboran Sea': 'Alborán-Meer', 'Arabian Sea': 'Arabisches Meer',
  'Atlantic Ocean': 'Atlantischer Ozean', 'Baffin Bay': 'Baffinbucht', 'Balearic Sea': 'Balearisches Meer', 'Baltic Sea': 'Ostsee',
  'Barents Sea': 'Barentssee', 'Bay of Biscay': 'Golf von Biskaya', 'Bay of Campeche': 'Golf von Campeche', 'Bay of Mecklenburg': 'Mecklenburger Bucht',
  'Bight of Benin': 'Bucht von Benin', 'Bight of Biafra': 'Bucht von Biafra', 'Black Sea': 'Schwarzes Meer', 'Bristol Channel': 'Bristolkanal',
  'Caribbean Sea': 'Karibisches Meer', 'Caspian Sea': 'Kaspisches Meer', 'Cumberland Sound': 'Cumberland-Sund', 'Davis Strait': 'Davisstraße',
  'Denmark Strait': 'Dänemarkstraße', 'Disko Bay': 'Diskobucht', 'Eclipse Sound': 'Eclipse-Sund', 'English Channel': 'Ärmelkanal',
  'Florida Strait': 'Floridastraße', 'Foxe Basin': 'Foxe-Becken', 'Greenland Sea': 'Grönlandsee', 'Gulf of Aden': 'Golf von Aden',
  'Gulf of Aqaba': 'Golf von Akaba', 'Gulf of Boothia': 'Golf von Boothia', 'Gulf of Bothnia': 'Bottnischer Meerbusen', 'Gulf of Finland': 'Finnischer Meerbusen',
  'Gulf of Gabès': 'Golf von Gabès', 'Gulf of Guinea': 'Golf von Guinea', 'Gulf of Lion': 'Golfe du Lion', 'Gulf of Maine': 'Golf von Maine',
  'Gulf of Mexico': 'Golf von Mexiko', 'Gulf of Ob': 'Obbusen', 'Gulf of Oman': 'Golf von Oman', 'Gulf of Riga': 'Rigaischer Meerbusen',
  'Gulf of Saint Lawrence': 'Sankt-Lorenz-Golf', 'Gulf of Sidra': 'Große Syrte', 'Gulf of Suez': 'Golf von Suez', 'Hudson Bay': 'Hudson Bay',
  'Hudson Strait': 'Hudsonstraße', 'Indian Ocean': 'Indischer Ozean', 'Ionian Sea': 'Ionisches Meer', 'Irish Sea': 'Irische See',
  'James Bay': 'James Bay', 'Kara Sea': 'Karasee', 'Labrador Sea': 'Labradorsee', 'Ligurian Sea': 'Ligurisches Meer', 'Marajó Bay': 'Marajó-Bucht',
  'Mediterranean Sea': 'Mittelmeer', 'Mozambique Channel': 'Straße von Mosambik', 'Mozambique Island': 'Insel Mosambik', 'North Sea': 'Nordsee',
  'Northwest Passage': 'Nordwestpassage', 'Norwegian Sea': 'Europäisches Nordmeer', 'Pacific Ocean': 'Pazifischer Ozean', 'Persian Gulf': 'Persischer Golf',
  'Red Sea': 'Rotes Meer', 'Saint Lawrence River': 'Sankt-Lorenz-Strom', 'Sargasso Sea': 'Sargassosee', 'Scoresby Sound': 'Scoresbysund',
  'Sea of Crete': 'Kretisches Meer', 'Sea of the Hebrides': 'See der Hebriden', 'Tyrrhenian Sea': 'Tyrrhenisches Meer', 'Ungava Bay': 'Ungava-Bucht',
  'Wadden Sea': 'Wattenmeer', 'White Sea': 'Weißes Meer', 'Debre Island': 'Insel Debre', 'Mbanza Island': 'Insel Mbanza', 'Great Island': 'Große Insel',
  'Tripoli of Barbary': 'Tripolis in der Berberei', 'Duchy of the Archipelago': 'Herzogtum des Archipels', 'Lordship of the Isles': 'Herrschaft der Inseln',
};
const COMPASS_DE: Record<string, string> = { North: 'Nord', South: 'Süd', East: 'Ost', West: 'West', 'North-East': 'Nordost', 'North-West': 'Nordwest', 'South-East': 'Südost', 'South-West': 'Südwest', Central: 'Mitte' };
/** "Atlantic Ocean (North) 3": the water, the quarter and the number, each in German. */
function waterDe(en: string): string | null {
  const m = /^(.+?)(?: \(([^)]+)\))?( \d+)?$/.exec(en); if (!m) return null;
  const base = WATER_DE[m[1]]; if (!base) return null;
  return `${base}${m[2] ? ` (${COMPASS_DE[m[2]] ?? m[2]})` : ''}${m[3] ?? ''}`;
}
/** Held by Venice or Genoa ("Venetian Crete"): the adjective in German, the place in German. */
const HELD_DE: [RegExp, string][] = [[/^Venetian /, 'Venezianisches '], [/^Genoese /, 'Genuesisches '], [/^Despotate of the /, 'Despotat '], [/^Despotate of /, 'Despotat ']];
const cache = new Map<string, string>();
/** German form of a place or province name ("Bohemia – Plzeň" → "Böhmen – Pilsen", "Kingdom of Seville" → "Königreich Sevilla"). */
export function deName(en: string | null | undefined): string {
  if (!en) return en ?? '';
  const hit = cache.get(en); if (hit !== undefined) return hit;
  let out: string;
  const water = waterDe(en);
  if (PLACE_DE[en]) out = PLACE_DE[en];
  else if (water) out = water;
  else if (en.includes(' – ')) out = en.split(' – ').map(deName).join(' – ');
  else if (HELD_DE.some(([re]) => re.test(en))) { const [re, de] = HELD_DE.find(([r]) => r.test(en))!; out = de + deName(en.replace(re, '')); }
  else {
    out = en;
    for (const [re, de] of PREFIX) if (re.test(out)) { out = out.replace(re, de); break; }
    out = out.split(' ').map((w) => PLACE_DE[w] ?? w).join(' ');
  }
  cache.set(en, out);
  return out;
}
