// Supabase client for accounts, profiles and cloud saves. Created only when the build has VITE_SUPABASE_URL and
// VITE_SUPABASE_ANON_KEY; otherwise `online.available` is false and the game stays a pure single-player game.
// Only the anon key is ever used in the browser; Row Level Security protects every table (supabase/migrations).
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { signal, computed } from '@preact/signals';

const ENV: Record<string, string | undefined> = ((import.meta as any).env ?? {}) as any;
const URL = ENV.VITE_SUPABASE_URL, KEY = ENV.VITE_SUPABASE_ANON_KEY;

export const online = {
  /** true when accounts / cloud saves / authenticated worlds can be used */
  available: !!(URL && KEY),
  /** the world server (WebSocket) */
  worldUrl: ENV.VITE_WORLD_URL || 'ws://localhost:8787',
  /** OAuth providers enabled in the Supabase dashboard, e.g. "github,google" (optional) */
  oauth: (ENV.VITE_SUPABASE_OAUTH || '').split(',').map((x) => x.trim()).filter(Boolean),
};

export const supabase: SupabaseClient | null = online.available
  ? createClient(URL!, KEY!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'sc.auth' } })
  : null;

export interface Profile { id: string; display_name: string; created_at: string }
export const session = signal<Session | null>(null);
export const profile = signal<Profile | null>(null);
export const isAdmin = signal(false);
export const authError = signal<string | null>(null);
export const signedIn = computed(() => !!session.value);

async function refreshProfile() {
  if (!supabase || !session.value) { profile.value = null; isAdmin.value = false; return; }
  const uid = session.value.user.id;
  const { data, error } = await supabase.from('profiles').select('id, display_name, created_at').eq('id', uid).maybeSingle();
  if (error) authError.value = error.message;
  profile.value = (data as Profile) ?? null;
  const adm = await supabase.rpc('is_admin');
  isAdmin.value = adm.data === true;
}

if (supabase) {
  supabase.auth.getSession().then(({ data }) => { session.value = data.session; refreshProfile().catch(() => {}); });
  supabase.auth.onAuthStateChange((_e, s) => { session.value = s; refreshProfile().catch(() => {}); });
}

function redirectTo() { return typeof location !== 'undefined' ? location.origin + location.pathname : undefined; }

/** Sends a magic sign-in link. */
export async function signInWithEmail(email: string): Promise<string | null> {
  if (!supabase) return 'Online features are not configured.';
  const e = email.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return 'Please enter a valid e-mail address.';
  const { error } = await supabase.auth.signInWithOtp({ email: e, options: { emailRedirectTo: redirectTo(), shouldCreateUser: true } });
  return error ? error.message : null;
}
export async function signInWithOAuth(provider: string): Promise<string | null> {
  if (!supabase) return 'Online features are not configured.';
  const { error } = await supabase.auth.signInWithOAuth({ provider: provider as any, options: { redirectTo: redirectTo() } });
  return error ? error.message : null;
}
export async function signOut() { if (supabase) await supabase.auth.signOut(); session.value = null; profile.value = null; isAdmin.value = false; }

/** Changes the display name (unique, 3–24 characters). Returns an error message or null. */
export async function setDisplayName(name: string): Promise<string | null> {
  if (!supabase || !session.value) return 'Not signed in.';
  const n = name.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (n.length < 3 || n.length > 24) return 'The name must have 3 to 24 characters.';
  if (/[<>"\\]/.test(n)) return 'The name contains characters that are not allowed.';
  const uid = session.value.user.id;
  const { error } = await supabase.from('profiles').upsert({ id: uid, display_name: n });
  if (error) return /duplicate|unique/i.test(error.message) ? 'That name is already taken.' : error.message;
  await refreshProfile();
  return null;
}

/** Current access token for the world server (refreshed by supabase-js). */
export async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// ---------------- public data ----------------
export interface WorldRow { id: string; name: string; season: number; status: string; started_at: string; ends_at: string | null; speed_seconds_per_day: number; max_players: number; game_day: number; players: number; server_url: string | null; start_year: number }
export async function listWorlds(): Promise<WorldRow[]> {
  if (!supabase) return [];
  const { data } = await supabase.from('worlds').select('*').order('started_at', { ascending: false });
  return (data as WorldRow[]) ?? [];
}
export interface LeaderboardRow { world_id: string; season: number; display_name: string | null; nation_key: string; score: number; rank: number }
export async function seasonLeaderboard(world: string, season?: number): Promise<LeaderboardRow[]> {
  if (!supabase) return [];
  let q = supabase.from('leaderboards').select('world_id, season, display_name, nation_key, score, rank').eq('world_id', world).order('season', { ascending: false }).order('rank').limit(50);
  if (season) q = q.eq('season', season);
  const { data } = await q;
  return (data as LeaderboardRow[]) ?? [];
}
export async function myAchievements(): Promise<{ key: string; earned_at: string; world_id: string | null }[]> {
  if (!supabase || !session.value) return [];
  const { data } = await supabase.from('achievements').select('key, earned_at, world_id').order('earned_at', { ascending: false });
  return (data as any[]) ?? [];
}
