-- Motor do painel no n8n novo (n8n.leadvox.com.br): nenhum segredo fica escrito no n8n.
-- Os endereços que a LeadVox chama (k = conta, t = chave dos eventos) são conferidos aqui, como a chave do plugin
-- (iag_plugin_confere, em oportunidade.sql). Conta nova ganha chaves aleatórias. Rodar depois de saude.sql.
create or replace function public.iag_eventos_confere(p_conta text, p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from leadvox_private.motor_contas m
    where m.conta = p_conta and m.token_eventos is not null and m.token_eventos = p_token
  );
$$;

-- n8n (service_role), a cada 2 min no fluxo "Endereço e eventos": dá chave de eventos e de plugin a quem ainda não tem.
create or replace function public.lv_motor_tokens_novos() returns jsonb
language sql volatile security definer set search_path = '' as $$
  with novas as (
    update leadvox_private.motor_contas m set
      token_eventos = coalesce(m.token_eventos, left(replace(gen_random_uuid()::text, '-', ''), 24)),
      token_plugin = coalesce(m.token_plugin, left(replace(gen_random_uuid()::text, '-', ''), 24))
    where m.token_eventos is null or m.token_plugin is null
    returning 1
  )
  select jsonb_build_object('ok', true, 'novas', count(*)) from novas;
$$;

revoke all on function public.iag_eventos_confere(text, text) from public, anon, authenticated;
revoke all on function public.lv_motor_tokens_novos() from public, anon, authenticated;
grant execute on function public.iag_eventos_confere(text, text) to service_role;
grant execute on function public.lv_motor_tokens_novos() to service_role;
