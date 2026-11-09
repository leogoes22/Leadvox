-- Temas do site da loja (Natal, Black Friday…) e a campanha em pop-up.
-- O dono e o admin da empresa (e o Super Admin) ligam um tema agora, agendam as datas do ano e cadastram uma campanha com arte.
-- O site da loja lê pela função pública lv_site_publico(conta): só o tema do dia, a campanha válida e se a música pode tocar.
-- Rodar depois de motor_link.sql, materiais.sql e usuarios.sql (usa leadvox_private.usuarios_gestor).

create table if not exists leadvox_private.site_config(
 organization_id uuid primary key references public.lv_organizations(id) on delete cascade,
 tema text,                                  -- ligado à mão: vale até desligar
 agenda jsonb not null default '[]'::jsonb,  -- [{tema, inicio, fim}] em datas do Brasil
 musica boolean not null default false,
 campanha jsonb,                             -- {titulo, texto, condicao, validade, botao, arte, ativa}
 atualizado_em timestamptz not null default now(),
 autor uuid
);
alter table leadvox_private.site_config enable row level security;
revoke all on leadvox_private.site_config from public,anon,authenticated;

create or replace function leadvox_private.site_temas() returns text[] language sql immutable set search_path='' as $$
 select array['natal','ano-novo','carnaval','dia-das-maes','dia-dos-pais','dia-do-cliente','black-friday'];
$$;

