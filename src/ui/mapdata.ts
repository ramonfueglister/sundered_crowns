// Map data derived from the game state for the renderer: realm names along their land and the towns of every location.
// Kept free of the UI and the game client so that it can be tested on its own.
import { L } from './i18n';
import type { I18n } from '../sim/i18n';
import { FAITHS } from '../sim/content/peoples';

/**
 * Nation names placed along the main axis of their land (recomputed when borders change). Only the realm's main body is used
 * (the connected cluster around the capital, unless that is a small exclave), so overseas holdings do not drag the name into
 * the sea. The size follows the extent along the text (in map px); the overlay keeps it within a readable range on screen and
 * resolves overlaps by `weight` (the area of that body).
 */
export function labelsFor(owner: Int16Array, assets: any, ns: ({ short: I18n; capital: number } | undefined)[]) {
  const geo = assets.geo; const L0 = geo.L;
  const X = geo.loc.x, Y = geo.loc.y, A = geo.loc.area;
  const locs: number[][] = ns.map(() => []);
  for (let i = 0; i < L0; i++) { const o = owner[i]; if (o >= 0 && o < ns.length) locs[o].push(i); }
  const CELL = 40;
  const out: any[] = [];
  for (let n = 0; n < ns.length; n++) {
    const all = locs[n]; const realm = ns[n]; if (!all.length || !realm) continue;
    // connected clusters on a coarse grid (gaps up to about one cell, e.g. narrow straits, are bridged)
    const cells = new Map<number, number[]>();
    for (const i of all) { const k = Math.floor(X[i] / CELL) * 65536 + Math.floor(Y[i] / CELL); let c = cells.get(k); if (!c) cells.set(k, c = []); c.push(i); }
    const comp = new Map<number, number>(); const comps: { locs: number[]; area: number }[] = [];
    for (const k0 of cells.keys()) {
      if (comp.has(k0)) continue;
      const id = comps.length; const cur = { locs: [] as number[], area: 0 }; comps.push(cur);
      const stack = [k0]; comp.set(k0, id);
      while (stack.length) {
        const k = stack.pop()!; for (const i of cells.get(k)!) { cur.locs.push(i); cur.area += Math.max(1, A[i]); }
        const cx = Math.floor(k / 65536), cy = k - cx * 65536;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const kk = (cx + dx) * 65536 + (cy + dy); if (cells.has(kk) && !comp.has(kk)) { comp.set(kk, id); stack.push(kk); } }
      }
    }
    let body = comps[0];
    for (const c of comps) if (c.area > body.area) body = c;
    const cap = realm.capital;
    if (cap >= 0 && owner[cap] === n) { const ck = Math.floor(X[cap] / CELL) * 65536 + Math.floor(Y[cap] / CELL); const cc = comps[comp.get(ck) ?? -1]; if (cc && cc.area >= body.area * 0.3) body = cc; }
    let sx = 0, sy = 0, cnt = 0;
    for (const i of body.locs) { const a = Math.max(1, A[i]); sx += X[i] * a; sy += Y[i] * a; cnt += a; }
    const cx = sx / cnt, cy = sy / cnt;
    let xx = 0, yy = 0, xy = 0;
    for (const i of body.locs) {
      // each location counts as a small disc, so one-location realms get an extent too
      const a = Math.max(1, A[i]), inner = a / (4 * Math.PI), dx = X[i] - cx, dy = Y[i] - cy;
      xx += (dx * dx + inner) * a; yy += (dy * dy + inner) * a; xy += dx * dy * a;
    }
    const a = xx / cnt, b = xy / cnt, c = yy / cnt;
    // text follows the main axis, but steep realms get level text (sized by their width) and the slant stays moderate
    let ang = 0.5 * Math.atan2(2 * b, a - c);
    if (Math.abs(ang) > 1.1) ang = 0; else ang = Math.max(-0.75, Math.min(0.75, ang));
    const co = Math.cos(ang), si = Math.sin(ang);
    const along = Math.sqrt(Math.max(0, a * co * co + 2 * b * si * co + c * si * si));
    const across = Math.sqrt(Math.max(0, a * si * si - 2 * b * si * co + c * co * co));
    const text = L(realm.short).toUpperCase();
    // the name spans about the realm's length along the text and is never much taller than the realm is wide
    const size = Math.max(1, Math.min(along * 3.84 / Math.max(3, text.length), across * 2.2));
    // a covered name may slide across its direction while it stays well inside the realm (about 1.2 standard deviations)
    const room = Math.max(0, across * 1.2 - size * 0.45);
    // the name bends along the realm's spine: offset = q·t² + l·t + k across the main axis, fitted to the land (area-weighted)
    const half = size * Math.max(3, text.length) * 0.32;
    let S0 = 0, S1 = 0, S2 = 0, S3 = 0, S4 = 0, T0 = 0, T1 = 0, T2 = 0;
    for (const i of body.locs) {
      const dx = X[i] - cx, dy = Y[i] - cy, t = dx * co + dy * si, off = -dx * si + dy * co;
      if (Math.abs(t) > half * 1.4) continue;
      const w = Math.max(1, A[i]), t2 = t * t;
      S0 += w; S1 += w * t; S2 += w * t2; S3 += w * t2 * t; S4 += w * t2 * t2; T0 += w * off; T1 += w * off * t; T2 += w * off * t2;
    }
    const det3 = (a1: number, b1: number, c1: number, a2: number, b2: number, c2: number, a3: number, b3: number, c3: number) => a1 * (b2 * c3 - c2 * b3) - b1 * (a2 * c3 - c2 * a3) + c1 * (a2 * b3 - b2 * a3);
    const D = det3(S4, S3, S2, S3, S2, S1, S2, S1, S0);
    let q = 0, lin = 0, k0 = 0;
    if (Math.abs(D) > 1e-9 && S0 > 0) {
      q = det3(T2, S3, S2, T1, S2, S1, T0, S1, S0) / D;
      lin = det3(S4, T2, S2, S3, T1, S1, S2, T0, S0) / D;
      k0 = det3(S4, S3, T2, S3, S2, T1, S2, S1, T0) / D;
    }
    // a gentle bend only, and the name stays inside the realm
    if (!Number.isFinite(q + lin + k0)) { q = 0; lin = 0; k0 = 0; }
    q = Math.max(-0.28 / Math.max(1, half), Math.min(0.28 / Math.max(1, half), q));
    lin = Math.max(-0.15, Math.min(0.15, lin));
    k0 = Math.max(-room, Math.min(room, k0));
    const curve: [number, number][] = [];
    for (let j = 0; j <= 10; j++) {
      const t = -half * 1.25 + (j / 10) * half * 2.5, off = q * t * t + lin * t + k0 - q * half * half * 0.33;
      curve.push([cx + t * co - off * si, cy + t * si + off * co]);
    }
    out.push({ text, x: cx, y: cy, angle: ang, size, nation: n, id: n, weight: body.area, room, curve });
  }
  return out;
}

