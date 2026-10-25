-- Liga cada empresa do painel novo a uma conta do Motor IA (tabelas iag_* do mesmo banco).
-- As funções iag_* só aceitam service_role; estas embalagens conferem o vínculo do usuário com a empresa
-- e chamam as iag_* por dentro. Nada aqui altera contas que já existiam (Leadvox, Vassouras GranRio).
-- Rodar depois de organizations.sql.
create table if not exists leadvox_private.motor_contas(
 organization_id uuid primary key references public.lv_organizations(id) on delete cascade,
 conta text not null unique references public.iag_conta(chave),
 criado_em timestamptz not null default now()
);
alter table leadvox_private.motor_contas enable row level security;
revoke all on leadvox_private.motor_contas from public,anon,authenticated;

-- Conta do motor da empresa, se quem chama é membro (editar=true exige dono ou admin).
create or replace function leadvox_private.motor_conta(org uuid,editar boolean) returns text language sql stable security definer set search_path='' as $$
 select m.conta from leadvox_private.motor_contas m
 where m.organization_id=org and exists(select 1 from public.lv_memberships x where x.organization_id=org and x.user_id=(select auth.uid()) and (not editar or x.role in('owner','admin')));
$$;
revoke all on function leadvox_private.motor_conta(uuid,boolean) from public,anon,authenticated;

-- Cria a conta do motor para a empresa (uma vez). Nunca reaproveita conta existente.
create or replace function public.lv_motor_vincular(org uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_conta text; v_nome text;
begin
 if not exists(select 1 from public.lv_memberships where organization_id=org and user_id=auth.uid() and role in('owner','admin')) then raise exception 'forbidden'; end if;
 select conta into v_conta from leadvox_private.motor_contas where organization_id=org;
 if v_conta is null then
  select name into v_nome from public.lv_organizations where id=org;
  v_conta:=public.iag__slug(v_nome)||'-'||public.iag__hex(4);
  insert into public.iag_conta(chave,nome,limite_agentes,observacao) values(v_conta,v_nome,3,'Criada pelo painel novo (LeadVox IA)');
  insert into leadvox_private.motor_contas(organization_id,conta) values(org,v_conta);
 end if;
 return jsonb_build_object('ok',true,'conta',v_conta);
end;$$;

-- Situação da conta no motor: conexão com a LeadVox, agentes e tipos disponíveis. Sem segredos.
create or replace function public.lv_motor_status(org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_conta text; c public.iag_conta;
begin
 v_conta:=leadvox_private.motor_conta(org,false);
 if v_conta is null then return jsonb_build_object('vinculado',false); end if;
 select * into c from public.iag_conta where chave=v_conta;
 return jsonb_build_object('vinculado',true,'conta',v_conta,'limite',c.limite_agentes,'bloqueado',c.bloqueado,
  'conexao',public.iag__conexao_conta(v_conta),
  'agentes',coalesce((select jsonb_agg(jsonb_build_object('chave',a.chave,'nome',a.nome,'tipo',a.tipo,'ativo',a.ativo,'entrada',a.entrada,
    'departamentoId',a.departamento_id,'versao',a.versao,'configurado',a.configurado,'atualizadoEm',a.atualizado_em) order by a.slot)
    from public.iag_agente a where a.conta=v_conta and not a.arquivado),'[]'::jsonb),
  'tipos',coalesce((select jsonb_agg(jsonb_build_object('codigo',t.codigo,'nome',t.nome)) from public.iag_tipo t),'[]'::jsonb));
end;$$;

-- Liga a conta do motor ao número da LeadVox (tenant e sessão vêm do token da URL da API).
create or replace function public.lv_motor_conectar(org uuid,tenant integer,sessao integer,url text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_conta text;
begin
 v_conta:=leadvox_private.motor_conta(org,true);
 if v_conta is null then raise exception 'forbidden'; end if;
 if tenant is null or sessao is null or url !~ '^https://chat[0-9]{0,2}api\.leadvox\.com\.br/v[0-9]{1,2}/api/external/' then raise exception 'invalid'; end if;
 return public.iag_admin_conexao_conta(v_conta,jsonb_build_object('tenantId',tenant,'sessionId',sessao,'canal','whatsapp','testadoEm',now()),jsonb_build_object('leadvoxUrlEnvio',url));
end;$$;

-- Configuração completa de um agente da empresa.
create or replace function public.lv_motor_agente(org uuid,agente text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('chave',a.chave,'nome',a.nome,'tipo',a.tipo,'ativo',a.ativo,'entrada',a.entrada,'versao',a.versao,'configurado',a.configurado,'config',a.config)
 from public.iag_agente a where a.chave=agente and not a.arquivado and a.conta=leadvox_private.motor_conta(org,false);
$$;

create or replace function public.lv_motor_criar_agente(org uuid,tipo text,config jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_conta text;
begin
 v_conta:=leadvox_private.motor_conta(org,true);
 if v_conta is null then raise exception 'forbidden'; end if;
 return public.iag_admin_criar_agente(v_conta,tipo,coalesce(config,'{}'::jsonb));
end;$$;

-- Salva como o plugin atual: histórico de versões, conflito se alguém salvou depois, "concluir" marca configurado.
create or replace function public.lv_motor_salvar_agente(org uuid,agente text,config jsonb,versao_base integer,concluir boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_conta text; r jsonb;
begin
 v_conta:=leadvox_private.motor_conta(org,true);
 if v_conta is null or not exists(select 1 from public.iag_agente where chave=agente and conta=v_conta and not arquivado) then raise exception 'forbidden'; end if;
 r:=public.iag__gravar_agente(agente,config,'painel-novo',versao_base);
 if coalesce((r->>'ok')::boolean,false) and concluir then update public.iag_agente set configurado=true where chave=agente; r:=r||jsonb_build_object('configurado',true); end if;
 return r;
end;$$;

create or replace function public.lv_motor_ativo(org uuid,agente text,ativo boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_conta text;
begin
 v_conta:=leadvox_private.motor_conta(org,true);
 if v_conta is null or not exists(select 1 from public.iag_agente where chave=agente and conta=v_conta and not arquivado) then raise exception 'forbidden'; end if;
 return public.iag_admin_ativo(agente,ativo);
end;$$;

revoke all on function public.lv_motor_vincular(uuid) from public,anon;
revoke all on function public.lv_motor_status(uuid) from public,anon;
revoke all on function public.lv_motor_conectar(uuid,integer,integer,text) from public,anon;
revoke all on function public.lv_motor_agente(uuid,text) from public,anon;
revoke all on function public.lv_motor_criar_agente(uuid,text,jsonb) from public,anon;
revoke all on function public.lv_motor_salvar_agente(uuid,text,jsonb,integer,boolean) from public,anon;
revoke all on function public.lv_motor_ativo(uuid,text,boolean) from public,anon;
grant execute on function public.lv_motor_vincular(uuid) to authenticated;
grant execute on function public.lv_motor_status(uuid) to authenticated;
grant execute on function public.lv_motor_conectar(uuid,integer,integer,text) to authenticated;
grant execute on function public.lv_motor_agente(uuid,text) to authenticated;
grant execute on function public.lv_motor_criar_agente(uuid,text,jsonb) to authenticated;
grant execute on function public.lv_motor_salvar_agente(uuid,text,jsonb,integer,boolean) to authenticated;
grant execute on function public.lv_motor_ativo(uuid,text,boolean) to authenticated;
