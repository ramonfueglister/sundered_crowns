// Icons of the game interface: two-tone cream shapes on navy, drawn as inline SVG. The gradients are defined once by <IconDefs />.

/** The shared gradients (rendered once, at the root of the app). */
export function IconDefs() {
  return <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs>
    <linearGradient id="icg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4ecd6" /><stop offset=".5" stop-color="#ddd5c1" /><stop offset="1" stop-color="#a5a89f" /></linearGradient>
    <linearGradient id="icg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9c2ae" /><stop offset="1" stop-color="#858a84" /></linearGradient>
    <linearGradient id="icgc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2c8" /><stop offset=".55" stop-color="#ebcd92" /><stop offset="1" stop-color="#a89c78" /></linearGradient>
    <linearGradient id="flagshade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".18" /><stop offset=".35" stop-color="#fff" stop-opacity=".07" /><stop offset=".7" stop-color="#000" stop-opacity=".05" /><stop offset="1" stop-color="#000" stop-opacity=".28" /></linearGradient>
  </defs></svg>;
}

type P = { size?: number };

/** Places: a small town with a tower. */
export const IconPlaces = ({ size = 34 }: P) => <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
  <path class="ic2" d="M3 32V20l7-6 7 6v12z" />
  <path class="ic" fill-rule="evenodd" d="M15 32V14h3v-4h3v4h3v-4h3v4h3v18zM20 24h4v8h-4z" />
  <path class="ic" d="M6 26h3v3H6z" />
</svg>;

/** Players: two busts. */
export const IconPlayers = ({ size = 34 }: P) => <svg width={size * 38 / 36} height={size} viewBox="0 0 38 36" aria-hidden="true">
  <circle class="ic2" cx="26" cy="12" r="5" /><path class="ic2" d="M22 20c7-1 14 3 14 11H26c0-4-1-8-4-11z" />
  <circle class="ic" cx="13" cy="11" r="6" /><path class="ic" d="M2 31c0-8 5-12 11-12s11 4 11 12z" />
</svg>;

export const IconCalendar = ({ size = 26 }: P) => <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
  <path class="ic" fill-rule="evenodd" d="M3 5h20a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10v13h20V10zM5 12h4v3H5zm6 0h4v3h-4zm6 0h4v3h-4zM5 17h4v3H5zm6 0h4v3h-4zm6 0h4v3h-4z" />
  <rect class="ic" x="6" y="1.5" width="3" height="6" rx="1.2" /><rect class="ic" x="17" y="1.5" width="3" height="6" rx="1.2" />
</svg>;

export const IconGear = ({ size = 23 }: P) => <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
  {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <rect key={a} class="ic" x="11.3" y="1.5" width="3.4" height="5" rx=".8" transform={`rotate(${a} 13 13)`} />)}
  <circle cx="13" cy="13" r="7" fill="none" stroke="url(#icg)" stroke-width="3.2" />
</svg>;

/** Back to one's own realm: a crown. */
export const IconCrown = ({ size = 26 }: P) => <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
  <path class="ic" d="M6.5 25L4 11l6 6.5L12.5 9 17 15.5 21.5 9l2.5 8.5 6-6.5-2.5 14z" />
  <circle class="ic" cx="4" cy="10" r="2" /><circle class="ic" cx="12.5" cy="8" r="2" /><circle class="ic" cx="17" cy="6" r="2.2" /><circle class="ic" cx="21.5" cy="8" r="2" /><circle class="ic" cx="30" cy="10" r="2" />
  <rect class="ic" x="6" y="25.5" width="22" height="4.5" rx="1" />
</svg>;

/** The whole map: a globe. */
export const IconGlobe = ({ size = 26 }: P) => <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
  <g fill="none" stroke="url(#icg)" stroke-width="2.2"><circle cx="13" cy="13" r="10.5" /><ellipse cx="13" cy="13" rx="4.5" ry="10.5" /><path d="M3 9.5h20M3 16.5h20" /></g>
</svg>;

export const IconFullscreen = ({ size = 24 }: P) => <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
  <g fill="none" stroke="url(#icg)" stroke-width="2.6"><path d="M2 8V2h6M16 2h6v6M22 16v6h-6M8 22H2v-6" /></g>
</svg>;

export const IconClose = ({ size = 18 }: P) => <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
  <path d="M3 3l12 12M15 3L3 15" stroke="url(#icg)" stroke-width="2.4" stroke-linecap="round" />
</svg>;
