-- Limpeza de arquivos antigos: o fluxo "LIMPEZA · Arquivos antigos" (n8n, chave de serviço) pergunta aqui o que já passou do prazo.
-- Só áudios e PDFs de convites e propostas, nunca as fotos do catálogo. O prazo nunca é menor que 90 dias.
-- Esta função só lista; quem apaga é a API de arquivos do Supabase.
-- Rodar depois de audio.sql e convite.sql.
create or replace function public.iag_arquivos_antigos(dias int,limite int) returns table(bucket text,caminho text) language sql stable security definer set search_path='' as $$
 select o.bucket_id::text,o.name from storage.objects o
 where o.bucket_id in('audios','lv-audio','lv-propostas') and o.created_at<now()-make_interval(days=>greatest(coalesce(dias,90),90))
 order by o.created_at limit least(greatest(coalesce(limite,1),1),1000);
$$;
revoke all on function public.iag_arquivos_antigos(int,int) from public,anon,authenticated;
grant execute on function public.iag_arquivos_antigos(int,int) to service_role;

insert into leadvox_private.sql_aplicado(arquivo) values('limpeza_arquivos.sql') on conflict(arquivo) do nothing;
