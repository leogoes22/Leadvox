-- Vários números (conexões da LeadVox) por empresa e uma IA por número (18/11/2026).
-- • A conexão principal continua em chat_credentials (oportunidades, listas e o motor da conta, como hoje).
-- • Conexões extras: uma por número da LeadVox; o total (principal + extras) vai até o número de IAs liberadas
--   pelo Super Admin (iag_conta.limite_agentes).
-- • Cada agente pode atender por um número extra (iag_agente_conexao). Sem isso, atende pelo número da conta (como hoje).
-- • O motor escolhe a IA pelo número por onde a mensagem chegou (iag_motor_rota com p_sessao) e responde por ele.
-- Compatível com o que está no ar: sem conexões extras e sem p_sessao, o motor faz exatamente o mesmo de antes.
-- Rodar depois de chat_credentials.sql, motor_link.sql e lugar.sql. Tudo numa transação.

begin;

-- ═══ PARTE 1 · conexões extras da empresa (painel) ═══
create table if not exists leadvox_private.chat_conexoes(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.lv_organizations(id) on delete cascade,
 nome text not null check(char_length(btrim(nome)) between 2 and 60),
 api_root text not null,
 api_id text not null,
 secret_id uuid not null,
 tenant_id integer not null,
 session_id integer not null,
 criado_em timestamptz not null default now(),
 unique(organization_id,session_id)
);
alter table leadvox_private.chat_conexoes enable row level security;
revoke all on leadvox_private.chat_conexoes from public,anon,authenticated;

-- ═══ PARTE 2 · número de cada agente (motor) ═══
create table if not exists public.iag_agente_conexao(
 agente text primary key references public.iag_agente(chave) on delete cascade,
 conexao_id uuid not null,
 tenant_id integer not null,
 session_id integer not null,
 conexao jsonb not null default '{}'::jsonb,
 leadvox_url_envio text not null,
 atualizado_em timestamptz not null default now()
);
alter table public.iag_agente_conexao enable row level security;
revoke all on public.iag_agente_conexao from public,anon,authenticated;

-- Configuração do agente com o número dele (se tiver um número extra); sem número extra, devolve igual.
create or replace function public.iag__com_conexao_agente(p_agente text,cfg jsonb) returns jsonb language sql stable security definer set search_path='' as $$
 select case when x.agente is null or cfg is null or cfg->>'ok'<>'true' then cfg
  else cfg||jsonb_build_object('conexao',coalesce(cfg->'conexao','{}'::jsonb)||x.conexao||jsonb_build_object(
   'tenantId',x.tenant_id,'sessionId',x.session_id,'urlEnvio',x.leadvox_url_envio)) end
 from (select 1) u left join public.iag_agente_conexao x on x.agente=p_agente;
$$;
revoke all on function public.iag__com_conexao_agente(text,jsonb) from public,anon,authenticated;

-- ═══ PARTE 3 · rota do motor com o número por onde a mensagem chegou ═══
-- p_sessao (opcional): sessão/WhatsApp da LeadVox que recebeu a mensagem.
-- Porta de entrada: a IA de entrada daquele número; sem número extra, a IA de entrada da conta (como antes).
drop function if exists public.iag_motor_rota(text,integer);
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
 return public.iag__com_conexao_agente(v_ag,public.iag_config_motor(v_ag))||jsonb_build_object('motivo',v_motivo);
end;$$;
revoke all on function public.iag_motor_rota(text,integer,integer) from public,anon,authenticated;
grant execute on function public.iag_motor_rota(text,integer,integer) to service_role;

-- Porta de entrada: uma por NÚMERO (antes: uma por conta). Mesmo departamento continua sendo de um agente só.
create or replace function public.iag__definir_lugar(p_agente text,p_departamento integer,p_entrada boolean) returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare a public.iag_agente; v_dono text; v_sessao integer;
begin
 select * into a from public.iag_agente where chave=p_agente for update;
 if not found or a.arquivado then return jsonb_build_object('ok',false,'erro','agente'); end if;
 if p_departamento is not null then
  select nome into v_dono from public.iag_agente where conta=a.conta and chave<>p_agente and not arquivado and departamento_id=p_departamento;
  if found then return jsonb_build_object('ok',false,'erro','departamento_em_uso','agenteNome',v_dono); end if;
 end if;
 if coalesce(p_entrada,false) then
  -- só um agente é a porta de entrada de cada número: quem era, naquele número, deixa de ser
  select session_id into v_sessao from public.iag_agente_conexao where agente=p_agente;
  update public.iag_agente o set entrada=false,atualizado_em=now()
   where o.conta=a.conta and o.chave<>p_agente and o.entrada and not o.arquivado
     and coalesce((select x.session_id from public.iag_agente_conexao x where x.agente=o.chave),-1)=coalesce(v_sessao,-1);
 end if;
 update public.iag_agente set departamento_id=p_departamento,entrada=coalesce(p_entrada,false),atualizado_em=now() where chave=p_agente;
 return jsonb_build_object('ok',true,'agente',public.iag__resumo_agente(p_agente));
