-- Site da loja: domínio próprio (www.sualoja.com.br ou estoque.sualoja.com.br) e pedidos de registro de domínio.
-- Rodar depois de site_modelos_fieis.sql. Usa leadvox_private.usuarios_gestor (dono/admin/Super Admin) e public.lv_is_platform_admin.
--
-- Como funciona:
--  • O lojista escolhe o endereço (lv_site_dominio_salvar). Fica "pendente" até provar que controla o domínio
--    (registro TXT _leadvox.<domínio> = leadvox=<token>).
--  • Quem verifica é o servidor do painel (DNS, HTTPS e se a página é da loja certa). O resultado só é aceito com a
--    assinatura do servidor (HMAC com a chave de site_dominio_chave, a mesma da variável SITE_DOMINIO_SEGREDO na VPS):
--    o lojista não consegue se declarar dono de um domínio chamando a função direto.
--  • "verificado" = controle provado (o endereço passa a ser desta loja e abre o site dela); "ativo" = DNS, HTTPS e
--    site certo conferidos de verdade. Um endereço verificado não pode ir para outra loja.
--  • Registro de domínio novo: pedido manual (lojista pede → LeadVox cota → lojista aceita com CPF/CNPJ do titular →
--    LeadVox registra no Registro.br e marca como registrado, o que já abre a configuração do domínio).

create extension if not exists pgcrypto with schema extensions;

create table if not exists leadvox_private.site_dominios(
 organization_id uuid primary key references public.lv_organizations(id) on delete cascade,
 dominio text not null,           -- principal: sualoja.com.br (sem www) · subdomínio: estoque.sualoja.com.br
 tipo text not null check (tipo in ('principal','subdominio')),
 preferido text not null default 'www' check (preferido in ('www','raiz')), -- principal: qual dos dois abre o site (o outro redireciona)
 hosts text[] not null,           -- endereços que este cadastro ocupa (principal: raiz e www)
 token text not null,
 status text not null default 'pendente' check (status in ('pendente','verificado','ativo')),
 checagem jsonb not null default '{}'::jsonb,
 criado_em timestamptz not null default now(), checado_em timestamptz, verificado_em timestamptz, ativo_em timestamptz, autor uuid
);
create index if not exists site_dominios_hosts on leadvox_private.site_dominios using gin(hosts);
alter table leadvox_private.site_dominios enable row level security;
revoke all on leadvox_private.site_dominios from public,anon,authenticated;

-- onde o site da loja está hospedado: no painel (VPS, /s/<conta>/) ou no GitHub Pages (repositório próprio, ex.: MG e P5)
create table if not exists leadvox_private.site_hospedagem(
 organization_id uuid primary key references public.lv_organizations(id) on delete cascade,
 tipo text not null default 'leadvox' check (tipo in ('leadvox','github')),
 repo text check (repo is null or repo ~ '^[A-Za-z0-9_.-]{1,39}/[A-Za-z0-9_.-]{1,100}$'),
 atualizado_em timestamptz not null default now()
);
alter table leadvox_private.site_hospedagem enable row level security;
revoke all on leadvox_private.site_hospedagem from public,anon,authenticated;

-- chave da assinatura das verificações (copiar para SITE_DOMINIO_SEGREDO no Coolify; o Super Admin mostra)
create table if not exists leadvox_private.site_dominio_chave(
 id int primary key default 1 check (id = 1),
 segredo text not null default encode(extensions.gen_random_bytes(32),'hex')
);
insert into leadvox_private.site_dominio_chave(id) values(1) on conflict(id) do nothing;
alter table leadvox_private.site_dominio_chave enable row level security;
revoke all on leadvox_private.site_dominio_chave from public,anon,authenticated;

