// A holy war wins its holy land; it does not turn whole realms of the great faiths around. In the first version of the
// war pass nine peaces in the first 25 years of seed 1356 made realms change their faith (Byzantium and Georgia became
// Sunni, the Golden Horde Latin). A whole realm now takes the winner's faith only where faithTermFits allows it, and
// the AI asks for it across the families of faith only from the old faiths or where the people already hold its own.
// Run: npx vitest run tests/holy_war_peace.test.ts (about four minutes; HOLY_YEARS shortens or lengthens the run)
import { describe, it, expect, vi } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { step } from '../src/sim/engine';
import { FAITHS } from '../src/sim/content/peoples';

vi.setConfig({ testTimeout: 1_200_000 });
const w = loadWorld();
const YEARS = +(process.env.HOLY_YEARS ?? 25);

describe('holy wars over the first 25 years (seed 1356)', () => {
  it('no realm of the great faiths changes its family of faiths by a peace', () => {
    const s = createGame(w, loadSetup(1356), loadHubs(), 1356, { player: [] });
    const fam = s.nations.map((n) => FAITHS[n.faith]?.family);
    const byPeace: string[] = [];
    let seen = s.chronicle.length;
    for (let d = 0; d < 365 * YEARS; d++) {
      step(s, w, []);
      const news = s.chronicle.slice(seen); seen = s.chronicle.length;
      const faithPeace = news.filter((c) => c.kind === 'peace' && c.text.en.includes('change of faith'));
      for (const n of s.nations) {
        const f = FAITHS[n.faith]?.family;
        // the old faiths of the land ('traditional') may take the winner's faith by treaty (faithTermFits 'old_faith'): only
        // a realm of one of the great faiths must keep its family
        if (fam[n.id] !== undefined && fam[n.id] !== 'traditional' && f !== fam[n.id] && faithPeace.some((c) => c.text.en.includes(n.short.en))) byPeace.push(`${1356 + Math.floor(s.day / 365)} ${n.key}: ${fam[n.id]} -> ${f}`);
        fam[n.id] = f;
      }
    }
    expect(byPeace).toEqual([]);
  });
});
