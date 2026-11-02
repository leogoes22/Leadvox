-- Assinatura das empresas (a LeadVox cobrando as lojas pelo Asaas), avisos e resgate, Super Admin e acesso de suporte.
-- Nada aqui mexe na área "Cobranças" do painel, que é a loja cobrando os clientes dela (billing.sql).
-- A chave do Asaas da LeadVox fica no Vault e só a função "cobranca" (service_role) lê. Rodar depois de openai.sql.
begin;

create table if not exists leadvox_private.saas_planos(
 chave text primary key check(chave ~ '^[a-z0-9-]{2,30}$'),
 nome text not null, descricao text not null default '',
 valor_cents integer not null check(valor_cents between 100 and 10000000),
 ativo boolean not null default true, ordem integer not null default 0
);
-- Mesmos preços do site (precos-leadvox.js): IA SDR Pro e, com o CRM, o CRM sai com 50% de desconto.
insert into leadvox_private.saas_planos(chave,nome,descricao,valor_cents,ordem) values
 ('ia','IA SDR LeadVox Pro','Pré-atendimento e distribuição de leads 24h',65997,1),
 ('crm-ia','CRM LeadVox + IA SDR Pro','Ferramenta LeadVox (CRM) com 50% de desconto e a IA SDR Pro',85847,2)
on conflict(chave) do update set nome=excluded.nome,descricao=excluded.descricao,valor_cents=excluded.valor_cents,ordem=excluded.ordem;

create table if not exists leadvox_private.saas_assinaturas(
 organization_id uuid primary key references public.lv_organizations(id) on delete cascade,
 plano text references leadvox_private.saas_planos(chave),
 forma text check(forma in('CREDIT_CARD','PIX','BOLETO')),
 status text not null default 'teste' check(status in('teste','expirado','aguardando','ativa','atrasada','suspensa','cancelada','cortesia')),
 asaas_cliente text, asaas_assinatura text, link_pagamento text,
 documento text check(documento ~ '^([0-9]{11}|[0-9]{14})$'),
 email_cobranca text, telefone_cobranca text,
 checkout_em timestamptz, ativa_desde timestamptz, proximo_vencimento date, atrasada_desde date,
 suspensa_em timestamptz, cortesia_ate date,
 bloqueou_ia boolean not null default false, -- a cobrança pausou a IA (só ela tira; bloqueio manual do admin fica)
 obs text not null default '' check(char_length(obs)<=1000),
 atualizado_em timestamptz not null default now()
);
create table if not exists leadvox_private.saas_faturas(
 asaas_id text primary key, organization_id uuid not null references public.lv_organizations(id) on delete cascade,
 valor_cents integer, vencimento date, status text, forma text, link text, pago_em timestamptz,
 atualizado_em timestamptz not null default now()
);
create index if not exists saas_faturas_org on leadvox_private.saas_faturas(organization_id,vencimento desc);
create table if not exists leadvox_private.saas_eventos_asaas(id text primary key, evento text, recebido_em timestamptz not null default now());
create table if not exists leadvox_private.saas_avisos(
 id bigint generated always as identity primary key,
 organization_id uuid not null references public.lv_organizations(id) on delete cascade,
 tipo text not null, chave text not null unique,
 status text not null default 'pendente' check(status in('pendente','enviando','enviado','falhou','sem_contato')),
 tentativas integer not null default 0, erro text,
 criado_em timestamptz not null default now(), enviado_em timestamptz
);
create index if not exists saas_avisos_org on leadvox_private.saas_avisos(organization_id,criado_em desc);
create table if not exists leadvox_private.saas_admin_log(
 id bigint generated always as identity primary key, organization_id uuid, admin_id uuid, acao text not null, dados jsonb,
 criado_em timestamptz not null default now()
);
create table if not exists leadvox_private.suporte_acessos(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.lv_organizations(id) on delete cascade,
 admin_id uuid not null, criou_membro boolean not null, motivo text not null default '',
 inicio timestamptz not null default now(), fim timestamptz not null, encerrado_em timestamptz
);
do $$ declare t text; begin
 foreach t in array array['saas_planos','saas_assinaturas','saas_faturas','saas_eventos_asaas','saas_avisos','saas_admin_log','suporte_acessos'] loop
  execute format('alter table leadvox_private.%I enable row level security',t);
  execute format('revoke all on leadvox_private.%I from public,anon,authenticated',t);
 end loop;
