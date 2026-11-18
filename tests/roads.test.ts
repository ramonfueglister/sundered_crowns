import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MEANS, OFF_WAY, WayNet, daysOn, slopeTime, stretchOf, toblerKmh, waysOf } from '../src/sim/roads';
import { smoothLine } from '../src/worldprobe/roads';

const file = JSON.parse(readFileSync('public/data/roads_1291.json', 'utf8')) as { lines: { k: number; p: number[] }[]; between: number[][] };

describe('the ways of the world', () => {
  it('runs a cart at ORBIS speed on a level road and changes to mules on a track', () => {
    const road = { a: 0, b: 1, kind: 1, km: 24, effort: 24, straight: 20 };
    expect(daysOn(road, 'cart')).toBeCloseTo(24 / MEANS.cart.kmPerDay);
    expect(daysOn({ ...road, kind: 0 }, 'cart')).toBeCloseTo(24 / MEANS.mule.kmPerDay);
    expect(daysOn({ ...road, kind: 0 }, 'post')).toBeCloseTo(24 / MEANS.horse.kmPerDay);
  });
  it('is slower in winter, the more so the poorer the way', () => {
    const track = { a: 0, b: 1, kind: 0, km: 30, effort: 30, straight: 25 }, highway = { ...track, kind: 2 };
    expect(daysOn(track, 'foot', 0)).toBeGreaterThan(daysOn(track, 'foot', 6));
    expect(daysOn(track, 'foot', 0) / daysOn(track, 'foot', 6)).toBeGreaterThan(daysOn(highway, 'foot', 0) / daysOn(highway, 'foot', 6));
  });
  it('has ways from place to place whose effort is never below their length, nor their length below the straight line', () => {
    const ways = waysOf(file.between), net = new WayNet(ways, 30000);
    expect(ways.length).toBeGreaterThan(5000);
    for (const w of ways) { expect(w.effort).toBeGreaterThanOrEqual(w.km - 0.11); expect(w.km).toBeGreaterThanOrEqual(w.straight - 0.11); }
    expect(net.between(ways[0].b, ways[0].a)).toBe(ways[0]);
  });
  it('takes the time of a slope by Tobler: fastest on a slight descent, the same both ways, little on gentle slopes', () => {
    expect(toblerKmh(-0.05)).toBeCloseTo(6);
    expect(toblerKmh(0)).toBeCloseTo(6 * Math.exp(-0.175));
    expect(slopeTime(0)).toBeCloseTo(1);
    expect(slopeTime(0.1)).toBeCloseTo(slopeTime(-0.1));
    expect(slopeTime(0.03)).toBeLessThan(1.01);
    expect(slopeTime(0.2)).toBeGreaterThan(slopeTime(0.1));
  });
  it('goes along a way as much as it winds, across the land at 3/5 of the speed, and the quicker of the two', () => {
    const way = { a: 0, b: 1, kind: 1, km: 12, effort: 12, straight: 10 };
    expect(stretchOf(way, 10, 0)).toBeCloseTo(1.2);
    expect(stretchOf(undefined, 10, 0)).toBeCloseTo(1 / OFF_WAY);
    expect(stretchOf(undefined, 10, 1000)).toBeGreaterThan(1 / OFF_WAY);
    // a way that winds more than going across is left for the land
    expect(stretchOf({ ...way, effort: 30 }, 10, 0)).toBeCloseTo(1 / OFF_WAY);
    // a way is never shorter than the straight line
    expect(stretchOf({ ...way, effort: 8 }, 10, 0)).toBe(1);
  });
  it('keeps the ends of a line when it smooths it', () => {
    const l = file.lines.find((x) => x.p.length >= 8)!, s = smoothLine(l.p);
    expect([s[0], s[1]]).toEqual([l.p[0] + 0.5, l.p[1] + 0.5]);
    expect([s[s.length - 2], s[s.length - 1]]).toEqual([l.p[l.p.length - 2] + 0.5, l.p[l.p.length - 1] + 0.5]);
  });
});
