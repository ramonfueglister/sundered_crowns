// Packs what a worker hands over (plain values and lists of numbers, however nested) into one run of bytes, and
// unpacks it again: for the pieces that are kept on disk (store.ts). The run starts with the value as JSON, in which
// each list is named by its kind, its place and its length; the lists follow it, each at a place its kind can be
// read from.
const KINDS = {
  Float32Array,
  Float64Array,
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
} as const;
type Kind = keyof typeof KINDS;
/** marks a packed run (and the way it is laid out: a run of another layout is not read) */
const MARK = 0x53435031;
const even = (n: number) => (n + 7) & ~7;

export function pack(value: unknown): ArrayBuffer {
  const lists: ArrayBufferView[] = [],
    at: number[] = [];
  let end = 0;
  const tree = new TextEncoder().encode(
    JSON.stringify(value, (_key, v: unknown) => {
      if (ArrayBuffer.isView(v)) {
        const kind = v.constructor.name;
        if (!(kind in KINDS)) throw new Error(`pack: a ${kind} cannot be packed`);
        lists.push(v);
        at.push(end);
        end = even(end + v.byteLength);
        return { $list: [kind, at[at.length - 1], v.byteLength / (v as Uint8Array).BYTES_PER_ELEMENT] };
      }
      // (JSON has no word for these)
      if (typeof v === 'number' && !Number.isFinite(v)) return { $number: String(v) };
      return v;
    }),
  );
  const first = even(8 + tree.byteLength),
    run = new Uint8Array(first + end);
  new Uint32Array(run.buffer, 0, 2).set([MARK, tree.byteLength]);
  run.set(tree, 8);
  lists.forEach((l, k) => run.set(new Uint8Array(l.buffer, l.byteOffset, l.byteLength), first + at[k]));
  return run.buffer;
}

/** The value of a packed run; each of its lists has bytes of its own, so that they can be handed over one by one. */
export function unpack<T>(run: ArrayBuffer): T {
  const [mark, length] = new Uint32Array(run, 0, 2);
  if (mark !== MARK) throw new Error('unpack: not a packed run');
  const first = even(8 + length);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(run, 8, length)), (_key, v: unknown) => {
    if (v && typeof v === 'object' && '$list' in v) {
      const [kind, at, n] = v.$list as [Kind, number, number],
        end = first + at + n * KINDS[kind].BYTES_PER_ELEMENT;
      // (a file that was cut short while it was written)
      if (end > run.byteLength) throw new Error('unpack: the run is cut short');
      return new KINDS[kind](run.slice(first + at, end));
    }
    if (v && typeof v === 'object' && '$number' in v) return Number(v.$number);
    return v;
  }) as T;
}

/** The bytes of all the lists of a value, to hand them over with it. */
export function bytesOf(value: unknown, into: ArrayBuffer[] = []): ArrayBuffer[] {
  if (ArrayBuffer.isView(value)) {
    if (value.byteLength) into.push(value.buffer as ArrayBuffer);
  } else if (value && typeof value === 'object') for (const v of Object.values(value)) bytesOf(v, into);
  return into;
}
