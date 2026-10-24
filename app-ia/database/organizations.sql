create schema if not exists leadvox_private;
revoke all on schema leadvox_private from public,anon,authenticated;
create table public.lv_organizations(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id),
 name text not null check(char_length(btrim(name)) between 2 and 100),
 created_at timestamptz not null default now(),
 trial_ends_at timestamptz not null default(now()+interval '7 days'),
 unique(owner_id)
);
create table public.lv_memberships(
 organization_id uuid not null references public.lv_organizations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('owner','admin','member')),
 primary key(organization_id,user_id)
);
create index lv_memberships_user_idx on public.lv_memberships(user_id,organization_id);
create table public.lv_workspace(
 organization_id uuid primary key references public.lv_organizations(id) on delete cascade,
 settings jsonb not null default '{}'::jsonb check(jsonb_typeof(settings)='object' and octet_length(settings::text)<=100000),
 updated_at timestamptz not null default now()
);
alter table public.lv_organizations enable row level security;
alter table public.lv_memberships enable row level security;
alter table public.lv_workspace enable row level security;
revoke all on public.lv_organizations,public.lv_memberships,public.lv_workspace from anon,authenticated;
grant select on public.lv_organizations,public.lv_memberships,public.lv_workspace to authenticated;
grant insert(name) on public.lv_organizations to authenticated;
grant update(name) on public.lv_organizations to authenticated;
grant insert(organization_id,settings),update(settings) on public.lv_workspace to authenticated;
create policy lv_members_self on public.lv_memberships for select to authenticated using(user_id=(select auth.uid()));
create policy lv_org_read on public.lv_organizations for select to authenticated using(id in(select organization_id from public.lv_memberships where user_id=(select auth.uid())));
create policy lv_org_create on public.lv_organizations for insert to authenticated with check(owner_id=(select auth.uid()));
create policy lv_org_update on public.lv_organizations for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy lv_workspace_read on public.lv_workspace for select to authenticated using(organization_id in(select organization_id from public.lv_memberships where user_id=(select auth.uid())));
create policy lv_workspace_insert on public.lv_workspace for insert to authenticated with check(organization_id in(select organization_id from public.lv_memberships where user_id=(select auth.uid()) and role in('owner','admin')));
create policy lv_workspace_update on public.lv_workspace for update to authenticated using(organization_id in(select organization_id from public.lv_memberships where user_id=(select auth.uid()) and role in('owner','admin'))) with check(organization_id in(select organization_id from public.lv_memberships where user_id=(select auth.uid()) and role in('owner','admin')));
create function leadvox_private.add_owner() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or new.owner_id<>auth.uid() then raise exception 'Unauthorized'; end if;
 insert into public.lv_memberships(organization_id,user_id,role) values(new.id,new.owner_id,'owner');
 return new;
end;$$;
revoke all on function leadvox_private.add_owner() from public,anon,authenticated;
create trigger lv_org_owner after insert on public.lv_organizations for each row execute function leadvox_private.add_owner();
create function leadvox_private.touch_workspace() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=now(); return new;end;$$;
revoke all on function leadvox_private.touch_workspace() from public,anon,authenticated;
create trigger lv_workspace_updated before update on public.lv_workspace for each row execute function leadvox_private.touch_workspace();

