-- LeadVox IA — respostas em áudio.
-- Pasta privada onde o motor (n8n, chave de serviço) guarda a voz gerada pela IA.
-- A LeadVox baixa o arquivo por um link assinado que vale 24 h; ninguém mais acessa.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lv-audio', 'lv-audio', false, 5242880, array['audio/ogg', 'audio/opus', 'audio/mpeg'])
on conflict (id) do nothing;
