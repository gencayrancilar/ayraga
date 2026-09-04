-- =============================================================================
-- AYRA · Muhtar alanı — veritabanı kurulumu
--
-- Normal yol: projede `npm run db:migrate`.
-- Bu dosya yedek yoldur: Supabase → SQL Editor'da tek seferde çalıştırılır.
-- İki migration'ı (0017 ve 0018) ve migration defteri kaydını içerir.
-- Tekrar çalıştırmak güvenlidir; her adım "varsa atla" mantığıyla yazılmıştır.
-- =============================================================================

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

-- =============================================================================
-- AYRA · 0018 · Muhtar alanı
--
-- Üç yeni kavram:
--   1. neighborhood_officials — hangi hesabın hangi mahallenin muhtarı olduğu
--   2. announcements          — muhtarın mahalle duyuruları
--   3. official_replies       — muhtarın bir bildirime yazdığı resmî yanıt
--
-- Yetki sınırı bilinçli: muhtar bildirimin DURUMUNU değiştiremez. "Çözüldü"
-- kararı, sorunu bildiren tarafın değil, kaydı tutan derneğin işidir; aksi
-- hâlde AYRA'nın tarafsız kayıt iddiası zedelenir. Muhtar ne yaptığını
-- yazar, kayıt onu olduğu gibi taşır.
-- =============================================================================

-- ── Muhtar ataması ──────────────────────────────────────────────────────────
create table if not exists public.neighborhood_officials (
  id              uuid primary key default gen_random_uuid(),
  neighborhood_id uuid not null references public.neighborhoods(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  title           text not null default 'Mahalle Muhtarı',
  term_start      date,
  term_end        date,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (neighborhood_id, profile_id)
);

create index if not exists idx_officials_profile on public.neighborhood_officials(profile_id) where is_active;
create index if not exists idx_officials_nbhd    on public.neighborhood_officials(neighborhood_id) where is_active;

drop trigger if exists trg_officials_touch on public.neighborhood_officials;
create trigger trg_officials_touch before update on public.neighborhood_officials
  for each row execute function public.touch_updated_at();

-- ── Yetki yardımcıları ──────────────────────────────────────────────────────
create or replace function public.is_muhtar()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.neighborhood_officials o
     where o.profile_id = auth.uid() and o.is_active
  )
$$;

/** Oturumdaki muhtarın sorumlu olduğu mahalleler. Muhtar olmayan için boş. */
create or replace function public.muhtar_neighborhoods()
returns setof uuid language sql stable security definer set search_path = public as $$
  select o.neighborhood_id from public.neighborhood_officials o
   where o.profile_id = auth.uid() and o.is_active
$$;

create or replace function public.is_muhtar_of(p_neighborhood uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.neighborhood_officials o
     where o.profile_id = auth.uid() and o.is_active
       and o.neighborhood_id = p_neighborhood
  )
$$;

-- ── Duyurular ───────────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'announcement_kind') then
    create type public.announcement_kind as enum (
      'duyuru',      -- genel bilgilendirme
      'kesinti',     -- su / elektrik / doğalgaz kesintisi
      'calisma',     -- yol, altyapı, bakım çalışması
      'toplanti',    -- mahalle toplantısı, etkinlik
      'guncelleme'   -- muhtar güncellemesi: bir konunun son durumu
    );
  end if;
end $$;

create table if not exists public.announcements (
  id              uuid primary key default gen_random_uuid(),
  neighborhood_id uuid not null references public.neighborhoods(id) on delete cascade,
  author_id       uuid references public.profiles(id) on delete set null,
  kind            public.announcement_kind not null default 'duyuru',
  title           text not null check (char_length(btrim(title)) between 6 and 140),
  body            text not null check (char_length(btrim(body)) between 10 and 4000),
  -- Kesinti/çalışma duyuruları için geçerlilik aralığı; boşsa süresizdir.
  starts_at       timestamptz,
  ends_at         timestamptz,
  is_hidden       boolean not null default false,   -- dernek kaldırdıysa
  hidden_reason   text,
  hidden_at       timestamptz,
  hidden_by       uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint announcements_period check (ends_at is null or starts_at is null or ends_at >= starts_at),
  constraint announcements_hidden_reason check (not is_hidden or hidden_reason is not null)
);

create index if not exists idx_announcements_nbhd
  on public.announcements(neighborhood_id, created_at desc) where not is_hidden;
create index if not exists idx_announcements_author on public.announcements(author_id);

drop trigger if exists trg_announcements_touch on public.announcements;
create trigger trg_announcements_touch before update on public.announcements
  for each row execute function public.touch_updated_at();

-- Bildirim türlerine muhtar yanıtı eklenir: kurum yanıtıyla aynı kefeye
-- koymuyoruz, muhtar kurum değildir.
do $$ begin
  alter table public.notifications drop constraint if exists notifications_kind_check;
  alter table public.notifications add constraint notifications_kind_check
    check (kind in ('status_changed','authority_submitted','authority_responded',
                    'resolved','milestone','moderation','muhtar','announcement','system'));
end $$;

-- ── Resmî yanıt ─────────────────────────────────────────────────────────────
-- Muhtarın bir bildirime yazdığı yanıt. Kanıt zincirine işlenir; sonradan
-- düzenlenemez, yalnızca dernek tarafından gerekçesiyle gizlenebilir.
create table if not exists public.report_official_replies (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.reports(id) on delete cascade,
  author_id     uuid references public.profiles(id) on delete set null,
  body          text not null check (char_length(btrim(body)) between 10 and 2000),
  reference_no  text check (reference_no is null or char_length(btrim(reference_no)) between 3 and 60),
  is_hidden     boolean not null default false,
  hidden_reason text,
  created_at    timestamptz not null default now(),
  constraint official_replies_hidden_reason check (not is_hidden or hidden_reason is not null)
);

