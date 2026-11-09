-- Usuários de cada empresa: o dono (e o admin) convida funcionários e escolhe a função; o Super Admin vê, cadastra,
-- troca a função, troca o e-mail de login e manda a redefinição de senha.
-- Quem pode fazer o quê é conferido aqui, sempre com o login de quem pede (auth.uid()), também quando quem chama é a função "usuarios".
-- Regras: o dono principal (quem criou a conta, lv_organizations.owner_id) não sai nem muda de função; ninguém mexe no próprio acesso;
-- o admin não mexe em dono nem dá a função de dono. Ações do Super Admin vão também para saas_admin_log.
-- Criar login e trocar e-mail exigem a chave de serviço: só a função "usuarios" faz, depois de passar por estas funções.
-- Rodar depois de organizations.sql, platform_admin.sql e assinaturas.sql, parte por parte (PARTE 1 a 4), na ordem.

-- ═══ PARTE 1 · histórico, quem pode gerir e registro ═══
create table if not exists leadvox_private.usuarios_log(
 id bigint generated always as identity primary key,
 organization_id uuid not null, autor uuid, acao text not null, alvo uuid, dados jsonb,
 criado_em timestamptz not null default now()
);
create index if not exists usuarios_log_org on leadvox_private.usuarios_log(organization_id,criado_em desc);
alter table leadvox_private.usuarios_log enable row level security;
revoke all on leadvox_private.usuarios_log from public,anon,authenticated;

-- 'plataforma' (Super Admin), 'owner', 'admin' ou null (membro ou de fora: não gere)
create or replace function leadvox_private.usuarios_gestor(org uuid) returns text language sql stable security definer set search_path='' as $$
 select case when public.lv_is_platform_admin() then 'plataforma'
  else (select m.role from public.lv_memberships m where m.organization_id=org and m.user_id=auth.uid() and m.role in('owner','admin')) end;
$$;

