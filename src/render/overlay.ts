// 2D canvas overlay: labels and unit counters, positioned with the map camera.

/**
 * size: font size in map px (on screen it is size × zoom). weight: priority when labels collide (e.g. the realm's area).
 * id: stable key for fading in and out (e.g. the nation id). room: how far (map px) the name may move across its own
 * direction, still inside the realm, to make way for a name that would otherwise hide it.
 */
export interface MapLabel { text: string; x: number; y: number; angle: number; size: number; color?: string; weight?: number; id?: number; room?: number }
export interface MapLandmark { x: number; y: number; name: string; kind: string; tier: number; max: number; building: boolean }
export type UnitKind = 'army' | 'fleet' | 'siege' | 'battle';
export interface MapUnit {
  id: number; x: number; y: number; color: [number, number, number]; label: string; kind: UnitKind;
  selected?: boolean; moving?: boolean; path?: [number, number][];
}

export interface OverlayView {
  /** map px -> css px (canvas-local) */
  toScreen(x: number, y: number): [number, number];
  zoom: number; cssW: number; cssH: number; time: number;
}

const LABEL_FONT = `"Cormorant Garamond", "EB Garamond", Garamond, Georgia, "Times New Roman", serif`;
const UNIT_FONT = `600 11px system-ui, "Segoe UI", Roboto, sans-serif`;
// Label sizes on screen (css px): hidden below MIN, never drawn larger than MAX; labels that would be much larger fade to a watermark.
const LABEL_MIN = 7, LABEL_FULL = 10, LABEL_MAX = 64, LABEL_FADE_FROM = 70, LABEL_FADE_TO = 150, LABEL_FLOOR = 0.22;

interface Placed { cx: number; cy: number; ux: number; uy: number; hw: number; hh: number }
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
    type Cand = { l: MapLabel; key: number | string; fs: number; ds: number; spacing: number; alpha: number; tier: number; box: Placed; sx: number; sy: number };
    const cands: Cand[] = [];
    for (let i = 0; i < this.labels.length; i++) {
      const l = this.labels[i];
      const fs = l.size * v.zoom;
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
      const c = Math.cos(l.angle), s = Math.sin(l.angle);
      cands.push({ l, key, fs, ds, spacing, alpha, tier: fs > LABEL_FADE_FROM ? 1 : 0, box: { cx: sx, cy: sy, ux: c, uy: s, hw, hh }, sx, sy });
    }
    // legible names first (larger realms first), then oversized ones (least oversized first);
    // a name is shown only where it does not cover one already placed
    cands.sort((a, b) => a.tier - b.tier || (a.tier ? a.fs - b.fs : (b.l.weight ?? b.fs) - (a.l.weight ?? a.fs)));
    const placed: Placed[] = [];
    const k = 1 - Math.exp(-dt * 7);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const seen = new Set<number | string>();
    const fits = (b: Placed) => {
      for (const p of placed) {
        if (Math.abs(p.cx - b.cx) > p.hw + p.hh + b.hw + b.hh || Math.abs(p.cy - b.cy) > p.hw + p.hh + b.hw + b.hh) continue;
        if (obbOverlap(p, b)) return false;
      }
      return true;
    };
    for (const cd of cands) {
      // a name that is covered tries a few places across its direction (within its realm), the last one used first
      const l0 = cd.l, room = l0.room ?? 0;
      const tries = [this.shift.get(cd.key) ?? 0, 0];
      if (room > 0) { const step = cd.box.hh * 1.1 / v.zoom; for (let j = 1; j <= 6 && j * step <= room; j++) tries.push(j * step, -j * step); }
      let b = cd.box, free = false, used = 0;
      for (const d of tries) {
        if (Math.abs(d) > room) continue;
        let tb = cd.box;
        if (d) { const [tx, ty] = v.toScreen(l0.x - Math.sin(l0.angle) * d, l0.y + Math.cos(l0.angle) * d); tb = { ...cd.box, cx: tx, cy: ty }; }
        if (fits(tb)) { b = tb; free = true; used = d; break; }
      }
      if (free) { placed.push(b); cd.sx = b.cx; cd.sy = b.cy; if (!instant) { if (used) this.shift.set(cd.key, used); else this.shift.delete(cd.key); } }
      const target = free ? cd.alpha : 0;
      const cur = instant ? target : (this.fade.get(cd.key) ?? 0);
      const a = instant ? target : cur + (target - cur) * k;
      seen.add(cd.key);
      if (!instant) this.fade.set(cd.key, a);
      if (a <= 0.02) continue;
      const { l, ds, spacing } = cd;
      ctx.save();
      ctx.translate(cd.sx, cd.sy); ctx.rotate(l.angle);
      ctx.globalAlpha = a * 0.92;
      ctx.font = `600 ${ds.toFixed(1)}px ${LABEL_FONT}`;
      (ctx as unknown as { letterSpacing: string }).letterSpacing = spacing.toFixed(1) + 'px';
      ctx.lineWidth = Math.max(2, ds * 0.16);
      ctx.strokeStyle = 'rgba(250, 242, 222, 0.55)';
      ctx.strokeText(l.text, 0, 0);
      ctx.fillStyle = l.color ?? 'rgba(38, 28, 18, 0.95)';
      ctx.fillText(l.text, 0, 0);
      ctx.restore();
    }
    if (!instant) for (const key of [...this.fade.keys()]) if (!seen.has(key)) { this.fade.delete(key); this.shift.delete(key); }
    (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
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
    for (const u of this.units) {
      const [sx, sy] = v.toScreen(u.x, u.y);
      if (sx < -60 || sy < -60 || sx > v.cssW + 60 || sy > v.cssH + 60) continue;
      ctx.save();
      ctx.translate(sx, sy); ctx.scale(s, s);
      this.counter(u, v.time);
      ctx.restore();
    }
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
