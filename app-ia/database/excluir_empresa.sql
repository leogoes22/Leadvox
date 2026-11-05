-- Super Admin: excluir um cliente de vez (diferente de suspender, que pode ser reativado). Não tem volta.
-- Apaga a empresa, os robôs, o catálogo, as cobranças dela e as chaves guardadas no cofre.
-- Recusa se o nome digitado não confere, se é a empresa do próprio admin ou se ainda há assinatura no Asaas.
-- O login da pessoa continua existindo: ela pode entrar e criar outra empresa.
-- Os arquivos saem na limpeza da madrugada: a conta fica anotada em contas_excluidas e iag_arquivos_excluidos lista as pastas dela.
-- Rodar depois de motor_link.sql, assinaturas.sql, billing.sql, integrations.sql, chat_credentials.sql e openai.sql.

create table if not exists leadvox_private.contas_excluidas(
 conta text primary key,
 organization_id uuid not null,
 nome text not null,
 excluida_em timestamptz not null default now()
);
alter table leadvox_private.contas_excluidas enable row level security;
revoke all on leadvox_private.contas_excluidas from public,anon,authenticated;

create or replace function public.lv_admin_excluir_empresa(org uuid,confirma text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.lv_organizations; v_conta text; a leadvox_private.saas_assinaturas; cofre uuid[];
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 select * into o from public.lv_organizations where id=org for update;
 if o.id is null then return jsonb_build_object('ok',false,'erro','nao_encontrada'); end if;
 if btrim(coalesce(confirma,''))<>btrim(o.name) then return jsonb_build_object('ok',false,'erro','confirmacao'); end if;
 if o.owner_id=auth.uid() then return jsonb_build_object('ok',false,'erro','propria_conta'); end if;
 select * into a from leadvox_private.saas_assinaturas where organization_id=org;
 if a.asaas_assinatura is not null and a.status<>'cancelada' then return jsonb_build_object('ok',false,'erro','assinatura_ativa'); end if;
 select conta into v_conta from leadvox_private.motor_contas where organization_id=org;
 -- chaves no cofre: os registros somem com a empresa, os segredos não
 select coalesce(array_agg(s.secret_id),'{}') into cofre from (
  select secret_id from leadvox_private.integrations where organization_id=org and secret_id is not null
  union all select secret_id from leadvox_private.chat_credentials where organization_id=org and secret_id is not null
  union all select secret_id from leadvox_private.openai_keys where organization_id=org
 ) s;
 -- cobranças que a empresa faz aos clientes dela (não apagam em cascata)
 delete from public.lv_billing_payments where organization_id=org;
 delete from public.lv_billing_contracts where organization_id=org;
 delete from public.lv_billing_rules where organization_id=org;
 delete from public.lv_billing_customers where organization_id=org;
 delete from public.lv_billing_plans where organization_id=org;
 delete from public.lv_organizations where id=org;
 delete from vault.secrets where id=any(cofre);
 if v_conta is not null then
  insert into leadvox_private.contas_excluidas(conta,organization_id,nome) values(v_conta,org,o.name) on conflict(conta) do nothing;
  delete from public.iag_relatorio where conta=v_conta;
  delete from public.iag_material where conta=v_conta;
  delete from public.iag_conta_segredos where conta=v_conta;
  delete from public.iag_conta where chave=v_conta;
 end if;
 insert into leadvox_private.saas_admin_log(organization_id,admin_id,acao,dados) values(org,auth.uid(),'excluir',jsonb_build_object('nome',o.name,'conta',v_conta));
 return jsonb_build_object('ok',true,'nome',o.name,'conta',v_conta);
end;$$;
revoke all on function public.lv_admin_excluir_empresa(uuid,text) from public,anon;
grant execute on function public.lv_admin_excluir_empresa(uuid,text) to authenticated;

-- Pastas das contas excluídas, para a limpeza da madrugada apagar. Só a pasta com o nome exato da conta.
create or replace function public.iag_arquivos_excluidos(limite int) returns table(bucket text,caminho text) language sql stable security definer set search_path='' as $$
 select o.bucket_id::text,o.name from storage.objects o
 join leadvox_private.contas_excluidas c on split_part(o.name,'/',1)=c.conta
 where o.bucket_id in('lv-estoque','lv-audio','lv-propostas','iag-arquivos')
 order by o.created_at limit least(greatest(coalesce(limite,1),1),1000);
$$;
revoke all on function public.iag_arquivos_excluidos(int) from public,anon,authenticated;
grant execute on function public.iag_arquivos_excluidos(int) to service_role;

insert into leadvox_private.sql_aplicado(arquivo) values('excluir_empresa.sql') on conflict(arquivo) do nothing;
