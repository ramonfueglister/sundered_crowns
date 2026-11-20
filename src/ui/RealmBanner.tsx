// The banner of the realm the player rules, top left; a click takes the map home to its capital.
import { L } from './i18n';
import { mapCtl } from './mapstate';
import { ARMS, myRealm } from './realms';

export function RealmBanner() {
  const r = myRealm.value;
  if (!r) return null;
  const arms = ARMS[r.key];
  return (
    <button
      type="button"
      class="realm-banner"
      title={L(r.name)}
      aria-label={L(r.name)}
      onClick={() => mapCtl.home(r.capital)}
    >
      <svg width="145" height="104" viewBox="0 0 150 104" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M5 0h141v80c-14-6-28 4-46 0s-30-8-48-2-34 6-47 2z"
          fill="#1450a0"
          stroke="#e8c35a"
          stroke-width="3.5"
        />
        <path d="M5 0h141v80c-14-6-28 4-46 0s-30-8-48-2-34 6-47 2z" fill="url(#flagshade)" />
        <path d="M7 2h137v10c-18 7-38-5-68 1S30 17 7 11z" fill="#0a2e60" opacity=".6" />
        <path d="M0 82l20 3-5 6 5 6-20-3z" fill="#c99a32" stroke="#8a6a1c" stroke-width=".8" />
        <rect x="0" y="0" width="6" height="100" fill="#d4a93f" />
        <path d="M0 100h6l-3 4z" fill="#d4a93f" />
      </svg>
      {arms ? <img class="arms" src={arms} alt="" /> : <span class="initial">{L(r.short).slice(0, 1)}</span>}
    </button>
  );
}