end $$;

-- Situação de cobrança de uma empresa, igual para o painel do cliente e para o Super Admin.
create or replace function leadvox_private.saas_situacao(org uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'status', case when a.status is null or a.status='teste' then case when o.trial_ends_at>now() then 'teste' else 'expirado' end
             when a.status='cortesia' and a.cortesia_ate is not null and a.cortesia_ate<(now() at time zone 'America/Sao_Paulo')::date then 'expirado'
             else a.status end,
  'testeAte', o.trial_ends_at,
  'diasTeste', greatest(0,(o.trial_ends_at at time zone 'America/Sao_Paulo')::date-(now() at time zone 'America/Sao_Paulo')::date),
  'plano', a.plano, 'planoNome', p.nome, 'valorCents', p.valor_cents, 'forma', a.forma,
  'link', a.link_pagamento, 'proximoVencimento', a.proximo_vencimento, 'atrasadaDesde', a.atrasada_desde,
  'suspensaEm', a.suspensa_em, 'cortesiaAte', a.cortesia_ate, 'ativaDesde', a.ativa_desde,
  'documentoFinal', right(a.documento,4), 'emailCobranca', a.email_cobranca, 'telefoneCobranca', a.telefone_cobranca)
 from public.lv_organizations o
 left join leadvox_private.saas_assinaturas a on a.organization_id=o.id
 left join leadvox_private.saas_planos p on p.chave=a.plano
 where o.id=org;
$$;

-- Painel do cliente: o aviso do topo, a tela Assinar e as faturas.
create or replace function public.lv_assinatura(org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.lv_memberships where organization_id=org and user_id=auth.uid()) then raise exception 'forbidden'; end if;
 return leadvox_private.saas_situacao(org)
  || jsonb_build_object('planos',(select jsonb_agg(jsonb_build_object('chave',chave,'nome',nome,'descricao',descricao,'valorCents',valor_cents) order by ordem)
       from leadvox_private.saas_planos where ativo),
     'faturas',coalesce((select jsonb_agg(jsonb_build_object('vencimento',vencimento,'valorCents',valor_cents,'status',status,'link',link,'pagoEm',pago_em) order by vencimento desc)
       from (select * from leadvox_private.saas_faturas where organization_id=org order by vencimento desc limit 12) f),'[]'::jsonb),
     'podeAssinar',exists(select 1 from public.lv_memberships where organization_id=org and user_id=auth.uid() and role in('owner','admin')));
end;$$;

