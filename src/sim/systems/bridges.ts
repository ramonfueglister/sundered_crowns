// The bridges of the towns: settlement feature 7 (docs/SETTLEMENT_DESIGN.md, where every source is listed).
//
// Where a street along a way of the world ends at a river in its town, a bridge takes it to the other bank
// (src/sim/settlement/bridges.ts; Harrison 2010, pp. 33, 36). Not where a source says the town's great river was
// crossed by ferry or on boats (`ferried`): there the widest crossings of the town get none. A bridge known by name
// (`namedBridges`, Boyer 1976, Harrison 2004 and the articles of the bridges) is the widest crossing of its town not
// yet named, the next one the next widest; it is of stone where its source says so. Every other bridge is of timber:
// when most bridges came to be of stone is not known, "Was it 1300 or 1500?" (Harrison 2010, p. 37).
//
// The bridges are written once, when the world is founded (and by the upgrade of a running world), and do not change
// while it runs.
import type { WorldState } from '../state';
import { BRIDGE_SCHEMA } from '../state';
import { createTable, spawn } from '../ecs';
import { citiesOf } from '../content/cities';
import { ferried, namedBridges } from '../content/bridges';
import type { Ground } from '../content/ground';
import { BRIDGE_KIND, type Span, bridgesOf } from '../settlement/bridges';
import { townOf } from './walls';

/** How often across the water the ground is asked, in metres: a block of the ground. */
const STEP = 2;
/** Where a town's great river was crossed by ferry, the crossings at least this share as wide as its widest get no
 *  bridge. OWN RULE: the sources name the river, the world knows only how wide each crossing is. */
const GREAT_RIVER = 0.5;

/** whether a block of a layer of the ground holds at (x, z) metres from the town's centre; nothing beyond the survey */
const layer = (g: Ground | null, site: number) => {
  if (!g?.has(site)) return () => false;
  const m = g.metresPerBlock;
  return (x: number, z: number) => g.free(site, Math.round(x / m), Math.round(z / m));
};

/** The bridges of a town, widest first (none for a town without parcels or without the rivers' survey). */
export function townBridges(s: WorldState, site: number, rivers: Ground | null, dry: Ground | null): Span[] {
  const t = townOf(s, site);
  if (!t.parcels.length || !rivers?.has(site)) return [];
  const reach = rivers.reach(site) * rivers.metresPerBlock;
  const all = bridgesOf(t.streets, layer(rivers, site), layer(dry, site), t.width, STEP, reach).sort(
    (a, b) => b.span - a.span,
  );
  if (!ferried(s.startYear, site) || !all.length) return all;
  return all.filter((b) => b.span < GREAT_RIVER * all[0].span);
}

/** Lays the bridges of every town of the start year (the table of bridges anew). `rivers`: the rivers round the towns
 *  (public/data/rivers_<year>.json); `dry`: the dry ground, where a bridge reaches the other bank. */
export function foundBridges(s: WorldState, rivers?: Ground | null, dry?: Ground | null): void {
  const bridge = createTable(BRIDGE_SCHEMA, 1024),
    B = bridge.cols;
  s.bridge = bridge;
  const r = rivers && rivers.year === s.startYear ? rivers : null,
    d = dry && dry.year === s.startYear ? dry : null;
  const named = namedBridges(s.startYear);
  for (const city of citiesOf(s.startYear)) {
    const mine = named.map((n, k) => ({ n, k })).filter((q) => q.n.site === city.site);
    townBridges(s, city.site, r, d).forEach((b, i) => {
      const id = spawn(bridge);
      B.site[id] = city.site;
      B.x0[id] = b.x0;
      B.z0[id] = b.z0;
      B.x1[id] = b.x1;
      B.z1[id] = b.z1;
      B.named[id] = mine[i]?.k ?? -1;
      B.kind[id] = mine[i]?.n.stone ? BRIDGE_KIND.stone : BRIDGE_KIND.timber;
    });
  }
}
