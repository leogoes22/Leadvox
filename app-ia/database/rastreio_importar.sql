-- Rastreamento de anúncios: importar o histórico (últimos 30 dias) dos atendimentos da LeadVox.
-- O painel lê as conversas com o token da conexão e manda só os leads que vieram de anúncio, com a data da primeira mensagem.
-- Não sobrescreve lead que já existe (o primeiro anúncio de cada contato é o que vale). Rodar depois de rastreio.sql.
create or replace function public.lv_rastreio_importar(org uuid,leads jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare l jsonb; n int:=0; v_quando timestamptz;
begin
 if not exists(select 1 from public.lv_memberships where organization_id=org and user_id=auth.uid() and role in('owner','admin')) then raise exception 'forbidden'; end if;
 if not exists(select 1 from leadvox_private.rastreio_config where organization_id=org and liberado) then raise exception 'nao_liberado'; end if;
 if jsonb_typeof(leads)<>'array' or jsonb_array_length(leads)>500 then raise exception 'invalid'; end if;
 for l in select * from jsonb_array_elements(leads) loop
  if jsonb_typeof(l)<>'object' or coalesce(l->>'contato','')!~'^[0-9]{1,15}$' then continue; end if;
  v_quando:=case when coalesce(l->>'quando','')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then (l->>'quando')::timestamptz end;
  if v_quando is null or v_quando>now()+interval '1 hour' or v_quando<now()-interval '120 days' then v_quando:=now(); end if;
  insert into leadvox_private.rastreio_leads(organization_id,contato_id,telefone_hash,final,nome,anuncio_id,titulo,link,ctwa_clid,midia,criado_em,ultima_em)
  values(org,(l->>'contato')::bigint,
   case when coalesce(l->>'hash','')~'^[0-9a-f]{64}$' then l->>'hash' end,
   case when coalesce(l->>'final','')~'^[0-9]{1,4}$' then l->>'final' end,
   nullif(left(coalesce(l->>'nome',''),80),''),
   case when coalesce(l->>'anuncio','')~'^[0-9]{1,30}$' then l->>'anuncio' end,
   nullif(left(coalesce(l->>'titulo',''),120),''),
   case when coalesce(l->>'link','') like 'https://%' then left(l->>'link',300) end,
   nullif(left(coalesce(l->>'clid',''),500),''),
   nullif(left(coalesce(l->>'midia',''),20),''),
   v_quando,v_quando)
  on conflict(organization_id,contato_id) do nothing;
  if found then n:=n+1; end if;
 end loop;
 return jsonb_build_object('ok',true,'gravados',n);
end;$$;
revoke all on function public.lv_rastreio_importar(uuid,jsonb) from public,anon;
grant execute on function public.lv_rastreio_importar(uuid,jsonb) to authenticated;

insert into leadvox_private.sql_aplicado(arquivo) values('rastreio_importar.sql') on conflict(arquivo) do nothing;
