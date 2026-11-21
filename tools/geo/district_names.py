"""Names for the rural locations that have none (stage D, build_setup.py, and the lands beyond, merge_beyond.py):
district names made of the syllables of the location's group of cultures.
"""

import hashlib

SYL = {
    'german': (
        [
            'Al',
            'Bern',
            'Eber',
            'Hohen',
            'Wald',
            'Ober',
            'Nieder',
            'Rot',
            'Schön',
            'Lich',
            'Ried',
            'Hart',
            'Wolf',
            'Mar',
            'Gun',
            'Otten',
            'Hilde',
            'Reichen',
            'Stein',
            'Ell',
        ],
        [
            'dorf',
            'heim',
            'bach',
            'hausen',
            'burg',
            'feld',
            'stadt',
            'rode',
            'au',
            'berg',
            'ingen',
            'stein',
            'walde',
            'hofen',
        ],
    ),
    'gallic': (
        [
            'Ville',
            'Mont',
            'Beau',
            'Saint-Ger',
            'Châtel',
            'Ro',
            'Ber',
            'Fon',
            'Mar',
            'Belle',
            'Cor',
            'Ver',
            'Sau',
            'Aur',
        ],
        ['ville', 'court', 'mont', 'ac', 'y', 'ières', 'eux', 'ay', 'igny', 'ens', 'ois'],
    ),
    'iberian': (
        ['Villa', 'Torre', 'Val', 'Fuen', 'Al', 'Castro', 'Mon', 'Ri', 'San', 'Medina', 'Ara', 'Bena'],
        ['real', 'franca', 'mayor', 'dolid', 'cázar', 'verde', 'nueva', 'ejo', 'illa', 'osa', 'ena'],
    ),
    'italian': (
        ['Castel', 'Monte', 'San', 'Villa', 'Borgo', 'Roc', 'Val', 'Ponte', 'Cas', 'Ter', 'Fio'],
        ['nuovo', 'franco', 'alto', 'ana', 'ello', 'one', 'ano', 'ina', 'occhio', 'aro'],
    ),
    'west_slavic': (
        ['Bro', 'Dob', 'Kra', 'Lub', 'Pr', 'Sob', 'Wol', 'Zab', 'Chot', 'Nov', 'Bel', 'Star', 'Hrad'],
        ['ice', 'ów', 'ina', 'ec', 'any', 'ov', 'ín', 'ice', 'nik', 'sko'],
    ),
    'east_slavic': (
        ['Bel', 'Gor', 'Kras', 'Nov', 'Ol', 'Sem', 'Star', 'Vol', 'Zar', 'Ples', 'Dub', 'Lyub', 'Rad'],
        ['ovo', 'sk', 'ets', 'ino', 'gorod', 'itsy', 'any', 'ichi', 'evo', 'ograd'],
    ),
    'south_slavic': (
        ['Bel', 'Gor', 'Kru', 'Nov', 'Ra', 'Slav', 'Vel', 'Zla', 'Pri', 'Dra', 'Stu'],
        ['ac', 'ovo', 'ica', 'ište', 'evo', 'grad', 'jane', 'ina'],
    ),
    'baltic': (
        ['Ker', 'Pa', 'Rag', 'Tel', 'Vil', 'Ža', 'Gir', 'Lau', 'Mer', 'Dar'],
        ['ai', 'iai', 'ava', 'ėnai', 'upis', 'ys', 'iškis'],
    ),
    'finnic': (
        ['Ka', 'Lah', 'Mus', 'Pih', 'Rau', 'Sal', 'Tai', 'Vil', 'Kok', 'Jär'],
        ['la', 'koski', 'järvi', 'mäki', 'salo', 'nen', 'pää'],
    ),
    'norse': (
        ['Ås', 'Ber', 'Dal', 'Fjell', 'Hol', 'Lund', 'Sand', 'Ström', 'Vik', 'Tor', 'Bjør'],
        ['by', 'stad', 'vik', 'sund', 'heim', 'holm', 'ås', 'rud'],
    ),
    'british': (
        ['Ash', 'Brad', 'Chad', 'Hart', 'Kings', 'Lang', 'Mar', 'Nor', 'Stan', 'Wey', 'Bal', 'Kil', 'Dun'],
        ['ton', 'ford', 'ley', 'bury', 'ham', 'wick', 'by', 'field', 'more', 'ock'],
    ),
    'low_lands': (
        ['Ber', 'Dor', 'Hol', 'Mid', 'Oost', 'Zuid', 'Wes', 'Bre', 'Gro'],
        ['dam', 'drecht', 'hem', 'kerke', 'zele', 'wijk', 'gem', 'loo', 'sum'],
    ),
    'carpathian': (
        ['Bé', 'Fel', 'Ke', 'Sze', 'Tö', 'Vár', 'Al', 'Ne', 'Ho', 'Mi'],
        ['falva', 'háza', 'egyháza', 'telek', 'vár', 'eni', 'ești', 'hely'],
    ),
    'hellenic': (
        ['Agio', 'Kali', 'Neo', 'Pala', 'Ka', 'Me', 'Lith', 'Ther'],
        ['khori', 'polis', 'kastro', 'ni', 'ada', 'one', 'ia'],
    ),
    'turkic': (
        ['Ak', 'Kara', 'Kızıl', 'Yeni', 'Ulu', 'Eski', 'Sarı', 'Kum', 'Bey', 'Ala'],
        ['köy', 'hisar', 'su', 'pınar', 'kent', 'tepe', 'çay', 'ova', 'dağ'],
    ),
    'arab': (
        ['Al-', 'Bir ', 'Dar ', 'Kafr ', 'Tell ', 'Wadi ', 'Ain ', 'Qasr ', 'Ras '],
        ['Hamra', 'Kabir', 'Qadim', 'Nakhl', 'Bayda', 'Sharqi', 'Gharbi', 'Rumman', 'Zaytun', 'Jadid'],
    ),
    'berber': (
        ['Ait ', 'Tizi ', 'Tala ', 'Igh', 'Tin', 'Agadir '],
        ['Ouzzal', 'Ifri', 'Amlal', 'Ouzou', 'Ghir', 'Tazert', 'Iminen'],
    ),
    'iranian': (
        ['Deh', 'Kuh', 'Shah', 'Bagh', 'Ab', 'Chah', 'Ruz', 'Kal'],
        ['abad', 'an', 'shahr', 'deh', 'gerd', 'rud', 'sar'],
    ),
    'caucasian': (['Mtsk', 'Tsi', 'Ani', 'Ga', 'Vard', 'Kar', 'Ale'], ['eti', 'shen', 'avan', 'uri', 'kert', 'ani']),
}

