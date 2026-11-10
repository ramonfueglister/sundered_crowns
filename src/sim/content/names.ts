// Personal names by culture: given names, family names and how they are put together, for every person the game
// creates (heirs and children, consorts, councillors and candidates, generals and admirals, regents, the rulers of
// released realms). Original lists of historically plausible names; no titles in another language ("Sir Osman").
// Also the German form of the epithets historic rulers carry in the setup ("Pedro I the Cruel" → "Pedro I. der
// Grausame"): localName() is used for every name shown in German.
import { ALL_CULTURES, GROUP_OF } from './peoples';
import { rand } from '../rng';
import { PLACE_DE } from './names_de';

/** gf: given + family ("Rodrigo de Mendoza"); fg: family first ("Hunyadi János", "Evrenosoğlu Ali");
 *  ibn: given + ibn + father's name ("Yusuf ibn Ali"); pat: given + father's name ("Dawit Yeshaq"); g: given only. */
type Order = 'gf' | 'fg' | 'ibn' | 'pat' | 'g';
interface Pool { m: string[]; f: string[]; houses: string[]; order: Order; fem?: (house: string) => string }

const slavFem = (h: string) => h.replace(/ski$/, 'ska').replace(/cki$/, 'cka').replace(/(ov|ev|in)$/, '$1a').replace(/sky$/, 'skaya').replace(/ić$/, 'ić');

