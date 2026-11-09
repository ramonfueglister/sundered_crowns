// A coat of arms for a realm the game creates (released land, rebels who win their own realm, a pretender's party),
// in the drawing spec of docs/DATA_SCHEMA.md that src/ui/panels/coa.tsx draws. Chosen from the realm's people and
// faith, deterministic from a seed (no draw from the game's random sequence).
import { hash01 } from '../rng';

const METALS = ['or', 'argent'];
const COLOURS = ['gules', 'azure', 'vert', 'sable', 'purpure'];
const DIVISIONS = ['plain', 'plain', 'plain', 'per_pale', 'per_fess', 'quarterly', 'per_bend', 'barry', 'paly'];
const ORDINARIES = [null, null, null, 'fess', 'pale', 'bend', 'chevron', 'cross', 'saltire', 'chief', 'bordure'];
/** Charges by tradition: the west's beasts and towers, the steppe's seals, Islam's crescents and stars. */
const CHARGES: Record<string, string[]> = {
  west: ['lion', 'lion_passant', 'eagle', 'tower', 'castle', 'key', 'rose', 'star', 'wheel', 'boar', 'bear', 'wolf', 'griffin', 'stag_head', 'bull_head', 'fish', 'tree', 'horn', 'sword', 'cross_small'],
  east: ['eagle', 'double_eagle', 'lion', 'cross_small', 'star', 'crown', 'horse', 'tower', 'key'],
  steppe: ['tamga', 'horse', 'crescent', 'star', 'moon', 'horn'],
  islam: ['crescent', 'star', 'moon', 'tughra_like', 'sword', 'tower'],
  other: ['star', 'roundel', 'bezant', 'sword', 'tree', 'mountain', 'wheel', 'moon'],
};
const pickH = <T>(arr: T[], seed: number, k: number) => arr[Math.floor(hash01(seed, k, 0x0c0a) * arr.length)];
const TRAD: Record<string, string> = {
  british: 'west', gallic: 'west', iberian: 'west', low_lands: 'west', german: 'west', italian: 'west', west_slavic: 'west', baltic: 'west', finnic: 'west', norse: 'west', carpathian: 'west',
  east_slavic: 'east', south_slavic: 'east', hellenic: 'east', caucasian: 'east', turkic: 'steppe', mongolic: 'steppe', northern: 'steppe', arab: 'islam', berber: 'islam', iranian: 'islam',
};

/** A coat of arms for a new realm: tinctures by the rule of tincture (metal on colour), a division or an ordinary
 *  now and then, and one to three charges of its people's tradition (Muslim realms take the crescent and star). */
export function genCoa(seed: number, group: string, muslim: boolean, label?: string): any {
  const trad = muslim ? 'islam' : TRAD[group] ?? 'other';
  const metalField = hash01(seed, 1, 7) < 0.35;
  const field = metalField ? pickH(METALS, seed, 2) : pickH(COLOURS, seed, 3);
  const other = metalField ? pickH(COLOURS, seed, 4) : pickH(METALS, seed, 5);
  const division = trad === 'islam' || trad === 'steppe' ? 'plain' : pickH(DIVISIONS, seed, 6);
  const ordinary = division === 'plain' && trad !== 'islam' ? pickH(ORDINARIES, seed, 8) : null;
  const charge = pickH(CHARGES[trad], seed, 9);
  const count = ordinary === 'bordure' || division !== 'plain' ? 1 : [1, 1, 1, 2, 3][Math.floor(hash01(seed, 10, 3) * 5)];
  return {
    blazon: label ? `Arms of ${label}` : '',
    field, division, field2: division !== 'plain' ? other : null,
    ordinary, ordinary_tincture: ordinary ? other : null,
    charges: [{ type: charge, tincture: ordinary ? (metalField ? pickH(COLOURS, seed, 11) : pickH(METALS, seed, 12)) : other, count }],
  };
}
