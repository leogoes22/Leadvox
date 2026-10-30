-- Plugin do Vendedor (dentro da LeadVox): um link por loja com chave própria, diferente da do webhook de eventos.
-- A chave é calculada no n8n (fluxo "Motor IA · Endereço e eventos (painel)") com o segredo do motor e gravada aqui;
-- o painel só mostra o link para o dono ou admin copiar. Rodar depois de eventos.sql.
alter table leadvox_private.motor_contas add column if not exists token_plugin text;

-- n8n (service_role): grava o token do webhook, o do plugin (24 hex cada) e a hora do último evento.
create or replace function public.lv_motor_eventos_gravar(linhas jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare l jsonb; n int:=0;
begin
 if jsonb_typeof(linhas)<>'array' or jsonb_array_length(linhas)>5000 then raise exception 'invalid'; end if;
 for l in select * from jsonb_array_elements(linhas) loop
  update leadvox_private.motor_contas m set
   token_eventos=case when coalesce(l->>'token','')~'^[0-9a-f]{24}$' then l->>'token' else m.token_eventos end,
   token_plugin=case when coalesce(l->>'tokenPlugin','')~'^[0-9a-f]{24}$' then l->>'tokenPlugin' else m.token_plugin end,
   ultimo_evento=greatest(m.ultimo_evento,case when coalesce(l->>'ultimo','')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then (l->>'ultimo')::timestamptz end)
  where m.conta=l->>'conta';
  if found then n:=n+1; end if;
 end loop;
 return jsonb_build_object('ok',true,'gravados',n);
end;$$;

-- Painel: endereço do webhook de eventos e link do plugin (dono ou admin).
create or replace function public.lv_motor_eventos(org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_conta text; m leadvox_private.motor_contas;
begin
 v_conta:=leadvox_private.motor_conta(org,true);
 if v_conta is null then return jsonb_build_object('vinculado',false); end if;
 select * into m from leadvox_private.motor_contas where conta=v_conta;
 return jsonb_build_object('vinculado',true,'conta',m.conta,'token',m.token_eventos,'tokenPlugin',m.token_plugin,'ultimoEvento',m.ultimo_evento);
end;$$;
