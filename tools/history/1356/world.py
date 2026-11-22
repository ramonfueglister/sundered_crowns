"""The realms of 1 January 1356 in the world beyond the game map (east of 70° E, west of 100° W, south of 38° S),
for the places that tools/geo/build_beyond.py adds. Writes data/history/1356/world_beyond.json in the shape of the
other state files of 1356 (data/history/1356/*.json).

Every place is given with its coordinates ('Name@lat,lon'). Where the sources disagree or are thin (the chronicles of
Arakan, Kamata, Champa, Angkor, Jaffna, the Shan of Mong Mao), the record says so in dynasty_note. Colours are
placeholders: tools/map/palette.py chooses them.

Extra anchors for realms of the game map that reach beyond it (the Golden Horde's eastern steppe, the Purépecha west
of 100° W) are in EXTENDS: the spread of tools/geo/beyond_holders.py starts from them too.

The realms of East, South and South-East Asia are in world_east_asia.py, world_south_asia.py and
world_southeast_asia.py, those of the Philippines, the Pacific and the Americas below; the record of a realm is built
by world_lib.py, the peoples are in world_peoples.py.

Run: python3 tools/history/1356/world.py
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
from world_east_asia import STATES as EAST_ASIA
from world_lib import P, S
from world_peoples import DEMOGRAPHY, NEW_IDS
from world_south_asia import STATES as SOUTH_ASIA
from world_southeast_asia import STATES as SOUTHEAST_ASIA

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))


SOURCES = [
    'Wang Dayuan, Daoyi Zhilüe (1349); W. H. Scott, Barangay: Sixteenth-Century Philippine Culture and Society (1994); L. L. Junker, Raiding, Trading, and Feasting (1999)',
    'F. W. Mote and D. Twitchett (eds.), The Cambridge History of China vol. 6 (Alien Regimes and Border States) and vol. 7 (The Ming Dynasty, part 1), 1988-1994',
    'J. W. Dardess, Conquerors and Confucians: Aspects of Political Change in Late Yuan China (1973)',
    'R. Grousset, The Empire of the Steppes (1970)',
    'B. F. Manz, The Rise and Rule of Tamerlane (1989)',
    'P. Jackson, The Delhi Sultanate: A Political and Military History (1999)',
    'R. M. Eaton, A Social History of the Deccan 1300-1761 (2005); R. M. Eaton, The Rise of Islam and the Bengal Frontier (1993)',
    'B. Stein, Vijayanagara (New Cambridge History of India I.2, 1989)',
    'N. Tarling (ed.), The Cambridge History of Southeast Asia vol. 1 (1992)',
    'V. Lieberman, Strange Parallels vol. 1 (2003)',
    'K. W. Taylor, A History of the Vietnamese (2013)',
    'M. Vickery, Cambodia after Angkor (1977); D. K. Wyatt, Thailand: A Short History (2003)',
    'M. C. Ricklefs, A History of Modern Indonesia since c.1200 (2008); Nagarakretagama (1365)',
    'K. Yamamura (ed.), The Cambridge History of Japan vol. 3 (Medieval Japan, 1990)',
    'Ki-baik Lee, A New History of Korea (1984)',
    'W. D. Shakabpa, Tibet: A Political History (1967); L. Petech, Central Tibet and the Mongols (1990)',
    'K. M. de Silva, A History of Sri Lanka (1981)',
    'Ibn Battuta, Rihla (travels 1333-1347 in India, the Maldives, Sumatra and China)',
    'G. H. Kerr, Okinawa: The History of an Island People (1958)',
    'Cambridge History of the Native Peoples of the Americas vol. 1 and 2',
]

NOTES = [
    "China on 1 January 1356: the Yuan court still holds the north, the south-west and the south coast, but the Red Turban rising of 1351 has split the Yangzi: the Song of Han Lin'er (Longfeng, Liu Futong) in the Huai, Xu Shouhui's Tianwan on the middle Yangzi, Zhang Shicheng at Gaoyou (he takes Suzhou in the spring of 1356), Zhu Yuanzhang at Hezhou (he takes Nanjing in April 1356) and Fang Guozhen on the Zhejiang coast, who has taken Yuan offices.",
    'Japan is split between the Northern Court of Kyoto with the Ashikaga shoguns and the Southern Court of Go-Murakami, whose strength in 1356 lies in Yoshino and with the Kikuchi in Kyushu.',
    "Rulers whose names or dates are uncertain in the sources (Angkor, Champa, Arakan, Kamata, Jaffna, Mong Mao, Tu'i Tonga) are flagged in dynasty_note.",
]

states = (
    EAST_ASIA
    + SOUTH_ASIA
    + SOUTHEAST_ASIA
    + [
        # ------------------------------------------------------------------------------------------------ the Philippines
        # Wang Dayuan's Daoyi Zhilüe (1349) describes Ma-i, Sulu and the ports of Luzon as he saw them; no ruler of 1356 is
        # named in any source, so the rulers below are their offices, not persons (W. H. Scott, Barangay, 1994; L. L. Junker,
        # Raiding, Trading, and Feasting, 1999).
        S(
            'tondo',
            ('Polity of Tondo', 'Tondo'),
            ('Tondo', 'Tondo'),
            ('Tagalog', 'tagalisch'),
            'chiefdom',
            'tribal_federation',
            'tagalog',
            'anitism',
            'Tondo@14.62,120.97',
            ['Bai@14.18,121.28', 'Pila@14.23,121.36', 'Malolos@14.84,120.81'],
            P('Lakan of Tondo', 1310, 'Tondo', 2, 2, 2),
            None,
            None,
            'Paramount chiefs (lakan) of the Pasig delta and Laguna de Bay; the name of the lakan of 1356 is not recorded. Tondo sends tribute to the Ming from 1373 as Luzon.',
            pers='trader',
            diff=1,
            field='azure',
            reach=150,
            en='On the delta of the Pasig the lakan of Tondo gathers the datus of Manila Bay and the lake of Bai, and trades rice and gold for Chinese porcelain and silk.',
            de='Am Delta des Pasig sammelt der Lakan von Tondo die Datus der Bucht von Manila und des Sees von Bai und tauscht Reis und Gold gegen chinesisches Porzellan und Seide.',
        ),
        S(
            'ma_i',
            ('Ma-i', 'Ma-i'),
            ('Ma-i', 'Ma-i'),
            ('Ma-i', 'ma-iisch'),
            'chiefdom',
            'tribal_federation',
            'tagalog',
            'anitism',
            'Puerto Galera@13.50,120.95',
            ['Calapan@13.41,121.18'],
            P('Datu of Ma-i', 1315, 'Ma-i', 2, 2, 1),
            None,
            None,
            'The Ma-i of the Chinese records (Zhao Rugua 1225, Wang Dayuan 1349), most likely on Mindoro; its datus are not named.',
            pers='trader',
            diff=1,
            field='vert',
            reach=90,
            en='Chinese junks call at Ma-i on Mindoro, where the datu keeps their goods under his protection until his people have traded them along the islands.',
            de='Chinesische Dschunken legen in Ma-i auf Mindoro an, wo der Datu ihre Waren schützt, bis seine Leute sie entlang der Inseln eingetauscht haben.',
        ),
        S(
            'butuan',
            ('Rajahnate of Butuan', 'Rajahnat Butuan'),
            ('Butuan', 'Butuan'),
            ('Butuanon', 'butuanisch'),
            'chiefdom',
            'tribal_federation',
            'tagalog',
            'anitism',
            'Butuan@8.95,125.54',
            ['Surigao@9.78,125.49'],
            P('Rajah of Butuan', 1305, 'Butuan', 2, 2, 2),
            None,
            None,
            'Butuan sent envoys to the Song from 1001; its boats and gold work are known from excavation. No ruler of the 14th century is named.',
            pers='trader',
            diff=1,
            field='or',
            reach=140,
            en='At the mouth of the Agusan the rajah of Butuan trades the gold of the Mindanao rivers for Chinese wares, as his forebears did when they sent envoys to the Song.',
            de='An der Mündung des Agusan tauscht der Rajah von Butuan das Gold der Flüsse Mindanaos gegen chinesische Waren, wie seine Vorfahren, als sie Gesandte zu den Song schickten.',
        ),
        S(
            'sulu',
            ('Sulu', 'Sulu'),
            ('Sulu', 'Sulu'),
            ('Tausug', 'tausugisch'),
            'chiefdom',
            'tribal_federation',
            'tagalog',
            'anitism',
            'Buansa@6.05,121.00',
            ['Siasi@5.55,120.81', 'Basilan@6.70,121.97'],
            P('Datu of Sulu', 1310, 'Sulu', 2, 2, 3),
            None,
            None,
            "Wang Dayuan (1349) praises the pearls of Sulu; in 1369 the Sulu sack Po-ni (Brunei). Muslim traders such as Tuan Masha'ika have settled, but the sultanate comes only in the 15th century.",
            pers='aggressive',
            diff=1,
            field='sable',
            reach=110,
            en='The datus of Sulu dive for the finest pearls of the southern seas and sail out to raid; Muslim merchants have begun to settle at Buansa.',
            de='Die Datus von Sulu tauchen nach den schönsten Perlen der südlichen Meere und segeln zu Raubzügen aus; in Buansa haben sich muslimische Kaufleute niedergelassen.',
        ),
        # ------------------------------------------------------------------------------------------------ the Pacific and the Americas
        S(
            'tui_tonga',
            ('Tuʻi Tonga', 'Tuʻi Tonga'),
            ('Tonga', 'Tonga'),
            ('Tongan', 'tongaisch'),
            'empire',
            'tribal_federation',
            'polynesian',
            'polynesian_faith',
            'Lapaha@-21.15,-175.18',
            ['Vavaʻu@-18.65,-173.98', 'Haʻapai@-19.80,-174.35', 'ʻUvea@-13.29,-176.20'],
            P('Tuʻi Tonga', 1310, 'Tuʻi Tonga', 3, 3, 3, 'pious'),
            None,
            None,
            'The sacred Tuʻi Tonga line at Lapaha on Tongatapu, whose sway reached Samoa, ʻUvea and Futuna; the holder of the title in 1356 is not certain.',
            pers='conqueror',
            diff=1,
            field='gules',
            en='Across the southern Pacific the sacred kings of Tonga receive the first fruits of islands far over the sea, carried in great double canoes.',
            de='Über den Südpazifik empfangen die heiligen Könige Tongas die ersten Früchte von Inseln weit über dem Meer, gebracht in großen Doppelkanus.',
        ),
        S(
            'paquime',
            ('Paquimé', 'Paquimé'),
            ('Paquimé', 'Paquimé'),
            ('Paquimé', 'paquimé'),
            'chiefdom',
            'tribal_federation',
            'puebloan',
            'american_traditional',
            'Paquimé@30.37,-107.95',
            ['Janos@30.89,-108.19', 'Babícora@29.30,-107.75'],
            P('Lords of Paquimé', 1310, None, 3, 3, 2),
            None,
            None,
            'Casas Grandes (Paquimé), a town of multi-storey adobe houses, ball courts and macaw pens at its height c.1300-1450; its rulers are unknown.',
            pers='trader',
            diff=1,
            field='or',
            en='In the valley of the Casas Grandes stands Paquimé, a town of adobe towers where macaws are bred for their feathers and shell and copper come in from far away.',
            de='Im Tal der Casas Grandes steht Paquimé, eine Stadt aus Lehmtürmen, in der Aras um ihrer Federn willen gezüchtet werden und Muscheln und Kupfer von weit her kommen.',
        ),
    ]
)

# realms of the game map whose lands reach beyond it: more places for the spread to start from
EXTENDS = {
    'golden_horde': [
        'Ulus of Orda (Irtysh)@50.40,76.00',
        'Ishim steppe@52.00,71.50',
        'Balkhash steppe@46.50,74.50',
        'Semirechye north@45.50,77.50',
    ],
    'chagatai': ['Ferghana@40.39,71.78', 'Osh@40.53,72.80', 'Andijan@40.78,72.34', 'Badakhshan@37.10,70.60'],
    'purepecha': [
        'Tzintzuntzan@19.63,-101.58',
        'Pátzcuaro@19.51,-101.61',
        'Uruapan@19.42,-102.06',
        'Zacapu@19.81,-101.79',
    ],
    'kart': ['Ghazni@33.55,68.42'],
}


if __name__ == '__main__':
    out = {
        'region': 'world_beyond',
        'year': 1356,
        'date': '1356-01-01',
        'sources': SOURCES,
        'new_ids': NEW_IDS,
        'notes': NOTES,
        'states': states,
        'wars': [
            {
                'name': {'en': 'Red Turban Rebellion', 'de': 'Aufstand der Roten Turbane'},
                'attackers': ['song_red_turban', 'tianwan', 'zhu_yuanzhang'],
                'defenders': ['yuan'],
                'since': 1351,
                'goal': 'independence',
            },
            {
                'name': {'en': 'Nanboku-chō War', 'de': 'Krieg der Nord- und Südhöfe'},
                'attackers': ['southern_court'],
                'defenders': ['ashikaga'],
                'since': 1336,
                'goal': 'succession',
            },
        ],
        'extends': EXTENDS,
        'demography': DEMOGRAPHY,
    }
    path = os.path.join(ROOT, 'data', 'history', '1356', 'world_beyond.json')
    Path(path).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    print(len(states), 'realms written to', path)
