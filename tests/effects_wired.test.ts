// Every effect key the content uses must have a reader in the simulation (spec: "mechanics that do what they say").
// 1. Collect every key from the content tables at runtime (laws, value axes, traditions, doctrines, innovations,
//    landmarks) and from every effect literal in src/sim by a static scan (privileges, events' and decisions'
//    modifiers, goal rewards, situations, bankruptcy, excommunication...).
// 2. Each key must be in the registry src/sim/effects.ts.
// 3. Each registry entry must really be read: the file it names contains lawEffect(…, 'key') in its code (comments
//    are stripped first, so a call left in a comment does not count).
// 4. At run time (a new game and two simulated years): every key the effect table met (laws, value axes, traditions
//    and every modifier any realm held) and every key of every modifier still held is in the registry.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EFFECTS, effectDef, workingEffects } from '../src/sim/effects';
import { LAWS, VALUES } from '../src/sim/content/laws';
import { DOCTRINES } from '../src/sim/content/doctrines';
import { INNOVATIONS } from '../src/sim/content/innovations';
import { LANDMARKS } from '../src/sim/content/landmarks';
import { GROUP_TRADITIONS } from '../src/sim/content/peoples';
import { effectKeysSeen } from '../src/sim/systems/politics';
import { newGame } from '../tools/sim/load';
import { advanceDay } from '../src/sim/engine';

const ROOT = join(__dirname, '..');
function files(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) out.push(...files(p)); else if (p.endsWith('.ts')) out.push(p); }
  return out;
}
/** The balanced {...} starting at text[i] (which must be '{'). */
function braced(t: string, i: number): string {
  let d = 0;
  for (let k = i; k < t.length; k++) { const c = t[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) return t.slice(i, k + 1); } }
  return '';
}
/** Keys of an object literal, whatever their values, e.g. "{ tax: 0.05, 'unrest': -x, mandate_gain: a > 3 ? 1 : 0, ...y }"
 *  → ['tax', 'unrest', 'mandate_gain']. */
function keysOf(obj: string): string[] {
  const body = obj.slice(1, -1); const out: string[] = []; let d = 0, start = 0;
  const parts: string[] = [];
  for (let k = 0; k <= body.length; k++) {
    const c = body[k];
    if (c === '{' || c === '(' || c === '[') d++; else if (c === '}' || c === ')' || c === ']') d--;
    else if ((c === ',' || k === body.length) && d === 0) { parts.push(body.slice(start, k)); start = k + 1; }
  }
  for (const p of parts) {
    const m = /^\s*['"]?([A-Za-z_]\w*)['"]?\s*:/.exec(p);
    if (m) out.push(m[1]);
  }
  return out;
}
/** The source without its comments (strings, template strings and regular expression literals are kept as they are). */
export function stripComments(src: string): string {
  let out = '', i = 0, prev = '';
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; out += ' '; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      out += src.slice(i, j + 1); i = j + 1; prev = c; continue;
    }
    if (c === '/' && (prev === '' || '(,=:[!&|?{};'.includes(prev))) {
      // a regular expression literal: copy it to its closing slash (outside a character class)
      let j = i + 1, cls = false;
      while (j < n && src[j] !== '\n' && (cls || src[j] !== '/')) { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++; }
      out += src.slice(i, j + 1); i = j + 1; prev = '/'; continue;
    }
    out += c; if (!/\s/.test(c)) prev = c; i++;
  }
  return out;
}
/** administration.ts without adminInfo, whose return object (effects: { unrest, control, integration }) is a view of
 *  the over-extension, not effect content. */
