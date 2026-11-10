-- Site da loja: modelos fiéis (o HTML original de cada site). A identidade ganha a cidade e até 3 avaliações do Google.
-- Rodar depois de site_modelos.sql.
create or replace function public.lv_site_modelo_salvar(org uuid,p_modelo text,ident jsonb,p_publicado boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare g text:=leadvox_private.usuarios_gestor(org); v_conta text; i jsonb:=coalesce(ident,'{}'::jsonb); o jsonb; logo text; zap text; insta text; mapa text; pasta text; avs jsonb:='[]'::jsonb; av jsonb;
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
 if i ? 'avaliacoes' then
  if jsonb_typeof(i->'avaliacoes')<>'array' or jsonb_array_length(i->'avaliacoes')>3 then return jsonb_build_object('ok',false,'erro','avaliacoes'); end if;
  for av in select * from jsonb_array_elements(i->'avaliacoes') loop
   if leadvox_private.site_txt(av->'nome',60)<>'' and leadvox_private.site_txt(av->'texto',400)<>'' then
    avs:=avs||jsonb_build_array(jsonb_build_object('nome',leadvox_private.site_txt(av->'nome',60),'texto',leadvox_private.site_txt(av->'texto',400)));
   end if;
  end loop;
 end if;
 o:=jsonb_build_object('nome',leadvox_private.site_txt(i->'nome',60),'logo',logo,
  'cor1',lower(coalesce(nullif(i->>'cor1',''),'#d6921e')),'cor2',lower(coalesce(nullif(i->>'cor2',''),'#121110')),'fonte',coalesce(nullif(i->>'fonte',''),'saira'),
  'frase',leadvox_private.site_txt(i->'frase',90),'subtitulo',leadvox_private.site_txt(i->'subtitulo',200),'sobre',leadvox_private.site_txt(i->'sobre',600),
  'whatsapp',nullif(zap,''),'telefone',leadvox_private.site_txt(i->'telefone',20),'endereco',leadvox_private.site_txt(i->'endereco',160),
  'horario',leadvox_private.site_txt(i->'horario',120),'instagram',nullif(insta,''),'mapa',nullif(mapa,''),'cidade',leadvox_private.site_txt(i->'cidade',60),'avaliacoes',avs);
 insert into leadvox_private.site_config(organization_id,modelo,identidade,publicado,atualizado_em,autor)
 values(org,p_modelo,o,coalesce(p_publicado,false),now(),auth.uid())
 on conflict(organization_id) do update set modelo=excluded.modelo,identidade=excluded.identidade,publicado=excluded.publicado,atualizado_em=now(),autor=auth.uid();
 return jsonb_build_object('ok',true);
end;$$;

insert into leadvox_private.sql_aplicado(arquivo) values('site_modelos_fieis.sql') on conflict(arquivo) do nothing;
