"""Culture, faith and minority of the places on 1 January 1291 where they differ from those of 1356.

The places start from public/data/setup_1356.json (data/history/1356/demography.json: 1000 anchors, the nearest anchor
gives a place its culture, faith and minority). Between 1291 and 1356 lie the Turkish conquest of Byzantine Asia Minor,
the Islamisation of the Golden Horde, the fall of the crusader states, the end of Muslim Lucera, the Christian
settlement of Valencia and of Prussia and the expulsion of the Jews from France: for these, the rules below give the
places of 1291 what they had then. Each rule names its sources; a number no source gives is marked as an assumption.

A rule picks places by their holder in 1291 (public/data/setup_1291.json, built by build.py before the rules are
applied), by their culture, faith or minority of 1356, by a box of longitude and latitude, by name, and by the people
of their towns (towns.py); then sets culture, faith and/or minority. "$old" in a minority stands for the culture or
faith the place had before the rule.

Writes data/history/1291/peoples.json, which build.py applies. Run: python3 tools/history/1291/peoples.py
"""

import json
import os
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))

VRYONIS = (
    'S. Vryonis, The Decline of Medieval Hellenism in Asia Minor and the Process of Islamization from the Eleventh '
    'through the Fifteenth Century (1971): the Greek Christian population of western Asia Minor under Byzantine rule '
    'until the Turkish conquests of c. 1300-1337'
)
FOSS = (
    'C. Foss, "The Defenses of Asia Minor against the Turks", Greek Orthodox Theological Review 27 (1982); and the '
    'dates of the Ottoman conquests in Bithynia: Prusa 1326, Nicaea 1331, Nicomedia 1337'
)
DEWEESE = (
    'D. DeWeese, Islamization and Native Religion in the Golden Horde (1994): Islam became the faith of the Horde '
    'under Özbeg Khan (r. 1313-1341); before him the khans after Berke and most of the nomads kept the steppe religion, '
    'while Muslims lived in the towns (Sarai, Bolghar, Crimea) and in Volga Bulgaria (Muslim since 922)'
)
CODEX = (
    'Codex Cumanicus (Caffa, c. 1303, Biblioteca Marciana): the Kipchak (Cuman) language of the steppe and of the Crimea '
    'around 1300; the name "Crimean Tatar" belongs to a later people'
)
BEREND = (
    'N. Berend, At the Gate of Christendom: Jews, Muslims and "Pagans" in Medieval Hungary c. 1000-c. 1300 (2001): '
    'the Cumans settled in Hungary in 1239/1246 were still largely pagan; the Cuman laws of 1279 demanded their '
    'conversion, which took until the 14th century'
)
ACRE = (
    'The fall of the crusader states in 1291: Acre 18 May, Tyre 19 May, Sidon July, Beirut 31 July, Tortosa 3 August '
    '(P. M. Holt, The Age of the Crusades, 1986; D. Jacoby, "Aspects of Everyday Life in Frankish Acre", Crusades 4, '
    '2005): on 1 January 1291 they were Frankish towns, Acre with a Latin (Frankish and Italian) majority'
)
ELLENBLUM = (
    'R. Ellenblum, Frankish Rural Settlement in the Latin Kingdom of Jerusalem (1998): the countryside of the '
    'kingdom was Arabic-speaking, with many Eastern (Melkite) Christians'
)
CILICIA = (
    'T. S. R. Boase (ed.), The Cilician Kingdom of Armenia (1978): in 1291 the kingdom held the plain of Cilicia '
    '(Sis, Adana, Tarsus, Mamistra, Ayas) with an Armenian, Greek and Syriac population; the Turkmen lords '
    '(Ramadanids) took Adana only in the 1350s'
)
TAYLOR = (
    'J. A. Taylor, Muslims in Medieval Italy: The Colony at Lucera (2003): the Muslims of Sicily, settled at Lucera by '
    'Frederick II from 1224, lived there until Charles II of Anjou destroyed the colony in August 1300; '
    'Charles I settled Provençal Christians there in the 1270s'
)
BURNS = (
    'R. I. Burns, Islam under the Crusaders: Colonial Survival in the Thirteenth-Century Kingdom of Valencia (1973) '
    'and Muslims, Christians, and Jews in the Crusader Kingdom of Valencia (1984): in the 13th century the Muslims '
    '(Mudejars) were the majority of the kingdom outside the city of Valencia, which the conquest of 1238 had '
    'emptied of them; Christian settlers held the city and the towns'
)
PRUSSIA = (
    'H. Boockmann, Der Deutsche Orden (1981) and W. Urban, The Prussian Crusade (1980): Prussia was conquered by '
    '1283; German settlement before 1300 was in the Kulmerland, along the Vistula (Thorn, Kulm, Graudenz, '
    'Marienwerder, Marienburg, Christburg, Elbing) and in the towns Braunsberg (1284) and Königsberg (1286); '
    'the towns further inland date from the 14th century (Heilsberg 1308, Osterode 1329, Bartenstein 1332, '
    'Allenstein 1353, Rastenburg 1357), so the land east of the Passarge was still Old Prussian'
)
JORDAN = (
    'W. C. Jordan, The French Monarchy and the Jews: From Philip Augustus to the Last Capetians (1989): the Jews '
    'lived in the royal domain until Philip IV expelled them in 1306 (Gascony had expelled them in 1287, Anjou and '
    'Maine in 1289, England in 1290); the setup of 1356 has none in royal France'
)


