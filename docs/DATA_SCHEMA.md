# Sundered Crowns – data schemas (authoritative)

All historical data is our own research, written from general historical knowledge and standard reference works
(cite them in each file's `sources` array, e.g. "Handbook of Medieval Chronology", "Oxford Atlas of World History",
"Cambridge Medieval History vol. VII", "Putzger Historischer Weltatlas", Wikipedia articles on the state/ruler, etc.).
NEVER copy data, names of mechanics, tags or province lists from any commercial game or its mods.

## Canonical ids

### Faith ids
`latin` (Latin Christianity / Roman Church), `orthodox`, `sunni`, `shia`, `ibadi`, `jewish`, `tengri` (steppe traditional),
`baltic_old` (Lithuanian / Old Prussian / Latvian traditional), `finnic_old`, `sami_old`, `coptic`, `ethiopian`, `church_of_east`,
`armenian_apostolic`, `african_traditional`, `american_traditional`, `mesoamerican`, `andean`.
Emergent later (not used at 1356 start): `hussite`, `evangelical` (Lutheran-type), `reformed` (Calvinist-type), `anglican_type`.

### Culture ids (group in brackets)
[british] english, scottish, irish, welsh
[gallic] french, occitan, breton, picard, burgundian_fr
[iberian] castilian, portuguese, galician, catalan, aragonese, basque, andalusi
[low_lands] flemish, hollandic, frisian
[german] low_saxon, central_german, bavarian, alemannic, franconian, rhinelander, prussian_german
[italian] tuscan, lombard, venetian, ligurian, neapolitan, sicilian, sardinian, roman
[west_slavic] czech, slovak, polish, silesian, sorbian, pomeranian
[east_slavic] russian, ruthenian, novgorodian
[south_slavic] croatian, serbian, bosnian, bulgarian, slovene
[baltic] lithuanian, latvian, old_prussian, samogitian
[finnic] finnish, estonian, karelian, sami, mordvin, komi
[norse] swedish, danish, norwegian, icelandic
[carpathian] hungarian, vlach (Romanian), szekely
[hellenic] greek, albanian
[caucasian] armenian, georgian, circassian
[turkic] anatolian_turkish, turkmen, tatar, bashkir, crimean, azeri, kipchak_nomad
[arab] maghrebi, egyptian_arab, levantine, iraqi_arab, bedouin, hejazi, yemeni
[berber] berber, tuareg, guanche
[iranian] persian, kurdish, lur, baluch
[mongolic] mongol
[jewish] (Jewish communities are modelled as minority population groups of the `jewish` faith with local culture `ashkenazi` or `sephardi`)
ashkenazi, sephardi
[african] mande, wolof, songhai, hausa, akan, yoruba, kongo, amhara, nubian, somali
[american] taino, carib, nahua, maya, mississippian, algonquian, iroquoian, tupi, muisca, quechua, guarani

Agents may add an id if truly missing; list it in the file's `new_ids` array.

