-- Fotos do estoque enviadas pelo painel (celular ou computador). Pasta pública para o WhatsApp abrir a foto;
-- cada empresa só grava dentro da pasta da própria conta do motor: lv-estoque/<conta>/<arquivo>.
-- Rodar depois de estoque.sql.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('lv-estoque','lv-estoque',true,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Quem envia precisa ser dono ou admin da empresa ligada à conta da pasta.
create or replace function public.lv_motor_pasta_estoque(nome text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from leadvox_private.motor_contas m join public.lv_memberships x on x.organization_id=m.organization_id
  where m.conta=split_part(nome,'/',1) and x.user_id=(select auth.uid()) and x.role in('owner','admin'));
$$;
revoke all on function public.lv_motor_pasta_estoque(text) from public,anon;
grant execute on function public.lv_motor_pasta_estoque(text) to authenticated;

drop policy if exists "lv_estoque_envia" on storage.objects;
create policy "lv_estoque_envia" on storage.objects for insert to authenticated
 with check(bucket_id='lv-estoque' and public.lv_motor_pasta_estoque(name));