def rule(id, where, sources, note, set=None, minority='keep', assumption=None):
    """`minority`: 'keep' leaves it, None clears it, a list sets it, a dict changes it (see apply)."""
    r = {'id': id, 'where': where, 'sources': sources, 'note': note}
    if set:
        r['set'] = set
    if minority != 'keep':
        r['minority'] = minority
    if assumption:
        r['assumption'] = assumption
    return r


RULES = [
    rule(
        'byzantine_asia_minor',
        {'owner': ['byzantium'], 'culture': ['anatolian_turkish', 'turkmen']},
        [VRYONIS, FOSS],
        'The places of Asia Minor that Byzantium still held in 1291 (Bithynia, Mysia, Lydia, Smyrna, Philadelphia) '
        'were Greek and Orthodox; the setup of 1356 has the Turks who conquered them between 1300 and 1337.',
        set={'culture': 'greek', 'faith': 'orthodox'},
        minority=None,
    ),
    rule(
        'crimea_kipchak',
        {'culture': ['crimean']},
        [CODEX],
        'The Turkic people of the Crimea around 1300 were Kipchaks (Cumans).',
        set={'culture': 'kipchak_nomad'},
    ),
    rule(
        'horde_steppe_faith',
        {
            'owner': ['golden_horde', 'nogai'],
            'culture': ['tatar', 'kipchak_nomad'],
            'faith': ['sunni'],
            'box': [25, 40, 90, 62],
            'not_box': [47, 53.5, 53.5, 57],
            'town_below': 5000,
        },
        [DEWEESE],
        'The nomads of the Golden Horde kept the steppe religion until Özbeg Khan; Volga Bulgaria (the box left out) '
        'and the places with a town of 5,000 people or more (Sarai, Hajji Tarkhan, Solkhat) keep their Muslims.',
        set={'faith': 'tengri'},
        assumption='a town of 5,000 people or more stands for a Muslim urban community; this threshold is ours',
    ),
    rule(
        'horde_steppe_faith_minority',
        {
            'owner': ['golden_horde', 'nogai'],
            'minority_culture': ['tatar', 'kipchak_nomad'],
            'minority_faith': ['sunni'],
            'box': [25, 40, 90, 62],
            'not_box': [47, 53.5, 53.5, 57],
        },
        [DEWEESE],
        'The same for the Kipchak and Tatar minorities of the steppe.',
        minority={'faith': 'tengri'},
    ),
    rule(
        'hungarian_cumans',
        {'owner': ['hungary'], 'culture': ['kipchak_nomad']},
        [BEREND],
        'The Cumans of the Hungarian plain were still pagan in 1291 (the setup of 1356 has them Catholic).',
        set={'faith': 'tengri'},
    ),
    rule(
        'hungarian_cumans_minority',
        {'owner': ['hungary'], 'minority_culture': ['kipchak_nomad']},
        [BEREND],
        'The same for the Cuman minorities.',
        minority={'faith': 'tengri'},
    ),
    rule(
        'acre',
        {'owner': ['jerusalem'], 'name': ['Acre']},
        [ACRE, ELLENBLUM],
        'Acre, the capital of the kingdom, with its Frankish and Italian quarters; the Arabic-speaking Christians of '
        'the town and its plain as the minority.',
        set={'culture': 'french', 'faith': 'latin'},
        minority=['levantine', 'orthodox', 0.4],
        assumption='the share of the minority (0.4) is ours',
    ),
    rule(
        'frankish_towns',
        {'owner': ['jerusalem'], 'name': ['Tyre', 'Sidon', 'Beirut', 'Tartus']},
        [ACRE, ELLENBLUM],
        'Tyre, Sidon, Beirut and Tortosa: Frankish lords, garrisons and merchants over an Arabic-speaking population.',
        minority=['french', 'latin', 0.2],
        assumption='the share of the minority (0.2) is ours',
    ),
    rule(
        'cilicia',
        {'owner': ['armenia_cilicia'], 'culture': ['turkmen', 'anatolian_turkish'], 'box': [34.0, 36, 37.5, 39]},
        [CILICIA],
        'The plain of Cilicia was Armenian in 1291; the setup of 1356 has the Turkmen who took it in the 1350s, '
        'here kept as the minority.',
        set={'culture': 'armenian', 'faith': 'armenian_apostolic'},
        minority=['$old', '$old', 0.2],
        assumption='the share of the Turkmen minority (0.2) is ours',
    ),
    rule(
        'lucera',
        {'owner': ['naples'], 'name': ['Lucera']},
        [TAYLOR],
        'Lucera was the town of the Muslims of Sicily until 1300. Their Siculo-Arabic was a Maghrebi Arabic (the '
        'ancestor of Maltese), hence the culture maghrebi.',
        set={'culture': 'maghrebi', 'faith': 'sunni'},
        minority=['occitan', 'latin', 0.1],
        assumption='the share of the Provençal settlers (0.1) is ours',
    ),
    rule(
        'valencia_mudejars',
        {
            'owner': ['aragon'],
            'box': [-1.0, 38.0, 0.6, 39.95],
            'minority_culture': ['andalusi'],
            'minority_share_min': 0.25,
            'not_name': ['Valencia'],
        },
        [BURNS],
        'In the kingdom of Valencia the Muslims were the majority outside the city of Valencia; the places where the '
        'setup of 1356 still has a Muslim minority of a quarter or more have a Muslim majority in 1291, with the '
        'Christian settlers as the minority.',
        set={'culture': 'andalusi', 'faith': 'sunni'},
        minority=['$old', '$old', 0.35],
        assumption='the share of the Christian settlers (0.35) is ours',
    ),
    rule(
        'prussia_old_prussians',
        {
            'owner': ['teutonic_order', 'warmia', 'samland', 'pomesania'],
            'culture': ['prussian_german'],
            'box': [19.6, 53, 23, 55.5],
            'not_name': ['Königsberg', 'Braunsberg'],
        },
        [PRUSSIA],
        'East of the Passarge the German villages and towns came in the 14th century; in 1291 the land was Old Prussian, '
        'with German settlers as a minority.',
        set={'culture': 'old_prussian'},
        minority=['prussian_german', 'latin', 0.15],
        assumption='the share of the German settlers (0.15) is ours',
    ),
    rule(
        'jews_of_france',
        {'owner': ['france'], 'town_at_least': 5000, 'no_minority': True},
        [JORDAN],
        'Jews lived in the towns of the royal domain until 1306: Ashkenazi in the north (northern France was part of '
        'Ashkenaz), as the setup models the Jews of the Midi and Provence, Sephardi in the Occitan south.',
        minority={'occitan': ['sephardi', 'jewish', 0.03], '*': ['ashkenazi', 'jewish', 0.03]},
        assumption='the share 0.03 in places with a town of 5,000 people or more is ours (about 100,000 Jews in '
        'France in 1306 after the usual estimate, most of them in towns)',
    ),
]


