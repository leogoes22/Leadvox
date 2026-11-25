-- Nova LeadVox (Z-PRO) no painel e no motor (25/11/2026).
-- O banco só aceitava o endereço do CRM antigo (https://chat…api.leadvox.com.br). Este arquivo libera TAMBÉM o endereço da
-- nova LeadVox, em duas funções, e não muda mais nada:
--   1) lv_set_chat_credentials: "Credenciais de API" do painel aceita https://apicrm.leadvox.com.br/v2.
--   2) lv_motor_conectar: o endereço de envio do motor pode ser o da ponte do n8n (que traduz o envio para a API da nova
--      LeadVox): https://n8n.leadvox.com.br/webhook/<id>/nl-saida/v1/api/external/<apiId>/?token=…
-- O que já funciona continua igual: os endereços do CRM antigo seguem valendo, com a mesma regra de antes.
-- O tenant e o número da nova LeadVox chegam aqui com 100000 somado (feito no painel) para nunca colidir com os do CRM antigo.
-- Pode rodar mais de uma vez (create or replace). Para voltar ao que era: rodar de novo chat_credentials.sql e motor_link.sql.
-- Rodar no editor SQL do Supabase "Agentes de IA LeadVox", uma vez, depois de chat_credentials.sql e motor_link.sql.
begin;

-- 1) Credenciais: dono ou admin da empresa grava; valida host, ID e tamanho do token (agora também apicrm).
create or replace function public.lv_set_chat_credentials(org uuid,root text,api text,tok text) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 if not exists(select 1 from public.lv_memberships where organization_id=org and user_id=auth.uid() and role in('owner','admin')) then raise exception 'forbidden'; end if;
 if root !~ '^https://(chat[0-9]{0,2}api|apicrm)\.leadvox\.com\.br/v[0-9]{1,2}$' or api !~ '^[A-Za-z0-9_-]{1,100}$' or length(tok) not between 10 and 4000 then raise exception 'invalid'; end if;
 select secret_id into sid from leadvox_private.chat_credentials where organization_id=org;
 if sid is null then
  sid:=vault.create_secret(tok,'lv_chat_'||org::text,'Token do chat LeadVox');
  insert into leadvox_private.chat_credentials(organization_id,api_root,api_id,secret_id) values(org,root,api,sid);
 else
  perform vault.update_secret(sid,tok);
  update leadvox_private.chat_credentials set api_root=root,api_id=api,updated_at=now() where organization_id=org;
 end if;
end;$$;

-- 2) Liga a conta do motor ao número: o endereço de envio é o do CRM antigo ou o da ponte da nova LeadVox.
create or replace function public.lv_motor_conectar(org uuid,tenant integer,sessao integer,url text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_conta text;
begin
 v_conta:=leadvox_private.motor_conta(org,true);
 if v_conta is null then raise exception 'forbidden'; end if;
 if tenant is null or sessao is null
    or (url !~ '^https://chat[0-9]{0,2}api\.leadvox\.com\.br/v[0-9]{1,2}/api/external/'
        and url !~ '^https://n8n\.leadvox\.com\.br/webhook/[0-9a-f-]{36}/nl-saida/v[0-9]{1,2}/api/external/[A-Za-z0-9_-]{1,100}/\?token=[^&#[:space:]]{10,}$')
 then raise exception 'invalid'; end if;
 return public.iag_admin_conexao_conta(v_conta,jsonb_build_object('tenantId',tenant,'sessionId',sessao,'canal','whatsapp','testadoEm',now()),jsonb_build_object('leadvoxUrlEnvio',url));
end;$$;

insert into leadvox_private.sql_aplicado(arquivo) values('nova_leadvox.sql') on conflict(arquivo) do nothing;
commit;
notify pgrst,'reload schema';
