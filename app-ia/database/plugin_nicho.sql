-- Plugin do Vendedor por segmento: a identidade da loja (convite.sql) passa a dizer também o segmento escolhido no cadastro
-- (automotivo, varejo, saude…), para o plugin mostrar Estoque + Convite ou Produtos/Serviços + Proposta.
-- Só o n8n (service_role) usa. Rodar depois de convite.sql.
create or replace function public.iag_loja_identidade(p_conta text) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(w.settings->'loja','{}'::jsonb)
  || jsonb_build_object('nomePainel',coalesce(nullif(w.settings->>'displayName',''),o.name),'whatsappPainel',coalesce(w.settings->>'whatsapp',''),
     'nicho',coalesce(nullif(w.settings->>'niche',''),'outro'))
 from leadvox_private.motor_contas m
 join public.lv_organizations o on o.id=m.organization_id
 left join public.lv_workspace w on w.organization_id=m.organization_id
 where m.conta=p_conta;
$$;
revoke all on function public.iag_loja_identidade(text) from public,anon,authenticated;
grant execute on function public.iag_loja_identidade(text) to service_role;
