-- Saúde da conexão com a LeadVox: o resultado do último envio da IA (aceito ou recusado).
-- O motor guarda no Redis (iag_envio_<conta>) e o fluxo "Motor IA · Endereço e eventos (painel)" grava aqui a cada 2 min.
-- O painel avisa quando a LeadVox recusa (WhatsApp desconectado, token inválido) ou para de mandar eventos.
-- Rodar depois de plugin.sql.
alter table leadvox_private.motor_contas add column if not exists ultimo_envio jsonb;

-- n8n (service_role): token do webhook, chave do plugin, último evento e último envio ({ok, ts, status, erro}).
create or replace function public.lv_motor_eventos_gravar(linhas jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare l jsonb; e jsonb; n int:=0;
begin
 if jsonb_typeof(linhas)<>'array' or jsonb_array_length(linhas)>5000 then raise exception 'invalid'; end if;
 for l in select * from jsonb_array_elements(linhas) loop
  e:=case when jsonb_typeof(l->'envio')='object' and coalesce(l->'envio'->>'ts','')~'^[0-9]{13}$' then jsonb_build_object(
   'ok',coalesce(l->'envio'->>'ok','')='true',
   'ts',(l->'envio'->>'ts')::bigint,
   'status',case when coalesce(l->'envio'->>'status','')~'^[0-9]{1,3}$' then (l->'envio'->>'status')::int else 0 end,
   'erro',left(coalesce(l->'envio'->>'erro',''),200)) end;
  update leadvox_private.motor_contas m set
   token_eventos=case when coalesce(l->>'token','')~'^[0-9a-f]{24}$' then l->>'token' else m.token_eventos end,
   token_plugin=case when coalesce(l->>'tokenPlugin','')~'^[0-9a-f]{24}$' then l->>'tokenPlugin' else m.token_plugin end,
   ultimo_evento=greatest(m.ultimo_evento,case when coalesce(l->>'ultimo','')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then (l->>'ultimo')::timestamptz end),
   ultimo_envio=coalesce(e,m.ultimo_envio)
  where m.conta=l->>'conta';
  if found then n:=n+1; end if;
 end loop;
 return jsonb_build_object('ok',true,'gravados',n);
end;$$;

-- Painel: endereço do webhook, link do plugin, último evento e último envio (dono ou admin).
create or replace function public.lv_motor_eventos(org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_conta text; m leadvox_private.motor_contas;
begin
 v_conta:=leadvox_private.motor_conta(org,true);
 if v_conta is null then return jsonb_build_object('vinculado',false); end if;
 select * into m from leadvox_private.motor_contas where conta=v_conta;
 return jsonb_build_object('vinculado',true,'conta',m.conta,'token',m.token_eventos,'tokenPlugin',m.token_plugin,'ultimoEvento',m.ultimo_evento,'ultimoEnvio',m.ultimo_envio);
end;$$;