export const NAME_POOLS: Record<string, Pool> = {
  english: { order: 'gf',
    m: ['John', 'William', 'Thomas', 'Richard', 'Robert', 'Henry', 'Walter', 'Hugh', 'Roger', 'Edmund', 'Ralph', 'Geoffrey', 'Nicholas', 'Humphrey', 'Gilbert', 'Simon', 'Edward', 'Stephen', 'Philip', 'Lionel'],
    f: ['Joan', 'Margaret', 'Alice', 'Elizabeth', 'Isabel', 'Matilda', 'Eleanor', 'Agnes', 'Catherine', 'Philippa', 'Anne', 'Cecily'],
    houses: ['Percy', 'Neville', 'Mowbray', 'Stafford', 'Courtenay', 'Talbot', 'Fitzalan', 'Holland', 'Montagu', 'Beauchamp', 'Scrope', 'Hastings', 'Grey', 'Bohun', 'Despenser', 'Clifford', 'Stanley', 'Howard'] },
  gaelic: { order: 'gf',
    m: ['Alexander', 'Robert', 'David', 'James', 'Donald', 'Duncan', 'Malcolm', 'Archibald', 'Niall', 'Brian', 'Turlough', 'Owain', 'Rhys', 'Gruffudd', 'Dafydd', 'Aodh', 'Domhnall', 'Conn'],
    f: ['Margaret', 'Isabel', 'Mariota', 'Euphemia', 'Gormlaith', 'Una', 'Gwenllian', 'Nest', 'Elizabeth', 'Joan'],
    houses: ['Douglas', 'Stewart', 'Lindsay', 'Dunbar', 'Gordon', 'Hamilton', 'Campbell', 'Mac Donnell', "O'Neill", "O'Brien", 'Mac Carthy', 'Fitzgerald', 'Butler', 'ap Gruffudd'] },
  french: { order: 'gf',
    m: ['Jean', 'Louis', 'Charles', 'Philippe', 'Pierre', 'Guillaume', 'Robert', 'Hugues', 'Bertrand', 'Olivier', 'Enguerrand', 'Gaucher', 'Arnaud', 'Raoul', 'Thibaut', 'Jacques', 'Gui', 'Amaury', 'Gaston', 'Bernard'],
    f: ['Jeanne', 'Marguerite', 'Isabelle', 'Blanche', 'Marie', 'Catherine', 'Agnès', 'Yolande', 'Béatrice', 'Bonne', 'Valentine', 'Anne'],
    houses: ['de Craon', 'de Coucy', 'de Clisson', 'de La Trémoille', "d'Harcourt", 'de Chalon', 'de Vienne', 'de Sancerre', 'de Châtillon', 'de Montmorency', 'de Rieux', 'de Laval', 'de Beaumont', 'de Vendôme', 'de Melun', 'de Rohan', "d'Albret", 'de Foix'] },
  castilian: { order: 'gf',
    m: ['Pedro', 'Juan', 'Alfonso', 'Enrique', 'Fernando', 'Diego', 'Rodrigo', 'Gonzalo', 'Álvaro', 'Íñigo', 'Lope', 'Gutierre', 'Pero', 'Ruy', 'García', 'Sancho', 'Martín', 'Gómez'],
    f: ['Leonor', 'Juana', 'María', 'Isabel', 'Catalina', 'Beatriz', 'Constanza', 'Blanca', 'Inés', 'Teresa', 'Urraca', 'Mencía'],
    houses: ['de Mendoza', 'de Guzmán', 'de Haro', 'Ponce de León', 'de Velasco', 'Manrique', 'Pacheco', 'de Lara', 'Enríquez', 'Fernández de Córdoba', 'Fajardo', 'de Stúñiga', 'de Luna', 'de la Cerda', 'Osorio', 'Pimentel'] },
  portuguese: { order: 'gf',
    m: ['João', 'Afonso', 'Pedro', 'Duarte', 'Fernão', 'Nuno', 'Álvaro', 'Gonçalo', 'Diogo', 'Vasco', 'Martim', 'Rui', 'Lopo', 'Henrique', 'Lourenço', 'Estêvão'],
    f: ['Leonor', 'Beatriz', 'Isabel', 'Filipa', 'Branca', 'Catarina', 'Inês', 'Teresa', 'Constança', 'Mécia'],
    houses: ['Pereira', 'de Meneses', 'da Cunha', 'de Castro', 'Coutinho', 'de Sousa', 'de Almeida', 'de Melo', 'de Noronha', 'de Ataíde', 'Pacheco', 'de Vasconcelos', 'da Silva', 'de Albuquerque'] },
  catalan: { order: 'gf',
    m: ['Pere', 'Jaume', 'Joan', 'Martí', 'Alfons', 'Ramon', 'Bernat', 'Berenguer', 'Guillem', 'Arnau', 'Ferran', 'Galceran', 'Hug', 'Dalmau', 'Francesc', 'Ponç'],
    f: ['Elionor', 'Violant', 'Maria', 'Sibil·la', 'Constança', 'Margarida', 'Isabel', 'Blanca', 'Agnès', 'Joana'],
    houses: ['de Cardona', 'de Montcada', 'de Rocabertí', 'de Requesens', 'de Cabrera', "d'Erill", 'de Pinós', 'de Queralt', 'de Centelles', 'de Vilaragut', 'de Corella', 'de Pallars', "d'Urrea"] },
  italian: { order: 'gf',
    m: ['Giovanni', 'Francesco', 'Niccolò', 'Pietro', 'Lorenzo', 'Matteo', 'Bernabò', 'Galeazzo', 'Filippo', 'Jacopo', 'Guido', 'Carlo', 'Ludovico', 'Antonio', 'Bartolomeo', 'Federico', 'Sigismondo', 'Ottaviano', 'Cosimo', 'Taddeo'],
    f: ['Caterina', 'Beatrice', 'Bianca', 'Giovanna', 'Lucia', 'Costanza', 'Margherita', 'Isabella', 'Ginevra', 'Taddea', 'Elisabetta', 'Agnese'],
    houses: ['Orsini', 'Colonna', 'Gonzaga', 'Strozzi', 'Malatesta', 'da Polenta', 'Ordelaffi', 'Sanseverino', 'del Balzo', 'Caracciolo', 'Albizzi', 'Pazzi', 'Doria', 'Spinola', 'Contarini', 'Dal Verme', 'Trivulzio', 'Baglioni', 'Manfredi'] },
  german: { order: 'gf',
    m: ['Heinrich', 'Friedrich', 'Otto', 'Ludwig', 'Albrecht', 'Johann', 'Konrad', 'Rudolf', 'Wilhelm', 'Ulrich', 'Eberhard', 'Dietrich', 'Gerhard', 'Burkhard', 'Siegfried', 'Hartmann', 'Kraft', 'Reinhard', 'Wolfgang', 'Georg'],
    f: ['Elisabeth', 'Margarethe', 'Anna', 'Katharina', 'Agnes', 'Mechthild', 'Adelheid', 'Kunigunde', 'Sophie', 'Barbara', 'Gertrud', 'Richardis'],
    houses: ['von Hohenlohe', 'von Henneberg', 'von Waldburg', 'von Stolberg', 'von Schaumburg', 'von Eberstein', 'von Isenburg', 'von Hanau', 'von Querfurt', 'von Plauen', 'von Schwarzenberg', 'von Rechberg', 'von Weinsberg', 'von Bickenbach', 'von Kirchberg', 'von Leiningen', 'von Sayn', 'von Werdenberg'] },
  dutch: { order: 'gf',
    m: ['Jan', 'Willem', 'Floris', 'Arnoud', 'Gijsbrecht', 'Dirk', 'Hendrik', 'Reinoud', 'Jacob', 'Gerard', 'Otto', 'Frank', 'Pieter', 'Lodewijk', 'Boudewijn', 'Zweder'],
    f: ['Margaretha', 'Machteld', 'Aleid', 'Jacoba', 'Beatrix', 'Johanna', 'Bertha', 'Geertruid', 'Clementia', 'Agnes'],
    houses: ['van Brederode', 'van Egmond', 'van Arkel', 'van Wassenaer', 'van Borssele', 'van Gruuthuse', 'van Halewijn', 'van Culemborg', 'van Polanen', 'van Duvenvoorde', 'van Heenvliet', 'van Ghistel', 'van Horne'] },
  scandinavian: { order: 'gf',
    m: ['Magnus', 'Haakon', 'Erik', 'Olof', 'Knut', 'Karl', 'Bo', 'Sten', 'Nils', 'Bengt', 'Kristiern', 'Peder', 'Anders', 'Ture', 'Svante', 'Jens', 'Eskil', 'Laurens'],
    f: ['Ingeborg', 'Märta', 'Kristina', 'Margareta', 'Birgitta', 'Cecilia', 'Karin', 'Elin', 'Ragnhild', 'Helvig'],
    houses: ['Bonde', 'Sture', 'Oxenstierna', 'Trolle', 'Bielke', 'Brahe', 'Rosenkrantz', 'Gyldenstierne', 'Ulfstand', 'Thott', 'Bille', 'Krognos', 'Natt och Dag', 'Tott', 'Lejonhufvud'] },
  polish: { order: 'gf', fem: slavFem,
    m: ['Kazimierz', 'Władysław', 'Bolesław', 'Siemowit', 'Jan', 'Mikołaj', 'Piotr', 'Zbigniew', 'Spytek', 'Jakub', 'Dobiesław', 'Krzesław', 'Sędziwój', 'Andrzej', 'Stanisław', 'Mszczuj', 'Jaśko'],
    f: ['Elżbieta', 'Anna', 'Jadwiga', 'Katarzyna', 'Zofia', 'Barbara', 'Małgorzata', 'Agnieszka', 'Dobrochna', 'Eufemia'],
    houses: ['Tęczyński', 'Ostroróg', 'Oleśnicki', 'Melsztyński', 'Kmita', 'Odrowąż', 'Leliwa', 'Górka', 'Kurozwęcki', 'Szamotulski', 'Tarnowski', 'Grabowski', 'Pilecki'] },
  czech: { order: 'gf',
    m: ['Václav', 'Jan', 'Jindřich', 'Oldřich', 'Petr', 'Vok', 'Boček', 'Hynek', 'Zdeněk', 'Smil', 'Půta', 'Beneš', 'Jaroslav', 'Ctibor', 'Aleš', 'Vilém'],
    f: ['Anežka', 'Kateřina', 'Eliška', 'Johana', 'Markéta', 'Ludmila', 'Zdislava', 'Perchta', 'Anna', 'Dorota'],
    houses: ['z Rožmberka', 'ze Šternberka', 'z Pernštejna', 'z Lichtenburka', 'z Kolovrat', 'z Lobkovic', 'z Hradce', 'z Michalovic', 'z Kunštátu', 'z Dubé', 'z Házmburka', 'z Vartenberka'] },
  russian: { order: 'gf', fem: slavFem,
    m: ['Ivan', 'Dmitry', 'Vasily', 'Mikhail', 'Yury', 'Semyon', 'Andrei', 'Fyodor', 'Boris', 'Konstantin', 'Daniil', 'Timofei', 'Gleb', 'Vladimir', 'Svyatoslav', 'Oleg', 'Afanasy', 'Grigory'],
    f: ['Yevdokiya', 'Mariya', 'Anna', 'Sofya', 'Yelena', 'Anastasiya', 'Olga', 'Feodosiya', 'Ulyana', 'Agrafena'],
    houses: ['Vorontsov', 'Shuisky', 'Obolensky', 'Patrikeyev', 'Khovansky', 'Kobylin', 'Velyaminov', 'Morozov', 'Pleshcheyev', 'Saburov', 'Buturlin', 'Golovin', 'Zakharin', 'Ryapolovsky', 'Kurbsky'] },
  serbian: { order: 'gf',
    m: ['Stefan', 'Lazar', 'Vuk', 'Đurađ', 'Novak', 'Uglješa', 'Vukašin', 'Radoslav', 'Sandalj', 'Hrvoje', 'Tvrtko', 'Ivan', 'Mihail', 'Konstantin', 'Dragaš', 'Nikola'],
    f: ['Jelena', 'Milica', 'Mara', 'Teodora', 'Jelisaveta', 'Kosara', 'Katarina', 'Desislava', 'Kera', 'Vladislava'],
    houses: ['Branković', 'Mrnjavčević', 'Hrebeljanović', 'Balšić', 'Kosača', 'Pavlović', 'Dejanović', 'Crnojević', 'Hrvatinić', 'Asen', 'Šišman', 'Nikolić'] },
  croatian: { order: 'gf',
    m: ['Ivan', 'Nikola', 'Pavao', 'Juraj', 'Stjepan', 'Grgur', 'Bartol', 'Ivaniš', 'Petar', 'Ladislav', 'Mladen', 'Martin', 'Žiga', 'Andrej'],
    f: ['Katarina', 'Jelena', 'Doroteja', 'Ana', 'Margareta', 'Barbara', 'Klara', 'Elizabeta'],
    houses: ['Frankopan', 'Šubić', 'Zrinski', 'Kurjaković', 'Nelipić', 'Talovac', 'Babonić', 'Berislavić', 'Keglević', 'Drašković', 'Celjski', 'Ptujski'] },
  lithuanian: { order: 'gf',
    m: ['Algirdas', 'Kęstutis', 'Jogaila', 'Vytautas', 'Skirgaila', 'Kaributas', 'Švitrigaila', 'Žygimantas', 'Mykolas', 'Jonas', 'Jonušas', 'Albertas', 'Petras', 'Mantvydas', 'Radvilas', 'Kęsgaila'],
    f: ['Ona', 'Birutė', 'Julijona', 'Marija', 'Kotryna', 'Sofija', 'Uljana', 'Elžbieta'],
    houses: ['Goštautas', 'Radvila', 'Kęsgaila', 'Alšėniškis', 'Valimantaitis', 'Mantvydaitis', 'Astikas', 'Sakaitis', 'Chodkevičius', 'Zaslavskis'] },
  finnic: { order: 'gf',
    m: ['Klaus', 'Henrik', 'Olavi', 'Matti', 'Juho', 'Lauri', 'Tuomas', 'Antti', 'Mikael', 'Paavo', 'Erik', 'Niilo'],
    f: ['Kaarina', 'Margareeta', 'Elina', 'Anna', 'Briitta', 'Valborg', 'Marketta'],
    houses: ['Fleming', 'Tott', 'Kurki', 'Horn', 'Djäkn', 'Frille', 'Stiernkors', 'Bitz', 'Uggla', 'Lepaa'] },
  hungarian: { order: 'fg',
    m: ['János', 'László', 'Miklós', 'István', 'Péter', 'Pál', 'Mihály', 'Mátyás', 'Imre', 'Dénes', 'Lőrinc', 'Tamás', 'György', 'Simon', 'Benedek', 'Gergely', 'Ferenc', 'András'],
    f: ['Erzsébet', 'Katalin', 'Ilona', 'Margit', 'Anna', 'Borbála', 'Zsófia', 'Orsolya', 'Dorottya', 'Klára'],
    houses: ['Hunyadi', 'Garai', 'Kanizsai', 'Báthori', 'Rozgonyi', 'Újlaki', 'Perényi', 'Szécsi', 'Lackfi', 'Drugeth', 'Csáki', 'Tallóci', 'Bebek', 'Pálóci', 'Szapolyai', 'Kinizsi'] },
  romanian: { order: 'gf',
    m: ['Mircea', 'Vlad', 'Dan', 'Radu', 'Basarab', 'Alexandru', 'Ștefan', 'Petru', 'Bogdan', 'Iliaș', 'Roman', 'Mihail', 'Neagoe', 'Pârvu', 'Dragomir', 'Stanciul'],
    f: ['Maria', 'Ana', 'Ruxandra', 'Anca', 'Despina', 'Vochița', 'Elena', 'Marina', 'Chiajna', 'Stana'],
    houses: ['Craiovescu', 'Buzescu', 'Movilă', 'Arbore', 'Cândea', 'Golescu', 'Băleanu', 'Hrăbor', 'Doljescu', 'Floca'] },
  greek: { order: 'gf',
    m: ['Ioannes', 'Manuel', 'Andronikos', 'Theodoros', 'Michael', 'Konstantinos', 'Demetrios', 'Alexios', 'Nikephoros', 'Georgios', 'Matthaios', 'Thomas', 'Isaakios', 'Leon', 'Nikolaos', 'Stephanos'],
    f: ['Eirene', 'Anna', 'Maria', 'Helene', 'Theodora', 'Zoe', 'Eudokia', 'Sophia', 'Thomais', 'Euphrosyne'],
    houses: ['Kantakouzenos', 'Laskaris', 'Doukas', 'Notaras', 'Philanthropenos', 'Tarchaneiotes', 'Asanes', 'Raoul', 'Angelos', 'Synadenos', 'Metochites', 'Tornikes', 'Kabasilas'] },
  albanian: { order: 'gf',
    m: ['Gjergj', 'Gjon', 'Pal', 'Lekë', 'Karl', 'Andrea', 'Tanush', 'Gjin', 'Progon', 'Nikollë', 'Dhimitër', 'Zakaria'],
    f: ['Mara', 'Jela', 'Donika', 'Vojsava', 'Angjelina', 'Rugjina', 'Maria'],
    houses: ['Kastrioti', 'Dukagjini', 'Topia', 'Arianiti', 'Muzaka', 'Zenevisi', 'Spata', 'Dushmani', 'Zaharia', 'Matranga'] },
  caucasian: { order: 'gf',
    m: ['Giorgi', 'Bagrat', 'Davit', 'Konstantine', 'Aleksandre', 'Vakhtang', 'Demetre', 'Levan', 'Ivane', 'Shalva', 'Hovhannes', 'Smbat', 'Grigor', 'Vardan', 'Ashot', 'Kostandin'],
    f: ['Tamar', 'Rusudan', 'Gulkhan', 'Elene', 'Ketevan', 'Mariam', 'Zabel', 'Shushan', 'Hripsime', 'Nestan'],
    houses: ['Orbeliani', 'Dadiani', 'Jaqeli', 'Amilakhvari', 'Gurieli', 'Abashidze', 'Eristavi', 'Tsitsishvili', 'Zakarian', 'Proshian', 'Arzruni', 'Mamikonian'] },
  turkish: { order: 'fg',
    m: ['Orhan', 'Murad', 'Bayezid', 'Mehmed', 'Süleyman', 'Musa', 'İsa', 'Hamza', 'Evrenos', 'Turahan', 'Ali', 'Yakub', 'İshak', 'Karaca', 'Timurtaş', 'Hızır', 'Saruca', 'İlyas', 'Balaban', 'Mahmud', 'Davud', 'Umur'],
    f: ['Nilüfer', 'Hüma', 'Gülbahar', 'Mihrimah', 'Hatice', 'Fatma', 'Ayşe', 'Sitti', 'Devlet', 'Gülşah', 'Hafsa', 'Selçuk'],
    houses: ['Evrenosoğlu', 'Mihaloğlu', 'Turahanoğlu', 'Malkoçoğlu', 'Candaroğlu', 'Çandarlı', 'Timurtaşoğlu', 'Karacaoğlu', 'Saruhanoğlu', 'Aydınoğlu', 'Germiyanoğlu', 'Menteşeoğlu', 'Pervaneoğlu', 'Eretnaoğlu'] },
  tatar: { order: 'gf',
    m: ['Toqtamish', 'Edigu', 'Mamai', 'Hajji', 'Ulugh', 'Kuchuk', 'Nur-Devlet', 'Mengli', 'Abdullah', 'Berdibek', 'Timur', 'Aziz', 'Kildibek', 'Mansur', 'Nogai', 'Esen', 'Toghon', 'Arugtai', 'Taisun', 'Bolkhu'],
    f: ['Taydula', 'Janike', 'Nur-Sultan', 'Tulunbek', 'Saray', 'Khanike', 'Altyn', 'Bibi', 'Mandukhai', 'Samur'],
    houses: ['Shirin', 'Barin', 'Arghin', 'Qipchaq', 'Mangit', 'Qongirat', 'Sejiut', 'Yashlav', 'Kiyat', 'Jalayir', 'Ushun', 'Naiman'] },
  arabic: { order: 'ibn',
    m: ['Muhammad', 'Ahmad', 'Hasan', 'Ali', 'Yusuf', 'Ibrahim', 'Umar', 'Uthman', 'Abd Allah', 'Ismail', 'Sad', 'Nasr', 'Faraj', 'Sulayman', 'Mansur', 'Khalil', 'Musa', 'Idris', 'Jafar', 'Qasim'],
    f: ['Fatima', 'Aisha', 'Zaynab', 'Khadija', 'Maryam', 'Umm Kulthum', 'Safiyya', 'Ruqayya', 'Amina', 'Halima', 'Tughay', 'Sitt al-Mulk'],
    houses: ['Banu Sarraj', 'Banu Ashqilula', 'Banu Hud', 'Banu Kinana', 'Banu Shayban', 'Banu Tamim', 'Banu Hilal', 'Banu Sulaym', 'Banu Mazin', 'Banu Qays'] },
  maghrebi: { order: 'ibn',
    m: ['Yaqub', 'Yusuf', 'Uthman', 'Abu al-Hasan', 'Abu Inan', 'Abu Salim', 'Abd al-Haqq', 'Yahya', 'Zayyan', 'Idris', 'Tashfin', 'Abu Faris', 'Ali', 'Muhammad', 'Ibrahim', 'Abu Bakr'],
    f: ['Fatima', 'Zaynab', 'Shams al-Duha', 'Aisha', 'Hafsa', 'Amina', 'Kanza', 'Maymuna', 'Zuhra', 'Tamimt'],
    houses: ['Banu Marin', 'Banu Wattas', 'Banu Abd al-Wad', 'Banu Hafs', 'Banu Zayyan', 'Banu Tujin', 'Banu Rashid', 'Banu Yaznasin', 'Banu Hintata'] },
  persian: { order: 'gf',
    m: ['Rostam', 'Bahram', 'Farrokh', 'Hormoz', 'Kaykhosrow', 'Shahrokh', 'Esmail', 'Tahmasp', 'Hasan', 'Hosayn', 'Jahanshah', 'Abu Said', 'Pir Budaq', 'Qasem', 'Mahmud', 'Mansur', 'Bayram'],
    f: ['Gowhar Shad', 'Shirin', 'Parisa', 'Khanzada', 'Tajlu', 'Sultanum', 'Banu', 'Maryam', 'Pari Khan', 'Farrokhzad'],
    houses: ['Shirazi', 'Isfahani', 'Tabrizi', 'Kermani', 'Qazvini', 'Yazdi', 'Simnani', 'Astarabadi', 'Juvayni', 'Esfarayeni', 'Hamadani'] },
  jewish: { order: 'gf',
    m: ['Isaac', 'Abraham', 'Judah', 'Samuel', 'Moses', 'Joseph', 'David', 'Solomon', 'Jacob', 'Hasdai', 'Meir', 'Vidal'],
    f: ['Dulcia', 'Sarah', 'Esther', 'Miriam', 'Rebecca', 'Hannah', 'Bellida', 'Jamila'],
    houses: ['Abravanel', 'ibn Shoshan', 'Halevi', 'Crescas', 'Alconstantini', 'de la Cavalleria', 'Adret', 'Benveniste'] },
  sahel: { order: 'gf',
    m: ['Musa', 'Sulayman', 'Mari Jata', 'Maghan', 'Uli', 'Sakura', 'Muhammad', 'Dawud', 'Ishaq', 'Ali', 'Bakari', 'Mamadi', 'Sunjata', 'Kankan'],
    f: ['Kassi', 'Sogolon', 'Nana', 'Kadidia', 'Mariam', 'Fatimata', 'Sassouma', 'Ayisha', 'Hawa', 'Maimuna'],
    houses: ['Keita', 'Traoré', 'Sissoko', 'Kamara', 'Touré', 'Konaté', 'Diarra', 'Kulibali', 'Sylla', 'Cissé', 'Fofana', 'Doumbia'] },
  ethiopian: { order: 'pat',
    m: ['Dawit', 'Yeshaq', 'Zara Yaqob', 'Tewodros', 'Amda Seyon', 'Baeda Maryam', 'Lebna Dengel', 'Takla', 'Gabra', 'Yohannes', 'Galawdewos', 'Eskender', 'Iyasu', 'Walda'],
    f: ['Eleni', 'Seble Wengel', 'Romna', 'Zan Hayla', 'Maryam Sena', 'Wengelawit', 'Sabla', 'Mentewab'],
    houses: [] },
  mesoamerican: { order: 'g',
    m: ['Itzcoatl', 'Tizoc', 'Axayacatl', 'Ahuitzotl', 'Cuauhtemoc', 'Moquihuix', 'Tlacaelel', 'Nezahualcoyotl', 'Huitzilihuitl', 'Chimalpopoca', 'Acamapichtli', 'Totoquihuaztli', 'Cacamatzin', 'Tezozomoc'],
    f: ['Tecuichpo', 'Papantzin', 'Ilancueitl', 'Azcaxochitl', 'Matlalxochitl', 'Xiuhtototzin', 'Atotoztli', 'Citlalmina'],
    houses: [] },
  andean: { order: 'g',
    m: ['Pachacuti', 'Tupac', 'Huayna', 'Amaru', 'Sinchi', 'Yahuar', 'Capac', 'Urco', 'Lloque', 'Mayta', 'Atoc', 'Quizquiz', 'Rumiñahui', 'Challcuchima'],
    f: ['Mama Ocllo', 'Mama Anahuarque', 'Cusi Rimay', 'Chimpu Ocllo', 'Mama Rahua', 'Curi Coyllur', 'Quispe Sisa', 'Mama Huaco'],
    houses: [] },
};

