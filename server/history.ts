// The history of the borders of a world: who held which place from its first day on, day by day as the world ran.
// The replay of the borders in the game (src/ui/replay.ts) plays it back, as the replay at the end of an EU4/EU5 game
// plays the game that was played (Ramon, 19 November 2026: "an die echte spielsimulation anbinden").
//
// Kept beside the world (borders.ndjson), not in its state: it only looks back and changes nothing. The first line
// holds the owners of every place and every realm, every later line what changed on that day: places that went to
// another realm, realms that came in or took another name or colour. A world that is older than its history begins
// it from its genesis snapshot and the chronicle of borders (src/sim/content/borders.ts) up to the day it has
// reached; whatever else moved in between comes as one line on that day.
import { existsSync, readFileSync, writeFileSync, renameSync, openSync, writeSync, closeSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import type { WorldState } from '../src/sim/state';
import type { World } from '../src/sim/world';
import type { HistoryLine, HistoryRealm } from '../src/net/protocol';

/** One realm as the history keeps it. */
function realmOf(s: WorldState, r: number): HistoryRealm {
  const t = s.realmText[r];
  return { id: r, key: t.key, color: s.realm.cols.color[r], short: t.short, name: t.name };
}
const same = (a: HistoryRealm, b: HistoryRealm) =>
  a.key === b.key &&
  a.color === b.color &&
  a.short.en === b.short.en &&
  a.short.de === b.short.de &&
  a.name.en === b.name.en &&
  a.name.de === b.name.de;

/** The realms as they stand (by id; holes for ids no longer in use). */
function realmsOf(s: WorldState): (HistoryRealm | undefined)[] {
  const out: (HistoryRealm | undefined)[] = [];
  for (let r = 0; r < s.realm.size; r++) if (s.realm.alive[r]) out[r] = realmOf(s, r);
  return out;
}

export class BorderHistory {
  private lines: HistoryLine[] = [];
  private owner!: Int16Array;
  private realms: (HistoryRealm | undefined)[] = [];
  private fd = -1;
  private packed: { lines: number; json: Buffer; gz: Buffer } | null = null;

  /**
   * Opens the history at `file` for the world `s` (as it stands now) and brings it up to the world's day. `genesis`
   * gives the world's state of day 0, for a world that ran before it kept a history (null: none on disk).
   */
  constructor(
    readonly file: string,
    s: WorldState,
    w: World,
    genesis: () => WorldState | null,
  ) {
    if (existsSync(file)) {
      for (const text of readFileSync(file, 'utf8').split('\n')) {
        if (!text.trim()) continue;
        let line: HistoryLine;
        try {
          line = JSON.parse(text);
        } catch {
          break; /* torn last line after a crash */
        }
        if (!this.lines.length && !line.owner) break;
        this.take(line);
      }
      // a history that reaches beyond the world (a world begun anew under the same name) is begun anew too
      if (this.lines.length && this.lines[this.lines.length - 1].d > s.day) this.lines = [];
    }
    if (!this.lines.length) this.begin(s, w, genesis);
    else this.rewrite(); // without a torn line at its end
    // what moved while the history was not written (a crash between the day and its line)
    this.record(s);
  }

  /** The owners and realms after a line. */
  private take(line: HistoryLine) {
    if (line.owner) {
      this.owner = Int16Array.from(line.owner);
      this.realms = [];
    }
    for (const [p, o] of line.c ?? []) this.owner[p] = o;
    for (const r of line.r ?? []) this.realms[r.id] = r;
    this.lines.push(line);
  }

  /** A history from the world's first day: of its genesis and the chronicle of borders up to now, else from now. */
  private begin(s: WorldState, w: World, genesis: () => WorldState | null) {
    let g: WorldState | null = null;
    if (s.day > 0) {
      try {
        g = genesis();
      } catch {
        g = null;
      }
    }
    const base = g && g.place.owner.length === s.place.owner.length ? g : s;
    this.take({
      d: base.day,
      owner: Array.from(base.place.owner),
      r: realmsOf(base).filter((r): r is HistoryRealm => !!r),
    });
    if (base !== s) this.chronicle(s, w);
    this.rewrite();
  }

  /** The chronicle of borders from the genesis up to the world's day, played on the owners alone: the realms by the
   *  ids the world gave them (src/sim/systems/borders.ts gives them in the order of their first places). */
  private chronicle(s: WorldState, w: World) {
    const b = w.borders;
    if (!b || b.year !== s.startYear) return;
    const id = new Map(s.realmText.map((t, k) => [t.key, k]));
    let day = Number.NaN,
      c = new Map<number, number>(),
      r = new Map<number, HistoryRealm>();
    const flush = () => {
      if (c.size || r.size)
        this.take({ d: day, ...(c.size ? { c: [...c] } : {}), ...(r.size ? { r: [...r.values()] } : {}) });
      c = new Map();
      r = new Map();
    };
    for (const e of b.events) {
      if (e.day <= this.lines[0].d) continue;
      if (e.day > s.day) break;
      if (e.day !== day) {
        flush();
        day = e.day;
      }
      const k = id.get(e.to);
      if (k === undefined || k >= s.realm.size) continue;
      const known = r.get(k) ?? this.realms[k];
      if (e.name) {
        const now = {
          ...(known ?? realmOf(s, k)),
          short: { en: e.name.short, de: e.name.short },
          name: { en: e.name.name, de: e.name.name },
        };
        r.set(k, now);
        this.realms[k] = now;
        continue;
      }
      if (!known) {
        const now = { ...realmOf(s, k) };
        const info = b.realms.get(e.to);
        if (info) {
          now.short = { en: info.short, de: info.short };
          now.name = { en: info.name, de: info.name };
        }
        r.set(k, now);
        this.realms[k] = now;
      }
      for (const p of e.places)
        if (p < this.owner.length && this.owner[p] !== k) {
          this.owner[p] = k;
          c.set(p, k);
        }
    }
    flush();
  }

  /** Writes the whole history anew (when it is begun, or read with a torn line) and opens it for more. */
  private rewrite() {
    if (this.fd >= 0) closeSync(this.fd);
    writeFileSync(`${this.file}.tmp`, `${this.lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
    renameSync(`${this.file}.tmp`, this.file);
    this.fd = openSync(this.file, 'a');
    this.packed = null;
  }

  /** After a day: what moved since the last line, as a line of the world's day (nothing when nothing moved). */
  record(s: WorldState) {
    const o = s.place.owner,
      c: [number, number][] = [],
      r: HistoryRealm[] = [];
    for (let i = 0; i < o.length; i++) if (o[i] !== this.owner[i]) c.push([i, o[i]]);
    for (let k = 0; k < s.realm.size; k++) {
      if (!s.realm.alive[k]) continue;
      const now = realmOf(s, k),
        was = this.realms[k];
      if (!was || !same(was, now)) r.push(now);
    }
    if (!c.length && !r.length) return;
    const line: HistoryLine = { d: s.day, ...(c.length ? { c } : {}), ...(r.length ? { r } : {}) };
    this.take(line);
    writeSync(this.fd, `${JSON.stringify(line)}\n`);
    this.packed = null;
  }

  /** The whole history as the client fetches it (`/history`), as JSON and gzipped, made once for each new line. */
  payload(startYear: number): { json: Buffer; gz: Buffer } {
    if (!this.packed || this.packed.lines !== this.lines.length) {
      const json = Buffer.from(JSON.stringify({ startYear, lines: this.lines }));
      this.packed = { lines: this.lines.length, json, gz: gzipSync(json) };
    }
    return this.packed;
  }

  get length() {
    return this.lines.length;
  }
  close() {
    if (this.fd >= 0) closeSync(this.fd);
    this.fd = -1;
  }
}
