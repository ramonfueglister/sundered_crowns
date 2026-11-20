// The parts kit of a figure: small boxes ("micro voxels" of a tenth of a block) that every figure is made of. One mesh
// holds every part of every estate; what a figure does not wear or carry is folded away in the vertex stage
// (see material.ts), so that all figures of the world are one mesh drawn once.
//
// Front of a figure is -z, its feet stand at y = 0. Units here are micro voxels; the mesh is in blocks.

/** a tenth of a block */
export const MICRO = 0.1;
/**
 * A figure is 12 micro voxels = 1.2 blocks tall: 2.4 m at METRES_PER_BLOCK 2.0 (buildings/houses/style.ts, scale B
 * chosen by Ramon on 2026-11-15), deliberately larger than the 1.70 m of a man of 14th-century Europe (Koepke & Baten
 * 2005, Eur. Rev. Econ. Hist. 9) so that a figure reads next to a storey of 1.5 blocks, as in Die Siedler. The head is
 * drawn larger than true for the same reason (a drawing value of the diorama, not a measurement).
 */
export const HEIGHT = 1.2;

/** Which instance colour a part takes. */
export const enum Slot {
  Skin = 0,
  Tunic = 1,
  Legs = 2,
  Headwear = 3,
  Load = 4,
  Shoes = 5,
  Belt = 6,
  Hair = 7,
}
/** Which way a part moves. */
export const enum Joint {
  Body = 0,
  LegL = 1,
  LegR = 2,
  ArmL = 3,
  ArmR = 4,
  Head = 5,
}
/** What a figure carries (0: nothing). */
export const enum Load {
  None = 0,
  Sack = 1,
  Basket = 2,
  Log = 3,
  Spear = 4,
  Hoe = 5,
  Bundle = 6,
}
/** The cut of the body garment. */
export const enum Cut {
  Short = 0,
  Long = 1,
}
/** What a figure wears on the head. */
export const enum Head {
  Hood = 10,
  Veil = 11,
  StrawHat = 12,
  Tonsure = 13,
  KettleHat = 14,
}

/** One box of the kit: corners in micro voxels, and to which slot, joint, load and variant it belongs (-1: always). */
export interface Part {
  from: readonly [number, number, number];
  to: readonly [number, number, number];
  slot: Slot;
  joint: Joint;
  load?: Load;
  variant?: number;
}
const P = (
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  slot: Slot,
  joint: Joint,
  load = Load.None,
  variant = -1,
): Part => ({ from: [x0, y0, z0], to: [x1, y1, z1], slot, joint, load, variant });

/** Hip and shoulder heights in blocks: the legs and arms swing about them. */
export const HIP = 0.5,
  SHOULDER = 0.9;

