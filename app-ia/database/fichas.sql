-- Ficha de Implantação (plugin da LeadVox, leadvox.com.br/ficha): uma ficha por cliente entrevistado pela equipe da LeadVox.
-- A página fala só com o n8n (fluxo "LeadVox · Ficha de implantação (plugin)"), que confere a chave do plugin e chama estas funções
-- com o service_role. A tabela fica fora do REST público. Rodar depois de controle.sql.
create table if not exists leadvox_private.fichas (
 id text primary key check (id ~ '^[a-z0-9-]{3,60}$'),
 nome text not null default '',
 contato text not null default '',
 status text not null default 'rascunho' check (status in ('rascunho','pronta')),
 dados jsonb not null default '{}'::jsonb,
 criado_em timestamptz not null default now(),
 atualizado_em timestamptz not null default now()
);
revoke all on leadvox_private.fichas from public,anon,authenticated;

-- Lista para a barra lateral: só o resumo, as mais recentes primeiro.
create or replace function public.lv_fichas_listar() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'nome',f.nome,'contato',f.contato,'status',f.status,
  'atualizadoEm',(extract(epoch from f.atualizado_em)*1000)::bigint) order by f.atualizado_em desc),'[]'::jsonb)
 from (select * from leadvox_private.fichas order by atualizado_em desc limit 300) f;
$$;

-- Uma ficha inteira (null se não existe).
create or replace function public.lv_ficha_abrir(p_id text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',f.id,'nome',f.nome,'contato',f.contato,'status',f.status,'dados',f.dados,
  'criadoEm',(extract(epoch from f.criado_em)*1000)::bigint,'atualizadoEm',(extract(epoch from f.atualizado_em)*1000)::bigint)
 from leadvox_private.fichas f where f.id=p_id;
$$;

-- Cria ou atualiza. Recusa id fora do padrão, status inválido e ficha acima de 200 KB.
create or replace function public.lv_ficha_salvar(p_id text, p_ficha jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_status text; v_quando timestamptz:=now();
begin
 if coalesce(p_id,'') !~ '^[a-z0-9-]{3,60}$' then return jsonb_build_object('ok',false,'erro','id'); end if;
 if jsonb_typeof(p_ficha)<>'object' or jsonb_typeof(coalesce(p_ficha->'dados','{}'::jsonb))<>'object' then return jsonb_build_object('ok',false,'erro','ficha'); end if;
 if octet_length(p_ficha::text)>204800 then return jsonb_build_object('ok',false,'erro','grande'); end if;
 v_status:=case when p_ficha->>'status'='pronta' then 'pronta' else 'rascunho' end;
 insert into leadvox_private.fichas(id,nome,contato,status,dados,atualizado_em)
 values(p_id,left(btrim(coalesce(p_ficha->>'nome','')),120),left(regexp_replace(coalesce(p_ficha->>'contato',''),'[^0-9]','','g'),20),v_status,coalesce(p_ficha->'dados','{}'::jsonb),v_quando)
 on conflict(id) do update set nome=excluded.nome,contato=excluded.contato,status=excluded.status,dados=excluded.dados,atualizado_em=v_quando;
 return jsonb_build_object('ok',true,'atualizadoEm',(extract(epoch from v_quando)*1000)::bigint);
end;$$;

-- Exclui de vez (só pelo botão "Excluir ficha", com confirmação na página).
create or replace function public.lv_ficha_excluir(p_id text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 delete from leadvox_private.fichas where id=p_id;
 return jsonb_build_object('ok',found);
end;$$;

revoke all on function public.lv_fichas_listar() from public,anon,authenticated;
revoke all on function public.lv_ficha_abrir(text) from public,anon,authenticated;
revoke all on function public.lv_ficha_salvar(text,jsonb) from public,anon,authenticated;
revoke all on function public.lv_ficha_excluir(text) from public,anon,authenticated;
grant execute on function public.lv_fichas_listar() to service_role;
grant execute on function public.lv_ficha_abrir(text) to service_role;
grant execute on function public.lv_ficha_salvar(text,jsonb) to service_role;
grant execute on function public.lv_ficha_excluir(text) to service_role;

insert into leadvox_private.sql_aplicado(arquivo) values('fichas.sql') on conflict(arquivo) do nothing;
