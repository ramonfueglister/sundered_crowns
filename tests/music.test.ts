// Background music: the track list matches the files and their record, and the volume rules hold.
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { TRACKS } from '../src/audio/playlist';
import { parseVolume, sliderGain, dbGain, nextTrack, DEFAULT_VOLUME } from '../src/audio/music';

const record = JSON.parse(readFileSync('data/audio/music.json', 'utf8')) as {
  tracks: { file: string; bytes: number; sha256: string; gain_db: number; lufs: number }[];
};

describe('music', () => {
  it('lists every piece of the record once, in its order, starting with Mare et Terra', () => {
    expect(TRACKS.length).toBe(64);
    expect(TRACKS.map((t) => t[0])).toEqual(record.tracks.map((t) => t.file));
    expect(new Set(TRACKS.map((t) => t[0])).size).toBe(64);
    expect(TRACKS[0][0]).toBe('mare-et-terra-variant-2.mp3');
  });

  it('has each file in public/ with the size of the record, and the first one with its hash', () => {
    for (const t of record.tracks) expect(statSync(`public/audio/music/${t.file}`).size).toBe(t.bytes);
    const first = record.tracks[0];
    expect(
      createHash('sha256')
        .update(readFileSync(`public/audio/music/${first.file}`))
        .digest('hex'),
    ).toBe(first.sha256);
  });

  it('only turns pieces down, to the quietest one (-16 LUFS)', () => {
    for (const [file, , g] of TRACKS) {
      const r = record.tracks.find((t) => t.file === file)!;
      expect(g).toBeLessThanOrEqual(0);
      expect(r.lufs + g).toBeCloseTo(-16, 1);
    }
  });

  it('reads stored volumes safely and maps the slider to loudness', () => {
    expect(parseVolume(null)).toBe(DEFAULT_VOLUME);
    expect(parseVolume('abc')).toBe(DEFAULT_VOLUME);
    expect(parseVolume('')).toBe(DEFAULT_VOLUME);
    expect(parseVolume('140')).toBe(100);
    expect(parseVolume('-3')).toBe(0);
    expect(parseVolume('0')).toBe(0);
    expect(sliderGain(0)).toBe(0);
    expect(sliderGain(100)).toBe(1);
    expect(20 * Math.log10(sliderGain(DEFAULT_VOLUME))).toBeCloseTo(-15.9, 1);
    expect(dbGain(-6)).toBeCloseTo(0.501, 3);
  });

  it('wraps round after the last piece', () => {
    expect(nextTrack(-1)).toBe(0);
    expect(nextTrack(0)).toBe(1);
    expect(nextTrack(TRACKS.length - 1)).toBe(0);
  });
});
