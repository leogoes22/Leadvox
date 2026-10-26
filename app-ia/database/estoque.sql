-- Estoque do agente: os veículos ficam no catálogo do Motor IA (public.iag_item, uma lista por conta).
-- Estoque LeadVox = cadastro pelo painel (código vazio). AutoCerto / Revenda Mais = cópia automática,
-- com o código marcado pela fonte ('ac:123', 'rm:abc'); a cópia nunca mexe nos itens cadastrados à mão.
-- Rodar depois de motor_link.sql e integrations.sql. Não altera contas antigas do motor.

-- Grava a lista vinda de uma fonte externa: atualiza o que já existe, cria o novo e apaga o que saiu do estoque.
create or replace function leadvox_private.estoque_sincronizar(v_conta text,fonte text,itens jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare pre text; it jsonb; cod text; n_novos int:=0; n_atual int:=0; n_fora int; codigos text[]:='{}';
begin
 pre:=case fonte when 'autocerto' then 'ac:' when 'revendamais' then 'rm:' end;
 if pre is null or jsonb_typeof(itens)<>'array' or jsonb_array_length(itens)>2000 then raise exception 'invalid'; end if;
 for it in select * from jsonb_array_elements(itens) loop
  cod:=pre||left(coalesce(it->>'codigo',''),36);
  if cod=pre or left(trim(coalesce(it->>'nome','')),160)='' or cod=any(codigos) then continue; end if;
  codigos:=codigos||cod;
  update public.iag_item set categoria=left(coalesce(it->>'categoria',''),80), nome=left(trim(it->>'nome'),160), descricao=left(coalesce(it->>'descricao',''),4000),
   preco=nullif(it->>'preco','')::numeric, preco_tipo=case when nullif(it->>'preco','')::numeric>0 then 'fixo' else 'consulta' end,
   atributos=coalesce(it->'atributos','{}'::jsonb), fotos=coalesce(it->'fotos','[]'::jsonb), status='disponivel', atualizado_em=now()
  where conta=v_conta and codigo=cod;
  if found then n_atual:=n_atual+1;
  else
   insert into public.iag_item(conta,categoria,nome,descricao,preco,preco_tipo,atributos,fotos,status,codigo)
   values(v_conta,left(coalesce(it->>'categoria',''),80),left(trim(it->>'nome'),160),left(coalesce(it->>'descricao',''),4000),
    nullif(it->>'preco','')::numeric,case when nullif(it->>'preco','')::numeric>0 then 'fixo' else 'consulta' end,
    coalesce(it->'atributos','{}'::jsonb),coalesce(it->'fotos','[]'::jsonb),'disponivel',cod);
   n_novos:=n_novos+1;
  end if;
 end loop;
 delete from public.iag_item where conta=v_conta and codigo like pre||'%' and not (codigo=any(codigos));
 get diagnostics n_fora=row_count;
 return jsonb_build_object('ok',true,'novos',n_novos,'atualizados',n_atual,'removidos',n_fora,'total',cardinality(codigos));
end;$$;
revoke all on function leadvox_private.estoque_sincronizar(text,text,jsonb) from public,anon,authenticated;

-- Painel: lista os veículos da empresa (qualquer membro).
create or replace function public.lv_motor_itens(org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_conta text;
begin
 v_conta:=leadvox_private.motor_conta(org,false);
 if v_conta is null then return jsonb_build_object('vinculado',false); end if;
 return jsonb_build_object('vinculado',true,'itens',coalesce((select jsonb_agg(to_jsonb(i)-'conta' order by i.destaque desc,i.ordem,i.nome) from public.iag_item i where i.conta=v_conta),'[]'::jsonb));
end;$$;

-- Painel: cadastra ou edita um veículo do Estoque LeadVox (dono ou admin). Itens copiados de outra fonte não se editam aqui.
create or replace function public.lv_motor_item_salvar(org uuid,item jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_conta text; v_id bigint:=nullif(item->>'id','')::bigint; v_nome text:=left(trim(coalesce(item->>'nome','')),160);
begin
 v_conta:=leadvox_private.motor_conta(org,true);
 if v_conta is null then raise exception 'forbidden'; end if;
 if jsonb_typeof(item)<>'object' or octet_length(item::text)>20000 then return jsonb_build_object('ok',false,'erro','item'); end if;
 if v_nome='' then return jsonb_build_object('ok',false,'erro','nome'); end if;
 if v_id is null then
  if (select count(*) from public.iag_item where conta=v_conta)>=2000 then return jsonb_build_object('ok',false,'erro','limite_itens'); end if;
  insert into public.iag_item(conta,categoria,nome,descricao,preco,preco_tipo,atributos,fotos,status,codigo)
  values(v_conta,left(coalesce(item->>'categoria',''),80),v_nome,left(coalesce(item->>'descricao',''),4000),nullif(item->>'preco','')::numeric,
   case when nullif(item->>'preco','')::numeric>0 then 'fixo' else 'consulta' end,coalesce(item->'atributos','{}'::jsonb),coalesce(item->'fotos','[]'::jsonb),
   case when item->>'status' in('disponivel','reservado','indisponivel') then item->>'status' else 'disponivel' end,'')
  returning id into v_id;
 else
  update public.iag_item set categoria=left(coalesce(item->>'categoria',''),80),nome=v_nome,descricao=left(coalesce(item->>'descricao',''),4000),
   preco=nullif(item->>'preco','')::numeric,preco_tipo=case when nullif(item->>'preco','')::numeric>0 then 'fixo' else 'consulta' end,
   atributos=coalesce(item->'atributos','{}'::jsonb),fotos=coalesce(item->'fotos','[]'::jsonb),
   status=case when item->>'status' in('disponivel','reservado','indisponivel') then item->>'status' else status end,atualizado_em=now()
  where id=v_id and conta=v_conta and coalesce(codigo,'') not like 'ac:%' and coalesce(codigo,'') not like 'rm:%';
  if not found then return jsonb_build_object('ok',false,'erro','item'); end if;
 end if;
 return jsonb_build_object('ok',true,'id',v_id);
end;$$;

create or replace function public.lv_motor_item_excluir(org uuid,item_id bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_conta text;
begin
 v_conta:=leadvox_private.motor_conta(org,true);
 if v_conta is null then raise exception 'forbidden'; end if;
 delete from public.iag_item where id=item_id and conta=v_conta and coalesce(codigo,'') not like 'ac:%' and coalesce(codigo,'') not like 'rm:%';
 return jsonb_build_object('ok',found);
end;$$;

-- Painel ("Atualizar agora"): o servidor busca o estoque na fonte e grava aqui (dono ou admin).
create or replace function public.lv_motor_estoque_importar(org uuid,fonte text,itens jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_conta text;
begin
 v_conta:=leadvox_private.motor_conta(org,true);
 if v_conta is null then raise exception 'forbidden'; end if;
 return leadvox_private.estoque_sincronizar(v_conta,fonte,itens);
end;$$;

-- n8n (service_role): de onde vem o estoque de cada conta ligada ao painel. Devolve o segredo: só service_role.
create or replace function public.lv_motor_estoque_fontes() returns table(conta text,fonte text,settings jsonb,secret text) language sql stable security definer set search_path='' as $$
 select m.conta,i.settings->>'source',i.settings,s.decrypted_secret
 from leadvox_private.integrations i join leadvox_private.motor_contas m on m.organization_id=i.organization_id
 left join vault.decrypted_secrets s on s.id=i.secret_id
 where i.provider='estoque' and i.settings->>'source' in('autocerto','revendamais');
$$;
create or replace function public.lv_motor_estoque_sincronizar(conta text,fonte text,itens jsonb) returns jsonb language sql security definer set search_path='' as $$
 select leadvox_private.estoque_sincronizar(conta,fonte,itens);
$$;

revoke all on function public.lv_motor_itens(uuid) from public,anon;
revoke all on function public.lv_motor_item_salvar(uuid,jsonb) from public,anon;
revoke all on function public.lv_motor_item_excluir(uuid,bigint) from public,anon;
revoke all on function public.lv_motor_estoque_importar(uuid,text,jsonb) from public,anon;
revoke all on function public.lv_motor_estoque_fontes() from public,anon,authenticated;
revoke all on function public.lv_motor_estoque_sincronizar(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.lv_motor_itens(uuid) to authenticated;
grant execute on function public.lv_motor_item_salvar(uuid,jsonb) to authenticated;
grant execute on function public.lv_motor_item_excluir(uuid,bigint) to authenticated;
grant execute on function public.lv_motor_estoque_importar(uuid,text,jsonb) to authenticated;
grant execute on function public.lv_motor_estoque_fontes() to service_role;
grant execute on function public.lv_motor_estoque_sincronizar(text,text,jsonb) to service_role;
