// Who takes over a household when it passes on: the custom of inheritance of a person's culture (people feature 3,
// docs/PEOPLE_DESIGN.md). Ramon, 17 and 18 November 2026: a custom for every culture, and only what a source that
// was read supports is built; a culture without one keeps the rule of feature 2 (a couple of the town).
//
// A household is never divided here, because the number of households of a town is fixed (La Poutré & Paping 2025,
// src/sim/people/marriage.ts). Where the sources divide the land among several children, the custom decides which
// one of them takes the household. This is the feature's largest simplification.
//
// The five customs, as the sources state them:
//   eldestSon    The eldest son; without a son the eldest daughter.
//   youngestSon  The sons share, the house stays undivided with the youngest son; without a son the estate falls to
//                the lord (here: to a couple of the town).
//   sons         The sons share equally and a daughter is paid off with her dowry: one of the sons, each with the
//                same chance; without a son one of the daughters.
//   children     Sons and daughters share equally: one of the children, each with the same chance.
//   sonsDouble   A son takes twice a daughter's share: one of the children, a son with twice a daughter's chance.
//
// Grade 1: a law or a study of the thirteenth or fourteenth century was read. Grade 2: read, but of a later time, or
// from Todd's map of family types as Duranton, Rodríguez-Pose & Sandall 2008 describe it (it "dates back, at least,
// to the Middle Ages", but is read off a map). Not built (grade 3, nothing read that states the rule): Flemish,
// Hollandic, Greek, Portuguese, Roman, Neapolitan, Sicilian, Sardinian, Hungarian, the Slavs but the Rus and the
// Czechs; and the cultures nothing was looked for (Baltic, Caucasian, African with the old faiths, Jewish).
//
// Known to be coarser than the sources: customs changed from village to village (Baden-Württemberg: 38 % of 3,382
// municipalities with one heir, 31 % with partition, Röhm 1953 after Huning & Wahl 2021), between town and country
// and between the free and the unfree; Provence gave the sons equal shares where Occitan stands for one heir here.
import { ALL_CULTURES, FAITHS } from '../content/peoples';

export const CUSTOM = { none: 0, eldestSon: 1, youngestSon: 2, sons: 3, children: 4, sonsDouble: 5 } as const;
export type Custom = (typeof CUSTOM)[keyof typeof CUSTOM];

export interface CustomRule { custom: Custom; grade: 1 | 2; cultures: string[]; source: string }

