-- LeadVox IA — voz da ElevenLabs. Rodar depois de integrations.sql e motor_link.sql.
-- A chave é salva em Credenciais de API (vai para o Vault, como a do Asaas).
-- O painel nunca devolve a chave; só o motor (n8n, chave de serviço) lê, pela conta do motor.
alter table leadvox_private.integrations drop constraint if exists integrations_provider_check;
alter table leadvox_private.integrations add constraint integrations_provider_check check(provider in('estoque','asaas','elevenlabs'));

-- Só dono ou admin grava. Segredo vazio mantém o que já estava salvo.
create or replace function public.lv_set_integration(org uuid,prov text,conf jsonb,sec text) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 if not exists(select 1 from public.lv_memberships where organization_id=org and user_id=auth.uid() and role in('owner','admin')) then raise exception 'forbidden'; end if;
 if prov not in('estoque','asaas','elevenlabs') or jsonb_typeof(conf)<>'object' or octet_length(conf::text)>4000 or length(coalesce(sec,''))>4000 then raise exception 'invalid'; end if;
 select secret_id into sid from leadvox_private.integrations where organization_id=org and provider=prov;
 if coalesce(sec,'')<>'' then
  if sid is null then sid:=vault.create_secret(sec,'lv_'||prov||'_'||org::text,'Conexão '||prov);
  else perform vault.update_secret(sid,sec); end if;
 end if;
 insert into leadvox_private.integrations(organization_id,provider,settings,secret_id) values(org,prov,conf,sid)
 on conflict(organization_id,provider) do update set settings=excluded.settings,secret_id=excluded.secret_id,updated_at=now();
end;$$;

-- Chave da ElevenLabs da conta do motor. Só a chave de serviço (n8n) executa.
create or replace function public.iag_voz_elevenlabs(p_conta text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('chave',s.decrypted_secret) from leadvox_private.motor_contas m
 join leadvox_private.integrations i on i.organization_id=m.organization_id and i.provider='elevenlabs'
 join vault.decrypted_secrets s on s.id=i.secret_id
 where m.conta=p_conta limit 1;
$$;
revoke all on function public.iag_voz_elevenlabs(text) from public,anon,authenticated;
grant execute on function public.iag_voz_elevenlabs(text) to service_role;
