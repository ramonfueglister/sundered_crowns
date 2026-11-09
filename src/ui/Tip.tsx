// Global tooltip with breakdowns: every number in the UI can explain where it comes from.
import { signal } from '@preact/signals';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { num, signed } from './format';

type Content = ComponentChildren | (() => ComponentChildren);
const tip = signal<{ x: number; y: number; content: Content; owner: object } | null>(null);

/**
 * Wraps an element with a tooltip. A function as content is evaluated while the tooltip is shown, so the numbers in it
 * stay live (they follow the simulation while the mouse rests on the value).
 */
export function Tip({ content, children, tag = 'span', ...rest }: { content: Content; children: ComponentChildren; tag?: 'span' | 'div' | 'th' | 'td' | 'tr' } & Record<string, any>) {
  const Tag: any = tag;
  const me = useRef<object>({});
  const cur = useRef<Content>(content); cur.current = content;
  // the element may vanish under the mouse (panel switched, event answered): then mouseleave never fires
  useEffect(() => () => { if (tip.value?.owner === me.current) tip.value = null; }, []);
  // keep the shown content in step with re-renders of the owner (static content that changed)
  useEffect(() => { const v = tip.value; if (v && v.owner === me.current && v.content !== content && typeof content !== 'function') tip.value = { ...v, content }; });
  return <Tag {...rest} data-tip=""
    onMouseEnter={(e: MouseEvent) => { tip.value = { x: e.clientX, y: e.clientY, content: cur.current, owner: me.current }; }}
    onMouseMove={(e: MouseEvent) => { const v = tip.value; if (v && v.owner === me.current) tip.value = { ...v, x: e.clientX, y: e.clientY }; }}
    onMouseLeave={() => { if (tip.value?.owner === me.current) tip.value = null; }}>{children}</Tag>;
}

export function TooltipLayer() {
  const v = tip.value;
  const ref = useRef<HTMLDivElement>(null);
  // place the tooltip next to the cursor, flipped left or above when it would leave the window
  useLayoutEffect(() => {
    const el = ref.current; if (!el || !v) return;
    const w = el.offsetWidth, h = el.offsetHeight, W = window.innerWidth, H = window.innerHeight;
    let left = v.x + 16, top = v.y + 18;
    if (left + w > W - 6) left = Math.max(6, v.x - 12 - w);
    if (top + h > H - 6) top = Math.max(6, v.y - 12 - h);
    el.style.left = `${left}px`; el.style.top = `${top}px`; el.style.visibility = 'visible';
  });
  if (!v) return null;
  const content = typeof v.content === 'function' ? (v.content as () => ComponentChildren)() : v.content;
  if (content === null || content === undefined || content === false || content === '') return null;
  return <div ref={ref} class="tooltip" style={{ left: v.x + 16, top: v.y + 18, visibility: 'hidden' }}>{content}</div>;
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
