// 2D canvas overlay: labels and unit counters, positioned with the map camera.

/**
 * size: font size in map px (on screen it is size × zoom). weight: priority when labels collide (e.g. the realm's area).
 * id: stable key for fading in and out (e.g. the nation id). room: how far (map px) the name may move across its own
 * direction, still inside the realm, to make way for a name that would otherwise hide it.
 */
export interface MapLabel {
  text: string; x: number; y: number; angle: number; size: number; color?: string; weight?: number; id?: number; room?: number;
  /** the baseline through the realm (map px, at least two points, centred on the name); the letters follow it on the ground */
  curve?: [number, number][];
}

/** a polyline with its arc length, to walk along */
class Path2 {
  len: number[] = [0]; total = 0;
  constructor(public pts: [number, number][]) {
    for (let i = 1; i < pts.length; i++) { this.total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); this.len.push(this.total); }
  }
  /** point and unit tangent at arc length s (straight on beyond the ends) */
  at(s: number): [number, number, number, number] {
    const p = this.pts, L = this.len;
    let i = 1;
    while (i < p.length - 1 && L[i] < s) i++;
    const ax = p[i - 1][0], ay = p[i - 1][1], bx = p[i][0], by = p[i][1];
    const seg = Math.max(1e-6, L[i] - L[i - 1]);
    const tx = (bx - ax) / seg, ty = (by - ay) / seg;
    const u = s - L[i - 1];
    return [ax + tx * u, ay + ty * u, tx, ty];
  }
}
export interface MapLandmark { x: number; y: number; name: string; kind: string; tier: number; max: number; building: boolean }
export type UnitKind = 'army' | 'fleet' | 'siege' | 'battle';
export interface MapUnit {
  id: number; x: number; y: number; color: [number, number, number]; label: string; kind: UnitKind;
  selected?: boolean; moving?: boolean; path?: [number, number][];
  /** soldiers or ships (for merging counters when zoomed out), owner nation */
  men?: number; owner?: number; mine?: boolean;
  /** at war or on the march: shown in full even when zoomed out */
  hot?: boolean;
  /** where the 3D figures stand (set by the renderer) */
  fx?: number; fy?: number;
}

export interface OverlayView {
  /** map px -> css px (canvas-local) */
  toScreen(x: number, y: number): [number, number];
  /** a point h map px above the ground */
  toScreenH?(x: number, y: number, h: number): [number, number];
  /** a point at height z (world px above sea level) */
  toScreenZ?(x: number, y: number, z: number): [number, number];
  /** terrain height (world px above sea level) */
  heightAt?(x: number, y: number): number;
  scaleAt?(x: number, y: number): number;
  /** css px per map px from which armies and fleets show as figures */
  figuresFrom?: number;
  zoom: number; cssW: number; cssH: number; time: number;
}

const fmtMen = (u: MapUnit, men: number) => (u.kind === 'fleet' ? String(Math.round(men)) : men >= 1000 ? (men / 1000).toFixed(1) + 'k' : String(Math.round(men)));

const LABEL_FONT = `"Cormorant Garamond", "EB Garamond", Garamond, Georgia, "Times New Roman", serif`;
const UNIT_FONT = `600 11px system-ui, "Segoe UI", Roboto, sans-serif`;
// Label sizes on screen (css px): hidden below MIN, never drawn larger than MAX; labels that would be much larger fade to a watermark.
const LABEL_MIN = 7, LABEL_FULL = 10, LABEL_MAX = 64, LABEL_FADE_FROM = 70, LABEL_FADE_TO = 150, LABEL_FLOOR = 0.22;

interface Placed { cx: number; cy: number; ux: number; uy: number; hw: number; hh: number }
/** a letter on screen: the affine transform (screen px per font px) and the letter */
type Glyph = [number, number, number, number, number, number, string];
interface LabelLayout { glyphs: Glyph[]; boxes: Placed[] }
/** Separating-axis test for two rotated rectangles. */
function obbOverlap(a: Placed, b: Placed): boolean {
  const dx = b.cx - a.cx, dy = b.cy - a.cy;
  const axes: [number, number][] = [[a.ux, a.uy], [-a.uy, a.ux], [b.ux, b.uy], [-b.uy, b.ux]];
  for (const [ax, ay] of axes) {
    const ra = a.hw * Math.abs(a.ux * ax + a.uy * ay) + a.hh * Math.abs(-a.uy * ax + a.ux * ay);
    const rb = b.hw * Math.abs(b.ux * ax + b.uy * ay) + b.hh * Math.abs(-b.uy * ax + b.ux * ay);
    if (Math.abs(dx * ax + dy * ay) > ra + rb) return false;
  }
  return true;
}