-- Função "cobranca" (service_role): dados para abrir a assinatura no Asaas. Quem pede tem de ser dono ou admin da empresa.
create or replace function public.iag_saas_checkout_dados(p_org uuid,p_user uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select case when not exists(select 1 from public.lv_memberships where organization_id=p_org and user_id=p_user and role in('owner','admin'))
  then jsonb_build_object('ok',false,'erro','sem_permissao')
  else jsonb_build_object('ok',true,'nome',coalesce(nullif(w.settings->>'displayName',''),o.name),'email',u.email,
   'whatsapp',coalesce(w.settings->>'whatsapp',''),'testeAte',o.trial_ends_at,'cliente',a.asaas_cliente,'assinatura',a.asaas_assinatura,
   'status',leadvox_private.saas_situacao(p_org)->>'status','plano',a.plano,'forma',a.forma,'link',a.link_pagamento,
   'planos',(select jsonb_object_agg(chave,jsonb_build_object('nome',nome,'valorCents',valor_cents)) from leadvox_private.saas_planos where ativo)) end
 from public.lv_organizations o
 left join public.lv_workspace w on w.organization_id=o.id
 left join auth.users u on u.id=o.owner_id
 left join leadvox_private.saas_assinaturas a on a.organization_id=o.id
 where o.id=p_org;
$$;

create or replace function public.iag_saas_checkout_gravar(p_org uuid,p jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(p->>'documento','')!~'^([0-9]{11}|[0-9]{14})$' or not exists(select 1 from leadvox_private.saas_planos where chave=p->>'plano' and ativo)
  or coalesce(p->>'forma','') not in('CREDIT_CARD','PIX','BOLETO') then raise exception 'invalid'; end if;
 insert into leadvox_private.saas_assinaturas(organization_id,plano,forma,status,asaas_cliente,asaas_assinatura,link_pagamento,documento,email_cobranca,telefone_cobranca,checkout_em,proximo_vencimento,atualizado_em)
 values(p_org,p->>'plano',p->>'forma','aguardando',p->>'cliente',p->>'assinatura',p->>'link',p->>'documento',left(p->>'email',254),left(p->>'telefone',20),now(),(p->>'vencimento')::date,now())
 on conflict(organization_id) do update set plano=excluded.plano,forma=excluded.forma,
  status=case when leadvox_private.saas_assinaturas.status in('ativa','atrasada','suspensa') then leadvox_private.saas_assinaturas.status else 'aguardando' end,
  asaas_cliente=excluded.asaas_cliente,asaas_assinatura=excluded.asaas_assinatura,link_pagamento=excluded.link_pagamento,documento=excluded.documento,
  email_cobranca=excluded.email_cobranca,telefone_cobranca=excluded.telefone_cobranca,checkout_em=now(),proximo_vencimento=excluded.proximo_vencimento,atualizado_em=now();
end;$$;

-- Pausa ou volta a IA por causa da cobrança, sem desfazer um bloqueio manual.
create or replace function leadvox_private.saas_bloquear(org uuid,bloquear boolean) returns void language plpgsql security definer set search_path='' as $$
declare v_conta text;
begin
 select conta into v_conta from leadvox_private.motor_contas where organization_id=org;
 if bloquear then
  update leadvox_private.saas_assinaturas set bloqueou_ia=true where organization_id=org and not bloqueou_ia;
  if found and v_conta is not null then update public.iag_conta set bloqueado=true where chave=v_conta; end if;
 else
  update leadvox_private.saas_assinaturas set bloqueou_ia=false where organization_id=org and bloqueou_ia;
  if found and v_conta is not null then update public.iag_conta set bloqueado=false where chave=v_conta; end if;
 end if;
end;$$;

create or replace function leadvox_private.saas_aviso(org uuid,tipo text,chave text) returns void language sql security definer set search_path='' as $$
 insert into leadvox_private.saas_avisos(organization_id,tipo,chave) values(org,tipo,chave) on conflict(chave) do nothing;
$$;

-- Retorno do Asaas (service_role, pela função "cobranca"): idempotente pelo id do evento.
create or replace function public.iag_saas_evento(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare pg jsonb:=p->'payment'; org uuid; ev text:=p->>'event'; st text; venc date;
begin
 if coalesce(p->>'id','')='' or ev is null then return jsonb_build_object('ok',false,'erro','invalido'); end if;
 insert into leadvox_private.saas_eventos_asaas(id,evento) values(p->>'id',ev) on conflict do nothing;
 if not found then return jsonb_build_object('ok',true,'repetido',true); end if;
 if pg is null then
  if ev='SUBSCRIPTION_DELETED' then
   update leadvox_private.saas_assinaturas set status='cancelada',atualizado_em=now() where asaas_assinatura=p->'subscription'->>'id' and status<>'cortesia';
  end if;
  return jsonb_build_object('ok',true);
 end if;
 begin org:=(pg->>'externalReference')::uuid; exception when others then org:=null; end;
 if org is null then select organization_id into org from leadvox_private.saas_assinaturas where asaas_assinatura=pg->>'subscription' or asaas_cliente=pg->>'customer' limit 1; end if;
 if org is null then return jsonb_build_object('ok',true,'semEmpresa',true); end if;
 venc:=nullif(pg->>'dueDate','')::date;
 st:=case when ev in('PAYMENT_CONFIRMED','PAYMENT_RECEIVED') then 'pago' when ev='PAYMENT_OVERDUE' then 'vencida'
          when ev in('PAYMENT_REFUNDED','PAYMENT_CHARGEBACK_REQUESTED','PAYMENT_CHARGEBACK_DISPUTE') then 'estornada'
          when ev='PAYMENT_DELETED' then 'cancelada' else 'pendente' end;
 insert into leadvox_private.saas_faturas(asaas_id,organization_id,valor_cents,vencimento,status,forma,link,pago_em)
 values(pg->>'id',org,round(coalesce((pg->>'value')::numeric,0)*100),venc,st,pg->>'billingType',pg->>'invoiceUrl',case when st='pago' then now() end)
 on conflict(asaas_id) do update set valor_cents=excluded.valor_cents,vencimento=excluded.vencimento,forma=excluded.forma,link=coalesce(excluded.link,leadvox_private.saas_faturas.link),
  status=case when leadvox_private.saas_faturas.status='pago' and excluded.status in('pendente','vencida') then 'pago' else excluded.status end,
  pago_em=coalesce(leadvox_private.saas_faturas.pago_em,excluded.pago_em),atualizado_em=now();
 if st='pago' then
  update leadvox_private.saas_assinaturas set status='ativa',ativa_desde=coalesce(ativa_desde,now()),atrasada_desde=null,suspensa_em=null,atualizado_em=now() where organization_id=org;
  perform leadvox_private.saas_bloquear(org,false);
  perform leadvox_private.saas_aviso(org,'pago','pago:'||(pg->>'id'));
 elsif st='vencida' then
  update leadvox_private.saas_assinaturas set status=case when status='suspensa' then status else 'atrasada' end,atrasada_desde=coalesce(atrasada_desde,venc),atualizado_em=now()
   where organization_id=org and status in('ativa','aguardando','atrasada','suspensa');
 elsif ev='PAYMENT_CREATED' then
  update leadvox_private.saas_assinaturas set proximo_vencimento=venc,link_pagamento=coalesce(pg->>'invoiceUrl',link_pagamento),atualizado_em=now() where organization_id=org;
  -- a primeira fatura nasce no checkout (a pessoa já está com o link na mão); avisa a partir da segunda
  if exists(select 1 from leadvox_private.saas_assinaturas where organization_id=org and status in('ativa','atrasada','suspensa')) then
   perform leadvox_private.saas_aviso(org,'fatura','fatura:'||(pg->>'id'));
  end if;
 end if;
 return jsonb_build_object('ok',true);
end;$$;

-- n8n novo, a cada 30 min (service_role): aplica prazos (fim do teste, atraso), fecha suportes vencidos,
-- cria os avisos do momento e devolve os pendentes já com texto, telefone e link.
create or replace function public.iag_saas_avisos_pendentes() returns jsonb language plpgsql security definer set search_path='' as $$
declare r record; hoje date:=(now() at time zone 'America/Sao_Paulo')::date; hora int:=extract(hour from now() at time zone 'America/Sao_Paulo');
 painel constant text:='https://ia.leadvox.com.br/#assinar'; out jsonb;
begin
 -- acessos de suporte vencidos
 for r in select * from leadvox_private.suporte_acessos where encerrado_em is null and fim<now() loop
  if r.criou_membro then delete from public.lv_memberships where organization_id=r.organization_id and user_id=r.admin_id and role='admin'; end if;
  update leadvox_private.suporte_acessos set encerrado_em=now() where id=r.id;
 end loop;
 -- teste acabou há 2 dias sem assinatura: pausa a IA
 for r in select o.id from public.lv_organizations o left join leadvox_private.saas_assinaturas a on a.organization_id=o.id
   where o.trial_ends_at<now()-interval '2 days' and coalesce(a.status,'teste') in('teste','expirado') loop
  insert into leadvox_private.saas_assinaturas(organization_id,status) values(r.id,'expirado') on conflict(organization_id) do update set status='expirado',atualizado_em=now();
  perform leadvox_private.saas_bloquear(r.id,true);
  perform leadvox_private.saas_aviso(r.id,'teste-pausada','teste-pausada:'||r.id);
 end loop;
 -- cortesia vencida volta a ser cobrada como teste acabado
 update leadvox_private.saas_assinaturas set status='expirado',atualizado_em=now() where status='cortesia' and cortesia_ate is not null and cortesia_ate<hoje;
 -- atrasada há 5 dias: suspende a IA
 for r in select organization_id from leadvox_private.saas_assinaturas where status='atrasada' and atrasada_desde<=hoje-5 loop
  update leadvox_private.saas_assinaturas set status='suspensa',suspensa_em=now(),atualizado_em=now() where organization_id=r.organization_id;
  perform leadvox_private.saas_bloquear(r.organization_id,true);
  perform leadvox_private.saas_aviso(r.organization_id,'suspensa','suspensa:'||r.organization_id||':'||hoje);
 end loop;
 -- avisos com hora marcada: só das 8h às 20h (Brasília)
 if hora between 8 and 19 then
  for r in select o.id,(o.trial_ends_at at time zone 'America/Sao_Paulo')::date fim from public.lv_organizations o
    left join leadvox_private.saas_assinaturas a on a.organization_id=o.id where coalesce(a.status,'teste') in('teste','expirado') loop
   if r.fim-hoje in(3,1,0) then perform leadvox_private.saas_aviso(r.id,'teste-'||(r.fim-hoje),'teste-'||(r.fim-hoje)||':'||r.id||':'||r.fim); end if;
   if hoje-r.fim=1 then perform leadvox_private.saas_aviso(r.id,'teste-acabou','teste-acabou:'||r.id||':'||r.fim); end if;
  end loop;
  -- resgate: clicou em Assinar e não pagou (1 h, 1 dia, 3 dias)
  for r in select organization_id,checkout_em from leadvox_private.saas_assinaturas where status='aguardando' and checkout_em is not null loop
   if now()-r.checkout_em>=interval '1 hour' then perform leadvox_private.saas_aviso(r.organization_id,'carrinho-1h','carrinho-1h:'||r.organization_id||':'||extract(epoch from r.checkout_em)::bigint); end if;
   if now()-r.checkout_em>=interval '1 day' then perform leadvox_private.saas_aviso(r.organization_id,'carrinho-1d','carrinho-1d:'||r.organization_id||':'||extract(epoch from r.checkout_em)::bigint); end if;
   if now()-r.checkout_em>=interval '3 days' then perform leadvox_private.saas_aviso(r.organization_id,'carrinho-3d','carrinho-3d:'||r.organization_id||':'||extract(epoch from r.checkout_em)::bigint); end if;
  end loop;
  -- fatura de Pix ou boleto vence amanhã; atraso de 1 e 3 dias
  for r in select f.organization_id,f.asaas_id,f.vencimento,f.status from leadvox_private.saas_faturas f
    join leadvox_private.saas_assinaturas a on a.organization_id=f.organization_id
    where f.status in('pendente','vencida') and coalesce(f.forma,'')<>'CREDIT_CARD' or (f.status='vencida') loop
   if r.status='pendente' and r.vencimento=hoje+1 then perform leadvox_private.saas_aviso(r.organization_id,'vence-amanha','vence-amanha:'||r.asaas_id); end if;
   if r.status='vencida' and hoje-r.vencimento in(1,3) then perform leadvox_private.saas_aviso(r.organization_id,'atraso-'||(hoje-r.vencimento),'atraso-'||(hoje-r.vencimento)||':'||r.asaas_id); end if;
  end loop;
 end if;
 -- entrega: pega os pendentes (e os que falharam menos de 3 vezes) e marca como "enviando"
 with fila as (
  update leadvox_private.saas_avisos v set status='enviando',tentativas=tentativas+1
  where v.id in(select id from leadvox_private.saas_avisos where status='pendente' or (status='falhou' and tentativas<3) order by id limit 50)
  returning v.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'tipo',f.tipo,'org',f.organization_id,
   'nome',coalesce(nullif(w.settings->>'displayName',''),o.name),
   'telefone',regexp_replace(coalesce(nullif(a.telefone_cobranca,''),w.settings->>'whatsapp',''),'[^0-9]','','g'),
   'email',coalesce(nullif(a.email_cobranca,''),u.email),
   'link',case when f.tipo in('fatura','vence-amanha','atraso-1','atraso-3','carrinho-1h','carrinho-1d','carrinho-3d','suspensa')
     then coalesce((select link from leadvox_private.saas_faturas x where x.organization_id=f.organization_id and x.status in('pendente','vencida') order by vencimento limit 1),a.link_pagamento,painel) else painel end,
   'diasTeste',greatest(0,(o.trial_ends_at at time zone 'America/Sao_Paulo')::date-hoje),
   'valorCents',coalesce(p.valor_cents,0),
   'vencimento',to_char(coalesce((select vencimento from leadvox_private.saas_faturas x where x.organization_id=f.organization_id and x.status in('pendente','vencida') order by vencimento limit 1),a.proximo_vencimento),'DD/MM'))),'[]'::jsonb)
 into out
 from fila f join public.lv_organizations o on o.id=f.organization_id
 left join public.lv_workspace w on w.organization_id=o.id
 left join auth.users u on u.id=o.owner_id
 left join leadvox_private.saas_assinaturas a on a.organization_id=o.id
 left join leadvox_private.saas_planos p on p.chave=a.plano;
 return out;
end;$$;

create or replace function public.iag_saas_aviso_resultado(p_id bigint,p_status text,p_erro text) returns void language sql security definer set search_path='' as $$
 update leadvox_private.saas_avisos set status=case when p_status in('enviado','falhou','sem_contato') then p_status else 'falhou' end,
  erro=left(p_erro,300),enviado_em=case when p_status='enviado' then now() end where id=p_id;
$$;

-- Super Admin (dono da plataforma): todas as empresas com cobrança, uso e alertas.
create or replace function public.lv_admin_empresas() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare hoje date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 return coalesce((select jsonb_agg(x order by x->>'criado' desc) from (
  select jsonb_build_object('id',o.id,'nome',coalesce(nullif(w.settings->>'displayName',''),o.name),'nicho',w.settings->>'niche',
   'criado',o.created_at,'email',u.email,'whatsapp',w.settings->>'whatsapp','montado',coalesce((w.settings->>'onboarded')::boolean,false),
   'cobranca',leadvox_private.saas_situacao(o.id),'obs',coalesce(a.obs,''),
   'conta',m.conta,'bloqueado',coalesce(c.bloqueado,false),'bloqueioCobranca',coalesce(a.bloqueou_ia,false),
   'ultimoEvento',m.ultimo_evento,'ultimoEnvio',m.ultimo_envio,
   'agentes',(select count(*) from public.iag_agente g where g.conta=m.conta and not g.arquivado),
   'agentesAtivos',(select count(*) from public.iag_agente g where g.conta=m.conta and not g.arquivado and g.ativo),
   'uso7',(select jsonb_build_object('conversas',coalesce(sum((r.metricas->>'conversas')::int),0),'transferidos',coalesce(sum((r.metricas->>'transferidos')::int),0),
      'respostas',coalesce(sum((r.uso->>'respostas')::int),0)) from public.iag_relatorio r where r.conta=m.conta and r.dia>hoje-7),
   'usd30',(select round(coalesce(sum(estimated_usd),0),4) from leadvox_private.openai_usage g where g.organization_id=o.id and g.created_at>now()-interval '30 days'),
   'suporte',(select jsonb_build_object('fim',s.fim,'motivo',s.motivo) from leadvox_private.suporte_acessos s where s.organization_id=o.id and s.encerrado_em is null and s.fim>now() order by s.inicio desc limit 1),
   'avisos',(select coalesce(jsonb_agg(jsonb_build_object('tipo',v.tipo,'status',v.status,'em',v.criado_em) order by v.id desc),'[]'::jsonb)
      from (select * from leadvox_private.saas_avisos v where v.organization_id=o.id order by v.id desc limit 8) v)
  ) x
  from public.lv_organizations o
  left join public.lv_workspace w on w.organization_id=o.id
  left join auth.users u on u.id=o.owner_id
  left join leadvox_private.saas_assinaturas a on a.organization_id=o.id
  left join leadvox_private.motor_contas m on m.organization_id=o.id
  left join public.iag_conta c on c.chave=m.conta) e),'[]'::jsonb);
end;$$;

-- Consumo por empresa e por dia: respostas da IA (relatório do motor) e custo medido pelo proxy OpenAI.
create or replace function public.lv_admin_consumo(ini date,fim date) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 if ini is null or fim is null or fim<ini or fim-ini>366 then raise exception 'period'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('org',d.org,'dia',d.dia,'respostas',d.respostas,'conversas',d.conversas,'usd',d.usd) order by d.dia)
  from (select coalesce(r.org,u.org) org,coalesce(r.dia,u.dia) dia,coalesce(r.respostas,0) respostas,coalesce(r.conversas,0) conversas,u.usd
   from (select m.organization_id org,x.dia,sum((x.uso->>'respostas')::int) respostas,sum((x.metricas->>'conversas')::int) conversas
         from public.iag_relatorio x join leadvox_private.motor_contas m on m.conta=x.conta where x.dia between ini and fim group by 1,2) r
   full join (select organization_id org,(created_at at time zone 'America/Sao_Paulo')::date dia,sum(estimated_usd) usd
         from leadvox_private.openai_usage where created_at>=ini::timestamp at time zone 'America/Sao_Paulo' and created_at<(fim+1)::timestamp at time zone 'America/Sao_Paulo' group by 1,2) u
   on u.org=r.org and u.dia=r.dia) d),'[]'::jsonb);
