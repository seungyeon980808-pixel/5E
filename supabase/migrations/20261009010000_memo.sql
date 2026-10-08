-- Shared memo board. Only the owner can read entries after 24 hours.
-- The admin configures private.memo_owners separately; never accept first-login ownership.
create schema if not exists private;
revoke all on schema private from public;
create table if not exists private.memo_owners (
  email text primary key check (email = lower(trim(email))),
  singleton boolean not null default true unique check (singleton)
);
revoke all on private.memo_owners from public, anon, authenticated;

create or replace function private.memo_is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.identities i join private.memo_owners o
      on lower(i.identity_data ->> 'email') = o.email
    where i.user_id = auth.uid() and i.provider = 'google'
      and i.identity_data ->> 'email_verified' = 'true'
  );
$$;
revoke all on function private.memo_is_owner() from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.memo_is_owner() to anon, authenticated;

create or replace function private.memo_owner_configured() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.memo_owners);
$$;
revoke all on function private.memo_owner_configured() from public;
grant execute on function private.memo_owner_configured() to anon, authenticated;

create table if not exists public.memo_entries (
  id uuid primary key,
  kind text not null check (kind in ('memo','sticky')),
  title text not null default '' check (char_length(title) <= 160),
  body text not null default '' check (char_length(body) <= 100000),
  color text not null default 'lilac' check (color in ('lilac','amber','slate','rose')),
  x double precision not null default 0.1 check (x between 0 and 1),
  y double precision not null default 0.1 check (y between 0 and 1),
  tilt double precision not null default -2 check (tilt between -4 and 4),
  z integer not null default 1 check (z between 0 and 1000000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index if not exists memo_entries_created on public.memo_entries(created_at desc, id desc);
alter table public.memo_entries enable row level security;
drop policy if exists memo_read on public.memo_entries;
create policy memo_read on public.memo_entries for select to anon, authenticated
  using (created_at > now() - interval '24 hours' or private.memo_is_owner());
revoke all on public.memo_entries from public, anon, authenticated;
grant select on public.memo_entries to anon, authenticated;

create or replace function public.memo_snapshot(p_archive boolean default false, p_cursor jsonb default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb; owner boolean := private.memo_is_owner();
begin
  if p_archive and not owner then raise exception 'Owner login required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc, e.id desc), '[]'::jsonb) into result
  from (select * from public.memo_entries
    where (case when p_archive then created_at <= now() - interval '24 hours' else created_at > now() - interval '24 hours' end)
      and (p_cursor is null or (created_at, id) < ((p_cursor->>'created_at')::timestamptz, (p_cursor->>'id')::uuid))
    order by created_at desc, id desc limit 101) e;
  return jsonb_build_object('server_time',now(),'owner',owner,'owner_configured',private.memo_owner_configured(),'entries',result);
end;
$$;

-- Client UUID makes a repeated create safe after a lost network response.
create or replace function public.memo_create(p_id uuid, p_entry jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result public.memo_entries;
begin
  if jsonb_typeof(p_entry) <> 'object' or p_entry - array['kind','title','body','color','x','y','tilt','z'] <> '{}'::jsonb
    then raise exception 'Invalid memo fields' using errcode='22023'; end if;
  if coalesce(p_entry->>'kind','memo') = 'memo' and length(trim(coalesce(p_entry->>'body',''))) = 0
    then raise exception 'Memo body required' using errcode='22023'; end if;
  insert into public.memo_entries(id,kind,title,body,color,x,y,tilt,z) values
    (p_id,coalesce(p_entry->>'kind','memo'),coalesce(p_entry->>'title',''),coalesce(p_entry->>'body',''),
     coalesce(p_entry->>'color','lilac'),coalesce((p_entry->>'x')::float8,0.1),coalesce((p_entry->>'y')::float8,0.1),
     coalesce((p_entry->>'tilt')::float8,-2),coalesce((p_entry->>'z')::integer,1)) on conflict(id) do nothing;
  select * into result from public.memo_entries where id=p_id;
  if result.created_at <= now() - interval '24 hours' and not private.memo_is_owner()
    then raise exception 'Memo has moved to archive' using errcode='42501'; end if;
  return to_jsonb(result);
end;
$$;

create or replace function public.memo_update(p_id uuid, p_version integer, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result public.memo_entries;
begin
  if jsonb_typeof(p_patch) <> 'object' or p_patch - array['kind','title','body','color','x','y','tilt','z'] <> '{}'::jsonb
    then raise exception 'Invalid memo fields' using errcode='22023'; end if;
  select * into result from public.memo_entries where id=p_id for update;
  if not found then raise exception 'Memo no longer exists' using errcode='P0002'; end if;
  if result.created_at <= now() - interval '24 hours' and not private.memo_is_owner()
    then raise exception 'Memo has moved to archive' using errcode='42501'; end if;
  if p_version is null or result.version <> p_version then raise exception 'Memo changed on another device' using errcode='40001'; end if;
  update public.memo_entries set
    kind=coalesce(p_patch->>'kind',kind), title=coalesce(p_patch->>'title',title), body=coalesce(p_patch->>'body',body),
    color=coalesce(p_patch->>'color',color), x=coalesce((p_patch->>'x')::float8,x), y=coalesce((p_patch->>'y')::float8,y),
    tilt=coalesce((p_patch->>'tilt')::float8,tilt), z=coalesce((p_patch->>'z')::integer,z),
    version=version+1, updated_at=clock_timestamp()
  where id=p_id returning * into result;
  if result.kind='memo' and length(trim(result.body))=0 then raise exception 'Memo body required' using errcode='22023'; end if;
  return to_jsonb(result);
end;
$$;

create or replace function public.memo_delete(p_id uuid, p_version integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare result public.memo_entries;
begin
  select * into result from public.memo_entries where id=p_id for update;
  if not found then return true; end if;
  if result.created_at <= now() - interval '24 hours' and not private.memo_is_owner()
    then raise exception 'Memo has moved to archive' using errcode='42501'; end if;
  if p_version is null or result.version <> p_version then raise exception 'Memo changed on another device' using errcode='40001'; end if;
  delete from public.memo_entries where id=p_id;
  return true;
end;
$$;
revoke all on function public.memo_snapshot(boolean,jsonb), public.memo_create(uuid,jsonb), public.memo_update(uuid,integer,jsonb), public.memo_delete(uuid,integer) from public;
grant execute on function public.memo_snapshot(boolean,jsonb), public.memo_create(uuid,jsonb), public.memo_update(uuid,integer,jsonb), public.memo_delete(uuid,integer) to anon, authenticated;
-- A change is only an invalidation signal. Clients fetch a fresh RLS-filtered snapshot.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
    and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='memo_entries')
  then alter publication supabase_realtime add table public.memo_entries; end if;
end $$;
