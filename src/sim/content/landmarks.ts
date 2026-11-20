// The landmarks of the start year (src/sim/content/landmarks_<year>.json, settlement feature 5): the see of every town
// (its cathedral or Friday mosque), and the great buildings known by name with their real place, size and years.
// Compiled by hand; the sources are listed in docs/SETTLEMENT_DESIGN.md, feature 5.
import L1291 from './landmarks_1291.json';
import { LANDMARK_KIND, NO_YEAR, type LandmarkKind } from '../settlement/landmarks';

/** What kind of church a town's see has. */
export type See = 'archbishop' | 'bishop' | 'orthodox' | 'mosque';

/** A building known by name. */
export interface Named {
  id: string;
  name: { de: string; en: string };
  kind: LandmarkKind;
  /** the town it stands in (its site), −1 when it stands alone */
  site: number;
  /** its real place */
  lat: number; lon: number;
  /** its real metres east and south of the town's point (in a town) */
  east: number; south: number;
  /** its long side and its short side in metres, 0 where not known */
  l: number; w: number;
  /** the years its building began and ended, and the year it became a ruin; NO_YEAR where none */
  start: number; end: number; ruined: number;
  /** how it is drawn where that is not what its kind says ('mosque', 'domed', 'lighthouse'), and its own model */
  shape: string; model: string;
  /** an abbey of the orthodox church, a castle of wood */
  orthodox: boolean; wood: boolean;
  /** it holds the residence of the town's ruler (St Mark's with the Doge's Palace) */
  seat: boolean;
}

interface Raw { id: string; name: { de: string; en: string }; kind: string; site: number; lat: number; lon: number; east?: number; south?: number; l: number | null; w: number | null; start: number | null; end: number | null; ruined?: number; shape?: string; model?: string; orthodox?: number; wood?: number; seat?: number }

const KIND: Record<string, LandmarkKind> = LANDMARK_KIND;
const year = (v: number | null | undefined) => (v == null ? NO_YEAR : v);

function compile(j: { sees: Record<string, string>; named: Raw[] }) {
  return {
    sees: new Map(Object.entries(j.sees).map(([site, see]) => [Number(site), see as See])),
    named: j.named.map((r): Named => ({
      id: r.id, name: r.name, kind: KIND[r.kind], site: r.site, lat: r.lat, lon: r.lon, east: r.east ?? 0, south: r.south ?? 0,
      l: r.l ?? 0, w: r.w ?? 0, start: year(r.start), end: year(r.end), ruined: year(r.ruined), shape: r.shape ?? '', model: r.model ?? '',
      orthodox: !!r.orthodox, wood: !!r.wood, seat: !!r.seat,
    })),
  };
}

const BY_YEAR = new Map([[1291, compile(L1291 as unknown as { sees: Record<string, string>; named: Raw[] })]]);

/** the see of the town `site` in the world of `year`, null when it has none */
export const seeOf = (year: number, site: number): See | null => BY_YEAR.get(year)?.sees.get(site) ?? null;
/** the buildings known by name of the world of `year`, in the order of the file */
export const namedOf = (year: number): readonly Named[] => BY_YEAR.get(year)?.named ?? [];
