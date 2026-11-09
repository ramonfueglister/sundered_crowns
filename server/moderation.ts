// Moderation of player messages (spec point 105): a word filter loaded from a server config file (no word list in the
// code), mute and block lists per player, reports kept for the admins, bans, and rate limits that do not depend on
// the content. Pure helpers; the world server (server/world.ts) keeps the state in its meta file.
import { existsSync, readFileSync, statSync } from 'node:fs';

/** One entry per line; `#` starts a comment. `word` matches the whole word, `word*` every word starting with it. */
export function parseWordList(text: string): string[] {
  return text.split('\n').map((l) => l.replace(/#.*$/, '').trim().toLowerCase()).filter(Boolean);
}

// common letter substitutions folded before matching (so "1d10t" is caught like "idiot")
const FOLD: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };
const fold = (w: string) => w.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[013457@$!]/g, (c) => FOLD[c] ?? c);

export class WordFilter {
  private exact = new Set<string>(); private prefixes: string[] = [];
  private mtime = 0; private checked = 0;
  constructor(words: string[] = [], private file?: string) { this.set(words); if (file) this.reload(true); }
  set(words: string[]) {
    this.exact.clear(); this.prefixes = [];
    for (const raw of words) { const w = fold(raw); if (!w) continue; if (w.endsWith('*')) { if (w.length > 1) this.prefixes.push(w.slice(0, -1)); } else this.exact.add(w); }
  }
  get size() { return this.exact.size + this.prefixes.length; }
  /** Re-reads the config file when it changed (checked at most every 30 s unless forced). */
  reload(force = false): boolean {
    if (!this.file) return false;
    const now = Date.now(); if (!force && now - this.checked < 30_000) return false; this.checked = now;
    try {
      if (!existsSync(this.file)) { if (this.size) { this.set([]); this.mtime = 0; } return false; }
      const m = statSync(this.file).mtimeMs; if (!force && m === this.mtime) return false;
      this.mtime = m; this.set(parseWordList(readFileSync(this.file, 'utf8'))); return true;
    } catch { return false; }
  }
  private bad(word: string): boolean {
    const w = fold(word); if (!w) return false;
    if (this.exact.has(w)) return true;
    for (const p of this.prefixes) if (w.startsWith(p)) return true;
    return false;
  }
  /** The text with every filtered word replaced by asterisks; `hits` counts them. */
  clean(text: string): { text: string; hits: number } {
    this.reload();
    if (!this.size) return { text, hits: 0 };
    let hits = 0;
    // a word: letters and digits, with @ and $ as letters and ! only inside a word (so "knave!" keeps its mark)
    const out = text.replace(/[\p{L}\p{N}@$]+(?:!+[\p{L}\p{N}@$]+)*/gu, (w) => { if (!this.bad(w)) return w; hits++; return '*'.repeat(Math.max(3, [...w].length)); });
    return { text: out, hits };
  }
}

export interface Report { id: number; at: number; day: number; by: string; byName: string; uid: string; name: string; msg?: number; text: string; reason: string; status: 'open' | 'dismissed' | 'actioned' }
export interface Ban { at: number; by: string; reason: string; until: number /* epoch ms, 0 = for good */ }
export interface ModerationState { mutes: Record<string, string[]>; blocks: Record<string, string[]>; reports: Report[]; nextReport: number; bans: Record<string, Ban> }

export function emptyModeration(): ModerationState { return { mutes: {}, blocks: {}, reports: [], nextReport: 1, bans: {} }; }

export const isMuted = (m: ModerationState, viewer: string, sender: string) => !!m.mutes[viewer]?.includes(sender);
export const isBlocked = (m: ModerationState, viewer: string, sender: string) => !!m.blocks[viewer]?.includes(sender);
/** Whether `viewer` sees a chat line of `sender`: a mute hides public lines, a block hides everything. */
export function hears(m: ModerationState, viewer: string, sender: string, direct: boolean): boolean {
  if (viewer === sender) return true;
  if (isBlocked(m, viewer, sender)) return false;
  if (!direct && isMuted(m, viewer, sender)) return false;
  return true;
}
export function setList(lists: Record<string, string[]>, owner: string, other: string, on: boolean, max = 200) {
  const cur = lists[owner] ?? [];
  const next = on ? (cur.includes(other) ? cur : [...cur, other].slice(-max)) : cur.filter((x) => x !== other);
  if (next.length) lists[owner] = next; else delete lists[owner];
}
export function banned(m: ModerationState, uid: string, now = Date.now()): Ban | null {
  const b = m.bans[uid]; if (!b) return null;
  if (b.until && b.until <= now) { delete m.bans[uid]; return null; }
  return b;
}

/** A sender may not repeat the same line within this many ms (flood of copies). */
export const REPEAT_MS = 30_000;
export function isRepeat(history: { text: string; at: number }[], text: string, now = Date.now()): boolean {
  const t = text.trim().toLowerCase();
  return history.some((h) => now - h.at < REPEAT_MS && h.text.trim().toLowerCase() === t);
}
