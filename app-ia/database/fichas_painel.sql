-- Fichas de cadastro dentro do Painel LeadVox: o dono da plataforma lista, abre e liga cada ficha a um cliente.
-- O plugin (leadvox.com.br/ficha) segue igual, pelo n8n. Aqui entram só a ligação com a empresa e a leitura pelo painel.
-- Rodar depois de fichas.sql e platform_admin.sql.
alter table leadvox_private.fichas add column if not exists organization_id uuid references public.lv_organizations(id) on delete set null;
create index if not exists fichas_organization_idx on leadvox_private.fichas(organization_id);

-- Lista para a aba Fichas de cadastro: o resumo e o cliente ligado, as mais recentes primeiro.
create or replace function public.lv_admin_fichas() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'nome',f.nome,'contato',f.contato,'status',f.status,
   'organization',f.organization_id,'empresa',o.name,
   'criadoEm',(extract(epoch from f.criado_em)*1000)::bigint,'atualizadoEm',(extract(epoch from f.atualizado_em)*1000)::bigint) order by f.atualizado_em desc),'[]'::jsonb)
  from (select * from leadvox_private.fichas order by atualizado_em desc limit 300) f
  left join public.lv_organizations o on o.id=f.organization_id);
end;$$;

-- Uma ficha inteira, com as respostas (null se não existe).
create or replace function public.lv_admin_ficha(p_id text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 return (select jsonb_build_object('id',f.id,'nome',f.nome,'contato',f.contato,'status',f.status,'dados',f.dados,
   'organization',f.organization_id,'empresa',o.name,
   'criadoEm',(extract(epoch from f.criado_em)*1000)::bigint,'atualizadoEm',(extract(epoch from f.atualizado_em)*1000)::bigint)
  from leadvox_private.fichas f left join public.lv_organizations o on o.id=f.organization_id where f.id=p_id);
end;$$;

-- Liga a ficha a um cliente (ou desliga, com org nulo). Não mexe nas respostas nem na data da ficha.
create or replace function public.lv_admin_ficha_vincular(p_id text, org uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 if org is not null and not exists(select 1 from public.lv_organizations where id=org) then return jsonb_build_object('ok',false,'erro','empresa'); end if;
 update leadvox_private.fichas set organization_id=org where id=p_id;
 if not found then return jsonb_build_object('ok',false,'erro','ficha'); end if;
 return jsonb_build_object('ok',true);
end;$$;

revoke all on function public.lv_admin_fichas(),public.lv_admin_ficha(text),public.lv_admin_ficha_vincular(text,uuid) from public,anon;
grant execute on function public.lv_admin_fichas(),public.lv_admin_ficha(text),public.lv_admin_ficha_vincular(text,uuid) to authenticated;

insert into leadvox_private.sql_aplicado(arquivo) values('fichas_painel.sql') on conflict(arquivo) do nothing;
