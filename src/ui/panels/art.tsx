// Procedural woodcut-style vignettes for events: parchment ground, ink lines and hatching.
// Every scene is composed from a few drawn elements, varied by a seed so repeated events look different.
import { memo } from 'preact/compat';

const INK = '#2a1c10', PAPER = '#efe0bb', PAPER2 = '#e2cd9c', RED = '#9b2a20', GOLD = '#c9962e', BLUE = '#3a5a80';
const W = 520, H = 190;

function rng(seed: number) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ---------------------------------------------------------------- elements
const P = (d: string, fill = 'none', sw = 1.4, extra: any = {}) => <path d={d} fill={fill} stroke={INK} stroke-width={sw} stroke-linejoin="round" stroke-linecap="round" {...extra} />;

function Sun({ x, y, r = 16 }: { x: number; y: number; r?: number }) {
  return <g>{Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2; const r2 = r * (i % 2 ? 1.5 : 1.9); return <line x1={x + Math.cos(a) * r * 1.15} y1={y + Math.sin(a) * r * 1.15} x2={x + Math.cos(a) * r2} y2={y + Math.sin(a) * r2} stroke={INK} stroke-width={1.1} />; })}
    <circle cx={x} cy={y} r={r} fill={PAPER} stroke={INK} stroke-width={1.4} /><circle cx={x} cy={y} r={r} fill="url(#ah-dots)" /></g>;
}
function Moon({ x, y }: { x: number; y: number }) { return <path d={`M${x},${y - 14} A14,14 0 1,0 ${x},${y + 14} A10,10 0 1,1 ${x},${y - 14} Z`} fill={PAPER} stroke={INK} stroke-width={1.3} />; }
function Cloud({ x, y, s = 1, dark = false }: { x: number; y: number; s?: number; dark?: boolean }) {
  const d = `M${x},${y} c${-14 * s},0 ${-16 * s},${-14 * s} ${-2 * s},${-16 * s} c${2 * s},${-12 * s} ${20 * s},${-14 * s} ${26 * s},${-4 * s} c${8 * s},${-8 * s} ${24 * s},${-2 * s} ${20 * s},${8 * s} c${12 * s},${0} ${14 * s},${12 * s} ${2 * s},${12 * s} Z`;
  return <g>{P(d, dark ? 'url(#ah-cross)' : PAPER, 1.2)}{!dark && P(`M${x + 4 * s},${y - 4 * s} q${10 * s},${-6 * s} ${22 * s},0`, 'none', 0.8)}</g>;
}
function Bird({ x, y, s = 1 }: { x: number; y: number; s?: number }) { return P(`M${x - 6 * s},${y} q${3 * s},${-4 * s} ${6 * s},0 q${3 * s},${-4 * s} ${6 * s},0`, 'none', 1.1); }
function Hills({ y, seed, amp = 14, fill = 'url(#ah-hatch)' }: { y: number; seed: number; amp?: number; fill?: string }) {
  const r = rng(seed); let d = `M0,${H} L0,${y}`; let x = 0;
  while (x < W) { const nx = x + 60 + r() * 70; const ny = y - r() * amp; d += ` Q${(x + nx) / 2},${ny - amp * 0.8} ${nx},${y + (r() - 0.5) * amp * 0.6}`; x = nx; }
  d += ` L${W},${H} Z`;
  return P(d, fill, 1.3);
}
function Ground({ y }: { y: number }) { return <g>{P(`M0,${y} L${W},${y} L${W},${H} L0,${H} Z`, 'url(#ah-hatch)', 1.2)}{P(`M0,${y} L${W},${y}`, 'none', 1.6)}</g>; }
function House({ x, y, w, h, roof = 'gable', door = true }: { x: number; y: number; w: number; h: number; roof?: string; door?: boolean }) {
  const top = y - h;
  return <g>
    {P(`M${x},${y} L${x},${top} L${x + w},${top} L${x + w},${y} Z`, PAPER2)}
    {roof === 'gable' ? P(`M${x - 3},${top} L${x + w / 2},${top - w * 0.6} L${x + w + 3},${top} Z`, 'url(#ah-hatch2)') : P(`M${x - 2},${top} L${x + w + 2},${top} L${x + w - 3},${top - 6} L${x + 3},${top - 6} Z`, 'url(#ah-hatch2)')}
    {P(`M${x + w * 0.25},${top + h * 0.25} h${w * 0.18} v${h * 0.2} h${-w * 0.18} Z`, INK, 0.6)}
    {w > 18 && P(`M${x + w * 0.6},${top + h * 0.25} h${w * 0.18} v${h * 0.2} h${-w * 0.18} Z`, INK, 0.6)}
    {door && P(`M${x + w * 0.4},${y} v${-h * 0.32} q${w * 0.1},${-w * 0.12} ${w * 0.2},0 v${h * 0.32}`, INK, 0.6)}
  </g>;
}
function Spire({ x, y, h = 70 }: { x: number; y: number; h?: number }) {
  return <g>
    {P(`M${x - 9},${y} L${x - 9},${y - h * 0.6} L${x + 9},${y - h * 0.6} L${x + 9},${y} Z`, PAPER2)}
    {P(`M${x - 11},${y - h * 0.6} L${x},${y - h} L${x + 11},${y - h * 0.6} Z`, 'url(#ah-hatch2)')}
    {P(`M${x},${y - h} v-8 M${x - 4},${y - h - 5} h8`, 'none', 1.2)}
    {P(`M${x - 3},${y - h * 0.45} v8 h6 v-8 q-3,-4 -6,0`, INK, 0.5)}
  </g>;
}
function Town({ x, y, w, seed, spire = true }: { x: number; y: number; w: number; seed: number; spire?: boolean }) {
  const r = rng(seed); const items = []; let cx = x;
  const sp = spire ? x + w * (0.35 + r() * 0.3) : -999;
  while (cx < x + w) { const hw = 14 + r() * 16, hh = 16 + r() * 22; if (Math.abs(cx + hw / 2 - sp) < 16) { items.push(<Spire x={sp} y={y} h={70 + r() * 20} />); cx += 22; continue; } items.push(<House x={cx} y={y} w={hw} h={hh} roof={r() > 0.25 ? 'gable' : 'flat'} door={r() > 0.4} />); cx += hw + 2 + r() * 4; }
  return <g>{items}</g>;
}
function Castle({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const t = (cx: number, w: number, h: number) => <g>{P(`M${cx - w / 2},${y} V${y - h} h${w / 5} v-5 h${w / 5} v5 h${w / 5} v-5 h${w / 5} v5 h${w / 5} V${y} Z`, PAPER2)}{P(`M${cx - 2},${y - h + 10} v8 h4 v-8 Z`, INK, 0.5)}</g>;
  return <g>{P(`M${x - 40 * s},${y} V${y - 30 * s} H${x + 40 * s} V${y} Z`, 'url(#ah-brick)')}{t(x - 40 * s, 18 * s, 50 * s)}{t(x + 40 * s, 18 * s, 50 * s)}{t(x, 26 * s, 70 * s)}
    {P(`M${x - 8 * s},${y} v${-16 * s} q${8 * s},${-10 * s} ${16 * s},0 v${16 * s}`, INK, 0.6)}{P(`M${x},${y - 70 * s} v-14 l12,4 l-12,4`, RED, 1)}</g>;
}
function Cathedral({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const tw = (cx: number) => <g>{P(`M${cx - 14 * s},${y} V${y - 92 * s} H${cx + 14 * s} V${y} Z`, PAPER2)}{P(`M${cx - 16 * s},${y - 92 * s} L${cx},${y - 130 * s} L${cx + 16 * s},${y - 92 * s} Z`, 'url(#ah-hatch2)')}
    {P(`M${cx - 4 * s},${y - 70 * s} v${16 * s} h${8 * s} v${-16 * s} q${-4 * s},${-6 * s} ${-8 * s},0`, INK, 0.5)}{P(`M${cx},${y - 130 * s} v-10 M${cx - 4},${y - 136 * s} h8`, 'none', 1.2)}</g>;
  return <g>
    {P(`M${x - 34 * s},${y} V${y - 70 * s} L${x},${y - 96 * s} L${x + 34 * s},${y - 70 * s} V${y} Z`, PAPER2)}
    {tw(x - 46 * s)}{tw(x + 46 * s)}
    <circle cx={x} cy={y - 62 * s} r={13 * s} fill={PAPER} stroke={INK} stroke-width={1.3} />
    {Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return <line x1={x} y1={y - 62 * s} x2={x + Math.cos(a) * 13 * s} y2={y - 62 * s + Math.sin(a) * 13 * s} stroke={INK} stroke-width={0.8} />; })}
    {P(`M${x - 12 * s},${y} V${y - 26 * s} Q${x},${y - 44 * s} ${x + 12 * s},${y - 26 * s} V${y}`, INK, 0.6)}
  </g>;
}
function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return <g>{P(`M${x - 2 * s},${y} L${x - 1 * s},${y - 18 * s} L${x + 1 * s},${y - 18 * s} L${x + 2 * s},${y} Z`, INK, 0.8)}
    {P(`M${x},${y - 46 * s} c${-16 * s},${2 * s} ${-18 * s},${18 * s} ${-10 * s},${26 * s} c${-4 * s},${6 * s} ${6 * s},${10 * s} ${10 * s},${4 * s} c${6 * s},${6 * s} ${16 * s},${0} ${12 * s},${-6 * s} c${8 * s},${-8 * s} ${4 * s},${-24 * s} ${-12 * s},${-24 * s} Z`, 'url(#ah-hatch)')}</g>;
}
function Figure({ x, y, s = 1, crown = false, hood = false, item, flip = false, robe = PAPER2 }: { x: number; y: number; s?: number; crown?: boolean; hood?: boolean; item?: 'staff' | 'fork' | 'torch' | 'sword' | 'book' | 'sickle' | 'spear' | 'banner'; flip?: boolean; robe?: string }) {
  const k = flip ? -1 : 1; const hy = y - 52 * s;
  return <g>
    {P(`M${x - 12 * s},${y} L${x - 7 * s},${y - 40 * s} Q${x},${y - 46 * s} ${x + 7 * s},${y - 40 * s} L${x + 12 * s},${y} Z`, robe)}
    {P(`M${x - 8 * s},${y - 22 * s} L${x + 8 * s},${y - 22 * s}`, 'none', 0.7)}
    {hood ? P(`M${x - 7 * s},${hy + 8 * s} Q${x - 8 * s},${hy - 8 * s} ${x},${hy - 9 * s} Q${x + 8 * s},${hy - 8 * s} ${x + 7 * s},${hy + 8 * s} Z`, INK) : <circle cx={x} cy={hy} r={6 * s} fill={PAPER} stroke={INK} stroke-width={1.2} />}
    {crown && P(`M${x - 6 * s},${hy - 5 * s} l${1 * s},${-7 * s} l${2.5 * s},${4 * s} l${2.5 * s},${-6 * s} l${2.5 * s},${6 * s} l${2.5 * s},${-4 * s} l${1 * s},${7 * s} Z`, GOLD, 1)}
    {P(`M${x + 5 * s * k},${y - 36 * s} L${x + 14 * s * k},${y - 26 * s}`, 'none', 1.4)}
    {item === 'staff' && P(`M${x + 14 * s * k},${y} L${x + 14 * s * k},${y - 62 * s} m${-3 * s},0 q${3 * s},${-8 * s} ${6 * s},0`, 'none', 1.6)}
    {item === 'spear' && P(`M${x + 14 * s * k},${y} L${x + 14 * s * k},${y - 74 * s} l${-3 * s},${6 * s} m${3 * s},${-6 * s} l${3 * s},${6 * s}`, 'none', 1.4)}
    {item === 'fork' && P(`M${x + 14 * s * k},${y} L${x + 14 * s * k},${y - 64 * s} m${-5 * s},0 v${-10 * s} m${5 * s},${10 * s} v${-12 * s} m${5 * s},${12 * s} v${-10 * s} m${-10 * s},${10 * s} h${10 * s}`, 'none', 1.3)}
    {item === 'torch' && <g>{P(`M${x + 14 * s * k},${y - 14 * s} L${x + 16 * s * k},${y - 58 * s}`, 'none', 2)}<Flame x={x + 16 * s * k} y={y - 58 * s} s={0.5 * s} /></g>}
    {item === 'sword' && P(`M${x + 14 * s * k},${y - 26 * s} L${x + 30 * s * k},${y - 64 * s} M${x + 10 * s * k},${y - 34 * s} L${x + 20 * s * k},${y - 28 * s}`, 'none', 1.6)}
    {item === 'book' && P(`M${x + 8 * s * k},${y - 30 * s} l${10 * s * k},${-3 * s} l${0},${8 * s} l${-10 * s * k},${3 * s} Z`, RED, 1)}
    {item === 'sickle' && P(`M${x + 14 * s * k},${y - 24 * s} q${12 * s * k},${-14 * s} ${4 * s * k},${-24 * s}`, 'none', 1.6)}
    {item === 'banner' && <g>{P(`M${x + 14 * s * k},${y} L${x + 14 * s * k},${y - 80 * s}`, 'none', 1.5)}{P(`M${x + 14 * s * k},${y - 80 * s} h${18 * s * k} l${-5 * s * k},${8 * s} l${5 * s * k},${8 * s} h${-18 * s * k} Z`, RED, 1)}</g>}
  </g>;
}
function Flame({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return <g>{P(`M${x},${y} c${-14 * s},${-10 * s} ${-8 * s},${-26 * s} ${-2 * s},${-40 * s} c${2 * s},${10 * s} ${8 * s},${10 * s} ${8 * s},${18 * s} c${4 * s},${-6 * s} ${4 * s},${-12 * s} ${2 * s},${-18 * s} c${12 * s},${12 * s} ${12 * s},${32 * s} ${-8 * s},${40 * s} Z`, '#d9822b', 1.2)}
    {P(`M${x},${y - 4 * s} c${-6 * s},${-6 * s} ${-3 * s},${-14 * s} ${0},${-20 * s} c${4 * s},${8 * s} ${6 * s},${14 * s} ${0},${20 * s} Z`, '#f1c25a', 0.8)}</g>;
}
function Cog({ x, y, s = 1, tilt = 0 }: { x: number; y: number; s?: number; tilt?: number }) {
  return <g transform={`rotate(${tilt},${x},${y})`}>
    {P(`M${x - 46 * s},${y - 14 * s} L${x + 46 * s},${y - 14 * s} Q${x + 40 * s},${y + 6 * s} ${x + 22 * s},${y + 8 * s} L${x - 26 * s},${y + 8 * s} Q${x - 42 * s},${y + 4 * s} ${x - 46 * s},${y - 14 * s} Z`, 'url(#ah-hatch2)')}
    {P(`M${x - 46 * s},${y - 14 * s} v${-10 * s} h${16 * s} v${10 * s} M${x + 46 * s},${y - 14 * s} v${-12 * s} h${-14 * s} v${12 * s}`, PAPER2, 1.2)}
    {P(`M${x},${y - 14 * s} V${y - 92 * s}`, 'none', 1.8)}
    {P(`M${x - 26 * s},${y - 84 * s} Q${x},${y - 88 * s} ${x + 26 * s},${y - 84 * s} Q${x + 32 * s},${y - 56 * s} ${x + 26 * s},${y - 30 * s} Q${x},${y - 34 * s} ${x - 26 * s},${y - 30 * s} Q${x - 20 * s},${y - 56 * s} ${x - 26 * s},${y - 84 * s} Z`, PAPER)}
    {P(`M${x - 8 * s},${y - 70 * s} h${16 * s} M${x},${y - 78 * s} v${30 * s}`, 'none', 2.4, { stroke: RED })}
    {P(`M${x},${y - 92 * s} l${18 * s},${4 * s} l${-18 * s},${4 * s}`, RED, 1)}
  </g>;
}
function Waves({ y, rough = 1, seed = 1 }: { y: number; rough?: number; seed?: number }) {
  const r = rng(seed); const rows = [];
  for (let k = 0; k < 4; k++) { let d = ''; const yy = y + k * 12; for (let x = -10; x < W + 20; x += 26) { const a = (6 + r() * 4) * rough; d += `M${x},${yy} q${7},${-a} ${13},0 q${7},${a * 0.6} ${13},0 `; } rows.push(P(d, 'none', 1.1)); }
  return <g>{P(`M0,${y} L${W},${y} L${W},${H} L0,${H} Z`, 'url(#ah-wave)', 0)}{rows}</g>;
}
function Cross({ x, y, s = 1 }: { x: number; y: number; s?: number }) { return P(`M${x},${y} v${-22 * s} M${x - 7 * s},${y - 15 * s} h${14 * s}`, 'none', 2); }
function Sheaf({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const st = Array.from({ length: 9 }, (_, i) => { const a = (i - 4) * 0.12; return P(`M${x},${y} L${x + Math.sin(a) * 36 * s},${y - 36 * s}`, 'none', 0.9); });
  return <g>{st}{Array.from({ length: 9 }, (_, i) => { const a = (i - 4) * 0.12; return <ellipse cx={x + Math.sin(a) * 38 * s} cy={y - 38 * s} rx={2 * s} ry={5 * s} transform={`rotate(${a * 57},${x + Math.sin(a) * 38 * s},${y - 38 * s})`} fill={GOLD} stroke={INK} stroke-width={0.7} />; })}
    {P(`M${x - 6 * s},${y - 14 * s} h${12 * s}`, 'none', 2)}</g>;
}
function Banner({ x, y, h = 70, color = RED, flip = false }: { x: number; y: number; h?: number; color?: string; flip?: boolean }) {
  const k = flip ? -1 : 1;
  return <g>{P(`M${x},${y} V${y - h}`, 'none', 1.6)}{P(`M${x},${y - h} c${10 * k},4 ${20 * k},-4 ${30 * k},0 l${-6 * k},10 l${6 * k},10 c${-10 * k},-4 ${-20 * k},4 ${-30 * k},0 Z`, color, 1.1)}</g>;
}
function Smoke({ x, y, s = 1 }: { x: number; y: number; s?: number }) { return <g opacity={0.9}>{[0, 1, 2].map((i) => <circle cx={x + i * 8 * s} cy={y - i * 16 * s} r={(8 + i * 4) * s} fill="url(#ah-cross)" stroke={INK} stroke-width={0.8} />)}</g>; }
function Bolt({ x, y }: { x: number; y: number }) { return P(`M${x},${y} l-10,26 l9,-2 l-12,30 l22,-36 l-9,2 l10,-20 Z`, '#f1d36a', 1.1); }
function Rays({ x, y, r = 60 }: { x: number; y: number; r?: number }) { return <g>{Array.from({ length: 24 }, (_, i) => { const a = Math.PI + (i / 23) * Math.PI; return <line x1={x + Math.cos(a) * 18} y1={y + Math.sin(a) * 18} x2={x + Math.cos(a) * r} y2={y + Math.sin(a) * r} stroke={INK} stroke-width={i % 2 ? 0.6 : 1.1} />; })}</g>; }
function BigCrown({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return <g>{P(`M${x - 26 * s},${y} L${x - 30 * s},${y - 30 * s} L${x - 14 * s},${y - 16 * s} L${x},${y - 38 * s} L${x + 14 * s},${y - 16 * s} L${x + 30 * s},${y - 30 * s} L${x + 26 * s},${y} Z`, GOLD, 1.4)}
    {P(`M${x - 27 * s},${y} h${54 * s} v${8 * s} h${-54 * s} Z`, GOLD, 1.4)}{[-30, 0, 30].map((dx) => <circle cx={x + dx * s} cy={y - (dx ? 32 : 41) * s} r={3.5 * s} fill={PAPER} stroke={INK} stroke-width={1} />)}
    {[-14, 0, 14].map((dx) => <circle cx={x + dx * s} cy={y + 4 * s} r={2 * s} fill={RED} stroke={INK} stroke-width={0.6} />)}</g>;
}
function Book({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return <g>{P(`M${x},${y} q${-24 * s},${-8 * s} ${-48 * s},0 l${0},${-30 * s} q${24 * s},${-8 * s} ${48 * s},0 q${24 * s},${-8 * s} ${48 * s},0 l0,${30 * s} q${-24 * s},${-8 * s} ${-48 * s},0 Z`, PAPER, 1.3)}
    {P(`M${x},${y} v${-30 * s}`, 'none', 1)}{[0, 1, 2, 3, 4].map((i) => P(`M${x - 40 * s},${y - (24 - i * 5) * s} q${18 * s},${-5 * s} ${34 * s},0 M${x + 6 * s},${y - (24 - i * 5) * s} q${18 * s},${-5 * s} ${34 * s},0`, 'none', 0.5))}</g>;
}
function Candle({ x, y }: { x: number; y: number }) { return <g>{P(`M${x - 4},${y} v-26 h8 v26 Z`, PAPER, 1.1)}{P(`M${x - 10},${y} h20`, 'none', 2)}<Flame x={x} y={y - 26} s={0.32} /></g>; }
function Arch({ x, y, w, h }: { x: number; y: number; w: number; h: number }) { return P(`M${x},${y} V${y - h} Q${x + w / 2},${y - h - w * 0.7} ${x + w},${y - h} V${y}`, 'none', 2); }
function Scales({ x, y }: { x: number; y: number }) { return <g>{P(`M${x},${y} v-50 M${x - 30},${y - 44} h60 M${x - 30},${y - 44} l-10,20 h20 Z M${x + 30},${y - 44} l-10,20 h20 Z`, 'none', 1.3)}{P(`M${x - 42},${y - 24} q12,8 24,0 Z M${x + 18},${y - 24} q12,8 24,0 Z`, GOLD, 1)}{P(`M${x - 12},${y} h24`, 'none', 2.4)}</g>; }
function Crate({ x, y, s = 1 }: { x: number; y: number; s?: number }) { return P(`M${x},${y} h${22 * s} v${-18 * s} h${-22 * s} Z M${x},${y} l${22 * s},${-18 * s} M${x},${y - 18 * s} l${22 * s},${18 * s}`, PAPER2, 1); }
function Barrel({ x, y }: { x: number; y: number }) { return P(`M${x},${y} q-4,-12 0,-24 h16 q4,12 0,24 Z M${x - 1},${y - 6} h18 M${x - 1},${y - 18} h18`, 'url(#ah-hatch)', 1); }
function Rat({ x, y }: { x: number; y: number }) { return P(`M${x},${y} q6,-8 16,-4 l4,-2 l0,4 q-2,4 -8,4 Z M${x},${y} q-10,2 -16,-4`, INK, 0.8); }
function Swords({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return <g>{[1, -1].map((k) => <g>{P(`M${x - 30 * s * k},${y + 30 * s} L${x + 26 * s * k},${y - 34 * s}`, 'none', 3)}{P(`M${x - 26 * s * k},${y + 18 * s} L${x - 16 * s * k},${y + 28 * s}`, 'none', 2.4)}</g>)}</g>;
}
function Pikes({ x, y, n = 8, seed = 1, flip = false }: { x: number; y: number; n?: number; seed?: number; flip?: boolean }) {
  const r = rng(seed); const k = flip ? -1 : 1;
  return <g>{Array.from({ length: n }, (_, i) => { const xx = x + i * 11 * k, lean = (r() - 0.5) * 10 + 8 * k; return <g>{P(`M${xx},${y} L${xx + lean},${y - 90}`, 'none', 1.1)}{P(`M${xx + lean},${y - 90} l-2,6 l4,0 Z`, INK, 0.6)}<circle cx={xx} cy={y - 8} r={5} fill={PAPER} stroke={INK} stroke-width={1} /></g>; })}
    {P(`M${x - 6 * k},${y + 6} ${Array.from({ length: n }, (_, i) => `L${x + i * 11 * k},${y - 2 + (i % 2) * 3}`).join(' ')} L${x + n * 11 * k},${y + 6} Z`, 'url(#ah-cross)', 1)}</g>;
}

// ---------------------------------------------------------------- scenes
function scene(key: string, seed: number) {
  const r = rng(seed);
  switch (key) {
    case 'plague': return <>
      <rect x={0} y={0} width={W} height={H} fill="url(#ah-cross)" opacity={0.55} />
      <Moon x={430} y={40} />
      <Hills y={140} seed={seed} amp={10} />
      <Town x={40} y={140} w={300} seed={seed + 3} />
      {[0, 1, 2, 3, 4].map((i) => <Cross x={360 + i * 26 + r() * 6} y={168 + (i % 2) * 6} s={0.9} />)}
      {[0, 1, 2].map((i) => <Bird x={120 + i * 40 + r() * 20} y={30 + r() * 20} s={1.1} />)}
      <Rat x={330} y={178} />
      <Ground y={170} />
      <Figure x={300} y={182} s={0.9} hood item="staff" />
    </>;
    case 'court': return <>
      <rect x={0} y={0} width={W} height={H} fill="url(#ah-brick)" opacity={0.35} />
      {[60, 150, 370, 460].map((x) => <g>{P(`M${x - 8},${H} V30 H${x + 8} V${H}`, PAPER2)}{P(`M${x - 12},30 h24 v-6 h-24 Z`, PAPER2)}</g>)}
      {P(`M200,${H} L230,90 H290 L320,${H} Z`, RED, 1.2)}
      {P(`M232,128 V70 Q260,40 288,70 V128 Z`, 'url(#ah-hatch2)', 1.4)}
      <Figure x={260} y={150} s={1.15} crown item="staff" robe={RED} />
      <Banner x={105} y={150} h={110} color={BLUE} /><Banner x={415} y={150} h={110} flip />
      <Figure x={170} y={182} s={0.85} flip /><Figure x={350} y={182} s={0.85} item="book" />
      {P(`M0,182 H${W}`, 'none', 1.6)}
    </>;
    case 'battle': return <>
      <Cloud x={90} y={50} s={1.2} dark /><Cloud x={360} y={40} s={1} dark />
      <Hills y={130} seed={seed} amp={22} />
      <Pikes x={40} y={170} n={9} seed={seed} />
      <Pikes x={480} y={172} n={9} seed={seed + 1} flip />
      <Banner x={30} y={168} h={100} /><Banner x={490} y={168} h={100} color={BLUE} flip />
      <Smoke x={250} y={150} s={1.2} />
      <Swords x={260} y={70} s={1} />
      <Ground y={172} />
    </>;
    case 'church': return <>
      <Sun x={90} y={46} r={14} />
      <Hills y={160} seed={seed} amp={8} />
      <Cathedral x={300} y={168} s={1.05} />
      <Tree x={120} y={170} s={1} /><Tree x={480} y={170} s={0.9} />
      <Figure x={180} y={182} s={0.8} hood item="staff" /><Figure x={420} y={182} s={0.8} flip item="book" />
      {[0, 1, 2].map((i) => <Bird x={400 + i * 22} y={40 + i * 8} />)}
      <Ground y={176} />
    </>;
    case 'trade': return <>
      <Sun x={460} y={40} r={13} />
      <Waves y={140} rough={0.6} seed={seed} />
      <Cog x={360} y={150} s={0.9} />
      {P(`M0,140 H220 V${H} H0 Z`, 'url(#ah-brick)', 1.3)}
      <Crate x={30} y={140} /><Crate x={56} y={140} s={0.8} /><Barrel x={90} y={140} /><Crate x={40} y={122} s={0.8} />
      <Scales x={170} y={140} />
      <Figure x={130} y={140} s={0.8} item="book" flip />
      <Town x={0} y={70} w={0} seed={1} spire={false} />
    </>;
    case 'harvest': return <>
      <Sun x={420} y={44} r={18} />
      <Hills y={110} seed={seed} amp={14} />
      {Array.from({ length: 7 }, (_, i) => P(`M0,${126 + i * 9} Q260,${118 + i * 9} ${W},${128 + i * 9}`, 'none', 0.8))}
      <Sheaf x={90} y={176} /><Sheaf x={170} y={180} s={0.9} /><Sheaf x={430} y={178} />
      <Figure x={290} y={182} s={1} item="sickle" /><Figure x={350} y={182} s={0.9} flip />
      <Tree x={40} y={120} s={0.8} /><Tree x={500} y={118} s={0.7} />
      {P(`M0,182 H${W}`, 'none', 1.4)}
    </>;
    case 'ship': return <>
      <Sun x={90} y={40} r={13} /><Cloud x={300} y={40} s={1} /><Cloud x={450} y={56} s={0.8} />
      {[0, 1, 2].map((i) => <Bird x={180 + i * 24} y={40 + i * 6} />)}
      <Waves y={140} seed={seed} />
      <Cog x={270} y={146} s={1.05} tilt={-3} />
      <Cog x={450} y={140} s={0.45} tilt={2} />
    </>;
    case 'storm': return <>
      <rect x={0} y={0} width={W} height={H} fill="url(#ah-cross)" opacity={0.7} />
      <Cloud x={120} y={50} s={1.6} dark /><Cloud x={360} y={46} s={1.4} dark />
      <Bolt x={240} y={44} /><Bolt x={420} y={60} />
      <Waves y={130} rough={2.2} seed={seed} />
      <Cog x={200} y={150} s={0.95} tilt={-16} />
    </>;
    case 'scholar': return <>
      <rect x={0} y={0} width={W} height={H} fill="url(#ah-brick)" opacity={0.3} />
      {P(`M380,140 V40 Q420,6 460,40 V140 Z`, PAPER, 1.6)}{P(`M420,20 V140 M380,80 H460`, 'none', 1.3)}
      {[0, 1, 2, 3].map((k) => <g>{P(`M30,${48 + k * 30} H200`, 'none', 1.8)}{Array.from({ length: 12 }, (_, i) => P(`M${36 + i * 13},${48 + k * 30} v${-18 - ((i * 7 + k) % 5)} h9 v${18 + ((i * 7 + k) % 5)}`, i % 3 ? PAPER2 : RED, 0.8))}</g>)}
      {P(`M190,182 L220,140 H360 L380,182`, 'url(#ah-hatch2)', 1.4)}
      <Book x={290} y={138} s={0.9} />
      <Candle x={350} y={140} />
      {P(`M236,108 q20,-30 40,-40`, 'none', 1.2)}
      <Figure x={244} y={182} s={0.9} hood flip />
    </>;
    case 'revolt': return <>
      <rect x={0} y={0} width={W} height={H} fill="url(#ah-hatch)" opacity={0.5} />
      <Town x={40} y={130} w={440} seed={seed} />
      <Flame x={130} y={110} s={1.1} /><Flame x={380} y={104} s={1.3} /><Smoke x={380} y={60} s={1} />
      {Array.from({ length: 7 }, (_, i) => <Figure x={110 + i * 50 + r() * 10} y={182} s={0.85 + r() * 0.15} item={i % 3 === 0 ? 'torch' : i % 3 === 1 ? 'fork' : 'spear'} flip={i % 2 === 1} />)}
      <Ground y={160} />
    </>;
    case 'fire': return <>
      <rect x={0} y={0} width={W} height={H} fill="url(#ah-cross)" opacity={0.45} />
      <Town x={30} y={160} w={460} seed={seed + 7} />
      {[90, 200, 290, 410].map((x, i) => <Flame x={x} y={140 - (i % 2) * 14} s={0.9 + (i % 2) * 0.4} />)}
      <Smoke x={210} y={70} s={1.4} /><Smoke x={410} y={60} s={1.1} />
      <Figure x={480} y={186} s={0.75} flip />
      <Ground y={168} />
    </>;
    case 'wedding': return <>
      <Sun x={260} y={40} r={14} />
      <Arch x={180} y={182} w={160} h={90} />
      {[200, 240, 280, 320].map((x) => P(`M${x},50 q6,6 12,0 q6,6 12,0`, 'none', 0.9))}
      <Figure x={235} y={182} s={1.05} crown robe={BLUE} /><Figure x={285} y={182} s={1.05} crown flip robe={RED} />
      <Figure x={140} y={182} s={0.8} item="banner" /><Figure x={380} y={182} s={0.8} item="banner" flip />
      <Tree x={60} y={182} s={1} /><Tree x={470} y={182} s={1} />
      {P(`M0,182 H${W}`, 'none', 1.4)}
    </>;
    case 'coronation': return <>
      <Rays x={260} y={86} r={90} />
      <BigCrown x={260} y={84} s={1.2} />
      <Figure x={260} y={184} s={1.1} robe={RED} item="staff" />
      <Figure x={180} y={184} s={0.9} hood item="book" /><Figure x={340} y={184} s={0.9} hood flip item="staff" />
      <Banner x={70} y={184} h={120} color={BLUE} /><Banner x={450} y={184} h={120} flip />
      {P(`M0,184 H${W}`, 'none', 1.4)}
    </>;
  }
  return <>
    <Sun x={440} y={44} r={14} />
    <Hills y={120} seed={seed} amp={20} />
    <Castle x={260} y={140} s={1} />
    <Tree x={80} y={170} /><Tree x={460} y={168} s={0.8} />
    <Ground y={170} />
  </>;
}

const ART_KEYS = ['plague', 'court', 'battle', 'church', 'trade', 'harvest', 'ship', 'scholar', 'revolt', 'wedding', 'fire', 'storm', 'coronation'];
const ALIASES: Record<string, string> = { war: 'battle', siege: 'battle', faith: 'church', religion: 'church', market: 'trade', merchant: 'trade', sea: 'ship', learning: 'scholar', university: 'scholar', rebels: 'revolt', peasants: 'revolt', marriage: 'wedding', crown: 'coronation', succession: 'coronation', famine: 'harvest' };

function EventArtInner({ art, seed = 1 }: { art?: string; seed?: number }) {
  const key = art && ART_KEYS.includes(art) ? art : ALIASES[art || ''] || 'castle';
  return <svg class="event-art" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <pattern id="ah-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke={INK} stroke-width="0.7" /></pattern>
      <pattern id="ah-hatch2" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><rect width="4" height="4" fill={PAPER2} /><line x1="0" y1="0" x2="0" y2="4" stroke={INK} stroke-width="0.9" /></pattern>
      <pattern id="ah-cross" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><line x1="0" y1="0" x2="0" y2="5" stroke={INK} stroke-width="0.6" /><line x1="0" y1="0" x2="5" y2="0" stroke={INK} stroke-width="0.6" /></pattern>
      <pattern id="ah-dots" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="0.6" fill={INK} /></pattern>
      <pattern id="ah-wave" width="8" height="3" patternUnits="userSpaceOnUse"><line x1="0" y1="1.5" x2="8" y2="1.5" stroke={INK} stroke-width="0.5" /></pattern>
      <pattern id="ah-brick" width="16" height="8" patternUnits="userSpaceOnUse"><rect width="16" height="8" fill={PAPER2} /><path d="M0,0 H16 M0,4 H16 M4,0 V4 M12,4 V8" stroke={INK} stroke-width="0.5" /></pattern>
      <radialGradient id="ah-vig" cx="50%" cy="50%" r="70%"><stop offset="60%" stop-color="#000" stop-opacity="0" /><stop offset="100%" stop-color="#5a3a12" stop-opacity=".35" /></radialGradient>
    </defs>
    <rect x={0} y={0} width={W} height={H} fill={PAPER} />
    {scene(key, seed)}
    <rect x={0} y={0} width={W} height={H} fill="url(#ah-vig)" />
    <rect x={4} y={4} width={W - 8} height={H - 8} fill="none" stroke={INK} stroke-width={2} />
    <rect x={9} y={9} width={W - 18} height={H - 18} fill="none" stroke={INK} stroke-width={0.7} />
  </svg>;
}
export const EventArt = memo(EventArtInner);
export const ART_LIST = ART_KEYS;