export class Overlay {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  labels: MapLabel[] = [];
  units: MapUnit[] = [];
  landmarks: MapLandmark[] = [];
  private dpr = 1;
  private fade = new Map<number | string, number>(); // current opacity per label, eased toward its target
  private shift = new Map<number | string, number>(); // offset (map px, across the text) a label last moved to, tried first
  private lastTime = -1;
  private widths = new Map<string, number>();       // text width at 100 px without letter spacing

  constructor(host: HTMLCanvasElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'map-overlay';
    const st = this.canvas.style;
    st.position = 'absolute'; st.pointerEvents = 'none'; st.left = '0px'; st.top = '0px';
    host.insertAdjacentElement('afterend', this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
  }

  layout(host: HTMLCanvasElement, cssW: number, cssH: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(cssW * this.dpr)), h = Math.max(1, Math.round(cssH * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    const st = this.canvas.style;
    st.width = cssW + 'px'; st.height = cssH + 'px';
    st.left = host.offsetLeft + 'px'; st.top = host.offsetTop + 'px';
  }

  draw(v: OverlayView) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawLabels(v);
    this.drawLandmarks(v);
    this.drawUnits(v);
  }

  /** draw onto a foreign context (for screenshots) */
  drawTo(ctx: CanvasRenderingContext2D, v: OverlayView, scale: number) {
    const saved = this.ctx; const savedDpr = this.dpr;
    this.ctx = ctx; this.dpr = scale;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.drawLabels(v, true); this.drawLandmarks(v); this.drawUnits(v);
    this.ctx = saved; this.dpr = savedDpr;
  }

  private textWidth100(text: string): number {
    let w = this.widths.get(text);
    if (w === undefined) {
      const ctx = this.ctx;
      (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
      ctx.font = `600 100px ${LABEL_FONT}`;
      w = ctx.measureText(text).width;
      if (this.widths.size > 4000) this.widths.clear();
      this.widths.set(text, w);
    }
    return w;
  }

  /**
   * Realm names like on a printed map: the size follows the realm's extent but stays between LABEL_MIN and LABEL_MAX on screen,
   * names that would be far larger fade out, and of two overlapping names the smaller realm's yields.
   */
  private drawLabels(v: OverlayView, instant = false) {
    const ctx = this.ctx;
    const dt = instant || this.lastTime < 0 ? 1 : Math.max(0, Math.min(0.25, v.time - this.lastTime));
    if (!instant) this.lastTime = v.time;
    type Cand = { l: MapLabel; key: number | string; fs: number; ds: number; spacing: number; alpha: number; tier: number; lay: LabelLayout; sc: number };
    const cands: Cand[] = [];
    for (let i = 0; i < this.labels.length; i++) {
      const l = this.labels[i];
      // perspective: the scale where the name lies, not the scale at the screen centre
      const sc = v.scaleAt ? v.scaleAt(l.x, l.y) : v.zoom;
      const fs = l.size * sc;
      const key = l.id ?? `${l.text}@${i}`;
      if (fs < LABEL_MIN) { if (!instant) this.fade.delete(key); continue; }
      const ds = Math.min(fs, LABEL_MAX);
      const [sx, sy] = v.toScreen(l.x, l.y);
      const n = Math.max(1, l.text.length);
      // oversized names spread their letters a little, as engravers did across large lands
      const spacing = ds * (ds > 18 ? 0.18 : 0.06) + (fs > ds ? Math.min(ds * 0.5, (fs - ds) * 0.08) : 0);
      const tw = this.textWidth100(l.text) * ds / 100 + spacing * (n - 1);
      const hw = tw / 2 + 4, hh = ds * 0.42 + 2;
      const reach = hw + hh;
      if (sx < -reach || sy < -reach || sx > v.cssW + reach || sy > v.cssH + reach) continue;
      let alpha = Math.min(1, (fs - LABEL_MIN) / (LABEL_FULL - LABEL_MIN));
      if (fs > LABEL_FADE_FROM) alpha *= Math.max(LABEL_FLOOR, 1 - (1 - LABEL_FLOOR) * (fs - LABEL_FADE_FROM) / (LABEL_FADE_TO - LABEL_FADE_FROM));
      const lay = this.layoutLabel(v, l, ds, spacing, sc, 0);
      if (!lay.glyphs.length) continue;
      cands.push({ l, key, fs, ds, spacing, alpha, tier: fs > LABEL_FADE_FROM ? 1 : 0, lay, sc });
    }
    // legible names first (larger realms first), then oversized ones (least oversized first);
    // a name is shown only where it does not cover one already placed
    cands.sort((a, b) => a.tier - b.tier || (a.tier ? a.fs - b.fs : (b.l.weight ?? b.fs) - (a.l.weight ?? a.fs)));
    const placed: Placed[] = [];
    const k = 1 - Math.exp(-dt * 7);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const seen = new Set<number | string>();
    const fits = (bs: Placed[]) => {
      for (const b of bs) for (const p of placed) {
        if (Math.abs(p.cx - b.cx) > p.hw + p.hh + b.hw + b.hh || Math.abs(p.cy - b.cy) > p.hw + p.hh + b.hw + b.hh) continue;
        if (obbOverlap(p, b)) return false;
      }
      return true;
    };
    for (const cd of cands) {
      // a name that is covered tries a few places across its direction (within its realm), the last one used first
      const l0 = cd.l, room = l0.room ?? 0;
      const tries = [this.shift.get(cd.key) ?? 0, 0];
      if (room > 0) { const step = cd.ds * 0.55 / cd.sc; for (let j = 1; j <= 6 && j * step <= room; j++) tries.push(j * step, -j * step); }
      let lay = cd.lay, free = false, used = 0;
      for (const d of tries) {
        if (Math.abs(d) > room) continue;
        const tl = d ? this.layoutLabel(v, l0, cd.ds, cd.spacing, cd.sc, d) : cd.lay;
        if (fits(tl.boxes)) { lay = tl; free = true; used = d; break; }
      }
      if (free) { placed.push(...lay.boxes); if (!instant) { if (used) this.shift.set(cd.key, used); else this.shift.delete(cd.key); } }
      else { const d = this.shift.get(cd.key) ?? 0; if (d) lay = this.layoutLabel(v, l0, cd.ds, cd.spacing, cd.sc, d); }
      const target = free ? cd.alpha : 0;
      const cur = instant ? target : (this.fade.get(cd.key) ?? 0);
      const a = instant ? target : cur + (target - cur) * k;
      seen.add(cd.key);
      if (!instant) this.fade.set(cd.key, a);
      if (a <= 0.02) continue;
      this.drawLayout(cd.l, lay, cd.ds, a);
    }
    if (!instant) for (const key of [...this.fade.keys()]) if (!seen.has(key)) { this.fade.delete(key); this.shift.delete(key); }
    (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private charW = new Map<string, number>();
  private charWidth100(ch: string): number {
    let w = this.charW.get(ch);
    if (w === undefined) {
      const ctx = this.ctx;
      (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
      ctx.font = `600 100px ${LABEL_FONT}`;
      w = ctx.measureText(ch).width;
      this.charW.set(ch, w);
    }
    return w;
  }

  /**
   * A realm's name painted on the land: every letter stands on the curve through the realm, turned with it and seen in
   * perspective (each letter lies in a level plane at about the height of the land under the name, so names further away are
   * smaller and foreshortened, and mountains do not shear the letters).
   */
  private layoutLabel(v: OverlayView, l: MapLabel, ds: number, spacing: number, sc: number, shift: number): LabelLayout {
    const nxs = -Math.sin(l.angle) * shift, nys = Math.cos(l.angle) * shift;
    let pts: [number, number][] = l.curve && l.curve.length >= 2 ? l.curve.map(([x, y]) => [x + nxs, y + nys]) : [];
    if (!pts.length) { const c = Math.cos(l.angle), s = Math.sin(l.angle), h = l.size * l.text.length; pts = [[l.x - c * h + nxs, l.y - s * h + nys], [l.x + c * h + nxs, l.y + s * h + nys]]; }
    // the plane of the letters: the mean height of the land along the name
    let hz = 0;
    if (v.heightAt) { for (const [x, y] of pts) hz += v.heightAt(x, y); hz /= pts.length; }
    const P = (x: number, y: number) => (v.toScreenZ ? v.toScreenZ(x, y, hz) : v.toScreen(x, y));
    // read from left to right on screen
    const [x0] = P(pts[0][0], pts[0][1]), [x1] = P(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    if (x1 < x0) pts = pts.slice().reverse();
    const path = new Path2(pts);
    const chars = [...l.text];
    const k = ds / 100;
    const widths = chars.map((ch) => this.charWidth100(ch) * k);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
    // map px per font px: the font size ds stands for ds / sc map px on the ground
    const m = 1 / sc;
    let s = path.total / 2 - (total * m) / 2;
    const e = 0.5;
    const glyphs: Glyph[] = [];
    const centres: [number, number, number, number, number][] = []; // x, y, half width and height on screen, angle
    for (let i = 0; i < chars.length; i++) {
      const w = widths[i] * m;
      const [px, py, tx, ty] = path.at(s + w / 2);
      s += w + spacing * m;
      const [sx, sy] = P(px, py);
      if (sx < -300 || sy < -300 || sx > v.cssW + 300 || sy > v.cssH + 300) continue;
      const [ax, ay] = P(px + tx * e, py + ty * e);
      const [bx, by] = P(px - ty * e, py + tx * e);
      // screen px per font px along the letter's width and height
      const a = ((ax - sx) / e) * m, b = ((ay - sy) / e) * m, c = ((bx - sx) / e) * m, d = ((by - sy) / e) * m;
      centres.push([sx, sy, (widths[i] + spacing) * Math.hypot(a, b) * 0.5, ds * 0.5 * Math.hypot(c, d), Math.atan2(b, a)]);
      if (chars[i] !== ' ') glyphs.push([a, b, c, d, sx, sy, chars[i]]);
    }
    // collision boxes: the name in pieces of three letters, so that a bent name keeps its shape
    const boxes: Placed[] = [];
    for (let i = 0; i < centres.length; i += 3) {
      const g = centres.slice(i, i + 3);
      const f = g[0], z = g[g.length - 1];
      let ux = z[0] - f[0], uy = z[1] - f[1];
      let len = Math.hypot(ux, uy);
      if (len < 1e-3) { ux = Math.cos(f[4]); uy = Math.sin(f[4]); len = 0; } else { ux /= len; uy /= len; }
      const hh = Math.max(...g.map((q) => q[3])) + 2;
      boxes.push({ cx: (f[0] + z[0]) / 2, cy: (f[1] + z[1]) / 2, ux, uy, hw: len / 2 + f[2] + 2, hh });
    }
    return { glyphs, boxes };
  }

  private drawLayout(l: MapLabel, lay: LabelLayout, ds: number, alpha: number) {
    const ctx = this.ctx;
    ctx.font = `600 ${ds.toFixed(1)}px ${LABEL_FONT}`;
    (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
    ctx.globalAlpha = alpha * 0.92;
    ctx.lineWidth = Math.max(2, ds * 0.16);
    ctx.strokeStyle = 'rgba(250, 242, 222, 0.55)';
    ctx.fillStyle = l.color ?? 'rgba(38, 28, 18, 0.95)';
    const dpr = this.dpr;
    for (const g of lay.glyphs) { ctx.setTransform(g[0] * dpr, g[1] * dpr, g[2] * dpr, g[3] * dpr, g[4] * dpr, g[5] * dpr); ctx.strokeText(g[6], 0, 0); }
    for (const g of lay.glyphs) { ctx.setTransform(g[0] * dpr, g[1] * dpr, g[2] * dpr, g[3] * dpr, g[4] * dpr, g[5] * dpr); ctx.fillText(g[6], 0, 0); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
  }

  /** Landmarks: a gilded badge with the building's sign and its stages, the name at close zoom. */
  private drawLandmarks(v: OverlayView) {
    if (v.zoom < 1.3 || !this.landmarks.length) return;
    const ctx = this.ctx;
    const a = Math.min(1, (v.zoom - 1.3) / 0.5);
    const r = Math.max(7, Math.min(11, 6 + v.zoom * 1.2));
    const glyph: Record<string, string> = { church: '✝', mosque: '☪', palace: '♛', fortress: '♜' };
    for (const m of this.landmarks) {
      const [x, y0] = v.toScreen(m.x, m.y); const y = y0 + r * 1.9; // below the place: army counters stand above it
      if (x < -60 || y < -40 || x > v.cssW + 60 || y > v.cssH + 40) continue;
      ctx.save(); ctx.globalAlpha = a;
      ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      const g = ctx.createLinearGradient(x, y - r, x, y + r); g.addColorStop(0, '#f3dc8e'); g.addColorStop(1, '#b8892f');
      ctx.fillStyle = m.tier > 0 ? g : '#cfc4aa'; ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#3a2a14'; ctx.stroke();
      ctx.fillStyle = '#2b1d0c'; ctx.font = `${Math.round(r * 1.2)}px "Segoe UI Symbol", "Noto Sans Symbols", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(glyph[m.kind] ?? '★', x, y + 0.5);
      // stages as pips under the badge (hollow while still to build, pulsing while under way)
      for (let i = 0; i < m.max; i++) {
        const px = x + (i - (m.max - 1) / 2) * 5.5, py = y + r + 4;
        ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2);
        const on = i < m.tier, next = i === m.tier && m.building;
        ctx.fillStyle = on ? '#f0d27a' : next ? `rgba(240, 210, 122, ${0.35 + 0.35 * Math.sin(v.time * 3)})` : 'rgba(30, 22, 12, 0.55)';
        ctx.fill(); ctx.lineWidth = 0.8; ctx.strokeStyle = '#2b1d0c'; ctx.stroke();
      }
      if (v.zoom >= 2.2) {
        ctx.font = `600 italic 12px ${LABEL_FONT}`; ctx.textAlign = 'left';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(245, 236, 214, 0.85)'; ctx.strokeText(m.name, x + r + 4, y);
        ctx.fillStyle = '#3a2410'; ctx.fillText(m.name, x + r + 4, y);
      }
      ctx.restore();
    }
  }

  private drawUnits(v: OverlayView) {
    const ctx = this.ctx;
    const s = Math.max(0.75, Math.min(1.25, 0.85 + 0.15 * Math.log2(Math.max(v.zoom, 0.1))));
    // paths first (under counters)
    for (const u of this.units) {
      if (!u.path || u.path.length === 0) continue;
      const pts: [number, number][] = [v.toScreen(u.x, u.y), ...u.path.map(([x, y]) => v.toScreen(x, y))];
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.setLineDash([7 * s, 5 * s]); ctx.lineDashOffset = -v.time * 18;
      ctx.strokeStyle = 'rgba(20, 16, 12, 0.7)'; ctx.lineWidth = 5 * s;
      this.polyline(pts); ctx.stroke();
      ctx.strokeStyle = u.selected ? 'rgba(255, 226, 140, 0.95)' : 'rgba(245, 238, 220, 0.9)'; ctx.lineWidth = 2.6 * s;
      this.polyline(pts); ctx.stroke();
      ctx.setLineDash([]);
      // arrow head at final point
      const [ex, ey] = pts[pts.length - 1], [px, py] = pts[pts.length - 2];
      const ang = Math.atan2(ey - py, ex - px), hl = 11 * s;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - Math.cos(ang - 0.45) * hl, ey - Math.sin(ang - 0.45) * hl);
      ctx.lineTo(ex - Math.cos(ang + 0.45) * hl, ey - Math.sin(ang + 0.45) * hl);
      ctx.closePath();
      ctx.fillStyle = u.selected ? 'rgba(255, 226, 140, 0.98)' : 'rgba(245, 238, 220, 0.95)';
      ctx.strokeStyle = 'rgba(20, 16, 12, 0.75)'; ctx.lineWidth = 1.5;
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.font = UNIT_FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // zoomed out, counters of one realm that crowd each other merge into one (the larger host keeps its place)
    const merge = v.zoom < 2.4 ? 30 * s : 0;
    // the player's own and selected hosts, battles and sieges claim their place first, then the larger hosts
    const prio = (u: MapUnit) => (u.selected ? 4e9 : 0) + (u.mine ? 2e9 : 0) + (u.kind === 'battle' || u.kind === 'siege' ? 1e9 : 0) + (u.men ?? 0);
    const order = this.units.map((u, i) => i).sort((a, b) => prio(this.units[b]) - prio(this.units[a]));
    const shown: { u: MapUnit; sx: number; sy: number; men: number; n: number; pip: boolean }[] = [];
    for (const i of order) {
      const u = this.units[i];
      let [sx, sy] = v.toScreen(u.x, u.y);
      // figures on the map: the counter floats above them
      if (u.fx !== undefined && u.fy !== undefined && v.toScreenH && v.scaleAt && (u.kind === 'army' || u.kind === 'fleet') && v.scaleAt(u.fx, u.fy) >= (v.figuresFrom ?? Infinity)) {
        [sx, sy] = v.toScreenH(u.fx, u.fy, u.kind === 'fleet' ? 4.2 : 4.6);
      }
      if (sx < -60 || sy < -60 || sx > v.cssW + 60 || sy > v.cssH + 60) continue;
      if (merge && !u.selected && (u.kind === 'army' || u.kind === 'fleet') && u.owner !== undefined) {
        const near = shown.find((p) => p.u.kind === u.kind && p.u.owner === u.owner && !p.u.selected && Math.abs(p.sx - sx) < merge && Math.abs(p.sy - sy) < merge * 0.8);
        if (near) { near.men += u.men ?? 0; near.n++; continue; }
      }
      // a counter that would cover another one shrinks to a small flag
      // so does a small host of a realm at peace, idle at home, unless the map is close
      const idle = (u.kind === 'army' || u.kind === 'fleet') && !u.hot && (u.men ?? 0) < (u.kind === 'fleet' ? 15 : 5000) && v.zoom < 5;
      const pip = !u.selected && !u.mine && (idle || (v.zoom < 6 && shown.some((p) => !p.pip && Math.abs(p.sx - sx) < 54 * s && Math.abs(p.sy - sy) < 22 * s)));
      shown.push({ u, sx, sy, men: u.men ?? 0, n: 1, pip });
    }
    // draw from the back (top of the screen) to the front
    shown.sort((a, b) => a.sy - b.sy);
    for (const p of shown) if (p.pip) this.pip(p.u, p.sx, p.sy, s);
    for (const p of shown) {
      if (p.pip) continue;
      const u = p.n > 1 ? { ...p.u, label: fmtMen(p.u, p.men) + (p.n > 1 ? ` ·${p.n}` : '') } : p.u;
      ctx.save();
      ctx.translate(p.sx, p.sy); ctx.scale(s, s);
      this.counter(u, v.time);
      ctx.restore();
    }
  }

  /** a small flag in the realm's colour on a pin, for a host whose counter would cover another */
  private pip(u: MapUnit, x: number, y: number, s: number) {
    const ctx = this.ctx;
    const [r, g, b] = u.color;
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.strokeStyle = 'rgba(25,20,14,0.8)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -12); ctx.stroke();
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(9, -9.5); ctx.lineTo(0, -6.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (u.kind === 'battle') { ctx.fillStyle = 'rgba(255,150,40,0.9)'; ctx.beginPath(); ctx.arc(0, -3, 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  private polyline(pts: [number, number][]) {
    const ctx = this.ctx;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  }

  private counter(u: MapUnit, time: number) {
    const ctx = this.ctx;
    const [r, g, b] = u.color;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const fill = `rgb(${r},${g},${b})`;
    const dark = `rgb(${Math.round(r * 0.45)},${Math.round(g * 0.45)},${Math.round(b * 0.45)})`;
    ctx.font = UNIT_FONT;
    const tw = Math.max(18, ctx.measureText(u.label).width + 8);
    const w = tw + 20, h = 20, x0 = -w / 2, y0 = -h - 6; // counter stands above its anchor point
    // anchor stem + shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    this.rrect(x0 + 2, y0 + 3, w, h, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(25,20,14,0.85)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, y0 + h); ctx.lineTo(0, 0); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, Math.PI * 2); ctx.fillStyle = 'rgba(25,20,14,0.9)'; ctx.fill();
    if (u.selected) {
      ctx.save();
      ctx.shadowColor = 'rgba(255, 215, 110, 0.95)'; ctx.shadowBlur = 10;
      ctx.fillStyle = 'rgba(255, 215, 110, 0.9)';
      this.rrect(x0 - 2.5, y0 - 2.5, w + 5, h + 5, 6); ctx.fill();
      ctx.restore();
    }
    // body: parchment number plate + colour flag
    const grad = ctx.createLinearGradient(0, y0, 0, y0 + h);
    grad.addColorStop(0, '#f4ead2'); grad.addColorStop(1, '#d9c9a3');
    ctx.fillStyle = grad;
    this.rrect(x0, y0, w, h, 4); ctx.fill();
    ctx.save();
    this.rrect(x0, y0, w, h, 4); ctx.clip();
    ctx.fillStyle = fill; ctx.fillRect(x0, y0, 18, h);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x0, y0, 18, h / 2);
    ctx.restore();
    ctx.strokeStyle = u.selected ? '#6b4a10' : dark; ctx.lineWidth = 1.4;
    this.rrect(x0, y0, w, h, 4); ctx.stroke();
    // kind glyph on the flag
    const gx = x0 + 9, gy = y0 + h / 2;
    const ink = lum > 0.6 ? 'rgba(30,22,14,0.95)' : 'rgba(255,250,238,0.95)';
    ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    switch (u.kind) {
      case 'army': // crossed pikes
        ctx.beginPath(); ctx.moveTo(gx - 5, gy + 5); ctx.lineTo(gx + 5, gy - 5); ctx.moveTo(gx + 5, gy + 5); ctx.lineTo(gx - 5, gy - 5); ctx.stroke();
        break;
      case 'fleet': // hull + mast + sail
        ctx.beginPath(); ctx.moveTo(gx - 6, gy + 2); ctx.lineTo(gx + 6, gy + 2); ctx.lineTo(gx + 3.5, gy + 5.5); ctx.lineTo(gx - 3.5, gy + 5.5); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(gx, gy + 2); ctx.lineTo(gx, gy - 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(gx + 0.8, gy - 5.5); ctx.lineTo(gx + 5, gy - 0.5); ctx.lineTo(gx + 0.8, gy - 0.5); ctx.closePath(); ctx.fill();
        break;
      case 'siege': // tower battlements
        ctx.beginPath();
        ctx.moveTo(gx - 5, gy + 6); ctx.lineTo(gx - 5, gy - 4); ctx.lineTo(gx - 3, gy - 4); ctx.lineTo(gx - 3, gy - 6); ctx.lineTo(gx - 1, gy - 6); ctx.lineTo(gx - 1, gy - 4);
        ctx.lineTo(gx + 1, gy - 4); ctx.lineTo(gx + 1, gy - 6); ctx.lineTo(gx + 3, gy - 6); ctx.lineTo(gx + 3, gy - 4); ctx.lineTo(gx + 5, gy - 4); ctx.lineTo(gx + 5, gy + 6); ctx.closePath();
        ctx.fill();
        break;
      case 'battle': { // crossed swords with pulsing burst
        const pulse = 0.5 + 0.5 * Math.sin(time * 6);
        ctx.save();
        ctx.fillStyle = `rgba(255, ${Math.round(120 + 80 * pulse)}, 40, ${0.55 + 0.35 * pulse})`;
        ctx.beginPath();
        for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? 4 : 8.5; ctx.lineTo(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.strokeStyle = 'rgba(25,18,10,0.95)'; ctx.lineWidth = 1.7;
        ctx.beginPath(); ctx.moveTo(gx - 5, gy + 5); ctx.lineTo(gx + 5, gy - 5); ctx.moveTo(gx + 5, gy + 5); ctx.lineTo(gx - 5, gy - 5); ctx.stroke();
        break;
      }
    }
    // strength label
    ctx.fillStyle = '#2a2014';
    ctx.fillText(u.label, x0 + 18 + (w - 18) / 2, y0 + h / 2 + 0.5);
    if (u.moving) {
      ctx.fillStyle = 'rgba(42,32,20,0.9)';
      const mx = x0 + w + 3;
      ctx.beginPath(); ctx.moveTo(mx, y0 + 5); ctx.lineTo(mx + 5, y0 + h / 2); ctx.lineTo(mx, y0 + h - 5); ctx.closePath(); ctx.fill();
    }
  }

  private rrect(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  destroy() { this.canvas.remove(); }
}
