// Entity storage. An entity is a row number in a table; each component is one dense typed array (a column), so
// systems run over plain arrays and a snapshot of the world is just its arrays. Tables are plain data (no classes),
// which keeps them serialisable as they are (src/sim/snapshot.ts).
//
// Rows of removed entities are reused. Code that keeps an id across days must check `alive` before using it.

export type Column = Float64Array | Float32Array | Int32Array | Int16Array | Int8Array | Uint32Array | Uint16Array | Uint8Array;
export type ColumnType = 'f64' | 'f32' | 'i32' | 'i16' | 'i8' | 'u32' | 'u16' | 'u8';
const CTOR: Record<ColumnType, new (n: number) => Column> = {
  f64: Float64Array, f32: Float32Array, i32: Int32Array, i16: Int16Array, i8: Int8Array, u32: Uint32Array, u16: Uint16Array, u8: Uint8Array,
};
type ArrayOf<T extends ColumnType> = T extends 'f64' ? Float64Array : T extends 'f32' ? Float32Array : T extends 'i32' ? Int32Array
  : T extends 'i16' ? Int16Array : T extends 'i8' ? Int8Array : T extends 'u32' ? Uint32Array : T extends 'u16' ? Uint16Array : Uint8Array;

export type Schema = Record<string, ColumnType>;
export type Columns<S extends Schema> = { [K in keyof S]: ArrayOf<S[K]> };

export interface Table<S extends Schema> {
  /** rows in use or freed (the high-water mark); ids are 0 … size − 1 */
  size: number;
  /** 1 for a live entity */
  alive: Uint8Array;
  /** freed rows, reused last-in first-out */
  free: number[];
  cols: Columns<S>;
}

/** Makes columns of the given types and length (all zero). */
export function makeColumns<S extends Schema>(schema: S, n: number): Columns<S> {
  const c: Record<string, Column> = {};
  for (const k of Object.keys(schema)) c[k] = new CTOR[schema[k]](n);
  return c as Columns<S>;
}

export function createTable<S extends Schema>(schema: S, capacity = 16): Table<S> {
  return { size: 0, alive: new Uint8Array(Math.max(1, capacity)), free: [], cols: makeColumns(schema, Math.max(1, capacity)) };
}

function grow<S extends Schema>(t: Table<S>, need: number) {
  const cap = t.alive.length; if (need <= cap) return;
  const n = Math.max(need, cap * 2);
  const a = new Uint8Array(n); a.set(t.alive); t.alive = a;
  const cols = t.cols as Record<string, Column>;
  for (const k of Object.keys(cols)) {
    const old = cols[k]; const c = new (old.constructor as new (n: number) => Column)(n); c.set(old as any); cols[k] = c;
  }
}

/** Adds an entity (all components zero) and returns its id. */
export function spawn<S extends Schema>(t: Table<S>): number {
  const id = t.free.length ? t.free.pop()! : t.size++;
  grow(t, t.size);
  const cols = t.cols as Record<string, Column>;
  for (const k of Object.keys(cols)) cols[k][id] = 0;
  t.alive[id] = 1;
  return id;
}

export function despawn<S extends Schema>(t: Table<S>, id: number): void {
  if (id < 0 || id >= t.size || !t.alive[id]) return;
  t.alive[id] = 0; t.free.push(id);
}

export const isAlive = <S extends Schema>(t: Table<S>, id: number) => id >= 0 && id < t.size && t.alive[id] === 1;

/** Number of live entities. */
export function liveCount<S extends Schema>(t: Table<S>): number {
  let n = 0; for (let i = 0; i < t.size; i++) n += t.alive[i]; return n;
}