CULT_GROUP = {}
for grp, members in {
    'british': 'english scottish irish welsh',
    'gallic': 'french occitan breton picard burgundian_fr',
    'iberian': 'castilian portuguese galician catalan aragonese basque',
    'low_lands': 'flemish hollandic frisian',
    'german': 'low_saxon central_german bavarian alemannic franconian rhinelander prussian_german ashkenazi',
    'italian': 'tuscan lombard venetian ligurian neapolitan sicilian sardinian roman',
    'west_slavic': 'czech slovak polish silesian sorbian pomeranian',
    'east_slavic': 'russian ruthenian novgorodian',
    'south_slavic': 'croatian serbian bosnian bulgarian slovene',
    'baltic': 'lithuanian latvian old_prussian samogitian',
    'finnic': 'finnish estonian karelian sami mordvin komi',
    'norse': 'swedish danish norwegian icelandic',
    'carpathian': 'hungarian vlach szekely',
    'hellenic': 'greek albanian',
    'caucasian': 'armenian georgian circassian',
    'turkic': 'anatolian_turkish turkmen tatar bashkir crimean azeri kipchak_nomad mongol',
    'arab': 'maghrebi egyptian_arab levantine iraqi_arab bedouin hejazi yemeni andalusi sephardi',
    'berber': 'berber tuareg guanche',
    'iranian': 'persian kurdish lur baluch',
}.items():
    for m in members.split():
        CULT_GROUP[m] = grp


def gen_name(cult, i, used, lo, la):
    grp = CULT_GROUP.get(cult)
    h = int(hashlib.md5(f'{cult}-{i}'.encode()).hexdigest(), 16)
    if grp is None:
        # peoples outside the European naming sets: describe the district neutrally
        return f'{"Upland" if h % 2 else "Lowland"} district {i % 997}'
    a, b = SYL[grp]
    for k in range(20):
        nm = a[(h >> (k * 3)) % len(a)] + b[(h >> (k * 5 + 7)) % len(b)]
        if nm not in used:
            return nm
    return nm + f' {i % 97}'


