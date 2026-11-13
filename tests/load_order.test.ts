// The sim's modules import one another in cycles (setup builds the list of systems, the systems use setup's helpers,
// war.ts and the Empire set hooks on each other). Whichever module a page, a test or a tool loads first, every system
// must be in the list and the hooks set: a module that is still loading when the list is built leaves a hole, which
// once broke the game for every entry point that reached the economy before the war.
import { describe, it, expect, vi } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', 'src', 'sim');
const entries = ['', 'systems', 'content'].flatMap((d) => readdirSync(join(ROOT, d)).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts')).map((f) => (d ? `${d}/` : '') + f));

describe('the sim loads whole from any entry point', () => {
  it('lists the modules', () => { expect(entries.length).toBeGreaterThan(40); });
  for (const e of entries) {
    it(`first ${e}: every system is listed and the war hooks are set`, async () => {
      vi.resetModules();
      await import(/* @vite-ignore */ join(ROOT, e));
      const { systems } = await import('../src/sim/systems/index');
      expect(systems().every(Boolean)).toBe(true);
      const { warHooks } = await import('../src/sim/systems/warhooks');
      expect(typeof warHooks.veto).toBe('function');
      expect(typeof warHooks.declared).toBe('function');
    });
  }
});