end;$$;
revoke all on function public.iag__definir_lugar(text,integer,boolean) from public,anon,authenticated;

-- ═══ PARTE 4 · funções do painel ═══
-- IAs liberadas (o limite de agentes da conta). Também é o limite de números (principal + extras).
create or replace function leadvox_private.limite_ias(org uuid) returns integer language sql stable security definer set search_path='' as $$
 select coalesce((select c.limite_agentes from leadvox_private.motor_contas m join public.iag_conta c on c.chave=m.conta where m.organization_id=org),1);
$$;
revoke all on function leadvox_private.limite_ias(uuid) from public,anon,authenticated;

-- Lista: os números extras (sem token), quantos cabem e qual agente usa cada um. Qualquer membro vê.
create or replace function public.lv_chat_conexoes(org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_conta text;
begin
 if not exists(select 1 from public.lv_memberships m where m.organization_id=org and m.user_id=(select auth.uid())) and not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 select conta into v_conta from leadvox_private.motor_contas where organization_id=org;
 return jsonb_build_object('limite',leadvox_private.limite_ias(org),
  'principal',exists(select 1 from leadvox_private.chat_credentials where organization_id=org),
  'conexoes',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'nome',x.nome,'apiId',x.api_id,'sessao',x.session_id,'criadoEm',x.criado_em,
     'agentes',coalesce((select jsonb_agg(jsonb_build_object('chave',a.chave,'nome',a.nome)) from public.iag_agente_conexao y join public.iag_agente a on a.chave=y.agente where y.conexao_id=x.id and not a.arquivado),'[]'::jsonb)) order by x.criado_em)
   from leadvox_private.chat_conexoes x where x.organization_id=org),'[]'::jsonb),
  'agentes',coalesce((select jsonb_agg(jsonb_build_object('chave',y.agente,'conexaoId',y.conexao_id)) from public.iag_agente_conexao y join public.iag_agente a on a.chave=y.agente where a.conta=v_conta),'[]'::jsonb));
end;$$;

