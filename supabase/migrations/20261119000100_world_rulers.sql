-- Sundered Crowns · migration 5: the readable copy of the rulers of each world.
-- The world server (service role) is the only writer (server/rulers_copy.ts); everybody may read. The simulation never
-- reads these tables: the world's truth is its snapshot and command log, this is a copy for queries and pages.

-- the persons of history of a world, by their row in the world's person table (ECS id)
create table public.world_persons (
  world_id text not null references public.worlds (id) on delete cascade,
  person integer not null,                 -- row in the person table of the world; never reused
  key text not null,                       -- key in the chronicle of rulers: the Wikidata id where known
  name text not null,
  house text not null default '',
  qid text,                                -- Wikidata id
  sex smallint not null check (sex in (0, 1)), -- 0 female, 1 male
  home_realm text not null,                -- realm of the first reign; the person lives in its capital
  born text,                               -- dates as the source gives them: YYYY-MM-DD, YYYY-MM or YYYY
  died text,                               -- only once the person died in this world
  born_day integer,                        -- in-game days since 1 January of the start year
  died_day integer,                        -- null while the person lives in the world
  updated_at timestamptz not null default now(),
  primary key (world_id, person)
);
create index world_persons_key_idx on public.world_persons (world_id, key);
alter table public.world_persons enable row level security;
create policy world_persons_public_read on public.world_persons for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.world_persons from anon, authenticated;

-- the reigns of a world: who held which crown from when to when
create table public.world_reigns (
  world_id text not null references public.worlds (id) on delete cascade,
  realm text not null,                     -- key of the realm
  n integer not null,                      -- place of the reign in the chronicle's list of the realm
  person integer not null,                 -- world_persons.person
  start text,                              -- dates as the source gives them
  "end" text,                              -- only once the reign ended in this world
  start_day integer,
  end_day integer,                         -- null while the reign goes on in the world
  source text not null default '',         -- the Wikipedia revision or Wikidata statement of the row
  updated_at timestamptz not null default now(),
  primary key (world_id, realm, n)
);
create index world_reigns_person_idx on public.world_reigns (world_id, person);
create index world_reigns_day_idx on public.world_reigns (world_id, start_day, end_day);
alter table public.world_reigns enable row level security;
create policy world_reigns_public_read on public.world_reigns for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.world_reigns from anon, authenticated;
