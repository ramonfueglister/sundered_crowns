// UI strings of the online panels (EN/DE).
import { lang } from '../i18n';

const S: Record<string, [string, string]> = {
  online_world: ['Online world', 'Online-Welt'],
  not_configured: ['Online features are not configured for this build: accounts, cloud saves and authenticated worlds need VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Single player works as usual.',
    'Online-Funktionen sind in dieser Version nicht eingerichtet: Konten, Cloud-Spielstände und Welten mit Anmeldung brauchen VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY. Das Einzelspiel funktioniert wie gewohnt.'],
  dev_world: ['Local test world (DEV server)', 'Lokale Testwelt (DEV-Server)'],
  dev_hint: ['A world server without Supabase accepts a display name instead of a login. For testing only.', 'Ein Weltserver ohne Supabase akzeptiert einen Anzeigenamen statt einer Anmeldung. Nur zum Testen.'],
  account: ['Account', 'Konto'], worlds: ['Worlds', 'Welten'], cloud_saves: ['Cloud saves', 'Cloud-Spielstände'], leaderboard: ['Leaderboard', 'Rangliste'], achievements: ['Achievements', 'Errungenschaften'],
  messages: ['Messages', 'Nachrichten'], orders: ['Standing orders', 'Daueraufträge'], world: ['World', 'Welt'], admin: ['Admin', 'Verwaltung'],
  email: ['E-mail address', 'E-Mail-Adresse'], send_link: ['Send sign-in link', 'Anmeldelink senden'], link_sent: ['Check your inbox: we sent you a sign-in link.', 'Sieh in dein Postfach: Wir haben dir einen Anmeldelink geschickt.'],
  or_with: ['or sign in with', 'oder anmelden mit'], sign_out: ['Sign out', 'Abmelden'], signed_in_as: ['Signed in as', 'Angemeldet als'], display_name: ['Display name', 'Anzeigename'], save_name: ['Save name', 'Namen speichern'],
  name_saved: ['Name saved.', 'Name gespeichert.'], connect: ['Connect', 'Verbinden'], disconnect: ['Leave world', 'Welt verlassen'], connecting: ['Connecting…', 'Verbinde…'], reconnecting: ['Connection lost – reconnecting…', 'Verbindung verloren – verbinde neu…'],
  enter_world: ['Enter the world', 'Welt betreten'], choose_free: ['Choose a free realm', 'Wähle ein freies Reich'], join: ['Take the crown', 'Krone übernehmen'], search: ['Search…', 'Suchen…'],
  season: ['Season', 'Saison'], players: ['Players', 'Spieler'], online_now: ['online', 'online'], next_day: ['Next day in', 'Nächster Tag in'], paused: ['The world is paused', 'Die Welt ist angehalten'],
  season_ends: ['Season ends', 'Saisonende'], per_day: ['s per day', 's pro Tag'], your_realm: ['Your realm', 'Dein Reich'], protected_until: ['Protected until', 'Geschützt bis'], abdicate: ['Abdicate (release to the AI)', 'Abdanken (an die KI übergeben)'],
  defendOnly: ['Defend only (no offensive moves while I am away)', 'Nur verteidigen (keine Angriffe, solange ich fort bin)'], balanceBudget: ['Balance the budget', 'Haushalt ausgleichen'],
  acceptPeaceBelow: ['Accept peace when the war score against us reaches', 'Frieden annehmen, wenn die Kriegspunkte gegen uns erreichen'], autoBuild: ['Build automatically', 'Automatisch bauen'], autoRecruit: ['Recruit automatically', 'Automatisch rekrutieren'],
  orders_hint: ['While you are offline, the realm follows these orders. Changes apply at the start of the next day.', 'Solange du offline bist, folgt das Reich diesen Aufträgen. Änderungen gelten ab dem nächsten Tag.'],
  save_orders: ['Save orders', 'Aufträge speichern'], saved: ['Saved', 'Gespeichert'], queued: ['orders waiting for the next day', 'Befehle warten auf den nächsten Tag'],
  chat_world: ['Everyone', 'Alle'], say: ['Send', 'Senden'], to: ['To', 'An'], offers: ['Diplomatic offers', 'Diplomatische Angebote'], incoming: ['Incoming', 'Eingehend'], outgoing: ['Outgoing', 'Ausgehend'],
  make_offer: ['Make an offer', 'Angebot machen'], expires: ['expires', 'verfällt'], accept: ['Accept', 'Annehmen'], decline: ['Decline', 'Ablehnen'], no_players: ['No other players yet.', 'Noch keine anderen Spieler.'],
  alliance: ['Alliance', 'Bündnis'], marriage: ['Royal marriage', 'Königliche Heirat'], access: ['Military access', 'Durchmarschrecht'], trade: ['Trade agreement', 'Handelsabkommen'], guarantee: ['Guarantee independence', 'Unabhängigkeit garantieren'],
  rank: ['Rank', 'Rang'], realm: ['Realm', 'Reich'], score: ['Score', 'Punkte'], player: ['Player', 'Spieler'], live: ['Current season', 'Laufende Saison'], past: ['Past seasons', 'Frühere Saisons'],
  earned: ['earned', 'erreicht'], locked: ['not yet', 'noch nicht'], cosmetic: ['Achievements are honours only; they give no advantage. Honours for the state of your realm count from your second year on the throne.', 'Errungenschaften sind reine Ehrungen; sie bringen keinen Vorteil. Ehrungen für den Zustand deines Reiches zählen ab deinem zweiten Jahr auf dem Thron.'],
  sign_in_first: ['Sign in to use this.', 'Melde dich an, um dies zu nutzen.'], refresh: ['Refresh', 'Aktualisieren'], upload: ['Upload', 'Hochladen'], download: ['Load from cloud', 'Aus der Cloud laden'], delete: ['Delete', 'Löschen'],
  local: ['On this device', 'Auf diesem Gerät'], cloud: ['In the cloud', 'In der Cloud'], in_sync: ['in sync', 'synchron'], local_only: ['only on this device', 'nur auf diesem Gerät'], cloud_only: ['only in the cloud', 'nur in der Cloud'],
  local_newer: ['this device is newer', 'dieses Gerät ist neuer'], cloud_newer: ['the cloud is newer', 'die Cloud ist neuer'], conflict: ['both changed – choose which to keep', 'beide geändert – wähle, was bleiben soll'],
  keep_local: ['Keep this device', 'Dieses Gerät behalten'], keep_cloud: ['Keep cloud', 'Cloud behalten'], recommended: ['recommended', 'empfohlen'], confirm_delete: ['Delete this cloud save?', 'Diesen Cloud-Spielstand löschen?'],
  pause: ['Pause', 'Anhalten'], resume: ['Resume', 'Fortsetzen'], set_speed: ['Seconds per day', 'Sekunden pro Tag'], broadcast: ['Broadcast', 'Rundruf'], kick: ['Kick', 'Hinauswerfen'], release: ['Release seat', 'Sitz freigeben'],
  snapshot: ['Save snapshot', 'Schnappschuss speichern'], dev_gold: ['Dev: +1000 marks', 'Dev: +1000 Mark'], herald: ['Herald', 'Herold'], close: ['Close', 'Schließen'], back_to_game: ['Back to the map', 'Zurück zur Karte'],
  send: ['Send', 'Senden'], open_online: ['Online', 'Online'], world_server: ['World server', 'Weltserver'], no_worlds: ['No worlds are listed yet. You can still connect to the configured world server.', 'Noch keine Welten eingetragen. Du kannst dich trotzdem mit dem eingestellten Weltserver verbinden.'],
  wiring_missing: ['This build cannot switch the game to the online world yet (setClient missing in src/game/client.ts).', 'Diese Version kann das Spiel noch nicht auf die Online-Welt umschalten (setClient fehlt in src/game/client.ts).'],
};
export function tt(k: string): string { const v = S[k]; return v ? v[lang.value === 'de' ? 1 : 0] : k; }
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}
