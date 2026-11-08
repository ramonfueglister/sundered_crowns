-- Sundered Crowns · migration 1: profiles and admin roles.
-- Runs on Supabase (auth/storage schemas provided by the platform). Row Level Security is enabled on every table.
-- Clients only ever use the anon key (roles anon / authenticated); the world server uses the service role (bypasses RLS).

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    check (char_length(display_name) between 3 and 24
           and display_name = btrim(display_name)
           and display_name !~ '[[:cntrl:]<>"\\]'),
  created_at timestamptz not null default now()
);
-- display names are unique regardless of case
create unique index profiles_display_name_key on public.profiles (lower(display_name));

alter table public.profiles enable row level security;
-- a profile is private to its owner; public surfaces (leaderboards, rosters) carry a copy of the display name
create policy profiles_select_own on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_delete_own on public.profiles for delete to authenticated using (id = (select auth.uid()));
revoke all on public.profiles from anon;

-- every new account gets a profile with a provisional name (changeable in the game's online panel)
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare wanted text;
begin
  wanted := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  if char_length(wanted) < 3 or char_length(wanted) > 24 or wanted ~ '[[:cntrl:]<>"\\]'
     or exists (select 1 from public.profiles p where lower(p.display_name) = lower(wanted)) then
    wanted := 'Player ' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  insert into public.profiles (id, display_name) values (new.id, wanted) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------- admin roles
create table public.admin_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'moderator')),
  granted_at timestamptz not null default now(),
  note text
);
alter table public.admin_roles enable row level security;
-- users may see their own role (so the client can show the admin tools); only the service role grants roles
create policy admin_roles_select_own on public.admin_roles for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete, truncate on public.admin_roles from anon, authenticated;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_roles where user_id = auth.uid() and role = 'admin')
$$;
