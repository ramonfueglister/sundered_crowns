// The archive of the dead (docs/PEOPLE_DESIGN.md, feature 7, step 2): the running world keeps the living and the dead
// it still needs; the other dead go to an archive on the first day of every year, so the table of the persons, the
// memory and the snapshot grow with the people, not with the history of the world.
//
// A person has two numbers. The row (the id every system reads the columns by) holds from one first of January to
// the next: on that day the rows of the persons who stay close up, in the order they had, and everything in the state
// that names a row is written anew (the heads of the families, the owners of the firms, the holders of the crowns,
// the persons of history). The uid never changes and is never given twice in a world. All that keeps a person beyond
// the day names the uid: the parents, the browser (src/net/people.ts), the copy of the rulers in Supabase
// (server/rulers_copy.ts), and the archive; and a person's own draws of chance are by the uid, so a person draws the
// same with and without the archive. The rows lie in the order of the uids (a newcomer gets the next row and the next
// uid, and the rows close up in their order), so the systems go over the persons in the same order either way, and
// the row of a uid is found by halving (`rowOf`).
//
// The dead who stay: a dead person who still holds a part in the economy (an estate, src/sim/systems/deaths.ts), a
// person of history (the rulers, src/sim/systems/rulers.ts: their crowns and their copy name them), and the dead
// parents of a living person one of whose parents belongs to a household of the town (a family with a seat): when
// the household is vacant, the weddings look for its heir among the children by the family of their parents, and
// take the custom of the heir's father (src/sim/systems/families.ts). A family that has no seat never gets one again
// (a household passes to a new family), so a parent who went to the archive is never looked for. Nothing else reads a
// dead person: the parents are compared as uids, and a parent who is not in the table has died.
//
// The archived persons leave the state: the state keeps for every year only how many went and their smallest and
// greatest uid (`WorldState.archive`). The persons themselves are handed to whoever runs the world (`takeArchived`):
// the world server writes them to its disk and to Supabase Storage, once, and reads a dead person from there when a
// browser asks for one (server/world.ts). A replay archives the same persons on the same day, so a year that did not
// reach the disk before a crash comes again.
import type { ArchiveYear, WorldState } from '../state';
import { ALIVE, PERSON_SCHEMA } from '../state';
import { type Column, type Columns, createTable, makeColumns, spawn } from '../ecs';
import type { System } from '../schedule';
import { decodeData, encodeData } from '../snapshot';
import { NG } from './genes';

/** A person comes into the world: the next row of the table, with the next uid. */
export function spawnPerson(s: WorldState): number {
  const id = spawn(s.person);
  s.person.cols.uid[id] = s.nextUid++;
  return id;
}

/** The row of the person `uid`, −1 where the person is in the archive or was never in the world. */
export function rowOf(s: WorldState, uid: number): number {
  if (uid < 0) return -1;
  const U = s.person.cols.uid;
  let lo = 0,
    hi = s.person.size - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1,
      u = U[m];
    if (u === uid) return m;
    if (u < uid) lo = m + 1;
    else hi = m - 1;
  }
  return -1;
}

/** What the archive keeps of a dead person: who the person was, not what the person did in the economy. About 140
 *  bytes a person. */
const ARCHIVE_SCHEMA = {
  uid: 'i32',
  born: 'i32',
  died: 'i32',
  sex: 'u8',
  /** uids, as in the table of the persons */
  mother: 'i32',
  father: 'i32',
  /** the family the person last lived in, and its place */
  family: 'i32',
  place: 'i16',
  home: 'i32',
  culture: 'u16',
  faith: 'u8',
  iq: 'u8',
  o: 'u8',
  c: 'u8',
  e: 'u8',
  a: 'u8',
  n: 'u8',
  genes: ['u8', 2 * NG],
} as const;
type ArchiveSchema = typeof ARCHIVE_SCHEMA;

/** The persons who went to the archive on one day, in the order of their uids. */
export interface ArchivedPersons {
  /** the day they went (the first of January) */
  day: number;
  persons: number;
  cols: Columns<ArchiveSchema>;
}

/** The years archived and not yet taken by whoever runs the world, by state. */
const outbox = new WeakMap<WorldState, ArchivedPersons[]>();

/** The years that went to the archive since this was last called, the earliest first. */
export function takeArchived(s: WorldState): ArchivedPersons[] {
  const out = outbox.get(s) ?? [];
  outbox.delete(s);
  return out;
}

/** Which rows stay in the running world: the living, the dead who hold a part in the economy, the persons of history
 *  and the dead parents of a living person whose mother or father belongs to a household. */
export function rowsThatStay(s: WorldState): Uint8Array {
  const t = s.person,
    P = t.cols,
    F = s.family.cols,
    n = t.size,
    keep = new Uint8Array(n);
  const seated = (row: number) => {
    if (row < 0) return false;
    const f = P.family[row];
    return f >= 0 && f < s.family.size && F.seat[f] === 1;
  };
  for (let id = 0; id < n; id++) {
    if (!t.alive[id]) continue;
    if (P.died[id] === ALIVE) {
      keep[id] = 1;
      const m = rowOf(s, P.mother[id]),
        f = rowOf(s, P.father[id]);
      if (seated(m) || seated(f)) {
        if (m >= 0) keep[m] = 1;
        if (f >= 0) keep[f] = 1;
      }
    } else if (P.role[id] !== 0) keep[id] = 1;
  }
  for (const x of s.named ?? []) if (x.person >= 0 && x.person < n) keep[x.person] = 1;
  return keep;
}