-- texto curto, sem quebra de linha nem sinais de HTML
create or replace function leadvox_private.site_txt(v jsonb,n int) returns text language sql immutable set search_path='' as $$
 select left(btrim(regexp_replace(regexp_replace(coalesce(v#>>'{}',''),'[<>]','','g'),'\s+',' ','g')),n);
$$;

create or replace function leadvox_private.site_data(v jsonb) returns date language plpgsql immutable set search_path='' as $$
begin
 if v is null or jsonb_typeof(v)<>'string' or (v#>>'{}') !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
 return (v#>>'{}')::date;
exception when others then return null;
end;$$;

revoke all on function leadvox_private.site_temas(),leadvox_private.site_txt(jsonb,int),leadvox_private.site_data(jsonb) from public,anon,authenticated;

-- Painel: lê a configuração (dono, admin ou Super Admin)
create or replace function public.lv_site_config(org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g text:=leadvox_private.usuarios_gestor(org); c leadvox_private.site_config;
begin
 if g is null then raise exception 'forbidden'; end if;
 select * into c from leadvox_private.site_config where organization_id=org;
 return jsonb_build_object('conta',(select m.conta from leadvox_private.motor_contas m where m.organization_id=org limit 1),
  'tema',c.tema,'agenda',coalesce(c.agenda,'[]'::jsonb),'musica',coalesce(c.musica,false),'campanha',c.campanha,'atualizadoEm',c.atualizado_em);
end;$$;

-- Painel: salva tudo de uma vez, conferindo cada campo
create or replace function public.lv_site_salvar(org uuid,cfg jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare g text:=leadvox_private.usuarios_gestor(org); temas text[]:=leadvox_private.site_temas(); conta text;
 v_tema text; v_agenda jsonb:='[]'::jsonb; i jsonb; ini date; fim date; c jsonb; v_camp jsonb; arte text; validade date; titulo text;
begin
 if g is null then raise exception 'forbidden'; end if;
 if cfg is null or jsonb_typeof(cfg)<>'object' then return jsonb_build_object('ok',false,'erro','dados'); end if;
 select m.conta into conta from leadvox_private.motor_contas m where m.organization_id=org limit 1;

 v_tema:=nullif(cfg->>'tema','');
 if v_tema is not null and not (v_tema=any(temas)) then return jsonb_build_object('ok',false,'erro','tema'); end if;

 if cfg ? 'agenda' then
  if jsonb_typeof(cfg->'agenda')<>'array' or jsonb_array_length(cfg->'agenda')>12 then return jsonb_build_object('ok',false,'erro','agenda'); end if;
  for i in select * from jsonb_array_elements(cfg->'agenda') loop
   ini:=leadvox_private.site_data(i->'inicio'); fim:=leadvox_private.site_data(i->'fim');
   if not ((i->>'tema')=any(temas)) or ini is null or fim is null or fim<ini or fim-ini>62 then return jsonb_build_object('ok',false,'erro','agenda'); end if;
   v_agenda:=v_agenda||jsonb_build_array(jsonb_build_object('tema',i->>'tema','inicio',ini,'fim',fim));
  end loop;
 end if;

 c:=cfg->'campanha';
 if c is not null and jsonb_typeof(c)='object' then
  titulo:=leadvox_private.site_txt(c->'titulo',60);
  validade:=leadvox_private.site_data(c->'validade');
  arte:=nullif(btrim(coalesce(c->>'arte','')),'');
  if titulo='' then return jsonb_build_object('ok',false,'erro','campanha_titulo'); end if;
  if c ? 'validade' and nullif(c->>'validade','') is not null and validade is null then return jsonb_build_object('ok',false,'erro','campanha_validade'); end if;
  -- a arte só pode ser uma imagem enviada pela própria loja (pasta da conta dela em lv-materiais)
  if arte is not null and (conta is null or left(arte,length('https://dcucemuewipfnneqpgxk.supabase.co/storage/v1/object/public/lv-materiais/'||conta||'/'))
     <>'https://dcucemuewipfnneqpgxk.supabase.co/storage/v1/object/public/lv-materiais/'||conta||'/' or arte !~ '\.(jpg|png)$' or length(arte)>300) then
   return jsonb_build_object('ok',false,'erro','campanha_arte');
  end if;
  v_camp:=jsonb_build_object('titulo',titulo,'texto',leadvox_private.site_txt(c->'texto',240),'condicao',leadvox_private.site_txt(c->'condicao',80),
   'validade',validade,'botao',coalesce(nullif(leadvox_private.site_txt(c->'botao',24),''),'Quero a oferta'),'arte',arte,'ativa',coalesce((c->>'ativa')::boolean,false));
 elsif c is not null and jsonb_typeof(c)<>'null' then return jsonb_build_object('ok',false,'erro','campanha');
 end if;

 insert into leadvox_private.site_config(organization_id,tema,agenda,musica,campanha,atualizado_em,autor)
 values(org,v_tema,v_agenda,coalesce((cfg->>'musica')::boolean,false),v_camp,now(),auth.uid())
 on conflict(organization_id) do update set tema=excluded.tema,agenda=excluded.agenda,musica=excluded.musica,campanha=excluded.campanha,
  atualizado_em=now(),autor=auth.uid();
 return jsonb_build_object('ok',true);
end;$$;

-- Público (o site da loja chama sem login): tema de hoje, campanha válida e música.
-- Hoje = data no horário de Brasília. O tema ligado à mão vence a agenda.
create or replace function public.lv_site_publico(p_conta text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid; c leadvox_private.site_config; hoje date:=(now() at time zone 'America/Sao_Paulo')::date; t text; camp jsonb;
begin
 if p_conta is null or p_conta !~ '^[a-z0-9-]{3,60}$' then return jsonb_build_object('tema',null); end if;
 select m.organization_id into org from leadvox_private.motor_contas m where m.conta=p_conta limit 1;
 if org is null then return jsonb_build_object('tema',null); end if;
 select * into c from leadvox_private.site_config where organization_id=org;
 if c.organization_id is null then return jsonb_build_object('tema',null); end if;
 t:=coalesce(c.tema,(select a->>'tema' from jsonb_array_elements(c.agenda) a
   where (a->>'inicio')::date<=hoje and (a->>'fim')::date>=hoje order by (a->>'inicio')::date desc limit 1));
 if coalesce((c.campanha->>'ativa')::boolean,false) and (c.campanha->>'validade' is null or (c.campanha->>'validade')::date>=hoje) then
  camp:=c.campanha-'ativa';
 end if;
 return jsonb_build_object('tema',t,'musica',c.musica and t is not null,'campanha',camp);
end;$$;

revoke all on function public.lv_site_config(uuid),public.lv_site_salvar(uuid,jsonb),public.lv_site_publico(text) from public,anon;
grant execute on function public.lv_site_config(uuid),public.lv_site_salvar(uuid,jsonb) to authenticated;
grant execute on function public.lv_site_publico(text) to anon,authenticated;

insert into leadvox_private.sql_aplicado(arquivo) values('site_temas.sql') on conflict(arquivo) do nothing;
