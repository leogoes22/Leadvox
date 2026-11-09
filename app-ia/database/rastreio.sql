-- Rastreamento de anúncios (módulo extra): origem do lead que veio de anúncio de clique para WhatsApp, os envios à Meta
-- (lead qualificado e compra no Ganho) e a configuração de cada empresa. O Super Admin libera o módulo por empresa.
-- Quem recebe o webhook da LeadVox e fala com a Meta é a função "rastreio" (service_role); o token da Meta fica no Vault.
-- Rodar depois de integrations.sql, elevenlabs.sql e assinaturas.sql. O editor do Supabase trava com texto grande:
-- rodar parte por parte (PARTE 1 a 5), na ordem.

-- ═══ PARTE 1 · tabelas ═══
create table if not exists leadvox_private.rastreio_config(
 organization_id uuid primary key references public.lv_organizations(id) on delete cascade,
 liberado boolean not null default false,  -- Super Admin: módulo contratado
 liberado_em timestamptz,
 ativo boolean not null default false,     -- o cliente ligou o envio
 token text not null unique default replace(gen_random_uuid()::text,'-','') check(token ~ '^[0-9a-f]{32}$'),
 modo text not null default 'pixel' check(modo in('pixel','whatsapp')),
 pixel_id text check(pixel_id ~ '^[0-9]{6,20}$'),
 waba_id text check(waba_id ~ '^[0-9]{6,20}$'),
 page_id text check(page_id ~ '^[0-9]{6,20}$'),
 etapas_qualificado bigint[] not null default '{}' check(cardinality(etapas_qualificado)<=20),
 evento_qualificado text not null default 'QualifiedLead' check(evento_qualificado in('QualifiedLead','Lead','LeadSubmitted','Contact','Schedule','SubmitApplication','CompleteRegistration')),
 enviar_compra boolean not null default true,
 teste_codigo text check(teste_codigo ~ '^[A-Za-z0-9]{3,40}$'),
 ultimo_evento timestamptz,
 atualizado_em timestamptz not null default now()
);
create table if not exists leadvox_private.rastreio_leads(
 id bigint generated always as identity primary key,
 organization_id uuid not null references public.lv_organizations(id) on delete cascade,
 contato_id bigint not null,                                   -- id do contato na LeadVox
 telefone_hash text check(telefone_hash ~ '^[0-9a-f]{64}$'),   -- SHA-256 do telefone (o número não é guardado)
 final text check(final ~ '^[0-9]{0,4}$'),                     -- 4 últimos dígitos, só para mostrar
 nome text check(char_length(nome)<=80),
 anuncio_id text check(anuncio_id ~ '^[0-9]{1,30}$'),
 titulo text check(char_length(titulo)<=120),
 link text check(char_length(link)<=300),
 ctwa_clid text check(char_length(ctwa_clid)<=500),
 midia text check(char_length(midia)<=20),
 criado_em timestamptz not null default now(),
 ultima_em timestamptz not null default now(),
 unique(organization_id,contato_id)
);
create index if not exists rastreio_leads_org_data on leadvox_private.rastreio_leads(organization_id,criado_em desc);
create index if not exists rastreio_leads_org_hash on leadvox_private.rastreio_leads(organization_id,telefone_hash);
create table if not exists leadvox_private.rastreio_envios(
 id bigint generated always as identity primary key,
 organization_id uuid not null references public.lv_organizations(id) on delete cascade,
 lead_id bigint not null references leadvox_private.rastreio_leads(id) on delete cascade,
 oportunidade_id bigint not null,
 tipo text not null check(tipo in('qualificado','compra')),
 evento text not null check(evento ~ '^[A-Za-z]{2,40}$'),
 valor numeric(14,2),
 etapa text check(char_length(etapa)<=80),
 status text not null default 'pendente' check(status in('pendente','enviado','erro')),
 detalhe text check(char_length(detalhe)<=300),
 criado_em timestamptz not null default now(),
 enviado_em timestamptz,
 unique(organization_id,oportunidade_id,tipo)                  -- um envio por card e por tipo
);
create index if not exists rastreio_envios_org_data on leadvox_private.rastreio_envios(organization_id,criado_em desc);
alter table leadvox_private.rastreio_config enable row level security;
alter table leadvox_private.rastreio_leads enable row level security;
alter table leadvox_private.rastreio_envios enable row level security;
revoke all on leadvox_private.rastreio_config,leadvox_private.rastreio_leads,leadvox_private.rastreio_envios from public,anon,authenticated;

