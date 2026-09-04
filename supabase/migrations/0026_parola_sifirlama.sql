-- =============================================================================
-- AYRA · 0026 · Parola sıfırlama
--
-- Bugüne kadar parolasını unutan kullanıcı hesabına bir daha giremiyordu.
-- Muhtarlar da artık herkesin kullandığı hesapla girdiği için bu, kişiyi
-- platformdan tamamen koparan bir eksikti.
--
-- Tasarım notları:
--   · Bağlantıdaki jeton veritabanında saklanmaz; yalnızca SHA-256 özeti
--     tutulur. Veritabanını okuyan biri kimsenin parolasını sıfırlayamaz.
--   · Jeton tek kullanımlıktır ve bir saatte düşer.
--   · Yeni istek, o kullanıcının bekleyen bütün jetonlarını geçersiz kılar.
--   · Tablo yalnızca sistem rolüne açıktır; hiçbir kullanıcı politikası yok.
-- =============================================================================

create table if not exists public.password_resets (
  token_hash  text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);

create index if not exists idx_password_resets_user
  on public.password_resets(user_id) where used_at is null;

alter table public.password_resets enable row level security;
-- Bilerek hiçbir policy tanımlanmıyor: bu tabloya yalnızca sunucu erişir.

/** Süresi dolmuş ya da kullanılmış kayıtları temizler. */
create or replace function public.parola_jetonlarini_temizle()
returns integer language sql volatile set search_path = public as $$
  with silinen as (
    delete from public.password_resets
     where expires_at < now() - interval '7 days'
        or (used_at is not null and used_at < now() - interval '7 days')
    returning 1
  )
  select count(*)::int from silinen
$$;
