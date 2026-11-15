// The estates and trades of 1356 as they show in the street: what they wear, what they carry, what they do. A figure
// is read by its trade and its load, not by detail (the "Wuselfaktor" of Die Siedler, see README.md).
//
// Colours: the poor wore undyed wool in its own greys and browns; dyed cloth was dearer, red from madder, blue from
// woad, yellow from weld, and the strong reds and blues mark the burghers (Piponnier & Mane 1997, "Dress in the
// Middle Ages"; Østergård 2004, "Woven into the Earth", on the undyed wool of the Herjolfsnes finds; both from memory,
// page numbers not checked). The exact shades are drawing values in the palette of the look probe.
// Hoods with a shoulder cape and a long tail (liripipe) are the common headwear of 14th-century men (Herjolfsnes hoods,
// Østergård 2004); women of standing covered their hair with a veil (Piponnier & Mane 1997); Benedictines wore black,
// Franciscans grey-brown; foot soldiers the kettle hat. Straw hats for field work are seen in the calendar pictures of
// the time (assumption: the Très Riches Heures are a little later, 1410s).
import { Cut, Head, Load } from './kit';

/** What a figure does: stands about, walks a way back and forth, or works on the spot. */
export const enum Mode { Stand = 0, Walk = 1, Work = 2 }

export interface Estate {
  name: string;
  /** relative share among the figures of a town (assumption, to be replaced by the person system's trades) */
  townShare: number;
  /** relative share among the figures of a village and its fields (assumption) */
  villageShare: number;
  cut: Cut; head: Head; load: Load; mode: Mode;
  tunic: readonly number[]; headwear: readonly number[];
}

const UNDYED = [0x8b7a62, 0x6f6a5a, 0x9a8463, 0x7f735e], DYED = [0xa5332a, 0x2f4f86, 0x3d6b3a, 0x6a2d5a, 0xb08a3a];

export const ESTATES: readonly Estate[] = [
  { name: 'Träger', townShare: 18, villageShare: 10, cut: Cut.Short, head: Head.Hood, load: Load.Sack, mode: Mode.Walk, tunic: UNDYED, headwear: [0x7a6a52, 0x5f5546, 0xa14f3d] },
  { name: 'Bäuerin', townShare: 10, villageShare: 22, cut: Cut.Long, head: Head.Veil, load: Load.Basket, mode: Mode.Walk, tunic: [0x5f6f86, 0x7c6a4f, 0x8a7a5a], headwear: [0xefe8d8] },
  { name: 'Holzfäller', townShare: 4, villageShare: 14, cut: Cut.Short, head: Head.Hood, load: Load.Log, mode: Mode.Walk, tunic: [0x4f5e3a, 0x6b5a3a], headwear: [0x3f4a2c, 0x6b5a3a] },
  { name: 'Bauer', townShare: 0, villageShare: 30, cut: Cut.Short, head: Head.StrawHat, load: Load.Hoe, mode: Mode.Work, tunic: UNDYED, headwear: [0xd9c27a] },
  { name: 'Bürger', townShare: 18, villageShare: 2, cut: Cut.Short, head: Head.Hood, load: Load.None, mode: Mode.Walk, tunic: DYED, headwear: [0xa5332a, 0x2f4f86, 0xd9a43a, 0x1f1c1a] },
  { name: 'Bürgerin', townShare: 16, villageShare: 2, cut: Cut.Long, head: Head.Veil, load: Load.None, mode: Mode.Walk, tunic: DYED, headwear: [0xf4efe2] },
  { name: 'Mönch', townShare: 5, villageShare: 2, cut: Cut.Long, head: Head.Tonsure, load: Load.None, mode: Mode.Walk, tunic: [0x1f1c1a, 0x6a5a48], headwear: [0x4a3626] },
  { name: 'Waffenknecht', townShare: 7, villageShare: 2, cut: Cut.Short, head: Head.KettleHat, load: Load.Spear, mode: Mode.Walk, tunic: [0xc9b48a, 0xb8432f], headwear: [0x8a8f96] },
  { name: 'Händler', townShare: 12, villageShare: 4, cut: Cut.Short, head: Head.StrawHat, load: Load.Bundle, mode: Mode.Walk, tunic: [0x2f4f86, 0x5a3b26], headwear: [0x3a2a1e, 0xa5332a] },
];

/** Skin, hair and hose: drawing values in the palette of the look probe. */
export const SKIN = [0xe8b892, 0xd9a47e, 0xc98f6a, 0xb97e5a] as const;
export const HAIR = [0x3a2a1e, 0x5a3b22, 0x8a6a3a, 0x2a2420, 0xa0805a, 0x6a6a66] as const;
export const HOSE = [0x5b4a3a, 0x3e4a5a, 0x7a2f28, 0x4a4a3e, 0x2a2a2a] as const;
export const LOAD_COLOURS: Record<Load, readonly number[]> = {
  [Load.None]: [0], [Load.Sack]: [0xcdbb8f, 0xb9a67a], [Load.Basket]: [0x9a7440], [Load.Log]: [0x7a5634],
  [Load.Spear]: [0x7a5634], [Load.Hoe]: [0x6b4a2c], [Load.Bundle]: [0x8a5a2f],
};

/** Picks an estate by its share, from a number 0 … 1. */
export function pickEstate(u: number, share: (e: Estate) => number): number {
  const total = ESTATES.reduce((s, e) => s + share(e), 0);
  let at = u * total;
  for (let k = 0; k < ESTATES.length; k++) { at -= share(ESTATES[k]); if (at < 0) return k; }
  return ESTATES.length - 1;
}