-- O token da Meta usa a mesma guarda das outras conexões (Vault): provedor 'meta'.
alter table leadvox_private.integrations drop constraint if exists integrations_provider_check;
alter table leadvox_private.integrations add constraint integrations_provider_check check(provider in('estoque','asaas','elevenlabs','meta'));
create or replace function public.lv_set_integration(org uuid,prov text,conf jsonb,sec text) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 if not exists(select 1 from public.lv_memberships where organization_id=org and user_id=auth.uid() and role in('owner','admin')) then raise exception 'forbidden'; end if;
 if prov not in('estoque','asaas','elevenlabs','meta') or jsonb_typeof(conf)<>'object' or octet_length(conf::text)>4000 or length(coalesce(sec,''))>4000 then raise exception 'invalid'; end if;
 select secret_id into sid from leadvox_private.integrations where organization_id=org and provider=prov;
 if coalesce(sec,'')<>'' then
  if sid is null then sid:=vault.create_secret(sec,'lv_'||prov||'_'||org::text,'Conexão '||prov);
  else perform vault.update_secret(sid,sec); end if;
 end if;
 insert into leadvox_private.integrations(organization_id,provider,settings,secret_id) values(org,prov,conf,sid)
 on conflict(organization_id,provider) do update set settings=excluded.settings,secret_id=excluded.secret_id,updated_at=now();
end;$$;

