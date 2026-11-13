// Applies every migration in supabase/migrations to an in-memory Postgres (PGlite) with a small shim of the
// Supabase auth/storage schemas, then checks the Row Level Security rules from the point of view of real users.
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c'; // has no seat in any world
const ADMIN = '00000000-0000-4000-8000-0000000000ad';

let db: PGlite;

/** Run SQL as a given user (uid) or as anon (null) or as the world server ('service'). */
async function as<T = any>(who: string | null | 'service', sql: string, params: any[] = []): Promise<T[]> {
  await db.exec('reset role');
  const role = who === 'service' ? 'service_role' : who ? 'authenticated' : 'anon';
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who && who !== 'service' ? who : '']);
  await db.exec(`set role ${role}`);
  try { return (await db.query<T>(sql, params)).rows; } finally { await db.exec('reset role'); }
}
async function asCount(who: string | null | 'service', sql: string, params: any[] = []): Promise<number> {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who && who !== 'service' ? who : '']);
  await db.exec(`set role ${who === 'service' ? 'service_role' : who ? 'authenticated' : 'anon'}`);
  try { return (await db.query(sql, params)).affectedRows ?? 0; } finally { await db.exec('reset role'); }
}
const root = async (sql: string, params: any[] = []) => (await db.query(sql, params)).rows as any[];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(resolve(ROOT, 'tests/supabase_shim.sql'), 'utf8'));
  const dir = resolve(ROOT, 'supabase/migrations');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(resolve(dir, f), 'utf8'));
  await root(`insert into auth.users (id, email, raw_user_meta_data) values
    ($1, 'a@example.org', '{"display_name":"Alice"}'), ($2, 'b@example.org', '{"display_name":"Bertram"}'),
    ($3, 'c@example.org', '{}'), ($4, 'admin@example.org', '{"display_name":"Warden"}')`, [A, B, C, ADMIN]);
  await root(`insert into public.admin_roles (user_id, role) values ($1, 'admin')`, [ADMIN]);
  await root(`insert into public.worlds (id, name) values ('w1', 'First World')`);
  await root(`insert into public.world_players (world_id, user_id, season, nation_key, display_name, standing_orders)
    values ('w1', $1, 1, 'portugal', 'Alice', '{"defendOnly":true}'), ('w1', $2, 1, 'scotland', 'Bertram', '{"defendOnly":false}')`, [A, B]);
}, 60_000);

describe('migrations', () => {
  it('enable Row Level Security on every table in public', async () => {
    const rows = await root(`select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'`);
    expect(rows.length).toBeGreaterThanOrEqual(9);
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
    expect(rows.map((r) => r.relname).sort()).toEqual(expect.arrayContaining(['achievements', 'admin_roles', 'leaderboards', 'player_messages', 'profiles', 'saves', 'world_events', 'world_players', 'worlds']));
  });
  it('create the save buckets as private', async () => {
    const rows = await root(`select id, public from storage.buckets order by id`);
    expect(rows).toEqual([{ id: 'saves', public: false }, { id: 'world-snapshots', public: false }]);
  });
});

describe('profiles', () => {
  it('are created on sign-up with the requested name or a provisional one', async () => {
    const rows = await root(`select id, display_name from public.profiles order by display_name`);
    expect(rows.find((r) => r.id === A)?.display_name).toBe('Alice');
    expect(rows.find((r) => r.id === C)?.display_name).toMatch(/^Player [0-9a-f]{8}$/);
  });
  it('are readable only by their owner', async () => {
    expect(await as(A, `select display_name from public.profiles`)).toEqual([{ display_name: 'Alice' }]);
    expect(await as(A, `select * from public.profiles where id = $1`, [B])).toEqual([]);
    await expect(as(null, `select * from public.profiles`)).rejects.toThrow(/permission denied/);
  });
  it('cannot be modified or created for another user', async () => {
    expect(await asCount(A, `update public.profiles set display_name = 'Hijacked' where id = $1`, [B])).toBe(0);
    expect(await asCount(A, `delete from public.profiles where id = $1`, [B])).toBe(0);
    await expect(as(A, `insert into public.profiles (id, display_name) values ($1, 'Fake')`, [B])).rejects.toThrow(/row-level security|duplicate key/);
    expect((await root(`select display_name from public.profiles where id = $1`, [B]))[0].display_name).toBe('Bertram');
  });
  it('can be renamed by the owner; names are unique ignoring case', async () => {
    expect(await asCount(C, `update public.profiles set display_name = 'Casimir' where id = $1`, [C])).toBe(1);
    await expect(as(C, `update public.profiles set display_name = 'alice' where id = $1`, [C])).rejects.toThrow(/duplicate key/);
    await expect(as(C, `update public.profiles set display_name = '<b>x</b>' where id = $1`, [C])).rejects.toThrow(/check constraint/);
  });
});

