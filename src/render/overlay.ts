// 2D canvas overlay: labels and unit counters, positioned with the map camera.

export interface MapLabel { text: string; x: number; y: number; angle: number; size: number; color?: string }
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

export class Overlay {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  labels: MapLabel[] = [];
  units: MapUnit[] = [];
  private dpr = 1;

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
    this.drawUnits(v);
  }

  /** draw onto a foreign context (for screenshots) */
  drawTo(ctx: CanvasRenderingContext2D, v: OverlayView, scale: number) {
    const saved = this.ctx; const savedDpr = this.dpr;
    this.ctx = ctx; this.dpr = scale;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.drawLabels(v); this.drawUnits(v);
    this.ctx = saved; this.dpr = savedDpr;
  }

  private drawLabels(v: OverlayView) {
    const ctx = this.ctx;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const l of this.labels) {
      const fs = l.size * v.zoom;
      if (fs < 6 || fs > 220) continue;
      const a = Math.min(1, (fs - 6) / 5) * Math.min(1, (220 - fs) / 80);
      if (a <= 0.02) continue;
      const [sx, sy] = v.toScreen(l.x, l.y);
      const reach = fs * Math.max(4, l.text.length) * 0.8;
      if (sx < -reach || sy < -reach || sx > v.cssW + reach || sy > v.cssH + reach) continue;
      ctx.save();
      ctx.translate(sx, sy); ctx.rotate(l.angle);
      ctx.globalAlpha = a * 0.92;
      ctx.font = `600 ${fs.toFixed(1)}px ${LABEL_FONT}`;
      const spacing = fs > 18 ? fs * 0.18 : fs * 0.06;
      (ctx as unknown as { letterSpacing: string }).letterSpacing = spacing.toFixed(1) + 'px';
      ctx.lineWidth = Math.max(2, fs * 0.16);
      ctx.strokeStyle = 'rgba(250, 242, 222, 0.55)';
      ctx.strokeText(l.text, 0, 0);
      ctx.fillStyle = l.color ?? 'rgba(38, 28, 18, 0.95)';
      ctx.fillText(l.text, 0, 0);
      ctx.restore();
    }
    (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
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