create table if not exists leadvox_private.site_dominio_pedidos(
 id bigserial primary key,
 organization_id uuid not null references public.lv_organizations(id) on delete cascade,
 nome text not null,
 status text not null default 'recebido' check (status in ('recebido','cotado','indisponivel','aceito','registrado','cancelado')),
 disponivel boolean, valor_registro numeric(10,2), valor_renovacao numeric(10,2),
 renovacao_inclusa boolean, responsavel_renovacao text check (responsavel_renovacao is null or responsavel_renovacao in ('loja','leadvox')),
 observacao text, titular_nome text, titular_documento text,
 criado_em timestamptz not null default now(), cotado_em timestamptz, aceito_em timestamptz, registrado_em timestamptz,
 atualizado_em timestamptz not null default now(), autor uuid
);
create index if not exists site_dominio_pedidos_org on leadvox_private.site_dominio_pedidos(organization_id, criado_em desc);
alter table leadvox_private.site_dominio_pedidos enable row level security;
revoke all on leadvox_private.site_dominio_pedidos from public,anon,authenticated;

-- endereço válido (minúsculo, sem protocolo): nunca um endereço da própria LeadVox
create or replace function leadvox_private.dominio_ok(d text) returns boolean language sql immutable set search_path='' as $$
 select d is not null and length(d) between 4 and 253
  and d ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$'
  and d !~ '(^|\.)(leadvox\.com\.br|lv-mktdeconversa\.com|sslip\.io|github\.io)$';
$$;
create or replace function leadvox_private.dominio_json(r leadvox_private.site_dominios) returns jsonb language sql stable set search_path='' as $$
 select case when r.organization_id is null then null else jsonb_build_object('dominio',r.dominio,'tipo',r.tipo,'preferido',r.preferido,'hosts',to_jsonb(r.hosts),
  'token',r.token,'status',r.status,'checagem',r.checagem,'criadoEm',r.criado_em,'checadoEm',r.checado_em,'verificadoEm',r.verificado_em,'ativoEm',r.ativo_em) end;
$$;
create or replace function leadvox_private.dominio_pedido_json(p leadvox_private.site_dominio_pedidos) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',p.id,'nome',p.nome,'status',p.status,'disponivel',p.disponivel,'valorRegistro',p.valor_registro,'valorRenovacao',p.valor_renovacao,
  'renovacaoInclusa',p.renovacao_inclusa,'responsavelRenovacao',p.responsavel_renovacao,'observacao',p.observacao,'titularNome',p.titular_nome,
  'titularDocumento',case when p.titular_documento is null then null else '•••' || right(p.titular_documento,4) end,
  'criadoEm',p.criado_em,'cotadoEm',p.cotado_em,'aceitoEm',p.aceito_em,'registradoEm',p.registrado_em);
$$;
revoke all on function leadvox_private.dominio_ok(text),leadvox_private.dominio_json(leadvox_private.site_dominios),
 leadvox_private.dominio_pedido_json(leadvox_private.site_dominio_pedidos) from public,anon,authenticated;