/** Pools by culture (where a culture differs from its group) and by culture group. */
const CULTURE_POOL: Record<string, string> = {
  scottish: 'gaelic', irish: 'gaelic', welsh: 'gaelic', portuguese: 'portuguese', galician: 'portuguese', catalan: 'catalan', andalusi: 'arabic',
  czech: 'czech', slovak: 'czech', croatian: 'croatian', slovene: 'croatian', vlach: 'romanian', albanian: 'albanian', alan: 'caucasian',
  tatar: 'tatar', bashkir: 'tatar', crimean: 'tatar', kipchak_nomad: 'tatar', maghrebi: 'maghrebi',
  mande: 'sahel', wolof: 'sahel', songhai: 'sahel', hausa: 'sahel', fulani: 'sahel', kanuri: 'sahel', mossi: 'sahel', kru: 'sahel',
  amhara: 'ethiopian', afar: 'ethiopian', oromo: 'ethiopian', somali: 'arabic', nubian: 'arabic', beja: 'arabic', swahili: 'arabic', fur: 'arabic',
  nahua: 'mesoamerican', maya: 'mesoamerican', mixtec: 'mesoamerican', purepecha: 'mesoamerican', chichimec: 'mesoamerican',
  quechua: 'andean', aymara: 'andean', chimu: 'andean', diaguita: 'andean', muisca: 'andean',
};
const GROUP_POOL: Record<string, string> = {
  british: 'english', gallic: 'french', iberian: 'castilian', low_lands: 'dutch', german: 'german', italian: 'italian', west_slavic: 'polish',
  east_slavic: 'russian', south_slavic: 'serbian', baltic: 'lithuanian', finnic: 'finnic', northern: 'finnic', norse: 'scandinavian', carpathian: 'hungarian',
  hellenic: 'greek', caucasian: 'caucasian', turkic: 'turkish', mongolic: 'tatar', arab: 'arabic', berber: 'maghrebi', iranian: 'persian', jewish: 'jewish',
};
/** The name pool of a culture (index into ALL_CULTURES), or null for peoples without one (names are then made up
 *  from the sounds of a neutral syllable list). */
