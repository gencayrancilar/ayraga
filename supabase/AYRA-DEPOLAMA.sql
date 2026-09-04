-- ═══════════════════════════════════════════════════════════════════════════
-- AYRA · Görsel deposu (Supabase Storage)
--
-- AYRAga projesinde bu dosya zaten çalıştırıldı. Yeni bir Supabase projesi
-- kurarsanız AYRA-KURULUM.sql'den sonra bunu da SQL Editor'de çalıştırın.
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-media', 'report-media', true, 8388608,
        array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $q$
begin
  drop policy if exists "ayra report-media herkese acik okuma" on storage.objects;
  create policy "ayra report-media herkese acik okuma" on storage.objects
    for select using (bucket_id = 'report-media');

  drop policy if exists "ayra report-media uye yukleme" on storage.objects;
  create policy "ayra report-media uye yukleme" on storage.objects
    for insert to authenticated with check (bucket_id = 'report-media');
exception when insufficient_privilege then
  raise notice 'storage.objects politikaları kurulamadı; panelden elle eklenmeli.';
end $q$;

select id, public, file_size_limit from storage.buckets where id = 'report-media';
