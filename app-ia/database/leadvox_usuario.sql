-- Usuário da LeadVox por empresa (17/11/2026). Desde 17/11 a LeadVox recusa o token da API ("Invalid token.") nas rotas
-- que a tela do chat usa, fora do /v1: funis e oportunidades, departamentos, origens, motivos de fechamento e mover o card.
-- Essas rotas só abrem com o login de um usuário da LeadVox. O dono salva em Credenciais de API o e-mail e a senha de um
-- usuário (de preferência um usuário só para a IA); a senha vai para o Vault e o painel nunca devolve a senha.
-- Rodar depois de rastreio_contas.sql (ele tem a lista de conexões mais recente).

alter table leadvox_private.integrations drop constraint if exists integrations_provider_check;
alter table leadvox_private.integrations add constraint integrations_provider_check check(provider in('estoque','asaas','elevenlabs','meta','meta_ads','leadvox_usuario'));
create or replace function public.lv_set_integration(org uuid,prov text,conf jsonb,sec text) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 if not exists(select 1 from public.lv_memberships where organization_id=org and user_id=auth.uid() and role in('owner','admin')) then raise exception 'forbidden'; end if;
 if prov not in('estoque','asaas','elevenlabs','meta','meta_ads','leadvox_usuario') or jsonb_typeof(conf)<>'object' or octet_length(conf::text)>4000 or length(coalesce(sec,''))>4000 then raise exception 'invalid'; end if;
 select secret_id into sid from leadvox_private.integrations where organization_id=org and provider=prov;
 if coalesce(sec,'')<>'' then
  if sid is null then sid:=vault.create_secret(sec,'lv_'||prov||'_'||org::text,'Conexão '||prov);
  else perform vault.update_secret(sid,sec); end if;
 end if;
 insert into leadvox_private.integrations(organization_id,provider,settings,secret_id) values(org,prov,conf,sid)
 on conflict(organization_id,provider) do update set settings=excluded.settings,secret_id=excluded.secret_id,updated_at=now();
end;$$;

-- Para o motor (n8n, service_role): o usuário da LeadVox da conta, para entrar nas rotas da tela (origem, mover o card).
create or replace function public.iag_leadvox_usuario(p_conta text) returns table(email text,senha text) language sql stable security definer set search_path='' as $$
 select i.settings->>'email',s.decrypted_secret
 from leadvox_private.integrations i join leadvox_private.motor_contas m on m.organization_id=i.organization_id
 left join vault.decrypted_secrets s on s.id=i.secret_id
 where m.conta=p_conta and i.provider='leadvox_usuario'
 limit 1;
$$;
revoke all on function public.iag_leadvox_usuario(text) from public,anon,authenticated;
grant execute on function public.iag_leadvox_usuario(text) to service_role;

insert into leadvox_private.sql_aplicado(arquivo) values('leadvox_usuario.sql') on conflict(arquivo) do nothing;
