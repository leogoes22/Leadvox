-- Onde cada agente atende: o departamento (fila) da LeadVox e se ele é a porta de entrada.
-- O motor só responde num ticket se houver agente no departamento dele (sem departamento: a porta de entrada).
-- Usa a função do próprio motor (iag__definir_lugar), conferindo que quem chama é dono ou admin da empresa.
-- Rodar depois de motor_link.sql.
create or replace function public.lv_motor_lugar(org uuid,agente text,departamento integer,entrada boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_conta text;
begin
 v_conta:=leadvox_private.motor_conta(org,true);
 if v_conta is null or not exists(select 1 from public.iag_agente where chave=agente and conta=v_conta and not arquivado) then raise exception 'forbidden'; end if;
 if departamento is not null and departamento<=0 then raise exception 'invalid'; end if;
 return public.iag__definir_lugar(agente,departamento,coalesce(entrada,false));
end;$$;
revoke all on function public.lv_motor_lugar(uuid,text,integer,boolean) from public,anon;
grant execute on function public.lv_motor_lugar(uuid,text,integer,boolean) to authenticated;
