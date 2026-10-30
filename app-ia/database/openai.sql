-- OpenAI por empresa. Nenhuma chave global/reserva. Aplicação e fluxos antigos não são alterados.
-- As chaves reais só podem ser lidas pelo proxy (service_role); o n8n recebe autorização curta.
begin;
create table if not exists leadvox_private.openai_keys(
 organization_id uuid primary key references public.lv_organizations(id) on delete cascade,
 secret_id uuid not null, suffix text not null, updated_at timestamptz not null default now()
);
create table if not exists leadvox_private.openai_grants(
 token_hash text primary key, organization_id uuid not null references public.lv_organizations(id) on delete cascade,
 agente text not null, teste boolean not null default false,
 expires_at timestamptz not null, remaining integer not null default 16 check(remaining>=0)
);
create index if not exists openai_grants_expiry on leadvox_private.openai_grants(expires_at);
create table if not exists leadvox_private.openai_usage(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.lv_organizations(id) on delete cascade,
 agente text not null, teste boolean not null, operation text not null, model text not null,
 created_at timestamptz not null default now(), status integer,
 input_tokens bigint, cached_tokens bigint, output_tokens bigint, audio_seconds numeric, characters integer,
 estimated_usd numeric, pricing_version text, finished_at timestamptz
);
create index if not exists openai_usage_org_date on leadvox_private.openai_usage(organization_id,created_at);
alter table leadvox_private.openai_keys enable row level security;
alter table leadvox_private.openai_grants enable row level security;
alter table leadvox_private.openai_usage enable row level security;
revoke all on leadvox_private.openai_keys,leadvox_private.openai_grants,leadvox_private.openai_usage from public,anon,authenticated;

create or replace function public.lv_set_openai(org uuid,sec text) returns void
language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 if not exists(select 1 from public.lv_memberships where organization_id=org and user_id=auth.uid() and role in('owner','admin')) then raise exception 'forbidden'; end if;
 if sec is null or length(sec)>503 or sec !~ '^sk-[A-Za-z0-9_-]{20,}$' then raise exception 'invalid'; end if;
 -- Serializa primeira gravação e rotação sem criar segredos órfãos.
 perform 1 from public.lv_organizations where id=org for update;
 select secret_id into sid from leadvox_private.openai_keys where organization_id=org;
 if sid is null then sid:=vault.create_secret(sec,'lv_openai_'||org::text,'OpenAI da empresa');
 else perform vault.update_secret(sid,sec); end if;
 insert into leadvox_private.openai_keys(organization_id,secret_id,suffix) values(org,sid,right(sec,4))
 on conflict(organization_id) do update set secret_id=excluded.secret_id,suffix=excluded.suffix,updated_at=now();
 delete from leadvox_private.openai_grants where organization_id=org;
end;$$;

create or replace function public.lv_openai_status(org uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.lv_memberships where organization_id=org and user_id=auth.uid()) then raise exception 'forbidden'; end if;
 return coalesce((select jsonb_build_object('connected',true,'suffix',suffix,'updatedAt',updated_at)
 from leadvox_private.openai_keys where organization_id=org),jsonb_build_object('connected',false));
end;$$;

