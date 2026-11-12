-- Plugin do Usuário (n8n novo): de onde veio o lead deste atendimento, para mostrar no plugin.
-- Só o título do anúncio e a mídia que o rastreamento já guardou (rastreio_leads); confere a chave do plugin (k, t)
-- como o iag_plugin_confere. Não devolve telefone, link nem identificadores do anúncio. Rodar depois de rastreio.sql.
create or replace function public.iag_plugin_origem(p_conta text, p_token text, p_contato bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('titulo', l.titulo, 'midia', l.midia, 'em', l.criado_em)
  from leadvox_private.motor_contas m
  join leadvox_private.rastreio_leads l on l.organization_id = m.organization_id
  where m.conta = p_conta and m.token_plugin is not null and m.token_plugin = p_token
    and l.contato_id = p_contato and coalesce(l.titulo, '') <> ''
  order by l.ultima_em desc
  limit 1;
$$;
revoke all on function public.iag_plugin_origem(text, text, bigint) from public, anon, authenticated;
grant execute on function public.iag_plugin_origem(text, text, bigint) to service_role;

insert into leadvox_private.sql_aplicado(arquivo) values('plugin_origem.sql') on conflict(arquivo) do nothing;
