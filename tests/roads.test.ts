import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MEANS, WayNet, daysOn, waysOf } from '../src/sim/roads';
import { smoothLine } from '../src/worldprobe/roads';

const file = JSON.parse(readFileSync('public/data/roads_1291.json', 'utf8')) as { lines: { k: number; p: number[] }[]; between: number[][] };

describe('the ways of the world', () => {
  it('runs a cart at ORBIS speed on a level road and changes to mules on a track', () => {
    const road = { a: 0, b: 1, kind: 1, km: 24, effort: 24 };
    expect(daysOn(road, 'cart')).toBeCloseTo(24 / MEANS.cart.kmPerDay);
    expect(daysOn({ ...road, kind: 0 }, 'cart')).toBeCloseTo(24 / MEANS.mule.kmPerDay);
    expect(daysOn({ ...road, kind: 0 }, 'post')).toBeCloseTo(24 / MEANS.horse.kmPerDay);
  });
  it('is slower in winter, the more so the poorer the way', () => {
    const track = { a: 0, b: 1, kind: 0, km: 30, effort: 30 }, highway = { ...track, kind: 2 };
    expect(daysOn(track, 'foot', 0)).toBeGreaterThan(daysOn(track, 'foot', 6));
    expect(daysOn(track, 'foot', 0) / daysOn(track, 'foot', 6)).toBeGreaterThan(daysOn(highway, 'foot', 0) / daysOn(highway, 'foot', 6));
  });
  it('has ways from place to place whose effort is never below their length', () => {
    const ways = waysOf(file.between), net = new WayNet(ways, 30000);
    expect(ways.length).toBeGreaterThan(3000);
    for (const w of ways) expect(w.effort).toBeGreaterThanOrEqual(w.km - 0.11);
    expect(net.between(ways[0].b, ways[0].a)).toBe(ways[0]);
  });
  it('keeps the ends of a line when it smooths it', () => {
    const l = file.lines.find((x) => x.p.length >= 8)!, s = smoothLine(l.p);
    expect([s[0], s[1]]).toEqual([l.p[0] + 0.5, l.p[1] + 0.5]);
    expect([s[s.length - 2], s[s.length - 1]]).toEqual([l.p[l.p.length - 2] + 0.5, l.p[l.p.length - 1] + 0.5]);
  });
});
