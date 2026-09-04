-- =============================================================================
-- AYRA · 0017 · Muhtar rolü için enum genişletmeleri
--
-- PostgreSQL, bir enum'a eklenen değerin AYNI işlem içinde kullanılmasına izin
-- vermez. Migration çalıştırıcımız her dosyayı tek bir işleme sarıyor; bu
-- yüzden yeni değerler burada tek başına eklenir, kullanımları 0018'de yapılır.
--
-- Muhtar neden ayrı bir rol:
--   Muhtar seçilmiş bir kamu görevlisidir, AYRA'nın moderatörü değildir.
--   Kendi mahallesini izler, resmî yanıt yazar, duyuru geçer; ama bir
--   bildirimin durumunu değiştiremez. Kaydın tarafsızlığı dernekte kalır.
-- =============================================================================

do $$ begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'user_role' and e.enumlabel = 'muhtar'
  ) then
    -- 'citizen' ile 'moderator' arasına: yetki sıralaması anlamlı kalsın.
    alter type public.user_role add value 'muhtar' after 'citizen';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'report_event_type' and e.enumlabel = 'official_reply'
  ) then
    alter type public.report_event_type add value 'official_reply' after 'authority_responded';
  end if;
end $$;
