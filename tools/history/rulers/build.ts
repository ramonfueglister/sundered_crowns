// Builds the chronicle of rulers of 1291 (public/data/rulers_1291.json, src/sim/content/chronicle.ts) from the sourced
// lists of every realm (data/history/rulers/lists/<realm>.csv, one row per holder of the title from 1 January 1291
// to 1848, every row with its Wikipedia revision), the Wikidata fetch (data/history/rulers/wikidata/holders.csv, for
// the sex of a person), the families of the rulers from Wikidata (data/history/rulers/wikidata/families/persons.csv,
// tools/history/rulers/families.py) and the orders of succession of the realms (data/history/rulers/succession.csv).
// Prints what it could not use.
//
//   npx tsx tools/history/rulers/build.ts
//
// Rules (nothing is invented; what the sources leave open stays open or is named here):
// - A person is one person across all lists: the same Wikidata id, else the same name and birth date.
// - A reign without a start begins when the reign before it in the list ends; without an end it ends when the next
//   begins. A reign with neither stays out (counted).
// - Rows of a collective government (councils, priors) are no person and stay out, so are rows that name a rule
//   instead of a person ("Papal control", "occupation by the Livonian Order"), and so are rows the source marks as
//   a claimant or "not a monarch" (they did not hold the title), unless the note says the claimant was in control.
// - The sex is that of Wikidata where the person has an id there; else female when the name or note calls the person
//   queen, empress, duchess, countess, margravine, princess, abbess or lady, else male (counted, so it can be checked).
// - The kin of the rulers are the persons of the family walk who are in no list: persons of the chronicle without a
//   reign (src/sim/systems/heirs.ts), with the name, dates and sex Wikidata gives; one without a sex stays out
//   (counted): the orders of succession need it.
// - The father and the mother are those of Wikidata (P22, P25): of the family walk, else of holders.csv; kept only
//   where they are persons of the chronicle too (the world knows no other: src/sim/systems/rulers.ts, `unborn`). Where
//   Wikidata names two fathers or two mothers, the person has none (counted): the source does not decide.
// - The order of succession of a realm is that of data/history/rulers/succession.csv, with its source.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  ChronicleJson,
  ChronicleLaw,
  ChroniclePerson,
  ChronicleReign,
  SuccessionOrder,
} from '../../../src/sim/content/chronicle';

const ROOT = resolve(import.meta.dirname, '../../..');
const LISTS = resolve(ROOT, 'data/history/rulers/lists');
const YEAR = 1291,
  UNTIL = '1848-12-31';

/** A CSV with a header row and quoted fields (RFC 4180). */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    f = '',
    q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += c;
      continue;
    }
    if (c === '"') q = true;
    else if (c === ',') {
      row.push(f);
      f = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f);
      f = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else f += c;
  }
  if (f !== '' || row.length) {
    row.push(f);
    if (row.some((x) => x !== '')) rows.push(row);
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, k) => [h.trim(), (r[k] ?? '').trim()])));
}

const FEMALE = /\b(queen|empress|duchess|countess|margravine|princess|abbess|lady|tsaritsa|sultana)\b/i;
const COLLECTIVE = /collective government/i,
  NO_PERSON = /^(papal control|occupation by)\b/i;
const NOT_HOLDER = /claimant|pretender|not a monarch|anti-?king|antipope/i,
  IN_CONTROL = /in control|de facto/i;
const date = (s: string) => (/^-?\d{1,4}(-\d{2}(-\d{2})?)?$/.test(s) ? s : null);
/** A date as the source gives it, padded to a full day (the middle of its year or month), to be compared on the text. */
const pad = (d: string) => (d.length === 4 ? `${d}-07-01` : d.length === 7 ? `${d}-15` : d);

/** What the build counted, and the rows it could not use. */
interface RulersReport {
  lists: number;
  rows: number;
  collective: number;
  claimants: number;
  noDates: number;
  beforeStart: number;
  sexByWikidata: number;
  sexByWord: number;
  sexAssumed: number;
  /** persons whose father, whose mother is a person of the chronicle too; with two in Wikidata */
  fathers: number;
  mothers: number;
  twoParents: number;
  /** kin of the rulers from the family walk, and those left out for want of a sex */
  kin: number;
  kinWithoutSex: number;
  /** realms with an order of succession */
  laws: number;
  problems: string[];
}