end;$$;

-- Ações do Super Admin, com registro de quem fez o quê.
create or replace function public.lv_admin_acao(org uuid,acao text,dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare n int; d date;
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 if not exists(select 1 from public.lv_organizations where id=org) then raise exception 'not_found'; end if;
 insert into leadvox_private.saas_assinaturas(organization_id) values(org) on conflict do nothing;
 if acao='estender' then
  n:=(dados->>'dias')::int; if n is null or n<1 or n>60 then raise exception 'invalid'; end if;
  update public.lv_organizations set trial_ends_at=greatest(trial_ends_at,now())+make_interval(days=>n) where id=org;
  update leadvox_private.saas_assinaturas set status='teste',atualizado_em=now() where organization_id=org and status='expirado';
  perform leadvox_private.saas_bloquear(org,false);
 elsif acao='plano' then
  if not exists(select 1 from leadvox_private.saas_planos where chave=dados->>'plano') then raise exception 'invalid'; end if;
  update leadvox_private.saas_assinaturas set plano=dados->>'plano',atualizado_em=now() where organization_id=org;
 elsif acao='cortesia' then
  d:=nullif(dados->>'ate','')::date; if d is not null and d<(now() at time zone 'America/Sao_Paulo')::date then raise exception 'invalid'; end if;
  update leadvox_private.saas_assinaturas set status='cortesia',cortesia_ate=d,atrasada_desde=null,suspensa_em=null,atualizado_em=now() where organization_id=org;
  perform leadvox_private.saas_bloquear(org,false);
 elsif acao='suspender' then
  update leadvox_private.saas_assinaturas set status='suspensa',suspensa_em=now(),atualizado_em=now() where organization_id=org;
  perform leadvox_private.saas_bloquear(org,true);
 elsif acao='reativar' then
  update leadvox_private.saas_assinaturas set status=case when asaas_assinatura is not null then 'ativa' when (select trial_ends_at from public.lv_organizations where id=org)>now() then 'teste' else 'expirado' end,
   suspensa_em=null,atrasada_desde=null,atualizado_em=now() where organization_id=org;
  perform leadvox_private.saas_bloquear(org,false);
 elsif acao='obs' then
  update leadvox_private.saas_assinaturas set obs=left(coalesce(dados->>'texto',''),1000),atualizado_em=now() where organization_id=org;
 elsif acao='lembrete' then
  perform leadvox_private.saas_aviso(org,'lembrete','lembrete:'||org||':'||extract(epoch from now())::bigint);
 else raise exception 'invalid'; end if;
 insert into leadvox_private.saas_admin_log(organization_id,admin_id,acao,dados) values(org,auth.uid(),acao,dados);
 return leadvox_private.saas_situacao(org);
end;$$;

-- Acesso de suporte: o admin entra como admin da empresa por algumas horas (registrado). Sai sozinho no fim.
create or replace function public.lv_admin_suporte(org uuid,horas int,motivo text) returns jsonb language plpgsql security definer set search_path='' as $$
declare ja boolean;
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 if horas is null or horas<1 or horas>24 then raise exception 'invalid'; end if;
 select exists(select 1 from public.lv_memberships where organization_id=org and user_id=auth.uid()) into ja;
 if not ja then insert into public.lv_memberships(organization_id,user_id,role) values(org,auth.uid(),'admin'); end if;
 update leadvox_private.suporte_acessos set encerrado_em=now() where organization_id=org and admin_id=auth.uid() and encerrado_em is null;
 insert into leadvox_private.suporte_acessos(organization_id,admin_id,criou_membro,motivo,fim)
 values(org,auth.uid(),not ja,left(coalesce(motivo,''),200),now()+make_interval(hours=>horas));
 insert into leadvox_private.saas_admin_log(organization_id,admin_id,acao,dados) values(org,auth.uid(),'suporte',jsonb_build_object('horas',horas,'motivo',motivo));
 return jsonb_build_object('ok',true,'fim',now()+make_interval(hours=>horas));
end;$$;

create or replace function public.lv_admin_suporte_encerrar(org uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r record;
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 for r in select * from leadvox_private.suporte_acessos where organization_id=org and admin_id=auth.uid() and encerrado_em is null loop
  if r.criou_membro then delete from public.lv_memberships where organization_id=org and user_id=auth.uid() and role='admin'; end if;
  update leadvox_private.suporte_acessos set encerrado_em=now() where id=r.id;
 end loop;
 return jsonb_build_object('ok',true);
end;$$;

-- Configuração do Asaas da LeadVox (Super Admin). A chave e o token do retorno vão para o Vault; nada volta para a tela.
create or replace function public.lv_admin_asaas_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 return jsonb_build_object('conectado',exists(select 1 from vault.secrets where name='lv_asaas_plataforma'),
  'ambiente',(select description from vault.secrets where name='lv_asaas_plataforma'),
  'retorno',exists(select 1 from vault.secrets where name='lv_asaas_retorno'));
end;$$;

create or replace function public.lv_admin_asaas_gravar(ambiente text,chave text,token_retorno text) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 if ambiente not in('sandbox','production') or chave !~ '^\$?aact_[A-Za-z0-9_:$.=-]{10,}$' or token_retorno !~ '^[A-Za-z0-9]{32,64}$' then raise exception 'invalid'; end if;
 select id into sid from vault.secrets where name='lv_asaas_plataforma';
 if sid is null then perform vault.create_secret(chave,'lv_asaas_plataforma',ambiente); else perform vault.update_secret(sid,chave,'lv_asaas_plataforma',ambiente); end if;
 select id into sid from vault.secrets where name='lv_asaas_retorno';
 if sid is null then perform vault.create_secret(token_retorno,'lv_asaas_retorno','token do retorno do Asaas'); else perform vault.update_secret(sid,token_retorno); end if;
 insert into leadvox_private.saas_admin_log(admin_id,acao,dados) values(auth.uid(),'asaas',jsonb_build_object('ambiente',ambiente));
end;$$;

-- Só a função "cobranca" lê a chave (para falar com o Asaas) e o token (para conferir o retorno).
create or replace function public.iag_saas_segredos() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'chave',(select decrypted_secret from vault.decrypted_secrets where name='lv_asaas_plataforma'),
  'ambiente',(select description from vault.secrets where name='lv_asaas_plataforma'),
  'retorno',(select decrypted_secret from vault.decrypted_secrets where name='lv_asaas_retorno'));
$$;

revoke all on function leadvox_private.saas_situacao(uuid),leadvox_private.saas_bloquear(uuid,boolean),leadvox_private.saas_aviso(uuid,text,text) from public,anon,authenticated;
revoke all on function public.lv_assinatura(uuid),public.lv_admin_empresas(),public.lv_admin_consumo(date,date),public.lv_admin_acao(uuid,text,jsonb),
 public.lv_admin_suporte(uuid,int,text),public.lv_admin_suporte_encerrar(uuid),public.lv_admin_asaas_status(),public.lv_admin_asaas_gravar(text,text,text) from public,anon;
grant execute on function public.lv_assinatura(uuid),public.lv_admin_empresas(),public.lv_admin_consumo(date,date),public.lv_admin_acao(uuid,text,jsonb),
 public.lv_admin_suporte(uuid,int,text),public.lv_admin_suporte_encerrar(uuid),public.lv_admin_asaas_status(),public.lv_admin_asaas_gravar(text,text,text) to authenticated;
revoke all on function public.iag_saas_checkout_dados(uuid,uuid),public.iag_saas_checkout_gravar(uuid,jsonb),public.iag_saas_evento(jsonb),
 public.iag_saas_avisos_pendentes(),public.iag_saas_aviso_resultado(bigint,text,text),public.iag_saas_segredos() from public,anon,authenticated;
grant execute on function public.iag_saas_checkout_dados(uuid,uuid),public.iag_saas_checkout_gravar(uuid,jsonb),public.iag_saas_evento(jsonb),
 public.iag_saas_avisos_pendentes(),public.iag_saas_aviso_resultado(bigint,text,text),public.iag_saas_segredos() to service_role;
commit;