/** The full kit, drawn near. */
export const NEAR_PARTS: readonly Part[] = [
  // legs in hose, and shoes
  P(-2, 1, -1, 0, 5, 1, Slot.Legs, Joint.LegL),
  P(0, 1, -1, 2, 5, 1, Slot.Legs, Joint.LegR),
  P(-2, 0, -1, 0, 1, 2, Slot.Shoes, Joint.LegL),
  P(0, 0, -1, 2, 1, 2, Slot.Shoes, Joint.LegR),
  // the body garment: a tunic to the knee, or a gown or habit to the ankle
  P(-2.5, 4, -1.5, 2.5, 9, 1.5, Slot.Tunic, Joint.Body, Load.None, Cut.Short),
  P(-2.5, 1, -1.5, 2.5, 9, 1.5, Slot.Tunic, Joint.Body, Load.None, Cut.Long),
  P(-2.6, 5.5, -1.6, 2.6, 6.2, 1.6, Slot.Belt, Joint.Body),
  // arms and hands
  P(-3.5, 5, -1, -2.5, 9, 1, Slot.Tunic, Joint.ArmL),
  P(2.5, 5, -1, 3.5, 9, 1, Slot.Tunic, Joint.ArmR),
  P(-3.5, 4.3, -0.7, -2.5, 5, 0.7, Slot.Skin, Joint.ArmL),
  P(2.5, 4.3, -0.7, 3.5, 5, 0.7, Slot.Skin, Joint.ArmR),
  // the head: face with eyes and nose, hair at the back
  P(-1.5, 9, -1.5, 1.5, 12, 1.5, Slot.Skin, Joint.Head),
  P(-1.1, 10.4, -1.62, -0.5, 10.9, -1.4, Slot.Shoes, Joint.Head),
  P(0.5, 10.4, -1.62, 1.1, 10.9, -1.4, Slot.Shoes, Joint.Head),
  P(-0.25, 9.8, -1.8, 0.25, 10.5, -1.4, Slot.Skin, Joint.Head),
  P(-1.6, 9.6, 0.6, 1.6, 12.1, 1.6, Slot.Hair, Joint.Head),
  // the hood with shoulder cape and a long tail behind (liripipe), open at the face
  P(-2.7, 8, -1.8, 2.7, 9.3, 1.8, Slot.Headwear, Joint.Body, Load.None, Head.Hood),
  P(-1.8, 11.9, -1.8, 1.8, 12.6, 1.8, Slot.Headwear, Joint.Head, Load.None, Head.Hood),
  P(-1.85, 9, -1.55, -1.5, 12.4, 1.8, Slot.Headwear, Joint.Head, Load.None, Head.Hood),
  P(1.5, 9, -1.55, 1.85, 12.4, 1.8, Slot.Headwear, Joint.Head, Load.None, Head.Hood),
  P(-1.8, 9, 1.5, 1.8, 12.4, 1.9, Slot.Headwear, Joint.Head, Load.None, Head.Hood),
  P(-0.45, 11.4, 1.8, 0.45, 12.2, 4.2, Slot.Headwear, Joint.Head, Load.None, Head.Hood),
  P(-0.4, 9.4, 3.6, 0.4, 11.6, 4.2, Slot.Headwear, Joint.Head, Load.None, Head.Hood),
  // the veil, open at the face, with the barbe under the chin
  P(-1.75, 11.9, -1.75, 1.75, 12.5, 1.75, Slot.Headwear, Joint.Head, Load.None, Head.Veil),
  P(-1.8, 8.4, -1.4, -1.5, 12.4, 1.8, Slot.Headwear, Joint.Head, Load.None, Head.Veil),
  P(1.5, 8.4, -1.4, 1.8, 12.4, 1.8, Slot.Headwear, Joint.Head, Load.None, Head.Veil),
  P(-1.8, 7.6, 1.5, 1.8, 12.4, 1.9, Slot.Headwear, Joint.Head, Load.None, Head.Veil),
  P(-1.75, 8.6, -1.75, 1.75, 9.3, -1.45, Slot.Headwear, Joint.Head, Load.None, Head.Veil),
  // the straw hat, the monk's ring of hair, the kettle hat
  P(-2.5, 11.6, -2.5, 2.5, 12.0, 2.5, Slot.Headwear, Joint.Head, Load.None, Head.StrawHat),
  P(-1.4, 11.9, -1.4, 1.4, 13, 1.4, Slot.Headwear, Joint.Head, Load.None, Head.StrawHat),
  P(-1.6, 11.1, -1.6, 1.6, 12.1, 1.6, Slot.Headwear, Joint.Head, Load.None, Head.Tonsure),
  P(-2.2, 11.2, -2.2, 2.2, 11.6, 2.2, Slot.Headwear, Joint.Head, Load.None, Head.KettleHat),
  P(-1.6, 11.5, -1.6, 1.6, 12.8, 1.6, Slot.Headwear, Joint.Head, Load.None, Head.KettleHat),
  // loads: what a figure carries tells what it does
  P(-2, 7, 1.6, 2, 11.2, 4.4, Slot.Load, Joint.Body, Load.Sack),
  P(-1, 11.2, 2.0, 1, 11.8, 4.0, Slot.Load, Joint.Body, Load.Sack),
  P(-2, 5, -4.5, 2, 7.5, -1.5, Slot.Load, Joint.Body, Load.Basket),
  P(-1, 9.2, -9, 1, 10.8, 9, Slot.Load, Joint.Body, Load.Log),
  P(3.2, 0, -0.5, 3.8, 17, 0.5, Slot.Load, Joint.ArmR, Load.Spear),
  P(3.0, 17, -0.6, 4.0, 19, 0.6, Slot.Belt, Joint.ArmR, Load.Spear),
  P(-4.2, 4, -2.5, -3.4, 9, 2.5, Slot.Belt, Joint.ArmL, Load.Spear),
  P(-3.6, 0.5, -2, -2.4, 9.5, -1.5, Slot.Load, Joint.ArmL, Load.Hoe),
  P(-4.2, 0, -2.2, -1.8, 1.5, -1.3, Slot.Belt, Joint.ArmL, Load.Hoe),
  P(-1.5, 0, -4.5, 1.5, 3.5, -1.5, Slot.Load, Joint.Body, Load.Bundle),
];