/** The custom of the cultures, each line with what was read for it. */
export const CUSTOMS: CustomRule[] = [
  { custom: CUSTOM.eldestSon, grade: 1, cultures: ['english'],
    source: 'English common law: the eldest son alone, without a son the daughters together (Mapping the Medieval Countryside, King\'s College London 2014); Gates 1996, Albion 28(1); Smith 1986, Transactions of the Royal Historical Society 36' },
  { custom: CUSTOM.eldestSon, grade: 1, cultures: ['catalan'],
    source: 'To i Figueras, «Els hereus i el dret de primogenitura» (Enciclopèdia.cat): one heir, preferably the firstborn, among the peasants of the masos from the 11th century, general from the later 12th; Ferrer Alòs 2005, Continuity and Change 20(1): the eldest son, else the eldest daughter' },
  { custom: CUSTOM.eldestSon, grade: 2, cultures: ['low_saxon', 'central_german', 'rhinelander', 'alemannic', 'bavarian', 'franconian', 'prussian_german'],
    source: 'Todd\'s map after Duranton, Rodríguez-Pose & Sandall 2008, pp. 13–14: house and land to the son who stays in much of Germany, Austria and German-speaking Switzerland; Huning & Wahl 2021, Journal of Comparative Economics: the single heir is "usually the oldest but sometimes the youngest"' },
  { custom: CUSTOM.eldestSon, grade: 2, cultures: ['occitan', 'basque', 'aragonese', 'galician', 'scottish'],
    source: 'Lamaison 1988, Études rurales 110–112 (survey of 400 notaries, 1980): nearly all of southern France passes the property on whole; Fauve-Chamoux, «Inheritance and Property»: primogeniture in the Basque country and the Pyrenean valleys; Todd\'s map for south-west France, northern Spain and the west of the British Isles' },
  { custom: CUSTOM.youngestSon, grade: 1, cultures: ['novgorodian', 'russian', 'ruthenian'],
    source: 'Expanded Russkaya Pravda (early 13th century; Kaiser 1992, The Laws of Rus\', pp. 20–34): art. 92 the children divide, art. 95 a sister receives nothing, art. 100 the father\'s residence stays undivided with the youngest son, art. 90 a peasant\'s estate escheats to the prince' },
  { custom: CUSTOM.youngestSon, grade: 2, cultures: ['czech'],
    source: 'Velková 2023, Historická demografie 47(1): in Bohemia the youngest son inherited the holding in 73 % of cases, 1691–1787' },
  { custom: CUSTOM.sons, grade: 1, cultures: ['lombard', 'tuscan', 'venetian', 'ligurian'],
    source: 'Gravela 2018, Mélanges de l\'École française de Rome, Moyen Âge 130-1: statutes of Turin 1360, a married daughter with brothers can claim nothing, "common in all Italian city-states"; without sons the daughters succeed' },
  { custom: CUSTOM.children, grade: 2, cultures: ['french', 'picard', 'burgundian_fr', 'breton'],
    source: 'Lamaison 1988: Normandy, the North, Berry, Anjou and Poitou divide strictly among the heirs; Fauve-Chamoux: the custom of Brittany written in 1539 gives no child a privilege; Todd\'s map: equal division in northern and eastern France' },
  { custom: CUSTOM.children, grade: 2, cultures: ['castilian'],
    source: 'Visigothic law: the children inherit alike, one may be given up to a third more (To i Figueras); Leyes de Toro 1505: equal division (Bartolomé Bartolomé 2009, Norba 22)' },
  { custom: CUSTOM.sonsDouble, grade: 1, cultures: ['danish', 'swedish', 'norwegian'],
    source: 'Tveit 2020, in Nordic Inheritance Law Through the Ages (Brill), pp. 71–91: in the Danish provincial laws a daughter inherits half a brother\'s lot, adopted in Norway (code of 1274) and most Swedish laws in the later 13th century' },
];
/** The law of the faith goes before the custom of the culture: a son's share is twice a daughter's (Qur'an 4:11).
 *  It is the law for property (house, garden). Farmland was the treasury's and the peasants held its use (Abbas
 *  Hamid 2002); who took that over around 1300 was not found, so it is treated as property. */
export const MUSLIM_CUSTOM: Custom = CUSTOM.sonsDouble;

const byCulture = new Uint8Array(ALL_CULTURES.length);
for (const r of CUSTOMS) for (const c of r.cultures) {
  const k = ALL_CULTURES.indexOf(c);
  if (k < 0) throw new Error(`inheritance: unknown culture ${c}`);
  if (byCulture[k]) throw new Error(`inheritance: ${c} has two customs`);
  byCulture[k] = r.custom;
}
const muslim = FAITHS.map((f) => f.family === 'muslim');

/** The custom of a person, by the indices of culture and faith (`person.culture`, `person.faith`). */
export function customOf(culture: number, faith: number): Custom {
  return (muslim[faith] ? MUSLIM_CUSTOM : byCulture[culture] ?? CUSTOM.none) as Custom;
}

/** A living child of the house: `free` is grown and without a household of its own. */
export interface Child { id: number; son: boolean; free: boolean }

/** The heir of a house by `custom` among its living `children`, the eldest first; `u` is a draw in [0, 1) for the
 *  customs that share. −1 where the custom names nobody who is free: the household then goes as in feature 2.
 *  Where the child the custom names first is not free (under age, or settled elsewhere), the next one stands in. */
export function heirOf(custom: Custom, children: readonly Child[], u: number): number {
  const sons = children.filter((c) => c.son), daughters = children.filter((c) => !c.son);
  const first = (l: readonly Child[]) => l.find((c) => c.free)?.id ?? -1;
  const lot = (l: readonly Child[], weight: (c: Child) => number): number => {
    const free = l.filter((c) => c.free);
    let total = 0; for (const c of free) total += weight(c);
    if (!total) return -1;
    let x = u * total;
    for (const c of free) { x -= weight(c); if (x < 0) return c.id; }
    return free[free.length - 1].id;
  };
  switch (custom) {
    case CUSTOM.eldestSon: return sons.length ? first(sons) : first(daughters);
    case CUSTOM.youngestSon: return first([...sons].reverse());
    case CUSTOM.sons: return sons.length ? lot(sons, () => 1) : lot(daughters, () => 1);
    case CUSTOM.children: return lot(children, () => 1);
    case CUSTOM.sonsDouble: return lot(children, (c) => (c.son ? 2 : 1));
    default: return -1;
  }
}
