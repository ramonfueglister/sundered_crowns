// The shape of a town as its streets lay it (src/sim/settlement/streets.ts): the ways that leave it, its streets, its
// market and its parcels. src/sim/systems/lots.ts writes it into the land register.
import type { Parcel } from './rule';

/** a way of the world that leaves the town: its direction (radians, east 0, south positive) and its kind (0 track, 1 road, 2 highway) */
export interface Way {
  a: number;
  k: number;
}

/** the kinds of street: a lane grown to the parcels, and the streets that run out along the ways */
export const STREET = { lane: 0, track: 1, road: 2, highway: 3 } as const;

/** a straight piece of street, east-west or north-south: its ends (metres east and south of the town's centre, on the street's middle line) and its kind (STREET) */
export interface Street {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  kind: number;
}

/** a town as laid (src/sim/settlement/streets.ts, layTown) */
export interface Town {
  parcels: Parcel[];
  streets: Street[];
  /** the market: its middle (x, z), `half` metres to each side */
  market: { x: number; z: number; half: number };
  /** the street network's junctions by the number of streets that meet in them: ends, T-junctions, crossings (and the bends, where two meet) */
  nodes: { ends: number; bends: number; tees: number; crosses: number };
  /** the areas of the blocks the streets enclose (m²): the ground between the streets not open to the land round the town */
  blocks: number[];
  /** how often the families had to spread wider before all had a parcel (0: at the density of R_C) */
  spread?: number;
  /** how wide every street is drawn (metres of the plan): its middle line and `hw` to either side */
  width: number;
}