/** The dead whom nothing in the running world needs go to the archive, and the rows of the others close up. Returns
 *  the archived persons, null when nobody went (and then nothing changes). */
export function archiveDead(s: WorldState): ArchivedPersons | null {
  const t = s.person,
    P = t.cols,
    n = t.size,
    keep = rowsThatStay(s);
  let stay = 0;
  for (let id = 0; id < n; id++) stay += keep[id];
  const gone = n - stay;
  if (gone === 0) return null;
  // the archived persons, in the order of their uids
  const A = makeColumns(ARCHIVE_SCHEMA, gone),
    F = s.family.cols;
  let k = 0;
  for (let id = 0; id < n; id++) {
    if (keep[id]) continue;
    A.uid[k] = P.uid[id];
    A.born[k] = P.born[id];
    A.died[k] = P.died[id];
    A.sex[k] = P.sex[id];
    A.mother[k] = P.mother[id];
    A.father[k] = P.father[id];
    const f = P.family[id];
    A.family[k] = f;
    A.place[k] = f >= 0 && f < s.family.size ? F.place[f] : -1;
    A.home[k] = P.home[id];
    A.culture[k] = P.culture[id];
    A.faith[k] = P.faith[id];
    A.iq[k] = P.iq[id];
    A.o[k] = P.o[id];
    A.c[k] = P.c[id];
    A.e[k] = P.e[id];
    A.a[k] = P.a[id];
    A.n[k] = P.n[id];
    A.genes.set(P.genes.subarray(id * 2 * NG, (id + 1) * 2 * NG), k * 2 * NG);
    k++;
  }
  // the rows that stay close up, in their order: runs of rows are copied column by column
  const next = createTable(PERSON_SCHEMA, Math.max(1024, Math.ceil(stay * 1.25)));
  const row = new Int32Array(n).fill(-1),
    from = t.cols as Record<string, Column>,
    to = next.cols as Record<string, Column>;
  const widths = Object.keys(from).map((c) => [c, from[c].length / t.alive.length] as const);
  let j = 0;
  for (let id = 0; id < n; ) {
    if (!keep[id]) {
      id++;
      continue;
    }
    let end = id;
    while (end < n && keep[end]) {
      row[end] = j + end - id;
      end++;
    }
    for (const [c, w] of widths) to[c].set(from[c].subarray(id * w, end * w) as never, j * w);
    j += end - id;
    id = end;
  }
  next.size = stay;
  next.alive.fill(1, 0, stay);
  // everything that names a row names the new one
  const re = (id: number) => (id >= 0 && id < n ? row[id] : -1);
  for (let f = 0; f < s.family.size; f++) {
    F.man[f] = re(F.man[f]);
    F.woman[f] = re(F.woman[f]);
  }
  const owner = s.firm.cols.owner;
  for (let f = 0; f < s.firm.size; f++) owner[f] = re(owner[f]);
  const holder = s.realm.cols.holder;
  for (let r = 0; r < s.realm.size; r++) holder[r] = re(holder[r]);
  for (const x of s.named ?? []) x.person = re(x.person);
  // a new table: what the systems derive from the persons (the lists of events, of the living, of the places) is
  // kept by table, so it is built anew from it, as for a loaded state
  s.person = next as typeof s.person;
  const year: ArchiveYear = { day: s.day, persons: gone, first: A.uid[0], last: A.uid[gone - 1] };
  s.archive.push(year);
  const out: ArchivedPersons = { day: s.day, persons: gone, cols: A };
  const box = outbox.get(s);
  if (box) box.push(out);
  else outbox.set(s, [out]);
  return out;
}

/** The years of the archive that may hold `uid`, the latest first. */
export function yearsWith(s: WorldState, uid: number): ArchiveYear[] {
  return s.archive.filter((y) => y.first <= uid && uid <= y.last).reverse();
}

/** The place of `uid` among the persons of an archived year, −1 where it is not there. */
export function indexIn(a: ArchivedPersons, uid: number): number {
  const U = a.cols.uid;
  let lo = 0,
    hi = a.persons - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1,
      u = U[m];
    if (u === uid) return m;
    if (u < uid) lo = m + 1;
    else hi = m - 1;
  }
  return -1;
}

const MAGIC = 0x53434131; // "SCA1"
/** The bytes of an archived year (the encoding of the snapshot, src/sim/snapshot.ts). */
export const encodeArchived = (a: ArchivedPersons): Uint8Array => encodeData(MAGIC, a);
export function decodeArchived(bytes: Uint8Array): ArchivedPersons {
  const a = decodeData(MAGIC, bytes) as ArchivedPersons;
  if (!a || typeof a.day !== 'number' || !a.cols || a.cols.uid.length !== a.persons)
    throw new Error('not a year of the archive');
  return a;
}

/** On the first day of every year, before the deaths of the day: the dead whom nothing needs go to the archive. */
export const archive: System = {
  id: 'archive',
  run(s, _w, t) {
    if (t.newYear) archiveDead(s);
  },
};
