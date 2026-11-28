-- Split the shared project into one schema per app: sentinel (SentinalMap) and reado (Reado).
-- Tables move with ALTER TABLE ... SET SCHEMA: the data, indexes, RLS, policies, triggers and
-- Realtime publication membership all stay with them. A full copy was taken first in
-- backup_20261128. Temporary views in public keep the already-deployed sites working until
-- their new code is live; 20261128120100_drop_compat_views.sql removes them.

create schema if not exists sentinel;
create schema if not exists reado;
grant usage on schema sentinel, reado to anon, authenticated, service_role;

-- ---------- Sentinel ----------
alter table public.allowed_emails     set schema sentinel;
alter table public.points_of_interest set schema sentinel;
alter table public.poi_topics         set schema sentinel;
alter table public.place_labels       set schema sentinel;
alter table public.map_shapes         set schema sentinel;
alter table public.layer_notes        set schema sentinel;

alter function public.is_allowed()         set schema sentinel;
alter function public.new_id()             set schema sentinel;
alter function public.touch_updated_at()   set schema sentinel;
alter function public.delete_shape_notes() set schema sentinel;

-- Bodies named public.* explicitly; redefine them in place (same function, policies keep pointing at it).
create or replace function sentinel.is_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from sentinel.allowed_emails where email = lower(auth.jwt() ->> 'email'))
$$;
create or replace function sentinel.new_id() returns text
language sql set search_path = '' as $$ select encode(extensions.gen_random_bytes(12), 'hex') $$;
create or replace function sentinel.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$ begin new.updated_date = now(); return new; end $$;
create or replace function sentinel.delete_shape_notes() returns trigger
language plpgsql set search_path = '' as $$ begin delete from sentinel.layer_notes where shape_id = old.id; return old; end $$;

-- ---------- Reado (tables lose the now-redundant reado_ prefix) ----------
alter table public.reado_books         set schema reado;
alter table public.reado_reading_state set schema reado;
alter table public.reado_highlights    set schema reado;
alter table public.reado_bookmarks     set schema reado;
alter table public.reado_sessions      set schema reado;
alter table public.reado_secret        set schema reado;
alter table reado.reado_books         rename to books;
alter table reado.reado_reading_state rename to reading_state;
alter table reado.reado_highlights    rename to highlights;
alter table reado.reado_bookmarks     rename to bookmarks;
alter table reado.reado_sessions      rename to sessions;
alter table reado.reado_secret        rename to secret;

alter function public.reado_key_ok() set schema reado;
alter function public.reado_owner()  set schema reado;
alter function public.reado_touch()  set schema reado;
alter function reado.reado_key_ok() rename to key_ok;
alter function reado.reado_owner()  rename to owner_id;
alter function reado.reado_touch()  rename to touch;

create or replace function reado.key_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from reado.secret s
    where s.key = coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-reado-key', '')
  );
$$;
create or replace function reado.owner_id() returns uuid
language sql stable security definer set search_path = '' as $$ select owner from reado.secret where id = 1 $$;

-- ---------- Grants ----------
grant select, insert, update, delete on all tables in schema sentinel, reado to anon, authenticated;
grant all on all tables in schema sentinel, reado to service_role;
-- Read only through security-definer functions:
revoke all on sentinel.allowed_emails, reado.secret from anon, authenticated;
grant execute on function sentinel.is_allowed(), sentinel.new_id() to anon, authenticated;
grant execute on function reado.key_ok(), reado.owner_id() to anon, authenticated;
alter default privileges in schema sentinel, reado grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema sentinel, reado grant all on tables to service_role;

-- ---------- Temporary compatibility for the currently deployed code ----------
do $$
declare t text;
begin
  foreach t in array array['points_of_interest','poi_topics','place_labels','map_shapes','layer_notes'] loop
    execute format('create view public.%I with (security_invoker = true) as select * from sentinel.%I', t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
  foreach t in array array['books','reading_state','highlights','bookmarks','sessions'] loop
    execute format('create view public.%I with (security_invoker = true) as select * from reado.%I', 'reado_' || t, t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', 'reado_' || t);
  end loop;
end $$;
create view public.reado_secret as select * from reado.secret;
revoke all on public.reado_secret from anon, authenticated;
grant select on public.reado_secret to service_role;
create function public.is_allowed() returns boolean
language sql stable security invoker set search_path = '' as $$ select sentinel.is_allowed() $$;
grant execute on function public.is_allowed() to authenticated;

notify pgrst, 'reload schema';
