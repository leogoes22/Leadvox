-- Novo cliente pelo Painel LeadVox (17/11/2026): o Super Admin cria a empresa e o login do dono, sem o cliente se cadastrar.
-- O login é criado pela função "usuarios" (a única com a chave de serviço); aqui o banco cria a empresa com o cliente como
-- dono principal (owner_id) e registra quem fez. O cliente cria a senha pelo código que chega no e-mail e aceita os termos
-- no primeiro acesso. Rodar depois de organizations.sql, platform_admin.sql e usuarios.sql.

-- O dono da empresa nova continua sendo quem cria (cadastro normal) ou, quando é o Super Admin, o cliente indicado.
create or replace function leadvox_private.add_owner() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or (new.owner_id<>auth.uid() and not public.lv_is_platform_admin()) then raise exception 'Unauthorized'; end if;
 insert into public.lv_memberships(organization_id,user_id,role) values(new.id,new.owner_id,'owner');
 return new;
end;$$;
revoke all on function leadvox_private.add_owner() from public,anon,authenticated;

create or replace function public.lv_admin_cliente_criar(nome text,p_email text,dias int default 7) returns jsonb language plpgsql security definer set search_path='' as $$
declare e text:=leadvox_private.usuarios_email(p_email); n text:=btrim(coalesce(nome,'')); u auth.users; ja record; org uuid;
begin
 if not public.lv_is_platform_admin() then raise exception 'forbidden'; end if;
 if char_length(n) not between 2 and 100 then return jsonb_build_object('ok',false,'erro','nome'); end if;
 if e is null then return jsonb_build_object('ok',false,'erro','email'); end if;
 if dias is null or dias<1 or dias>90 then return jsonb_build_object('ok',false,'erro','dias'); end if;
 select * into u from auth.users x where lower(x.email)=e order by x.created_at limit 1;
 if u.id is null then return jsonb_build_object('ok',false,'erro','sem_login'); end if;
 if exists(select 1 from leadvox_private.platform_admins p where p.user_id=u.id) then return jsonb_build_object('ok',false,'erro','plataforma'); end if;
 select o.id,o.name into ja from public.lv_organizations o where o.owner_id=u.id limit 1;
 if ja.id is not null then return jsonb_build_object('ok',false,'erro','ja_tem_empresa','empresa',ja.name); end if;
 insert into public.lv_organizations(owner_id,name,trial_ends_at) values(u.id,n,now()+make_interval(days=>dias)) returning id into org;
 perform leadvox_private.usuarios_registrar(org,'plataforma','criar-cliente',u.id,jsonb_build_object('email',e,'nome',n,'dias',dias,
  'novoLogin',u.last_sign_in_at is null and u.created_at>now()-interval '10 minutes'));
 return jsonb_build_object('ok',true,'id',org,'nome',n,'email',e);
end;$$;

revoke all on function public.lv_admin_cliente_criar(text,text,int) from public,anon;
grant execute on function public.lv_admin_cliente_criar(text,text,int) to authenticated;

insert into leadvox_private.sql_aplicado(arquivo) values('cliente_novo.sql') on conflict(arquivo) do nothing;
