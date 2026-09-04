-- =============================================================================
-- AYRA · 0016 · Önceki sistemden aktarılan kayıtların künyesi
--
-- Genç Ayrancılar Derneği'nin Replit üzerinde tuttuğu sorun haritasındaki
-- kayıtlar AYRA'ya taşınıyor. Taşınan her kaydın kaynağını ve özgün numarasını
-- burada tutuyoruz ki:
--   1) aktarım scripti iki kez çalıştırılırsa kayıtlar ikizlenmesin,
--   2) "bu bildirim nereden geldi" sorusunun cevabı veride dursun; sadece
--      açıklama metnine yazılmış bir cümle olarak kalmasın.
--
-- Bu tablo kamuya açık okunur: bildirimin künyesi de bildirimin kendisi kadar
-- şeffaf olmalı. Yazma yetkisi yalnızca moderatör/yöneticide.
-- =============================================================================

create table if not exists public.legacy_reports (
  source_system text        not null,             -- 'gencayrancilar-replit'
  source_no     integer     not null,             -- özgün sistemdeki kayıt no
  report_id     uuid        not null references public.reports(id) on delete cascade,
  source_date   date,                             -- özgün kayıt tarihi (bilinmiyorsa null)
  source_note   text,                             -- ör. tarih okunamadı, başlık uzatıldı
  imported_at   timestamptz not null default now(),
  primary key (source_system, source_no)
);

create index if not exists idx_legacy_reports_report on public.legacy_reports(report_id);

alter table public.legacy_reports enable row level security;

drop policy if exists legacy_reports_read on public.legacy_reports;
create policy legacy_reports_read on public.legacy_reports
  for select using (true);

drop policy if exists legacy_reports_write on public.legacy_reports;
create policy legacy_reports_write on public.legacy_reports
  for all to authenticated
  using (public.is_moderator()) with check (public.is_moderator());