function withoutAdminInfo(t: string): string {
  const at = t.indexOf('export function adminInfo('); if (at < 0) return t;
  const open = t.indexOf(') {', at) + 2;
  return t.slice(0, at) + t.slice(open + braced(t, open).length);
}
/** Static scan: effect literals ("effects: {", "fx: {", ...) and the effect argument of the modifier helpers. */
function scanSource(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const add = (k: string, where: string) => { const a = found.get(k) ?? []; a.push(where); found.set(k, a); };
  for (const f of files(join(ROOT, 'src/sim'))) {
    if (f.endsWith('/effects.ts')) continue; // the registry itself
    let t = stripComments(readFileSync(f, 'utf8')); const rel = f.slice(ROOT.length + 1);
    if (f.endsWith('/administration.ts')) t = withoutAdminInfo(t);
    for (const m of t.matchAll(/\b(effects|effectsLow|effectsHigh|complete|fx)\s*:\s*\{/g)) {
      const obj = braced(t, m.index! + m[0].length - 1);
      for (const k of keysOf(obj)) add(k, rel);
    }
    // e.fx.modifier(id, years, label, {..}), permanent(e, id, label, {..}), R.mod(id, years, label, {..}), setMod(s, n, id, years, label, {..})
    for (const m of t.matchAll(/(?:\.modifier|\bpermanent|\bR\.mod|\bsetMod)\(/g)) {
      const before = t.slice(Math.max(0, m.index! - 9), m.index!);
      if (/function\s*$/.test(before)) continue;
      // the call's argument list: balanced parentheses
      let d = 0, end = m.index! + m[0].length - 1;
      for (let k = end; k < t.length; k++) { if (t[k] === '(') d++; else if (t[k] === ')') { d--; if (!d) { end = k; break; } } }
      const args = t.slice(m.index! + m[0].length, end);
      // the last top-level object literal among the arguments
      let depth = 0, last = -1;
      for (let k = 0; k < args.length; k++) { const c = args[k]; if (c === '{') { if (depth === 0) last = k; depth++; } else if (c === '}') depth--; else if (c === '(') depth++; else if (c === ')') depth--; }
      if (last >= 0) for (const k of keysOf(braced(args, last))) add(k, rel);
    }
  }
  return found;
}
function runtimeKeys(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const add = (fx: Record<string, number> | undefined, where: string) => { for (const k in fx ?? {}) { const a = found.get(k) ?? []; a.push(where); found.set(k, a); } };
  for (const L of LAWS) for (const o of L.options) add(o.effects, `law ${L.id}.${o.id}`);
  for (const v of VALUES) { add(v.effectsLow, `value ${v.id} low`); add(v.effectsHigh, `value ${v.id} high`); }
  for (const g in GROUP_TRADITIONS) add(GROUP_TRADITIONS[g].effects, `tradition ${g}`);
  for (const d of DOCTRINES) { for (const p of d.picks) add(p.effects, `doctrine ${d.id}`); add(d.complete, `doctrine ${d.id} complete`); }
  for (const i of INNOVATIONS) add(i.effects, `innovation ${i.id}`);
  for (const l of LANDMARKS) add(l.fx, `landmark ${l.id}`);
  return found;
}

describe('effect keys are wired', () => {
  const rt = runtimeKeys(), st = scanSource();
  const all = new Map<string, string[]>([...rt]);
  for (const [k, v] of st) all.set(k, [...(all.get(k) ?? []), ...v]);

  it('collects a plausible number of keys', () => {
    expect(all.size).toBeGreaterThan(40);
    for (const k of ['tax', 'trade', 'curia', 'tariff_max', 'trade_raid', 'innovation_block', 'interest']) expect(all.has(k), k).toBe(true);
  });
  it('every key used in content is in the registry', () => {
    const missing = [...all.keys()].filter((k) => !effectDef(k)).map((k) => `${k} (${[...new Set(all.get(k))].slice(0, 3).join(', ')})`);
    expect(missing).toEqual([]);
  });
  it('every registry entry is read by the simulation where the registry says', () => {
    const unread: string[] = [];
    for (const [k, d] of Object.entries(EFFECTS)) {
      const src = stripComments(readFileSync(join(ROOT, d.reader), 'utf8'));
      // a call whose arguments name the key (a ternary between two keys counts for both); prefix keys: the call takes
      // the key from a table of `${prefix}${n}` names
      const ok = d.prefix ? src.includes(`\`${k}\${`) && /lawEffect\(\w+, [A-Z_]+_KEYS\[/.test(src)
        : new RegExp(`lawEffect\\((?:[^()]|\\([^()]*\\))*?'${k}'`).test(src);
      if (!ok) unread.push(`${k} → ${d.reader}`);
    }
    expect(unread).toEqual([]);
  });
  it('no effect is read through the modifier-only sum any more (no double counting)', () => {
    const offenders: string[] = [];
    for (const f of files(join(ROOT, 'src/sim'))) {
      const t = readFileSync(f, 'utf8');
      if (/[^.\w]mod\(n|[^.\w]mod\(\w+, '/.test(t.replace(/export function mod\(/, ''))) offenders.push(f.slice(ROOT.length + 1));
    }
    expect(offenders).toEqual([]);
  });
  it('the source scan sees computed values and ignores readers left in comments', () => {
    expect(keysOf("{ mandate_gian: sit.progress > 30 ? 0.05 : -0.03, tax: -x, 'unrest': Math.min(a, b), ...rest }")).toEqual(['mandate_gian', 'tax', 'unrest']);
    const code = stripComments("const a = 1 + 0; // was lawEffect(n, 'curia')\n/* lawEffect(n, 'curia') */ const r = /'x'/; const u = 'http://x';");
    expect(code).not.toContain('curia');
    expect(code).toContain("/'x'/"); expect(code).toContain("'http://x'");
    // administration.ts is scanned (only adminInfo's view object is left out)
    expect(st.get('trade_raid') ?? rt.get('trade_raid')).toBeTruthy();
  });
  it('every effect key met at run time is in the registry', () => {
    const { s, w } = newGame(1356);
    for (let d = 0; d < 365 * 2; d++) advanceDay(s, w);
    const bad = new Set<string>();
    for (const n of s.nations) for (const m of n.modifiers) for (const k in m.effects) if (!effectDef(k)) bad.add(`${k} (${m.id})`);
    for (const k of effectKeysSeen()) if (!effectDef(k)) bad.add(k);
    expect(effectKeysSeen().length).toBeGreaterThan(40);
    expect([...bad]).toEqual([]);
  }, 300_000);
  it('the effects tooltip shows only working effects at their real size', () => {
    const w = workingEffects({ tax: 0.05, concord_gain: 0.1, nonsense: 3, burghers: 0.1, exempt_4: 1 });
    expect(w.map((x) => x[0])).toEqual(['tax', 'concord_gain', 'exempt_4']);
    expect(w[1][1]).toBeCloseTo(5); // 0.1 concord_gain = 5 points of Concord target
  });
});
