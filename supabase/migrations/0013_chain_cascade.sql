-- =============================================================================
-- AYRA · 0013 · Kanıt zinciri silme davranışı
--
-- Sorun: report_events tablosundaki değiştirilemezlik tetikleyicisi DELETE'i
-- koşulsuz engelliyordu. Bu, bir bildirimin tümden silinmesini de imkânsız
-- kılıyordu — oysa KVKK kapsamında bir kaydın silinmesi talep edilebilir ve
-- yönetim panelinden mükerrer/hatalı kayıtların temizlenmesi gerekebilir.
--
-- Çözüm: Zincir hâlâ değiştirilemez. Tek istisna, bildirimin kendisinin
-- silinmesidir: bu durumda üst kayıt artık mevcut olmadığı için zincir de
-- birlikte gider. Zincirden tek bir halkayı çekip almak hâlâ imkânsızdır.
-- =============================================================================

create or replace function public.block_event_mutation()
returns trigger language plpgsql as $$
begin
  -- Bildirimin kendisi silinirken (ON DELETE CASCADE) üst kayıt artık yoktur;
  -- yalnızca bu durumda zincirin de silinmesine izin verilir.
  if tg_op = 'DELETE'
     and not exists (select 1 from public.reports r where r.id = old.report_id) then
    return old;
  end if;

  raise exception
    'report_events append-only bir tablodur; kayıtlar değiştirilemez ve tek tek silinemez.';
end $$;

comment on function public.block_event_mutation() is
  'Kanıt zincirini korur: UPDATE her zaman, DELETE ise yalnızca üst bildirim silinmediyse engellenir.';
