// Plague mechanics in isolation (no economy): a wave seeded in a great town spreads over much of Europe within a
// few years, burns out because the survivors resist, leaves resistance values (< 0) behind that never count as
// an outbreak, and is fully deterministic.
import { describe, it, expect } from 'vitest';
import { newGame } from '../tools/sim/load';
import { plagueMonth, seedPlague, plagueSusceptibility } from '../src/sim/systems/society';

function wave(years: number) {
  const { s, w } = newGame(1356);
  const L = w.L, P = s.loc.plague;
  const eu: number[] = [];
  for (let i = 0; i < L; i++) if (w.lon[i] > -11 && w.lon[i] < 45 && w.lat[i] > 36 && w.lat[i] < 71 && s.loc.owner[i] >= 0) eu.push(i);
  P.fill(0); // everyone susceptible
  const venice = w.names.indexOf('Venice');
  seedPlague(s, w, venice, 0.9);
  const ever = new Uint8Array(L); let peak = 0; const active: number[] = [];
  for (let mo = 0; mo < years * 12; mo++) {
    s.day = Math.round((mo + 3) * 30.44);
    plagueMonth(s, w, (mo + 3) % 12);
    let cur = 0; for (const i of eu) if (P[i] > 0.02) { cur++; ever[i] = 1; }
    peak = Math.max(peak, cur); active.push(cur);
  }
  let hit = 0; for (const i of eu) hit += ever[i];
  return { share: hit / eu.length, peak, active, hash: Array.from(P).reduce((h, v) => (Math.imul(h, 31) + Math.round(v * 1e4)) | 0, 7), s, venice };
}

describe('plague waves', () => {
  const a = wave(6);
  it('reaches a large share of Europe and then dies out', () => {
    expect(a.share).toBeGreaterThan(0.4);
    expect(a.peak).toBeGreaterThan(300);
    expect(a.active[a.active.length - 1]).toBeLessThan(a.peak * 0.1);
  });
  it('leaves resistance behind where it passed', () => {
    expect(a.s.loc.plague[a.venice]).toBeLessThan(0);
    expect(plagueSusceptibility(a.s, a.venice)).toBeLessThan(0.6);
  });
  it('is deterministic', () => {
    expect(wave(6).hash).toBe(a.hash);
  });
});
