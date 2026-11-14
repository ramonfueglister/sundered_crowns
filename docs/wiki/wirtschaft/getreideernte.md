# Getreideernte pro Ort

**Status:** Im Spiel (seit 14.11.2026 in der laufenden Welt; die öffentliche Seite folgt mit dem Neuaufbau) · **Bereich:** Wirtschaft · **Stand:** 2026-11-14

> Jeder Ort bringt einmal im Jahr eine Getreideernte ein. Ihre Höhe hängt von der Landfläche des Ortes, der Ertragskraft seines Bodens und der Zahl der Menschen ab, die das Land bearbeiten.

## Das Feature

Einmal im Jahr, am 1. Januar, wird für jeden Ort die Ernte berechnet. Dazu gehört nur die Ernte selbst. Verbrauch und Hunger, Bevölkerungswachstum, Preise, Handel, Steuern, Städte, Wetterschwankungen und alle anderen Güter sind eigene Features und kommen einzeln danach.

## Im Spiel

Im Ortsfenster steht unter «Getreideernte» die Nahrung, die die letzte Ernte gebracht hat: in Kilokalorien im Jahr und pro Kopf und Tag. Darunter stehen die drei Grössen, aus denen sie berechnet wurde: Landfläche, Ertragskraft des Bodens und Menschen in der Landwirtschaft.

Zum Einordnen: England kam um 1300 auf 1242 kcal pro Kopf und Tag aus dem Ackerbau, mit den tierischen Produkten auf 1381 kcal (Broadberry et al. 2010, Tabelle 19). Als Untergrenze zum Überleben nennt dieselbe Quelle rund 1500 kcal aus der gesamten Nahrung.

Die Ernte steht in Kilokalorien und nicht in Tonnen. Die Quelle, an der das Modell geeicht ist, nennt die Ernte in Bushel und als Nahrung in Kilokalorien. Für Tonnen fehlt bisher eine belegte Angabe, wie viel ein Bushel jeder Getreideart wog.

## Das Modell