create index if not exists idx_official_replies_report
  on public.report_official_replies(report_id, created_at) where not is_hidden;

/** Resmî yanıt → kanıt zinciri + takipçilere bildirim. */
create or replace function public.on_official_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ad     text;
  v_slug   text;
  v_baslik text;
begin
  select coalesce(o.title, 'Mahalle Muhtarı') || ' · ' || n.name
    into v_ad
    from public.neighborhood_officials o
    join public.neighborhoods n on n.id = o.neighborhood_id
   where o.profile_id = new.author_id and o.is_active
   limit 1;

  perform public.append_report_event(
    new.report_id,
    'official_reply',
    'Mahalle muhtarından resmî yanıt',
    jsonb_build_object('reference_no', new.reference_no, 'reply_id', new.id),
    new.author_id,
    coalesce(v_ad, 'Mahalle Muhtarı'),
    new.created_at
  );

  select r.slug, r.title into v_slug, v_baslik from public.reports r where r.id = new.report_id;

  insert into public.notifications (user_id, report_id, kind, title, body, url)
  select f.user_id, new.report_id, 'muhtar',
         'Muhtardan yanıt geldi',
         left(new.body, 180),
         '/sorun/' || v_slug
    from public.report_follows f
   where f.report_id = new.report_id and f.user_id is distinct from new.author_id;

  return new;
end $$;

drop trigger if exists trg_official_reply on public.report_official_replies;
create trigger trg_official_reply after insert on public.report_official_replies
  for each row execute function public.on_official_reply();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.neighborhood_officials  enable row level security;
alter table public.announcements           enable row level security;
alter table public.report_official_replies enable row level security;

-- Muhtar ataması kamuya açıktır: mahalle sayfasında "muhtarımız kim" yazar.
drop policy if exists officials_read on public.neighborhood_officials;
create policy officials_read on public.neighborhood_officials
  for select using (true);

drop policy if exists officials_admin_write on public.neighborhood_officials;
create policy officials_admin_write on public.neighborhood_officials
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Duyuruyu herkes okur; gizlenmişse yalnızca sahibi ve moderasyon görür.
drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements
  for select using (
    not is_hidden or author_id = auth.uid() or public.is_moderator()
  );

-- Muhtar yalnızca kendi mahallesine duyuru yazar.
drop policy if exists announcements_insert on public.announcements;
create policy announcements_insert on public.announcements
  for insert to authenticated
  with check (
    not public.is_banned()
    and author_id = auth.uid()
    and public.is_muhtar_of(neighborhood_id)
    and not is_hidden
  );

-- Kendi duyurusunu düzeltebilir; gizleme/gösterme yetkisi onda değildir.
drop policy if exists announcements_update_own on public.announcements;
create policy announcements_update_own on public.announcements
  for update to authenticated
  using (author_id = auth.uid() and not is_hidden and public.is_muhtar_of(neighborhood_id))
  with check (author_id = auth.uid() and not is_hidden);

drop policy if exists announcements_moderate on public.announcements;
create policy announcements_moderate on public.announcements
  for all to authenticated
  using (public.is_moderator()) with check (public.is_moderator());

-- Resmî yanıt: gizlenmemişse herkese açık.
drop policy if exists official_replies_read on public.report_official_replies;
create policy official_replies_read on public.report_official_replies
  for select using (not is_hidden or public.is_moderator());

-- Muhtar yalnızca kendi mahallesindeki bir bildirime yanıt yazabilir.
drop policy if exists official_replies_insert on public.report_official_replies;
create policy official_replies_insert on public.report_official_replies
  for insert to authenticated
  with check (
    not public.is_banned()
    and author_id = auth.uid()
    and not is_hidden
    and exists (
      select 1 from public.reports r
       where r.id = report_id
         and not r.is_hidden
         and r.status not in ('rejected', 'duplicate')
         and public.is_muhtar_of(r.neighborhood_id)
    )
  );

drop policy if exists official_replies_moderate on public.report_official_replies;
create policy official_replies_moderate on public.report_official_replies
  for all to authenticated
  using (public.is_moderator()) with check (public.is_moderator());

-- ── Yetkiler ────────────────────────────────────────────────────────────────
-- RLS politikaları yalnızca satır düzeyinde süzer; tablo düzeyinde ayrıca
-- GRANT gerekir. 0010'daki toplu grant bu tablolardan önce çalıştığı için
-- burada tekrar veriliyor.
grant select on
  public.neighborhood_officials, public.announcements, public.report_official_replies
to anon, authenticated;

grant insert, update, delete on
  public.neighborhood_officials, public.announcements, public.report_official_replies
to authenticated;

grant execute on function
  public.is_muhtar(), public.is_muhtar_of(uuid), public.muhtar_neighborhoods()
to anon, authenticated;

-- ── Migration defteri ───────────────────────────────────────────────────────
-- Bu iki dosyayı `npm run db:migrate` bir daha denemesin.
insert into public.schema_migrations (filename) values
  ('0017_muhtar_enums.sql'), ('0018_muhtar.sql')
on conflict (filename) do nothing;

select 'muhtar alanı kuruldu' as sonuc,
       (select count(*) from pg_tables where schemaname='public'
         and tablename in ('neighborhood_officials','announcements','report_official_replies')) as yeni_tablo;
