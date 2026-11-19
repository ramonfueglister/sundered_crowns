// A hash of the world as the systems see it, with every person named by the uid and not by the row: the same for a
// world with the archive of the dead and without it (src/sim/people/archive.ts), and for a world of the state before
// the uids (the row is then the uid). Used by npm run archive:check and the tests of the archive.
import { ALIVE, type WorldState } from '../../src/sim/state';
import type { Column } from '../../src/sim/ecs';

/** FNV-1a over the world as the systems see it, every person named by the uid (the row where a state has no uids). */
export function livingHash(s: WorldState): string {
  let h = 0x811c9dc5;
  const byte = (b: number) => { h ^= b & 255; h = Math.imul(h, 0x01000193); };
  const f64 = new Float64Array(1), u8 = new Uint8Array(f64.buffer);
  const num = (v: number) => { f64[0] = v; for (let i = 0; i < 8; i++) byte(u8[i]); };
  const t = s.person, P = t.cols as Record<string, Column>, uid = (id: number) => (id < 0 ? -1 : P.uid ? P.uid[id] : id);
  const cols = Object.keys(P).filter((k) => k !== 'uid' && k !== 'children').sort();
  const died = P.died, role = P.role;
  let n = 0;
  for (let id = 0; id < t.size; id++) {
    if (!t.alive[id] || (died[id] !== ALIVE && role[id] === 0)) continue; // the living and the dead who hold a part
    n++; num(uid(id));
    for (const k of cols) {
      const c = P[k], w = c.length / t.alive.length;
      for (let j = 0; j < w; j++) num(c[id * w + j]);
    }
  }
  num(n);
  const F = s.family.cols as Record<string, Column>;
  for (let f = 0; f < s.family.size; f++) for (const k of Object.keys(F).sort()) num(k === 'man' || k === 'woman' ? uid(F[k][f]) : F[k][f]);
  const R = s.firm.cols as Record<string, Column>;
  for (let f = 0; f < s.firm.size; f++) for (const k of Object.keys(R).sort()) num(k === 'owner' ? uid(R[k][f]) : R[k][f]);
  for (let r = 0; r < s.realm.size; r++) num(uid(s.realm.cols.holder[r]));
  for (const x of s.named) num(uid(x.person));
  const e = s.economy.cities;
  if (e) { for (const v of e.figures) num(v); for (const b of e.model) byte(b); num(e.day); }
  for (const v of s.place.pop) num(v);
  return (h >>> 0).toString(16).padStart(8, '0');
}
