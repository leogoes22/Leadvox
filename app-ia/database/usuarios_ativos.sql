-- Só recebe cliente quem está ATIVO na LeadVox (19/11/2026). Bug: a vendedora inativa no CRM continuava no rodízio da IA
-- e no plugin do vendedor (ordem, "Próximo da fila", "Ou escolher a pessoa" e transferência), porque ela ficou salva na
-- distribuição do agente (config.setores[].vendedores) e ninguém olhava o status do usuário.
-- • O n8n "Usuários ativos da LeadVox" (a cada 1 min) entra com o usuário da LeadVox de cada loja (Credenciais de API),
--   lê quem está ativo (tela /users/, campo isActive) e grava aqui (iag_usuarios_ativos_gravar).
-- • iag_motor_rota (que a IA e o plugin usam) entrega a distribuição já sem quem está inativo. Lista com mais de 10 min
--   (loja sem usuário da LeadVox, ou o n8n parado) não filtra: fica como antes, nunca esvazia o rodízio por engano.
-- Rodar depois de conexoes.sql e leadvox_usuario.sql. Tudo numa transação.

begin;

create table if not exists public.iag_usuarios_ativos(
 conta text primary key references public.iag_conta(chave) on delete cascade,
 ids text[] not null,
 atualizado_em timestamptz not null default now()
);
alter table public.iag_usuarios_ativos enable row level security;
revoke all on public.iag_usuarios_ativos from public,anon,authenticated;

-- n8n: as lojas com usuário da LeadVox conectado, para entrar e ler quem está ativo (só service_role: devolve a senha).
create or replace function public.iag_leadvox_usuarios_todos() returns table(conta text,api_root text,email text,senha text) language sql stable security definer set search_path='' as $$
 select m.conta,c.api_root,i.settings->>'email',s.decrypted_secret
 from leadvox_private.integrations i
 join leadvox_private.motor_contas m on m.organization_id=i.organization_id
 join leadvox_private.chat_credentials c on c.organization_id=i.organization_id
 join vault.decrypted_secrets s on s.id=i.secret_id
 where i.provider='leadvox_usuario' and coalesce(i.settings->>'email','')<>'';
$$;
revoke all on function public.iag_leadvox_usuarios_todos() from public,anon,authenticated;
grant execute on function public.iag_leadvox_usuarios_todos() to service_role;

-- n8n: grava os ids ativos da loja (lista vazia não grava: login falhou ou a LeadVox não respondeu)
create or replace function public.iag_usuarios_ativos_gravar(p_conta text,p_ids text[]) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_ids is null or cardinality(p_ids)=0 or cardinality(p_ids)>500 then return jsonb_build_object('ok',false,'erro','lista'); end if;
 if not exists(select 1 from public.iag_conta where chave=p_conta) then return jsonb_build_object('ok',false,'erro','conta'); end if;
 insert into public.iag_usuarios_ativos(conta,ids,atualizado_em) values(p_conta,p_ids,now())
 on conflict(conta) do update set ids=excluded.ids,atualizado_em=now();
 return jsonb_build_object('ok',true,'ativos',cardinality(p_ids));
end;$$;
revoke all on function public.iag_usuarios_ativos_gravar(text,text[]) from public,anon,authenticated;
grant execute on function public.iag_usuarios_ativos_gravar(text,text[]) to service_role;

-- Tira da distribuição (config.setores[].vendedores) quem não está ativo. Sem lista recente, devolve igual.
create or replace function public.iag__so_ativos(p_conta text,cfg jsonb) returns jsonb language sql stable security definer set search_path='' as $$
 select case when u.conta is null or cfg is null or jsonb_typeof(cfg#>'{config,setores}')<>'array' then cfg
  else jsonb_set(cfg,'{config,setores}',coalesce((select jsonb_agg(case when jsonb_typeof(st->'vendedores')='array'
     then jsonb_set(st,'{vendedores}',coalesce((select jsonb_agg(v order by o2) from jsonb_array_elements(st->'vendedores') with ordinality w(v,o2)
       where (v->>'id')=any(u.ids)),'[]'::jsonb)) else st end order by o) from jsonb_array_elements(cfg#>'{config,setores}') with ordinality t(st,o)),'[]'::jsonb)) end
 from (select 1) x left join public.iag_usuarios_ativos u on u.conta=p_conta and u.atualizado_em>now()-interval '10 minutes';
$$;
revoke all on function public.iag__so_ativos(text,jsonb) from public,anon,authenticated;

-- Rota do motor (a mesma de conexoes.sql) agora com a distribuição só de ativos
create or replace function public.iag_motor_rota(p_conta text,p_departamento integer default null,p_sessao integer default null) returns jsonb language plpgsql stable security definer set search_path='public','pg_temp' as $$
declare c public.iag_conta; v_ag text; v_motivo text;
begin
 select * into c from public.iag_conta where chave=p_conta;
 if not found then return jsonb_build_object('ok',false,'responde',false,'motivo','conta'); end if;
 if c.bloqueado then return jsonb_build_object('ok',true,'responde',false,'motivo','conta_suspensa'); end if;
 if p_departamento is null or p_departamento=0 then
  select a.chave into v_ag from public.iag_agente a left join public.iag_agente_conexao x on x.agente=a.chave
   where a.conta=p_conta and not a.arquivado and a.entrada
     and ((p_sessao is not null and x.session_id=p_sessao)
       or (x.agente is null and (p_sessao is null or c.session_id is null or c.session_id=p_sessao)))
   order by (x.agente is not null) desc,a.slot limit 1;
  v_motivo:='entrada';
 else
  select a.chave into v_ag from public.iag_agente a left join public.iag_agente_conexao x on x.agente=a.chave
   where a.conta=p_conta and not a.arquivado and a.departamento_id=p_departamento
     and (x.agente is null or p_sessao is null or x.session_id=p_sessao)
   order by a.slot limit 1;
  v_motivo:='departamento';
  if v_ag is null then return jsonb_build_object('ok',true,'responde',false,'motivo','departamento_humano','departamentoId',p_departamento); end if;
 end if;
 if v_ag is null then return jsonb_build_object('ok',true,'responde',false,'motivo','sem_agente_de_entrada'); end if;
 return public.iag__so_ativos(p_conta,public.iag__com_conexao_agente(v_ag,public.iag_config_motor(v_ag)))||jsonb_build_object('motivo',v_motivo);
end;$$;
revoke all on function public.iag_motor_rota(text,integer,integer) from public,anon,authenticated;
grant execute on function public.iag_motor_rota(text,integer,integer) to service_role;

insert into leadvox_private.sql_aplicado(arquivo) values('usuarios_ativos.sql') on conflict(arquivo) do nothing;
commit;
notify pgrst,'reload schema';
