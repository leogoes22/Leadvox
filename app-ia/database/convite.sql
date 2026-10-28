-- Convite para test drive em PDF (plugin do vendedor → aba Proposta).
-- 1) O n8n lê a identidade da loja que o dono salvou no painel (Minha conta → Identidade da loja).
-- 2) Os PDFs ficam numa pasta pública própria (só PDF, até 5 MB), com nome aleatório por convite: lv-propostas/<conta>/<arquivo>.pdf
-- Só o n8n (service_role) usa os dois. Rodar depois de motor_link.sql.
create or replace function public.iag_loja_identidade(p_conta text) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(w.settings->'loja','{}'::jsonb)
  || jsonb_build_object('nomePainel',coalesce(nullif(w.settings->>'displayName',''),o.name),'whatsappPainel',coalesce(w.settings->>'whatsapp',''))
 from leadvox_private.motor_contas m
 join public.lv_organizations o on o.id=m.organization_id
 left join public.lv_workspace w on w.organization_id=m.organization_id
 where m.conta=p_conta;
$$;
revoke all on function public.iag_loja_identidade(text) from public,anon,authenticated;
grant execute on function public.iag_loja_identidade(text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('lv-propostas','lv-propostas',true,5242880,array['application/pdf'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
