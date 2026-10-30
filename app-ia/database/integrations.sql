-- Outras conexões de cada empresa: fonte de estoque (AutoCerto, Revenda Mais ou Estoque LeadVox) e Asaas.
-- A parte pública fica em settings; senha, chave de API ou URL com token vão para o Vault. Rodar depois de chat_credentials.sql.
create table if not exists leadvox_private.integrations(
 organization_id uuid not null references public.lv_organizations(id) on delete cascade,
 provider text not null check(provider in('estoque','asaas')),
 settings jsonb not null default '{}'::jsonb check(jsonb_typeof(settings)='object' and octet_length(settings::text)<=4000),
 secret_id uuid,
 updated_at timestamptz not null default now(),
 primary key(organization_id,provider)
);
alter table leadvox_private.integrations enable row level security;
revoke all on leadvox_private.integrations from public,anon,authenticated;

-- Só dono ou admin grava. Segredo vazio mantém o que já estava salvo.
create or replace function public.lv_set_integration(org uuid,prov text,conf jsonb,sec text) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 if not exists(select 1 from public.lv_memberships where organization_id=org and user_id=auth.uid() and role in('owner','admin')) then raise exception 'forbidden'; end if;
 if prov not in('estoque','asaas') or jsonb_typeof(conf)<>'object' or octet_length(conf::text)>4000 or length(coalesce(sec,''))>4000 then raise exception 'invalid'; end if;
 select secret_id into sid from leadvox_private.integrations where organization_id=org and provider=prov;
 if coalesce(sec,'')<>'' then
  if sid is null then sid:=vault.create_secret(sec,'lv_'||prov||'_'||org::text,'Conexão '||prov);
  else perform vault.update_secret(sid,sec); end if;
 end if;
 insert into leadvox_private.integrations(organization_id,provider,settings,secret_id) values(org,prov,conf,sid)
 on conflict(organization_id,provider) do update set settings=excluded.settings,secret_id=excluded.secret_id,updated_at=now();
end;$$;

-- Qualquer membro vê o que está conectado; nunca o segredo.
create or replace function public.lv_integrations(org uuid) returns table(provider text,settings jsonb,has_secret boolean,updated_at timestamptz) language sql stable security definer set search_path='' as $$
 select i.provider,i.settings,i.secret_id is not null,i.updated_at from leadvox_private.integrations i
 where i.organization_id=org and exists(select 1 from public.lv_memberships m where m.organization_id=org and m.user_id=(select auth.uid()));
$$;

-- Usado pelo servidor do painel; só dono ou admin.
create or replace function public.lv_integration_secret(org uuid,prov text) returns table(settings jsonb,secret text) language sql stable security definer set search_path='' as $$
 select i.settings,s.decrypted_secret from leadvox_private.integrations i left join vault.decrypted_secrets s on s.id=i.secret_id
 where i.organization_id=org and i.provider=prov and exists(select 1 from public.lv_memberships m where m.organization_id=org and m.user_id=(select auth.uid()) and m.role in('owner','admin'));
$$;

revoke all on function public.lv_set_integration(uuid,text,jsonb,text) from public,anon;
revoke all on function public.lv_integrations(uuid) from public,anon;
revoke all on function public.lv_integration_secret(uuid,text) from public,anon;
grant execute on function public.lv_set_integration(uuid,text,jsonb,text) to authenticated;
grant execute on function public.lv_integrations(uuid) to authenticated;
grant execute on function public.lv_integration_secret(uuid,text) to authenticated;
