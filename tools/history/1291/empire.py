"""The Holy Roman Empire (German kingdom and Burgundy) on 1 January 1291; Lorraine, the Low Countries and Italy are in
west.py and italy_balkans.py. Its realms are in empire_bohemia_swabia.py, empire_rhine.py and
empire_saxony_baltic.py."""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from empire_bohemia_swabia import STATES as BOHEMIA_SWABIA
from empire_rhine import STATES as RHINE
from empire_saxony_baltic import STATES as SAXONY_BALTIC
from lib import write

SOURCES = [
    'Euratlas-Nüssli, Euratlas Periodis: Europe in the year 1300; regional maps Between Rhine and Oder, Between Rhine and Rhône',
    "W. R. Shepherd, Historical Atlas (1923), 'Germany about 1300' and 'Europe and the Mediterranean Lands about 1300'",
    'G. Köbler, Historisches Lexikon der deutschen Länder (7th ed., 2007): every territory with its holders',
    'Putzger Historischer Weltatlas, Deutschland um 1300',
    'O. Redlich, Rudolf von Habsburg (1903); K.-F. Krieger, Die Habsburger im Mittelalter (2nd ed., 2004)',
    'J. K. Zelenka / Handbuch der Geschichte der böhmischen Länder I (1967): Wenceslaus II, Glatz 1290',
    'Wikipedia articles on the respective territories and rulers (cross-checked against Köbler)',
]
NOTES = [
    'Date: 1 January 1291. King of the Romans: Rudolf I of Habsburg (dies 15 July 1291; interregnum until Adolf of Nassau, May 1292). The king is not a realm of his own: his house is modelled as Austria.',
    'Albert I of Habsburg holds Austria and Styria (1282) and, for the house, the Habsburg lands in Swabia, the Aargau and Upper Alsace; Carniola is pledged to Meinhard II (italy_balkans.py).',
    'The Swiss Federal Charter is dated early August 1291: on 1 January there is no confederacy. Uri and Schwyz hold imperial charters (1231, 1240); they are left to the spread.',
    'Louis II the Strict rules Upper Bavaria together with the Rhine Palatinate (one realm); Lower Bavaria (Landshut) belongs to Otto III. The Straubing duchy of 1356 did not exist.',
    'Brunswick: the sons of Albert I divide the duchy during 1291 (Grubenhagen, Göttingen, Wolfenbüttel); on 1 January it is modelled as one duchy of Brunswick beside Lüneburg.',
    'Brandenburg (the Ascanian margraves) holds the Altmark, Mittelmark, Uckermark, Neumark, Stargard (to Mecklenburg 1304) and Upper Lusatia; Lower Lusatia and Meissen belong to the Wettin Frederick Tuta, Thuringia to Albert the Degenerate.',
    'Pomerania is one duchy (Bogislaw IV with his brothers, partition 1295); Pomerelia is ruled by the last Samborid Mestwin II; Rügen by Wizlaw II under Danish overlordship.',
    "Smaller counts (Hoya, Diepholz, Tecklenburg, Ravensberg, Lippe, Waldeck, Wied, Isenburg, Leiningen, Hohenlohe, Oettingen, Montfort, Werdenberg, Kyburg's heirs) are not modelled as realms: a gap shared with 1356.",
]

states = BOHEMIA_SWABIA + RHINE + SAXONY_BALTIC

wars = []

if __name__ == '__main__':
    write(
        'empire',
        SOURCES,
        states,
        wars,
        new_ids=['bern', 'zurich', 'dauphine', 'thuringia', 'rostock', 'pomerelia', 'rugen', 'ravensberg', 'lippe'],
        notes=NOTES,
    )