export function build(): { chronicle: ChronicleJson; report: RulersReport } {
  const people: People = { sex: sexesOf(), persons: [], byKey: new Map() },
    reigns: ChronicleReign[] = [];
  const report: RulersReport = {
    lists: 0,
    rows: 0,
    collective: 0,
    claimants: 0,
    noDates: 0,
    beforeStart: 0,
    sexByWikidata: 0,
    sexByWord: 0,
    sexAssumed: 0,
    fathers: 0,
    mothers: 0,
    twoParents: 0,
    kin: 0,
    kinWithoutSex: 0,
    laws: 0,
    problems: [],
  };
  const files = existsSync(LISTS)
    ? readdirSync(LISTS)
        .filter((f) => f.endsWith('.csv') && f !== 'INDEX.csv')
        .sort()
    : [];
  for (const file of files) {
    const realm = file.slice(0, -4),
      rows = parseCsv(readFileSync(resolve(LISTS, file), 'utf8'));
    rows.sort((a, b) => Number(a.order) - Number(b.order));
    report.lists++;
    const kept = holdersIn(rows, report);
    kept.forEach((r, k) => {
      report.rows++;
      const start =
        date(r.reign_start) ?? (k > 0 ? date(kept[k - 1].reign_end) : null) ?? (k === 0 ? `${YEAR}-01-01` : null);
      const end = date(r.reign_end) ?? (k + 1 < kept.length ? date(kept[k + 1].reign_start) : null);
      if (!start) {
        report.noDates++;
        report.problems.push(`${realm} #${r.order} ${r.name}: no start`);
        return;
      }
      if (end && pad(end) < `${YEAR}-01-01`) {
        report.beforeStart++;
        return;
      }
      const person = personOf(r, realm, people, report),
        source = r.source_revid ? `${r.source_url} (revision ${r.source_revid})` : (r.source_url ?? '');
      reigns.push({ realm, person, start, end: end && pad(end) <= UNTIL ? end : null, source });
    });
  }
  const families = readFamilies();
  addKin(people, families, report);
  addParents(people, families, report);
  const laws = readLaws(report);
  return { chronicle: { year: YEAR, until: UNTIL, persons: people.persons, reigns, laws }, report };
}

/** The persons of the family walk by their Wikidata id (empty without the file). */
function readFamilies(): Map<string, Record<string, string>> {
  const f = resolve(ROOT, 'data/history/rulers/wikidata/families/persons.csv');
  return new Map(existsSync(f) ? parseCsv(readFileSync(f, 'utf8')).map((r) => [r.qid, r]) : []);
}

/** Adds the persons of the family walk who are in no list, as kin of the rulers. */
function addKin(people: People, families: Map<string, Record<string, string>>, report: RulersReport): void {
  for (const [qid, r] of families) {
    if (people.byKey.has(qid)) continue;
    if (r.sex !== 'm' && r.sex !== 'f') {
      report.kinWithoutSex++;
      continue;
    }
    const house = r.familyLabel.split('|')[0] ?? '';
    const p: ChroniclePerson = {
      key: qid,
      name: r.label || qid,
      house,
      qid,
      sex: r.sex === 'm' ? 1 : 0,
      born: date(r.birth),
      died: date(r.death),
    };
    people.byKey.set(qid, people.persons.push(p) - 1);
    report.kin++;
  }
}

/** Gives every person the father and the mother that Wikidata names, where they are persons of the chronicle too. */
function addParents(people: People, families: Map<string, Record<string, string>>, report: RulersReport): void {
  const wd = resolve(ROOT, 'data/history/rulers/wikidata/holders.csv');
  const parents = new Map<string, { father: string; mother: string }>();
  if (existsSync(wd))
    for (const r of parseCsv(readFileSync(wd, 'utf8'))) parents.set(r.person, { father: r.father, mother: r.mother });
  for (const [qid, r] of families) parents.set(qid, { father: r.father, mother: r.mother });
  for (const p of people.persons) {
    const known = p.qid ? parents.get(p.qid) : undefined;
    if (!known) continue;
    if (known.father.includes('|') || known.mother.includes('|')) report.twoParents++;
    if (known.father && !known.father.includes('|') && people.byKey.has(known.father)) {
      p.father = known.father;
      report.fathers++;
    }
    if (known.mother && !known.mother.includes('|') && people.byKey.has(known.mother)) {
      p.mother = known.mother;
      report.mothers++;
    }
  }
}

