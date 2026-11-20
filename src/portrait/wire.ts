// The bytes that cross between the game and the portrait builder: a person going in, a portrait coming out
// (portrait/src/wire.rs is the other side and describes the layout). All numbers little-endian.

/** Genes per person; a person carries two alleles of each, one byte each (portrait/src/dna.rs). */
export const GENES = 50;

/** A person as the builder takes them (the fields of Apoleia's take_person). */
export interface PortraitPerson {
  /** Fixed per person: the seed of everything drawn by chance (beard style, tunic colour, scars). */
  pid: number;
  /** The 100 bytes of the genes: the first allele of every gene, then the second. */
  dna: ArrayLike<number>;
  female: boolean;
  /** Years. */
  age: number;
  /** 0..3, with `job` the look worn (portrait/src/person.rs look_stand). */
  stand: number;
  job: string;
  /** Where the founders of the family came from; "Graecia", "Syria" and "Aegyptus" wear full beards. */
  origin: string;
  /** Body weight in per mille of normal (hunger shows below about 935). */
  health: number;
  /** Food of the household in per mille of the need (grim below 900). */
  fed: number;
  /** Days since the last death in the household, if there was one. */
  loss_days?: number;
  /** Share of the people around with less money per head, 0..1. */
  rank?: number;
  /** Clothing held of the need in per cent. */
  clothes_pct?: number;
}

/** One material's triangles, three vertices each, counter-clockwise seen from outside. */
export interface PortraitSurface {
  rough: number;
  metal: number;
  /** Drawn from both sides (hair, beard, cloth edges). */
  double: boolean;
  /** The image of the surface and its normal map, as paths under public/portrait ("" for none). */
  tex: string;
  nmap: string;
  /** 3 numbers a vertex. */
  pos: Float32Array;
  /** 3 numbers a vertex, linear light. */
  col: Float32Array;
  /** 2 numbers a vertex, or empty. */
  uv: Float32Array;
  /** 3 numbers a vertex, or empty (then the triangles are faceted). */
  nrm: Float32Array;
}

export interface Portrait {
  /** The frame: the top of the head (or hat), the chin, the head's centre in x and z. */
  top: number; chin: number; cx: number; cz: number;
  /** Share of the picture's height the head fills. */
  fill: number;
  /** How much of a child's skin the person has: 1 a child up to eleven, 0 the grown (the stage draws a child's skin
   *  smoother: profile.ts `skin.child`). */
  young: number;
  /** How the person carries the head (portrait/src/dress.rs `head`): turned further than the profile turns every
   *  head, and tilted towards a shoulder (radians), and the place the tilt is about: the neck's foot (x and
   *  height). The stage turns and tilts the whole figure; the builder has tipped the shoulders back. All 0 on a
   *  portrait of Apoleia's. */
  head: [number, number];
  neck: [number, number];
  tris: number;
  /** Background of the look: inner and outer colour, sRGB 0..1. */
  bg: [[number, number, number], [number, number, number]];
  /** The look's name. */
  look: string;
  surfaces: PortraitSurface[];
}

const utf8 = new TextEncoder();
const text = new TextDecoder();

/** A person and the level of detail (0..3) as the builder reads them. */
export function encodePerson(p: PortraitPerson, lod: number): Uint8Array {
  if (p.dna.length !== 2 * GENES) throw new Error(`a person has ${2 * GENES} bytes of genes, not ${p.dna.length}`);
  const job = utf8.encode(p.job), origin = utf8.encode(p.origin);
  const out = new Uint8Array(32 + 2 * GENES + 4 + job.length + origin.length);
  const v = new DataView(out.buffer);
  const known = (p.loss_days === undefined ? 0 : 1) | (p.rank === undefined ? 0 : 2) | (p.clothes_pct === undefined ? 0 : 4);
  out.set([lod, p.female ? 1 : 0, p.stand, known]);
  v.setUint32(4, p.pid, true);
  [p.age, p.health, p.fed, p.loss_days ?? 0, p.rank ?? 0, p.clothes_pct ?? 0].forEach((x, i) => v.setFloat32(8 + 4 * i, x, true));
  out.set(p.dna, 32);
  let o = 32 + 2 * GENES;
  for (const t of [job, origin]) { v.setUint16(o, t.length, true); out.set(t, o + 2); o += 2 + t.length; }
  return out;
}

/** A portrait from the bytes of the builder. */
export function decodePortrait(b: Uint8Array): Portrait {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 0;
  const f32 = (): number => { o += 4; return v.getFloat32(o - 4, true); };
  const u32 = (): number => { o += 4; return v.getUint32(o - 4, true); };
  const str = (): string => { const n = v.getUint16(o, true); o += 2 + n; return text.decode(b.subarray(o - n, o)); };
  /** `n` floats, copied (the bytes are not aligned). */
  const floats = (n: number): Float32Array => { const out = new Float32Array(b.slice(o, o + 4 * n).buffer); o += 4 * n; return out; };
  const [top, chin, cx, cz, fill, young, yaw, tilt, nx, ny] = [f32(), f32(), f32(), f32(), f32(), f32(), f32(), f32(), f32(), f32()];
  const tris = u32();
  const c = floats(6);
  const look = str();
  const surfaces: PortraitSurface[] = [];
  for (let n = u32(); n > 0; n--) {
    const rough = f32(), metal = f32(), double = b[o++] !== 0, tex = str(), nmap = str();
    const verts = u32(), uvs = u32(), nrms = u32();
    surfaces.push({ rough, metal, double, tex, nmap, pos: floats(3 * verts), col: floats(3 * verts), uv: floats(2 * uvs), nrm: floats(3 * nrms) });
  }
  if (o !== b.length) throw new Error('the bytes of the portrait do not end where the portrait ends');
  return { top, chin, cx, cz, fill, young, head: [yaw, tilt], neck: [nx, ny], tris, bg: [[c[0], c[1], c[2]], [c[3], c[4], c[5]]], look, surfaces };
}
