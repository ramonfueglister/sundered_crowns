// What the code may not get worse in (CLAUDE.md, "Before every pull request" and "Code"): no file gets a lint
// diagnostic it does not have yet, and no code file grows past MOST_LINES lines. `biome ci` lets warnings and infos
// pass, and nothing counted lines outside src/buildings and src/figures (their own tests hold them to 300). So the
// diagnostics and the long files that were there when this check came in (20 November 2026, with what the open
// branches had then) are kept in budgets.json as ceilings, file by file, and the ceilings only ever come down.
//
//   npm run lint            runs this check after `biome ci`
//   npm run budgets:write   lowers budgets.json to what the code has now (never raises a ceiling)
//
// A file over its ceiling is split by subject; a line that a rule truly does not fit is silenced with
// `// biome-ignore lint/<group>/<rule>: <why>` (CLAUDE.md).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** the most lines a code file may have (CLAUDE.md, "Keep files small") */
const MOST_LINES = 500;
/** the code whose lines are counted: what git keeps of these folders, with these endings */
const CODE_DIRS = ['src', 'server', 'tools', 'tests', 'economy/src', 'portrait/src'];
const CODE = /\.(ts|tsx|mts|mjs|js|py|rs)$/;
/** the files the portrait pull request (#84) is still growing round by round: their lines are counted once it is
 *  merged and the cleanup thread has split them */
const LATER = /^(portrait\/src\/|tools\/portrait\/|tests\/portrait\.test\.ts$)/;
const ROOT = resolve(import.meta.dirname, '../..');
const BUDGETS = resolve(import.meta.dirname, 'budgets.json');

interface Budgets {
  /** per file, per rule (`group/rule`): how many diagnostics it may have; a file or rule not listed may have none */
  lint: Record<string, Record<string, number>>;
  /** per file longer than MOST_LINES: how many lines it may have */
  lines: Record<string, number>;
}

interface Diagnostic {
  category?: string;
  message: string;
  location: { path: string; start: { line: number; column: number } };
}

/** Biome's lint diagnostics, counted per file and rule, with where each one is. */
function lintNow() {
  const biome = resolve(ROOT, 'node_modules/@biomejs/biome/bin/biome');
  const run = spawnSync(process.execPath, [biome, 'lint', '--reporter=json', '--max-diagnostics=none', '.'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  let report: { diagnostics: Diagnostic[] };
  try {
    report = JSON.parse(run.stdout);
  } catch {
    throw new Error(`Biome gave no report:\n${run.stderr}`);
  }
  const counts: Record<string, Record<string, number>> = {};
  const where = new Map<string, string[]>();
  for (const d of report.diagnostics) {
    if (!d.category?.startsWith('lint/')) continue;
    const file = d.location.path,
      rule = d.category.slice('lint/'.length);
    counts[file] ??= {};
    counts[file][rule] = (counts[file][rule] ?? 0) + 1;
    const key = `${file} ${rule}`;
    where.set(key, [...(where.get(key) ?? []), `${file}:${d.location.start.line}: ${d.message}`]);
  }
  return { counts, where };
}

/** The lines of every code file git keeps (as `wc -l` counts them, and a last line without its newline). */
function linesNow() {
  const listed = spawnSync('git', ['ls-files', '-z', '--', ...CODE_DIRS], { cwd: ROOT, encoding: 'utf8' });
  if (listed.status !== 0) throw new Error(`git ls-files failed:\n${listed.stderr}`);
  const lines: Record<string, number> = {};
  for (const file of listed.stdout.split('\0')) {
    if (!CODE.test(file) || LATER.test(file) || !existsSync(resolve(ROOT, file))) continue;
    const text = readFileSync(resolve(ROOT, file), 'utf8');
    lines[file] = text.split('\n').length - (text.endsWith('\n') || text === '' ? 1 : 0);
  }
  return lines;
}

const budgets: Budgets = JSON.parse(readFileSync(BUDGETS, 'utf8'));
const lint = lintNow(),
  lines = linesNow();

if (process.argv.includes('--write')) {
  // each ceiling comes down to what the code has now, and what is at nought (or within MOST_LINES) drops out
  const next: Budgets = { lint: {}, lines: {} };
  for (const file of Object.keys(budgets.lint).sort())
    for (const rule of Object.keys(budgets.lint[file]).sort()) {
      const n = Math.min(lint.counts[file]?.[rule] ?? 0, budgets.lint[file][rule]);
      if (n > 0) next.lint[file] = { ...next.lint[file], [rule]: n };
    }
  for (const file of Object.keys(budgets.lines).sort()) {
    const n = Math.min(lines[file] ?? 0, budgets.lines[file]);
    if (n > MOST_LINES) next.lines[file] = n;
  }
  writeFileSync(BUDGETS, `${JSON.stringify(next, null, 2)}\n`);
  console.log(
    `budgets.json: ${Object.keys(next.lint).length} files with lint, ${Object.keys(next.lines).length} long files`,
  );
  process.exit(0);
}

const over: string[] = [];
let lower = 0;
for (const [file, rules] of Object.entries(lint.counts))
  for (const [rule, n] of Object.entries(rules)) {
    const most = budgets.lint[file]?.[rule] ?? 0;
    if (n > most)
      over.push(
        `${file}: ${n} × ${rule}, at most ${most}`,
        ...lint.where.get(`${file} ${rule}`)!.map((w) => `    ${w}`),
      );
  }
for (const [file, rules] of Object.entries(budgets.lint))
  for (const [rule, most] of Object.entries(rules)) if ((lint.counts[file]?.[rule] ?? 0) < most) lower++;
for (const [file, n] of Object.entries(lines)) {
  const most = budgets.lines[file] ?? MOST_LINES;
  if (n > most) over.push(`${file}: ${n} lines, at most ${most} (split it by subject)`);
}
for (const [file, most] of Object.entries(budgets.lines)) if ((lines[file] ?? 0) < most) lower++;

if (lower > 0) console.log(`${lower} ceilings are above what the code has now (the cleanup thread lowers them)`);
if (over.length > 0) {
  console.error(
    `Over the budgets in tools/check/budgets.json (CLAUDE.md, "No new lint warning", "Keep files small"):\n`,
  );
  console.error(over.join('\n'));
  process.exit(1);
}
console.log('budgets: no file has more lint or more lines than before');
