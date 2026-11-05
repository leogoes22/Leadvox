-- Arquivos que a IA pode enviar, pelo painel (aba Arquivos do agente): vídeo, PDF, imagem ou link.
-- O arquivo fica numa pasta pública própria, para o WhatsApp conseguir baixar: lv-materiais/<conta>/<arquivo>.
-- Cada robô escolhe em config.materiais quais usa e quando manda; a biblioteca da conta fica em iag_material.
-- Rodar depois de motor_link.sql, estoque_fotos.sql e excluir_empresa.sql.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('lv-materiais','lv-materiais',true,16777216,array['video/mp4','application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Quem envia ou apaga precisa ser dono ou admin da empresa ligada à conta da pasta.
drop policy if exists "lv_materiais_envia" on storage.objects;
create policy "lv_materiais_envia" on storage.objects for insert to authenticated
 with check(bucket_id='lv-materiais' and public.lv_motor_pasta_estoque(name));
drop policy if exists "lv_materiais_apaga" on storage.objects;
create policy "lv_materiais_apaga" on storage.objects for delete to authenticated
 using(bucket_id='lv-materiais' and public.lv_motor_pasta_estoque(name));
drop policy if exists "lv_materiais_le_dono" on storage.objects;
create policy "lv_materiais_le_dono" on storage.objects for select to authenticated
 using(bucket_id='lv-materiais' and public.lv_motor_pasta_estoque(name));

create or replace function public.lv_motor_materiais(org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_conta text;
begin
 v_conta:=leadvox_private.motor_conta(org,false);
 if v_conta is null then return jsonb_build_object('vinculado',false,'materiais','[]'::jsonb); end if;
 return jsonb_build_object('vinculado',true,'conta',v_conta,'materiais',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'titulo',m.titulo,'tipo',m.tipo,'url',m.url,'descricao',m.descricao) order by m.criado_em)
  from public.iag_material m where m.conta=v_conta),'[]'::jsonb));
end;$$;

create or replace function public.lv_motor_material_salvar(org uuid,item jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_conta text; v_id bigint; v_titulo text; v_tipo text; v_url text; v_desc text; atual text;
 pasta constant text:='https://dcucemuewipfnneqpgxk.supabase.co/storage/v1/object/public/lv-materiais/';
begin
 v_conta:=leadvox_private.motor_conta(org,true);
 if v_conta is null then raise exception 'forbidden'; end if;
 v_id:=nullif(item->>'id','')::bigint;
 v_titulo:=left(btrim(coalesce(item->>'titulo','')),120);
 v_tipo:=coalesce(item->>'tipo','');
 v_url:=btrim(coalesce(item->>'url',''));
 v_desc:=left(btrim(coalesce(item->>'descricao','')),300);
 if v_titulo='' then return jsonb_build_object('ok',false,'erro','titulo'); end if;
 if v_tipo not in('pdf','video','imagem','link') then return jsonb_build_object('ok',false,'erro','tipo'); end if;
 if v_url !~ '^https://\S{1,490}$' then return jsonb_build_object('ok',false,'erro','url'); end if;
 if v_id is not null then
  select url into atual from public.iag_material where id=v_id and conta=v_conta;
  if atual is null then return jsonb_build_object('ok',false,'erro','nao_encontrado'); end if;
 end if;
 -- arquivo só da pasta da própria conta (ou o que já estava cadastrado); link pode ser qualquer endereço https
 if v_tipo<>'link' and v_url is distinct from atual and left(v_url,length(pasta||v_conta||'/'))<>pasta||v_conta||'/' then return jsonb_build_object('ok',false,'erro','url'); end if;
 if v_id is null then
  if (select count(*) from public.iag_material where conta=v_conta)>=50 then return jsonb_build_object('ok',false,'erro','limite'); end if;
  insert into public.iag_material(conta,titulo,tipo,url,descricao) values(v_conta,v_titulo,v_tipo,v_url,v_desc) returning id into v_id;
 else
  update public.iag_material set titulo=v_titulo,tipo=v_tipo,url=v_url,descricao=v_desc,atualizado_em=now() where id=v_id and conta=v_conta;
 end if;
 return jsonb_build_object('ok',true,'id',v_id);
end;$$;

-- Exclui da biblioteca e tira de todos os robôs da conta. Devolve o endereço para o servidor apagar o arquivo.
create or replace function public.lv_motor_material_excluir(org uuid,material bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_conta text; v_url text;
begin
 v_conta:=leadvox_private.motor_conta(org,true);
 if v_conta is null then raise exception 'forbidden'; end if;
 delete from public.iag_material where id=material and conta=v_conta returning url into v_url;
 if v_url is null then return jsonb_build_object('ok',false,'erro','nao_encontrado'); end if;
 update public.iag_agente a set versao=a.versao+1,atualizado_em=now(),config=jsonb_set(a.config,'{materiais}',coalesce((select jsonb_agg(x) from jsonb_array_elements(a.config->'materiais') x where x->>'id'<>material::text),'[]'::jsonb))
  where a.conta=v_conta and jsonb_typeof(a.config->'materiais')='array' and exists(select 1 from jsonb_array_elements(a.config->'materiais') x where x->>'id'=material::text);
 return jsonb_build_object('ok',true,'url',v_url);
end;$$;

revoke all on function public.lv_motor_materiais(uuid) from public,anon;
revoke all on function public.lv_motor_material_salvar(uuid,jsonb) from public,anon;
revoke all on function public.lv_motor_material_excluir(uuid,bigint) from public,anon;
grant execute on function public.lv_motor_materiais(uuid) to authenticated;
grant execute on function public.lv_motor_material_salvar(uuid,jsonb) to authenticated;
grant execute on function public.lv_motor_material_excluir(uuid,bigint) to authenticated;

-- As pastas das contas excluídas agora incluem os materiais.
create or replace function public.iag_arquivos_excluidos(limite int) returns table(bucket text,caminho text) language sql stable security definer set search_path='' as $$
 select o.bucket_id::text,o.name from storage.objects o
 join leadvox_private.contas_excluidas c on split_part(o.name,'/',1)=c.conta
 where o.bucket_id in('lv-estoque','lv-audio','lv-propostas','iag-arquivos','lv-materiais')
 order by o.created_at limit least(greatest(coalesce(limite,1),1),1000);
$$;
revoke all on function public.iag_arquivos_excluidos(int) from public,anon,authenticated;
grant execute on function public.iag_arquivos_excluidos(int) to service_role;

insert into leadvox_private.sql_aplicado(arquivo) values('materiais.sql') on conflict(arquivo) do nothing;