-- ── painel do lojista ─────────────────────────────────────────────────────────
create or replace function public.lv_site_dominio(org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g text:=leadvox_private.usuarios_gestor(org); r leadvox_private.site_dominios; h leadvox_private.site_hospedagem;
begin
 if g is null then raise exception 'forbidden'; end if;
 select * into r from leadvox_private.site_dominios where organization_id=org;
 select * into h from leadvox_private.site_hospedagem where organization_id=org;
 return jsonb_build_object('conta',(select m.conta from leadvox_private.motor_contas m where m.organization_id=org limit 1),
  'publicado',coalesce((select c.publicado from leadvox_private.site_config c where c.organization_id=org),false),
  'hospedagem',jsonb_build_object('tipo',coalesce(h.tipo,'leadvox'),'repo',h.repo),
  'dominio',leadvox_private.dominio_json(r),
  'pedidos',coalesce((select jsonb_agg(leadvox_private.dominio_pedido_json(p) order by p.criado_em desc) from leadvox_private.site_dominio_pedidos p
    where p.id in (select x.id from leadvox_private.site_dominio_pedidos x where x.organization_id=org order by x.criado_em desc limit 5)),'[]'::jsonb));
end;$$;

create or replace function public.lv_site_dominio_salvar(org uuid,p_dominio text,p_tipo text,p_preferido text) returns jsonb language plpgsql security definer set search_path='' as $$
declare g text:=leadvox_private.usuarios_gestor(org); d text:=lower(btrim(coalesce(p_dominio,''))); hs text[]; r leadvox_private.site_dominios;
begin
 if g is null then raise exception 'forbidden'; end if;
 if p_tipo not in ('principal','subdominio') then return jsonb_build_object('ok',false,'erro','tipo'); end if;
 if p_tipo='principal' and d like 'www.%' then d:=substr(d,5); end if;
 if not leadvox_private.dominio_ok(d) then return jsonb_build_object('ok',false,'erro','dominio'); end if;
 if p_tipo='subdominio' and (d like 'www.%' or array_length(string_to_array(d,'.'),1)<3) then return jsonb_build_object('ok',false,'erro','subdominio'); end if;
 hs:=case when p_tipo='principal' then array[d,'www.'||d] else array[d] end;
 -- endereço já confirmado por outra loja: não pode
 if exists(select 1 from leadvox_private.site_dominios x where x.organization_id<>org and x.status<>'pendente' and x.hosts && hs) then
  return jsonb_build_object('ok',false,'erro','em_uso'); end if;
 select * into r from leadvox_private.site_dominios where organization_id=org for update;
 if r.organization_id is not null and r.dominio=d and r.tipo=p_tipo then
  update leadvox_private.site_dominios set preferido=case when p_preferido='raiz' then 'raiz' else 'www' end where organization_id=org returning * into r;
 else
  insert into leadvox_private.site_dominios(organization_id,dominio,tipo,preferido,hosts,token,status,checagem,autor)
  values(org,d,p_tipo,case when p_preferido='raiz' then 'raiz' else 'www' end,hs,encode(extensions.gen_random_bytes(12),'hex'),'pendente','{}'::jsonb,auth.uid())
  on conflict(organization_id) do update set dominio=excluded.dominio,tipo=excluded.tipo,preferido=excluded.preferido,hosts=excluded.hosts,token=excluded.token,
   status='pendente',checagem='{}'::jsonb,criado_em=now(),checado_em=null,verificado_em=null,ativo_em=null,autor=excluded.autor
  returning * into r;
 end if;
 return jsonb_build_object('ok',true,'dominio',leadvox_private.dominio_json(r));
end;$$;

create or replace function public.lv_site_dominio_remover(org uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare g text:=leadvox_private.usuarios_gestor(org);
begin
 if g is null then raise exception 'forbidden'; end if;
 delete from leadvox_private.site_dominios where organization_id=org;
 return jsonb_build_object('ok',true);
end;$$;

-- resultado da verificação feita pelo servidor do painel (assinado: HMAC-SHA256 de "org|dominio|status|ts")
create or replace function public.lv_site_dominio_resultado(org uuid,p_dominio text,p_status text,p_checagem jsonb,p_ts bigint,p_assinatura text) returns jsonb language plpgsql security definer set search_path='' as $$
declare g text:=leadvox_private.usuarios_gestor(org); r leadvox_private.site_dominios; k text; esperado text; agora bigint:=(extract(epoch from now())*1000)::bigint;
begin
 if g is null then raise exception 'forbidden'; end if;
 if p_status not in ('pendente','verificado','ativo') or p_ts is null or abs(agora-p_ts)>600000 then return jsonb_build_object('ok',false,'erro','assinatura'); end if;
 select segredo into k from leadvox_private.site_dominio_chave where id=1;
 esperado:=encode(extensions.hmac(org::text||'|'||coalesce(p_dominio,'')||'|'||p_status||'|'||p_ts::text,k,'sha256'),'hex');
 if p_assinatura is null or p_assinatura<>esperado then return jsonb_build_object('ok',false,'erro','assinatura'); end if;
 select * into r from leadvox_private.site_dominios where organization_id=org for update;
 if r.organization_id is null or r.dominio<>p_dominio then return jsonb_build_object('ok',false,'erro','mudou'); end if;
 if p_status<>'pendente' and exists(select 1 from leadvox_private.site_dominios x where x.organization_id<>org and x.status<>'pendente' and x.hosts && r.hosts) then
  update leadvox_private.site_dominios set checagem=coalesce(p_checagem,'{}'::jsonb)||jsonb_build_object('conflito',true),checado_em=now(),status='pendente' where organization_id=org;
  return jsonb_build_object('ok',false,'erro','em_uso'); end if;
 update leadvox_private.site_dominios set status=p_status,checagem=case when octet_length(coalesce(p_checagem,'{}'::jsonb)::text)>20000 then '{}'::jsonb else coalesce(p_checagem,'{}'::jsonb) end,
  checado_em=now(),
  verificado_em=case when p_status<>'pendente' then coalesce(r.verificado_em,now()) else null end,
  ativo_em=case when p_status='ativo' then coalesce(r.ativo_em,now()) else null end
 where organization_id=org returning * into r;
 return jsonb_build_object('ok',true,'dominio',leadvox_private.dominio_json(r));
end;$$;

create or replace function public.lv_site_dominio_pedir(org uuid,p_nome text) returns jsonb language plpgsql security definer set search_path='' as $$
declare g text:=leadvox_private.usuarios_gestor(org); n text:=lower(btrim(coalesce(p_nome,''))); p leadvox_private.site_dominio_pedidos;
begin
 if g is null then raise exception 'forbidden'; end if;
 n:=regexp_replace(regexp_replace(n,'^https?://',''),'^www\.','');
 if not leadvox_private.dominio_ok(n) then return jsonb_build_object('ok',false,'erro','dominio'); end if;
 if exists(select 1 from leadvox_private.site_dominio_pedidos x where x.organization_id=org and x.status in ('recebido','cotado','aceito')) then
  return jsonb_build_object('ok',false,'erro','pedido_aberto'); end if;
 insert into leadvox_private.site_dominio_pedidos(organization_id,nome,autor) values(org,n,auth.uid()) returning * into p;
 return jsonb_build_object('ok',true,'pedido',leadvox_private.dominio_pedido_json(p));
end;$$;

-- aceite da cotação: titular do domínio (nome e CPF ou CNPJ, só números)
create or replace function public.lv_site_dominio_pedido_aceitar(org uuid,p_id bigint,p_titular text,p_documento text) returns jsonb language plpgsql security definer set search_path='' as $$
declare g text:=leadvox_private.usuarios_gestor(org); doc text:=regexp_replace(coalesce(p_documento,''),'\D','','g'); p leadvox_private.site_dominio_pedidos;
begin
 if g is null then raise exception 'forbidden'; end if;
 if length(doc) not in (11,14) then return jsonb_build_object('ok',false,'erro','documento'); end if;
 if leadvox_private.site_txt(to_jsonb(p_titular),120)='' then return jsonb_build_object('ok',false,'erro','titular'); end if;
 update leadvox_private.site_dominio_pedidos set status='aceito',titular_nome=leadvox_private.site_txt(to_jsonb(p_titular),120),titular_documento=doc,aceito_em=now(),atualizado_em=now()
  where id=p_id and organization_id=org and status='cotado' and disponivel is true returning * into p;
 if p.id is null then return jsonb_build_object('ok',false,'erro','pedido'); end if;
 return jsonb_build_object('ok',true,'pedido',leadvox_private.dominio_pedido_json(p));
end;$$;

create or replace function public.lv_site_dominio_pedido_cancelar(org uuid,p_id bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare g text:=leadvox_private.usuarios_gestor(org); p leadvox_private.site_dominio_pedidos;
begin
 if g is null then raise exception 'forbidden'; end if;
 update leadvox_private.site_dominio_pedidos set status='cancelado',atualizado_em=now()
  where id=p_id and organization_id=org and status in ('recebido','cotado','indisponivel') returning * into p;
 if p.id is null then return jsonb_build_object('ok',false,'erro','pedido'); end if;
 return jsonb_build_object('ok',true);
end;$$;

-- ── público: o servidor descobre de qual loja é o endereço pedido (só endereço com controle provado) ──
create or replace function public.lv_site_dominio_host(p_host text) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('conta',m.conta,'dominio',d.dominio,'tipo',d.tipo,'preferido',d.preferido,'hosts',to_jsonb(d.hosts),'status',d.status)
  from leadvox_private.site_dominios d join leadvox_private.motor_contas m on m.organization_id=d.organization_id
  where lower(p_host)=any(d.hosts) and d.status in ('verificado','ativo') limit 1),'null'::jsonb);
$$;

-- ── Super Admin ───────────────────────────────────────────────────────────────
create or replace function public.lv_admin_dominios() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 return jsonb_build_object(
  'dominios',coalesce((select jsonb_agg(leadvox_private.dominio_json(d)||jsonb_build_object('organization',d.organization_id,'empresa',o.name,
     'conta',(select m.conta from leadvox_private.motor_contas m where m.organization_id=d.organization_id limit 1),
     'hospedagem',jsonb_build_object('tipo',coalesce(h.tipo,'leadvox'),'repo',h.repo)) order by d.criado_em desc)
   from leadvox_private.site_dominios d join public.lv_organizations o on o.id=d.organization_id
   left join leadvox_private.site_hospedagem h on h.organization_id=d.organization_id),'[]'::jsonb),
  'pedidos',coalesce((select jsonb_agg(leadvox_private.dominio_pedido_json(p)||jsonb_build_object('organization',p.organization_id,'empresa',o.name,
     'titularDocumento',p.titular_documento) order by p.criado_em desc)
   from leadvox_private.site_dominio_pedidos p join public.lv_organizations o on o.id=p.organization_id where p.status<>'cancelado'),'[]'::jsonb),
  'hospedagens',coalesce((select jsonb_agg(jsonb_build_object('organization',h.organization_id,'empresa',o.name,'tipo',h.tipo,'repo',h.repo))
   from leadvox_private.site_hospedagem h join public.lv_organizations o on o.id=h.organization_id),'[]'::jsonb));
end;$$;

create or replace function public.lv_admin_dominio_cotar(p_id bigint,p_disponivel boolean,p_valor_registro numeric,p_valor_renovacao numeric,
 p_inclusa boolean,p_responsavel text,p_obs text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p leadvox_private.site_dominio_pedidos;
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 if p_disponivel is true and (p_valor_registro is null or p_valor_registro<0 or p_valor_renovacao is null or p_valor_renovacao<0
   or p_inclusa is null or p_responsavel not in ('loja','leadvox')) then return jsonb_build_object('ok',false,'erro','cotacao'); end if;
 update leadvox_private.site_dominio_pedidos set disponivel=p_disponivel,status=case when p_disponivel then 'cotado' else 'indisponivel' end,
  valor_registro=case when p_disponivel then p_valor_registro end,valor_renovacao=case when p_disponivel then p_valor_renovacao end,
  renovacao_inclusa=case when p_disponivel then p_inclusa end,responsavel_renovacao=case when p_disponivel then p_responsavel end,
  observacao=left(coalesce(p_obs,''),400),cotado_em=now(),atualizado_em=now()
 where id=p_id and status in ('recebido','cotado','indisponivel') returning * into p;
 if p.id is null then return jsonb_build_object('ok',false,'erro','pedido'); end if;
 return jsonb_build_object('ok',true);
end;$$;

-- registrado no Registro.br pela equipe: abre a configuração do domínio da loja (mesmo fluxo de verificação)
create or replace function public.lv_admin_dominio_registrado(p_id bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare p leadvox_private.site_dominio_pedidos;
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 update leadvox_private.site_dominio_pedidos set status='registrado',registrado_em=now(),atualizado_em=now()
  where id=p_id and status='aceito' returning * into p;
 if p.id is null then return jsonb_build_object('ok',false,'erro','pedido'); end if;
 if not exists(select 1 from leadvox_private.site_dominios x where x.organization_id<>p.organization_id and x.status<>'pendente' and x.hosts && array[p.nome,'www.'||p.nome]) then
  insert into leadvox_private.site_dominios(organization_id,dominio,tipo,preferido,hosts,token,status,autor)
  values(p.organization_id,p.nome,'principal','www',array[p.nome,'www.'||p.nome],encode(extensions.gen_random_bytes(12),'hex'),'pendente',auth.uid())
  on conflict(organization_id) do nothing;
 end if;
 return jsonb_build_object('ok',true);
end;$$;

create or replace function public.lv_admin_site_hospedagem(org uuid,p_tipo text,p_repo text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 if p_tipo not in ('leadvox','github') or (p_tipo='github' and coalesce(p_repo,'') !~ '^[A-Za-z0-9_.-]{1,39}/[A-Za-z0-9_.-]{1,100}$') then
  return jsonb_build_object('ok',false,'erro','hospedagem'); end if;
 insert into leadvox_private.site_hospedagem(organization_id,tipo,repo,atualizado_em) values(org,p_tipo,case when p_tipo='github' then p_repo end,now())
 on conflict(organization_id) do update set tipo=excluded.tipo,repo=excluded.repo,atualizado_em=now();
 return jsonb_build_object('ok',true);
end;$$;

create or replace function public.lv_admin_dominio_chave() returns text language plpgsql stable security definer set search_path='' as $$
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 return (select segredo from leadvox_private.site_dominio_chave where id=1);
end;$$;

revoke all on function public.lv_site_dominio(uuid),public.lv_site_dominio_salvar(uuid,text,text,text),public.lv_site_dominio_remover(uuid),
 public.lv_site_dominio_resultado(uuid,text,text,jsonb,bigint,text),public.lv_site_dominio_pedir(uuid,text),
 public.lv_site_dominio_pedido_aceitar(uuid,bigint,text,text),public.lv_site_dominio_pedido_cancelar(uuid,bigint),public.lv_site_dominio_host(text),
 public.lv_admin_dominios(),public.lv_admin_dominio_cotar(bigint,boolean,numeric,numeric,boolean,text,text),public.lv_admin_dominio_registrado(bigint),
 public.lv_admin_site_hospedagem(uuid,text,text),public.lv_admin_dominio_chave() from public,anon;
grant execute on function public.lv_site_dominio(uuid),public.lv_site_dominio_salvar(uuid,text,text,text),public.lv_site_dominio_remover(uuid),
 public.lv_site_dominio_resultado(uuid,text,text,jsonb,bigint,text),public.lv_site_dominio_pedir(uuid,text),
 public.lv_site_dominio_pedido_aceitar(uuid,bigint,text,text),public.lv_site_dominio_pedido_cancelar(uuid,bigint),
 public.lv_admin_dominios(),public.lv_admin_dominio_cotar(bigint,boolean,numeric,numeric,boolean,text,text),public.lv_admin_dominio_registrado(bigint),
 public.lv_admin_site_hospedagem(uuid,text,text),public.lv_admin_dominio_chave() to authenticated;
grant execute on function public.lv_site_dominio_host(text) to anon,authenticated;

insert into leadvox_private.sql_aplicado(arquivo) values('site_dominio.sql') on conflict(arquivo) do nothing;
