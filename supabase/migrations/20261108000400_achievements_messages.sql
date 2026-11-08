-- Sundered Crowns · migration 4: achievements and player messages.
-- Achievement definitions live in code (src/online/achievements.ts); the world server checks them against the
-- authoritative game state and records them here. Achievements are cosmetic only.

create table public.achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{2,48}$'),
  earned_at timestamptz not null default now(),
  world_id text references public.worlds (id) on delete set null,
  season integer,
  nation_key text,
  primary key (user_id, key)
);
alter table public.achievements enable row level security;
create policy achievements_select_own on public.achievements for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete, truncate on public.achievements from anon, authenticated;
revoke select on public.achievements from anon;

-- Messages between players of one world: world chat (to_user null) and direct messages / diplomatic offers.
-- Offers are created by the world server (it validates them against the game state and enforces the treaty);
-- clients may only post chat lines, and only in worlds where they hold a seat.
create table public.player_messages (
  id bigint generated always as identity primary key,
  world_id text not null references public.worlds (id) on delete cascade,
  season integer not null,
  kind text not null check (kind in ('chat', 'offer', 'reply', 'system')),
  from_user uuid references auth.users (id) on delete set null,
  to_user uuid references auth.users (id) on delete cascade,        -- null = everyone in the world
  from_nation text,
  to_nation text,
  body text not null default '' check (char_length(body) <= 500),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'sent' check (status in ('sent', 'open', 'accepted', 'declined', 'expired')),
  game_day integer,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create index player_messages_world_idx on public.player_messages (world_id, created_at desc);
create index player_messages_to_idx on public.player_messages (to_user, created_at desc);
alter table public.player_messages enable row level security;

create function public.holds_seat(w text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.world_players where world_id = w and user_id = auth.uid())
$$;

create policy player_messages_select on public.player_messages for select to authenticated using (
  from_user = (select auth.uid()) or to_user = (select auth.uid())
  or (to_user is null and kind in ('chat', 'system') and public.holds_seat(world_id))
);
create policy player_messages_insert_chat on public.player_messages for insert to authenticated with check (
  kind = 'chat' and status = 'sent' and from_user = (select auth.uid()) and public.holds_seat(world_id)
  and char_length(btrim(body)) between 1 and 500
);
revoke update, delete, truncate on public.player_messages from anon, authenticated;
revoke all on public.player_messages from anon;

-- chat flood guard for direct inserts: at most 5 lines per 10 seconds per user
create function public.chat_rate_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'chat' and new.from_user is not null and (
    select count(*) from public.player_messages
    where from_user = new.from_user and kind = 'chat' and created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'slow down';
  end if;
  return new;
end $$;
create trigger player_messages_rate before insert on public.player_messages for each row execute function public.chat_rate_limit();
