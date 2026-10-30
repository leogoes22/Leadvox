-- Dashboard da IA: números por conta do motor e por dia, copiados do Redis pelo n8n
-- ("V0.1 Motor IA · Relatório → painel", a cada 15 min). Só totais: nenhum telefone ou nome de cliente.
-- metricas: conversas, novos, transferidos, passagens, followups, retomadas, pedidos, setor_<x>, ag_<x>
-- uso: respostas da IA, contatos atendidos, contatos de teste e contatos pausados por parecer robô.
-- Rodar depois de motor_link.sql.
create table if not exists public.iag_relatorio(
 conta text not null references public.iag_conta(chave) on delete cascade,
 dia date not null,
 metricas jsonb not null default '{}'::jsonb check(jsonb_typeof(metricas)='object'),
 uso jsonb not null default '{}'::jsonb check(jsonb_typeof(uso)='object'),
 atualizado_em timestamptz not null default now(),
 primary key(conta,dia)
);
alter table public.iag_relatorio enable row level security;
revoke all on public.iag_relatorio from public,anon,authenticated;

-- n8n (service_role): grava o dia de cada conta; o Redis tem o total do dia, então substitui.
create or replace function public.lv_motor_relatorio_gravar(linhas jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare l jsonb; n int:=0;
begin
 if jsonb_typeof(linhas)<>'array' or jsonb_array_length(linhas)>5000 then raise exception 'invalid'; end if;
 for l in select * from jsonb_array_elements(linhas) loop
  if not exists(select 1 from public.iag_conta where chave=l->>'conta') or coalesce(l->>'dia','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then continue; end if;
  insert into public.iag_relatorio(conta,dia,metricas,uso,atualizado_em)
  values(l->>'conta',(l->>'dia')::date,coalesce(l->'metricas','{}'::jsonb),coalesce(l->'uso','{}'::jsonb),now())
  on conflict(conta,dia) do update set metricas=excluded.metricas,uso=excluded.uso,atualizado_em=now();
  n:=n+1;
 end loop;
 return jsonb_build_object('ok',true,'gravados',n);
end;$$;

-- Painel: os dias do período para a empresa (qualquer membro). Até 366 dias.
create or replace function public.lv_motor_relatorio(org uuid,ini date,fim date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_conta text;
begin
 v_conta:=leadvox_private.motor_conta(org,false);
 if v_conta is null then return jsonb_build_object('vinculado',false); end if;
 if ini is null or fim is null or fim<ini or fim-ini>366 then return jsonb_build_object('vinculado',true,'erro','periodo'); end if;
 return jsonb_build_object('vinculado',true,'atualizado',(select max(atualizado_em) from public.iag_relatorio where conta=v_conta),
  'dias',coalesce((select jsonb_agg(jsonb_build_object('dia',r.dia,'metricas',r.metricas,'uso',r.uso) order by r.dia)
   from public.iag_relatorio r where r.conta=v_conta and r.dia between ini and fim),'[]'::jsonb));
end;$$;

revoke all on function public.lv_motor_relatorio_gravar(jsonb) from public,anon,authenticated;
revoke all on function public.lv_motor_relatorio(uuid,date,date) from public,anon;
grant execute on function public.lv_motor_relatorio_gravar(jsonb) to service_role;
grant execute on function public.lv_motor_relatorio(uuid,date,date) to authenticated;
