// The farmers of the great cities at work on their town's furlongs (people feature 12): a person whom the plan of the
// day takes into the fields (WHO.farm) works on one furlong of the town's land register, given by a hash of the
// person's id among the furlongs of the town as every piece of the world near it has them (fieldsByLot,
// src/worldprobe/lots.ts). Only the piece that owns the middle of the furlong's lot adds the person's figure, at a
// free block beside the furlong and facing it, so that it stands once; in the furlongs of a town whose persons are
// known no anonymous farmer works (crowd.ts). The first far step puts them where the finest step does
// (worldprobe/crowd.ts).
import { hash2 } from '../lookprobe/batch';
import { N } from '../lookprobe/layout';
import { WHO } from '../sim/people/day_plan';
import { FIELD_LOT } from '../sim/settlement/fields';
import { DIRS, FIGURE_AT, LOOK, personOf } from './aims';
import type { Gathered, SettledGround, Where } from './crowd';
import { ESTATES, Mode, dress } from './estates';
import { type TownPerson, rollOf, townPeople } from './people';

/** A field lot (lx, lz) as one number, as worldprobe/lots.ts lotKey (written again here: the figures do not import
 *  the world graphic, which imports them). */
const lotKey = (lx: number, lz: number) => (lx + 32768) * 65536 + lz + 32768;

/** The field lot a world block lies in, the balk on its west and north side included (lotCorner,
 *  src/sim/settlement/fields.ts: every other row of lots is set off by half a lot). */
export function lotOf(wx: number, wz: number): number {
  const lz = Math.floor(wz / FIELD_LOT.d),
    shift = lz & 1 ? Math.floor(FIELD_LOT.w / 2) : 0;
  return lotKey(Math.floor((wx - shift) / FIELD_LOT.w), lz);
}

/** what the farmers of a town wear in the field, by sex: the farm estates of estates.ts */
const BAUER = ESTATES.findIndex((e) => e.name === 'Bauer'),
  BAEUERIN = ESTATES.findIndex((e) => e.name === 'Bäuerin');

/** the farmers of each town worked out last, with its furlongs and the roll of its persons they were worked out for */
const made = new Map<number, { k: string; hands: Map<number, TownPerson[]> }>();

/** The farmers of a town by the furlong (lot) each works on, given its furlongs as pairs (lx, lz). */
function handsOf(site: number, lots: readonly number[]): Map<number, TownPerson[]> | undefined {
  const people = townPeople(site);
  if (!people?.length || !lots.length) return undefined;
  const k = `${lots.length}:${lots[0]}:${lots[1]}:${rollOf(site)}`,
    had = made.get(site);
  if (had?.k === k) return had.hands;
  const hands = new Map<number, TownPerson[]>();
  for (const p of people) {
    if (p.who !== WHO.farm || p.ruler !== undefined) continue;
    const j = 2 * Math.floor(hash2(p.id, 1, 960) * (lots.length / 2)),
      at = lotKey(lots[j], lots[j + 1]),
      list = hands.get(at);
    if (list) list.push(p);
    else hands.set(at, [p]);
  }
  made.set(site, { k, hands });
  return hands;
}

/** The furlongs near this ground that persons work, by lot, each with its farmers (none on some): those of the towns
 *  whose persons are known. */
export function fieldHands(s: Pick<SettledGround, 'furlongs'>): Map<number, readonly TownPerson[]> {
  const out = new Map<number, readonly TownPerson[]>();
  for (const [site, lots] of s.furlongs ?? []) {
    const hands = handsOf(site, lots);
    if (!hands) continue;
    for (let j = 0; j < lots.length; j += 2) {
      const at = lotKey(lots[j], lots[j + 1]);
      out.set(at, hands.get(at) ?? []);
    }
  }
  return out;
}

/**
 * Puts the farmers of each furlong whose lot's middle this piece owns at free blocks beside the furlong, one to a
 * block, each at a block drawn from the person's id. `ox`, `oz`: the piece's ground in the world, `side` how many
 * blocks of the finest step it is wide (twice the grid at the first far step: worldprobe/crowd.ts).
 */
export function placeHands(
  out: Gathered,
  w: Where,
  hands: ReadonlyMap<number, readonly TownPerson[]>,
  ox: number,
  oz: number,
  own: (x: number, z: number) => boolean,
  side = N,
) {
  for (const [lot, people] of hands) {
    if (!people.length) continue;
    const lx = Math.floor(lot / 65536) - 32768,
      lz = (lot % 65536) - 32768,
      x0 = lx * FIELD_LOT.w + (lz & 1 ? Math.floor(FIELD_LOT.w / 2) : 0) - ox,
      z0 = lz * FIELD_LOT.d - oz,
      mx = Math.floor(x0 + FIELD_LOT.w / 2),
      mz = Math.floor(z0 + FIELD_LOT.d / 2);
    if (mx < 0 || mz < 0 || mx >= side || mz >= side || !own(mx, mz)) continue;
    // the free blocks of the lot beside its furlong, and which way the furlong lies from each
    const spots: [number, number, number][] = [];
    for (let z = z0; z < z0 + FIELD_LOT.d; z++)
      for (let x = x0; x < x0 + FIELD_LOT.w; x++) {
        if (!w.free(x, z, false)) continue;
        const dir = DIRS.findIndex(
          ([dx, dz]) => w.field(x + dx, z + dz) > 0 && lotOf(x + dx + ox, z + dz + oz) === lot,
        );
        if (dir >= 0) spots.push([x, z, dir]);
      }
    const taken = new Set<number>();
    for (const p of people) {
      if (taken.size >= spots.length) break;
      let j = Math.floor(hash2(p.id, 2, 960) * spots.length);
      while (taken.has(j)) j = (j + 1) % spots.length;
      taken.add(j);
      hand(out, w, ...spots[j], ox, oz, p);
    }
  }
}

/**
 * A farmer's figure at work beside a furlong, facing it: the vines are tended standing with a basket, the corn bent
 * over the hoe, as the anonymous farmers (crowd.ts); off the stage until the plan of the day has the person at work in
 * the fields (a negative phase, material.ts).
 */
function hand(out: Gathered, w: Where, x: number, z: number, dir: number, ox: number, oz: number, p: TownPerson) {
  const h = (k: number) => hash2(x + ox, z + oz, 450 + k),
    look = (k: number) => hash2(p.id, k, LOOK),
    [dx, dz] = DIRS[dir],
    y = w.h(x, z);
  out[0].push(x + 0.5, y, z + 0.5, -1 - h(4) * 100);
  out[1].push(x + 0.5, y, z + 0.5, 0);
  dress(out, w.field(x + dx, z + dz) === 2 ? Mode.Stand : Mode.Work, p.female ? BAEUERIN : BAUER, look);
  out[4].push(Math.atan2(dx, dz), p.id + 1);
  personOf(out, p, FIGURE_AT.field);
}