-- Exclusivo do motor. A conta vem da rota autenticada, nunca do texto do cliente.
create or replace function public.iag_openai_grant(p_conta text,p_agente text,p_teste boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid; tok text;
begin
 select m.organization_id into org from leadvox_private.motor_contas m
 join public.iag_conta c on c.chave=m.conta and not c.bloqueado
 join public.iag_agente a on a.conta=c.chave and a.chave=p_agente and not a.arquivado
 where m.conta=p_conta;
 if org is null or not exists(select 1 from leadvox_private.openai_keys where organization_id=org) then
 return jsonb_build_object('ok',false,'erro','openai_nao_configurada'); end if;
 delete from leadvox_private.openai_grants where expires_at<now();
 tok:='lvai_'||encode(extensions.gen_random_bytes(32),'hex');
 insert into leadvox_private.openai_grants(token_hash,organization_id,agente,teste,expires_at)
 values(encode(extensions.digest(tok,'sha256'),'hex'),org,p_agente,coalesce(p_teste,false),now()+interval '10 minutes');
 return jsonb_build_object('ok',true,'token',tok);
end;$$;

-- Só o proxy usa: debita uma chamada atomicamente e grava a tentativa ANTES de chamar a OpenAI.
create or replace function public.iag_openai_reserve(p_token text,p_operation text,p_model text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g leadvox_private.openai_grants; sid uuid; chave text; rid uuid;
begin
 if p_token is null or p_token !~ '^lvai_[0-9a-f]{64}$' then return null; end if;
 if not ((p_operation='chat/completions' and p_model in('gpt-4.1-mini','gpt-4.1','gpt-4o-mini'))
 or (p_operation='audio/transcriptions' and p_model='whisper-1')
 or (p_operation='audio/speech' and p_model='gpt-4o-mini-tts')) then return null; end if;
 update leadvox_private.openai_grants set remaining=remaining-1
 where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and expires_at>now() and remaining>0
 returning * into g;
 if g.organization_id is null then return null; end if;
 if not exists(select 1 from leadvox_private.motor_contas m join public.iag_conta c on c.chave=m.conta
 join public.iag_agente a on a.conta=c.chave and a.chave=g.agente and not a.arquivado
 where m.organization_id=g.organization_id and not c.bloqueado) then return null; end if;
 select secret_id into sid from leadvox_private.openai_keys where organization_id=g.organization_id;
 select decrypted_secret into chave from vault.decrypted_secrets where id=sid;
 if chave is null then return null; end if;
 insert into leadvox_private.openai_usage(organization_id,agente,teste,operation,model)
 values(g.organization_id,g.agente,g.teste,p_operation,p_model) returning id into rid;
 return jsonb_build_object('id',rid,'key',chave);
end;$$;

-- Sem prompt, telefone, áudio ou resposta no registro. Idempotente por chamada.
create or replace function public.iag_openai_finish(p_id uuid,p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 update leadvox_private.openai_usage set
 status=(p_data->>'status')::integer,
 input_tokens=(p_data->>'input')::bigint,cached_tokens=(p_data->>'cached')::bigint,output_tokens=(p_data->>'output')::bigint,
 audio_seconds=(p_data->>'seconds')::numeric,characters=(p_data->>'characters')::integer,
 estimated_usd=(p_data->>'usd')::numeric,pricing_version=p_data->>'pricing',finished_at=now()
 where id=p_id and finished_at is null;
end;$$;

create or replace function public.lv_openai_usage(org uuid,ini date,fim date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.lv_memberships where organization_id=org and user_id=auth.uid()) then raise exception 'forbidden'; end if;
 if ini is null or fim is null or fim<ini or fim-ini>366 then raise exception 'period'; end if;
 return jsonb_build_object('currency','USD','estimated',true,'rows',coalesce((
 select jsonb_agg(to_jsonb(r) order by r.dia,r.agente,r.model) from (
 select (created_at at time zone 'America/Sao_Paulo')::date dia,agente,model,operation,teste,
 count(*) calls,count(*) filter(where status>=400) errors,count(*) filter(where finished_at is null) pending,
 count(*) filter(where estimated_usd is null) unpriced,
 sum(input_tokens) input,sum(cached_tokens) cached,sum(output_tokens) output,sum(audio_seconds) seconds,
 sum(characters) characters,sum(estimated_usd) usd
 from leadvox_private.openai_usage where organization_id=org
 and created_at>=ini::timestamp at time zone 'America/Sao_Paulo'
 and created_at<(fim+1)::timestamp at time zone 'America/Sao_Paulo'
 group by 1,2,3,4,5) r),'[]'::jsonb));
end;$$;

revoke all on function public.lv_set_openai(uuid,text),public.lv_openai_status(uuid),public.lv_openai_usage(uuid,date,date) from public,anon;
grant execute on function public.lv_set_openai(uuid,text),public.lv_openai_status(uuid),public.lv_openai_usage(uuid,date,date) to authenticated;
revoke all on function public.iag_openai_grant(text,text,boolean),public.iag_openai_reserve(text,text,text),public.iag_openai_finish(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.iag_openai_grant(text,text,boolean),public.iag_openai_reserve(text,text,text),public.iag_openai_finish(uuid,jsonb) to service_role;
commit;
