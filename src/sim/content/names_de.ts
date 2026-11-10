// German forms of place names. The map data carries one historical name per place (mostly the English or local form);
// German players read the established German exonyms instead. Unlisted names stay as they are.
export const PLACE_DE: Record<string, string> = {
  // trade markets named after their fair or with their town (fix-econ)
  'Champagne Fairs (Troyes)': 'Champagnemessen (Troyes)', 'Hajji Tarkhan (Astrakhan)': 'Hadschi Tarchan (Astrachan)',
  'Cape of Good Hope (Table Bay)': 'Kap der Guten Hoffnung (Tafelbucht)', Mogadishu: 'Mogadischu', Havana: 'Havanna', Bolghar: 'Bolgar', Urgench: 'Urgentsch',
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
};
const PREFIX: [RegExp, string][] = [
  [/^Kingdom of /, 'Königreich '], [/^Emirate of /, 'Emirat '], [/^Duchy of /, 'Herzogtum '], [/^County of /, 'Grafschaft '],
  [/^Archbishopric of /, 'Erzbistum '], [/^Bishopric of /, 'Bistum '], [/^Imperial City of /, 'Reichsstadt '], [/^Signoria of /, 'Signoria '],
  [/^Principality of /, 'Fürstentum '], [/^Margraviate of /, 'Markgrafschaft '], [/^Sultanate of /, 'Sultanat '], [/^Lordship of /, 'Herrschaft '],
  [/^Republic of /, 'Republik '], [/^Grand Duchy of /, 'Großherzogtum '], [/^Isle of /, 'Insel '], [/ Sultanate$/, '-Sultanat'],
];
const cache = new Map<string, string>();
/** German form of a place or province name ("Bohemia – Plzeň" → "Böhmen – Pilsen", "Kingdom of Seville" → "Königreich Sevilla"). */
export function deName(en: string | null | undefined): string {
  if (!en) return en ?? '';
  const hit = cache.get(en); if (hit !== undefined) return hit;
  let out: string;
  if (PLACE_DE[en]) out = PLACE_DE[en];
  else if (en.includes(' – ')) out = en.split(' – ').map(deName).join(' – ');
  else {
    out = en;
    for (const [re, de] of PREFIX) if (re.test(out)) { out = out.replace(re, de); break; }
    out = out.split(' ').map((w) => PLACE_DE[w] ?? w).join(' ');
  }
  cache.set(en, out);
  return out;
}
