-- Dono da plataforma (LeadVox): lê todas as empresas e configurações, sem poder editá-las.
-- Rodar depois de organizations.sql.
create table if not exists leadvox_private.platform_admins(
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table leadvox_private.platform_admins enable row level security;
revoke all on leadvox_private.platform_admins from public,anon,authenticated;
create or replace function public.lv_is_platform_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from leadvox_private.platform_admins where user_id=(select auth.uid()));
$$;
revoke all on function public.lv_is_platform_admin() from public,anon;
grant execute on function public.lv_is_platform_admin() to authenticated;
drop policy if exists lv_org_admin_read on public.lv_organizations;
create policy lv_org_admin_read on public.lv_organizations for select to authenticated using((select public.lv_is_platform_admin()));
drop policy if exists lv_workspace_admin_read on public.lv_workspace;
create policy lv_workspace_admin_read on public.lv_workspace for select to authenticated using((select public.lv_is_platform_admin()));
insert into leadvox_private.platform_admins(user_id) select id from auth.users where email='contato@leadvox.com.br' on conflict do nothing;