/** The kit seen from afar: legs, body, head, headwear and the loads that show at that size. */
export const FAR_PARTS: readonly Part[] = [
  P(-2, 0, -1, 0, 5, 1, Slot.Legs, Joint.LegL),
  P(0, 0, -1, 2, 5, 1, Slot.Legs, Joint.LegR),
  P(-3, 4, -1.5, 3, 9, 1.5, Slot.Tunic, Joint.Body, Load.None, Cut.Short),
  P(-3, 1, -1.5, 3, 9, 1.5, Slot.Tunic, Joint.Body, Load.None, Cut.Long),
  P(-1.5, 9, -1.5, 1.5, 11, 1.5, Slot.Skin, Joint.Head),
  P(-1.8, 11, -1.8, 1.8, 12.5, 1.8, Slot.Headwear, Joint.Head),
  P(-2, 7, 1.6, 2, 11.2, 4.4, Slot.Load, Joint.Body, Load.Sack),
  P(-1, 9.2, -9, 1, 10.8, 9, Slot.Load, Joint.Body, Load.Log),
  P(3.2, 0, -0.5, 3.8, 17, 0.5, Slot.Load, Joint.Body, Load.Spear),
];

/** A kit as flat lists: position and normal (3 per corner), and per corner slot, joint, load and variant. */
export interface KitMesh {
  pos: Float32Array;
  nor: Float32Array;
  info: Float32Array;
  triangles: number;
}

/** the 36 corners of a unit box (two triangles per face), with the face's normal, counter-clockwise from outside */
const FACES: readonly { n: readonly [number, number, number]; c: readonly (readonly [number, number, number])[] }[] = [
  {
    n: [1, 0, 0],
    c: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 0, 1],
      [1, 1, 0],
      [1, 1, 1],
    ],
  },
  {
    n: [-1, 0, 0],
    c: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 0, 0],
      [0, 1, 1],
      [0, 1, 0],
    ],
  },
  {
    n: [0, 1, 0],
    c: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  {
    n: [0, -1, 0],
    c: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    n: [0, 0, 1],
    c: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  },
  {
    n: [0, 0, -1],
    c: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  },
];

/** Builds the mesh of a kit, in blocks. */
export function buildKit(parts: readonly Part[]): KitMesh {
  const corners = parts.length * 36,
    pos = new Float32Array(corners * 3),
    nor = new Float32Array(corners * 3),
    info = new Float32Array(corners * 4);
  let k = 0;
  for (const p of parts)
    for (const f of FACES)
      for (const c of f.c) {
        for (let a = 0; a < 3; a++) {
          pos[k * 3 + a] = (p.from[a] + c[a] * (p.to[a] - p.from[a])) * MICRO;
          nor[k * 3 + a] = f.n[a];
        }
        info.set([p.slot, p.joint, p.load ?? Load.None, p.variant ?? -1], k * 4);
        k++;
      }
  return { pos, nor, info, triangles: corners / 3 };
}
