-- Site da loja: modelo escolhido, identidade (logo, cores, fonte), textos e contatos, e a leitura pública do site com o estoque.
-- O dono e o admin (e o Super Admin) escolhem e editam pelo painel; o site (/s/<conta>/) lê pela função pública lv_site_dados(conta).
-- Rodar depois de site_temas.sql e estoque.sql.

alter table leadvox_private.site_config add column if not exists modelo text;
alter table leadvox_private.site_config add column if not exists identidade jsonb not null default '{}'::jsonb;
alter table leadvox_private.site_config add column if not exists publicado boolean not null default false;

create or replace function leadvox_private.site_modelos() returns text[] language sql immutable set search_path='' as $$
 select array['garagem','premium','neon','claro','editorial'];
$$;
create or replace function leadvox_private.site_fontes() returns text[] language sql immutable set search_path='' as $$
 select array['saira','bebas','barlow','oswald','outfit'];
$$;
revoke all on function leadvox_private.site_modelos(),leadvox_private.site_fontes() from public,anon,authenticated;

-- Painel: lê tudo do site (temas e modelo)
create or replace function public.lv_site_config(org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g text:=leadvox_private.usuarios_gestor(org); c leadvox_private.site_config; v_conta text;
begin
 if g is null then raise exception 'forbidden'; end if;
 select m.conta into v_conta from leadvox_private.motor_contas m where m.organization_id=org limit 1;
 select * into c from leadvox_private.site_config where organization_id=org;
 return jsonb_build_object('conta',v_conta,'tema',c.tema,'agenda',coalesce(c.agenda,'[]'::jsonb),'musica',coalesce(c.musica,false),'campanha',c.campanha,
  'modelo',c.modelo,'identidade',coalesce(c.identidade,'{}'::jsonb),'publicado',coalesce(c.publicado,false),'atualizadoEm',c.atualizado_em,
  'veiculos',(select count(*) from public.iag_item i where i.conta=v_conta and i.status='disponivel'));
end;$$;

-- Painel: salva o modelo, a identidade e se o site está publicado
create or replace function public.lv_site_modelo_salvar(org uuid,p_modelo text,ident jsonb,p_publicado boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare g text:=leadvox_private.usuarios_gestor(org); v_conta text; i jsonb:=coalesce(ident,'{}'::jsonb); o jsonb; logo text; zap text; insta text; mapa text; pasta text;
begin
 if g is null then raise exception 'forbidden'; end if;
 select m.conta into v_conta from leadvox_private.motor_contas m where m.organization_id=org limit 1;
 if v_conta is null then return jsonb_build_object('ok',false,'erro','sem_conta'); end if;
 if p_modelo is null or not (p_modelo=any(leadvox_private.site_modelos())) then return jsonb_build_object('ok',false,'erro','modelo'); end if;
 if jsonb_typeof(i)<>'object' then return jsonb_build_object('ok',false,'erro','dados'); end if;
 pasta:='https://dcucemuewipfnneqpgxk.supabase.co/storage/v1/object/public/lv-materiais/'||v_conta||'/';
 logo:=nullif(btrim(coalesce(i->>'logo','')),'');
 if logo is not null and (left(logo,length(pasta))<>pasta or logo !~ '\.(jpg|png)$' or length(logo)>300) then return jsonb_build_object('ok',false,'erro','logo'); end if;
 if coalesce(i->>'cor1','#000000') !~ '^#[0-9a-fA-F]{6}$' or coalesce(i->>'cor2','#000000') !~ '^#[0-9a-fA-F]{6}$' then return jsonb_build_object('ok',false,'erro','cor'); end if;
 if nullif(i->>'fonte','') is not null and not ((i->>'fonte')=any(leadvox_private.site_fontes())) then return jsonb_build_object('ok',false,'erro','fonte'); end if;
 zap:=regexp_replace(coalesce(i->>'whatsapp',''),'\D','','g');
 if zap<>'' and (length(zap)<10 or length(zap)>13) then return jsonb_build_object('ok',false,'erro','whatsapp'); end if;
 insta:=ltrim(btrim(coalesce(i->>'instagram','')),'@');
 if insta<>'' and insta !~ '^[A-Za-z0-9._]{1,30}$' then return jsonb_build_object('ok',false,'erro','instagram'); end if;
 mapa:=btrim(coalesce(i->>'mapa',''));
 if mapa<>'' and (mapa !~ '^https://' or length(mapa)>400) then return jsonb_build_object('ok',false,'erro','mapa'); end if;
 if leadvox_private.site_txt(i->'nome',60)='' then return jsonb_build_object('ok',false,'erro','nome'); end if;
 if coalesce(p_publicado,false) and zap='' then return jsonb_build_object('ok',false,'erro','publicar_sem_zap'); end if;
 o:=jsonb_build_object('nome',leadvox_private.site_txt(i->'nome',60),'logo',logo,
  'cor1',lower(coalesce(nullif(i->>'cor1',''),'#d6921e')),'cor2',lower(coalesce(nullif(i->>'cor2',''),'#121110')),'fonte',coalesce(nullif(i->>'fonte',''),'saira'),
  'frase',leadvox_private.site_txt(i->'frase',90),'subtitulo',leadvox_private.site_txt(i->'subtitulo',200),'sobre',leadvox_private.site_txt(i->'sobre',600),
  'whatsapp',nullif(zap,''),'telefone',leadvox_private.site_txt(i->'telefone',20),'endereco',leadvox_private.site_txt(i->'endereco',160),
  'horario',leadvox_private.site_txt(i->'horario',120),'instagram',nullif(insta,''),'mapa',nullif(mapa,''));
 insert into leadvox_private.site_config(organization_id,modelo,identidade,publicado,atualizado_em,autor)
 values(org,p_modelo,o,coalesce(p_publicado,false),now(),auth.uid())
 on conflict(organization_id) do update set modelo=excluded.modelo,identidade=excluded.identidade,publicado=excluded.publicado,atualizado_em=now(),autor=auth.uid();
 return jsonb_build_object('ok',true);
end;$$;

-- Público: o que o site mostra. Sem modelo escolhido, nada. Só veículos disponíveis, até 300, com até 12 fotos cada.
create or replace function public.lv_site_dados(p_conta text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid; c leadvox_private.site_config;
begin
 if p_conta is null or p_conta !~ '^[a-z0-9-]{3,60}$' then return jsonb_build_object('ativo',false); end if;
 select m.organization_id into org from leadvox_private.motor_contas m where m.conta=p_conta limit 1;
 if org is null then return jsonb_build_object('ativo',false); end if;
 select * into c from leadvox_private.site_config where organization_id=org;
 if c.modelo is null then return jsonb_build_object('ativo',false); end if;
 return jsonb_build_object('ativo',true,'modelo',c.modelo,'publicado',c.publicado,'identidade',c.identidade,
  'itens',coalesce((select jsonb_agg(s.x order by s.ordem) from (
    select row_number() over(order by i.destaque desc,i.ordem,i.nome) as ordem,
     jsonb_build_object('id',i.id,'nome',i.nome,'categoria',i.categoria,'preco',case when i.preco_tipo='fixo' then i.preco end,
      'atributos',i.atributos,'descricao',left(coalesce(i.descricao,''),300),
      'fotos',coalesce((select jsonb_agg(f) from (select f from jsonb_array_elements(case when jsonb_typeof(i.fotos)='array' then i.fotos else '[]'::jsonb end) f limit 12) z),'[]'::jsonb)) as x
    from public.iag_item i where i.conta=p_conta and i.status='disponivel' order by i.destaque desc,i.ordem,i.nome limit 300) s),'[]'::jsonb));
end;$$;

revoke all on function public.lv_site_modelo_salvar(uuid,text,jsonb,boolean),public.lv_site_dados(text) from public,anon;
grant execute on function public.lv_site_config(uuid),public.lv_site_modelo_salvar(uuid,text,jsonb,boolean) to authenticated;
grant execute on function public.lv_site_dados(text) to anon,authenticated;

insert into leadvox_private.sql_aplicado(arquivo) values('site_modelos.sql') on conflict(arquivo) do nothing;
