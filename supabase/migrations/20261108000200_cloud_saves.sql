-- Sundered Crowns · migration 2: cloud saves for single player.
-- Metadata lives in public.saves; the compressed save file lives in the private Storage bucket 'saves'
-- at path '<user id>/<save id>.bin'. A user can only read and write inside their own folder.

create table public.saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_id text check (local_id is null or char_length(local_id) <= 64),  -- id of the matching local (IndexedDB) save
  label text not null check (char_length(label) between 1 and 120),
  nation_key text check (nation_key is null or char_length(nation_key) <= 64),
  game_day integer not null check (game_day >= 0),
  game_date text check (game_date is null or char_length(game_date) <= 40),
  start_year integer not null default 1356 check (start_year between 1300 and 1900),
  save_version integer not null default 1,
  size_bytes integer not null check (size_bytes between 1 and 52428800),
  client_saved_at timestamptz not null,           -- when the save was written on the device
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_id)
);
create index saves_user_idx on public.saves (user_id, updated_at desc);

alter table public.saves enable row level security;
create policy saves_select_own on public.saves for select to authenticated using (user_id = (select auth.uid()));
create policy saves_insert_own on public.saves for insert to authenticated with check (user_id = (select auth.uid()));
create policy saves_update_own on public.saves for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy saves_delete_own on public.saves for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.saves from anon;

-- at most 30 cloud saves per account (keeps the free tier storage bounded)
create function public.saves_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.saves where user_id = new.user_id) >= 30 then
    raise exception 'cloud save limit reached (30)';
  end if;
  return new;
end $$;
create trigger saves_limit before insert on public.saves for each row execute function public.saves_limit();

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger saves_touch before update on public.saves for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- storage buckets + policies
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('saves', 'saves', false, 52428800, array['application/octet-stream']),
       ('world-snapshots', 'world-snapshots', false, 209715200, array['application/octet-stream'])  -- service role only
on conflict (id) do nothing;

create policy saves_objects_select_own on storage.objects for select to authenticated
  using (bucket_id = 'saves' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy saves_objects_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'saves' and name ~ ('^' || (select auth.uid())::text || '/[A-Za-z0-9_-]{1,64}\.bin$'));
create policy saves_objects_update_own on storage.objects for update to authenticated
  using (bucket_id = 'saves' and split_part(name, '/', 1) = (select auth.uid())::text)
  with check (bucket_id = 'saves' and name ~ ('^' || (select auth.uid())::text || '/[A-Za-z0-9_-]{1,64}\.bin$'));
create policy saves_objects_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'saves' and split_part(name, '/', 1) = (select auth.uid())::text);
-- no policy for 'world-snapshots': only the world server (service role) can touch it
