-- Super Admin: os robôs (agentes) de cada empresa, para ajudar o cliente sem chave e sem entrar no painel dele.
-- lv_admin_robos só lê, sem segredos: nome, função, ligado, modo teste e o que falta configurar.
-- lv_admin_robo_ativo liga ou pausa um robô e fica no histórico do Super Admin.
-- Para editar, o painel abre o acesso de suporte (lv_admin_suporte) e vai direto ao robô.
-- Rodar depois de motor_link.sql, saude.sql e assinaturas.sql.

create or replace function public.lv_admin_robos(org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m leadvox_private.motor_contas; cx jsonb;
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 select * into m from leadvox_private.motor_contas where organization_id=org;
 if m.conta is null then return jsonb_build_object('vinculado',false,'robos','[]'::jsonb); end if;
 cx:=coalesce(public.iag__conexao_conta(m.conta),'{}'::jsonb);
 return jsonb_build_object('vinculado',true,'conta',m.conta,
  'whatsapp',coalesce((cx->>'conectado')::boolean,false),'sessao',cx->'sessionId',
  'ultimoEvento',m.ultimo_evento,'ultimoEnvio',m.ultimo_envio,
  'itens',(select count(*) from public.iag_item i where i.conta=m.conta),
  'robos',coalesce((select jsonb_agg(jsonb_build_object(
     'chave',a.chave,'nome',coalesce(nullif(a.config#>>'{identidade,nome}',''),a.nome),'tipo',a.tipo,'tipoNome',t.nome,
     'ativo',a.ativo,'entrada',a.entrada,'configurado',a.configurado,'departamentoId',a.departamento_id,
     'versao',a.versao,'atualizadoEm',a.atualizado_em,
     'modoTeste',coalesce(a.config#>>'{modoTeste,ativo}','')='true',
     'numerosTeste',case when jsonb_typeof(a.config#>'{modoTeste,numeros}')='array' then jsonb_array_length(a.config#>'{modoTeste,numeros}') else 0 end,
     'descricao',coalesce(a.config#>>'{empresa,descricao}','')<>'',
     'faq',case when jsonb_typeof(a.config#>'{conhecimento,faq}')='array' then jsonb_array_length(a.config#>'{conhecimento,faq}') else 0 end,
     'regras',coalesce(a.config#>>'{regras,texto}','')<>'') order by a.slot)
   from public.iag_agente a left join public.iag_tipo t on t.codigo=a.tipo
   where a.conta=m.conta and not a.arquivado),'[]'::jsonb));
end;$$;

create or replace function public.lv_admin_robo_ativo(org uuid,agente text,ativo boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_conta text; r jsonb;
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 select conta into v_conta from leadvox_private.motor_contas where organization_id=org;
 if v_conta is null or not exists(select 1 from public.iag_agente where chave=agente and conta=v_conta and not arquivado) then raise exception 'not_found'; end if;
 r:=public.iag_admin_ativo(agente,ativo);
 if coalesce((r->>'ok')::boolean,true) then
  insert into leadvox_private.saas_admin_log(organization_id,admin_id,acao,dados) values(org,auth.uid(),case when ativo then 'robo-ligar' else 'robo-pausar' end,jsonb_build_object('agente',agente));
 end if;
 return r;
end;$$;

revoke all on function public.lv_admin_robos(uuid) from public,anon;
revoke all on function public.lv_admin_robo_ativo(uuid,text,boolean) from public,anon;
grant execute on function public.lv_admin_robos(uuid) to authenticated;
grant execute on function public.lv_admin_robo_ativo(uuid,text,boolean) to authenticated;

insert into leadvox_private.sql_aplicado(arquivo) values('admin_robos.sql') on conflict(arquivo) do nothing;
