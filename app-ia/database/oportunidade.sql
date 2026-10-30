-- Oportunidade da proposta: o módulo do n8n novo confere a chave do Plugin do Vendedor (k = conta, t = chave do plugin)
-- antes de mexer no funil da LeadVox. Só devolve verdadeiro/falso; a chave não sai do banco.
create or replace function public.iag_plugin_confere(p_conta text, p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from leadvox_private.motor_contas m
    where m.conta = p_conta and m.token_plugin is not null and m.token_plugin = p_token
  );
$$;
revoke all on function public.iag_plugin_confere(text, text) from public, anon, authenticated;
grant execute on function public.iag_plugin_confere(text, text) to service_role;