/** Towns and villages for the 3D map: every owned place gets houses by its size, built in the style of its region and its
 *  realm's faith. */
export function computeSettlements(owner: Int16Array, assets: any, ns: ({ faith: number; capital: number } | undefined)[]) {
  const g = assets.geo, L = g.L;
  const caps = new Set<number>();
  for (const n of ns) if (n && n.capital >= 0) caps.add(n.capital);
  const out: { x: number; y: number; size: number; capital: boolean; style: 'north' | 'stone' | 'south' | 'steppe' | 'muslim'; loc: number }[] = [];
  for (let l = 0; l < L && l < owner.length; l++) {
    const o = owner[l];
    if (o < 0) continue;
    const n = ns[o];
    const lat = g.loc.lat[l], lon = g.loc.lon[l], elev = g.loc.elev[l];
    let style: 'north' | 'stone' | 'south' | 'steppe' | 'muslim';
    if (n && FAITHS[n.faith]?.family === 'muslim') style = 'muslim';
    else if (lon > 34 && lat > 44) style = 'steppe';
    else if (lat < 44.5) style = 'south';
    else if (elev > 700) style = 'stone';
    else style = 'north';
    out.push({ x: g.loc.x[l], y: g.loc.y[l], size: g.loc.size[l] ?? 0, capital: caps.has(l), style, loc: l });
  }
  return out;
}
