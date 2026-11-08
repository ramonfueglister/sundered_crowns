// Static world data (geography). Built once from the baked map files; identical in browser and world server.
import { TERRAINS, GI } from './defs';

export interface GeoJson {
  W: number; H: number; lon0: number; lon1: number; latN: number; latS: number; L: number; S: number;
  loc: { x: number[]; y: number[]; lon: number[]; lat: number[]; area: number[]; elev: number[]; rough: number[]; emax: number[]; name: (string | null)[]; alt: (string | null)[]; size: number[]; pop: (number | null)[]; region_key: (string | null)[] };
  edges: [number, number, number, number, number][];
  straits: [number, number, string][];
  passes: [number, string][];
  provinces: { name: string; locs: number[]; capital: number; area: number; region: string }[];
  areas: { name: string; provinces: number[]; region: string }[];
  rivers: { name: string; rank: number; pts: [number, number][] }[];
}
export interface WorldJson { terrain: string[]; resource: string[]; name: string[]; coastal: boolean[]; temp: number[]; arid: number[]; forest: number[] }

export const EDGE_RIVER = 1, EDGE_STRAIT = 2, EDGE_COAST = 4, EDGE_SEA = 8;

export interface Province { id: number; name: string; locs: number[]; capital: number; area: number; region: string }
export interface Area { id: number; name: string; provinces: number[]; region: string }

export class World {
  W: number; H: number; L: number; S: number; N: number;
  lon0: number; lon1: number; latN: number; latS: number;
  x: Float32Array; y: Float32Array; lat: Float32Array; lon: Float32Array;
  area: Float32Array; elev: Float32Array; rough: Float32Array;
  terrain: Uint8Array; resource: Uint8Array; coastal: Uint8Array; pass: Uint8Array;
  temp: Float32Array; arid: Float32Array; forest: Float32Array;
  names: string[]; altNames: (string | null)[]; townSize: Uint8Array;
  adjStart: Int32Array; adj: Int32Array; adjKm: Float32Array; adjFlag: Uint8Array;
  provOf: Int32Array; provinces: Province[]; areas: Area[]; regions: string[]; regionOf: Uint8Array; // per province
  rivers: GeoJson['rivers'];
  kmPerPx: Float32Array; // per location

  constructor(geo: GeoJson, wj: WorldJson) {
    this.W = geo.W; this.H = geo.H; this.L = geo.L; this.S = geo.S; this.N = geo.L + geo.S;
    this.lon0 = geo.lon0; this.lon1 = geo.lon1; this.latN = geo.latN; this.latS = geo.latS;
    const N = this.N, L = this.L;
    this.x = Float32Array.from(geo.loc.x); this.y = Float32Array.from(geo.loc.y);
    this.lat = Float32Array.from(geo.loc.lat); this.lon = Float32Array.from(geo.loc.lon);
    this.area = Float32Array.from(geo.loc.area); this.elev = Float32Array.from(geo.loc.elev); this.rough = Float32Array.from(geo.loc.rough);
    this.terrain = new Uint8Array(L); this.resource = new Uint8Array(L); this.coastal = new Uint8Array(L); this.pass = new Uint8Array(L);
    this.temp = Float32Array.from(wj.temp.slice(0, L)); this.arid = Float32Array.from(wj.arid.slice(0, L)); this.forest = Float32Array.from(wj.forest);
    for (let i = 0; i < L; i++) {
      this.terrain[i] = Math.max(0, TERRAINS.indexOf(wj.terrain[i] as any));
      this.resource[i] = GI[wj.resource[i]] ?? 0;
      this.coastal[i] = wj.coastal[i] ? 1 : 0;
    }
    for (const [l] of geo.passes) this.pass[l - 1] = 1;
    this.names = new Array(N);
    for (let i = 0; i < N; i++) this.names[i] = (i < L ? wj.name[i] : geo.loc.name[i]) || `#${i}`;
    this.altNames = geo.loc.alt.slice(0, L);
    this.townSize = Uint8Array.from(geo.loc.size.slice(0, L).map((v) => v || 0));
    this.kmPerPx = new Float32Array(N);
    const kmpp0 = (this.lon1 - this.lon0) / this.W * 111.32;
    for (let i = 0; i < N; i++) this.kmPerPx[i] = kmpp0 * Math.cos(this.lat[i] * Math.PI / 180);
    // adjacency CSR
    const lists: [number, number][][] = Array.from({ length: N }, () => []);
    for (const [a1, b1, kind, , rf] of geo.edges) {
      const a = a1 - 1, b = b1 - 1;
      let f = 0;
      if (kind === 0 && rf > 0.3) f |= EDGE_RIVER;
      if (kind === 1) f |= EDGE_COAST;
      if (kind === 2) f |= EDGE_SEA;
      lists[a].push([b, f]); lists[b].push([a, f]);
    }
    for (const [a1, b1] of geo.straits) { lists[a1 - 1].push([b1 - 1, EDGE_STRAIT]); lists[b1 - 1].push([a1 - 1, EDGE_STRAIT]); }
    this.adjStart = new Int32Array(N + 1);
    let tot = 0;
    for (let i = 0; i < N; i++) { lists[i].sort((p, q) => p[0] - q[0]); this.adjStart[i] = tot; tot += lists[i].length; }
    this.adjStart[N] = tot;
    this.adj = new Int32Array(tot); this.adjKm = new Float32Array(tot); this.adjFlag = new Uint8Array(tot);
    let k = 0;
    for (let i = 0; i < N; i++) for (const [j, f] of lists[i]) {
      this.adj[k] = j; this.adjFlag[k] = f;
      const dx = this.x[i] - this.x[j], dy = this.y[i] - this.y[j];
      this.adjKm[k] = Math.sqrt(dx * dx + dy * dy) * (this.kmPerPx[i] + this.kmPerPx[j]) * 0.5;
      k++;
    }
    this.provOf = new Int32Array(L).fill(-1);
    this.provinces = geo.provinces.map((p, i) => ({ id: i, name: p.name, locs: p.locs.map((v) => v - 1), capital: p.capital - 1, area: (p as any).area ?? 0, region: (p as any).region ?? 'unknown' }));
    for (const p of this.provinces) for (const l of p.locs) this.provOf[l] = p.id;
    this.areas = geo.areas.map((a, i) => ({ id: i, name: a.name, provinces: a.provinces, region: a.region }));
    this.regions = [...new Set(this.provinces.map((p) => p.region))].sort();
    this.regionOf = new Uint8Array(this.provinces.length);
    for (const p of this.provinces) this.regionOf[p.id] = this.regions.indexOf(p.region);
    this.rivers = geo.rivers;
  }
  isSea(i: number) { return i >= this.L; }
  neighbours(i: number): Int32Array { return this.adj.subarray(this.adjStart[i], this.adjStart[i + 1]); }
  distKm(a: number, b: number): number {
    const dx = this.x[a] - this.x[b], dy = this.y[a] - this.y[b];
    return Math.sqrt(dx * dx + dy * dy) * (this.kmPerPx[a] + this.kmPerPx[b]) * 0.5;
  }
  pxToLonLat(px: number, py: number): [number, number] {
    const lon = this.lon0 + px / this.W * (this.lon1 - this.lon0);
    const ymax = Math.asinh(Math.tan(this.latN * Math.PI / 180)), ymin = Math.asinh(Math.tan(this.latS * Math.PI / 180));
    const Y = ymax - py / this.H * (ymax - ymin);
    return [lon, Math.atan(Math.sinh(Y)) * 180 / Math.PI];
  }
}
