// A successor elected in the ruler's lifetime (systems/government.ts designateSuccessor): an elective crown asks its
// Powers to elect the next ruler now; the king-elect takes the crown at the death without a new vote.
import { describe, it, expect, beforeAll } from 'vitest';
import { loadWorld, loadSetup, loadHubs } from '../tools/sim/load';
import { createGame } from '../src/sim/setup';
import { serialize, deserialize } from '../src/sim/engine';
import { applyCommand } from '../src/sim/commands';
import { answer } from '../src/game/view';
import { characterDies } from '../src/sim/systems/politics';
import { ensureCandidates, designated, designatePreview, govMandateParts, DESIGNATE_COST, DESIGNATE_MANDATE, DESIGNATE_SNUB } from '../src/sim/systems/government';
import { refusal } from '../src/sim/refusals';
import type { GameState } from '../src/sim/types';

const w = loadWorld();
let BASE = '';
beforeAll(() => { BASE = serialize(createGame(w, loadSetup(1356), loadHubs(), 1356, { player: [] })); });
const nat = (s: GameState, key: string) => s.nations.find((n) => n.key === key)!;
const fresh = (key: string) => { const s = deserialize(BASE) as GameState; const n = nat(s, key); s.playerNations = [n.id]; return { s, n }; };
const designate = (s: GameState, n: number, char: number) => applyCommand(s, w, { t: 'govern', n, action: 'designate', char });

describe('a successor elected in the ruler\'s lifetime', () => {
  it('only an elective crown can hold the vote, and it costs Authority', () => {
    const fr = fresh('france');
    expect(designate(fr.s, fr.n.id, 1).err).toBe('only an elective crown holds such a vote');
    const { s, n } = fresh('sweden');
    const cands = ensureCandidates(s, w, n);
    n.authority = DESIGNATE_COST - 1;
    expect(designate(s, n.id, cands[0]).err).toBe('not enough Authority');
  });
  it('the man the Powers elect is the king-elect, and takes the crown at the death without a new vote', () => {
    const { s, n } = fresh('sweden');
    const cands = ensureCandidates(s, w, n);
    n.authority = 100; n.mandate = 50;
    const pv = designatePreview(s, w, n, cands[0]);
    expect(n.backed).toBeUndefined(); // the preview changes nothing
    expect(designate(s, n.id, cands[0]).ok).toBe(true);
    expect(n.authority).toBe(100 - DESIGNATE_COST);
    const elect = designated(s, n);
    expect(elect).toBe(pv.winner);
    expect(n.mandate).toBe(50 + (elect === cands[0] ? DESIGNATE_MANDATE : DESIGNATE_SNUB));
    expect(govMandateParts(s, n).some((r) => r[0] === 'x_mand_designated')).toBe(true);
    // a second vote is refused while the king-elect lives
    expect(designate(s, n.id, ensureCandidates(s, w, n).find((x) => x && x !== elect)!).err).toBe('a successor is already elected');
    // the view shows the king-elect
    expect(answer(s, w, n.id, { q: 'govern' }).vivente.elect.id).toBe(elect);
    characterDies(s, w, n, n.ruler);
    expect(n.ruler).toBe(elect);
    expect(n.flags.designated).toBeUndefined();
  });
  it('a king-elect who dies first leaves the succession open, and the crown must wait before asking again', () => {
    const { s, n } = fresh('sweden');
    const cands = ensureCandidates(s, w, n);
    n.authority = 100;
    expect(designate(s, n.id, cands[0]).ok).toBe(true);
    const elect = designated(s, n);
    s.chars[elect].alive = false;
    expect(designated(s, n)).toBe(0);
    n.authority = 100;
    const again = ensureCandidates(s, w, n).find((x) => x && s.chars[x]?.alive)!;
    expect(designate(s, n.id, again).err).toBe('too soon');
  });
  it('the refusals read in German', () => {
    for (const e of ['only an elective crown holds such a vote', 'a successor is already elected']) expect(refusal(e).de).not.toBe(e);
  });
});
