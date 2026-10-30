-- Run after openai.sql. All fake keys, grants and usage are rolled back.
begin;
do $$
declare org uuid; uid uuid; conta text; ag text; grant_data jsonb; reserved jsonb; rec jsonb; rejected boolean:=false;
begin
 select m.organization_id,o.owner_id,m.conta,a.chave into org,uid,conta,ag
 from leadvox_private.motor_contas m join public.lv_organizations o on o.id=m.organization_id
 join public.iag_agente a on a.conta=m.conta and not a.arquivado
 join public.iag_conta c on c.chave=m.conta and not c.bloqueado limit 1;
 if org is null then raise exception 'no_fixture'; end if;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 perform public.lv_set_openai(org,'sk-proj-TEST_ONLY_NOT_VALID_'||repeat('x',24));
 if not (public.lv_openai_status(org)->>'connected')::boolean then raise exception 'status'; end if;
 grant_data:=public.iag_openai_grant(conta,ag,true);
 if not (grant_data->>'ok')::boolean then raise exception 'grant'; end if;
 if (public.iag_openai_grant(conta,'foreign-agent',false)->>'ok')::boolean then raise exception 'foreign_agent'; end if;
 reserved:=public.iag_openai_reserve(grant_data->>'token','chat/completions','gpt-4.1-mini');
 if reserved->>'key' not like 'sk-proj-TEST_ONLY%' then raise exception 'reserve'; end if;
 perform public.iag_openai_finish((reserved->>'id')::uuid,'{"status":200,"input":100,"cached":20,"output":10,"usd":0.00005,"pricing":"test"}'::jsonb);
 -- Retrying completion must not overwrite or double-count.
 perform public.iag_openai_finish((reserved->>'id')::uuid,'{"status":500}'::jsonb);
 rec:=public.lv_openai_usage(org,current_date,current_date);
 if jsonb_array_length(rec->'rows')<1 then raise exception 'usage'; end if;
 if exists(select 1 from leadvox_private.openai_usage where id=(reserved->>'id')::uuid and status<>200) then raise exception 'idempotency'; end if;
 perform public.lv_set_openai(org,'sk-proj-TEST_ONLY_ROTATED_'||repeat('y',24));
 if public.iag_openai_reserve(grant_data->>'token','chat/completions','gpt-4.1-mini') is not null then raise exception 'rotation'; end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin perform public.lv_openai_usage(org,current_date,current_date); exception when others then rejected:=true; end;
 if not rejected then raise exception 'foreign_org_allowed'; end if;
 if has_function_privilege('authenticated','public.iag_openai_reserve(text,text,text)','EXECUTE')
 or has_function_privilege('anon','public.iag_openai_grant(text,text,boolean)','EXECUTE') then raise exception 'permission'; end if;
end $$;
rollback;
