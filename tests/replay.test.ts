// Point 13: a single-player game records its commands and replays to the identical state.
import { describe, it, expect } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { advanceDay, hashState, serialize, deserialize } from '../src/sim/engine';
import { startRecorded, recordCommand, replayGame } from '../src/sim/replay';
import type { Command } from '../src/sim/types';

describe('single-player replay', () => {
  it('replays a recorded game to the same state hash', () => {
    const w = loadWorld(), setup = loadSetup(1356), hubs = loadHubs();
    const probe = startRecorded(w, setup, hubs, { seed: 5, year: 1356, player: null });
    const bohemia = probe.nations.find((n) => n.key === 'bohemia')!.id, austria = probe.nations.find((n) => n.key === 'austria')!.id;
    const s = startRecorded(w, setup, hubs, { seed: 5, year: 1356, player: bohemia, difficulty: 1 });
    for (let d = 0; d < 400; d++) {
      if (d === 10) recordCommand(s, w, { t: 'tax', n: bohemia, cls: 0, rate: 0.1 } as Command);
      if (d === 30) recordCommand(s, w, { t: 'diplo', n: bohemia, action: 'improve', target: austria });
      if (d === 60) { const a = s.armies.find((x) => x.owner === bohemia && !x.fleet)!; recordCommand(s, w, { t: 'move', n: bohemia, army: a.id, to: s.nations[austria].capital }); }
      if (d === 200) recordCommand(s, w, { t: '__player', player: austria });
      if (d === 210) recordCommand(s, w, { t: 'tech', n: austria, branch: 1 });
      for (const p of s.pending.filter((x) => s.playerNations.includes(x.nation))) recordCommand(s, w, { t: 'event', n: p.nation, pending: p.id, choice: 0 });
      advanceDay(s, w);
    }
    // the log survives a save
    const saved = deserialize(serialize(s));
    const r = replayGame(w, setup, hubs, saved.replay!, saved.day);
    expect(r.day).toBe(s.day);
    expect(hashState(r)).toBe(hashState(s));
    expect(saved.replay!.log.length).toBeGreaterThan(4);
  }, 300_000);
});
