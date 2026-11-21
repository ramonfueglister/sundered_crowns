// What the tests of the economy share (tests/economy.test.ts, tests/economy-calibration.test.ts and
// tests/economy-world.test.ts): the port's JSON, sums, and floats as their bits.

export const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
/** A table of the port's JSON (parameters, initial conditions, accounts): numbers and series of numbers by key, each
 *  read here in the shape the port gives it. */
// biome-ignore lint/suspicious/noExplicitAny: the port's tables are JSON; a key's shape is the port's, not a type here
export type PortJson = Record<string, any>;
/** The 64 bits of every float, in hexadecimal: two lists are bit for bit the same when these are. */
export const bits = (v: Float64Array) =>
  Array.from(new BigUint64Array(v.buffer, v.byteOffset, v.length), (x) => x.toString(16).padStart(16, '0')).join(' ');