-- Salvar um número extra (o servidor do painel testa o token na LeadVox antes). Só dono ou admin.
create or replace function public.lv_chat_conexao_salvar(org uuid,p_nome text,root text,api text,tok text,tenant integer,sessao integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid; v_id uuid; n integer;
begin
 if not exists(select 1 from public.lv_memberships where organization_id=org and user_id=auth.uid() and role in('owner','admin')) then raise exception 'forbidden'; end if;
 if root !~ '^https://chat[0-9]{0,2}api\.leadvox\.com\.br/v[0-9]{1,2}$' or api !~ '^[A-Za-z0-9_-]{1,100}$' or length(tok) not between 10 and 4000
    or char_length(btrim(coalesce(p_nome,''))) not between 2 and 60 or tenant is null or sessao is null then return jsonb_build_object('ok',false,'erro','dados'); end if;
 select count(*)+1 into n from leadvox_private.chat_conexoes where organization_id=org;
 if n+1>leadvox_private.limite_ias(org) then return jsonb_build_object('ok',false,'erro','limite','limite',leadvox_private.limite_ias(org)); end if;
 if exists(select 1 from leadvox_private.chat_conexoes where organization_id=org and session_id=sessao) then return jsonb_build_object('ok',false,'erro','repetida'); end if;
 if exists(select 1 from public.iag_conta c join leadvox_private.motor_contas m on m.conta=c.chave where c.tenant_id=tenant and c.session_id=sessao and m.organization_id=org) then return jsonb_build_object('ok',false,'erro','principal'); end if;
 if exists(select 1 from public.iag_conta c where c.tenant_id=tenant and c.session_id=sessao and c.chave not in(select conta from leadvox_private.motor_contas where organization_id=org))
    or exists(select 1 from leadvox_private.chat_conexoes where organization_id<>org and tenant_id=tenant and session_id=sessao) then return jsonb_build_object('ok',false,'erro','em_uso'); end if;
 sid:=vault.create_secret(tok,'lv_chat_extra_'||gen_random_uuid()::text,'Token extra do chat LeadVox');
 insert into leadvox_private.chat_conexoes(organization_id,nome,api_root,api_id,secret_id,tenant_id,session_id) values(org,btrim(p_nome),root,api,sid,tenant,sessao) returning id into v_id;
 return jsonb_build_object('ok',true,'id',v_id);
end;$$;

-- Tirar um número extra: as IAs que atendiam por ele voltam para o número principal.
create or replace function public.lv_chat_conexao_excluir(org uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 if not exists(select 1 from public.lv_memberships where organization_id=org and user_id=auth.uid() and role in('owner','admin')) then raise exception 'forbidden'; end if;
 delete from leadvox_private.chat_conexoes where id=p_id and organization_id=org returning secret_id into sid;
 if sid is null then return jsonb_build_object('ok',false,'erro','nao_encontrada'); end if;
 delete from public.iag_agente_conexao where conexao_id=p_id;
 delete from vault.secrets where id=sid;
 return jsonb_build_object('ok',true);
end;$$;

-- Por qual número o agente atende: um número extra (p_conexao) ou o principal (null). Só dono ou admin.
create or replace function public.lv_motor_agente_numero(org uuid,agente text,p_conexao uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_conta text; x leadvox_private.chat_conexoes; tok text; v_entrada boolean;
begin
 v_conta:=leadvox_private.motor_conta(org,true);
 if v_conta is null then raise exception 'forbidden'; end if;
 select entrada into v_entrada from public.iag_agente where chave=agente and conta=v_conta and not arquivado;
 if not found then return jsonb_build_object('ok',false,'erro','agente'); end if;
 if p_conexao is null then
  delete from public.iag_agente_conexao where iag_agente_conexao.agente=lv_motor_agente_numero.agente;
 else
  select * into x from leadvox_private.chat_conexoes where id=p_conexao and organization_id=org;
  if not found then return jsonb_build_object('ok',false,'erro','nao_encontrada'); end if;
  select decrypted_secret into tok from vault.decrypted_secrets where id=x.secret_id;
  insert into public.iag_agente_conexao(agente,conexao_id,tenant_id,session_id,conexao,leadvox_url_envio)
  values(agente,x.id,x.tenant_id,x.session_id,jsonb_build_object('canal','whatsapp','nomeCanal',x.nome,'conexaoId',x.id),
   x.api_root||'/api/external/'||x.api_id||'/?token='||tok)
  on conflict on constraint iag_agente_conexao_pkey do update set conexao_id=excluded.conexao_id,tenant_id=excluded.tenant_id,session_id=excluded.session_id,
   conexao=excluded.conexao,leadvox_url_envio=excluded.leadvox_url_envio,atualizado_em=now();
 end if;
 -- era porta de entrada: continua sendo, agora no número novo (quem era a entrada dele deixa de ser)
 if v_entrada then perform public.iag__definir_lugar(agente,(select departamento_id from public.iag_agente where chave=agente),true); end if;
 return jsonb_build_object('ok',true);
end;$$;

-- Super Admin: quantas IAs (e números) o cliente pode ter.
create or replace function public.lv_admin_limite_ias(org uuid,limite integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_conta text; n integer;
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 if limite is null or limite<1 or limite>20 then return jsonb_build_object('ok',false,'erro','limite'); end if;
 select conta into v_conta from leadvox_private.motor_contas where organization_id=org;
 if v_conta is null then return jsonb_build_object('ok',false,'erro','sem_motor'); end if;
 select count(*) into n from public.iag_agente where conta=v_conta and not arquivado;
 if limite<n then return jsonb_build_object('ok',false,'erro','abaixo_do_uso','agentes',n); end if;
 update public.iag_conta set limite_agentes=limite,atualizado_em=now() where chave=v_conta;
 insert into leadvox_private.saas_admin_log(organization_id,admin_id,acao,dados) values(org,auth.uid(),'limite-ias',jsonb_build_object('limite',limite));
 return jsonb_build_object('ok',true,'limite',limite);
end;$$;

revoke all on function public.lv_chat_conexoes(uuid),public.lv_chat_conexao_salvar(uuid,text,text,text,text,integer,integer),public.lv_chat_conexao_excluir(uuid,uuid),
 public.lv_motor_agente_numero(uuid,text,uuid),public.lv_admin_limite_ias(uuid,integer) from public,anon;
grant execute on function public.lv_chat_conexoes(uuid),public.lv_chat_conexao_salvar(uuid,text,text,text,text,integer,integer),public.lv_chat_conexao_excluir(uuid,uuid),
 public.lv_motor_agente_numero(uuid,text,uuid),public.lv_admin_limite_ias(uuid,integer) to authenticated;

insert into leadvox_private.sql_aplicado(arquivo) values('conexoes.sql') on conflict(arquivo) do nothing;
commit;
notify pgrst,'reload schema';
