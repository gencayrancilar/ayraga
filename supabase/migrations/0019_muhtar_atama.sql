-- =============================================================================
-- AYRA · 0019 · Muhtar atamasını moderasyona açar
--
-- Önceki düzen: muhtar hesabını yalnızca yönetici açardı ve hesap dernek
-- tarafından oluşturulurdu. Uygulamada bu iki sorun çıkardı:
--   1. Ayrı bir giriş yolu, bakımı ve hata ayıklaması gereken ikinci bir
--      kapı demekti; muhtar sıradan bir kullanıcı gibi giremiyordu.
--   2. Hesabı derneğin açması, parolayı derneğin taşıması anlamına geliyordu.
--
-- Yeni düzen: muhtar herkes gibi ayraga.com'dan kendi hesabını açar,
-- moderasyon o hesabı mahallenin muhtarı olarak işaretler. Yetki hesabın
-- kendisinde değil, atamada durur; atama kalkınca yetki de kalkar.
-- =============================================================================

drop policy if exists officials_admin_write on public.neighborhood_officials;

drop policy if exists officials_moderator_write on public.neighborhood_officials;
create policy officials_moderator_write on public.neighborhood_officials
  for all to authenticated
  using (public.is_moderator()) with check (public.is_moderator());