def apply(rules, owner, state_ids, lon, lat, names, in_towns, culture, faith, minority, log=print):
    """Applies `rules` (data/history/1291/peoples.json) to the lists culture, faith and minority (changed in place)."""
    for r in rules:
        w, n = r['where'], 0
        own = set(w.get('owner', []))
        cul = set(w.get('culture', []))
        fai = set(w.get('faith', []))
        mcul = set(w.get('minority_culture', []))
        mfai = set(w.get('minority_faith', []))
        nm = set(w.get('name', []))
        not_nm = set(w.get('not_name', []))
        for i in range(len(owner)):
            o = state_ids[owner[i]] if owner[i] is not None and owner[i] >= 0 else None
            m = minority[i]
            if own and o not in own:
                continue
            if cul and culture[i] not in cul:
                continue
            if fai and faith[i] not in fai:
                continue
            if (mcul or mfai or 'minority_share_min' in w) and not m:
                continue
            if mcul and m[0] not in mcul:
                continue
            if mfai and m[1] not in mfai:
                continue
            if 'minority_share_min' in w and m[2] < w['minority_share_min']:
                continue
            if w.get('no_minority') and m:
                continue
            if nm and names[i] not in nm:
                continue
            if names[i] in not_nm:
                continue
            if 'box' in w:
                x0, y0, x1, y1 = w['box']
                if not (x0 <= lon[i] <= x1 and y0 <= lat[i] <= y1):
                    continue
            if 'not_box' in w:
                x0, y0, x1, y1 = w['not_box']
                if x0 <= lon[i] <= x1 and y0 <= lat[i] <= y1:
                    continue
            if 'town_below' in w and in_towns[i] >= w['town_below']:
                continue
            if 'town_at_least' in w and in_towns[i] < w['town_at_least']:
                continue
            old_c, old_f = culture[i], faith[i]
            s = r.get('set') or {}
            if 'culture' in s:
                culture[i] = s['culture']
            if 'faith' in s:
                faith[i] = s['faith']
            if 'minority' in r:
                mv = r['minority']
                if mv is None:
                    minority[i] = None
                elif isinstance(mv, list):
                    minority[i] = [old_c if mv[0] == '$old' else mv[0], old_f if mv[1] == '$old' else mv[1], mv[2]]
                elif 'faith' in mv or 'culture' in mv:  # changes the minority there is
                    minority[i] = [mv.get('culture', m[0]), mv.get('faith', m[1]), m[2]]
                else:  # by the culture of the place
                    v = mv.get(old_c, mv['*'])
                    minority[i] = list(v)
            n += 1
        if n == 0:
            raise SystemExit(f'peoples.json rule {r["id"]}: no place')
        log(f'peoples.json {r["id"]}: {n} places')


def main():
    out = {
        'year': 1291,
        'about': (
            'Culture, faith and minority of 1 January 1291 where they differ from those of 1356 '
            '(public/data/setup_1356.json). Applied in this order by tools/history/1291/build.py.'
        ),
        'rules': RULES,
    }
    path = os.path.join(ROOT, 'data', 'history', '1291', 'peoples.json')
    Path(path).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    print('written', path, len(RULES), 'rules')


if __name__ == '__main__':
    main()
