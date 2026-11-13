-- Sentinel Pulse — schema, security and realtime
-- Run once in the Supabase SQL editor (or with `supabase db push`).

create extension if not exists pgcrypto;

create or replace function public.new_id() returns text
language sql volatile as $$ select encode(gen_random_bytes(12), 'hex') $$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_date = now(); return new; end $$;

-- Topics that group points of interest
create table if not exists public.poi_topics (
  id text primary key default public.new_id(),
  name text not null unique,
  color text not null default '#3b82f6',
  description text not null default '',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

-- Events / points on the map
create table if not exists public.points_of_interest (
  id text primary key default public.new_id(),
  title text not null,
  topic text,
  event_date text,                 -- kept exactly as entered (the app parses it)
  latitude double precision not null,
  longitude double precision not null,
  description text,
  marker_color text not null default '#ef4444',
  media_url text,
  tags jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists points_topic_idx on public.points_of_interest (topic);
create index if not exists points_event_date_idx on public.points_of_interest (event_date desc);

-- Free text labels placed on the map
create table if not exists public.place_labels (
  id text primary key default public.new_id(),
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  color text not null default '#facc15',
  font_size text not null default 'medium',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

-- Polygons, grouped into layers
create table if not exists public.map_shapes (
  id text primary key default public.new_id(),
  shape_type text not null default 'polygon',
  geojson text not null,                  -- GeoJSON feature as a string, as the app stores it
  label text not null default '',
  color text not null default '#3b82f6',
  fill_type text not null default 'color',   -- 'color' | 'flag'
  flag text,
  opacity double precision not null default 0.3,
  layer_name text not null default 'default',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists shapes_layer_idx on public.map_shapes (layer_name);

-- Notes (text / link / image) attached to a shape or to a whole layer
create table if not exists public.layer_notes (
  id text primary key default public.new_id(),
  shape_id text,
  layer_name text not null default '',
  kind text not null default 'text',          -- 'text' | 'link' | 'image'
  title text not null default '',
  text text not null default '',
  url text not null default '',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists notes_shape_idx on public.layer_notes (shape_id);

-- Deleting a shape removes its notes
create or replace function public.delete_shape_notes() returns trigger
language plpgsql as $$ begin delete from public.layer_notes where shape_id = old.id; return old; end $$;
drop trigger if exists map_shapes_delete_notes on public.map_shapes;
create trigger map_shapes_delete_notes after delete on public.map_shapes
  for each row execute function public.delete_shape_notes();

-- Private app: signing in is not enough. Only emails listed here get any access.
-- Add a person:    insert into public.allowed_emails (email) values ('someone@example.com');
-- Remove a person: delete from public.allowed_emails where email = 'someone@example.com';
create table if not exists public.allowed_emails (
  email text primary key check (email = lower(email)),
  created_date timestamptz not null default now()
);
alter table public.allowed_emails enable row level security;   -- no policies: not readable from the browser

create or replace function public.is_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowed_emails where email = lower(auth.jwt() ->> 'email'))
$$;
revoke all on function public.is_allowed() from public, anon;
grant execute on function public.is_allowed() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['poi_topics','points_of_interest','place_labels','map_shapes','layer_notes'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);

    -- Only signed-in users on the allow-list can read or write.
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "allowed users: full access" on public.%I', t);
    execute format('create policy "allowed users: full access" on public.%I for all to authenticated using (public.is_allowed()) with check (public.is_allowed())', t);

    -- Realtime: every insert/update/delete is pushed to open browsers
    execute format('alter table public.%I replica identity full', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

