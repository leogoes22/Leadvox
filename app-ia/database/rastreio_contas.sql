-- Rastreamento de anúncios · telefone completo, conta de anúncio e campanha de cada lead, filtro por conta e a lista
-- do Super Admin. Rodar depois de rastreio.sql, parte por parte (PARTE 1 a 4), na ordem.
-- O WhatsApp só traz o id e o título do anúncio: o painel busca na Meta a conta, a campanha e o conjunto com um token de
-- leitura de anúncios (provedor 'meta_ads', no Vault) e guarda em rastreio_anuncios. Sem esse token tenta o da API de Conversões.

-- ═══ PARTE 1 · telefone, cache dos anúncios e o token de leitura ═══
alter table leadvox_private.rastreio_leads add column if not exists telefone text check(telefone ~ '^[0-9]{10,15}$');
create table if not exists leadvox_private.rastreio_anuncios(
 organization_id uuid not null references public.lv_organizations(id) on delete cascade,
 anuncio_id text not null check(anuncio_id ~ '^[0-9]{1,30}$'),
 status text not null check(status in('ok','erro')),
 nome text check(char_length(nome)<=200),
 conta_id text check(conta_id ~ '^[0-9]{1,30}$'),
 conta_nome text check(char_length(conta_nome)<=200),
 campanha_id text check(campanha_id ~ '^[0-9]{1,30}$'),
 campanha text check(char_length(campanha)<=200),
 conjunto text check(char_length(conjunto)<=200),
 detalhe text check(char_length(detalhe)<=300),
 buscado_em timestamptz not null default now(),
 primary key(organization_id,anuncio_id)
);
alter table leadvox_private.rastreio_anuncios enable row level security;
revoke all on leadvox_private.rastreio_anuncios from public,anon,authenticated;

alter table leadvox_private.integrations drop constraint if exists integrations_provider_check;
alter table leadvox_private.integrations add constraint integrations_provider_check check(provider in('estoque','asaas','elevenlabs','meta','meta_ads'));
create or replace function public.lv_set_integration(org uuid,prov text,conf jsonb,sec text) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 if not exists(select 1 from public.lv_memberships where organization_id=org and user_id=auth.uid() and role in('owner','admin')) then raise exception 'forbidden'; end if;
 if prov not in('estoque','asaas','elevenlabs','meta','meta_ads') or jsonb_typeof(conf)<>'object' or octet_length(conf::text)>4000 or length(coalesce(sec,''))>4000 then raise exception 'invalid'; end if;
 select secret_id into sid from leadvox_private.integrations where organization_id=org and provider=prov;
 if coalesce(sec,'')<>'' then
  if sid is null then sid:=vault.create_secret(sec,'lv_'||prov||'_'||org::text,'Conexão '||prov);
  else perform vault.update_secret(sid,sec); end if;
 end if;
 insert into leadvox_private.integrations(organization_id,provider,settings,secret_id) values(org,prov,conf,sid)
 on conflict(organization_id,provider) do update set settings=excluded.settings,secret_id=excluded.secret_id,updated_at=now();
end;$$;

