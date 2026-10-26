-- Webhook de eventos no painel: o endereço da Sentinela de cada empresa e a hora do último evento recebido.
-- O token do endereço é calculado no n8n (onde fica o segredo do motor) pelo fluxo
-- "Motor IA · Endereço e eventos (painel)" e gravado aqui; o segredo nunca sai do n8n.
-- Rodar depois de motor_link.sql.
alter table leadvox_private.motor_contas add column if not exists token_eventos text;
alter table leadvox_private.motor_contas add column if not exists ultimo_evento timestamptz;

-- n8n (service_role): contas ligadas ao painel e se já têm token.
create or replace function public.lv_motor_contas_painel() returns table(conta text,tem_token boolean) language sql stable security definer set search_path='' as $$
 select m.conta,m.token_eventos is not null from leadvox_private.motor_contas m;
$$;

-- n8n (service_role): grava o token (24 hex) e a hora do último evento que a Sentinela recebeu.
create or replace function public.lv_motor_eventos_gravar(linhas jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare l jsonb; n int:=0;
begin
 if jsonb_typeof(linhas)<>'array' or jsonb_array_length(linhas)>5000 then raise exception 'invalid'; end if;
 for l in select * from jsonb_array_elements(linhas) loop
  update leadvox_private.motor_contas m set
   token_eventos=case when coalesce(l->>'token','')~'^[0-9a-f]{24}$' then l->>'token' else m.token_eventos end,
   ultimo_evento=greatest(m.ultimo_evento,case when coalesce(l->>'ultimo','')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then (l->>'ultimo')::timestamptz end)
  where m.conta=l->>'conta';
  if found then n:=n+1; end if;
 end loop;
 return jsonb_build_object('ok',true,'gravados',n);
end;$$;

-- Painel: endereço do webhook de eventos (dono ou admin; o token dá acesso ao motor da conta).
create or replace function public.lv_motor_eventos(org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_conta text; m leadvox_private.motor_contas;
begin
 v_conta:=leadvox_private.motor_conta(org,true);
 if v_conta is null then return jsonb_build_object('vinculado',false); end if;
 select * into m from leadvox_private.motor_contas where conta=v_conta;
 return jsonb_build_object('vinculado',true,'conta',m.conta,'token',m.token_eventos,'ultimoEvento',m.ultimo_evento);
end;$$;

revoke all on function public.lv_motor_contas_painel() from public,anon,authenticated;
revoke all on function public.lv_motor_eventos_gravar(jsonb) from public,anon,authenticated;
revoke all on function public.lv_motor_eventos(uuid) from public,anon;
grant execute on function public.lv_motor_contas_painel() to service_role;
grant execute on function public.lv_motor_eventos_gravar(jsonb) to service_role;
grant execute on function public.lv_motor_eventos(uuid) to authenticated;
