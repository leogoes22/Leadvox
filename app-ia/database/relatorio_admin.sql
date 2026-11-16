-- Relatórios do Painel LeadVox: os números de cada cliente no período (só o dono da plataforma).
-- Por dia e por empresa: conversas, leads novos, passagens para a equipe, follow-ups, respostas da IA e custo medido.
-- Por empresa no período: leads e vendas do Rastreamento de anúncios (só quem tem o módulo liberado).
-- Só totais: nenhum telefone ou nome de cliente. Rodar depois de assinaturas.sql, relatorio.sql e rastreio.sql.
create or replace function public.lv_admin_relatorio(ini date,fim date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t0 timestamptz; t1 timestamptz;
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 if ini is null or fim is null or fim<ini or fim-ini>366 then raise exception 'period'; end if;
 t0:=ini::timestamp at time zone 'America/Sao_Paulo'; t1:=(fim+1)::timestamp at time zone 'America/Sao_Paulo';
 return jsonb_build_object(
  'dias',coalesce((select jsonb_agg(jsonb_build_object('org',d.org,'dia',d.dia,'conversas',d.conversas,'novos',d.novos,'transferidos',d.transferidos,
     'followups',d.followups,'respostas',d.respostas,'usd',d.usd) order by d.dia)
   from (select coalesce(r.org,u.org) org,coalesce(r.dia,u.dia) dia,coalesce(r.conversas,0) conversas,coalesce(r.novos,0) novos,
      coalesce(r.transferidos,0) transferidos,coalesce(r.followups,0) followups,coalesce(r.respostas,0) respostas,u.usd
    from (select m.organization_id org,x.dia,sum(coalesce((x.metricas->>'conversas')::int,0)) conversas,sum(coalesce((x.metricas->>'novos')::int,0)) novos,
        sum(coalesce((x.metricas->>'transferidos')::int,0)) transferidos,sum(coalesce((x.metricas->>'followups')::int,0)) followups,
        sum(coalesce((x.uso->>'respostas')::int,0)) respostas
      from public.iag_relatorio x join leadvox_private.motor_contas m on m.conta=x.conta where x.dia between ini and fim group by 1,2) r
    full join (select organization_id org,(created_at at time zone 'America/Sao_Paulo')::date dia,sum(estimated_usd) usd
      from leadvox_private.openai_usage where created_at>=t0 and created_at<t1 group by 1,2) u
    on u.org=r.org and u.dia=r.dia) d),'[]'::jsonb),
  'anuncios',coalesce((select jsonb_agg(jsonb_build_object('org',c.organization_id,
     'leads',(select count(*) from leadvox_private.rastreio_leads l where l.organization_id=c.organization_id and l.criado_em>=t0 and l.criado_em<t1),
     'vendas',(select count(*) from leadvox_private.rastreio_envios e where e.organization_id=c.organization_id and e.tipo='compra' and e.criado_em>=t0 and e.criado_em<t1),
     'valor',(select coalesce(sum(e.valor),0) from leadvox_private.rastreio_envios e where e.organization_id=c.organization_id and e.tipo='compra' and e.criado_em>=t0 and e.criado_em<t1)))
   from leadvox_private.rastreio_config c where c.liberado),'[]'::jsonb));
end;$$;

revoke all on function public.lv_admin_relatorio(date,date) from public,anon;
grant execute on function public.lv_admin_relatorio(date,date) to authenticated;

insert into leadvox_private.sql_aplicado(arquivo) values('relatorio_admin.sql') on conflict(arquivo) do nothing;