/** The orders of succession of data/history/rulers/succession.csv (realm, from, order, source), oldest first. */
function readLaws(report: RulersReport): Record<string, ChronicleLaw[]> {
  const f = resolve(ROOT, 'data/history/rulers/succession.csv'),
    out: Record<string, ChronicleLaw[]> = {};
  if (!existsSync(f)) return out;
  for (const r of parseCsv(readFileSync(f, 'utf8'))) {
    const order = r.order === 'none' ? null : ORDERS.find((o) => o === r.order);
    if (order === undefined) throw new Error(`succession.csv: no such order: ${r.order}`);
    const list = out[r.realm] ?? [];
    list.push({ from: date(r.from), order, source: r.source });
    out[r.realm] = list;
  }
  for (const l of Object.values(out))
    l.sort((a, b) => (a.from === null ? -1 : b.from === null ? 1 : a.from < b.from ? -1 : 1));
  report.laws = Object.keys(out).length;
  return out;
}
const ORDERS: readonly SuccessionOrder[] = ['primogeniture', 'agnatic_seniority', 'election'];

/** The persons found so far, counted from 0, the number of each by its key, and the sex of those Wikidata knows. */
interface People {
  sex: Map<string, 0 | 1>;
  persons: ChroniclePerson[];
  byKey: Map<string, number>;
}

/** The sex of the persons Wikidata knows (0 female: Q6581072, 1 male: Q6581097), by their Wikidata id. */
function sexesOf(): Map<string, 0 | 1> {
  const sex = new Map<string, 0 | 1>();
  const wd = resolve(ROOT, 'data/history/rulers/wikidata/holders.csv');
  if (existsSync(wd))
    for (const r of parseCsv(readFileSync(wd, 'utf8'))) {
      if (r.sex === 'Q6581072') sex.set(r.person, 0);
      else if (r.sex === 'Q6581097') sex.set(r.person, 1);
    }
  return sex;
}

/** The rows of a list that name a person who held the title; the others are counted. */
function holdersIn(rows: Record<string, string>[], report: RulersReport): Record<string, string>[] {
  return rows.filter((r) => {
    if (COLLECTIVE.test(r.note ?? '') || !r.name || NO_PERSON.test(r.name)) {
      report.collective++;
      return false;
    }
    if (NOT_HOLDER.test(r.note ?? '') && !IN_CONTROL.test(r.note ?? '')) {
      report.claimants++;
      return false;
    }
    return true;
  });
}

/** The person a row names: added when first seen; seen again in another list, they keep what one of the lists knows. */
function personOf(r: Record<string, string>, realm: string, people: People, report: RulersReport): number {
  const born = date(r.born),
    died = date(r.died);
  const key = r.qid || `${r.name}|${born ?? `${realm}#${r.order}`}`;
  let p = people.byKey.get(key);
  if (p === undefined) {
    const sex = sexOf(r, people.sex, report);
    p = people.persons.push({ key, name: r.name, house: r.house ?? '', qid: r.qid ?? '', sex, born, died }) - 1;
    people.byKey.set(key, p);
  } else {
    const q = people.persons[p];
    q.born ??= born;
    q.died ??= died;
    if (!q.house) q.house = r.house ?? '';
  }
  return p;
}

/** The sex of a person new to the chronicle, by the rule at the top of this file, counted by the rule that gave it. */
function sexOf(r: Record<string, string>, sex: Map<string, 0 | 1>, report: RulersReport): 0 | 1 {
  const known = r.qid ? sex.get(r.qid) : undefined;
  if (known !== undefined) {
    report.sexByWikidata++;
    return known;
  }
  if (FEMALE.test(`${r.name} ${r.note}`)) {
    report.sexByWord++;
    return 0;
  }
  report.sexAssumed++;
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { chronicle, report } = build();
  writeFileSync(resolve(ROOT, `public/data/rulers_${YEAR}.json`), JSON.stringify(chronicle));
  const { problems, ...counts } = report;
  console.log(JSON.stringify(counts, null, 1));
  if (problems.length) console.log(`${problems.length} rows not used:\n  ${problems.slice(0, 40).join('\n  ')}`);
}