export function poolIdOf(culture: number): string | null {
  const c = ALL_CULTURES[culture] ?? 'unknown';
  return CULTURE_POOL[c] ?? GROUP_POOL[GROUP_OF[c]] ?? null;
}
const R = <T>(rng: number[], a: T[]) => a[Math.floor(rand(rng) * a.length)];
const SYL = ['ka', 'ta', 'ri', 'mo', 'lu', 'an', 'se', 'do', 'na', 'vi', 'el', 'or', 'ba', 'mi', 'tu', 'go', 'si', 'ha', 'ke', 'ro'];
function madeUp(rng: number[], k: number) { let s = ''; for (let i = 0; i < k; i++) s += R(rng, SYL); return s[0].toUpperCase() + s.slice(1); }

/** A given name from the culture's pool. */
export function givenName(rng: number[], culture: number, female: boolean): string {
  const p = NAME_POOLS[poolIdOf(culture) ?? ''];
  if (!p) return madeUp(rng, 2 + (rand(rng) < 0.4 ? 1 : 0)) + (female ? 'a' : '');
  return R(rng, female ? p.f : p.m);
}
/** A noble family of the culture ('' for peoples who use no family names). */
export function houseName(rng: number[], culture: number): string {
  const id = poolIdOf(culture); const p = NAME_POOLS[id ?? ''];
  if (!p) return madeUp(rng, 2);
  return p.houses.length ? R(rng, p.houses) : '';
}
/** A family name in the form a woman of that culture bears it (Polish and Russian names change their ending). */
export function familyForm(house: string, culture: number, female: boolean): string {
  const p = NAME_POOLS[poolIdOf(culture) ?? ''];
  return female && p?.fem && house ? p.fem(house) : house;
}
/** A whole person of a culture: the name as written (family first where the culture puts it first, a father's name
 *  where it uses one) and the family it belongs to. */