describe('cloud saves', () => {
  it('belong to the user who uploads them', async () => {
    const [s] = await as(A, `insert into public.saves (local_id, label, nation_key, game_day, size_bytes, client_saved_at)
      values ('save_1', 'Portugal 1360', 'portugal', 1500, 12345, now()) returning id, user_id`);
    expect(s.user_id).toBe(A);
    await expect(as(A, `insert into public.saves (user_id, label, game_day, size_bytes, client_saved_at) values ($1, 'x', 1, 1, now())`, [B]))
      .rejects.toThrow(/row-level security/);
    expect(await as(B, `select * from public.saves`)).toEqual([]);
    expect(await asCount(B, `update public.saves set label = 'mine now'`)).toBe(0);
    expect(await asCount(B, `delete from public.saves`)).toBe(0);
    await expect(as(null, `select * from public.saves`)).rejects.toThrow(/permission denied/);
    expect((await as(A, `select label from public.saves`)).length).toBe(1);
  });
  it('cannot be moved to another account', async () => {
    await expect(as(A, `update public.saves set user_id = $1`, [B])).rejects.toThrow(/row-level security/);
  });
  it('files live only in the owner folder of the saves bucket', async () => {
    await as(A, `insert into storage.objects (bucket_id, name) values ('saves', $1)`, [`${A}/abc.bin`]);
    await expect(as(A, `insert into storage.objects (bucket_id, name) values ('saves', $1)`, [`${B}/abc.bin`])).rejects.toThrow(/row-level security/);
    await expect(as(A, `insert into storage.objects (bucket_id, name) values ('saves', $1)`, [`${A}/../x.bin`])).rejects.toThrow(/row-level security/);
    await expect(as(A, `insert into storage.objects (bucket_id, name) values ('world-snapshots', $1)`, [`${A}/abc.bin`])).rejects.toThrow(/row-level security/);
    expect(await as(B, `select name from storage.objects where bucket_id = 'saves'`)).toEqual([]);
    expect(await asCount(B, `delete from storage.objects`)).toBe(0);
    expect(await asCount(B, `update storage.objects set name = $1`, [`${B}/stolen.bin`])).toBe(0);
    expect(await as(A, `select name from storage.objects`)).toEqual([{ name: `${A}/abc.bin` }]);
    expect(await as(null, `select name from storage.objects`)).toEqual([]);
  });
});

describe('worlds, seats and leaderboards', () => {
  it('worlds are public but read-only for clients', async () => {
    expect((await as(null, `select id from public.worlds`)).map((r) => r.id)).toEqual(['w1']);
    await expect(as(A, `insert into public.worlds (id, name) values ('w2', 'Mine')`)).rejects.toThrow(/permission denied/);
    await expect(as(A, `update public.worlds set speed_seconds_per_day = 1`)).rejects.toThrow(/permission denied/);
  });
  it('a seat and its standing orders are private; the roster is public without orders', async () => {
    expect(await as(A, `select nation_key, standing_orders from public.world_players`)).toEqual([{ nation_key: 'portugal', standing_orders: { defendOnly: true } }]);
    const roster = await as(null, `select * from public.world_roster order by nation_key`);
    expect(roster.map((r) => r.nation_key)).toEqual(['portugal', 'scotland']);
    expect(Object.keys(roster[0])).not.toContain('standing_orders');
    await expect(as(A, `update public.world_players set standing_orders = '{}' where user_id = $1`, [A])).rejects.toThrow(/permission denied/);
    await expect(as(A, `insert into public.world_players (world_id, user_id, season, nation_key) values ('w1', $1, 1, 'france')`, [C])).rejects.toThrow(/permission denied/);
  });
  it('leaderboards are publicly readable and only the server writes them', async () => {
    await as('service', `insert into public.leaderboards (world_id, season, user_id, display_name, nation_key, score, rank)
      values ('w1', 1, $1, 'Alice', 'portugal', 812.5, 1), ('w1', 1, null, null, 'france', 700, 2)`, [A]);
    expect((await as(null, `select nation_key, rank from public.leaderboards order by rank`)).map((r) => r.nation_key)).toEqual(['portugal', 'france']);
    expect((await as(B, `select count(*)::int as n from public.leaderboards`))[0].n).toBe(2);
    await expect(as(B, `insert into public.leaderboards (world_id, season, user_id, nation_key, score, rank) values ('w1', 1, $1, 'scotland', 9999, 1)`, [B])).rejects.toThrow(/permission denied/);
    await expect(as(A, `update public.leaderboards set score = 99999`)).rejects.toThrow(/permission denied/);
    await expect(as(A, `delete from public.leaderboards`)).rejects.toThrow(/permission denied/);
  });
  it('world events are public except admin entries', async () => {
    await as('service', `insert into public.world_events (world_id, season, kind, payload) values ('w1', 1, 'season_start', '{}'), ('w1', 1, 'admin', '{"by":"x"}')`);
    expect((await as(null, `select kind from public.world_events`)).map((r) => r.kind)).toEqual(['season_start']);
    await expect(as(A, `insert into public.world_events (world_id, season, kind) values ('w1', 1, 'broadcast')`)).rejects.toThrow(/permission denied/);
  });
});

