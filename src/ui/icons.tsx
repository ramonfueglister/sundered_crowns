// Icons of the game interface: two-tone cream shapes on navy, drawn as inline SVG. The gradients are defined once by <IconDefs />.

/** The shared gradients (rendered once, at the root of the app). */
export function IconDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <linearGradient id="icg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#f4ecd6" />
          <stop offset=".5" stop-color="#ddd5c1" />
          <stop offset="1" stop-color="#a5a89f" />
        </linearGradient>
        <linearGradient id="icg2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#c9c2ae" />
          <stop offset="1" stop-color="#858a84" />
        </linearGradient>
        <linearGradient id="icgc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff2c8" />
          <stop offset=".55" stop-color="#ebcd92" />
          <stop offset="1" stop-color="#a89c78" />
        </linearGradient>
        <linearGradient id="flagshade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#000" stop-opacity=".18" />
          <stop offset=".35" stop-color="#fff" stop-opacity=".07" />
          <stop offset=".7" stop-color="#000" stop-opacity=".05" />
          <stop offset="1" stop-color="#000" stop-opacity=".28" />
        </linearGradient>
      </defs>
    </svg>
  );
}

type P = { size?: number };

/** Places: a small town with a tower. */
export const IconPlaces = ({ size = 34 }: P) => (
  <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
    <path class="ic2" d="M3 32V20l7-6 7 6v12z" />
    <path class="ic" fill-rule="evenodd" d="M15 32V14h3v-4h3v4h3v-4h3v4h3v18zM20 24h4v8h-4z" />
    <path class="ic" d="M6 26h3v3H6z" />
  </svg>
);

/** Players: two busts. */

export const IconCalendar = ({ size = 26 }: P) => (
  <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
    <path
      class="ic"
      fill-rule="evenodd"
      d="M3 5h20a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10v13h20V10zM5 12h4v3H5zm6 0h4v3h-4zm6 0h4v3h-4zM5 17h4v3H5zm6 0h4v3h-4zm6 0h4v3h-4z"
    />
    <rect class="ic" x="6" y="1.5" width="3" height="6" rx="1.2" />
    <rect class="ic" x="17" y="1.5" width="3" height="6" rx="1.2" />
  </svg>
);

/** The replay of the borders: an hourglass. */
export const IconReplay = ({ size = 23 }: P) => (
  <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
    <path
      class="ic"
      d="M5 2h16v2h-1.5c0 4-2.5 6.5-5 9 2.5 2.5 5 5 5 9H21v2H5v-2h1.5c0-4 2.5-6.5 5-9-2.5-2.5-5-5-5-9H5z"
    />
    <path
      class="ic2"
      d="M9 21.5c.5-2.5 2.2-4 4-5.5 1.8 1.5 3.5 3 4 5.5zM10 6h6c-.5 1.5-1.7 2.8-3 4-1.3-1.2-2.5-2.5-3-4z"
    />
  </svg>
);

export const IconGear = ({ size = 23 }: P) => (
  <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
    {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
      <rect key={a} class="ic" x="11.3" y="1.5" width="3.4" height="5" rx=".8" transform={`rotate(${a} 13 13)`} />
    ))}
    <circle cx="13" cy="13" r="7" fill="none" stroke="url(#icg)" stroke-width="3.2" />
  </svg>
);

/** The political map mode: lands of three realms, each in its own colour, meeting at their borders. */
export const IconPolitical = ({ size = 26 }: P) => (
  <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
    <path d="M2.5 6.5 9 3l4.5 2.5L13 13l-6 2.5-4.5-2z" fill="#c75b4a" />
    <path d="M13.5 5.5 19 3.5l4.5 3.5-1 7.5-6.5.5-3-2z" fill="#4f86b8" />
    <path d="M2.5 13.5l4.5 2 6-2.5 3 2 6.5-.5L21 22l-8 1.5-10-2.5z" fill="#d6b04c" />
    <path
      d="M9 3l4.5 2.5L13 13l-6 2.5M13 13l3 2 6.5-.5"
      fill="none"
      stroke="#f4ecd6"
      stroke-width="1.3"
      stroke-linejoin="round"
    />
    <path
      d="M2.5 6.5 9 3l4.5 2.5 5.5-2 4.5 3.5-1 7.5L21 22l-8 1.5-10.5-2.5z"
      fill="none"
      stroke="url(#icg)"
      stroke-width="1.6"
      stroke-linejoin="round"
    />
  </svg>
);

/** The terrain map mode: the land alone, its hills and mountains. */
export const IconTerrain = ({ size = 26 }: P) => (
  <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
    <path class="ic2" d="M1.5 21.5 8 12l3 4 2.5-3 6 8.5z" />
    <path class="ic" d="M6.5 21.5 14.5 5l9 16.5z" />
    <path d="M12.3 9.5 14.5 5l2.4 4.4-1.2-.6-1.2 1.1-1-1z" fill="#fdfaef" />
  </svg>
);

/** Pause: two bars. */
export const IconPause = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
    <rect class="ic" x="3.5" y="2.5" width="4" height="13" rx="1" />
    <rect class="ic" x="10.5" y="2.5" width="4" height="13" rx="1" />
  </svg>
);

/** Play: a triangle pointing on. */
export const IconPlay = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
    <path class="ic" d="M4.5 2.5v13l11-6.5z" />
  </svg>
);

export const IconClose = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
    <path d="M3 3l12 12M15 3L3 15" stroke="url(#icg)" stroke-width="2.4" stroke-linecap="round" />
  </svg>
);
