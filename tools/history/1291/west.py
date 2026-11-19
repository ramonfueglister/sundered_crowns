"""Western Europe on 1 January 1291: British Isles, France, Low Countries, Iberia."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from lib import N, R, S, WAR, write

SOURCES = [
    "Euratlas-Nüssli, Euratlas Periodis: Europe in the year 1300 (sovereign and dependent states)",
    "W. R. Shepherd, Historical Atlas (1923), 'Europe and the Mediterranean Lands about 1300' and 'France 1154-1328'",
    "Handbook of British Chronology (3rd ed., 1986): rulers of England, Scotland, Ireland",
    "M. Prestwich, Edward I (1988): Wales 1283, Gascony and the treaties of Amiens 1279 and Paris 1286, Isle of Man 1290, the Great Cause",
    "A New History of Ireland vol. II (1987) and vol. IX (maps, genealogies, succession lists)",
    "J. R. Strayer, The Reign of Philip the Fair (1980): royal domain, Champagne and Navarre through Joan I, Anjou to Charles of Valois 1290",
    "J. F. O'Callaghan, A History of Medieval Spain (1975); J. F. O'Callaghan, The Gibraltar Crusade (2011), ch. 4-5: Marinid Algeciras, Tarifa, Ronda until 1292-95",
    "L. P. Harvey, Islamic Spain 1250-1500 (1990): Granada under Muhammad II, Málaga 1279, Guadix 1288",
    "D. Abulafia, The Western Mediterranean Kingdoms 1200-1500 (1997): Crown of Aragon, Majorca 1285-98",
]
NOTES = [
    "Date: 1 January 1291. Edward I holds England, the conquered principality of Wales, Gascony with the Agenais (Amiens 1279), Ponthieu (inherited by Edward of Caernarfon at Eleanor of Castile's death, 28 Nov 1290), the Channel Islands and, since June 1290, the Isle of Man.",
    "Scotland is in interregnum after Margaret, Maid of Norway, died in autumn 1290; the Guardians govern. Berwick is Scottish until 1296.",
    "The Anglo-Irish earldoms of 1356 (Desmond 1329, Ormond 1328, Kildare 1316) did not exist yet; the colonial lordships are part of Edward I's Lordship of Ireland.",
    "Navarre and Champagne belong to Queen Joan I and her husband Philip IV; Champagne is modelled as part of France, Navarre as its own kingdom in personal union.",
    "Philip IV ceded his half of Avignon to Charles II of Anjou in 1290; Avignon is Provençal, the Comtat Venaissin papal (since 1274).",
    "The Kingdom of Majorca of James II is reduced to Roussillon, Cerdanya and Montpellier: Alfonso III of Aragon took Mallorca (1285), Ibiza (1286) and Menorca (January 1287).",
    "Alicante, Elche and Orihuela belong to Castile until 1296; Riba-Côa (Sabugal, Castelo Rodrigo) and Olivenza to Castile until the Treaty of Alcañices 1297.",
    "Algeciras, Tarifa, Gibraltar and Ronda are Marinid (ceded by Granada 1275); Tarifa falls to Castile in October 1292.",
    "Gaelic rulers' names follow the Annals of Connacht and NHI IX; where the succession is disputed the ruler is left out.",
]

states = [
S('england', inherit=True, cap='London',
  hold='York;Winchester;Lincoln;Norwich;Bristol;Exeter;Chester;Carlisle;Newcastle upon Tyne;Durham;Shrewsbury;Hereford;Gloucester;Oxford;Cambridge;Canterbury;Dover;Southampton;Plymouth;Nottingham;Leicester;Coventry;Worcester;Bath;Salisbury;Ipswich;King\'s Lynn;Hull;Lancaster;'
       'Caernarfon;Conwy;Harlech;Beaumaris@53.264,-4.09;Aberystwyth;Carmarthen;Cardigan;Pembroke;Cardiff;Swansea;Brecon;Montgomery;Denbigh;Flint;'
       'Bordeaux;Bayonne;Dax;Saint-Sever;Agen;Libourne;Bazas;Saint-Émilion;La Réole;'
       'Abbeville;St Helier;St Peter Port;Castletown;'
       'Dublin;Waterford;Wexford;Cork;Limerick;Kilkenny;Drogheda;Dundalk;Carrickfergus;Athlone;Galway;Trim;Kildare;Youghal;Kinsale;Downpatrick;Roscommon;Sligo',
  ruler=R('Edward I', 1239, 'Plantagenet'), heir=R('Edward of Caernarfon', 1284, 'Plantagenet'), consort=None,
  note='House of Plantagenet. Queen Eleanor of Castile died on 28 November 1290. Edward I is Lord of Ireland, Duke of Aquitaine and, for his son, holds Ponthieu.',
  allies='flanders holland brabant guelders', rivals='france', claims='scotland', pers='conqueror', diff=2,
  en='Edward I has conquered Wales and sits as arbiter of the Scottish succession after the death of the Maid of Norway.',
  de='Eduard I. hat Wales erobert und soll nach dem Tod der Maid von Norwegen über die schottische Thronfolge entscheiden.'),
S('scotland', inherit=True, cap='Perth',
  hold='Edinburgh;Stirling;Scone;Aberdeen;Inverness;Dundee;Glasgow;Dumfries;Berwick-upon-Tweed;Roxburgh;Elgin;Dingwall;Ayr;Lanark;St Andrews;Dunfermline;Kirkcudbright;Wigtown;Forfar;Banff;Dunstaffnage@56.451,-5.437;Finlaggan;Stornoway;Portree;Tarbert@55.864,-5.413;Rothesay;Wick',
  ruler=R('Guardians of Scotland (William Fraser, Robert Wishart, John Comyn, James the Steward)'), heir=None, consort=None,
  note='Interregnum: Margaret, Maid of Norway, died in Orkney in autumn 1290. Thirteen claimants; Edward I is asked to judge (the Great Cause, Norham 1291).',
  allies='norway', rivals='england', claims='', pers='diplomat', diff=3,
  en='Scotland has no king. The Guardians must choose between Balliol and Bruce, with Edward I of England as arbiter.',
  de='Schottland hat keinen König. Die Guardians müssen zwischen Balliol und Bruce wählen, mit Eduard I. von England als Schiedsrichter.'),
S('tir_eoghain', inherit=True, cap='Dungannon', hold='Armagh;Omagh;Coleraine@55.133,-6.667', ruler=None, note='Uí Néill; the kingship is disputed between Domnall mac Briain and the Mac Lochlainn line.', pers='opportunist', diff=4, rivals='tir_chonaill', en='', de=''),
S('tir_chonaill', inherit=True, cap='Donegal', hold='Ballyshannon;Raphoe;Letterkenny', ruler=R('Toirdhealbhach Ó Domhnaill', None, 'Ó Domhnaill'), note='Ó Domhnaill kings of Tír Chonaill.', rivals='tir_eoghain', pers='opportunist', diff=4, en='', de=''),
S('connacht', inherit=True, cap='Roscommon@53.633,-8.19', hold='Tulsk@53.783,-8.25;Carrick-on-Shannon@53.946,-8.09', ruler=R('Maghnus Ó Conchobhair', None, 'Ó Conchobhair'), note='The O\'Conor kingship is reduced to the Shannon plain around Roscommon; the de Burgh earls of Ulster hold most of Connacht as lords of Connacht under the English crown.', rivals='england', pers='opportunist', diff=4, en='', de=''),
S('thomond', inherit=True, cap='Clonroad', hold='Ennis;Killaloe;Corcomroe@53.13,-9.05', ruler=R('Toirdhealbhach Mór Ó Briain', None, 'Ó Briain'), note='Ó Briain kings of Thomond, contesting Thomas de Clare\'s lordship of Bunratty.', rivals='england', pers='opportunist', diff=4, en='', de=''),
S('maccarthy_mor', inherit=True, cap='Pallis', hold='Killarney;Kenmare;Dingle', ruler=R('Domhnall Ruadh Mac Carthaigh', None, 'Mac Carthaigh'), note='MacCarthy kings of Desmond.', rivals='england', pers='opportunist', diff=4, en='', de=''),
S('leinster', inherit=True, cap='Ferns', hold='Enniscorthy', ruler=None, note='Mac Murchadha Caomhánach kings of Leinster in the Wicklow and Wexford uplands.', rivals='england', pers='opportunist', diff=4, en='', de=''),

S('france', inherit=True, cap='Paris',
  hold='Rouen;Caen;Évreux;Le Mans;Angers;Tours;Orléans;Chartres;Bourges;Poitiers;Niort;Limoges;Angoulême;La Rochelle;Saintes;Clermont;Le Puy;Mâcon;Reims;Troyes;Meaux;Provins;Châlons;Amiens;Laon;Beauvais;Senlis;Compiègne;Saint-Quentin;Sens;Auxerre;Nevers;Blois;Toulouse;Carcassonne;Béziers;Narbonne;Nîmes;Beaucaire;Mende;Rodez;Cahors;Montauban;Albi;Figeac;Melun;Étampes;Dreux;Coutances;Bayeux;Cherbourg;Dieppe;Alençon;Guéret;Tulle;Aurillac',
  ruler=R('Philip IV', 1268, 'Capet'), heir=R('Louis', 1289, 'Capet'), consort=R('Joan I of Navarre', 1273, 'Blois-Champagne', True),
  note='House of Capet. Philip IV rules jure uxoris Navarre and Champagne. Anjou and Maine were given to his brother Charles of Valois in 1290.',
  allies='navarre castile', rivals='england aragon flanders', claims='flanders', pers='opportunist', diff=1,
  en='The young Philip the Fair consolidates the royal domain and eyes Gascony and Flanders.',
  de='Der junge Philipp der Schöne festigt die Krondomäne und hat Gascogne und Flandern im Blick.'),
S('brittany', inherit='brittany_blois', n=('Duchy of Brittany', 'Herzogtum Bretagne'), sh=('Brittany', 'Bretagne'), adj=('Breton', 'bretonisch'), cap='Nantes',
  hold='Rennes;Vannes;Quimper;Brest;Saint-Malo;Dinan;Saint-Brieuc;Guingamp;Morlaix;Ploërmel;Redon;Fougères;Vitré;Hennebont;Guérande;Lamballe',
  ruler=R('John II', 1239, 'Dreux'), heir=R('Arthur', 1262, 'Dreux'), consort=None,
  note='House of Dreux (Montfort-l\'Amaury branch of the Capetians). John II is also Earl of Richmond in England.', allies='france', pers='diplomat', diff=3, en='', de=''),
S('flanders', inherit=True, cap='Ghent',
  hold='Bruges;Ypres;Lille;Douai;Kortrijk;Oudenaarde;Aalst;Dendermonde;Sluis;Dunkirk;Bergues;Cassel;Saint-Omer@50.75,2.25;Orchies;Béthune@50.53,2.64;Ostend;Diksmuide',
  ruler=R('Guy of Dampierre', 1226, 'Dampierre'), heir=R('Robert of Béthune', 1247, 'Dampierre'), consort=None,
  note='House of Dampierre. Guy also holds the march of Namur in the Empire. Saint-Omer and Béthune belong to Artois (Robert II of Artois) and are left to France in the spread; see borders rules.',
  allies='england holland', rivals='france hainaut', pers='trader', diff=3, en='', de=''),
S('burgundy', inherit=True, cap='Dijon', hold='Beaune;Chalon-sur-Saône;Autun;Semur-en-Auxois;Avallon;Châtillon-sur-Seine;Nuits-Saint-Georges;Montbard',
  ruler=R('Robert II', 1248, 'Capet (Burgundy)'), note='Elder Capetian house of Burgundy.', allies='france', pers='builder', diff=3, en='', de=''),
S('bourbon', inherit=True, n=('Lordship of Bourbon', 'Herrschaft Bourbon'), rank='lordship', cap='Bourbon-l\'Archambault@46.583,3.056', hold='Moulins;Montluçon;Souvigny;Hérisson',
  ruler=R('Beatrice of Burgundy', 1257, 'Burgundy', True), consort=R('Robert, Count of Clermont', 1256, 'Capet'),
  note='Beatrice, lady of Bourbon, married to Robert of Clermont, son of Saint Louis. Raised to a duchy only in 1327.', allies='france', pers='builder', diff=4, en='', de=''),
S('navarre', inherit=True, cap='Pamplona', hold='Estella;Tudela;Olite;Sangüesa;Puente la Reina;Viana;Saint-Jean-Pied-de-Port',
  ruler=R('Joan I', 1273, 'Blois-Champagne', True), consort=R('Philip IV of France', 1268, 'Capet'),
  note='Queen Joan I and her husband Philip IV; Navarre is governed by French governors.', allies='france', rivals='castile aragon', pers='diplomat', diff=4, en='', de=''),
S('foix_bearn', inherit=True, cap='Foix', hold='Orthez;Pau;Morlaàs;Oloron-Sainte-Marie;Pamiers;Lescar;Sauveterre-de-Béarn',
  ruler=R('Roger-Bernard III', None, 'Foix'), note='Roger-Bernard III of Foix inherited Béarn from his father-in-law Gaston VII Moncada (d. April 1290).', rivals='armagnac', pers='opportunist', diff=4, en='', de=''),
S('armagnac', inherit=True, cap='Lectoure', hold='Auch;Eauze;Nogaro;Vic-Fezensac', ruler=R('Bernard VI', None, 'Lomagne'), note='Counts of Armagnac and Fezensac.', rivals='foix_bearn', pers='opportunist', diff=4, en='', de=''),
S('comminges', inherit=True, cap='Saint-Bertrand-de-Comminges', hold='Muret;Saint-Gaudens', ruler=R('Bernard VI of Comminges', None, 'Comminges'), pers='opportunist', diff=4, en='', de=''),
S('perigord', inherit=True, cap='Périgueux', hold='Montignac;Bergerac@44.85,0.483', ruler=R('Hélie VII Talleyrand', None, 'Talleyrand'), pers='opportunist', diff=4, en='', de=''),
S('albret', inherit=True, cap='Casteljaloux', hold='Nérac;Labrit@44.07,-0.55', ruler=R('Amanieu VII', None, 'Albret'), over='england', subj='vassal', pers='opportunist', diff=4, en='', de=''),

S('brabant', inherit=True, cap='Brussels', hold='Leuven;Antwerp;Mechelen;Tienen;Nivelles;Breda;\'s-Hertogenbosch;Limbourg@50.613,5.94;Herzogenrath@50.87,6.1;Lier',
  ruler=R('John I', 1252, 'Reginar'), heir=R('John II', 1275, 'Reginar'), note='John I won the duchy of Limburg at Worringen (5 June 1288).', allies='england holland', rivals='guelders luxembourg archbishopric_cologne', pers='conqueror', diff=3, en='', de=''),
S('holland', inherit=True, cap='The Hague', hold='Haarlem;Leiden;Delft;Dordrecht;Alkmaar;Middelburg;Zierikzee;Medemblik;Rotterdam;Gouda',
  ruler=R('Floris V', 1254, 'Holland'), note='Count of Holland and Zeeland; West Friesland subdued 1289.', allies='england', rivals='flanders utrecht', pers='builder', diff=3, en='', de=''),
S('hainaut', inherit=True, cap='Mons', hold='Valenciennes;Maubeuge;Le Quesnoy;Ath;Binche;Avesnes', ruler=R('John II of Avesnes', 1247, 'Avesnes'), rivals='flanders', pers='opportunist', diff=4, en='', de=''),
S('guelders', inherit=True, n=('County of Guelders', 'Grafschaft Geldern'), rank='county', cap='Geldern@51.52,6.32', hold='Arnhem;Nijmegen;Zutphen;Roermond;Venlo;Harderwijk;Tiel',
  ruler=R('Reinald I', None, 'Wassenberg'), note='Count (the duchy dates from 1339). Lost the Limburg succession at Worringen 1288.', rivals='brabant', pers='opportunist', diff=4, en='', de=''),
S('utrecht', inherit=True, cap='Utrecht', hold='Deventer;Kampen;Zwolle;Amersfoort;Oldenzaal;Rhenen', ruler=None, note='Prince-bishopric (Oversticht and Nedersticht).', pers='diplomat', diff=4, en='', de=''),
S('liege', inherit=True, cap='Liège', hold='Huy;Dinant;Tongeren;Maastricht;Thuin;Bouillon;Sint-Truiden', ruler=None, pers='diplomat', diff=4, en='', de=''),
S('namur', inherit=True, cap='Namur', hold='Bouvignes;Fleurus@50.48,4.55', ruler=R('Guy of Dampierre', 1226, 'Dampierre'), note='Held by Guy of Dampierre, count of Flanders, since 1263.', allies='flanders', pers='diplomat', diff=4, en='', de=''),
S('loon', inherit=True, cap='Hasselt', hold='Borgloon;Bilzen', ruler=R('Arnold V', None, 'Loon'), pers='diplomat', diff=4, en='', de=''),
S('cambrai', inherit=True, cap='Cambrai', hold='Le Cateau-Cambrésis', ruler=None, pers='diplomat', diff=4, en='', de=''),
S('luxembourg', inherit=True, n=('County of Luxembourg', 'Grafschaft Luxemburg'), rank='county', cap='Luxembourg', hold='Arlon;Bitburg;Echternach;Diekirch;Durbuy;La Roche-en-Ardenne',
  ruler=R('Henry VII', 1278, 'Luxembourg'), note='Count since his father Henry VI fell at Worringen (1288); later King of the Romans and Emperor.', rivals='brabant', pers='diplomat', diff=4, en='', de=''),
S('lorraine', inherit=True, cap='Nancy', hold='Épinal@48.17,6.45;Saint-Dié;Neufchâteau;Lunéville;Sierck;Remiremont', ruler=R('Frederick III', 1240, 'Châtenois'), pers='diplomat', diff=4, en='', de=''),
S('bar', inherit=True, n=('County of Bar', 'Grafschaft Bar'), rank='county', cap='Bar-le-Duc', hold='Saint-Mihiel;Pont-à-Mousson;Briey;Longwy;Étain', ruler=R('Henry III', None, 'Montbéliard (Bar)'), note='County; a duchy only from 1354.', rivals='france', pers='opportunist', diff=4, en='', de=''),

S('castile', inherit=True, cap='Burgos',
  hold='Toledo;Valladolid;León;Oviedo;Santiago de Compostela;A Coruña;Lugo;Ourense;Salamanca;Zamora;Segovia;Ávila;Soria;Logroño;Vitoria;Bilbao;San Sebastián;Santander;Palencia;Cuenca;Guadalajara;Madrid;Ciudad Real;Murcia;Cartagena;Lorca;Orihuela;Alicante;Elche;Chinchilla;Córdoba;Jaén;Úbeda;Baeza;Seville;Jerez;Cádiz;Niebla;Huelva;Badajoz;Mérida;Cáceres;Plasencia;Talavera;Écija;Calahorra;Sigüenza;Sabugal;Castelo Rodrigo;Olivenza;Medina Sidonia;Arcos de la Frontera;Huéscar',
  ruler=R('Sancho IV', 1258, 'Burgundy (Ivrea)'), heir=R('Ferdinand', 1285, 'Burgundy (Ivrea)'), consort=R('María de Molina', 1265, 'Molina', True),
  note='House of Burgundy (Ivrea). Sancho IV, the Brave, prepares the siege of Tarifa (taken October 1292).', allies='france aragon', rivals='marinid granada', claims='marinid', pers='conqueror', diff=2,
  en='Sancho IV wants the Strait: the Marinid bridgeheads of Tarifa and Algeciras.', de='Sancho IV. will die Meerenge: die merinidischen Brückenköpfe Tarifa und Algeciras.'),
S('aragon', inherit=True, cap='Barcelona',
  hold='Zaragoza;Valencia;Lleida;Girona;Tarragona;Tortosa;Huesca;Jaca;Teruel;Calatayud;Castellón;Xàtiva;Dénia;Alzira;Morella;Balaguer;Vic;Urgell@42.358,1.461;Barbastro;Daroca;Palma;Alcúdia;Ciutadella;Mahón;Ibiza',
  ruler=R('Alfonso III', 1265, 'Barcelona'), heir=R('James II (King of Sicily)', 1267, 'Barcelona'), consort=None,
  note='House of Barcelona. Alfonso III, the Liberal, took the Balearics from his uncle James II of Majorca (1285-87); excommunicated, he negotiates the Treaty of Tarascon (February 1291). He dies on 18 June 1291.',
  allies='sicily', rivals='france naples majorca castile', claims='majorca', pers='conqueror', diff=2, en='', de=''),
N('majorca', 'Kingdom of Majorca', 'Königreich Mallorca', 'kingdom', 'feudal_monarchy', 'catalan', 'latin', 'Perpignan',
  hold='Collioure;Puigcerdà;Villefranche-de-Conflent;Céret;Elne;Montpellier;Carlat@44.88,2.57',
  sh=('Majorca', 'Mallorca'), adj=('Majorcan', 'mallorquinisch'), color='#a4864a',
  ruler=R('James II of Majorca', 1243, 'Barcelona'), note='James II of Majorca has lost the islands to Aragon (1285-87) and keeps Roussillon, Cerdanya and the lordship of Montpellier under French protection.',
  allies='france', rivals='aragon', claims='aragon', pers='diplomat', diff=4, en='', de=''),
S('portugal', inherit=True, cap='Lisbon', hold='Coimbra;Porto;Braga;Guimarães;Évora;Beja;Silves;Faro;Tavira;Lamego;Viseu;Guarda;Santarém;Leiria;Bragança;Chaves;Elvas;Castelo Branco;Setúbal;Viana do Castelo@41.69,-8.83',
  ruler=R('Denis', 1261, 'Burgundy (Portugal)'), consort=R('Elizabeth of Aragon', 1271, 'Barcelona', True), note='House of Burgundy. Denis, the Farmer King, founded the university at Lisbon (1290).', rivals='castile', pers='builder', diff=3, en='', de=''),
S('granada', inherit=True, cap='Granada', hold='Málaga;Almería;Guadix;Baza;Loja;Antequera;Vera;Almuñécar;Vélez-Málaga;Marbella;Alhama de Granada@37.006,-3.989;Motril@36.745,-3.52;Purchena@37.35,-2.36',
  ruler=R('Muhammad II', 1235, 'Nasrid'), heir=R('Muhammad III', 1257, 'Nasrid'), note='Nasrid dynasty. Málaga came back from the Banu Ashqilula through the Marinids in 1279, Guadix in 1288.', allies='', rivals='castile marinid', pers='diplomat', diff=3, en='', de=''),
]

wars = [
  WAR('Aragonese Crusade (War of the Sicilian Vespers)', 'Aragonesischer Kreuzzug (Krieg der Sizilianischen Vesper)', 'naples france papal_states majorca', 'aragon sicily', 1282, 'throne_claim'),
]

if __name__ == '__main__':
    write('west', SOURCES, states, wars, new_ids=['majorca', 'brittany'], notes=NOTES)
