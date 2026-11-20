// How the lands of the map build: the houses, the parish church and the great church or mosque of each building
// tradition. The traditions follow the gazetteer's regions, which is coarse: Granada builds like Castile, and a
// region's minorities do not show. Each tradition will be split up and sourced region by region.
import { rgb } from '../../lookprobe/batch';
import type { HouseStyle } from '../houses/style';
import type { Model } from '../model';
import { BRICK, COPPER, GOLD, MARBLE, SLATE, STONE_PALE } from '../palette';
import { cathedral } from '../sacred/cathedral';
import { church, spireChurch } from '../sacred/church';
import { domedChurch } from '../sacred/domed-church';
import { mosque } from '../sacred/mosque';
import { NORTH, SOUTH, TERRACE, TIMBER } from './house-styles';
import type { Tradition } from './tradition';
import { VENICE } from './venice';

export interface Style {
  house: HouseStyle;
  church: Model;
  great: Model;
  /** brick towers of the leading families stand over the town */
  towers: boolean;
  /** the sourced tradition the fine-block house is built from, where a region has one already (houses/choose.ts) */
  tradition?: Tradition;
}

const LATIN: Style = {
  house: SOUTH,
  towers: true,
  church: { build: church, w: 6, d: 11, height: 6 },
  great: { build: () => cathedral(MARBLE, rgb(0xe87656), null), w: 12, d: 21, height: 12 },
};
/** Italy builds as Venice does until the other Italian traditions are sourced (assumption) */
const ITALY: Style = { ...LATIN, tradition: VENICE };
const GOTHIC: Style = {
  house: NORTH,
  towers: false,
  church: { build: spireChurch, w: 6, d: 11, height: 8 },
  great: {
    build: (r) =>
      cathedral(
        r.pick([STONE_PALE, STONE_PALE, BRICK]),
        r.pick([SLATE, rgb(0xc24e36)]),
        r.chance(0.6) ? r.pick([COPPER, SLATE]) : null,
      ),
    w: 12,
    d: 21,
    height: 12,
  },
};
const GREEK: Style = {
  house: SOUTH,
  towers: false,
  church: { build: (r) => domedChurch(r), w: 8, d: 11, height: 7 },
  great: { build: (r) => domedChurch(r, 1.6), w: 12, d: 17, height: 11 },
};
const RUS: Style = {
  house: TIMBER,
  towers: false,
  church: { build: (r) => domedChurch(r, 1, GOLD), w: 8, d: 11, height: 7 },
  great: { build: (r) => domedChurch(r, 1.5, GOLD), w: 12, d: 16, height: 11 },
};
const ISLAM: Style = {
  house: TERRACE,
  towers: false,
  church: { build: (r) => mosque(r), w: 10, d: 10, height: 5 },
  great: { build: (r) => mosque(r, 1.6), w: 15, d: 15, height: 8 },
};
const BY_REGION: Record<string, Style> = {
  italy: ITALY,
  germany: GOTHIC,
  low_countries: GOTHIC,
  baltic: GOTHIC,
  scandinavia: GOTHIC,
  poland: GOTHIC,
  bohemia: GOTHIC,
  british_isles: GOTHIC,
  france: GOTHIC,
  hungary: GOTHIC,
  greece: GREEK,
  balkans: GREEK,
  caucasus: GREEK,
  rus: RUS,
  steppe: RUS,
  anatolia: ISLAM,
  maghreb: ISLAM,
  levant: ISLAM,
  egypt: ISLAM,
  arabia: ISLAM,
  mesopotamia: ISLAM,
  persia: ISLAM,
  sahel: ISLAM,
  west_africa: ISLAM,
  east_africa: ISLAM,
};

/** The building tradition of a region of the gazetteer; the Latin south where none is set. */
export const styleOf = (region: string): Style => BY_REGION[region] ?? LATIN;