-- ═══ PARTE 2 · lead do anúncio agora guarda o telefone (o cliente já tem o número na LeadVox) ═══
create or replace function public.iag_rastreio_lead(p_token text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c leadvox_private.rastreio_config; v_contato bigint; v_novo boolean;
begin
 select * into c from leadvox_private.rastreio_config where token=p_token;
 if not found then return jsonb_build_object('ok',false); end if;
 update leadvox_private.rastreio_config set ultimo_evento=now() where organization_id=c.organization_id;
 if not (c.liberado and c.ativo) then return jsonb_build_object('ok',true,'desligado',true); end if;
 if jsonb_typeof(p)<>'object' or coalesce(p->>'contato','')!~'^[0-9]{1,15}$' then return jsonb_build_object('ok',true,'ignorado',true); end if;
 v_contato:=(p->>'contato')::bigint;
 insert into leadvox_private.rastreio_leads(organization_id,contato_id,telefone_hash,final,telefone,nome,anuncio_id,titulo,link,ctwa_clid,midia)
 values(c.organization_id,v_contato,
  case when coalesce(p->>'hash','')~'^[0-9a-f]{64}$' then p->>'hash' end,
  case when coalesce(p->>'final','')~'^[0-9]{1,4}$' then p->>'final' end,
  case when coalesce(p->>'telefone','')~'^[0-9]{10,15}$' then p->>'telefone' end,
  nullif(left(coalesce(p->>'nome',''),80),''),
  case when coalesce(p->>'anuncio','')~'^[0-9]{1,30}$' then p->>'anuncio' end,
  nullif(left(coalesce(p->>'titulo',''),120),''),
  case when coalesce(p->>'link','') like 'https://%' then left(p->>'link',300) end,
  nullif(left(coalesce(p->>'clid',''),500),''),
  nullif(left(coalesce(p->>'midia',''),20),''))
 on conflict(organization_id,contato_id) do update set ultima_em=now(),
  telefone=coalesce(leadvox_private.rastreio_leads.telefone,excluded.telefone)
 returning (xmax=0) into v_novo;
 return jsonb_build_object('ok',true,'novo',v_novo);
end;$$;
revoke all on function public.iag_rastreio_lead(text,jsonb) from public,anon,authenticated;
grant execute on function public.iag_rastreio_lead(text,jsonb) to service_role;

-- ═══ PARTE 3 · relatório com conta de anúncio, campanha, telefone e filtro por conta ('sem' = conta ainda não identificada) ═══
drop function if exists public.lv_rastreio_relatorio(uuid,date,date);
create or replace function public.lv_rastreio_relatorio(org uuid,ini date,fim date,conta text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.lv_memberships where organization_id=org and user_id=auth.uid()) then raise exception 'forbidden'; end if;
 if ini is null or fim is null or fim<ini or fim-ini>366 then raise exception 'invalid'; end if;
 if conta is not null and conta!~'^([0-9]{1,30}|sem)$' then raise exception 'invalid'; end if;
 return (with t as (select l.*,an.conta_id,an.conta_nome,an.campanha,an.conjunto,an.nome anuncio_nome
    from leadvox_private.rastreio_leads l left join leadvox_private.rastreio_anuncios an on an.organization_id=l.organization_id and an.anuncio_id=l.anuncio_id
    where l.organization_id=org and (l.criado_em at time zone 'America/Sao_Paulo')::date between ini and fim),
  l as (select * from t where conta is null or coalesce(t.conta_id,'sem')=conta),
  e as (select e.* from leadvox_private.rastreio_envios e join l on l.id=e.lead_id),
  r as (select l.id,exists(select 1 from e where e.lead_id=l.id and e.tipo='qualificado') q,
    (select count(*) from e where e.lead_id=l.id and e.tipo='compra') v,
    (select coalesce(sum(e.valor),0) from e where e.lead_id=l.id and e.tipo='compra') vl from l),
  a as (select l.anuncio_id,max(coalesce(l.anuncio_nome,l.titulo)) titulo,max(l.campanha) campanha,max(l.conjunto) conjunto,max(l.conta_id) conta_id,max(l.conta_nome) conta_nome,
    count(*) leads,count(*) filter(where r.q) qualificados,sum(r.v) vendas,sum(r.vl) valor
   from l join r on r.id=l.id group by l.anuncio_id order by count(*) desc limit 200)
  select jsonb_build_object(
   'totais',jsonb_build_object('leads',(select count(*) from l),'qualificados',(select count(*) from r where q),
     'vendas',(select coalesce(sum(v),0) from r),'valor',(select coalesce(sum(vl),0) from r)),
   'contas',coalesce((select jsonb_agg(jsonb_build_object('id',coalesce(x.c,'sem'),'nome',x.n,'leads',x.k) order by x.k desc)
     from (select t.conta_id c,max(t.conta_nome) n,count(*) k from t group by t.conta_id) x),'[]'::jsonb),
   'semConta',(select count(*) from t where t.anuncio_id is not null and t.conta_id is null),
   'anuncios',coalesce((select jsonb_agg(jsonb_build_object('anuncio',anuncio_id,'titulo',titulo,'campanha',campanha,'conjunto',conjunto,'contaId',conta_id,'conta',conta_nome,
     'leads',leads,'qualificados',qualificados,'vendas',vendas,'valor',valor) order by leads desc,valor desc) from a),'[]'::jsonb),
   'envios',coalesce((select jsonb_agg(jsonb_build_object('tipo',x.tipo,'evento',x.evento,'valor',x.valor,'etapa',x.etapa,'status',x.status,'detalhe',x.detalhe,'em',x.criado_em,
      'nome',x.nome,'final',x.final,'telefone',x.telefone,'titulo',x.titulo,'conta',x.conta_nome) order by x.criado_em desc)
     from (select ev.*,ld.nome,ld.final,ld.telefone,ld.titulo,an.conta_nome from leadvox_private.rastreio_envios ev
       join leadvox_private.rastreio_leads ld on ld.id=ev.lead_id
       left join leadvox_private.rastreio_anuncios an on an.organization_id=ld.organization_id and an.anuncio_id=ld.anuncio_id
       where ev.organization_id=org and (conta is null or coalesce(an.conta_id,'sem')=conta) order by ev.criado_em desc limit 30) x),'[]'::jsonb),
   'leads',coalesce((select jsonb_agg(jsonb_build_object('nome',y.nome,'final',y.final,'telefone',y.telefone,'titulo',coalesce(y.anuncio_nome,y.titulo),'campanha',y.campanha,
      'conta',y.conta_nome,'contaId',y.conta_id,'em',y.criado_em,'situacao',case when r.v>0 then 'venda' when r.q then 'qualificado' else 'lead' end,'valor',r.vl) order by y.criado_em desc)
     from (select * from l order by criado_em desc limit 50) y join r on r.id=y.id),'[]'::jsonb)));
end;$$;
revoke all on function public.lv_rastreio_relatorio(uuid,date,date,text) from public,anon;
grant execute on function public.lv_rastreio_relatorio(uuid,date,date,text) to authenticated;

-- ═══ PARTE 4 · cache dos anúncios (o painel busca na Meta), tela do cliente e lista do Super Admin ═══
-- Anúncios com lead e sem dados da Meta (ou com erro há mais de 1 dia, ou buscados há mais de 7 dias). Só dono ou admin.
create or replace function public.lv_rastreio_anuncios_pendentes(org uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from public.lv_memberships m where m.organization_id=org and m.user_id=(select auth.uid()) and m.role in('owner','admin'))
  then coalesce((select jsonb_agg(x.anuncio_id) from (select distinct l.anuncio_id from leadvox_private.rastreio_leads l
    left join leadvox_private.rastreio_anuncios a on a.organization_id=l.organization_id and a.anuncio_id=l.anuncio_id
    where l.organization_id=org and l.anuncio_id is not null
     and (a.anuncio_id is null or (a.status='erro' and a.buscado_em<now()-interval '1 day') or a.buscado_em<now()-interval '7 days') limit 30) x),'[]'::jsonb)
  else '[]'::jsonb end;
$$;
create or replace function public.lv_rastreio_anuncios_salvar(org uuid,itens jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if not exists(select 1 from public.lv_memberships where organization_id=org and user_id=auth.uid() and role in('owner','admin')) then raise exception 'forbidden'; end if;
 if jsonb_typeof(itens)<>'array' or jsonb_array_length(itens)>100 then raise exception 'invalid'; end if;
 insert into leadvox_private.rastreio_anuncios(organization_id,anuncio_id,status,nome,conta_id,conta_nome,campanha_id,campanha,conjunto,detalhe)
 select distinct on (x->>'anuncio') org,x->>'anuncio',case when x->>'status'='ok' then 'ok' else 'erro' end,
  nullif(left(coalesce(x->>'nome',''),200),''),
  case when coalesce(x->>'contaId','')~'^[0-9]{1,30}$' then x->>'contaId' end,
  nullif(left(coalesce(x->>'contaNome',''),200),''),
  case when coalesce(x->>'campanhaId','')~'^[0-9]{1,30}$' then x->>'campanhaId' end,
  nullif(left(coalesce(x->>'campanha',''),200),''),
  nullif(left(coalesce(x->>'conjunto',''),200),''),
  nullif(left(coalesce(x->>'detalhe',''),300),'')
 from jsonb_array_elements(itens) x
 where coalesce(x->>'anuncio','')~'^[0-9]{1,30}$'
  and exists(select 1 from leadvox_private.rastreio_leads l where l.organization_id=org and l.anuncio_id=x->>'anuncio')
 on conflict(organization_id,anuncio_id) do update set status=excluded.status,nome=excluded.nome,conta_id=excluded.conta_id,conta_nome=excluded.conta_nome,
  campanha_id=excluded.campanha_id,campanha=excluded.campanha,conjunto=excluded.conjunto,detalhe=excluded.detalhe,buscado_em=now();
 get diagnostics n=row_count;
 return n;
end;$$;
-- Token de leitura novo: esquece os erros para buscar de novo na próxima abertura do relatório.
create or replace function public.lv_rastreio_anuncios_reset(org uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.lv_memberships where organization_id=org and user_id=auth.uid() and role in('owner','admin')) then raise exception 'forbidden'; end if;
 delete from leadvox_private.rastreio_anuncios where organization_id=org and status='erro';
end;$$;

create or replace function public.lv_rastreio(org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c leadvox_private.rastreio_config; v_role text;
begin
 select role into v_role from public.lv_memberships where organization_id=org and user_id=auth.uid();
 if v_role is null then raise exception 'forbidden'; end if;
 select * into c from leadvox_private.rastreio_config where organization_id=org;
 if not found or not c.liberado then return jsonb_build_object('liberado',false); end if;
 return jsonb_build_object('liberado',true,'ativo',c.ativo,'podeEditar',v_role in('owner','admin'),
  'token',case when v_role in('owner','admin') then c.token end,
  'modo',c.modo,'pixelId',c.pixel_id,'wabaId',c.waba_id,'pageId',c.page_id,'etapasQualificado',to_jsonb(c.etapas_qualificado),
  'eventoQualificado',c.evento_qualificado,'enviarCompra',c.enviar_compra,'testeCodigo',c.teste_codigo,'ultimoEvento',c.ultimo_evento,
  'temToken',exists(select 1 from leadvox_private.integrations i where i.organization_id=org and i.provider='meta' and i.secret_id is not null),
  'temTokenAnuncios',exists(select 1 from leadvox_private.integrations i where i.organization_id=org and i.provider='meta_ads' and i.secret_id is not null));
end;$$;

-- Super Admin: todas as empresas com o módulo, contas de anúncio vistas em 30 dias, leads, vendas e valor.
create or replace function public.lv_admin_rastreio_lista() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'nome',o.name,'ativo',c.ativo,'pixel',c.pixel_id is not null,'liberadoEm',c.liberado_em,'ultimoEvento',c.ultimo_evento,
   'contas',(select count(distinct a.conta_id) from leadvox_private.rastreio_leads l join leadvox_private.rastreio_anuncios a on a.organization_id=l.organization_id and a.anuncio_id=l.anuncio_id
     where l.organization_id=o.id and l.criado_em>now()-interval '30 days' and a.conta_id is not null),
   'leads30',(select count(*) from leadvox_private.rastreio_leads l where l.organization_id=o.id and l.criado_em>now()-interval '30 days'),
   'vendas30',(select count(*) from leadvox_private.rastreio_envios e where e.organization_id=o.id and e.tipo='compra' and e.criado_em>now()-interval '30 days'),
   'valor30',(select coalesce(sum(e.valor),0) from leadvox_private.rastreio_envios e where e.organization_id=o.id and e.tipo='compra' and e.criado_em>now()-interval '30 days'),
   'erros7',(select count(*) from leadvox_private.rastreio_envios e where e.organization_id=o.id and e.status='erro' and e.criado_em>now()-interval '7 days')) order by o.name)
  from leadvox_private.rastreio_config c join public.lv_organizations o on o.id=c.organization_id where c.liberado),'[]'::jsonb);
end;$$;
revoke all on function public.lv_rastreio_anuncios_pendentes(uuid) from public,anon;
revoke all on function public.lv_rastreio_anuncios_salvar(uuid,jsonb) from public,anon;
revoke all on function public.lv_rastreio_anuncios_reset(uuid) from public,anon;
revoke all on function public.lv_rastreio(uuid) from public,anon;
revoke all on function public.lv_admin_rastreio_lista() from public,anon;
grant execute on function public.lv_rastreio_anuncios_pendentes(uuid) to authenticated;
grant execute on function public.lv_rastreio_anuncios_salvar(uuid,jsonb) to authenticated;
grant execute on function public.lv_rastreio_anuncios_reset(uuid) to authenticated;
grant execute on function public.lv_rastreio(uuid) to authenticated;
grant execute on function public.lv_admin_rastreio_lista() to authenticated;

insert into leadvox_private.sql_aplicado(arquivo) values('rastreio_contas.sql') on conflict(arquivo) do nothing;
