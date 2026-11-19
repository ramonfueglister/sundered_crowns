// The readable copy of the rulers of a world in Supabase (tables world_persons and world_reigns, migration
// 20261119000100): who they are, with the row of the person in the world's person table (the ECS id), and which crown
// each held from when to when in this world. The world server writes it; the simulation never reads it, so the world
// stays the same with or without it (Ramon, 19 November 2026: "Härten plus Lesekopie", step 2).
//
// The rows are drawn from the state (the persons of history, `named`, and the day each died) and from the chronicle
// (the reigns, with the dates of the source). Every day the copy sends only the rows that changed since it last sent
// them: a ruler who came into the world, died, took or left a crown.
import type { WorldState } from '../src/sim/state';
import { ALIVE, BORN_UNKNOWN } from '../src/sim/state';
import type { World } from '../src/sim/world';

export interface PersonRow {
  world_id: string;
  /** the row of the person in the person table of the world (ECS id) */
  person: number;
  /** the key of the person in the chronicle: the Wikidata id where known */
  key: string;
  name: string; house: string; qid: string | null;
  /** 0 female, 1 male */
  sex: number;
  /** the realm of the person's first reign (the person lives in its capital) */
  home_realm: string;
  /** dates as the source gives them (YYYY-MM-DD, YYYY-MM or YYYY); died only once the person died in this world */
  born: string | null; died: string | null;
  /** in-game days since 1 January of the start year; died_day null while the person lives in the world */
  born_day: number | null; died_day: number | null;
}
export interface ReignRow {
  world_id: string;
  /** the key of the realm, and the place of the reign in the chronicle's list of that realm */
  realm: string; n: number;
  person: number;
  /** dates as the source gives them; end only once the reign ended in this world */
  start: string | null; end: string | null;
  /** in-game days; end_day null while the reign goes on in the world */
  start_day: number | null; end_day: number | null;
  source: string;
}

/** Every row of the copy as the world stands today. */
export function rulerRows(worldId: string, s: WorldState, w: World): { persons: PersonRow[]; reigns: ReignRow[] } {
  const c = w.chronicle, persons: PersonRow[] = [], reigns: ReignRow[] = [];
  if (!c || c.year !== s.startYear) return { persons, reigns };
  const P = s.person.cols, byKey = new Map<string, number>(); // chronicle key → index into c.persons
  c.persons.forEach((p, i) => byKey.set(p.key, i));
  const idOf = new Map<number, number>(); // chronicle index → person id of the world
  for (const n of s.named) {
    const i = byKey.get(n.key);
    if (i === undefined) continue;
    idOf.set(i, n.person);
    const cp = c.persons[i], died = P.died[n.person] === ALIVE ? null : P.died[n.person];
    persons.push({
      world_id: worldId, person: n.person, key: n.key, name: n.name, house: n.house, qid: n.qid || null, sex: P.sex[n.person],
      home_realm: c.home[i], born: cp.born, died: died === null ? null : cp.died,
      born_day: P.born[n.person] === BORN_UNKNOWN ? null : P.born[n.person], died_day: died,
    });
  }
  const realms = new Set(s.realmText.map((t) => t.key));
  for (const [realm, list] of c.reignsOf) {
    if (!realms.has(realm)) continue;
    list.forEach((g, n) => {
      const id = idOf.get(g.person);
      if (id === undefined || g.start > s.day) return; // not (yet) in this world
      const died = P.died[id] === ALIVE ? null : P.died[id];
      const ended = g.end !== null && g.end <= s.day ? g.end : died;
      reigns.push({
        world_id: worldId, realm, n, person: id, start: g.from, end: ended === null ? null : g.to,
        start_day: g.from === null ? null : g.start, end_day: ended, source: g.source,
      });
    });
  }
  return { persons, reigns };
}

/** What changed since the last call that was marked as sent. */
export class RulerCopy {
  private sent = new Map<string, string>();
  constructor(readonly worldId: string) {}
  changes(s: WorldState, w: World): { persons: PersonRow[]; reigns: ReignRow[]; keys: [string, string][] } {
    const all = rulerRows(this.worldId, s, w), keys: [string, string][] = [];
    const fresh = <T>(k: string, row: T) => { const j = JSON.stringify(row); if (this.sent.get(k) === j) return false; keys.push([k, j]); return true; };
    const persons = all.persons.filter((r) => fresh(`p${r.person}`, r));
    const reigns = all.reigns.filter((r) => fresh(`r${r.realm}#${r.n}`, r));
    return { persons, reigns, keys };
  }
  /** Marks the rows of a call of changes() as sent (or, when the store did not take them, as not sent). */
  sentOk(keys: [string, string][]) { for (const [k, j] of keys) this.sent.set(k, j); }
}
