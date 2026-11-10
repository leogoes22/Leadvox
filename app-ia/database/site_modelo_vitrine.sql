-- Site da loja: 6º modelo (Vitrine, estoque em lista). Só amplia a lista de modelos aceitos; rodar depois de site_modelos.sql.
create or replace function leadvox_private.site_modelos() returns text[] language sql immutable set search_path='' as $$
 select array['garagem','premium','neon','claro','editorial','vitrine'];
$$;
revoke all on function leadvox_private.site_modelos() from public,anon,authenticated;
insert into leadvox_private.sql_aplicado(arquivo) values('site_modelo_vitrine.sql') on conflict(arquivo) do nothing;
