-- Sundered Crowns · migration 3: persistent worlds, seats, season results.
-- The world server (service role) is the only writer. Clients read public world data.

create table public.worlds (
  id text primary key check (id ~ '^[a-z0-9-]{2,32}$'),          -- also the server's data folder name
  name text not null check (char_length(name) between 1 and 60),
  season integer not null default 1 check (season >= 1),
  status text not null default 'running' check (status in ('scheduled', 'running', 'paused', 'ended')),
  started_at timestamptz not null default now(),
  ends_at timestamptz,                                              -- projected end of the season (real time)
  speed_seconds_per_day numeric not null default 36 check (speed_seconds_per_day > 0),
  max_players integer not null default 100 check (max_players between 1 and 1000),
  start_year integer not null default 1356,
  game_day integer not null default 0,
  players integer not null default 0,
  server_url text,
  updated_at timestamptz not null default now()
);
alter table public.worlds enable row level security;
create policy worlds_public_read on public.worlds for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.worlds from anon, authenticated;

create table public.world_players (
  world_id text not null references public.worlds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  season integer not null,
  nation_key text not null,
  display_name text,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  protected_until integer,                     -- in-game day index until which the AI will not declare war
  standing_orders jsonb not null default '{}'::jsonb,
  primary key (world_id, user_id),
  unique (world_id, nation_key)
);
alter table public.world_players enable row level security;
-- a seat (with its standing orders) is private to its holder; the public roster below hides the orders
create policy world_players_select_own on public.world_players for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete, truncate on public.world_players from anon, authenticated;

-- public roster: who rules which realm (no standing orders). Runs with the view owner's rights on purpose.
create view public.world_roster with (security_invoker = false) as
  select world_id, season, nation_key, display_name, joined_at, last_seen from public.world_players;
revoke all on public.world_roster from anon, authenticated;
grant select on public.world_roster to anon, authenticated;

create table public.world_events (
  id bigint generated always as identity primary key,
  world_id text not null references public.worlds (id) on delete cascade,
  season integer not null,
  kind text not null check (kind in ('season_start', 'season_end', 'broadcast', 'join', 'release', 'admin')),
  game_day integer,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index world_events_world_idx on public.world_events (world_id, created_at desc);
alter table public.world_events enable row level security;
create policy world_events_public_read on public.world_events for select to anon, authenticated using (kind <> 'admin');
revoke insert, update, delete, truncate on public.world_events from anon, authenticated;

create table public.leaderboards (
  id bigint generated always as identity primary key,
  world_id text not null references public.worlds (id) on delete cascade,
  season integer not null,
  user_id uuid references auth.users (id) on delete set null,       -- null for realms the AI ruled at the end
  display_name text,
  nation_key text not null,
  score numeric not null,
  rank integer not null check (rank >= 1),
  created_at timestamptz not null default now(),
  unique (world_id, season, nation_key)
);
create index leaderboards_season_idx on public.leaderboards (world_id, season, rank);
alter table public.leaderboards enable row level security;
create policy leaderboards_public_read on public.leaderboards for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.leaderboards from anon, authenticated;