create or replace function leadvox_private.usuarios_registrar(org uuid,gestor text,acao text,alvo uuid,dados jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into leadvox_private.usuarios_log(organization_id,autor,acao,alvo,dados) values(org,auth.uid(),acao,alvo,dados);
 if gestor='plataforma' then
  insert into leadvox_private.saas_admin_log(organization_id,admin_id,acao,dados) values(org,auth.uid(),'usuario-'||acao,coalesce(dados,'{}'::jsonb)||jsonb_build_object('alvo',alvo));
 end if;
end;$$;

-- e-mail em minúsculas e com cara de e-mail, ou null
create or replace function leadvox_private.usuarios_email(v text) returns text language sql immutable set search_path='' as $$
 select case when length(e)<=254 and e ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then e end from (select lower(btrim(coalesce(v,''))) e) x;
$$;

revoke all on function leadvox_private.usuarios_gestor(uuid),leadvox_private.usuarios_registrar(uuid,text,text,uuid,jsonb),leadvox_private.usuarios_email(text) from public,anon,authenticated;

-- ═══ PARTE 2 · lista e cadastro ═══
-- Lista: e-mail, função, último acesso. Só para o dono, o admin e o Super Admin.
create or replace function public.lv_usuarios(org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g text:=leadvox_private.usuarios_gestor(org); dono uuid;
begin
 if g is null then raise exception 'forbidden'; end if;
 select owner_id into dono from public.lv_organizations where id=org;
 if dono is null then raise exception 'not_found'; end if;
 return jsonb_build_object('gestor',g,'eu',auth.uid(),'usuarios',coalesce((select jsonb_agg(jsonb_build_object(
   'id',u.id,'email',u.email,'papel',m.role,'principal',u.id=dono,'ultimoAcesso',u.last_sign_in_at,'criado',u.created_at,
   'suporte',u.id<>dono and exists(select 1 from leadvox_private.platform_admins p where p.user_id=u.id))
   order by (u.id=dono) desc,case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,u.email)
  from public.lv_memberships m join auth.users u on u.id=m.user_id where m.organization_id=org),'[]'::jsonb));
end;$$;

-- Cadastro: quem já tem login entra direto; quem não tem volta 'sem_login' e a função "usuarios" cria o login e chama de novo.
-- Até 30 pessoas por dia por empresa (o Super Admin não tem limite).
create or replace function public.lv_usuarios_adicionar(org uuid,p_email text,papel text) returns jsonb language plpgsql security definer set search_path='' as $$
declare g text:=leadvox_private.usuarios_gestor(org); e text:=leadvox_private.usuarios_email(p_email); u auth.users;
begin
 if g is null then raise exception 'forbidden'; end if;
 if not exists(select 1 from public.lv_organizations where id=org) then raise exception 'not_found'; end if;
 if e is null then return jsonb_build_object('ok',false,'erro','email'); end if;
 if papel is null or papel not in('owner','admin','member') then return jsonb_build_object('ok',false,'erro','papel'); end if;
 if papel='owner' and g='admin' then return jsonb_build_object('ok',false,'erro','so_dono'); end if;
 if g<>'plataforma' and (select count(*) from leadvox_private.usuarios_log l where l.organization_id=org and l.acao='adicionar' and l.criado_em>now()-interval '1 day')>=30 then
  return jsonb_build_object('ok',false,'erro','limite');
 end if;
 select * into u from auth.users x where lower(x.email)=e order by x.created_at limit 1;
 if u.id is null then return jsonb_build_object('ok',false,'erro','sem_login'); end if;
 if exists(select 1 from public.lv_memberships where organization_id=org and user_id=u.id) then return jsonb_build_object('ok',false,'erro','ja_membro'); end if;
 insert into public.lv_memberships(organization_id,user_id,role) values(org,u.id,papel);
 perform leadvox_private.usuarios_registrar(org,g,'adicionar',u.id,jsonb_build_object('email',e,'papel',papel,
  'novoLogin',u.last_sign_in_at is null and u.created_at>now()-interval '10 minutes'));
 return jsonb_build_object('ok',true,'id',u.id,'email',e,'papel',papel);
end;$$;

-- ═══ PARTE 3 · trocar a função, remover e redefinir a senha ═══
create or replace function public.lv_usuarios_papel(org uuid,alvo uuid,papel text) returns jsonb language plpgsql security definer set search_path='' as $$
declare g text:=leadvox_private.usuarios_gestor(org); dono uuid; atual text;
begin
 if g is null then raise exception 'forbidden'; end if;
 if papel is null or papel not in('owner','admin','member') then return jsonb_build_object('ok',false,'erro','papel'); end if;
 select owner_id into dono from public.lv_organizations where id=org;
 select role into atual from public.lv_memberships where organization_id=org and user_id=alvo for update;
 if atual is null then return jsonb_build_object('ok',false,'erro','nao_encontrado'); end if;
 if alvo=dono then return jsonb_build_object('ok',false,'erro','principal'); end if;
 if alvo=auth.uid() and g<>'plataforma' then return jsonb_build_object('ok',false,'erro','proprio'); end if;
 if g='admin' and (atual='owner' or papel='owner') then return jsonb_build_object('ok',false,'erro','so_dono'); end if;
 if atual<>papel then
  update public.lv_memberships set role=papel where organization_id=org and user_id=alvo;
  perform leadvox_private.usuarios_registrar(org,g,'papel',alvo,jsonb_build_object('de',atual,'para',papel));
 end if;
 return jsonb_build_object('ok',true,'papel',papel);
end;$$;

create or replace function public.lv_usuarios_remover(org uuid,alvo uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare g text:=leadvox_private.usuarios_gestor(org); dono uuid; atual text;
begin
 if g is null then raise exception 'forbidden'; end if;
 select owner_id into dono from public.lv_organizations where id=org;
 select role into atual from public.lv_memberships where organization_id=org and user_id=alvo for update;
 if atual is null then return jsonb_build_object('ok',false,'erro','nao_encontrado'); end if;
 if alvo=dono then return jsonb_build_object('ok',false,'erro','principal'); end if;
 if alvo=auth.uid() and g<>'plataforma' then return jsonb_build_object('ok',false,'erro','proprio'); end if;
 if g='admin' and atual='owner' then return jsonb_build_object('ok',false,'erro','so_dono'); end if;
 delete from public.lv_memberships where organization_id=org and user_id=alvo;
 perform leadvox_private.usuarios_registrar(org,g,'remover',alvo,jsonb_build_object('papel',atual,'email',(select email from auth.users where id=alvo)));
 return jsonb_build_object('ok',true);
end;$$;

-- Devolve o e-mail para o painel pedir o código de "Esqueci minha senha" (o mesmo da tela de entrar). Senha nenhuma passa por aqui.
create or replace function public.lv_usuarios_senha(org uuid,alvo uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare g text:=leadvox_private.usuarios_gestor(org); e text;
begin
 if g is null then raise exception 'forbidden'; end if;
 select u.email into e from public.lv_memberships m join auth.users u on u.id=m.user_id where m.organization_id=org and m.user_id=alvo;
 if e is null then return jsonb_build_object('ok',false,'erro','nao_encontrado'); end if;
 perform leadvox_private.usuarios_registrar(org,g,'senha',alvo,jsonb_build_object('email',e));
 return jsonb_build_object('ok',true,'email',e);
end;$$;

-- ═══ PARTE 4 · trocar o e-mail de login (só o Super Admin) e permissões ═══
-- Confere antes: a pessoa é da empresa, não é da equipe LeadVox e o e-mail novo não é login de outra pessoa.
create or replace function public.lv_usuarios_email_conferir(org uuid,alvo uuid,novo text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e text:=leadvox_private.usuarios_email(novo); atual text;
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 select u.email into atual from public.lv_memberships m join auth.users u on u.id=m.user_id where m.organization_id=org and m.user_id=alvo;
 if atual is null then return jsonb_build_object('ok',false,'erro','nao_encontrado'); end if;
 if exists(select 1 from leadvox_private.platform_admins where user_id=alvo) then return jsonb_build_object('ok',false,'erro','plataforma'); end if;
 if e is null then return jsonb_build_object('ok',false,'erro','email'); end if;
 if lower(atual)=e then return jsonb_build_object('ok',false,'erro','mesmo_email'); end if;
 if exists(select 1 from auth.users where lower(email)=e and id<>alvo) then return jsonb_build_object('ok',false,'erro','email_em_uso'); end if;
 return jsonb_build_object('ok',true,'de',atual,'para',e);
end;$$;

-- Depois da troca: só registra se o login já está mesmo com o e-mail novo.
create or replace function public.lv_usuarios_email_registrar(org uuid,alvo uuid,de text) returns jsonb language plpgsql security definer set search_path='' as $$
declare atual text;
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 select email into atual from auth.users where id=alvo;
 if atual is null or lower(atual)=lower(coalesce(de,'')) then return jsonb_build_object('ok',false,'erro','nao_trocou'); end if;
 perform leadvox_private.usuarios_registrar(org,'plataforma','email',alvo,jsonb_build_object('de',left(de,254),'para',atual));
 return jsonb_build_object('ok',true,'email',atual);
end;$$;

revoke all on function public.lv_usuarios(uuid),public.lv_usuarios_adicionar(uuid,text,text),public.lv_usuarios_papel(uuid,uuid,text),
 public.lv_usuarios_remover(uuid,uuid),public.lv_usuarios_senha(uuid,uuid),public.lv_usuarios_email_conferir(uuid,uuid,text),
 public.lv_usuarios_email_registrar(uuid,uuid,text) from public,anon;
grant execute on function public.lv_usuarios(uuid),public.lv_usuarios_adicionar(uuid,text,text),public.lv_usuarios_papel(uuid,uuid,text),
 public.lv_usuarios_remover(uuid,uuid),public.lv_usuarios_senha(uuid,uuid),public.lv_usuarios_email_conferir(uuid,uuid,text),
 public.lv_usuarios_email_registrar(uuid,uuid,text) to authenticated;

insert into leadvox_private.sql_aplicado(arquivo) values('usuarios.sql') on conflict(arquivo) do nothing;
