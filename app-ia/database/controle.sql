-- Registro de quais arquivos desta pasta já rodaram no banco.
-- Na primeira vez, confere cada arquivo pelo que ele cria (tabela, função, coluna ou pasta) e anota os que já estão no banco.
-- Pode rodar de novo quando quiser: só anota, não muda mais nada.
-- Daqui para a frente, todo arquivo novo termina com:
--   insert into leadvox_private.sql_aplicado(arquivo) values('nome.sql') on conflict(arquivo) do nothing;
create schema if not exists leadvox_private;
create table if not exists leadvox_private.sql_aplicado(
 arquivo text primary key check (arquivo ~ '^[a-z0-9_]+\.sql$'),
 aplicado_em timestamptz not null default now(),
 como text not null default 'registrado' check (como in ('registrado','conferido'))
);
alter table leadvox_private.sql_aplicado enable row level security;
revoke all on leadvox_private.sql_aplicado from public,anon,authenticated;

do $$
declare r record;
begin
 for r in select * from (values
  ('organizations.sql',  to_regclass('public.lv_organizations') is not null),
  ('billing.sql',        to_regclass('public.lv_billing_contracts') is not null),
  ('integrations.sql',   to_regclass('leadvox_private.integrations') is not null),
  ('chat_credentials.sql', to_regclass('leadvox_private.chat_credentials') is not null),
  ('platform_admin.sql', to_regclass('leadvox_private.platform_admins') is not null),
  ('motor_link.sql',     to_regclass('leadvox_private.motor_contas') is not null),
  ('estoque.sql',        to_regproc('public.lv_motor_item_salvar') is not null),
  ('estoque_fotos.sql',  to_regproc('public.lv_motor_pasta_estoque') is not null),
  ('relatorio.sql',      to_regclass('public.iag_relatorio') is not null),
  ('eventos.sql',        to_regproc('public.lv_motor_contas_painel') is not null),
  ('lugar.sql',          to_regproc('public.lv_motor_lugar') is not null),
  ('plugin.sql',         exists(select 1 from information_schema.columns where table_schema='leadvox_private' and table_name='motor_contas' and column_name='token_plugin')),
  ('saude.sql',          exists(select 1 from information_schema.columns where table_schema='leadvox_private' and table_name='motor_contas' and column_name='ultimo_envio')),
  ('audio.sql',          exists(select 1 from storage.buckets where id='lv-audio')),
  ('elevenlabs.sql',     to_regproc('public.iag_voz_elevenlabs') is not null),
  ('convite.sql',        exists(select 1 from storage.buckets where id='lv-propostas')),
  ('plugin_nicho.sql',   to_regproc('public.iag_loja_identidade') is not null and pg_get_functiondef(to_regproc('public.iag_loja_identidade')) like '%nicho%'),
  ('oportunidade.sql',   to_regproc('public.iag_plugin_confere') is not null),
  ('motor_novo.sql',     to_regproc('public.lv_motor_tokens_novos') is not null),
  ('openai.sql',         to_regclass('leadvox_private.openai_keys') is not null),
  ('assinaturas.sql',    to_regclass('leadvox_private.saas_assinaturas') is not null),
  ('admin_robos.sql',    to_regproc('public.lv_admin_robos') is not null)
 ) as t(arquivo, ja_rodou) loop
  if r.ja_rodou then
   insert into leadvox_private.sql_aplicado(arquivo, como) values (r.arquivo, 'conferido') on conflict (arquivo) do nothing;
  end if;
 end loop;
end $$;

insert into leadvox_private.sql_aplicado(arquivo) values('controle.sql') on conflict(arquivo) do nothing;

-- O que já rodou (o que não aparecer aqui ainda não rodou):
select arquivo, como, aplicado_em from leadvox_private.sql_aplicado order by aplicado_em, arquivo;