### Government ids
`feudal_monarchy`, `elective_monarchy`, `merchant_republic`, `city_republic`, `theocracy`, `military_order`, `nomadic_horde`, `tribal_federation`, `imperial` (Holy Roman Emperor's / Byzantine style empire is still a monarchy; use `feudal_monarchy` or `elective_monarchy` + rank `empire`).

### Rank ids
`empire`, `kingdom`, `grand_duchy`, `duchy`, `principality`, `margraviate`, `landgraviate`, `county`, `lordship`, `prince_bishopric`, `archbishopric`, `free_city`, `republic`, `order`, `khanate`, `sultanate`, `emirate`, `beylik`, `despotate`, `tribe`, `chiefdom`.

### Personality ids (AI)
`conqueror`, `trader`, `isolationist`, `zealot`, `opportunist`, `diplomat`, `builder`.

## State file: `data/history/<year>/<region>.json`

```jsonc
{
  "region": "france_lowlands_britain_iberia",
  "sources": ["..."],
  "new_ids": [],
  "states": [
    {
      "id": "france",                      // lower_snake, unique across ALL files
      "name": { "en": "Kingdom of France", "de": "Königreich Frankreich" },
      "short": { "en": "France", "de": "Frankreich" },
      "adjective": { "en": "French", "de": "französisch" },
      "rank": "kingdom",
      "government": "feudal_monarchy",
      "culture": "french",
      "faith": "latin",
      "color": "#2b4c9b",                  // map colour, distinct from neighbours
      "capital": { "name": "Paris", "lat": 48.857, "lon": 2.352 },
      "holdings": [                        // anchor places that the state actually held on 1 Jan 1356 (incl. capital).
        { "name": "Rouen", "lat": 49.44, "lon": 1.10 }, // Territory is generated as nearest-anchor regions, so give
        { "name": "Orléans", "lat": 47.90, "lon": 1.90 } // enough anchors to outline the realm: ~1 per 80–120 km of
      ],                                   // extent; tiny states 1–2, great powers 20–60. Use period names.
      "ruler": { "name": "Jean II", "born": 1319, "dynasty": "Valois", "female": false,
                 "skills": [2, 3, 1],      // [governance, statecraft, generalship] 0–6
                 "traits": ["brave", "rash"] },
      "heir": { "name": "Charles", "born": 1338, "dynasty": "Valois", "female": false, "skills": [5,4,1], "traits": ["sickly","shrewd"] },
      "consort": null,                     // same shape or null
      "dynasty_note": "House of Valois, cadet line of the Capetians",
      "overlord": null,                    // state id or null
      "subject_type": null,                // "vassal" | "personal_union" | "tributary" | null
      "empire_member": false,              // member of the Holy Roman Empire
      "elector": false,                    // one of the seven electors under the Golden Bull
      "allies": ["scotland"],
      "rivals": ["england"],
      "claims_on": ["england"],            // state ids it has dynastic/territorial claims against
      "personality": "opportunist",
      "difficulty": 3,                     // 1 easy .. 5 very hard (for the player)
      "summary": { "en": "three short sentences on the 1356 situation", "de": "drei kurze Sätze" },
      "coa": {                             // our own drawing spec from the historical blazon
        "blazon": "Azure semé-de-lis Or",
        "field": "azure",                  // tinctures: or, argent, gules, azure, vert, sable, purpure
        "division": "plain",               // plain | per_pale | per_fess | quarterly | per_bend | per_saltire | paly | barry | bendy | chequy
        "field2": null,                    // second tincture for divisions
        "ordinary": null,                  // null | fess | pale | bend | chevron | cross | saltire | chief | bordure | cross_patriarchal
        "ordinary_tincture": null,
        "charges": [ { "type": "fleur_de_lis", "tincture": "or", "count": 3, "arrangement": "semee" } ]
        // charge types: lion, lion_passant, eagle, double_eagle, fleur_de_lis, cross_small, tower, castle, key, crown, star,
        // crescent, moon, rose, lily, keys_crossed, sword, bear, wolf, horse, boar, griffin, dragon, ship, wheel, horn, fish,
        // tree, stag_head, bull_head, mountain, letter (add "text"), tamga (steppe/turkic seal), tughra_like, bezant, roundel
      }
    }
  ],
  "wars": [ { "name": {"en":"...","de":"..."}, "attackers": ["england"], "defenders": ["france"], "since": 1337, "goal": "throne_claim" } ]
}
```

Rules:
- Only states that actually existed on 1 Jan 1356 (or the 1492 file for 1492). Rulers must be the ones reigning on that date.
- Holdings must be inside the state's 1356 territory, on land, with correct coordinates (±0.1°).
- A subject (vassal etc.) is its own state with `overlord` set; its holdings are its own lands only.
- Avoid overlapping territory: anchors of different states should not be closer than ~15 km unless it is a free city enclave.