export function personName(rng: number[], culture: number, female: boolean, house?: string): { name: string; dynasty: string } {
  const p = NAME_POOLS[poolIdOf(culture) ?? ''];
  const g = givenName(rng, culture, female);
  const h = house ?? houseName(rng, culture);
  if (!p) return { name: h ? `${g} ${h}` : g, dynasty: h };
  const hh = female && p.fem && h ? p.fem(h) : h;
  switch (p.order) {
    case 'fg': return { name: hh ? `${hh} ${g}` : g, dynasty: h };
    case 'ibn': return { name: `${g} ${female ? 'bint' : 'ibn'} ${R(rng, p.m)}`, dynasty: h };
    case 'pat': return { name: `${g} ${R(rng, p.m)}`, dynasty: h };
    case 'g': return { name: g, dynasty: h };
    default: return { name: hh ? `${g} ${hh}` : g, dynasty: h };
  }
}

// ---------------- names in German ----------------
/** English epithets of the setup's rulers (and a few common ones) in German, masculine; the feminine form takes
 *  "die" for the adjectives. */
export const EPITHET_DE: Record<string, string> = {
  Great: 'der Große', Cruel: 'der Grausame', Elder: 'der Ältere', Younger: 'der Jüngere', Middle: 'der Mittlere', Fair: 'der Schöne', Handsome: 'der Schöne',
  Roman: 'der Römer', Monk: 'der Mönch', Upright: 'der Aufrichtige', Ceremonious: 'der Zeremoniöse', Evil: 'der Böse', Bad: 'der Böse', Mathematician: 'der Mathematiker',
  Small: 'der Kleine', Pious: 'der Fromme', Magnificent: 'der Prächtige', White: 'der Weiße', Red: 'der Rote', Grey: 'der Graue', Black: 'der Schwarze',
  Steadfast: 'der Beständige', Mild: 'der Milde', Good: 'der Gute', Babymaker: 'der Kindermacher', Iron: 'der Eiserne', Peaceful: 'der Friedfertige', Rich: 'der Reiche',
  Bearded: 'der Bärtige', Wise: 'der Weise', Strict: 'der Strenge', Simple: 'der Einfältige', Lame: 'der Lahme', Bold: 'der Kühne', Brave: 'der Tapfere',
  Just: 'der Gerechte', Conqueror: 'der Eroberer', Lion: 'der Löwe', Old: 'der Alte', Young: 'der Junge', Blind: 'der Blinde', Fat: 'der Dicke', Proud: 'der Stolze',
  Victorious: 'der Siegreiche', Magnanimous: 'der Großmütige', Catholic: 'der Katholische', Navigator: 'der Seefahrer', Prudent: 'der Kluge', Fearless: 'der Unerschrockene',
  Mad: 'der Wahnsinnige', 'Well-Beloved': 'der Vielgeliebte', Lawgiver: 'der Gesetzgeber', Thunderbolt: 'der Blitz', Saint: 'der Heilige', Holy: 'der Heilige', Short: 'der Kurze',
  Tall: 'der Lange', Hunchback: 'der Bucklige', Learned: 'der Gelehrte', Valiant: 'der Tapfere', Generous: 'der Freigebige', Severe: 'der Strenge', Gentle: 'der Sanfte',
  Unlucky: 'der Unglückliche', Fortunate: 'der Glückliche', Builder: 'der Erbauer', Father: 'der Vater', Hammer: 'der Hammer', Terrible: 'der Schreckliche',
  Avenger: 'der Rächer', Kind: 'der Gütige', Brandenburger: 'der Brandenburger',
};
/** Titles after the name ("Maurice FitzGerald, 4th Earl of Kildare") in German. */
const TITLE_DE: Record<string, string> = {
  Earl: 'Graf', Count: 'Graf', Countess: 'Gräfin', Duke: 'Herzog', Duchess: 'Herzogin', Bishop: 'Bischof', 'Prince-Bishop': 'Fürstbischof', Archbishop: 'Erzbischof',
  Guardian: 'Hüter', King: 'König', Queen: 'Königin', Prince: 'Prinz', Princess: 'Prinzessin', Margrave: 'Markgraf', Lord: 'Herr', Lady: 'Herrin', Emperor: 'Kaiser',
  Empress: 'Kaiserin', Marshal: 'Marschall', Constable: 'Konnetabel', Abbot: 'Abt', Master: 'Meister', Grand: 'Groß', and: 'und',
  Infante: 'Infant', Infanta: 'Infantin',
};
const NOUN = new Set(['Roman', 'Monk', 'Mathematician', 'Babymaker', 'Conqueror', 'Lion', 'Navigator', 'Lawgiver', 'Thunderbolt', 'Builder', 'Father', 'Hammer', 'Avenger', 'Brandenburger', 'Black Prince']);
// ---- fix-people: the German forms German historians use for the given names of kings, queens and princes ("Eduard
// III.", "Karl IV.", "Johann II. der Gute", "Peter I. der Grausame"), as the German summaries of the realms write them.
// Only names written in the style of a royal person are changed (a regnal number, an epithet, a title after a comma or
// "of" before a place): a courtier from the name pools ("John Percy") keeps the name of his people.
const GIVEN_DE_M: Record<string, string> = {
  Edward: 'Eduard', John: 'Johann', Jean: 'Johann', Juan: 'Johann', João: 'Johann', Joan: 'Johann', Charles: 'Karl', Carlos: 'Karl', Henry: 'Heinrich',
  Henri: 'Heinrich', Enrique: 'Heinrich', Henrique: 'Heinrich', Pedro: 'Peter', Pere: 'Peter', Pierre: 'Peter', Louis: 'Ludwig', Lluís: 'Ludwig',
  Casimir: 'Kasimir', Frederick: 'Friedrich', Philip: 'Philipp', Philippe: 'Philipp', Felipe: 'Philipp', William: 'Wilhelm', Guillaume: 'Wilhelm',
  James: 'Jakob', Jaume: 'Jakob', Jacques: 'Jakob', Alfonso: 'Alfons', Afonso: 'Alfons', Fernando: 'Ferdinand', Ferran: 'Ferdinand',
  Valdemar: 'Waldemar', Christopher: 'Christoph', Eric: 'Erich', Stephen: 'Stephan', Andrew: 'Andreas', Albert: 'Albrecht', Wenceslaus: 'Wenzel',
  Amédée: 'Amadeus', Hugh: 'Hugo', Hugues: 'Hugo', Rupert: 'Ruprecht', Nicholas: 'Nikolaus', Conrad: 'Konrad', Geoffrey: 'Gottfried',
  Godfrey: 'Gottfried', Constantine: 'Konstantin', George: 'Georg', Matthew: 'Matthias', Rudolph: 'Rudolf', Ivan: 'Iwan', Theobald: 'Theobald', Thibaut: 'Theobald',
  Ernest: 'Ernst', Baldwin: 'Balduin', Reinald: 'Rainald', Innocent: 'Innozenz', Clement: 'Clemens', Gregory: 'Gregor', Benedict: 'Benedikt', Boniface: 'Bonifatius',
};
const GIVEN_DE_F: Record<string, string> = {
  Joan: 'Johanna', Joanna: 'Johanna', Jeanne: 'Johanna', Juana: 'Johanna', Mary: 'Maria', Marie: 'Maria', Margaret: 'Margarete', Marguerite: 'Margarete',
  Elizabeth: 'Elisabeth', Isabelle: 'Isabella', Isabel: 'Isabella', Catherine: 'Katharina', Blanche: 'Blanka', Eleanor: 'Eleonore', Beatrice: 'Beatrix',
  Constance: 'Konstanze', Anne: 'Anna', Matilda: 'Mathilde', Bonne: 'Bona', Helvig: 'Hedwig',
};
/** Places after "of" in a name or title that are not in the list of place names, and the lands German writes with an
 *  article ("Herzog der Normandie"). */