-- ═══ PARTE 2 · função "rastreio" (service_role): chegou evento, lead do anúncio, resultado do envio ═══
create or replace function public.iag_rastreio_visto(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c leadvox_private.rastreio_config;
begin
 select * into c from leadvox_private.rastreio_config where token=p_token;
 if not found then return jsonb_build_object('ok',false); end if;
 if c.ultimo_evento is null or c.ultimo_evento<now()-interval '1 minute' then
  update leadvox_private.rastreio_config set ultimo_evento=now() where organization_id=c.organization_id;
 end if;
 return jsonb_build_object('ok',true,'ligado',c.liberado and c.ativo);
end;$$;

-- Primeira mensagem vinda de anúncio: o primeiro anúncio de cada contato é o que vale (não sobrescreve).
create or replace function public.iag_rastreio_lead(p_token text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c leadvox_private.rastreio_config; v_contato bigint; v_novo boolean;
begin
 select * into c from leadvox_private.rastreio_config where token=p_token;
 if not found then return jsonb_build_object('ok',false); end if;
 update leadvox_private.rastreio_config set ultimo_evento=now() where organization_id=c.organization_id;
 if not (c.liberado and c.ativo) then return jsonb_build_object('ok',true,'desligado',true); end if;
 if jsonb_typeof(p)<>'object' or coalesce(p->>'contato','')!~'^[0-9]{1,15}$' then return jsonb_build_object('ok',true,'ignorado',true); end if;
 v_contato:=(p->>'contato')::bigint;
 insert into leadvox_private.rastreio_leads(organization_id,contato_id,telefone_hash,final,nome,anuncio_id,titulo,link,ctwa_clid,midia)
 values(c.organization_id,v_contato,
  case when coalesce(p->>'hash','')~'^[0-9a-f]{64}$' then p->>'hash' end,
  case when coalesce(p->>'final','')~'^[0-9]{1,4}$' then p->>'final' end,
  nullif(left(coalesce(p->>'nome',''),80),''),
  case when coalesce(p->>'anuncio','')~'^[0-9]{1,30}$' then p->>'anuncio' end,
  nullif(left(coalesce(p->>'titulo',''),120),''),
  case when coalesce(p->>'link','') like 'https://%' then left(p->>'link',300) end,
  nullif(left(coalesce(p->>'clid',''),500),''),
  nullif(left(coalesce(p->>'midia',''),20),''))
 on conflict(organization_id,contato_id) do update set ultima_em=now()
 returning (xmax=0) into v_novo;
 return jsonb_build_object('ok',true,'novo',v_novo);
end;$$;

create or replace function public.iag_rastreio_resultado(p_token text,p_id bigint,p_status text,p_detalhe text) returns void language sql security definer set search_path='' as $$
 update leadvox_private.rastreio_envios e set status=case when p_status in('enviado','erro') then p_status else 'erro' end,
  detalhe=left(coalesce(p_detalhe,''),300),enviado_em=now()
 from leadvox_private.rastreio_config c where c.token=p_token and e.organization_id=c.organization_id and e.id=p_id;
$$;

-- ═══ PARTE 3 · oportunidade mudou: decide o que mandar à Meta (um envio por card e por tipo) ═══
create or replace function public.iag_rastreio_oportunidade(p_token text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c leadvox_private.rastreio_config; l leadvox_private.rastreio_leads; v_opp bigint; v_contato bigint; v_hash text; v_valor numeric;
 v_tipo text; v_evt text; v_id bigint; v_env jsonb:='[]'::jsonb; v_tok text;
begin
 select * into c from leadvox_private.rastreio_config where token=p_token;
 if not found then return jsonb_build_object('ok',false); end if;
 update leadvox_private.rastreio_config set ultimo_evento=now() where organization_id=c.organization_id;
 if not (c.liberado and c.ativo) or jsonb_typeof(p)<>'object' or coalesce(p->>'oportunidade','')!~'^[0-9]{1,15}$' then
  return jsonb_build_object('ok',true,'enviar','[]'::jsonb);
 end if;
 v_opp:=(p->>'oportunidade')::bigint;
 v_contato:=case when coalesce(p->>'contato','')~'^[0-9]{1,15}$' then (p->>'contato')::bigint end;
 v_hash:=case when coalesce(p->>'hash','')~'^[0-9a-f]{64}$' then p->>'hash' end;
 select * into l from leadvox_private.rastreio_leads where organization_id=c.organization_id and (contato_id=v_contato or (v_hash is not null and telefone_hash=v_hash))
  order by (contato_id=v_contato) desc, criado_em limit 1;
 if not found then return jsonb_build_object('ok',true,'enviar','[]'::jsonb,'semLead',true); end if;   -- não veio de anúncio
 v_valor:=case when coalesce(p->>'valor','')~'^[0-9]{1,12}([.][0-9]{1,2})?$' then (p->>'valor')::numeric end;
 foreach v_tipo in array array['compra','qualificado'] loop
  v_id:=null;
  if v_tipo='compra' and not (lower(coalesce(p->>'status',''))='won' and c.enviar_compra) then continue; end if;
  if v_tipo='qualificado' and not (coalesce(p->>'etapaId','')~'^[0-9]{1,15}$' and (p->>'etapaId')::bigint=any(c.etapas_qualificado)) then continue; end if;
  v_evt:=case v_tipo when 'compra' then 'Purchase' else c.evento_qualificado end;
  insert into leadvox_private.rastreio_envios(organization_id,lead_id,oportunidade_id,tipo,evento,valor,etapa)
  values(c.organization_id,l.id,v_opp,v_tipo,v_evt,case when v_tipo='compra' then v_valor end,nullif(left(coalesce(p->>'etapa',''),80),''))
  on conflict(organization_id,oportunidade_id,tipo) do nothing returning id into v_id;
  if v_id is not null then
   v_env:=v_env||jsonb_build_array(jsonb_build_object('id',v_id,'tipo',v_tipo,'evento',v_evt,'valor',case when v_tipo='compra' then v_valor end));
  end if;
 end loop;
 if jsonb_array_length(v_env)=0 then return jsonb_build_object('ok',true,'enviar','[]'::jsonb); end if;
 select s.decrypted_secret into v_tok from leadvox_private.integrations i join vault.decrypted_secrets s on s.id=i.secret_id
  where i.organization_id=c.organization_id and i.provider='meta';
 return jsonb_build_object('ok',true,'enviar',v_env,
  'lead',jsonb_build_object('hash',l.telefone_hash,'clid',l.ctwa_clid,'contato',l.contato_id),
  'meta',jsonb_build_object('modo',c.modo,'pixel',c.pixel_id,'waba',c.waba_id,'page',c.page_id,'teste',c.teste_codigo,'token',v_tok));
end;$$;
revoke all on function public.iag_rastreio_visto(text) from public,anon,authenticated;
revoke all on function public.iag_rastreio_lead(text,jsonb) from public,anon,authenticated;
revoke all on function public.iag_rastreio_resultado(text,bigint,text,text) from public,anon,authenticated;
revoke all on function public.iag_rastreio_oportunidade(text,jsonb) from public,anon,authenticated;
grant execute on function public.iag_rastreio_visto(text) to service_role;
grant execute on function public.iag_rastreio_lead(text,jsonb) to service_role;
grant execute on function public.iag_rastreio_resultado(text,bigint,text,text) to service_role;
grant execute on function public.iag_rastreio_oportunidade(text,jsonb) to service_role;

-- ═══ PARTE 4 · painel do cliente: ver, salvar e relatório ═══
create or replace function public.lv_rastreio(org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c leadvox_private.rastreio_config; v_role text;
begin
 select role into v_role from public.lv_memberships where organization_id=org and user_id=auth.uid();
 if v_role is null then raise exception 'forbidden'; end if;
 select * into c from leadvox_private.rastreio_config where organization_id=org;
 if not found or not c.liberado then return jsonb_build_object('liberado',false); end if;
 return jsonb_build_object('liberado',true,'ativo',c.ativo,'podeEditar',v_role in('owner','admin'),
  'token',case when v_role in('owner','admin') then c.token end,   -- o endereço do webhook só para quem configura
  'modo',c.modo,'pixelId',c.pixel_id,'wabaId',c.waba_id,'pageId',c.page_id,'etapasQualificado',to_jsonb(c.etapas_qualificado),
  'eventoQualificado',c.evento_qualificado,'enviarCompra',c.enviar_compra,'testeCodigo',c.teste_codigo,'ultimoEvento',c.ultimo_evento,
  'temToken',exists(select 1 from leadvox_private.integrations i where i.organization_id=org and i.provider='meta' and i.secret_id is not null));
end;$$;

create or replace function public.lv_rastreio_salvar(org uuid,conf jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_etapas bigint[];
begin
 if not exists(select 1 from public.lv_memberships where organization_id=org and user_id=auth.uid() and role in('owner','admin')) then raise exception 'forbidden'; end if;
 if not exists(select 1 from leadvox_private.rastreio_config where organization_id=org and liberado) then raise exception 'nao_liberado'; end if;
 if jsonb_typeof(conf)<>'object' or jsonb_typeof(coalesce(conf->'etapasQualificado','[]'::jsonb))<>'array' then raise exception 'invalid'; end if;
 select coalesce(array_agg(distinct x::bigint),'{}') into v_etapas from jsonb_array_elements_text(coalesce(conf->'etapasQualificado','[]'::jsonb)) x where x~'^[0-9]{1,15}$';
 update leadvox_private.rastreio_config set
  ativo=coalesce((conf->>'ativo')::boolean,false),
  modo=case when conf->>'modo'='whatsapp' then 'whatsapp' else 'pixel' end,
  pixel_id=nullif(conf->>'pixelId',''),waba_id=nullif(conf->>'wabaId',''),page_id=nullif(conf->>'pageId',''),
  etapas_qualificado=v_etapas,
  evento_qualificado=coalesce(nullif(conf->>'eventoQualificado',''),'QualifiedLead'),
  enviar_compra=coalesce((conf->>'enviarCompra')::boolean,true),
  teste_codigo=nullif(conf->>'testeCodigo',''),
  atualizado_em=now()
 where organization_id=org;
 return public.lv_rastreio(org);
end;$$;

-- Leads que chegaram de anúncio no período (dias de Brasília) e o que eles viraram: qualificados, vendas e valor.
create or replace function public.lv_rastreio_relatorio(org uuid,ini date,fim date) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.lv_memberships where organization_id=org and user_id=auth.uid()) then raise exception 'forbidden'; end if;
 if ini is null or fim is null or fim<ini or fim-ini>366 then raise exception 'invalid'; end if;
 return (with l as (select * from leadvox_private.rastreio_leads where organization_id=org and (criado_em at time zone 'America/Sao_Paulo')::date between ini and fim),
  e as (select e.* from leadvox_private.rastreio_envios e join l on l.id=e.lead_id),
  a as (select l.anuncio_id,max(l.titulo) titulo,count(*) leads,
    count(*) filter(where exists(select 1 from e where e.lead_id=l.id and e.tipo='qualificado')) qualificados,
    coalesce(sum((select count(*) from e where e.lead_id=l.id and e.tipo='compra')),0) vendas,
    coalesce(sum((select sum(e.valor) from e where e.lead_id=l.id and e.tipo='compra')),0) valor
   from l group by l.anuncio_id order by count(*) desc limit 200)
  select jsonb_build_object(
   'totais',jsonb_build_object('leads',(select count(*) from l),'qualificados',(select count(distinct lead_id) from e where tipo='qualificado'),
     'vendas',(select count(*) from e where tipo='compra'),'valor',(select coalesce(sum(valor),0) from e where tipo='compra')),
   'anuncios',coalesce((select jsonb_agg(jsonb_build_object('anuncio',anuncio_id,'titulo',titulo,'leads',leads,'qualificados',qualificados,'vendas',vendas,'valor',valor) order by leads desc,valor desc) from a),'[]'::jsonb),
   'envios',coalesce((select jsonb_agg(jsonb_build_object('tipo',x.tipo,'evento',x.evento,'valor',x.valor,'etapa',x.etapa,'status',x.status,'detalhe',x.detalhe,'em',x.criado_em,
      'nome',ld.nome,'final',ld.final,'titulo',ld.titulo) order by x.criado_em desc)
     from (select * from leadvox_private.rastreio_envios where organization_id=org order by criado_em desc limit 30) x join leadvox_private.rastreio_leads ld on ld.id=x.lead_id),'[]'::jsonb),
   'leads',coalesce((select jsonb_agg(jsonb_build_object('nome',nome,'final',final,'titulo',titulo,'em',criado_em) order by criado_em desc)
     from (select * from l order by criado_em desc limit 30) y),'[]'::jsonb)));
end;$$;
revoke all on function public.lv_rastreio(uuid) from public,anon;
revoke all on function public.lv_rastreio_salvar(uuid,jsonb) from public,anon;
revoke all on function public.lv_rastreio_relatorio(uuid,date,date) from public,anon;
grant execute on function public.lv_rastreio(uuid) to authenticated;
grant execute on function public.lv_rastreio_salvar(uuid,jsonb) to authenticated;
grant execute on function public.lv_rastreio_relatorio(uuid,date,date) to authenticated;

-- ═══ PARTE 5 · Super Admin: liberar ou tirar o módulo (fica no histórico) ═══
create or replace function public.lv_admin_rastreio(org uuid,liberar boolean default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 if not exists(select 1 from public.lv_organizations where id=org) then raise exception 'not_found'; end if;
 if liberar is not null then
  insert into leadvox_private.rastreio_config(organization_id,liberado,liberado_em) values(org,liberar,case when liberar then now() end)
  on conflict(organization_id) do update set liberado=excluded.liberado,
   liberado_em=case when excluded.liberado then coalesce(leadvox_private.rastreio_config.liberado_em,now()) else leadvox_private.rastreio_config.liberado_em end,
   ativo=case when excluded.liberado then leadvox_private.rastreio_config.ativo else false end,atualizado_em=now();
  insert into leadvox_private.saas_admin_log(organization_id,admin_id,acao,dados) values(org,auth.uid(),'rastreio',jsonb_build_object('liberar',liberar));
 end if;
 return (select jsonb_build_object('liberado',coalesce(c.liberado,false),'ativo',coalesce(c.ativo,false),'pixel',c.pixel_id is not null,'ultimoEvento',c.ultimo_evento,
   'leads30',(select count(*) from leadvox_private.rastreio_leads l where l.organization_id=org and l.criado_em>now()-interval '30 days'),
   'vendas30',(select count(*) from leadvox_private.rastreio_envios e where e.organization_id=org and e.tipo='compra' and e.criado_em>now()-interval '30 days'))
  from (select 1) u left join leadvox_private.rastreio_config c on c.organization_id=org);
end;$$;
revoke all on function public.lv_admin_rastreio(uuid,boolean) from public,anon;
grant execute on function public.lv_admin_rastreio(uuid,boolean) to authenticated;

insert into leadvox_private.sql_aplicado(arquivo) values('rastreio.sql') on conflict(arquivo) do nothing;