Die Ernte folgt der Produktionsfunktion, mit der die Wachstumsökonomik die Zeit vor der Industrialisierung beschreibt ([Ashraf und Galor 2011](https://www.nber.org/papers/w17037.pdf), Gleichung 1):

$$
Y_i = Z \cdot (A_i X_i)^{\alpha} \cdot L_i^{\,1-\alpha}
$$

| Zeichen | Bedeutung |
|---|---|
| *Y* | Ernte des Ortes im Jahr: Nahrung aus dem Ackerbau in Kilokalorien, nach Abzug von Saatgut, Viehfutter und Verlusten bei Lagerung und Verarbeitung |
| *A* | Ertragskraft des Bodens, in möglichen Kalorien je Hektar und Jahr |
| *X* | Landfläche des Ortes in Hektar |
| *L* | Menschen des Ortes, die von der Landwirtschaft leben |
| *α* | Anteil des Bodens am Ertrag; 1 − α ist der Anteil der Arbeit |
| *Z* | eine einzige Eichkonstante für die ganze Karte, über die Zeit fest |

*Z* wird an einem einzigen Fall bestimmt, England in den Jahren 1300 bis 1309. England zählt dabei als ein Stück Land mit der Bodenmenge *T* (Summe aus *A* mal *X*), den Menschen *L* und der Ernte *Y* jener Jahre. Setzt man das ein, ist die Ernte eines Ortes die Ernte Englands, verkleinert um seinen Anteil an Englands Boden und an Englands Arbeit:

$$
Y_i = Y_E \cdot \left(\frac{A_i X_i}{T_E}\right)^{\alpha} \cdot \left(\frac{L_i}{L_E}\right)^{1-\alpha}
$$

### Was das für dich bedeutet

**Mehr Bauern, weniger pro Kopf.** Das Land eines Ortes ist fest. Jede zusätzliche Arbeitskraft bringt deshalb weniger zusätzliche Ernte als die vorherige. Mit α = 0,70 ernten doppelt so viele Bauern auf demselben Land nur das 1,23-Fache, die Ernte pro Kopf sinkt auf 62 %.

**Gutes Land ernährt mehr Menschen, aber nicht besser.** Das ist der Kern der Malthus-Ökonomik. Ashraf und Galor belegen es für das Jahr 1500 (Tabelle 5): Die Bodenproduktivität wirkt mit einer Elastizität von 0,584 auf die Bevölkerungsdichte und mit 0,041, statistisch nicht von null verschieden, auf das Einkommen pro Kopf.

**Eine Stadt ernährt sich nicht selbst.** Ein Ort mit einer grossen Stadt hat viele Menschen auf wenig Land. Der Ort Paris kommt auf 394 kcal pro Kopf und Tag. Den Rest muss der Handel bringen, und der ist ein eigenes Feature.

## Daten und Parameter

| Grösse | Wert | Herkunft |
|---|---|---|
| *A*, Ertragskraft des Bodens | je Ort aus dem Caloric Suitability Index, Stand vor 1500: die ertragreichste Feldfrucht, die es in der Region vor 1500 gab, Regenfeldbau mit geringem Mitteleinsatz, Raster von 5 Bogenminuten. Je Ort der Mittelwert über sein Land; Zellen ohne Ertrag zählen als null | [Galor und Özak 2016](https://ozak.github.io/Caloric-Suitability-Index/), Datensatz [10.5281/zenodo.14714917](https://doi.org/10.5281/zenodo.14714917), frei unter CC BY-SA 4.0 |
| *X*, Landfläche | Fläche des Ortes | Spielkarte |
| *L*, Menschen in der Landwirtschaft | 74 % der Bevölkerung des Ortes | Allen 2000: England 74 %, Frankreich 73 % um 1500, zitiert nach [Crafts und Harley 2002](https://www.lse.ac.uk/asset-library/information/wp6702.pdf), S. 2 |
| *α*, Anteil des Bodens | 0,70 | [Bouscasse, Nakamura und Steinsson 2025](https://eml.berkeley.edu/~enakamura/papers/malthus.pdf), S. 847: geschätzt für England 1250 bis 1870 aus dem Lohnanstieg nach dem Schwarzen Tod. Als Gegenprobe dient der ältere Kalibrierwert 0,4 ([Voigtländer und Voth 2013](https://www.jvoth.com/Three_Horsemen.pdf), Tabelle 1) |
| *Y* Englands | 1242 kcal pro Kopf und Tag mal 4,72 Mio. Menschen mal 365 Tage | [Broadberry et al. 2010](https://warwick.ac.uk/fac/soc/economics/research/centres/cage/manage/publications/21.2010_broadberry_complete.pdf), Tabelle 19, Zeile 1300/09 |
| *T* Englands | mittlere Ertragskraft 7323 mal 13,25 Mio. Hektar: das Land der Karte innerhalb des Umrisses von England | Umriss aus [Natural Earth](https://www.naturalearthdata.com/), Karteneinheiten 1 : 10 Mio., gemeinfrei |
| *Z* über die Zeit | fest | Bouscasse, Nakamura und Steinsson finden vor 1600 kein Produktivitätswachstum (S. 848) |

Der Index deckt 99,73 % der Landfläche der Karte ab. 26,92 % des Landes haben den Ertrag null (Wüste, Hochgebirge, hoher Norden). 13 Orte haben gar keine Daten, vor allem die Azoren; sie bringen keine Ernte ein.

Galor und Özak zeigen, dass ihr Index die Bevölkerungsdichte um 1500 erklärt und der ältere Eignungsindex daneben nichts mehr beiträgt ([Galor und Özak 2015](https://economics.brown.edu/sites/default/files/papers/2015-5_paper_0.pdf), Tabelle 1).

## Historische Prüfung

Geeicht wird an einem einzigen Fall, geprüft an allen anderen. Nach der Eichung an England 1300 bis 1309 wurde nichts mehr nachgestellt. Die Abweichungen stehen so da, wie sie herauskommen.

### England im Lauf der Zeit

Nahrung aus dem Ackerbau in kcal pro Kopf und Tag, Geschichte nach Broadberry et al. 2010, Tabelle 19:

| Jahrzehnt | Menschen (Mio.) | Geschichte | Modell α = 0,70 | Abweichung | Modell α = 0,4 | Abweichung |
|---|---|---|---|---|---|---|
| 1270/79 | 4,40 | 1415 | 1305 | −8 % | 1277 | −10 % |
| 1300/09 (geeicht) | 4,72 | 1242 | 1242 | 0 % | 1242 | 0 % |
| 1310/19 | 4,63 | 1199 | 1259 | +5 % | 1252 | +4 % |
| 1380/89 | 2,36 | 1801 | 2018 | +12 % | 1639 | −9 % |
| 1420/29 | 2,03 | 1468 | 2242 | +53 % | 1741 | +19 % |
| 1450/59 | 1,93 | 1512 | 2323 | +54 % | 1776 | +17 % |
| 1600/09 | 4,27 | 1664 | 1332 | −20 % | 1293 | −22 % |
| 1691/1700 | 5,14 | 1678 | 1170 | −30 % | 1200 | −28 % |

- Von 1270 bis 1389 liegt das Modell zwischen −8 % und +12 %.
- Im 15. Jahrhundert liegt es 53 % zu hoch. Nach der Pest stellte England Ackerland auf Weide um: Die Nahrung aus Viehhaltung steigt in derselben Tabelle von 139 auf 292 kcal. Das Modell lässt alles Land im Getreide.
- Nach 1600 liegt es 20 bis 30 % zu tief. Um 1600 beginnt das Produktivitätswachstum, das Modell hält *Z* fest.
- Die beiden Zeilen 1300/09 und 1380/89 allein ergeben α = 0,54. Das ist der Wert, den Bouscasse, Nakamura und Steinsson schätzen, wenn Kapital als dritter Faktor dazukommt. Im Spiel bleibt ihr Wert 0,70 für das Modell aus Boden und Arbeit.

### England auf der Karte, Start 1356

In den 162 Orten innerhalb des Umrisses leben zum Spielstart 2,58 Mio. Menschen (Broadberry et al., Tabelle 16: 2,60 Mio. im Jahr 1351, 2,50 Mio. im Jahr 1377). Ihre Ernte ergibt 1856 kcal pro Kopf und Tag. Die Quelle nennt 1801 kcal für 1380/89.

### Regionen der Karte, Start 1356

Massstab ist die Untergrenze von rund 1500 kcal pro Kopf und Tag (Broadberry et al., S. 28 bis 29). Sie gilt für die gesamte Nahrung; das Modell liefert nur den Teil aus dem Ackerbau.

| Region | Menschen (Mio.) | Menschen je km² | Ertragskraft des Bodens | kcal pro Kopf und Tag, α = 0,70 | α = 0,4 |
|---|---|---|---|---|---|
| Arabien | 1,61 | 0,6 | 21 | 148 | 109 |
| Niederlande | 2,65 | 29,4 | 8583 | 1493 | 1339 |
| Frankreich | 10,80 | 22,2 | 8459 | 1855 | 1533 |
| Italien | 5,62 | 18,3 | 7681 | 1905 | 1518 |
| Britische Inseln | 3,48 | 10,7 | 5532 | 2252 | 1697 |
| Deutschland | 7,24 | 12,4 | 8241 | 2731 | 1911 |
| Maghreb | 3,62 | 0,8 | 717 | 3038 | 1855 |
| Levante | 0,96 | 3,3 | 2852 | 3129 | 1966 |
| Böhmen | 1,09 | 9,6 | 8762 | 3437 | 2186 |
| Griechenland | 1,31 | 7,9 | 7833 | 3484 | 2120 |
| Iberien | 4,40 | 7,3 | 7586 | 3703 | 2259 |
| Mesopotamien | 1,28 | 2,2 | 2549 | 3761 | 2134 |
| Ägypten und Nubien | 4,98 | 1,2 | 2113 | 3791 | 1483 |
| Skandinavien | 1,84 | 0,7 | 915 | 4241 | 2327 |
| Atlantikinseln | 0,03 | 1,6 | 2649 | 4433 | 2040 |
| Persien | 5,25 | 1,4 | 2559 | 4880 | 2408 |
| Ungarn | 1,60 | 5,0 | 9637 | 5810 | 2955 |
| Anatolien | 2,44 | 3,7 | 7767 | 6108 | 3010 |
| Ostafrika | 25,10 | 2,6 | 5867 | 6188 | 2983 |
| Sahel | 8,20 | 1,3 | 3105 | 6427 | 3029 |
| Westafrika | 16,46 | 2,9 | 8137 | 7080 | 3222 |
| Polen | 1,08 | 3,5 | 9508 | 7355 | 3373 |
| Balkan | 1,77 | 3,4 | 9464 | 7483 | 3405 |
| Kaukasus | 0,89 | 2,3 | 7552 | 8289 | 3615 |
| Baltikum | 0,93 | 2,0 | 8711 | 10'155 | 4040 |
| Amerika | 31,32 | 1,2 | 8345 | 12'531 | 4184 |
| Rus | 2,14 | 0,7 | 4449 | 12'739 | 4548 |
| Steppe | 1,74 | 0,5 | 4330 | 14'878 | 4782 |
| **ganze Karte** | 149,81 | 1,9 | 5626 | 6613 | 2869 |

- **Der dicht besiedelte Kern stimmt.** Niederlande, Frankreich, Italien, die Britischen Inseln und Deutschland liegen zwischen 1493 und 2731 kcal, also nahe am Existenzminimum, wie es das Malthus-Modell verlangt.
- **Dünn besiedelte Regionen liegen weit darüber.** Ungarn, Polen, der Balkan, das Baltikum, die Rus und die Steppe kommen auf das Vier- bis Zehnfache. Das Modell rechnet das ganze Land eines Ortes als bestellt. Wo wenige Menschen auf viel Land sitzen, stimmt das nicht: Das meiste war Wald, Weide oder Ödland. Das ist die grösste Abweichung.
- **Bewässertes Land fehlt.** Der Ort Kairo hat die Ertragskraft null, Arabien kommt auf 148 kcal.

## Massstab 1 : 100

Die Funktion hat konstante Skalenerträge. Der [Massstab 1 : 100](../welt.md#massstab-1--100) ändert deshalb keinen Pro-Kopf-Wert: Land und Leute durch 100 ergibt Ernte durch 100. Die Zahlen im Ortsfenster stehen noch im Massstab 1 : 1.

## Grenzen

- **Alles Land gilt als bestellt.** Siehe oben. Eine Rekonstruktion der damals bestellten Fläche wäre die naheliegende Quelle; geprüft ist noch keine.
- **Bewässerung fehlt.** Der Index rechnet mit Regenfeldbau. Galor und Özak lassen Bewässerung weg, weil die verfügbaren Schätzungen die Anlagen des späten 20. Jahrhunderts abbilden (2015, S. 4, Fussnote 1). Das Niltal und Mesopotamien kommen deshalb zu schlecht weg und brauchen eine eigene Quelle.
- **Heutiges Klima.** Der Index beruht auf den Agrarklimadaten der FAO. Das Klima des 14. Jahrhunderts ist darin nicht abgebildet.
- **England steht für alle.** Der Anteil von 74 % in der Landwirtschaft stammt aus England und Frankreich um 1500. Solange er überall gleich ist, kürzt er sich aus der Rechnung heraus. α = 0,70 ist für die Gesamtwirtschaft Englands geschätzt, nicht für die Landwirtschaft allein. Beide Werte gelten auf der ganzen Karte. Allens Originaltabelle ist nur über das Zitat bei Crafts und Harley belegt.
- **Gutshöfe statt Bauern.** Die englischen Erträge stammen von Gutshöfen. Broadberry et al. nehmen sie als repräsentativ an und nennen Stone (2006), nach dem bäuerliche Erträge etwa 11 % höher lagen.
- **Eine Ernte pro Jahr.** Sie wird überall am 1. Januar verbucht. Regionale Erntetermine und zweite Ernten sind nicht enthalten.
- **Kilokalorien statt Tonnen.** Für Tonnen fehlt eine belegte Angabe zum Gewicht eines Bushels je Getreideart.

## Quellen

- Ashraf, Q. und Galor, O. (2011): Dynamics and Stagnation in the Malthusian Epoch. *American Economic Review* 101(5), 2003–2041. [NBER Working Paper 17037](https://www.nber.org/papers/w17037.pdf)
- Galor, O. und Özak, Ö. (2016): The Agricultural Origins of Time Preference. *American Economic Review* 106(10), 3064–3103. [Caloric Suitability Index, Daten und Beschreibung](https://ozak.github.io/Caloric-Suitability-Index/)
- Galor, O. und Özak, Ö. (2015): Land Productivity and Economic Development: Caloric Suitability vs. Agricultural Suitability. Arbeitspapier, Brown University. [PDF](https://economics.brown.edu/sites/default/files/papers/2015-5_paper_0.pdf)
- Bouscasse, P., Nakamura, E. und Steinsson, J. (2025): When Did Growth Begin? New Estimates of Productivity Growth in England from 1250 to 1870. *The Quarterly Journal of Economics* 140(2), 835–888. [PDF](https://eml.berkeley.edu/~enakamura/papers/malthus.pdf)
- Voigtländer, N. und Voth, H.-J. (2013): The Three Horsemen of Riches: Plague, War, and Urbanization in Early Modern Europe. *Review of Economic Studies* 80, 774–811. [PDF](https://www.jvoth.com/Three_Horsemen.pdf)
- Broadberry, S., Campbell, B., Klein, A., Overton, M. und van Leeuwen, B. (2010): English Economic Growth, 1270–1700. CAGE Working Paper 21, University of Warwick. [PDF](https://warwick.ac.uk/fac/soc/economics/research/centres/cage/manage/publications/21.2010_broadberry_complete.pdf)
- Allen, R. C. (2000): Economic structure and agricultural productivity in Europe, 1300–1800. *European Review of Economic History* 4(1), 1–25. [Eintrag im Oxford-Archiv](https://ora.ox.ac.uk/objects/uuid:9ef3c3c6-512f-44b6-b74e-53266cc42ae2)
- Crafts, N. F. R. und Harley, C. K. (2002): Precocious British Industrialization: A General Equilibrium Perspective. LSE Working Paper 67/02. [PDF](https://www.lse.ac.uk/asset-library/information/wp6702.pdf)
- Slicher van Bath, B. H. (1963): Yield Ratios, 810–1820. *A.A.G. Bijdragen* 10, Wageningen. [PDF](https://edepot.wur.nl/296371). Vor 1500 kamen in Europa auf ein gesätes Korn nur 3,0 bis 4,7 geerntete (S. 16); deshalb zählt die Ernte nach Abzug des Saatguts.
- Natural Earth: Admin 0 – Map Units, 1 : 10 Mio., gemeinfrei. [naturalearthdata.com](https://www.naturalearthdata.com/)
