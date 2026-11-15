# Getreideernte pro Ort

**Status:** Entwurf, noch nicht freigegeben · **Bereich:** Wirtschaft · **Stand:** 2026-11-14

> Jeder Ort bringt einmal im Jahr eine Getreideernte ein. Ihre Höhe hängt von der Landfläche des Ortes, der Ertragskraft seines Bodens und der Zahl der Menschen ab, die das Land bearbeiten.

*Dieses Feature ist ein Vorschlag. Alles auf dieser Seite kann sich bis zur Freigabe noch ändern.*

## Das Feature

Einmal im Jahr wird für jeden Ort die Ernte berechnet. Dazu gehört nur die Ernte selbst. Verbrauch und Hunger, Bevölkerungswachstum, Preise, Handel, Steuern, Städte, Wetterschwankungen und alle anderen Güter sind eigene Features und kommen einzeln danach.

## Im Spiel

Im Ortsfenster steht die Ernte des letzten Jahres in Tonnen Getreide, zusammen mit den drei Grössen, aus denen sie berechnet wurde: Landfläche, Ertragskraft des Bodens und Menschen in der Landwirtschaft.

## Das Modell

Die Ernte folgt der Produktionsfunktion, mit der die Wachstumsökonomik die Zeit vor der Industrialisierung beschreibt ([Ashraf und Galor 2011](https://www.nber.org/papers/w17037.pdf), Gleichung 1):

$$
Y_i = Z \cdot (A_i X_i)^{\alpha} \cdot L_i^{\,1-\alpha}
$$

| Zeichen | Bedeutung |
|---|---|
| *Y* | Ernte des Ortes im Jahr, nach Abzug des Saatguts |
| *A* | Ertragskraft des Bodens, in möglichen Kalorien je Hektar und Jahr |
| *X* | Landfläche des Ortes in Hektar |
| *L* | Menschen des Ortes, die von der Landwirtschaft leben |
| *α* | Anteil des Bodens am Ertrag; 1 − α ist der Anteil der Arbeit |
| *Z* | eine einzige Eichkonstante für die ganze Karte |

### Was das für dich bedeutet

**Mehr Bauern, weniger pro Kopf.** Das Land eines Ortes ist fest. Jede zusätzliche Arbeitskraft bringt deshalb weniger zusätzliche Ernte als die vorherige. Mit α = 0,4 ernten doppelt so viele Bauern auf demselben Land nur das 1,52-Fache, die Ernte pro Kopf sinkt auf 76 %.

**Gutes Land ernährt mehr Menschen, aber nicht besser.** Das ist der Kern der Malthus-Ökonomik. Ashraf und Galor belegen es für das Jahr 1500 (Tabelle 5): Die Bodenproduktivität wirkt mit einer Elastizität von 0,584 auf die Bevölkerungsdichte und mit 0,041, statistisch nicht von null verschieden, auf das Einkommen pro Kopf.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| *A*, Ertragskraft des Bodens | je Ort aus dem Caloric Suitability Index, Stand vor 1500: nur Feldfrüchte, die es in der Region vor 1500 gab, Regenfeldbau mit geringem Mitteleinsatz, Raster von 5 Bogenminuten | [Galor und Özak 2016](https://ozak.github.io/Caloric-Suitability-Index/), Daten frei unter CC BY-SA 4.0 |
| *X*, Landfläche | Fläche des Ortes | Spielkarte |
| *L*, Menschen in der Landwirtschaft | 74 % der Bevölkerung des Ortes | Allen 2000: England 74 %, Frankreich 73 % um 1500, zitiert nach [Crafts und Harley 2002](https://www.lse.ac.uk/asset-library/information/wp6702.pdf), S. 2 |
| *α*, Anteil des Bodens | 0,4 | [Voigtländer und Voth 2013](https://www.jvoth.com/Three_Horsemen.pdf), Tabelle 1: Arbeitsanteil in der Landwirtschaft 0,6, gestützt auf Crafts 1985 und Stokey 2001 |
| *Z*, Eichkonstante | wird an England um 1300 geeicht | [Broadberry et al. 2010](https://warwick.ac.uk/fac/soc/economics/research/centres/cage/manage/publications/21.2010_broadberry_complete.pdf), siehe unten |

Galor und Özak zeigen, dass ihr Index die Bevölkerungsdichte um 1500 erklärt und der ältere Eignungsindex daneben nichts mehr beiträgt ([Galor und Özak 2015](https://economics.brown.edu/sites/default/files/papers/2015-5_paper_0.pdf), Tabelle 1).

## Historische Prüfung

Geeicht wird an einem einzigen Fall, geprüft an allen anderen. *Z* wird so gesetzt, dass das Modell für England um 1300 die Ernte trifft, die Broadberry, Campbell, Klein, Overton und van Leeuwen aus den Rechnungsbüchern der Gutshöfe rekonstruiert haben.

| England, 1300 bis 1309 | Wert | Fundstelle |
|---|---|---|
| Ackerland | 11,52 Mio. Acres, davon 7,40 Mio. besät und 4,13 Mio. Brache | Tabelle 1 |
| Ertrag je Acre nach Saatgut | Weizen 7,99, Roggen 10,49, Gerste 9,63, Hafer 6,08 Bushel | Tabelle 2 |
| Ernte nach Saatgut und Viehfutter | 51,65 Mio. Bushel: Weizen 19,39, Roggen 5,73, Gerste 11,06, Hafer 14,01, Hülsenfrüchte 1,46 | Tabelle 3 |
| Bevölkerung 1300 | 4,73 Mio. | Tabelle 16 |
| Nahrung aus dem Ackerbau | 1242 kcal pro Kopf und Tag | Tabelle 19 |

Danach wird nichts mehr nachgestellt. Mit der Startbevölkerung von 1356 muss die Ernte pro Kopf in den grossen Regionen der Karte nahe am Existenzminimum liegen, so wie es das Malthus-Modell verlangt. Als Massstab dienen zwei Werte:

- rund 1500 kcal pro Kopf und Tag als Untergrenze (Broadberry et al., S. 28 bis 29)
- 170 kg Getreide pro Person und Jahr im Existenzminimum-Korb von [Allen 2013](https://www.nuff.ox.ac.uk/Economics/History/Paper115/allen115.pdf), Tabelle 2

Liegt eine Region weit daneben, ist entweder das Modell oder die Startbevölkerung falsch. Die Abweichung wird dann offengelegt, nicht weggerechnet.

**Warum nach Abzug des Saatguts?** Das Saatgut war im Mittelalter ein grosser Posten: Vor 1500 kamen in Europa auf ein gesätes Korn nur 3,0 bis 4,7 geerntete ([Slicher van Bath 1963](https://edepot.wur.nl/296371), S. 16).

## Massstab 1 : 100

Die Funktion hat konstante Skalenerträge. Der [Massstab 1 : 100](../welt.md#massstab-1--100) ändert deshalb keinen Pro-Kopf-Wert: Land und Leute durch 100 ergibt Ernte durch 100.

## Grenzen

Das Modell ist an fünf Stellen schwächer belegt, als es die Tabellen oben vermuten lassen.

- **Bewässerung fehlt.** Der Index rechnet mit Regenfeldbau. Galor und Özak lassen Bewässerung weg, weil die verfügbaren Schätzungen die Anlagen des späten 20. Jahrhunderts abbilden (2015, S. 4, Fussnote 1). Das Niltal und Mesopotamien kommen deshalb zu schlecht weg und brauchen eine eigene Quelle.
- **Heutiges Klima.** Der Index beruht auf den Agrarklimadaten der FAO. Das Klima des 14. Jahrhunderts ist darin nicht abgebildet.
- **England steht für alle.** Der Anteil von 74 % in der Landwirtschaft stammt aus England und Frankreich um 1500, α = 0,4 aus einem Modell für das frühneuzeitliche Europa. Beide werden auf die ganze Karte übertragen. Allens Originaltabelle ist nur über das Zitat bei Crafts und Harley belegt.
- **Gutshöfe statt Bauern.** Die englischen Erträge stammen von Gutshöfen. Broadberry et al. nehmen sie als repräsentativ an und nennen Stone (2006), nach dem bäuerliche Erträge etwa 11 % höher lagen.
- **Eine Ernte pro Jahr.** Regionale Erntetermine und zweite Ernten sind nicht enthalten.

## Quellen

- Ashraf, Q. und Galor, O. (2011): Dynamics and Stagnation in the Malthusian Epoch. *American Economic Review* 101(5), 2003–2041. [NBER Working Paper 17037](https://www.nber.org/papers/w17037.pdf)
- Galor, O. und Özak, Ö. (2016): The Agricultural Origins of Time Preference. *American Economic Review* 106(10), 3064–3103. [Caloric Suitability Index, Daten und Beschreibung](https://ozak.github.io/Caloric-Suitability-Index/)
- Galor, O. und Özak, Ö. (2015): Land Productivity and Economic Development: Caloric Suitability vs. Agricultural Suitability. Arbeitspapier, Brown University. [PDF](https://economics.brown.edu/sites/default/files/papers/2015-5_paper_0.pdf)
- Voigtländer, N. und Voth, H.-J. (2013): The Three Horsemen of Riches: Plague, War, and Urbanization in Early Modern Europe. *Review of Economic Studies* 80, 774–811. [PDF](https://www.jvoth.com/Three_Horsemen.pdf)
- Broadberry, S., Campbell, B., Klein, A., Overton, M. und van Leeuwen, B. (2010): English Economic Growth, 1270–1700. CAGE Working Paper 21, University of Warwick. [PDF](https://warwick.ac.uk/fac/soc/economics/research/centres/cage/manage/publications/21.2010_broadberry_complete.pdf)
- Allen, R. C. (2000): Economic structure and agricultural productivity in Europe, 1300–1800. *European Review of Economic History* 4(1), 1–25. [Eintrag im Oxford-Archiv](https://ora.ox.ac.uk/objects/uuid:9ef3c3c6-512f-44b6-b74e-53266cc42ae2)
- Crafts, N. F. R. und Harley, C. K. (2002): Precocious British Industrialization: A General Equilibrium Perspective. LSE Working Paper 67/02. [PDF](https://www.lse.ac.uk/asset-library/information/wp6702.pdf)
- Allen, R. C. (2013): The High Wage Economy and the Industrial Revolution: A Restatement. Oxford Discussion Papers in Economic and Social History 115. [PDF](https://www.nuff.ox.ac.uk/Economics/History/Paper115/allen115.pdf)
- Slicher van Bath, B. H. (1963): Yield Ratios, 810–1820. *A.A.G. Bijdragen* 10, Wageningen. [PDF](https://edepot.wur.nl/296371)
