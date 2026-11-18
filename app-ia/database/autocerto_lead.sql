-- Lead no AutoCerto pelo Motor IA (17/11/2026): quando a loja liga "Enviar o lead para o AutoCerto" (Comportamento → Avisos),
-- o motor grava o lead no AutoCerto na passagem para a equipe, com o mesmo usuário da API que o estoque já usa.
-- Só service_role (n8n): devolve a senha. Rodar depois de integrations.sql e estoque.sql.
create or replace function public.lv_motor_autocerto(p_conta text) returns table(unidade text,usuario text,secret text) language sql stable security definer set search_path='' as $$
 select i.settings->>'unidade',i.settings->>'usuario',s.decrypted_secret
 from leadvox_private.integrations i join leadvox_private.motor_contas m on m.organization_id=i.organization_id
 left join vault.decrypted_secrets s on s.id=i.secret_id
 where m.conta=p_conta and i.provider='estoque' and i.settings->>'source'='autocerto'
 limit 1;
$$;

revoke all on function public.lv_motor_autocerto(text) from public,anon,authenticated;
grant execute on function public.lv_motor_autocerto(text) to service_role;

insert into leadvox_private.sql_aplicado(arquivo) values('autocerto_lead.sql') on conflict(arquivo) do nothing;