const OF_DE: Record<string, string> = { France: 'Frankreich', Gaunt: 'Gent', Slavonia: 'Slawonien', Taranto: 'Tarent', Opava: 'Troppau', Antioch: 'Antiochia',
  Saxe: 'Sachsen', Achaea: 'Achaia', Guelders: 'Geldern', Meissen: 'Meißen', Hormuz: 'Hormus' };
const FEM_LAND = new Set(['Normandie', 'Bretagne', 'Champagne', 'Picardie', 'Gascogne', 'Provence', 'Lombardei', 'Toskana', 'Walachei', 'Moldau', 'Steiermark', 'Pfalz', 'Lausitz', 'Guyenne']);
const TITLE_WORD = /(Herzog|Herzogin|Graf|Gräfin|König|Königin|Prinz|Prinzessin|Markgraf|Fürst|Hüter|Infant|Infantin|Dauphin|Bischof|Fürstbischof|Erzbischof) $/;
/** French epithets ("Jean II le Bon"). */
const EPITHET_FR: Record<string, string> = { Bon: 'der Gute', Mauvais: 'der Böse', Hardi: 'der Kühne', Sage: 'der Weise', Bel: 'der Schöne', Long: 'der Lange', Victorieux: 'der Siegreiche', Grand: 'der Große', Jeune: 'der Junge', Vieux: 'der Alte' };
const placeWord = (w: string) => w.split('-').map((x) => OF_DE[x] ?? PLACE_DE[x] ?? x).join('-');
/** "of Bohemia" → "von Böhmen"; a land German names with its article: "Herzog der Normandie", "Anna von der Walachei". */
const placeDe = (w: string, afterTitle: boolean) => { const d = OF_DE[w] ?? PLACE_DE[w] ?? placeWord(w); return FEM_LAND.has(d) ? `${afterTitle ? '' : 'von '}der ${d}` : `von ${d}`; };
/** Titles and offices that stand for a ruler whose name is not known, and a few set names. */
const STYLE_DE: [RegExp, string][] = [
  [/^Venetian Count and Great Council$/, 'Venezianischer Graf und Großer Rat'], [/^Council of sachems$/, 'Rat der Sachems'], [/\(patrician council\)/, '(Patrizierrat)'],
  [/^Council of the /, 'Rat der '], [/^Council of /, 'Rat of '], [/^(.+) Council$/, 'Rat of $1'], [/^Veche of /, 'Wetsche of '], [/^Consul of /, 'Konsul of '], [/^King of /, 'König of '],
  [/^Chief of the /, 'Häuptling der '], [/ of the Cocom/, ' der Cocom'], [/^Paramount chief/, 'Oberhäuptling'], [/^Priest-chief/, 'Priesterhäuptling'],
  [/\(name unrecorded\)/, '(Name nicht überliefert)'], [/^The Signoria \(Priors and Gonfalonier of Justice\)$/, 'Die Signoria (Prioren und Gonfaloniere der Gerechtigkeit)'],
  [/ of the Tower$/, ' vom Tower'],
];