describe('achievements', () => {
  it('are visible only to their owner and cannot be self-awarded', async () => {
    await as('service', `insert into public.achievements (user_id, key, world_id, season) values ($1, 'first_crown', 'w1', 1)`, [A]);
    expect(await as(A, `select key from public.achievements`)).toEqual([{ key: 'first_crown' }]);
    expect(await as(B, `select key from public.achievements`)).toEqual([]);
    await expect(as(B, `insert into public.achievements (user_id, key) values ($1, 'first_crown')`, [B])).rejects.toThrow(/permission denied/);
    await expect(as(A, `delete from public.achievements`)).rejects.toThrow(/permission denied/);
    await expect(as(null, `select * from public.achievements`)).rejects.toThrow(/permission denied/);
  });
});

describe('player messages', () => {
  it('world chat is readable and writable only by seat holders', async () => {
    await as(A, `insert into public.player_messages (world_id, season, kind, from_user, body) values ('w1', 1, 'chat', $1, 'Hail, neighbours!')`, [A]);
    expect((await as(B, `select body from public.player_messages where kind = 'chat'`)).map((r) => r.body)).toEqual(['Hail, neighbours!']);
    expect(await as(C, `select body from public.player_messages`)).toEqual([]);
    await expect(as(C, `insert into public.player_messages (world_id, season, kind, from_user, body) values ('w1', 1, 'chat', $1, 'spam')`, [C])).rejects.toThrow(/row-level security/);
    await expect(as(A, `insert into public.player_messages (world_id, season, kind, from_user, body) values ('w1', 1, 'chat', $1, 'forged')`, [B])).rejects.toThrow(/row-level security/);
    await expect(as(null, `select * from public.player_messages`)).rejects.toThrow(/permission denied/);
  });
  it('offers are created by the server and visible only to the two parties', async () => {
    await as('service', `insert into public.player_messages (world_id, season, kind, from_user, to_user, body, status, payload)
      values ('w1', 1, 'offer', $1, $2, 'alliance', 'open', '{"action":"alliance"}')`, [B, ADMIN]);
    expect((await as(ADMIN, `select kind from public.player_messages where kind = 'offer'`)).length).toBe(1);
    expect((await as(B, `select kind from public.player_messages where kind = 'offer'`)).length).toBe(1);
    expect(await as(A, `select kind from public.player_messages where kind = 'offer'`)).toEqual([]);
    await expect(as(A, `insert into public.player_messages (world_id, season, kind, from_user, to_user, body, status) values ('w1', 1, 'offer', $1, $2, 'x', 'open')`, [A, B])).rejects.toThrow(/row-level security/);
    await expect(as(ADMIN, `update public.player_messages set status = 'accepted'`)).rejects.toThrow(/permission denied/);
  });
  it('chat inserts are rate limited', async () => {
    let failed = false;
    for (let i = 0; i < 7; i++) { try { await as(B, `insert into public.player_messages (world_id, season, kind, from_user, body) values ('w1', 1, 'chat', $1, $2)`, [B, `line ${i}`]); } catch (e: any) { failed = /slow down/.test(String(e.message)); } }
    expect(failed).toBe(true);
  });
});

describe('admin roles', () => {
  it('users cannot grant themselves roles; is_admin reflects the table', async () => {
    await expect(as(A, `insert into public.admin_roles (user_id, role) values ($1, 'admin')`, [A])).rejects.toThrow(/permission denied/);
    expect((await as(A, `select public.is_admin() as v`))[0].v).toBe(false);
    expect((await as(ADMIN, `select public.is_admin() as v`))[0].v).toBe(true);
    expect(await as(A, `select * from public.admin_roles`)).toEqual([]);
    expect((await as(ADMIN, `select role from public.admin_roles`))).toEqual([{ role: 'admin' }]);
  });
  it('the service role (world server) bypasses RLS', async () => {
    expect((await as('service', `select count(*)::int as n from public.saves`))[0].n).toBe(1);
    expect((await as('service', `select count(*)::int as n from public.profiles`))[0].n).toBe(4);
  });
});
