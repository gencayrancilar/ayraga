-- =============================================================================
-- AYRA · 0023 · Tanıtım yazısı gönderimi
--
-- Kurumlara bir kez gönderilen tanıtım yazısı da gönderim kaydına yazılır.
-- Böylece "bu kuruma tanıtımı ne zaman gönderdik" sorusunun bir cevabı olur
-- ve yazı yanlışlıkla ikinci kez gitmez.
-- =============================================================================

alter table public.outbound_messages drop constraint if exists outbound_messages_kind_check;
alter table public.outbound_messages add constraint outbound_messages_kind_check
  check (kind in ('acil', 'haftalik', 'test', 'tanitim'));