/** A name as shown in a language: in German, regnal numbers take a full stop ("Peter I."), English and French epithets
 *  are translated ("der Grausame", "die Große", "der Gute"), the given names of royal persons take their German form
 *  ("Eduard", "Karl", "Johanna") and "of" before a place becomes "von" (or "der" before a land German writes with an
 *  article: "Herzog der Normandie"). English is returned unchanged. */
export function localName(name: string | undefined | null, lang: 'en' | 'de', female = false): string {
  if (!name) return '';
  if (lang !== 'de') return name;
  let s = name;
  const royal = /\b[IVXL]+\b/.test(s) || / (of|the) \p{Lu}/u.test(s) || s.includes(', ') || s.includes('(the ');
  for (const [re, de] of STYLE_DE) s = s.replace(re, de);
  const fem = (de: string, ep: string) => (female && !NOUN.has(ep) ? de.replace(/^der /, 'die ') : de);
  // an epithet in brackets: "Edward of Woodstock (the Black Prince)" → "(der Schwarze Prinz)"
  s = s.replace(/\(the ([A-Z][a-z]+(?: [A-Z][a-z]+)?)\)/, (m, ep: string) => {
    if (ep === 'Black Prince') return '(der Schwarze Prinz)';
    const de = EPITHET_DE[ep] ?? (/er$/.test(ep) ? `der ${ep}` : ''); return de ? `(${fem(de, ep)})` : m;
  });
  // epithet at the end: "X the Cruel", "X, the Magnificent", "Jean II le Bon"
  s = s.replace(/(,?) the ([A-Z][a-z]+(?:-[A-Z][a-z]+)?)$/, (m, comma: string, ep: string) => {
    const de = EPITHET_DE[ep]; if (!de) return m;
    return `${comma} ${fem(de, ep)}`;
  });
  s = s.replace(/ le ([A-Z][a-z]+)$/, (m, ep: string) => { const de = EPITHET_FR[ep]; return de ? ` ${fem(de, ep)}` : m; });
  s = s.replace(/ of Iron$/, ' der Eiserne');
  if (royal) {
    // the given names before the first title, place or number: "John Henry, Margrave of Moravia" → "Johann Heinrich, …"
    const table = female ? GIVEN_DE_F : GIVEN_DE_M;
    s = s.replace(/^((?:\p{Lu}[\p{L}]+ ?)+?)(?=$| [IVXL]+\b| of | de | the | der | die | vom |[,(])/u, (head: string) => head.split(' ').map((w) => table[w] ?? w).join(' '));
    // "Philippe de Navarre" → "Philipp von Navarra" (a royal style only; "Jean de Craon" keeps his family name)
    s = s.replace(/ de (\p{Lu}[\p{L}-]+)/gu, (_m, w: string) => ` ${placeDe(w, false)}`);
  }
  // regnal numbers: "Pedro I" → "Pedro I."
  s = s.replace(/(\p{Lu}[\p{L}'’-]*) ([IVXL]+)(?=$|[\s,])/gu, (_m, a: string, num: string) => `${a} ${num}.`);
  // titles after a comma: "Dauphin and Duke" → "Dauphin und Herzog", "4th Earl" → "4. Graf"
  const k = s.indexOf(', ');
  if (k > 0) s = s.slice(0, k) + s.slice(k).replace(/\b(\d+)(?:st|nd|rd|th)\b/g, '$1.').replace(/[A-Za-z-]+/g, (wd) => TITLE_DE[wd] ?? wd);
  // "William of Namur" → "Wilhelm von Namur", "Duke of Normandy" → "Herzog der Normandie" (not "of the …")
  s = s.replace(/ of (?!the )(\p{Lu}[\p{L}-]*)/gu, (_m, w: string, at: number, all: string) => ` ${placeDe(w, TITLE_WORD.test(all.slice(0, at + 1)))}`);
  return s;
}

/** A house as German writes it ("Luxembourg" → "Luxemburg", "Burgundy-Ivrea (Anscarid)" → "Burgund-Ivrea (Anskarier)"). */
const HOUSE_NOTE_DE: Record<string, string> = { Anscarid: 'Anskarier', Portuguese: 'portugiesische Linie', 'patrician council': 'Patrizierrat' };
const HOUSE_WORD_DE: Record<string, string> = { Griffins: 'Greifen', Capetian: 'Kapetingisches', Kings: 'Könige' };
const LINE_DE: Record<string, string> = { Franconian: 'fränkische', Swabian: 'schwäbische', Ottonian: 'ottonische', Masovian: 'masowische', Palatine: 'pfälzische', Sicilian: 'sizilianische' };
export function localHouse(house: string | undefined | null, lang: 'en' | 'de'): string {
  if (!house) return '';
  if (lang !== 'de') return house;
  return house.replace(/\(([^)]+) line\)/, (_m, x: string) => (LINE_DE[x] ? `(${LINE_DE[x]} Linie)` : `(Linie ${x})`))
    .replace(/\(([^)]+)\)/, (m, x: string) => `(${HOUSE_NOTE_DE[x] ?? x})`)
    .replace(/^Council of the /, 'Rat der ').replace(/House of /g, 'Haus ').replace(/ of /g, ' von ')
    .replace(/\p{Lu}[\p{L}]+/gu, (w) => HOUSE_WORD_DE[w] ?? OF_DE[w] ?? (/sches$/.test(PLACE_DE[w] ?? '') ? w : PLACE_DE[w] ?? w));
}

// ---- fix-people: a German name in the accusative or dative (event texts: "fragt Peter I. den Grausamen")
/** The epithet of a German royal name declined for the case: after the regnal number ("Peter I. der Grausame" →
 *  "den Grausamen", "dem Grausamen"), in brackets ("(der Schwarze Prinz)" → "(den Schwarzen Prinzen)"), or after a
 *  lone given name ("Margarete die Große" → dative "der Großen"). Titles ("Herzog der Normandie") stay as they are. */
export function declineDe(name: string, female: boolean, kase: 'nom' | 'acc' | 'dat'): string {
  if (kase === 'nom') return name;
  const art = female ? (kase === 'dat' ? 'der' : 'die') : kase === 'dat' ? 'dem' : 'den';
  const weak = !female || kase === 'dat'; // die Große (acc) keeps the ending; der Großen, den Großen, dem Großen
  const ep = (s: string) => s.split(' ').map((w) => (weak && /e$/.test(w) ? `${w}n` : !female && w === 'Prinz' ? 'Prinzen' : w)).join(' ');
  return name
    .replace(/( [IVXLC]+\.) (der|die) ([A-ZÄÖÜ][^()]*)$/, (_m, num, _a, e) => `${num} ${art} ${ep(e)}`)
    .replace(/\((der|die) ([^)]+)\)/, (_m, _a, e) => `(${art} ${ep(e)})`)
    .replace(/^(\S+) (der|die) ([A-ZÄÖÜ][^(),]*)$/, (_m, g, _a, e) => `${g} ${art} ${ep(e)}`);
}
/** Which case a German event text asks of the name that follows this word ("bittet {ruler}" → accusative, "von
 *  {ruler}" → dative); a word not listed leaves the nominative. */
const DE_DAT = new Set(['von', 'vom', 'zu', 'mit', 'bei', 'nach', 'aus', 'seit', 'gegenüber', 'zeigt', 'bietet', 'bieten', 'trugen', 'seien', 'gehorcht', 'dient', 'dienen', 'schreibt']);
const DE_ACC = new Set(['bitten', 'bittet', 'fragt', 'fragen', 'erinnern', 'erinnert', 'fleht', 'flehen', 'drängen', 'drängt', 'an', 'für', 'gegen', 'um', 'durch', 'ohne', 'verspricht', 'ehrt', 'ehren', 'grüßt', 'grüßen']);
export function caseAfterDe(word: string): 'nom' | 'acc' | 'dat' {
  const w = word.toLowerCase().replace(/[^a-zäöüß]/g, '');
  return DE_DAT.has(w) ? 'dat' : DE_ACC.has(w) ? 'acc' : 'nom';
}
