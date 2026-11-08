// Global tooltip with breakdowns: every number in the UI can explain where it comes from.
import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { num, signed } from './format';

const tip = signal<{ x: number; y: number; content: ComponentChildren } | null>(null);

export function Tip({ content, children, tag = 'span', ...rest }: { content: ComponentChildren | (() => ComponentChildren); children: ComponentChildren; tag?: 'span' | 'div' } & Record<string, any>) {
  const Tag: any = tag;
  return <Tag {...rest}
    onMouseEnter={(e: MouseEvent) => { tip.value = { x: e.clientX, y: e.clientY, content: typeof content === 'function' ? (content as any)() : content }; }}
    onMouseMove={(e: MouseEvent) => { if (tip.value) tip.value = { ...tip.value, x: e.clientX, y: e.clientY }; }}
    onMouseLeave={() => { tip.value = null; }}>{children}</Tag>;
}

export function TooltipLayer() {
  const v = tip.value; if (!v) return null;
  const left = Math.min(v.x + 16, window.innerWidth - 340), top = Math.min(v.y + 18, window.innerHeight - 40);
  return <div class="tooltip" style={{ left, top }}>{v.content}</div>;
}
export function hideTip() { tip.value = null; }

/** A titled list of [label, value] rows with a total. */
export function Breakdown({ title, rows, total, unit = '', digits = 1, sign = true }: { title?: string; rows: [string, number][]; total?: number; unit?: string; digits?: number; sign?: boolean }) {
  const r = rows.filter((x) => Math.abs(x[1]) > 1e-6).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  return <div class="breakdown">
    {title && <div class="bd-title">{title}</div>}
    {r.map(([k, v]) => <div class="bd-row"><span>{k}</span><span class={v >= 0 ? 'pos' : 'neg'}>{sign ? signed(v, digits) : num(v, digits)}{unit}</span></div>)}
    {total !== undefined && <div class="bd-row bd-total"><span>Σ</span><span>{sign ? signed(total, digits) : num(total, digits)}{unit}</span></div>}
  </div>;
}
