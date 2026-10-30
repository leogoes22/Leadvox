-- Conexão de cada empresa com o chat da LeadVox. O token fica no Vault do Supabase (criptografado);
-- a tabela guarda só a raiz da API, o ID da conta e a referência do segredo. Rodar depois de organizations.sql.
create table if not exists leadvox_private.chat_credentials(
 organization_id uuid primary key references public.lv_organizations(id) on delete cascade,
 api_root text not null,
 api_id text not null,
 secret_id uuid not null,
 updated_at timestamptz not null default now()
);
alter table leadvox_private.chat_credentials enable row level security;
revoke all on leadvox_private.chat_credentials from public,anon,authenticated;

-- Só dono ou admin da empresa grava. Valida host, ID e tamanho do token.
create or replace function public.lv_set_chat_credentials(org uuid,root text,api text,tok text) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 if not exists(select 1 from public.lv_memberships where organization_id=org and user_id=auth.uid() and role in('owner','admin')) then raise exception 'forbidden'; end if;
 if root !~ '^https://chat[0-9]{0,2}api\.leadvox\.com\.br/v[0-9]{1,2}$' or api !~ '^[A-Za-z0-9_-]{1,100}$' or length(tok) not between 10 and 4000 then raise exception 'invalid'; end if;
 select secret_id into sid from leadvox_private.chat_credentials where organization_id=org;
 if sid is null then
  sid:=vault.create_secret(tok,'lv_chat_'||org::text,'Token do chat LeadVox');
  insert into leadvox_private.chat_credentials(organization_id,api_root,api_id,secret_id) values(org,root,api,sid);
 else
  perform vault.update_secret(sid,tok);
  update leadvox_private.chat_credentials set api_root=root,api_id=api,updated_at=now() where organization_id=org;
 end if;
end;$$;

-- Qualquer membro vê se está conectado e qual conta; nunca o token.
create or replace function public.lv_chat_status(org uuid) returns table(api_id text,updated_at timestamptz) language sql stable security definer set search_path='' as $$
 select c.api_id,c.updated_at from leadvox_private.chat_credentials c
 where c.organization_id=org and exists(select 1 from public.lv_memberships m where m.organization_id=org and m.user_id=(select auth.uid()));
$$;

-- Usado pelo servidor do painel para consultar a LeadVox; só dono ou admin.
create or replace function public.lv_chat_secret(org uuid) returns table(api_root text,api_id text,token text) language sql stable security definer set search_path='' as $$
 select c.api_root,c.api_id,s.decrypted_secret from leadvox_private.chat_credentials c join vault.decrypted_secrets s on s.id=c.secret_id
 where c.organization_id=org and exists(select 1 from public.lv_memberships m where m.organization_id=org and m.user_id=(select auth.uid()) and m.role in('owner','admin'));
$$;

revoke all on function public.lv_set_chat_credentials(uuid,text,text,text) from public,anon;
revoke all on function public.lv_chat_status(uuid) from public,anon;
revoke all on function public.lv_chat_secret(uuid) from public,anon;
grant execute on function public.lv_set_chat_credentials(uuid,text,text,text) to authenticated;
grant execute on function public.lv_chat_status(uuid) to authenticated;
grant execute on function public.lv_chat_secret(uuid) to authenticated;
