// The persons the systems go over (docs/PEOPLE_DESIGN.md, "The living and the dead"): the living, and the dead whose
// part in the economy still waits for a successor (an estate, src/sim/systems/deaths.ts).
//
// The table of the persons keeps the dead of the year and those the world still needs (the archive takes the others on
// the first of January, src/sim/people/archive.ts), so a loop over all its rows goes over some thousand dead too.
// This list grows only with the people. It is derived from the columns, so a loaded state builds it anew and a
// snapshot does not change: built when a table is first seen (the archive makes a new table when the rows close up);
// the persons who came into the world since it was last read are added (rows are only ever added while a year runs);
// the dead without a part drop out when it is next read. A dead person never comes back onto it: the part of an
// estate goes to a living heir.
//
// The ids come in their order, as a loop over the rows visits them, so a system that goes over the list instead of
// the rows computes the same, number for number.
import type { WorldState } from '../state';
import { ALIVE } from '../state';

interface List { ids: Int32Array; n: number; /** the rows of the table looked at so far */ seen: number }
/** By table: a world founds its persons anew in a new table (src/sim/systems/people.ts). */
const lists = new WeakMap<object, List>();

/** The living persons and the dead who hold a part in the economy (`role` other than 0, ROLE.none of
 *  src/sim/systems/work.ts), in the order of their ids. The array is the list's own and changes when the list is
 *  next read: go over it, do not keep it. */
export function presentPersons(s: WorldState): Int32Array {
  const t = s.person, alive = t.alive, died = t.cols.died, role = t.cols.role;
  let l = lists.get(t);
  if (!l || l.seen > t.size) { l = { ids: new Int32Array(Math.max(1024, t.size)), n: 0, seen: 0 }; lists.set(t, l); }
  let ids = l.ids, k = 0;
  for (let i = 0; i < l.n; i++) { const id = ids[i]; if (alive[id] && (died[id] === ALIVE || role[id] !== 0)) ids[k++] = id; }
  if (l.seen < t.size) {
    if (k + t.size - l.seen > ids.length) { const more = new Int32Array(Math.max(2 * ids.length, k + t.size - l.seen)); more.set(ids.subarray(0, k)); ids = l.ids = more; }
    for (let id = l.seen; id < t.size; id++) if (alive[id] && (died[id] === ALIVE || role[id] !== 0)) ids[k++] = id;
    l.seen = t.size;
  }
  l.n = k;
  return ids.subarray(0, k);
}