def add_peoples_beyond():
    """Adds the syllables and the groups of the peoples beyond the game map (merge_beyond.py), built as those of
    Europe (prefix + suffix). Stage D (build_setup.py) names the game map without them."""
    SYL.update(
        {
            'sinic': (
                [
                    'Ping',
                    'An',
                    'Chang',
                    'Lin',
                    'Shan',
                    'He',
                    'Nan',
                    'Bei',
                    'Dong',
                    'Xi',
                    'Feng',
                    'Yong',
                    'Jin',
                    'Qing',
                    'Huai',
                    'Gao',
                    'Bao',
                    'Fu',
                    'Ning',
                    'Long',
                ],
                [
                    'zhou',
                    'cheng',
                    'xian',
                    'ling',
                    'yang',
                    'an',
                    'shan',
                    'kou',
                    'jiang',
                    'ping',
                    'de',
                    'yuan',
                    'tai',
                    'hua',
                ],
            ),
            'japonic': (
                [
                    'Taka',
                    'Naka',
                    'Kawa',
                    'Yama',
                    'Matsu',
                    'Oka',
                    'Hira',
                    'Fuku',
                    'Kita',
                    'Minami',
                    'Shima',
                    'Asa',
                    'Mori',
                    'Ise',
                    'Toyo',
                ],
                ['saki', 'mura', 'hara', 'da', 'yama', 'shima', 'gawa', 'no', 'oka', 'zawa', 'ta', 'ura'],
            ),
            'korean': (
                ['Gwang', 'Cheong', 'Yeong', 'Hae', 'Nam', 'Seo', 'Jin', 'Hwa', 'Mun', 'Pyeong', 'Dan', 'Ok'],
                ['ju', 'san', 'won', 'cheon', 'yang', 'seong', 'chang', 'do'],
            ),
            'indic': (
                [
                    'Rama',
                    'Chandra',
                    'Deva',
                    'Sri',
                    'Hari',
                    'Vijaya',
                    'Shiva',
                    'Ratna',
                    'Kanaka',
                    'Bhima',
                    'Indra',
                    'Gopal',
                    'Lakshmi',
                    'Narayan',
                    'Sona',
                    'Kali',
                ],
                ['pur', 'nagar', 'garh', 'abad', 'kot', 'ganj', 'pura', 'gaon', 'wara', 'ghat', 'patan'],
            ),
            'dravidian': (
                ['Kanchi', 'Tiru', 'Palla', 'Kumba', 'Vella', 'Manga', 'Kolla', 'Anna', 'Siru', 'Peri', 'Mel', 'Kil'],
                ['puram', 'palli', 'ur', 'koil', 'nadu', 'kottai', 'pettai', 'kudi'],
            ),
            'tai': (
                ['Chiang ', 'Muang ', 'Ban ', 'Nong ', 'Wiang ', 'Phra ', 'Na ', 'Mae '],
                ['Rai', 'Kham', 'Thong', 'Saen', 'Luang', 'Khao', 'Yai', 'Noi', 'Kaeo', 'Chan'],
            ),
            'austroasiatic': (
                ['Thanh ', 'Phú ', 'An ', 'Vĩnh ', 'Long ', 'Bình ', 'Kampong ', 'Prey ', 'Phnom ', 'Svay '],
                ['Hòa', 'Yên', 'Định', 'Xuân', 'Lộc', 'Thom', 'Chas', 'Srei', 'Meas', 'Sơn'],
            ),
            'austronesian': (
                ['Kota ', 'Tanjung ', 'Sungai ', 'Batu ', 'Bukit ', 'Muara ', 'Kuala ', 'Pulau ', 'Teluk '],
                ['Besar', 'Lama', 'Raja', 'Mas', 'Tinggi', 'Putih', 'Merah', 'Baru', 'Panjang', 'Kecil'],
            ),
            'tibeto_burman': (
                ['Myit', 'Taung', 'Nyaung', 'Shwe', 'Kyauk', 'Pyin', 'Gya', 'Nyang', 'Lho', 'Dra', 'Tsang', 'Ri'],
                ['gyi', 'oo', 'myo', 'pin', 'daw', 'kar', 'tse', 'gang', 'ling', 'rong', 'thang'],
            ),
            'polynesian': (
                ['Moto', 'Hau', 'Kai', 'Lani', 'Ma', 'Wai', 'Puke', 'Rangi', 'Tai', 'Hono'],
                ['nui', 'ka', 'loa', 'iti', 'tea', 'roa', 'kau', 'pua'],
            ),
            'mongolic': (
                ['Ulaan', 'Khar', 'Tsagaan', 'Shar', 'Ikh', 'Baga', 'Khongor', 'Altan', 'Bayan'],
                ['tolgoi', 'gol', 'nuur', 'bulag', 'khoshuu', 'uul', 'tal'],
            ),
        }
    )
    for grp, members in {
        'sinic': 'han jurchen',
        'japonic': 'japanese ryukyuan',
        'korean': 'korean',
        'indic': 'hindustani bengali kashmiri dakhini rajput nepali assamese odia sinhala dhivehi gujarati punjabi newar',
        'dravidian': 'kannada tamil telugu malayali',
        'tai': 'thai lao shan ahom',
        'austroasiatic': 'vietnamese khmer mon',
        'austronesian': 'cham javanese sundanese malay bugis tagalog',
        'tibeto_burman': 'tibetan burmese arakanese',
        'polynesian': 'polynesian maori',
        'mongolic': 'mongol',
        'turkic': 'chagatai_turkic uyghur',
    }.items():
        for m in members.split():
            CULT_GROUP[m] = grp
